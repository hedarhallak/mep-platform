// lib/spaces_client.js
//
// Phase 6-D-3 (Section 112, May 15, 2026) — DigitalOcean Spaces client.
//
// Spaces is S3-compatible, so we use the standard @aws-sdk/client-s3
// pointed at the Spaces endpoint. The same client handles all tenant-
// asset uploads (today: logos via routes/super_admin_branding.js).
//
// Required env vars (set in /var/www/mep/.env on prod):
//   DO_SPACES_KEY              — Spaces access key (per-bucket via DO dashboard)
//   DO_SPACES_SECRET           — Spaces secret
//   DO_SPACES_BUCKET           — bucket name (e.g. constrai-tenant-assets)
//   DO_SPACES_REGION           — region slug (e.g. tor1, nyc3)
//   DO_SPACES_ENDPOINT         — endpoint URL (e.g. https://tor1.digitaloceanspaces.com)
//   DO_SPACES_PUBLIC_URL_BASE  — public URL prefix for uploaded objects
//                                (e.g. https://constrai-tenant-assets.tor1.cdn.digitaloceanspaces.com
//                                 or  https://constrai-tenant-assets.tor1.digitaloceanspaces.com)
//
// Why a SEPARATE bucket from DB backups:
//   `constrai-backups` (the existing bucket from RECOVERY.md) holds nightly
//   pg_dump files — sensitive, private, encrypted at rest. Tenant logos are
//   public-readable assets served to anonymous browsers. Mixing the two in
//   one bucket would force a single CORS / ACL policy on both, which means
//   either backups become readable or logos can't be public. Separate
//   buckets = clean separation of concerns + independent credentials so a
//   leaked Spaces key for tenant assets can't touch backups (Section 91 /
//   Pitfall #30 — credential blast-radius minimization).
//
// Initialization is lazy via getSpacesClient(): the @aws-sdk/client-s3
// import is heavy (~5MB of bundle). Lazy-importing avoids pulling it
// into the boot path of routes that don't upload anything — keeps the
// pm2 restart fast and the test suite cold-start sane.

'use strict';

let _client = null;
let _S3Client = null;
let _PutObjectCommand = null;

function ensureDeps() {
  if (_S3Client && _PutObjectCommand) return;
   
  const s3 = require('@aws-sdk/client-s3');
  _S3Client = s3.S3Client;
  _PutObjectCommand = s3.PutObjectCommand;
}

function readConfig() {
  const cfg = {
    key: process.env.DO_SPACES_KEY,
    secret: process.env.DO_SPACES_SECRET,
    bucket: process.env.DO_SPACES_BUCKET,
    region: process.env.DO_SPACES_REGION,
    endpoint: process.env.DO_SPACES_ENDPOINT,
    publicUrlBase: process.env.DO_SPACES_PUBLIC_URL_BASE,
  };
  const missing = Object.entries(cfg)
    .filter(([, v]) => !v || typeof v !== 'string' || v.trim() === '')
    .map(([k]) => k);
  if (missing.length) {
    const err = new Error(`Spaces client misconfigured — missing env: ${missing.join(', ')}`);
    err.code = 'SPACES_NOT_CONFIGURED';
    throw err;
  }
  return cfg;
}

/**
 * Lazily construct + cache an S3Client pointed at DO Spaces.
 * Throws SPACES_NOT_CONFIGURED if any required env var is missing.
 * @returns {{ client: any, bucket: string, publicUrlBase: string }}
 */
function getSpacesClient() {
  if (_client) return _client;
  ensureDeps();
  const cfg = readConfig();
  const s3 = new _S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.key,
      secretAccessKey: cfg.secret,
    },
    // Spaces uses virtual-hosted-style URLs by default; forcePathStyle
    // would break the publicUrlBase pattern. Keep false.
    forcePathStyle: false,
  });
  _client = {
    client: s3,
    bucket: cfg.bucket,
    publicUrlBase: cfg.publicUrlBase.replace(/\/$/, ''),
  };
  return _client;
}

/**
 * Upload an object to DO Spaces with public-read ACL and a Cache-Control
 * suitable for static assets. Returns the public URL.
 *
 * @param {string} key                Object key (e.g. tenant-logos/acm-1747200000.png)
 * @param {Buffer} body               Object bytes
 * @param {string} [contentType]      MIME type (default 'application/octet-stream')
 * @param {string} [cacheControl]     Cache-Control header (default '7d, immutable' for hashed names)
 * @returns {Promise<string>}         Public URL to the uploaded object
 */
async function putPublicObject(
  key,
  body,
  contentType = 'application/octet-stream',
  cacheControl = 'public, max-age=604800, immutable'
) {
  ensureDeps();
  const { client, bucket, publicUrlBase } = getSpacesClient();
  await client.send(
    new _PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: 'public-read',
      CacheControl: cacheControl,
    })
  );
  return `${publicUrlBase}/${key}`;
}

/**
 * Reset the cached client + lazily-loaded SDK references. Test-only —
 * production code never calls this. Lets a Jest test mock `@aws-sdk/client-s3`
 * BEFORE the lazy require fires, by clearing the previous module cache.
 */
function _resetForTests() {
  _client = null;
  _S3Client = null;
  _PutObjectCommand = null;
}

module.exports = { getSpacesClient, putPublicObject, _resetForTests };
