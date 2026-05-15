// lib/image_upload.js
//
// Phase 6-D-3 (Section 112, May 15, 2026) — image upload validation
// and processing helpers for tenant logos.
//
// Pipeline (called from routes/super_admin_branding.js after multer
// parses the multipart body):
//
//   1. Validate the raw multer file:
//        - MIME type is in ALLOWED_MIME_TYPES (PNG / JPEG / WEBP only;
//          SVG explicitly rejected — XSS risk via embedded <script>).
//        - File size <= MAX_FILE_SIZE_BYTES (2 MB).
//   2. Probe the actual image with sharp.metadata() to confirm:
//        - Real dimensions fall within [64×64, 2048×2048].
//        - sharp can parse it (rejects mislabeled / corrupt files).
//   3. Resize to TARGET_SIZE × TARGET_SIZE (256×256) with `fit: 'contain'`
//      so non-square logos don't get cropped, padding with transparent
//      background.
//   4. Re-encode as PNG (consistent output format; PNG handles
//      transparency for any background color the tenant might pick).
//
// The output is a Buffer ready for putPublicObject() from spaces_client.js.
//
// Why sharp here, not the route file:
//   The route's job is HTTP wiring (multer → validation → DB). Image
//   bytes manipulation is a separate concern; isolating it makes unit
//   testing trivial (pass in a Buffer, assert the output).

'use strict';

let _sharp = null;
function getSharp() {
  if (!_sharp) {
     
    _sharp = require('sharp');
  }
  return _sharp;
}

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const MIN_DIMENSION = 64;
const MAX_DIMENSION = 2048;
const TARGET_SIZE = 256;

/**
 * Quick pre-sharp validation against the multer file object. Throws an
 * Error with `.code` set to one of:
 *   'NO_FILE'             — `file` is null/undefined
 *   'FILE_TOO_LARGE'      — file.size > 2MB
 *   'INVALID_FILE_TYPE'   — mimetype not in allowlist
 *
 * @param {{ buffer: Buffer, mimetype: string, size: number }|null} file
 */
function validateFileShape(file) {
  if (!file || !file.buffer) {
    const err = new Error('No logo file provided');
    err.code = 'NO_FILE';
    throw err;
  }
  if (typeof file.size === 'number' && file.size > MAX_FILE_SIZE_BYTES) {
    const err = new Error(`File too large (max ${MAX_FILE_SIZE_BYTES} bytes)`);
    err.code = 'FILE_TOO_LARGE';
    throw err;
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    const err = new Error(`Invalid file type: ${file.mimetype}`);
    err.code = 'INVALID_FILE_TYPE';
    err.allowed = Array.from(ALLOWED_MIME_TYPES);
    throw err;
  }
}

/**
 * Probe image dimensions with sharp.metadata(). Throws with `.code`:
 *   'IMAGE_UNREADABLE'         — sharp couldn't parse the buffer
 *   'IMAGE_DIMENSIONS_INVALID' — width/height outside [MIN, MAX]
 *
 * @param {Buffer} buffer
 * @returns {Promise<{width: number, height: number, format: string}>}
 */
async function probeMetadata(buffer) {
  const sharp = getSharp();
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch (e) {
    const err = new Error('Image unreadable: ' + (e && e.message ? e.message : 'unknown'));
    err.code = 'IMAGE_UNREADABLE';
    throw err;
  }
  const { width, height, format } = meta;
  if (
    !width ||
    !height ||
    width < MIN_DIMENSION ||
    height < MIN_DIMENSION ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION
  ) {
    const err = new Error(
      `Image dimensions out of range: ${width || '?'}×${height || '?'} (must be ${MIN_DIMENSION}-${MAX_DIMENSION} px on each side)`
    );
    err.code = 'IMAGE_DIMENSIONS_INVALID';
    err.observed = { width, height };
    err.allowed = { min: MIN_DIMENSION, max: MAX_DIMENSION };
    throw err;
  }
  return { width, height, format };
}

/**
 * Resize the image buffer to TARGET_SIZE × TARGET_SIZE (PNG output).
 * - `fit: 'contain'` preserves aspect ratio without cropping.
 * - Background is transparent so non-square logos sit in a transparent
 *   canvas. The frontend already wraps the logo in `bg-white p-1.5`
 *   (Section 109.1) so the white wash handles dark-on-light logos.
 * - Output is always PNG to give a consistent file extension and to
 *   keep transparency support.
 *
 * @param {Buffer} buffer  Raw input image bytes (already validated).
 * @returns {Promise<Buffer>}
 */
async function resizeToTarget(buffer) {
  const sharp = getSharp();
  return sharp(buffer)
    .resize(TARGET_SIZE, TARGET_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

/**
 * Full validate + probe + resize pipeline. Returns the processed PNG
 * Buffer ready to upload. Re-throws validation errors with `.code` set
 * so the caller can map them to HTTP 400 responses with stable codes.
 *
 * @param {{ buffer: Buffer, mimetype: string, size: number }|null} file
 * @returns {Promise<{ buffer: Buffer, contentType: 'image/png', originalMeta: {width:number, height:number, format:string} }>}
 */
async function processLogoUpload(file) {
  validateFileShape(file);
  const originalMeta = await probeMetadata(file.buffer);
  const buffer = await resizeToTarget(file.buffer);
  return {
    buffer,
    contentType: 'image/png',
    originalMeta,
  };
}

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MIN_DIMENSION,
  MAX_DIMENSION,
  TARGET_SIZE,
  validateFileShape,
  probeMetadata,
  resizeToTarget,
  processLogoUpload,
};
