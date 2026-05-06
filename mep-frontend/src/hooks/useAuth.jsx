import { createContext, useContext, useState, useEffect } from 'react'
import api from '@/lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('mep_token')
    if (!token) { setLoading(false); return }

    api.get('/auth/whoami')
      .then(res => { if (res.data.ok) setUser(res.data.user) })
      .catch(() => {
        localStorage.removeItem('mep_token')
        localStorage.removeItem('mep_refresh_token')
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
