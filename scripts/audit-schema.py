#!/usr/bin/env python3
"""
scripts/audit-schema.py — schema-aware, FK-aware unused-objects detector.

Replaces the ad-hoc /tmp/audit-*.py scripts that ran during Sections 65, 66,
67, 73, 74, 75, 76. Same logic, but checked in so future audits don't
have to re-derive the gotchas.

Three modes:
    --tables   Find tables with no code references.
    --columns  Find columns with no code references AND no FK relationships.
    --inserts  Find routes/*.js INSERT statements that omit NOT NULL columns
               (the bug class behind project_foremen's Section 65 P1).
    --all      Run all three (default).

Improvements over the original /tmp scripts (each backed by a real bug we hit):

    Schema-qualified (Section 73)
        Distinguishes `public.employees` from `erp.employees`. The original
        word-boundary detector classified `erp.employees` as "used" because
        the bare name `employees` matched heavy `public.employees` traffic.
    FK-aware (Section 74)
        A column or table is NOT dead just because no code touches it; if
        another table's FK constraint references it, dropping it would
        break that FK. `company_statuses` and `plans` were the canonical
        examples — flagged as "rare" by the original audit but actually
        live FK targets from `companies.status` / `companies.plan`.
    PK-aware (Section 75)
        Excludes columns that are part of a PRIMARY KEY constraint, not
        just columns named `id`. `roles.role_id` slipped through the
        original noise filter because it didn't match the `id` literal.
    SERIAL-aware
        pg_dump emits SERIAL/auto-increment column defaults as separate
        ALTER TABLE … SET DEFAULT statements, not inline. The detector
        parses both so it doesn't false-flag every `id` column as
        "missing from INSERT".

Usage:
    python3 scripts/audit-schema.py --all
    python3 scripts/audit-schema.py --tables --schema db/schema_baseline_2026-05-04.sql
    python3 scripts/audit-schema.py --columns
    python3 scripts/audit-schema.py --inserts > /tmp/insert-audit.txt
"""

import argparse
import os
import re
import sys
from collections import defaultdict


# Common column names that appear so often in code (across many tables) that
# word-boundary grep is meaningless for them. Excluded from the unused-cols
# report regardless of count. Kept conservative — better to over-report than
# miss a real bug.
COMMON_COL_NAMES = {
    "id", "name", "created_at", "updated_at", "deleted_at",
    "company_id", "user_id", "employee_id", "project_id", "trade_code",
    "status", "type", "code", "email", "phone",
    "first_name", "last_name", "address",
    "active", "is_active", "data", "value", "amount",
    "title", "description", "notes", "metadata", "version",
    "url", "key", "language",
}

# Source directories to grep (relative to project root)
CODE_DIRS = ["routes", "lib", "services", "middleware", "jobs", "scripts", "tests"]
CODE_EXTRA_FILES = ["app.js", "instrument.js", "db.js", "seed.js", "index.js"]
CODE_EXTENSIONS = (".js", ".cjs", ".mjs", ".json")


def parse_schema(schema_path):
    """
    Returns five dicts keyed by (schema, table_name):
        tables          → list of column names in declaration order
        fk_source       → set of column names that are FK SOURCE (point at another table)
        fk_target       → set of column names that are FK TARGET (referenced by another table's FK)
        defaulted       → set of column names with separately-set defaults (SERIAL et al.)
        primary_keys    → set of column names that are part of a PK constraint
    """
    src = open(schema_path, encoding="utf-8").read()

    # 1. CREATE TABLE blocks → column lists
    tables = {}
    table_pattern = re.compile(
        r"CREATE TABLE (public|erp)\.(\w+) \(\n(.*?)\n\);",
        re.DOTALL,
    )
    for m in table_pattern.finditer(src):
        schema, name, body = m.group(1), m.group(2), m.group(3)
        cols = []
        for line in body.split("\n"):
            line = line.strip().rstrip(",")
            if not line:
                continue
            if re.match(
                r"^(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY|EXCLUDE)",
                line,
                re.IGNORECASE,
            ):
                continue
            toks = line.split()
            if not toks:
                continue
            col = toks[0].strip('"')
            if col and not col.startswith("--"):
                cols.append(col)
        tables[(schema, name)] = cols

    # 2. ALTER TABLE SET DEFAULT (SERIAL / auto-increment)
    defaulted = defaultdict(set)
    default_pattern = re.compile(
        r"ALTER TABLE ONLY (public|erp)\.(\w+) ALTER COLUMN (\w+) SET DEFAULT",
        re.IGNORECASE,
    )
    for m in default_pattern.finditer(src):
        schema, table, col = m.group(1), m.group(2), m.group(3)
        defaulted[(schema, table)].add(col)

    # 3. FK constraints (source AND target)
    fk_source = defaultdict(set)
    fk_target = defaultdict(set)
    fk_pattern = re.compile(
        r"ALTER TABLE ONLY (public|erp)\.(\w+)\s*\n\s*"
        r"ADD CONSTRAINT \w+ FOREIGN KEY \(([^)]+)\)\s*"
        r"REFERENCES (public|erp)\.(\w+)\s*\(([^)]+)\)",
        re.IGNORECASE | re.DOTALL,
    )
    for m in fk_pattern.finditer(src):
        src_schema, src_table = m.group(1), m.group(2)
        src_cols = [c.strip().strip('"') for c in m.group(3).split(",")]
        tgt_schema, tgt_table = m.group(4), m.group(5)
        tgt_cols = [c.strip().strip('"') for c in m.group(6).split(",")]
        for c in src_cols:
            fk_source[(src_schema, src_table)].add(c)
        for c in tgt_cols:
            fk_target[(tgt_schema, tgt_table)].add(c)

    # 4. PRIMARY KEY columns
    primary_keys = defaultdict(set)
    pk_pattern = re.compile(
        r"ALTER TABLE ONLY (public|erp)\.(\w+)\s*\n\s*"
        r"ADD CONSTRAINT \w+ PRIMARY KEY \(([^)]+)\)",
        re.IGNORECASE | re.DOTALL,
    )
    for m in pk_pattern.finditer(src):
        schema, table = m.group(1), m.group(2)
        cols = [c.strip().strip('"') for c in m.group(3).split(",")]
        for c in cols:
            primary_keys[(schema, table)].add(c)

    # 5. NOT NULL columns (for the INSERT detector)
    notnull = defaultdict(set)
    for m in table_pattern.finditer(src):
        schema, name, body = m.group(1), m.group(2), m.group(3)
        for line in body.split("\n"):
            line = line.strip().rstrip(",")
            if not line:
                continue
            if re.match(
                r"^(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY|EXCLUDE)",
                line,
                re.IGNORECASE,
            ):
                continue
            toks = line.split()
            if not toks:
                continue
            col = toks[0].strip('"')
            if not col or col.startswith("--"):
                continue
            rest = line[len(toks[0]) :].lower()
            if "not null" in rest:
                # inline DEFAULT?
                has_inline_default = "default" in rest or "nextval" in rest
                is_generated = "generated" in rest
                if not has_inline_default and not is_generated:
                    notnull[(schema, name)].add(col)

    return tables, fk_source, fk_target, defaulted, primary_keys, notnull


def load_code_corpus(root):
    """Concat all source code into one string for grep."""
    parts = []
    for d in CODE_DIRS:
        p = os.path.join(root, d)
        if not os.path.isdir(p):
            continue
        for r, _, files in os.walk(p):
            for f in files:
                if f.endswith(CODE_EXTENSIONS):
                    try:
                        parts.append(open(os.path.join(r, f), encoding="utf-8").read())
                    except (OSError, UnicodeDecodeError):
                        pass
    for f in CODE_EXTRA_FILES:
        p = os.path.join(root, f)
        if os.path.isfile(p):
            try:
                parts.append(open(p, encoding="utf-8").read())
            except (OSError, UnicodeDecodeError):
                pass
    return "\n".join(parts)


def audit_tables(tables, fk_target, blob):
    """Find tables with zero code references."""
    print("\n# Unused tables\n")

    unused = []
    rare = []
    for (schema, table), _ in sorted(tables.items()):
        # Schema-qualified pattern: matches `public.X`, `erp.X`, FROM/JOIN/INTO X.
        rx = re.compile(
            rf"\b{re.escape(schema)}\.{re.escape(table)}\b|"
            rf"(?:FROM|JOIN|INTO|UPDATE)\s+{re.escape(table)}\b",
            re.IGNORECASE,
        )
        n = len(rx.findall(blob))
        is_fk_target = bool(fk_target.get((schema, table), set()))
        if n == 0:
            unused.append((schema, table, is_fk_target))
        elif n <= 3:
            rare.append((schema, table, n, is_fk_target))

    truly_dead = [u for u in unused if not u[2]]
    fk_target_alive = [u for u in unused if u[2]]

    print(f"## Truly unused — droppable ({len(truly_dead)})\n")
    for schema, table, _ in truly_dead:
        print(f"  {schema}.{table}")
    print(f"\n## FK-target alive — DO NOT DROP without migrating FKs ({len(fk_target_alive)})\n")
    for schema, table, _ in fk_target_alive:
        print(f"  {schema}.{table}  (referenced by another table's FK)")
    print(f"\n## Rare (1-3 code refs) — review case-by-case ({len(rare)})\n")
    for schema, table, n, fkt in rare:
        marker = "  [FK target]" if fkt else ""
        print(f"  {schema}.{table}: {n} ref(s){marker}")


def audit_columns(tables, fk_source, fk_target, primary_keys, blob):
    """Find columns with zero code refs, no FK, no PK status."""
    print("\n# Unused columns\n")

    truly_dead = []
    fk_attached = []
    rare = []

    for (schema, table), cols in sorted(tables.items()):
        for col in cols:
            if col in COMMON_COL_NAMES:
                continue
            if col in primary_keys.get((schema, table), set()):
                continue  # PK columns are never "dead"
            # Schema-qualified pattern OR bare word-boundary
            wb = len(re.findall(r"\b" + re.escape(col) + r"\b", blob))
            qual = len(re.findall(r"\b\w+\." + re.escape(col) + r"\b", blob))
            is_fk_src = col in fk_source.get((schema, table), set())
            is_fk_tgt = col in fk_target.get((schema, table), set())
            if (is_fk_src or is_fk_tgt) and wb <= 3:
                fk_attached.append((schema, table, col, wb, is_fk_src, is_fk_tgt))
                continue
            if wb == 0 and qual == 0:
                truly_dead.append((schema, table, col))
            elif wb <= 3:
                rare.append((schema, table, col, wb, qual))

    print(f"## Truly dead — droppable ({len(truly_dead)})\n")
    for schema, table, col in truly_dead:
        print(f"  {schema}.{table}.{col}")
    print(f"\n## FK-attached — preserve constraint ({len(fk_attached)})\n")
    for schema, table, col, wb, is_src, is_tgt in fk_attached:
        kind = "src" if is_src else "tgt"
        print(f"  {schema}.{table}.{col}  ({wb} wb refs, FK {kind})")
    print(f"\n## Rare (1-3 refs) — review ({len(rare)})\n")
    for schema, table, col, wb, qual in rare:
        print(f"  {schema}.{table}.{col}  (wb={wb}, qual={qual})")


def audit_inserts(routes_dir, tables, defaulted, notnull):
    """Find INSERT statements that omit NOT NULL columns (no DEFAULT)."""
    print("\n# INSERT NOT-NULL audit\n")

    # Required-for-insert = NOT NULL minus inline-default minus separately-set default
    required = {}
    for key, cols in notnull.items():
        rem = cols - defaulted.get(key, set())
        if rem:
            required[key] = rem

    insert_re = re.compile(
        r"INSERT\s+INTO\s+(?:(\w+)\.)?(\w+)\s*\(([^)]+)\)",
        re.IGNORECASE | re.DOTALL,
    )

    problems = []
    for fname in sorted(os.listdir(routes_dir)):
        if not fname.endswith(".js"):
            continue
        fp = os.path.join(routes_dir, fname)
        try:
            code = open(fp, encoding="utf-8").read()
        except (OSError, UnicodeDecodeError):
            continue
        for m in insert_re.finditer(code):
            schema = (m.group(1) or "public").lower()
            table = m.group(2)
            cols_raw = m.group(3)
            inserted = set()
            for c in cols_raw.split(","):
                c = c.strip().strip('"').strip("'").strip()
                tok = re.match(r"(\w+)", c)
                if tok:
                    inserted.add(tok.group(1))
            key = (schema, table)
            if key not in required:
                if schema != "public":
                    key = ("public", table)
                    if key not in required:
                        continue
                else:
                    continue
            missing = required[key] - inserted
            if missing:
                problems.append((fname, f"{schema}.{table}", sorted(missing), sorted(inserted)))

    if not problems:
        print("(no problems found)\n")
        return
    print(f"## Found {len(problems)} potential NOT-NULL violations\n")
    for fname, table, missing, inserted in problems:
        print(f"  {fname}: INSERT INTO {table}")
        print(f"    REQUIRED missing: {missing}")
        print(f"    inserted cols  : {inserted}")
        print()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--schema", default="db/schema_baseline_2026-05-04.sql",
                        help="Path to canonical schema baseline (default: %(default)s).")
    parser.add_argument("--tables", action="store_true", help="Run unused-tables audit.")
    parser.add_argument("--columns", action="store_true", help="Run unused-columns audit.")
    parser.add_argument("--inserts", action="store_true", help="Run INSERT NOT-NULL audit.")
    parser.add_argument("--all", action="store_true", help="Run all three (default if none specified).")
    parser.add_argument("--root", default=".", help="Project root for code grep (default: %(default)s).")
    args = parser.parse_args()

    if not (args.tables or args.columns or args.inserts):
        args.all = True

    schema_path = os.path.join(args.root, args.schema) if not os.path.isabs(args.schema) else args.schema
    if not os.path.isfile(schema_path):
        sys.exit(f"ERROR: schema file not found: {schema_path}")

    tables, fk_source, fk_target, defaulted, primary_keys, notnull = parse_schema(schema_path)
    blob = load_code_corpus(args.root) if (args.tables or args.columns or args.all) else ""

    if args.all or args.tables:
        audit_tables(tables, fk_target, blob)
    if args.all or args.columns:
        audit_columns(tables, fk_source, fk_target, primary_keys, blob)
    if args.all or args.inserts:
        routes_dir = os.path.join(args.root, "routes")
        if os.path.isdir(routes_dir):
            audit_inserts(routes_dir, tables, defaulted, notnull)


if __name__ == "__main__":
    main()
