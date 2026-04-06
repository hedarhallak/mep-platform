require('dotenv').config();
const { pool } = require('./db');

async function run() {
  await pool.query(
    'UPDATE app_users SET username = $1 WHERE employee_id = $2',
    ['worker15', 8]
  );
  console.log('Username updated to: worker15');
  await pool.end();
}

run().catch(console.error);
