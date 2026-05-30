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

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// Phase 6-D-2 (Section 109, May 15, 2026): remember-me checkbox.
// Separate localStorage key from the tenant LoginPage so SUPER_ADMIN
// email doesn't appear in the tenant prefill (and vice versa).
const REMEMBER_ADMIN_EMAIL_KEY = 'mep_remember_admin_email'

// Phase 6-D-6.5 / Section 121 — two-step login with TOTP 2FA.
// step === 'pin'    → email + PIN form (initial state)
// step === 'setup'  → first-time enrollment wizard with QR code + 6-digit input
// step === 'verify' → 6-digit code input for already-enrolled users

export default function AdminLogin() {
  const navigate = useNavigate()
  const [step, setStep] = useState('pin')
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [rememberMe, setRememberMe] = useState(false)
  // TOTP state for step 'setup' and 'verify'
  const [pendingToken, setPendingToken] = useState(null)
  const [setupToken, setSetupToken] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [secretBase32, setSecretBase32] = useState(null)
  const [totpCode, setTotpCode] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_ADMIN_EMAIL_KEY)
      if (saved) {
        setEmail(saved)
        setRememberMe(true)
      }
    } catch {
      /* localStorage may be unavailable */
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    // Persist / clear the admin remember-me selection BEFORE the network
    // call (so the toggle reflects the user's most-recent choice even if
    // login fails). Email only — never persist the PIN.
    try {
      if (rememberMe && email) {
        localStorage.setItem(REMEMBER_ADMIN_EMAIL_KEY, email.trim())
      } else {
        localStorage.removeItem(REMEMBER_ADMIN_EMAIL_KEY)
      }
    } catch {
      /* localStorage may be unavailable */
    }

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

      // Phase 6-D-6.5 / Section 121 — TOTP branching. The backend returns
      // 200 with ok:false + a specific error code when TOTP is required.
      // We jump to the second-step UI; the JWT is NOT issued until the
      // 6-digit code verifies.
      if (data && data.ok === false) {
        if (data.error === 'TOTP_SETUP_REQUIRED') {
          setPendingToken(data.totp_pending_token)
          setSetupToken(data.totp_setup_token)
          setQrDataUrl(data.totp_qr_code_data_url)
          setSecretBase32(data.totp_secret_base32)
          setTotpCode('')
          setStep('setup')
          return
        }
        if (data.error === 'TOTP_REQUIRED') {
          setPendingToken(data.totp_pending_token)
          setTotpCode('')
          setStep('verify')
          return
        }
        // Unknown ok:false shape — surface verbatim.
        setError(data.message || data.error || 'Sign-in failed')
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

  // Phase 6-D-6.5 / Section 121 — second-step submit (TOTP code).
  async function handleTotpSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const endpoint = step === 'setup' ? '/api/auth/totp/confirm-setup' : '/api/auth/totp/verify'
      const body = step === 'setup'
        ? { totp_pending_token: pendingToken, totp_setup_token: setupToken, code: totpCode.trim() }
        : { totp_pending_token: pendingToken, code: totpCode.trim() }
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Channel': 'cookie' },
        body: JSON.stringify(body),
      })
      let data = null
      try { data = await res.json() } catch { /* ignore */ }
      if (!res.ok || !data || data.ok !== true) {
        const code = data?.error || `HTTP_${res.status}`
        if (code === 'INVALID_TOTP_CODE') {
          setError('Code rejected — check your Authenticator app and try again.')
        } else if (code === 'EXPIRED_TOTP_PENDING_TOKEN' || code === 'EXPIRED_TOTP_SETUP_TOKEN') {
          setError('Your sign-in attempt expired. Returning to the PIN screen.')
          setStep('pin')
        } else {
          setError(data?.message || code)
        }
        return
      }
      try {
        if (data.token) {
          localStorage.setItem('mep_token', data.token)
          if (data.refresh_token) localStorage.setItem('mep_refresh_token', data.refresh_token)
        } else {
          localStorage.removeItem('mep_token')
          localStorage.removeItem('mep_refresh_token')
        }
      } catch { /* private mode */ }
      navigate('/', { replace: true })
    } catch (networkErr) {
      setError(networkErr.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  function handleCancelTotp() {
    setStep('pin')
    setPendingToken(null)
    setSetupToken(null)
    setQrDataUrl(null)
    setSecretBase32(null)
    setTotpCode('')
    setError(null)
  }

  // ── Step 2/3: TOTP UI ────────────────────────────────────────────────
  if (step === 'setup' || step === 'verify') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-200 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold mb-1">
              {step === 'setup' ? 'Enable two-factor authentication' : 'Two-factor authentication'}
            </h1>
            <p className="text-sm text-slate-400">
              {step === 'setup'
                ? 'Scan the QR code with Google Authenticator / 1Password / Authy.'
                : 'Enter the 6-digit code from your Authenticator app.'}
            </p>
          </div>
          <form
            onSubmit={handleTotpSubmit}
            className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 space-y-4"
            aria-label={step === 'setup' ? 'TOTP setup' : 'TOTP verification'}
          >
            {step === 'setup' && qrDataUrl && (
              <div className="text-center">
                <img
                  src={qrDataUrl}
                  alt="TOTP QR code"
                  className="mx-auto rounded bg-white p-2"
                  style={{ width: 220, height: 220 }}
                />
                {secretBase32 && (
                  <div className="mt-3">
                    <div className="text-xs text-slate-500 mb-1">Manual entry (if scanning fails):</div>
                    <code className="text-xs font-mono text-slate-300 break-all">{secretBase32}</code>
                  </div>
                )}
              </div>
            )}

            <div>
              <label htmlFor="admin-totp-code" className="block text-xs font-medium text-slate-400 mb-1">
                6-digit code
              </label>
              <input
                id="admin-totp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={submitting}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-center tracking-widest text-lg font-mono text-slate-100 focus:outline-none focus:border-slate-500 disabled:opacity-50"
                placeholder="000000"
                autoFocus
              />
            </div>

            {error && (
              <div role="alert" className="p-3 bg-rose-900/30 border border-rose-700/50 rounded text-sm text-rose-200">
                {error}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelTotp}
                disabled={submitting}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || totpCode.length !== 6}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded"
              >
                {submitting ? 'Verifying…' : step === 'setup' ? 'Confirm + sign in' : 'Sign in'}
              </button>
            </div>
          </form>
          <p className="text-center text-xs text-slate-500 mt-6">
            Phase 6-D-6.5 • Two-factor authentication
          </p>
        </div>
      </div>
    )
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

          {/* Phase 6-D-2: remember-me. Admin-only key isolates from
              tenant LoginPage so different emails don't cross-pollute. */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="admin-remember-me"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={submitting}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-400 cursor-pointer disabled:opacity-50"
            />
            <label
              htmlFor="admin-remember-me"
              className="text-xs text-slate-400 cursor-pointer select-none"
            >
              Remember me
            </label>
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
