// src/i18n/locales/parity.test.js
//
// Track 3 (web i18n) — locale parity guard. A key present in one language but
// missing in the other renders as a raw key string (e.g. "workerPicker.pending")
// to that language's users. This test fails the build the moment en.js and fr.js
// drift apart, so every new EN key must get a FR sibling (and vice versa) — no
// silent English leaks into the Quebec French UI.

import { describe, test, expect } from 'vitest'
import en from './en.js'
import fr from './fr.js'

function flatKeys(obj, prefix = '', acc = []) {
  for (const k of Object.keys(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    const v = obj[k]
    if (v && typeof v === 'object' && !Array.isArray(v)) flatKeys(v, key, acc)
    else acc.push(key)
  }
  return acc
}

describe('i18n locale parity (en.js ↔ fr.js)', () => {
  const enKeys = flatKeys(en).sort()
  const frKeys = flatKeys(fr).sort()
  const enSet = new Set(enKeys)
  const frSet = new Set(frKeys)

  test('every EN key has a FR sibling', () => {
    const missingInFr = enKeys.filter((k) => !frSet.has(k))
    expect(missingInFr).toEqual([])
  })

  test('every FR key has an EN sibling', () => {
    const missingInEn = frKeys.filter((k) => !enSet.has(k))
    expect(missingInEn).toEqual([])
  })

  test('no empty string values in either locale', () => {
    const empties = []
    for (const [lng, obj] of [['en', en], ['fr', fr]]) {
      const flat = {}
      const walk = (o, p = '') => {
        for (const k of Object.keys(o)) {
          const key = p ? `${p}.${k}` : k
          const v = o[k]
          if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, key)
          else flat[key] = v
        }
      }
      walk(obj)
      for (const [k, v] of Object.entries(flat)) {
        if (typeof v === 'string' && v.trim() === '') empties.push(`${lng}:${k}`)
      }
    }
    expect(empties).toEqual([])
  })

  test('the new workerPicker namespace is present and translated in both', () => {
    expect(enSet.has('workerPicker.noResults')).toBe(true)
    expect(frSet.has('workerPicker.noResults')).toBe(true)
    // FR must actually differ from EN for a translated phrase (not a left-in placeholder).
    expect(fr.workerPicker.pending).not.toBe(en.workerPicker.pending)
  })
})
