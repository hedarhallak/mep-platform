import { createContext, useContext, useState, useEffect } from 'react'
import api from '@/lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Phase 6-D-1b: drop the localStorage-presence short-circuit. Even
    // without a localStorage token, an HttpOnly access_token cookie may
    // carry valid auth (e.g., right after a cross-subdomain redirect
    // from app.constrai.ca to acm.constrai.ca, where localStorage is
    // per-origin but the Domain=.constrai.ca cookie travels). Always
    // ask /whoami; the backend treats Bearer and cookie equivalently
    // (Phase 6-D-1a + Phase 6-D-1b backend cookie fallback). A 401 means
    // "not logged in" and we render the login screen, same as before.
    api.get('/auth/whoami')
      .then(res => { if (res.data?.ok) setUser(res.data.user) })
      .catch(() => {
        // Stale localStorage from a Phase 6-D-1a / earlier session — clean
        // it up so it doesn't keep advertising a session that no longer
        // exists. Best-effort; ignore if storage is unavailable.
        try {
          localStorage.removeItem('mep_token')
          localStorage.removeItem('mep_refresh_token')
        } catch {
          /* ignore */
        }
      })
      .finally(() => setLoading(false))
  }, [])

  // Section 87 / migration 011: login is now email-based for the Model C
  // single-domain architecture. Backend still accepts `username` as a legacy
  // fallback, but the frontend always sends `email`.
  const login = async (email, pin) => {
    const res = await api.post('/auth/login', { email, pin })
    if (res.data.ok) {
      localStorage.setItem('mep_token', res.data.token)
      if (res.data.refresh_token) {
        localStorage.setItem('mep_refresh_token', res.data.refresh_token)
      }
      setUser(res.data.user)
      return res.data
    }
    throw new Error(res.data.error)
  }

  const logout = async () => {
    try {
      const refreshToken = localStorage.getItem('mep_refresh_token')
      await api.post('/auth/logout', { refresh_token: refreshToken })
    } catch {
      // Best effort — continue with local cleanup
    }
    localStorage.removeItem('mep_token')
    localStorage.removeItem('mep_refresh_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
