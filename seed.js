'use strict';

/**
 * seed.js — MEP Platform test data generator
 * Run: node seed.js
 * Adds 50 employees + assignments + 90 days attendance for company_id = 5
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const COMPANY_ID = 5;
const PROJECTS = [11, 12, 21, 22, 23]; // project IDs
const TRADES = ['PLUMBING', 'ELECTRICAL', 'HVAC', 'CARPENTRY', 'GENERAL'];

// Montreal area coordinates with varying distances from project site (-73.62, 45.559)
const HOME_LOCATIONS = [
  // <41km — no allowance
  { lat: 45.53, lng: -73.61, dist: 3.2 },
  { lat: 45.58, lng: -73.57, dist: 5.1 },
  { lat: 45.5, lng: -73.65, dist: 8.4 },
  { lat: 45.54, lng: -73.7, dist: 9.2 },
  { lat: 45.47, lng: -73.58, dist: 12.0 },
  { lat: 45.6, lng: -73.5, dist: 15.3 },
  { lat: 45.44, lng: -73.72, dist: 18.7 },
  { lat: 45.63, lng: -73.45, dist: 22.1 },
  { lat: 45.42, lng: -73.8, dist: 28.5 },
  { lat: 45.65, lng: -73.38, dist: 35.0 },
  // 41-65km — T2200
  { lat: 45.68, lng: -73.1, dist: 44.2 },
  { lat: 45.3, lng: -73.55, dist: 47.8 },
  { lat: 45.72, lng: -73.05, dist: 52.0 },
  { lat: 45.25, lng: -73.6, dist: 55.3 },
  { lat: 45.75, lng: -72.98, dist: 58.1 },
  { lat: 45.2, lng: -73.65, dist: 61.4 },
  // 65km+ — company allowance
  { lat: 45.8, lng: -72.85, dist: 68.5 },
  { lat: 45.15, lng: -73.7, dist: 72.1 },
  { lat: 45.85, lng: -72.72, dist: 78.3 },
  { lat: 45.1, lng: -73.75, dist: 82.0 },
  { lat: 45.9, lng: -72.6, dist: 88.7 },
  { lat: 45.05, lng: -73.8, dist: 92.4 },
  { lat: 45.95, lng: -72.48, dist: 97.2 },
  { lat: 45.0, lng: -73.85, dist: 103.5 },
  { lat: 46.0, lng: -72.35, dist: 110.8 },
];

const FIRST_NAMES = [
  'Mohammed',
  'Jean',
  'Pierre',
  'Karim',
  'Ali',
  'David',
  'Marc',
  'Youssef',
  'Antoine',
  'Hassan',
  'Lucas',
  'Ethan',
  'Noah',
  'Liam',
  'Omar',
  'Carlos',
  'Felipe',
  'Andre',
  'Michel',
  'Paul',
];
const LAST_NAMES = [
  'Tremblay',
  'Gagnon',
  'Roy',
  'Côté',
  'Bouchard',
  'Gauthier',
  'Morin',
  'Lavoie',
  'Fortin',
  'Gagné',
  'Ouellet',
  'Pelletier',
  'Leblanc',
  'Jobin',
  'Ndiaye',
  'Khalil',
  'Hassan',
  'Martin',
  'Dupont',
  'Bernard',
];

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function dateStr(d) {
  return d.toISOString().split('T')[0];
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('🌱 Seeding 50 employees...');

    const employeeIds = [];

    for (let i = 0; i < 50; i++) {
      const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
      const lastName = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
      const fullName = `${firstName} ${lastName} ${i + 1}`;
      const trade = TRADES[i % TRADES.length];
      const loc = HOME_LOCATIONS[i % HOME_LOCATIONS.length];
      const username = `seed.worker${i + 1}@meptest.com`;

      // Create app_user
      const userRes = await client.query(
        `
        INSERT INTO public.app_users (username, password_hash, pin_hash, role, company_id, created_at)
        VALUES ($1, '$2b$10$fakehashforseeddata123456789012', '$2b$10$fakepinhashforseed12345678', 'WORKER', $2, NOW())
        ON CONFLICT (username) DO UPDATE SET created_at = NOW()
        RETURNING id
      `,
        [username, COMPANY_ID]
      );

      const userId = userRes.rows[0].id;

      // Create employee record (referenced by employee_profiles FK)
      const empRow = await client.query(
        `
        INSERT INTO public.employees (employee_code, first_name, last_name, company_id, home_lat, home_lng)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (employee_code) DO UPDATE SET first_name = EXCLUDED.first_name
        RETURNING id
      `,
        [
          `SEED-${String(i + 1).padStart(3, '0')}`,
          firstName,
          `${lastName} ${i + 1}`,
          COMPANY_ID,
          loc.lat,
          loc.lng,
        ]
      );

      const employeeId = empRow.rows[0].id;

      // Link app_user to employee
      await client.query(`UPDATE public.app_users SET employee_id = $1 WHERE id = $2`, [
        employeeId,
        userId,
      ]);

      // Create employee profile
      const empRes = await client.query(
        `
        INSERT INTO public.employee_profiles
          (employee_id, full_name, trade_code, home_address, home_location, created_at, updated_at)
        VALUES
          ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), NOW(), NOW())
        ON CONFLICT (employee_id) DO UPDATE
          SET full_name = EXCLUDED.full_name, trade_code = EXCLUDED.trade_code,
              home_location = EXCLUDED.home_location, updated_at = NOW()
        RETURNING employee_id
      `,
        [employeeId, fullName, trade, `Test Address ${i + 1}`, loc.lng, loc.lat]
      );

      employeeIds.push({ userId, employeeId, trade, loc });
      if ((i + 1) % 10 === 0) console.log(`  ✓ ${i + 1}/50 employees created`);
    }

    console.log('📋 Creating assignments...');

    const assignmentIds = [];
    const today = new Date();
    const start90 = new Date(today);
    start90.setDate(today.getDate() - 90);

    for (const emp of employeeIds) {
      const projectId = PROJECTS[Math.floor(Math.random() * PROJECTS.length)];
      const startDate = new Date(start90);
      startDate.setDate(start90.getDate() + randInt(0, 30));
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + 30);

      const arRes = await client.query(
        `
        INSERT INTO public.assignment_requests
          (company_id, project_id, requested_for_employee_id, assignment_role,
           request_type, status, start_date, end_date, shift_start, shift_end,
           requested_by_user_id, payload_json, distance_km)
        VALUES ($1, $2, $3, 'WORKER', 'CREATE_ASSIGNMENT', 'APPROVED', $4, $5,
                '07:00', '15:30', 1, '{}', $6)
        RETURNING id
      `,
        [COMPANY_ID, projectId, emp.employeeId, dateStr(startDate), dateStr(endDate), emp.loc.dist]
      );

      assignmentIds.push({
        arId: arRes.rows[0].id,
        employeeId: emp.employeeId,
        projectId,
        dist: emp.loc.dist,
        startDate,
      });
    }

    console.log('⏰ Creating attendance records (90 days)...');

    let attendanceCount = 0;
    const statuses = ['CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'CHECKED_OUT', 'CONFIRMED'];

    for (const asgn of assignmentIds) {
      // Random 60-80% attendance rate over 90 days
      const workDays = randInt(45, 75);
      const daysArr = [];
      for (let d = 0; d < 90; d++) {
        const day = new Date(asgn.startDate);
        day.setDate(asgn.startDate.getDate() + d);
        if (day > today) break;
        if (day.getDay() !== 0 && day.getDay() !== 6) daysArr.push(day); // skip weekends
      }

      const selectedDays = daysArr.sort(() => 0.5 - Math.random()).slice(0, workDays);

      for (const day of selectedDays) {
        const lateMinutes = Math.random() < 0.15 ? randInt(5, 45) : 0;
        const regularHours = 8;
        const overtime = Math.random() < 0.2 ? randInt(1, 3) : 0;
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const checkIn = `0${7 + Math.floor(lateMinutes / 60)}:${String(lateMinutes % 60).padStart(2, '0')}`;
        const checkOut = `15:30`;

        await client.query(
          `
          INSERT INTO public.attendance_records
            (company_id, project_id, assignment_request_id, employee_id,
             attendance_date, shift_start, check_in_time, check_out_time,
             regular_hours, overtime_hours, late_minutes, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, '07:00', $6, $7, $8, $9, $10, $11, NOW(), NOW())
          ON CONFLICT (company_id, employee_id, project_id, attendance_date) DO NOTHING
        `,
          [
            COMPANY_ID,
            asgn.projectId,
            asgn.arId,
            asgn.employeeId,
            dateStr(day),
            checkIn,
            checkOut,
            regularHours,
            overtime,
            lateMinutes,
            status,
          ]
        );
        attendanceCount++;
      }
    }

    await client.query('COMMIT');
    console.log(`\n✅ Seed complete!`);
    console.log(`   👷 50 employees created`);
    console.log(`   📋 ${assignmentIds.length} assignments created`);
    console.log(`   ⏰ ~${attendanceCount} attendance records created`);
    console.log(`\n   Distance breakdown:`);
    console.log(`   <41km  : ${HOME_LOCATIONS.filter((l) => l.dist < 41).length * 2} employees`);
    console.log(
      `   41-65km: ${HOME_LOCATIONS.filter((l) => l.dist >= 41 && l.dist < 65).length * 2} employees`
    );
    console.log(`   65km+  : ${HOME_LOCATIONS.filter((l) => l.dist >= 65).length * 2} employees`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
