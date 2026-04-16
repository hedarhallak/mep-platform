/**
 * ConstrAI — Centralized Color Theme
 *
 * RULE: Never hardcode color values in screens or components.
 *       Always import from this file.
 *
 * To change the entire app's look, edit ONLY this file.
 */

const Colors = {
  // ── Primary (Olive Green — brand identity) ────────────────────────
  primary:       '#3d5a2e',   // Main brand — headers, nav bars, primary buttons
  primaryLight:  '#5a7a4a',   // Hover states, secondary elements
  primaryBright: '#7fb069',   // Highlights, active indicators
  primaryPale:   '#e8f0e4',   // Very light backgrounds, selected cards

  // ── Accent ────────────────────────────────────────────────────────
  success:       '#16a34a',   // Check-in, completed, positive actions
  danger:        '#dc2626',   // Check-out, delete, destructive actions
  warning:       '#f59e0b',   // Overtime, late badge, attention
  info:          '#3b82f6',   // Informational badges

  // ── Neutrals ──────────────────────────────────────────────────────
  charcoal:      '#2d3436',   // Primary text (headings, important)
  textPrimary:   '#111827',   // Default body text
  textSecondary: '#374151',   // Secondary body text
  textMuted:     '#6b7280',   // Muted / helper text
  textLight:     '#9ca3af',   // Placeholders, timestamps
  white:         '#ffffff',

  // ── Backgrounds ───────────────────────────────────────────────────
  background:    '#f3f4f6',   // Screen backgrounds
  cardBg:        '#ffffff',   // Cards / surfaces
  inputBg:       '#f9fafb',   // Input fields background
  divider:       '#e5e7eb',   // Borders, separators
  subtleBg:      '#f3f4f6',   // Subtle section backgrounds

  // ── Status-specific backgrounds ───────────────────────────────────
  successBg:     '#f0fdf4',   // Success badge backgrounds
  successBorder: '#bbf7d0',   // Success badge border
  dangerBg:      '#fef2f2',   // Danger/late badge backgrounds
  warningBg:     '#fffbeb',   // Warning badge backgrounds
  primaryBg:     '#eff6ff',   // was blue tint — now olive tint for badges

  // ── Shadows (used with shadow* style props) ───────────────────────
  shadowColor:   '#000000',
} as const;

export default Colors;

// ── Convenience aliases for navigation headers ──────────────────────
export const headerColors = {
  headerStyle: { backgroundColor: Colors.primary },
  headerTintColor: Colors.white,
  headerTitleStyle: { fontWeight: 'bold' as const },
};
