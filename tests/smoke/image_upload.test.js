// tests/smoke/image_upload.test.js — Phase 6-D-3 (Section 112, May 15, 2026).
//
// Pure-function tests for lib/image_upload.js. No DB, no network. Uses
// sharp to generate small valid PNGs/JPEGs in-process so the assertions
// exercise the real metadata probe + resize pipeline (not just mocks).

'use strict';

const sharp = require('sharp');
const {
  validateFileShape,
  probeMetadata,
  resizeToTarget,
  processLogoUpload,
  MAX_FILE_SIZE_BYTES,
  MIN_DIMENSION,
  MAX_DIMENSION,
  TARGET_SIZE,
} = require('../../lib/image_upload');

// Helper: generate a solid-color PNG of the requested size.
async function makePng(width, height, color = { r: 0, g: 200, b: 0, alpha: 1 }) {
  return sharp({
    create: { width, height, channels: 4, background: color },
  })
    .png()
    .toBuffer();
}

async function makeJpeg(width, height) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .jpeg()
    .toBuffer();
}

describe('lib/image_upload — validateFileShape', () => {
  test('throws NO_FILE when file is null', () => {
    expect(() => validateFileShape(null)).toThrow(/No logo file/);
    try {
      validateFileShape(null);
    } catch (e) {
      expect(e.code).toBe('NO_FILE');
    }
  });

  test('throws NO_FILE when buffer is missing', () => {
    try {
      validateFileShape({ mimetype: 'image/png', size: 100 });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('NO_FILE');
    }
  });

  test('throws FILE_TOO_LARGE when size exceeds limit', () => {
    try {
      validateFileShape({
        buffer: Buffer.alloc(10),
        mimetype: 'image/png',
        size: MAX_FILE_SIZE_BYTES + 1,
      });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('FILE_TOO_LARGE');
    }
  });

  test('throws INVALID_FILE_TYPE for SVG (XSS risk)', () => {
    try {
      validateFileShape({
        buffer: Buffer.from('<svg></svg>'),
        mimetype: 'image/svg+xml',
        size: 100,
      });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('INVALID_FILE_TYPE');
      expect(e.allowed).toEqual(expect.arrayContaining(['image/png', 'image/jpeg', 'image/webp']));
    }
  });

  test('throws INVALID_FILE_TYPE for application/pdf', () => {
    try {
      validateFileShape({
        buffer: Buffer.from('not-pdf'),
        mimetype: 'application/pdf',
        size: 100,
      });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('INVALID_FILE_TYPE');
    }
  });

  test('accepts PNG within size + type bounds', () => {
    expect(() =>
      validateFileShape({
        buffer: Buffer.alloc(100),
        mimetype: 'image/png',
        size: 1000,
      })
    ).not.toThrow();
  });

  test('accepts JPEG and WEBP', () => {
    for (const mime of ['image/jpeg', 'image/webp']) {
      expect(() =>
        validateFileShape({ buffer: Buffer.alloc(100), mimetype: mime, size: 1000 })
      ).not.toThrow();
    }
  });
});

describe('lib/image_upload — probeMetadata', () => {
  test('returns width/height/format for a valid PNG', async () => {
    const png = await makePng(200, 150);
    const meta = await probeMetadata(png);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
    expect(meta.format).toBe('png');
  });

  test('returns metadata for a valid JPEG', async () => {
    const jpeg = await makeJpeg(300, 300);
    const meta = await probeMetadata(jpeg);
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(300);
    expect(meta.format).toBe('jpeg');
  });

  test('throws IMAGE_UNREADABLE on corrupt bytes', async () => {
    try {
      await probeMetadata(Buffer.from('not an image at all'));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('IMAGE_UNREADABLE');
    }
  });

  test('throws IMAGE_DIMENSIONS_INVALID when below MIN_DIMENSION', async () => {
    const tiny = await makePng(MIN_DIMENSION - 1, MIN_DIMENSION - 1);
    try {
      await probeMetadata(tiny);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('IMAGE_DIMENSIONS_INVALID');
      expect(e.observed.width).toBe(MIN_DIMENSION - 1);
    }
  });

  test('throws IMAGE_DIMENSIONS_INVALID when above MAX_DIMENSION', async () => {
    const huge = await makePng(MAX_DIMENSION + 1, MAX_DIMENSION + 1);
    try {
      await probeMetadata(huge);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('IMAGE_DIMENSIONS_INVALID');
    }
  });

  test('accepts exactly MIN_DIMENSION (boundary)', async () => {
    const meta = await probeMetadata(await makePng(MIN_DIMENSION, MIN_DIMENSION));
    expect(meta.width).toBe(MIN_DIMENSION);
  });

  test('accepts exactly MAX_DIMENSION (boundary)', async () => {
    const meta = await probeMetadata(await makePng(MAX_DIMENSION, MAX_DIMENSION));
    expect(meta.width).toBe(MAX_DIMENSION);
  });
});

describe('lib/image_upload — resizeToTarget', () => {
  test('produces a PNG buffer at TARGET_SIZE × TARGET_SIZE', async () => {
    const out = await resizeToTarget(await makePng(500, 500));
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(TARGET_SIZE);
    expect(meta.height).toBe(TARGET_SIZE);
    expect(meta.format).toBe('png');
  });

  test('preserves aspect ratio for a wide source (no crop, transparent padding)', async () => {
    const wide = await makePng(1000, 200);
    const out = await resizeToTarget(wide);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(TARGET_SIZE);
    expect(meta.height).toBe(TARGET_SIZE);
    expect(meta.channels).toBe(4); // RGBA — has alpha channel for transparent padding
  });

  test('upscales a tiny source to TARGET_SIZE without cropping', async () => {
    const tiny = await makePng(MIN_DIMENSION, MIN_DIMENSION);
    const out = await resizeToTarget(tiny);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(TARGET_SIZE);
    expect(meta.height).toBe(TARGET_SIZE);
  });
});

describe('lib/image_upload — processLogoUpload (full pipeline)', () => {
  test('happy path: PNG in → PNG out at TARGET_SIZE', async () => {
    const png = await makePng(400, 400);
    const result = await processLogoUpload({
      buffer: png,
      mimetype: 'image/png',
      size: png.length,
    });
    expect(result.contentType).toBe('image/png');
    expect(result.originalMeta.width).toBe(400);
    expect(result.originalMeta.format).toBe('png');
    const outMeta = await sharp(result.buffer).metadata();
    expect(outMeta.width).toBe(TARGET_SIZE);
    expect(outMeta.height).toBe(TARGET_SIZE);
  });

  test('happy path: JPEG in → PNG out (format normalized)', async () => {
    const jpeg = await makeJpeg(500, 500);
    const result = await processLogoUpload({
      buffer: jpeg,
      mimetype: 'image/jpeg',
      size: jpeg.length,
    });
    expect(result.contentType).toBe('image/png');
    expect(result.originalMeta.format).toBe('jpeg');
    // Output is PNG regardless of input format.
    const outMeta = await sharp(result.buffer).metadata();
    expect(outMeta.format).toBe('png');
  });

  test('rejects invalid MIME before any sharp work', async () => {
    try {
      await processLogoUpload({
        buffer: Buffer.from('whatever'),
        mimetype: 'image/svg+xml',
        size: 100,
      });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('INVALID_FILE_TYPE');
    }
  });

  test('rejects dimensions too small even with valid MIME', async () => {
    const tiny = await makePng(32, 32);
    try {
      await processLogoUpload({
        buffer: tiny,
        mimetype: 'image/png',
        size: tiny.length,
      });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('IMAGE_DIMENSIONS_INVALID');
    }
  });
});
