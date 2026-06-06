// src/admin/AdminIdleGuard.jsx
//
// Section 133.2 (June 4, 2026) — SUPER_ADMIN portal idle auto-logout.
//
// Complements the ephemeral session cookies (§133): the cookies handle
// "browser was closed" (session ends, re-entry forces PIN + TOTP); this
// guard handles "browser left open and unattended". After IDLE_MS of no
// user activity it ends the session — best-effort server-side revoke of the
// refresh token, clear local state, then redirect to /login (which requires
// a fresh PIN + TOTP). Industry-standard pattern for high-privilege portals.
//
// Renders nothing. Mounted once inside <BrowserRouter> in AdminApp. The
// timer is NOT armed on the /login route itself (nothing to log out of).
//
// NOTE: this is a client-side convenience/defense layer for the
// unattended-desk threat. The robust server-side idle + absolute-session-cap
// enforcement is tracked as the §133 follow-up (Security phase).

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../lib/api'

const IDLE_MS = 15 * 60 * 1000 // 15 minutes of inactivity → sign out
const REARM_THROTTLE_MS = 5000 // don't re-arm the timer more than once / 5s
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']

export default function AdminIdleGuard() {
  const { pathname } = useLocation()
  const timerRef = useRef(null)
  const lastResetRef = useRef(0)

  useEffect(() => {
    // No point arming the idle timer on the login screen.
    if (pathname === '/login') return undefined

    async function doLogout() {
      try {
        await api.post('/auth/logout', {})
      } catch {
        /* best-effort — log out client-side even if the revoke call fails */
      }
      try {
        localStorage.removeItem('mep_token')
        localStorage.removeItem('mep_refresh_token')
      } catch {
        /* private mode — ignore */
      }
      // reason=idle lets AdminLogin explain why the user landed here.
      window.location.assign('/login?reason=idle')
    }

    function arm() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(doLogout, IDLE_MS)
    }

    function onActivity() {
      const now = Date.now()
      // Throttle re-arming so a stream of mousemove events doesn't thrash
      // clearTimeout/setTimeout. Worst case idle fires IDLE_MS + 5s after the
      // true last activity — acceptable for a 15-minute window.
      if (now - lastResetRef.current < REARM_THROTTLE_MS) return
      lastResetRef.current = now
      arm()
    }

    arm() // start the clock immediately on mount / route change
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true })
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity)
      }
    }
  }, [pathname])

  return null
}
