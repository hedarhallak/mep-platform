// tests/integration/trialExpiryJob.test.js
//
// Phase 6-D-7 PR3 / Section 125.6 — trial-expiry warning job. Mocks lib/email
// so no real mail is sent; asserts the job warns TRIAL subscriptions inside the
// window, stamps trial_warned_at (idempotent), and skips trials outside it.

'use strict';

jest.mock('../../lib/email', () => ({
  sendTrialExpiryWarning: jest.fn(async () => true),
}));

const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedSubscription,
  seedUser,
  cleanupTestRows,
} = require('../helpers/db');
const { sendTrialExpiryWarning } = require('../../lib/email');
const { warnExpiringTrials } = require('../../jobs/trialExpiryJob');

const DAY_MS = 24 * 60 * 60 * 1000;

describeIfDb('jobs/trialExpiryJob — warnExpiringTrials', () => {
  beforeEach(() => sendTrialExpiryWarning.mockClear());
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('warns a TRIAL ending within the window, stamps trial_warned_at, idempotent', async () => {
    const company = await seedCompany();
    await seedSubscription({
      company_id: company.company_id,
      status: 'TRIAL',
      trial_ends_at: new Date(Date.now() + 2 * DAY_MS), // 2 days left
    });
    await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN', pin: '1234' });

    const s1 = await warnExpiringTrials(getPool(), new Date());
    expect(s1.warned).toBeGreaterThanOrEqual(1);

    const mine = sendTrialExpiryWarning.mock.calls
      .map((c) => c[0])
      .find((a) => a.companyName === company.name);
    expect(mine).toBeTruthy();
    expect(typeof mine.to).toBe('string');
    expect(mine.to).toContain('@');

    const { rows } = await getPool().query(
      `SELECT trial_warned_at FROM public.subscriptions WHERE company_id = $1`,
      [company.company_id]
    );
    expect(rows[0].trial_warned_at).toBeTruthy();

    // Second run: our company must NOT be warned again.
    sendTrialExpiryWarning.mockClear();
    await warnExpiringTrials(getPool(), new Date());
    const again = sendTrialExpiryWarning.mock.calls
      .map((c) => c[0])
      .find((a) => a.companyName === company.name);
    expect(again).toBeFalsy();
  });

  test('does NOT warn a TRIAL ending far outside the window', async () => {
    const company = await seedCompany();
    await seedSubscription({
      company_id: company.company_id,
      status: 'TRIAL',
      trial_ends_at: new Date(Date.now() + 30 * DAY_MS), // 30 days left
    });
    await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN', pin: '1234' });

    await warnExpiringTrials(getPool(), new Date());
    const mine = sendTrialExpiryWarning.mock.calls
      .map((c) => c[0])
      .find((a) => a.companyName === company.name);
    expect(mine).toBeFalsy();
  });

  test('does NOT warn an ACTIVE (non-trial) subscription', async () => {
    const company = await seedCompany();
    await seedSubscription({
      company_id: company.company_id,
      status: 'ACTIVE',
      trial_ends_at: new Date(Date.now() + 2 * DAY_MS),
    });
    await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN', pin: '1234' });

    await warnExpiringTrials(getPool(), new Date());
    const mine = sendTrialExpiryWarning.mock.calls
      .map((c) => c[0])
      .find((a) => a.companyName === company.name);
    expect(mine).toBeFalsy();
  });
});
