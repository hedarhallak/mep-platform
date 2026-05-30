// src/admin/AdminLogoutButton.jsx
//
// Phase 6-D-6 PR 2 / Section 120 — small shared component for SUPER_ADMIN
// portal sign-out. Drops into the top-right of each admin page header.
//
// Behavior:
//   1. POST /api/auth/logout to revoke the refresh token server-side (best-
//      effort — ignores errors so we never strand a user on a stale token).
//   2. Clear mep_token + mep_refresh_token from localStorage.
//   3. Redirect to /login (full reload so any in-memory state resets).
//
// Until the admin portal had a logout button, the only way to sign out was
// to clear cookies / localStorage manually — captured as the missing-logout
// gap in Section 120 follow-up.

import { useState } from 'react'
import { LogOut } from 'lucide-react'
import api from '../lib/api'

export default function AdminLogoutButton({ className = '' }) {
  const [submitting, setSubmitting] = useState(false)

  async function handleLogout() {
    if (submitting) return
    setSubmitting(true)
    try {
      await api.post('/auth/logout', {})
    } catch (_err) {
      // Best-effort — log out client-side even if the server call fails
      // (e.g. token already expired or network blip).
    } finally {
      try {
        localStorage.removeItem('mep_token')
        localStorage.removeItem('mep_refresh_token')
      } catch (_e) { /* private mode, ignore */ }
      window.location.assign('/login')
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={submitting}
      className={`flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded transition-colors disabled:opacity-50 ${className}`}
      title="Sign out of admin portal"
    >
      <LogOut size={13} />
      {submitting ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
