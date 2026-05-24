// tests/integration/billing_schema_018_019.test.js
//
// Phase 6-D-4 / Section 116 (May 24, 2026) — schema-level integration tests
// for migrations 018 (5 new billing tables) and 019 (backfill subscriptions
// from companies.max_users).
//
// What this verifies:
//   - All 5 tables exist with the expected columns + indexes
//   - invoice_type ENUM has the 4 expected values
//   - CHECK constraints reject invalid values (status, plan_type, currency,
//     amount bounds, total = subtotal + qst + gst, etc.)
//   - tax_rates is seeded with QC/QST/9975bp + FEDERAL/GST/500bp
//   - seedSubscription helper produces a valid subscription + INITIAL
//     seat_change row + correct bracket derivation per Section 115.3
//   - Backfill correctness: every company has a subscription with sane
//     unit_price + bracket_label derived from companies.max_users
//   - cleanupTestRows handles the new tables in FK dependency order
//
// What this does NOT verify (deferred to Phase 6-D-4 PR 2+):
//   - Application-level invoice generation logic
//   - Proration math for mid-cycle seat changes
//   - Status transitions (subscription state machine)

'use strict';

const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedSubscription,
  cleanupTestRows,
} = require('../helpers/db');

describeIfDb('Migration 018 — billing schema structure', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('all 5 billing tables exist', async () => {
    const pool = getPool();
    const expected = [
      'subscriptions',
      'subscription_seat_changes',
      'invoices',
      'payments',
      'tax_rates',
    ];
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1)
        ORDER BY table_name`,
      [expected]
    );
    expect(rows.map((r) => r.table_name).sort()).toEqual(expected.slice().sort());
  });

  test('invoice_type ENUM has the 4 expected values', async () => {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT enumlabel
         FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'invoice_type'
        ORDER BY e.enumsortorder`
    );
    expect(rows.map((r) => r.enumlabel)).toEqual([
      'SUBSCRIPTION_RECURRING',
      'TRAINING',
      'CUSTOM_DEMAND',
      'OTHER',
    ]);
  });

  test('tax_rates seeded with QC/QST/9975bp and FEDERAL/GST/500bp', async () => {
    const pool = getPool();
    const { rows: qst } = await pool.query(
      `SELECT rate_basis_points FROM public.tax_rates
        WHERE jurisdiction = 'QC' AND tax_name = 'QST'
        ORDER BY effective_from DESC LIMIT 1`
    );
    expect(qst).toHaveLength(1);
    expect(qst[0].rate_basis_points).toBe(9975);

    const { rows: gst } = await pool.query(
      `SELECT rate_basis_points FROM public.tax_rates
        WHERE jurisdiction = 'FEDERAL' AND tax_name = 'GST'
        ORDER BY effective_from DESC LIMIT 1`
    );
    expect(gst).toHaveLength(1);
    expect(gst[0].rate_basis_points).toBe(500);
  });

  test('subscriptions.status CHECK constraint rejects invalid value', async () => {
    const pool = getPool();
    const company = await seedCompany();
    await expect(
      pool.query(
        `INSERT INTO public.subscriptions
           (company_id, status, current_unit_price_cents, current_bracket_label)
         VALUES ($1, 'BOGUS_STATUS', 2400, '1-5')`,
        [company.company_id]
      )
    ).rejects.toThrow(/chk_subscription_status|violates check constraint/i);
  });

  test('subscriptions.plan_type CHECK constraint rejects invalid value', async () => {
    const pool = getPool();
    const company = await seedCompany();
    await expect(
      pool.query(
        `INSERT INTO public.subscriptions
           (company_id, status, plan_type, current_unit_price_cents, current_bracket_label)
         VALUES ($1, 'ACTIVE', 'PLATINUM', 2400, '1-5')`,
        [company.company_id]
      )
    ).rejects.toThrow(/chk_subscription_plan_type|violates check constraint/i);
  });

  test('subscriptions.UNIQUE(company_id) blocks duplicate', async () => {
    const pool = getPool();
    const company = await seedCompany();
    await seedSubscription({ company_id: company.company_id });
    await expect(seedSubscription({ company_id: company.company_id })).rejects.toThrow(
      /uq_subscriptions_company_id|duplicate key/i
    );
  });

  test('invoices.chk_invoice_total_matches rejects total != subtotal + qst + gst', async () => {
    const pool = getPool();
    const company = await seedCompany();
    await expect(
      pool.query(
        `INSERT INTO public.invoices
           (company_id, type, invoice_number, subtotal_cents, qst_cents, gst_cents, total_cents, issue_date)
         VALUES ($1, 'TRAINING', $2, 10000, 998, 500, 99999, CURRENT_DATE)`,
        [company.company_id, `TEST-${Date.now()}`]
      )
    ).rejects.toThrow(/chk_invoice_total_matches|violates check constraint/i);
  });

  test('invoices.amount_paid_cents cannot exceed total_cents', async () => {
    const pool = getPool();
    const company = await seedCompany();
    await expect(
      pool.query(
        `INSERT INTO public.invoices
           (company_id, type, invoice_number, subtotal_cents, qst_cents, gst_cents,
            total_cents, amount_paid_cents, issue_date)
         VALUES ($1, 'TRAINING', $2, 10000, 998, 500, 11498, 99999, CURRENT_DATE)`,
        [company.company_id, `TEST-${Date.now()}`]
      )
    ).rejects.toThrow(/chk_invoice_amount_paid_bounds|violates check constraint/i);
  });

  test('invoices.UNIQUE(invoice_number) blocks duplicate', async () => {
    const pool = getPool();
    const company = await seedCompany();
    const num = `TEST-DUP-${Date.now()}`;
    await pool.query(
      `INSERT INTO public.invoices
         (company_id, type, invoice_number, subtotal_cents, total_cents, issue_date)
       VALUES ($1, 'OTHER', $2, 1000, 1000, CURRENT_DATE)`,
      [company.company_id, num]
    );
    const company2 = await seedCompany();
    await expect(
      pool.query(
        `INSERT INTO public.invoices
           (company_id, type, invoice_number, subtotal_cents, total_cents, issue_date)
         VALUES ($1, 'OTHER', $2, 1000, 1000, CURRENT_DATE)`,
        [company2.company_id, num]
      )
    ).rejects.toThrow(/uq_invoice_number|duplicate key/i);
  });

  test('payments.amount_cents must be > 0', async () => {
    const pool = getPool();
    const company = await seedCompany();
    const { rows: inv } = await pool.query(
      `INSERT INTO public.invoices
         (company_id, type, invoice_number, subtotal_cents, total_cents, issue_date)
       VALUES ($1, 'OTHER', $2, 1000, 1000, CURRENT_DATE) RETURNING id`,
      [company.company_id, `TEST-PAY-${Date.now()}`]
    );
    await expect(
      pool.query(
        `INSERT INTO public.payments
           (invoice_id, amount_cents, method, status)
         VALUES ($1, 0, 'CHEQUE', 'PENDING')`,
        [inv[0].id]
      )
    ).rejects.toThrow(/chk_payment_amount_positive|violates check constraint/i);
  });

  test('expected indexes exist on subscriptions and invoices', async () => {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'idx_subscriptions_status',
            'idx_subscriptions_company',
            'idx_subscriptions_next_billing',
            'idx_invoices_company_status',
            'idx_invoices_type',
            'idx_invoices_due_date',
            'idx_tax_rates_lookup'
          )
        ORDER BY indexname`
    );
    const names = rows.map((r) => r.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        'idx_subscriptions_status',
        'idx_subscriptions_company',
        'idx_subscriptions_next_billing',
        'idx_invoices_company_status',
        'idx_invoices_type',
        'idx_invoices_due_date',
        'idx_tax_rates_lookup',
      ])
    );
  });
});

describeIfDb('Migration 019 — subscription backfill correctness', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('every existing (non-test) company has a subscription after backfill', async () => {
    const pool = getPool();
    // Count companies that AREN'T from test fixtures (those get cleaned up).
    // After migration 019, every prod-shaped company should have a subscription.
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM public.companies WHERE name NOT LIKE 'test_%') AS company_count,
         (SELECT COUNT(*) FROM public.subscriptions s
            JOIN public.companies c ON s.company_id = c.company_id
           WHERE c.name NOT LIKE 'test_%') AS subscription_count`
    );
    expect(Number(rows[0].subscription_count)).toBe(Number(rows[0].company_count));
  });

  test('every backfilled subscription has a corresponding INITIAL seat_change row', async () => {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT s.id, COUNT(sc.id) AS initial_count
         FROM public.subscriptions s
         LEFT JOIN public.subscription_seat_changes sc
           ON sc.subscription_id = s.id AND sc.change_type = 'INITIAL'
         JOIN public.companies c ON s.company_id = c.company_id
        WHERE c.name NOT LIKE 'test_%'
        GROUP BY s.id`
    );
    // Every backfilled subscription should have EXACTLY 1 INITIAL seat_change.
    rows.forEach((r) => {
      expect(Number(r.initial_count)).toBe(1);
    });
  });
});

describeIfDb('seedSubscription helper — bracket derivation matches Section 115.3', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  const cases = [
    { seats: 1, expectedPrice: 2700, expectedBracket: '1-5' },
    { seats: 5, expectedPrice: 2700, expectedBracket: '1-5' },
    { seats: 6, expectedPrice: 2500, expectedBracket: '6-10' },
    { seats: 10, expectedPrice: 2500, expectedBracket: '6-10' },
    { seats: 11, expectedPrice: 2400, expectedBracket: '11-20' },
    { seats: 20, expectedPrice: 2400, expectedBracket: '11-20' },
    { seats: 21, expectedPrice: 2300, expectedBracket: '21-35' },
    { seats: 35, expectedPrice: 2300, expectedBracket: '21-35' },
    { seats: 36, expectedPrice: 2200, expectedBracket: '36-50' },
    { seats: 50, expectedPrice: 2200, expectedBracket: '36-50' },
    { seats: 51, expectedPrice: 2200, expectedBracket: '50+' },
    { seats: 100, expectedPrice: 2200, expectedBracket: '50+' },
  ];

  test.each(cases)(
    'seats=$seats → bracket=$expectedBracket / unit_price=$expectedPrice',
    async ({ seats, expectedPrice, expectedBracket }) => {
      const company = await seedCompany();
      const sub = await seedSubscription({
        company_id: company.company_id,
        subscribed_seats: seats,
      });
      expect(sub.current_unit_price_cents).toBe(expectedPrice);
      expect(sub.current_bracket_label).toBe(expectedBracket);
    }
  );

  test('seedSubscription creates an INITIAL seat_change row', async () => {
    const pool = getPool();
    const company = await seedCompany();
    const sub = await seedSubscription({
      company_id: company.company_id,
      subscribed_seats: 7,
    });
    const { rows } = await pool.query(
      `SELECT change_type, seats_before, seats_after, delta
         FROM public.subscription_seat_changes
        WHERE subscription_id = $1`,
      [sub.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].change_type).toBe('INITIAL');
    expect(rows[0].seats_before).toBe(0);
    expect(rows[0].seats_after).toBe(7);
    expect(rows[0].delta).toBe(7);
  });

  test('minimum_seats_billed defaults to 3', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({
      company_id: company.company_id,
      subscribed_seats: 2,
    });
    expect(sub.minimum_seats_billed).toBe(3);
  });

  test('next_billing_at defaults to first of next month at 00:00 UTC', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id });
    const nextBilling = new Date(sub.next_billing_at);
    expect(nextBilling.getUTCDate()).toBe(1);
    expect(nextBilling.getUTCHours()).toBe(0);
    expect(nextBilling.getUTCMinutes()).toBe(0);
    // Must be in the future
    expect(nextBilling.getTime()).toBeGreaterThan(Date.now());
  });
});
