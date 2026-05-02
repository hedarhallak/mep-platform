// Phase 67b (May 2026) — DB-backed coverage of lib/weeklyReport.runWeeklyReports.
//
// runWeeklyReports is the production cron entry point invoked from
// jobs/weeklyReportJob.js every Monday 18:00 Quebec time. It walks every
// company, finds approved assignments overlapping the previous week,
// joins attendance, builds an HTML report per worker and emails it via
// SendGrid. The branch shape is non-trivial — empty company, worker
// without contact_email, foreman with unconfirmed records, send error
// — and was uncovered before this phase.
//
// Approach (mirrors tests/integration/admin_users.test.js):
//   1. jest.mock('@sendgrid/mail') hoisted to the top so both setApiKey
//      and send become Jest spies, no real HTTP calls.
//   2. Set SENDGRID_API_KEY + SENDGRID_FROM_EMAIL in beforeAll, restore
//      in afterAll (other tests rely on them being unset).
//   3. Seed enough rows (company + employee + employee_profile with
//      contact_email + assignment overlapping the previous week +
//      attendance records). Re-use existing helpers where possible;
//      raw SQL where fields aren't in the helper signature (notably
//      contact_email on employee_profiles).
//   4. Run the function, assert sgMail.send was called with the right
//      subject prefix and that the HTML body mentions the worker.

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue([{ statusCode: 202, headers: {} }, {}]),
}));

const sgMail = require('@sendgrid/mail');

const { runWeeklyReports, previousWeekRange } = require('../../lib/weeklyReport');
const {
  describeIfDb,
  getPool,
  closePool,
  cleanupTestRows,
  seedCompany,
  seedEmployee,
  seedProject,
  seedUser,
} = require('../helpers/db');

describeIfDb('Phase 67b — lib/weeklyReport.runWeeklyReports', () => {
  const originalEnv = {
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL,
  };

  beforeAll(() => {
    process.env.SENDGRID_API_KEY = 'SG.test-key-not-real';
    process.env.SENDGRID_FROM_EMAIL = 'noreply@test.constrai.ca';
  });

  afterAll(async () => {
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await cleanupTestRows();
    await closePool();
  });

  beforeEach(() => {
    sgMail.send.mockClear();
  });

  // Helper: insert/upsert an employee_profile row with contact_email.
  // The shared seedEmployeeProfile helper doesn't take contact_email, but
  // weeklyReport's main query joins on employee_profiles.contact_email —
  // so we have to set it ourselves.
  async function setProfileEmail(employeeId, email, fullName = 'Phase 67b Worker') {
    const pool = getPool();
    await pool.query(
      `INSERT INTO public.employee_profiles (employee_id, full_name, trade_code, contact_email)
       VALUES ($1, $2, 'GENERAL', $3)
       ON CONFLICT (employee_id) DO UPDATE SET contact_email = EXCLUDED.contact_email,
                                              full_name      = EXCLUDED.full_name`,
      [employeeId, fullName, email]
    );
  }

  // Helper: create an APPROVED assignment with start/end_date covering the
  // entire previous week, regardless of TZ noise on the test runner.
  async function seedApprovedAssignmentForLastWeek({
    companyId,
    employeeId,
    projectId,
    role = 'WORKER',
  }) {
    const pool = getPool();
    const requester = await seedUser({ company_id: companyId, role: 'COMPANY_ADMIN' });
    // Wide range: anchor a year out to avoid local-tz day shifts breaking
    // the start_date <= end_of_prev_week comparison.
    const startDate = '2025-01-01';
    const endDate = '2027-12-31';
    const { rows } = await pool.query(
      `INSERT INTO public.assignment_requests
         (company_id, project_id, requested_for_employee_id, requested_by_user_id,
          start_date, end_date, shift_start, shift_end, assignment_role,
          status, request_type, payload_json,
          decision_by_user_id, decision_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, '07:00', '15:30', $7,
               'APPROVED', 'CREATE_ASSIGNMENT', '{}',
               $4, NOW(), NOW(), NOW())
       RETURNING id`,
      [companyId, projectId, employeeId, requester.id, startDate, endDate, role]
    );
    return { id: Number(rows[0].id), project_id: projectId };
  }

  async function seedAttendanceRecord({ companyId, employeeId, projectId, dateStr, status }) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO public.attendance_records
         (company_id, employee_id, project_id, attendance_date,
          check_in_time, check_out_time, regular_hours, overtime_hours, status)
       VALUES ($1, $2, $3, $4, '07:00', '15:30', 7.5, 0, $5)`,
      [companyId, employeeId, projectId, dateStr, status]
    );
  }

  // ────────────────────────────────────────────────────────────────────────

  test('completes without throwing when there are no overlapping assignments', async () => {
    // Even when the public.companies table has rows (it does, seeded by
    // other suites), if none of them have approved assignments the
    // function should walk through and emit zero emails.
    //
    // We DON'T assert sgMail.send was never called — there can be carry-
    // over assignments from prior suites that didn't clean up. We just
    // assert the function returned cleanly.
    const pool = getPool();
    await expect(runWeeklyReports(pool)).resolves.toBeUndefined();
  });

  test('sends a worker report email with the expected subject + recipient', async () => {
    const pool = getPool();
    const { from } = previousWeekRange();

    const company = await seedCompany();
    const employee = await seedEmployee({ company_id: company.company_id });
    const profileEmail = `phase67b_worker_${Date.now()}@test.constrai.ca`;
    await setProfileEmail(employee.id, profileEmail, 'Phase 67b Worker');

    const project = await seedProject({ company_id: company.company_id });
    const assignment = await seedApprovedAssignmentForLastWeek({
      companyId: company.company_id,
      employeeId: employee.id,
      projectId: project.id,
    });

    await seedAttendanceRecord({
      companyId: company.company_id,
      employeeId: employee.id,
      projectId: assignment.project_id,
      dateStr: from,
      status: 'CONFIRMED',
    });

    sgMail.send.mockClear();
    await runWeeklyReports(pool);

    const callsForOurWorker = sgMail.send.mock.calls.filter((c) => c[0].to === profileEmail);
    expect(callsForOurWorker.length).toBe(1);
    const [msg] = callsForOurWorker[0];
    expect(msg.from).toBe('noreply@test.constrai.ca');
    expect(msg.subject).toMatch(/Weekly Work Report/);
    expect(msg.html).toMatch(/Phase 67b Worker/);
  });

  test('skips workers whose employee_profiles.contact_email is null', async () => {
    const pool = getPool();
    const { from } = previousWeekRange();

    const company = await seedCompany();
    const employee = await seedEmployee({ company_id: company.company_id });

    // Profile WITHOUT contact_email
    await pool.query(
      `INSERT INTO public.employee_profiles (employee_id, full_name, trade_code)
       VALUES ($1, $2, 'GENERAL')
       ON CONFLICT (employee_id) DO UPDATE SET contact_email = NULL`,
      [employee.id, 'No-Email Worker']
    );

    const project = await seedProject({ company_id: company.company_id });
    const assignment = await seedApprovedAssignmentForLastWeek({
      companyId: company.company_id,
      employeeId: employee.id,
      projectId: project.id,
    });
    await seedAttendanceRecord({
      companyId: company.company_id,
      employeeId: employee.id,
      projectId: assignment.project_id,
      dateStr: from,
      status: 'CONFIRMED',
    });

    sgMail.send.mockClear();
    await runWeeklyReports(pool);

    // No call should target a "No-Email Worker" — the profile had no email,
    // so the route's `if (!asgn.contact_email) continue;` guard fires.
    const callsForNoEmailWorker = sgMail.send.mock.calls.filter((c) =>
      (c[0].html || '').includes('No-Email Worker')
    );
    expect(callsForNoEmailWorker.length).toBe(0);
  });

  test('sends a foreman reminder when there are CHECKED_OUT (unconfirmed) records', async () => {
    const pool = getPool();
    const { from } = previousWeekRange();

    const company = await seedCompany();

    // 1. The foreman (gets the reminder).
    const foreman = await seedEmployee({ company_id: company.company_id });
    const foremanEmail = `phase67b_foreman_${Date.now()}@test.constrai.ca`;
    await setProfileEmail(foreman.id, foremanEmail, 'Phase 67b Foreman');

    // 2. The worker with the unconfirmed (CHECKED_OUT) record.
    const worker = await seedEmployee({ company_id: company.company_id });
    const workerEmail = `phase67b_unconfirmed_${Date.now()}@test.constrai.ca`;
    await setProfileEmail(worker.id, workerEmail, 'Phase 67b Unconfirmed Worker');

    // 3. Both assigned to the same project.
    const project = await seedProject({ company_id: company.company_id });

    await seedApprovedAssignmentForLastWeek({
      companyId: company.company_id,
      employeeId: foreman.id,
      projectId: project.id,
      role: 'FOREMAN',
    });
    await seedApprovedAssignmentForLastWeek({
      companyId: company.company_id,
      employeeId: worker.id,
      projectId: project.id,
      role: 'WORKER',
    });

    await seedAttendanceRecord({
      companyId: company.company_id,
      employeeId: worker.id,
      projectId: project.id,
      dateStr: from,
      status: 'CHECKED_OUT', // unconfirmed → triggers foreman reminder
    });

    sgMail.send.mockClear();
    await runWeeklyReports(pool);

    // The foreman is themselves an APPROVED assignee, so they also get the
    // standard "Weekly Work Report" email — that's two messages to the same
    // address. We only want the ACTION REQUIRED reminder here.
    const foremanReminderCalls = sgMail.send.mock.calls.filter(
      (c) => c[0].to === foremanEmail && /ACTION REQUIRED/.test(c[0].subject)
    );
    expect(foremanReminderCalls.length).toBe(1);
    const [foremanMsg] = foremanReminderCalls[0];
    expect(foremanMsg.subject).toMatch(/unconfirmed/);
    expect(foremanMsg.html).toMatch(/Phase 67b Unconfirmed Worker/);
  });

  test('survives a SendGrid send error without throwing', async () => {
    const pool = getPool();
    const { from } = previousWeekRange();

    const company = await seedCompany();
    const employee = await seedEmployee({ company_id: company.company_id });
    const profileEmail = `phase67b_senderror_${Date.now()}@test.constrai.ca`;
    await setProfileEmail(employee.id, profileEmail, 'Phase 67b Send Error');

    const project = await seedProject({ company_id: company.company_id });
    const assignment = await seedApprovedAssignmentForLastWeek({
      companyId: company.company_id,
      employeeId: employee.id,
      projectId: project.id,
    });
    await seedAttendanceRecord({
      companyId: company.company_id,
      employeeId: employee.id,
      projectId: assignment.project_id,
      dateStr: from,
      status: 'CONFIRMED',
    });

    // Make sgMail.send reject ONCE (subsequent calls go back to default).
    sgMail.send.mockClear();
    sgMail.send.mockRejectedValueOnce(new Error('SendGrid 502 — simulated'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Should NOT throw — the route catches per-employee errors and
    // continues to the next.
    await expect(runWeeklyReports(pool)).resolves.toBeUndefined();

    // The error path was logged.
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send to'),
      expect.stringContaining('SendGrid 502')
    );
    errSpy.mockRestore();
  });
});
