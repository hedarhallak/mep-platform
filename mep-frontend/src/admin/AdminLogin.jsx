// src/admin/AdminLogin.jsx
//
// Phase 5 / 90-E — admin portal sign-in form.
//
// Distinct from the tenant LoginPage in look and feel: dark slate
// background to match the rest of the admin shell, no PWA install
// prompts, no language toggle (admin defaults to English for now —
// 90-D's language switching can move into the admin shell later if
// support agents speak French).
//
// Posts to /api/auth/login (mounted on adminApp via mountPublicRoutes
// in 90-B). The backend's portal gate (90-E) rejects non-SUPER_ADMIN
// roles when Host=admin.constrai.ca with a 403 BLOCKED_PORTAL_LOGIN
// response — this component renders the message inline.
//
// On success, stashes mep_token + mep_refresh_token in localStorage
// (same keys as the tenant flow — localStorage is per-origin so the
// admin storage area doesn't share keys with the tenant storage area;
// using the same key name means the shared lib/api.js works on both
// portals without any portal-aware key picking).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      // Phase 6-D-1c (Section 102): identify as the web channel so the
      // backend uses the cookie shape (no body tokens). credentials:
      // 'include' ensures the browser stores the Set-Cookie response on
      // admin.constrai.ca even though this `fetch` call bypasses
      // lib/api.js.
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Channel': 'cookie',
        },
        body: JSON.stringify({ email: email.trim(), pin }),
      })

      let data = null
      try {
        data = await res.json()
      } catch {
        // ignore non-JSON responses
      }

      if (!res.ok) {
        if (res.status === 403 && data && data.error === 'BLOCKED_PORTAL_LOGIN') {
          setError(
            data.message ||
              'This account does not have access to the admin portal. Sign in at app.constrai.ca instead.'
          )
        } else if (data && data.error) {
          setError(data.message || data.error)
        } else {
          setError(`Sign-in failed (HTTP ${res.status})`)
        }
        return
      }

      // Phase 6-D-1c (Section 102): the web response no longer includes
      // a body `token` — the HttpOnly access_token cookie set by the
      // backend is the source of truth. We only persist to localStorage
      // for the transitional / mobile-shaped response (data.token
      // present). When the response is cookie-only, also CLEAR any
      // stale localStorage tokens left over from an older session so
      // future requests don't attach a stale `Authorization: Bearer`
      // header (which the backend's Bearer-beats-cookie policy would
      // reject as INVALID_TOKEN). Storage unavailability is no longer
      // a fatal error since the cookie path doesn't need it.
      try {
        if (data && data.token) {
          localStorage.setItem('mep_token', data.token)
          if (data.refresh_token) {
            localStorage.setItem('mep_refresh_token', data.refresh_token)
          }
        } else {
          localStorage.removeItem('mep_token')
          localStorage.removeItem('mep_refresh_token')
        }
      } catch {
        // localStorage may be unavailable (private mode in some
        // browsers). The cookie path continues to work for this
        // session and future requests — no need to surface an error.
      }

      // Phase 6-D-1b: defensive — the admin login should never produce a
      // redirect_url (SUPER_ADMIN doesn't redirect to a tenant subdomain),
      // but mirror the LoginPage handling so an unexpected redirect_url
      // doesn't get silently dropped. In practice this branch never fires
      // on admin.constrai.ca.
      if (data.redirect_url) {
        window.location.assign(data.redirect_url)
        return
      }

      navigate('/', { replace: true })
    } catch (networkErr) {
      setError(networkErr.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-200 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-1">Constrai Admin</h1>
          <p className="text-sm text-slate-400">Sign in to the internal portal</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 space-y-4"
          aria-label="Admin sign-in form"
        >
          <div>
            <label htmlFor="admin-email" className="block text-xs font-medium text-slate-400 mb-1">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-500 disabled:opacity-50"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="admin-pin" className="block text-xs font-medium text-slate-400 mb-1">
              PIN
            </label>
            <input
              id="admin-pin"
              type="password"
              autoComplete="current-password"
              required
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-500 disabled:opacity-50"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 bg-rose-900/30 border border-rose-700/50 rounded text-sm text-rose-200"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !email || !pin}
            className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-6">
          Phase 5 / 90-E • Admin login
        </p>
      </div>
    </div>
  )
}
