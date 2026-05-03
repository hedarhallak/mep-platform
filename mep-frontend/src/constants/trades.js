// ── Unified trade definitions ────────────────────────────────

export const TRADE_MAP = {
  PLUMBING:      { bg: 'bg-sky-500',     light: 'bg-sky-100 text-sky-700',        dot: '#0ea5e9' },
  ELECTRICAL:    { bg: 'bg-amber-500',   light: 'bg-amber-100 text-amber-700',    dot: '#f59e0b' },
  HVAC:          { bg: 'bg-emerald-500', light: 'bg-emerald-100 text-emerald-700', dot: '#10b981' },
  CARPENTRY:     { bg: 'bg-orange-500',  light: 'bg-orange-100 text-orange-700',  dot: '#f97316' },
  ELEVATOR_TECH: { bg: 'bg-rose-500',    light: 'bg-rose-100 text-rose-700',      dot: '#f43f5e' },
  GENERAL:       { bg: 'bg-slate-500',   light: 'bg-slate-100 text-slate-600',    dot: '#64748b' },
  DEFAULT:       { bg: 'bg-slate-400',   light: 'bg-slate-100 text-slate-600',    dot: '#94a3b8' },
}

/** Look up a trade entry by code (falls back to DEFAULT) */
export const trade = (code) => TRADE_MAP[(code || '').toUpperCase()] || TRADE_MAP.DEFAULT

/** Quick dot-color lookup */
export const tradeDot = (code) => trade(code).dot

/**
 * Trade list for dropdowns (with ALL option).
 *
 * Section 58: switched from inline EN `label` to `labelKey` so consumers
 * can resolve via i18n at render time. Keys live under `trades.*` in
 * `src/i18n/locales/{en,fr}.js`. Same pattern as `mainNav` in AppLayout.
 */
export const TRADES = [
  { value: 'ALL',        labelKey: 'trades.all'        },
  { value: 'PLUMBING',   labelKey: 'trades.plumbing'   },
  { value: 'ELECTRICAL', labelKey: 'trades.electrical' },
  { value: 'HVAC',       labelKey: 'trades.hvac'       },
  { value: 'CARPENTRY',  labelKey: 'trades.carpentry'  },
  { value: 'GENERAL',    labelKey: 'trades.general'    },
]

/** Badge classes per trade (light variant with text) — includes ALL */
export const TRADE_BADGE = {
  ALL:           'bg-slate-100 text-slate-600',
  PLUMBING:      'bg-sky-100 text-sky-700',
  ELECTRICAL:    'bg-amber-100 text-amber-700',
  HVAC:         'bg-emerald-100 text-emerald-700',
  CARPENTRY:     'bg-orange-100 text-orange-700',
  ELEVATOR_TECH: 'bg-rose-100 text-rose-700',
  GENERAL:       'bg-slate-100 text-slate-600',
}

/** Get badge class for a trade code */
export const tradeBadge = (code) => TRADE_BADGE[(code || '').toUpperCase()] || TRADE_BADGE.ALL
