require('dotenv').config();
const { pool } = require('./db');
const { hashPin } = require('./lib/auth_utils');

async function resetPin() {
  const h = await hashPin('1234');
  await pool.query('UPDATE app_users SET pin_hash = $1 WHERE employee_id = $2', [h, 8]);
  console.log('PIN reset to 1234 for employee_id 8');
  await pool.end();
}

resetPin().catch(console.error);
