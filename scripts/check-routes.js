const fs = require('fs');
const path = require('path');

// Phase 11b refactor: route mounts moved from index.js to app.js so tests
// can drive the Express app via Supertest without binding a port. The
// route audit follows.
const INDEX_FILE = path.join(__dirname, '../app.js');
const ROUTES_DIR = path.join(__dirname, '../routes');

const INTENTIONAL_DOUBLE_MOUNTS = ['/api/assignments', '/api/profile', '/api/materials'];

function checkRoutes() {
  const indexContent = fs.readFileSync(INDEX_FILE, 'utf8');
  const routeFiles = fs
    .readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith('.js'))
    .map((f) => f.replace('.js', ''));

  const issues = [];
  const warnings = [];

  for (const route of routeFiles) {
    const isRegistered = indexContent.includes(`./routes/${route}`);
    if (!isRegistered) {
      issues.push(`  UNREGISTERED ROUTE: routes/${route}.js`);
    }
  }

  const routeMatches = [
    ...indexContent.matchAll(/loadRouter\(["']\.\/routes\/([^"']+)["']\)/g),
    ...indexContent.matchAll(/require\(["']\.\/routes\/([^"']+)["']\)/g),
  ];
  const registeredInIndex = new Set([...routeMatches].map((m) => m[1]));

  for (const registered of registeredInIndex) {
    const filePath = path.join(ROUTES_DIR, `${registered}.js`);
    if (!fs.existsSync(filePath)) {
      issues.push(
        `  MISSING FILE: routes/${registered}.js is registered in app.js but file does not exist`
      );
    }
  }

  const doubleMount = {};
  const mountMatches = [...indexContent.matchAll(/app\.use\(["']([^"']+)["']/g)];
  for (const match of mountMatches) {
    const prefix = match[1];
    if (!prefix.startsWith('/api/auth') && prefix.startsWith('/api/')) {
      doubleMount[prefix] = (doubleMount[prefix] || 0) + 1;
    }
  }
  for (const [prefix, count] of Object.entries(doubleMount)) {
    if (count > 1 && !INTENTIONAL_DOUBLE_MOUNTS.includes(prefix)) {
      warnings.push(`  DOUBLE MOUNT (${count}x): ${prefix} - verify no route conflicts`);
    }
  }

  console.log('\n========================================');
  console.log('       CONSTRAI - Route Audit');
  console.log('========================================');
  console.log(`Route files found:    ${routeFiles.length}`);
  console.log(`Routes in app.js:     ${registeredInIndex.size}`);

  if (issues.length === 0 && warnings.length === 0) {
    console.log('\n  All routes are clean and registered.\n');
    return true;
  }

  if (issues.length > 0) {
    console.log(`\n  ERRORS (${issues.length}):`);
    issues.forEach((i) => console.log(i));
  }

  if (warnings.length > 0) {
    console.log(`\n  WARNINGS (${warnings.length}):`);
    warnings.forEach((w) => console.log(w));
  }

  console.log('');

  if (issues.length > 0) {
    return false;
  }
  return true;
}

const ok = checkRoutes();
if (!ok) process.exit(1);
