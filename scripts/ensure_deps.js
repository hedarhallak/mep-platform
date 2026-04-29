// scripts/ensure_deps.js
// SAFE helper: ensures npm dependencies are installed before starting the server.
// If node_modules is missing (common after REPLACE), it runs `npm install` automatically.

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function hasNodeModules() {
  return fs.existsSync(path.join(__dirname, '..', 'node_modules'));
}

function canRequireJWT() {
  try {
    require('jsonwebtoken');
    return true;
  } catch (_e) {
    return false;
  }
}

(function main() {
  if (hasNodeModules() && canRequireJWT()) return;

  console.log(
    '[ensure_deps] node_modules missing or deps not installed. Running `npm install` ...'
  );
  execSync('npm install', { stdio: 'inherit' });

  if (!canRequireJWT()) {
    console.error('[ensure_deps] ERROR: jsonwebtoken still missing after npm install.');
    process.exit(1);
  }
})();
