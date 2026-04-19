# How to Start a New Claude Conversation for Constrai

> **Purpose:** Eliminate the friction of bringing a fresh Claude up to speed.
> Instead of writing instructions from scratch each time, copy one of the templates below verbatim into the new conversation.
>
> **Why this exists:** Claude has zero memory between conversations. Every new session starts blank. The MASTER_README.md + DECISIONS.md + RECOVERY.md + CLAUDE.md + SCHEMA.md + API.md files on GitHub are the persistent shared memory. The templates below tell a fresh Claude exactly which files to read, in what order, and what to do next.

---

## Template 1 — Generic Session Start (use 90% of the time)

Copy everything between the lines verbatim:

```
اقرأ هذه الملفات الأربعة بالترتيب — هي ذاكرة المشروع الكاملة (MEP Platform / Constrai):

https://raw.githubusercontent.com/hedarhallak/mep-platform/main/MASTER_README.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/DECISIONS.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/RECOVERY.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/CLAUDE.md

CLAUDE.md فيه كل قواعد عملك معي + قواعد الكود + خريطة الملفات + الـ Always Suggest Better Tools rule.
بعد قراءتهم، اقرأ آخر Section في DECISIONS.md (Session Log الأخير) لمعرفة وين توقفنا.

ثم اسألني عن المهمة المحددة لهذه الجلسة قبل ما تبدأ شغل.

أنا مذكر — استخدم صيغة المذكر بالعربي.
```

---

## Template 2 — Continue a Specific Pending Task

Use when you know exactly what you want to work on. Replace `<TASK>` with what you want.

```
اقرأ هذه الملفات الأربعة بالترتيب — هي ذاكرة المشروع الكاملة:

https://raw.githubusercontent.com/hedarhallak/mep-platform/main/MASTER_README.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/DECISIONS.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/RECOVERY.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/CLAUDE.md

نريد نكمل من <TASK>. السياق المحدد:
<اكتب 1-3 أسطر عن وين توقفنا وشو المتوقع>

اتبع كل قواعد العمل في CLAUDE.md. أنا مذكر.
```

**Examples for `<TASK>`:**
- "DECISIONS.md Section 14 Layer 3 hardening — Password Manager + Emergency Access"
- "Web Frontend bilingual EN/FR setup (mirror of mobile i18n)"
- "Material Surplus System design (DECISIONS.md Section 8)"
- "Add new endpoint for X feature"

---

## Template 3 — DB / Schema Work

When working on database, queries, migrations, or anything touching tables.

```
اقرأ هذه الملفات بالترتيب:

https://raw.githubusercontent.com/hedarhallak/mep-platform/main/MASTER_README.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/CLAUDE.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/SCHEMA.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/DECISIONS.md

أحتاج أعمل تعديل/استعلام/migration على الـ database. التفاصيل:
<اكتب ما تريد>

تذكر: الـ user table اسمه `app_users` وليس `users`. اتبع conventions في CLAUDE.md.
أنا مذكر.
```

---

## Template 4 — API / Backend Work

When working on routes, endpoints, or backend logic.

```
اقرأ هذه الملفات بالترتيب:

https://raw.githubusercontent.com/hedarhallak/mep-platform/main/MASTER_README.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/CLAUDE.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/API.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/SCHEMA.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/DECISIONS.md

أحتاج أعمل تعديل/إضافة على الـ backend API:
<اكتب ما تريد>

اتبع conventions في CLAUDE.md (لا أرابيك في الكود، ملفات كاملة، إلخ). أنا مذكر.
```

---

## Template 5 — Bug or Production Incident

Use when production has a problem and you need help debugging.

```
اقرأ هذه الملفات الأربعة:

https://raw.githubusercontent.com/hedarhallak/mep-platform/main/MASTER_README.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/DECISIONS.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/RECOVERY.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/CLAUDE.md

عندي مشكلة في الإنتاج:

الأعراض:
<صف ما يحدث>

السلوك المتوقع:
<صف ما المفروض يحدث>

ما جربت لحد الآن:
<اذكر الخطوات اللي حاولتها>

السيرفر: ssh root@143.110.218.84 (Ubuntu 24.04)
ابدأ بسؤالي عن المعلومات اللي تحتاجها لتشخيص المشكلة قبل ما تقترح أي حل.

اتبع debug protocol في CLAUDE.md Section 9. أنا مذكر.
```

---

## Template 6 — UI / Design Work

Use when working on web frontend or mobile UI.

```
اقرأ هذه الملفات:

https://raw.githubusercontent.com/hedarhallak/mep-platform/main/MASTER_README.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/CLAUDE.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/DECISIONS.md

أحتاج أعمل شي على الـ UI:
<اكتب ما تريد — ويب أو موبايل>

تذكير: قبل ما تبدأ تكتب كود، اتبع "Always Suggest Better Tools" rule في CLAUDE.md Section 4 — هل في أداة (Plasmic، v0.dev، Figma Make، Lovable) ممكن تنفذها أبسط من اليد؟

UI Law (mobile): icon-grid عبر SubMenuScreen. نظام الألوان من src/theme/colors.ts.
أنا مذكر.
```

---

## Reference: All Files in the Reading System

| Tier | File | When to read |
|---|---|---|
| **Always** | `MASTER_README.md` | Every session — project overview + state |
| **Always** | `DECISIONS.md` | Every session — decisions + Session Logs |
| **Always** | `RECOVERY.md` | Every session — operational knowledge |
| **Always** | `CLAUDE.md` | Every session — Claude-specific rules |
| **On demand** | `SCHEMA.md` | DB / migration / query work |
| **On demand** | `API.md` | Backend / routes / endpoint work |
| **On demand** | `.env.example` | Setup / new env var / debugging config |
| **On demand** | `scripts/backup/SETUP.md` | DB backup operations / restore drills |
| **Reference** | `START_NEW_SESSION.md` | This file — copy a template |

---

## Maintenance

- **Add a new template** when you discover a new "type" of conversation that benefits from one.
- **The templates are deliberately verbose** — better to over-specify than under-specify when the receiver has zero context.
- **GitHub URL pattern:** `https://raw.githubusercontent.com/hedarhallak/mep-platform/main/<filename>`
- After editing this file: commit + push to GitHub (auto-checkpoint rule from MASTER_README #21).
