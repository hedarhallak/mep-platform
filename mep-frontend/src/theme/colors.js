/**
 * ConstrAI — Centralized Web Color Theme
 *
 * RULE: Never hardcode color values in pages or components.
 *       Always import from this file.
 *
 * Tailwind classes → use the semantic class names below.
 * Inline styles   → import Colors and use the hex values.
 *
 * To change the entire web app's look, edit ONLY this file + index.css @theme.
 */

const Colors = {
  // ── Primary (Dark Blue — brand identity) ──────────────────────────
  primary:       '#1e3a5f',   // Main brand — headers, nav, primary buttons
  primaryDark:   '#162d4a',   // Darker variant — pressed states
  primaryLight:  '#2563eb',   // Lighter blue — hover, links
  primaryBright: '#60a5fa',   // Light blue — highlights, indicators
  primaryPale:   '#dbeafe',   // Very light — selected rows, badges bg

  // ── Status ────────────────────────────────────────────────────────
  success:       '#16a34a',
  successLight:  '#dcfce7',
  danger:        '#dc2626',
  dangerLight:   '#fef2f2',
  warning:       '#f59e0b',
  warningLight:  '#fffbeb',
  info:          '#3b82f6',
  infoLight:     '#dbeafe',

  // ── Neutrals ──────────────────────────────────────────────────────
  text:          '#1e293b',
  textSecondary: '#475569',
  textMuted:     '#94a3b8',
  white:         '#ffffff',
  bg:            '#f1f5f9',
  card:          '#ffffff',
  border:        '#e2e8f0',
  divider:       '#e5e7eb',

  // ── Sidebar ───────────────────────────────────────────────────────
  sidebar:       '#0f172a',
  sidebarText:   '#94a3b8',
  sidebarActive: '#1e3a5f',
};

export default Colors;

/**
 * Tailwind class mapping — replace indigo-* with these:
 *
 * bg-indigo-600  → bg-primary       (or style={{ backgroundColor: Colors.primary }})
 * bg-indigo-700  → bg-primary-dark
 * bg-indigo-500  → bg-primary-light
 * bg-indigo-100  → bg-primary-pale
 * bg-indigo-50   → bg-primary-pale
 * text-indigo-600 → text-primary
 * text-indigo-700 → text-primary-dark
 * border-indigo-200 → border-primary-pale
 * ring-indigo-500 → ring-primary-light
 */
