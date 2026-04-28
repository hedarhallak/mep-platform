'use strict';

/**
 * jobs/weeklyReportJob.js
 *
 * Schedules the weekly employee report email.
 *
 * Schedule: Every Monday at 18:00 Eastern Time (Quebec)
 * Cron:     0 18 * * 1
 *
 * Usage in index.js:
 *   require('./jobs/weeklyReportJob')(pool);
 */

const cron = require('node-cron');
const { runWeeklyReports } = require('../lib/weeklyReport');

module.exports = function startWeeklyReportJob(pool) {
  // Every Monday at 18:00 server time
  // If server runs in UTC, Quebec EST = UTC-5, so 18:00 EST = 23:00 UTC
  // Adjust the hour below if your server is in UTC:
  //   EST (winter): 23:00 UTC = 18:00 Quebec
  //   EDT (summer): 22:00 UTC = 18:00 Quebec
  // Using 23:00 UTC as a safe default (covers EST)
  const schedule = process.env.WEEKLY_REPORT_CRON || '0 23 * * 1';

  console.log(`[weeklyReportJob] Scheduled: ${schedule}`);

  cron.schedule(schedule, async () => {
    console.log('[weeklyReportJob] Triggered at', new Date().toISOString());
    try {
      await runWeeklyReports(pool);
    } catch (err) {
      console.error('[weeklyReportJob] Uncaught error:', err.message);
    }
  });

  // Manual trigger via env var for testing
  if (process.env.RUN_WEEKLY_REPORT_NOW === 'true') {
    console.log('[weeklyReportJob] RUN_WEEKLY_REPORT_NOW=true — running immediately');
    runWeeklyReports(pool).catch((err) =>
      console.error('[weeklyReportJob] Manual run error:', err.message)
    );
  }
};
