// index.js — production entry point.
//
// Phase 11b refactor (2026-04-28): the Express app setup moved to app.js
// so tests can drive the app via Supertest without binding to a port and
// without scheduling production cron jobs. This file remains the canonical
// entry started by `npm start` / `pm2 start` / `node index.js`.

'use strict';

const app = require('./app');
const { pool } = require('./db');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);

  // Weekly employee report job (every Monday 18:00 Quebec time)
  require('./jobs/weeklyReportJob')(pool);

  // Monthly CCQ travel rates expiry reminder (1st of month, 09:00 Quebec)
  require('./jobs/ccqRatesReminderJob')(pool);
});
