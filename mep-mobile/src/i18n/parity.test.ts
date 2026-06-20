// §149.7 (June 2026) — mobile i18n parity guard.
//
// The web app has had an i18n parity test for a while; mobile did not, which
// let EN/FR drift (whole screens shipped with hardcoded English). This test
// gives mobile the same regression net: every key present in en.ts must exist
// in fr.ts and vice-versa. If you add a key to one locale, CI fails until you
// add it to the other — no more silently-untranslated strings.

import en from './locales/en';
import fr from './locales/fr';

// Flatten a nested locale object into dotted key paths ('materials.status.sent').
function flatten(obj: Record<string, any>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const k of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const value = obj[k];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys = keys.concat(flatten(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

describe('i18n EN/FR parity', () => {
  const enKeys = flatten(en).sort();
  const frKeys = flatten(fr).sort();

  test('every EN key has a matching FR key', () => {
    const missingInFr = enKeys.filter((k) => !frKeys.includes(k));
    expect(missingInFr).toEqual([]);
  });

  test('every FR key has a matching EN key', () => {
    const missingInEn = frKeys.filter((k) => !enKeys.includes(k));
    expect(missingInEn).toEqual([]);
  });

  test('both locales expose the same number of keys', () => {
    expect(enKeys.length).toBe(frKeys.length);
  });

  test('no locale value is an empty string', () => {
    const emptyEn = flatten(en).filter((k) => {
      const v = k.split('.').reduce<any>((o, part) => (o ? o[part] : undefined), en);
      return typeof v === 'string' && v.trim() === '';
    });
    const emptyFr = flatten(fr).filter((k) => {
      const v = k.split('.').reduce<any>((o, part) => (o ? o[part] : undefined), fr);
      return typeof v === 'string' && v.trim() === '';
    });
    expect({ emptyEn, emptyFr }).toEqual({ emptyEn: [], emptyFr: [] });
  });
});
