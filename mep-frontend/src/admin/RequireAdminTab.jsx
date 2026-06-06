// src/admin/RequireAdminTab.jsx
//
// Section 133.5 (June 4, 2026) — per-TAB session gate for the SUPER_ADMIN
// portal.
//
// The auth cookie is browser-wide (shared across all tabs), so closing a
// single admin tab does NOT end the session — a fresh/reopened tab would
// silently resume with the still-valid cookie. To make "close the tab →
// must log in + TOTP again", access to every protected admin route is gated
// on a per-tab marker stored in sessionStorage:
//
//   * sessionStorage is PER-TAB and is wiped when the tab closes, and a
//     brand-new tab does NOT inherit it.
//   * AdminLogin sets the marker on a successful PIN + TOTP sign-in.
//   * This guard redirects to /login whenever the marker is absent — i.e.
//     in any tab that didn't itself complete a login (reopened tab, new
//     tab, post-idle-logout tab).
//
// Tradeoffs (intentional): a full reload (F5) KEEPS you signed in
// (sessionStorage survives reload); opening a SECOND admin tab requires its
// own login. This guard does NOT clear the shared cookie, so it never
// clobbers a sibling tab that legitimately holds a session.

import { Navigate, useLocation } from 'react-router-dom'

export const ADMIN_TAB_SESSION_KEY = 'admin_tab_session'

export function hasAdminTabSession() {
  try {
    return sessionStorage.getItem(ADMIN_TAB_SESSION_KEY) === '1'
  } catch {
    // sessionStorage unavailable (rare / private-mode quirks) — fail OPEN
    // so we never permanently lock the operator out of the portal. The
    // cookie + TOTP login remain the real auth; this is a UX-hardening gate.
    return true
  }
}

export function markAdminTabSession() {
  try {
    sessionStorage.setItem(ADMIN_TAB_SESSION_KEY, '1')
  } catch {
    /* private mode — ignore; the gate fails open per hasAdminTabSession */
  }
}

export function clearAdminTabSession() {
  try {
    sessionStorage.removeItem(ADMIN_TAB_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

export default function RequireAdminTab({ children }) {
  const location = useLocation()
  if (!hasAdminTabSession()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}
