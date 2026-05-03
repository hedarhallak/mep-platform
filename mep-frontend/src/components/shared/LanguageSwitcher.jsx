// src/components/shared/LanguageSwitcher.jsx — FR/EN toggle.

import { useTranslation } from 'react-i18next';

const LANGS = ['fr', 'en'];

export default function LanguageSwitcher({ className = '' }) {
  const { i18n, t } = useTranslation();
  const current = i18n.language?.startsWith('en') ? 'en' : 'fr';

  return (
    <div
      className={`inline-flex items-center rounded-full border border-slate-300 bg-white p-0.5 text-xs font-semibold ${className}`}
      role="group"
      aria-label={t('language.label')}
    >
      {LANGS.map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => i18n.changeLanguage(lng)}
          className={`px-3 py-1 rounded-full transition-colors ${
            current === lng
              ? 'bg-primary text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          aria-pressed={current === lng}
        >
          {t(`language.${lng}`)}
        </button>
      ))}
    </div>
  );
}
