// src/i18n/index.js
//
// i18next setup for the web frontend (Phase — May 2026, Section 45 pilot).
// Mirrors the mobile pattern in mep-mobile/src/i18n/index.ts:
//   - Default language: French (Quebec construction market)
//   - Secondary language: English
//   - Persisted in localStorage under 'constrai_language'
//   - Browser language detection as a fallback on first load
//
// Pilot scope: infrastructure + LoginPage translated. Remaining ~29 pages
// queued for follow-up sessions (see DECISIONS.md Section 45 TODO list).

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.js';
import fr from './locales/fr.js';

const STORAGE_KEY = 'constrai_language';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, fr: { translation: fr } },
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en'],
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      // Order: explicit user choice → browser → fallback
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

export default i18n;
export { STORAGE_KEY };
