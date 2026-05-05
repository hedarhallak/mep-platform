// mep-frontend/src/lib/api.js
//
// Section 66 backlog → Section 78 (May 4, 2026): replaced axios (~114 KB raw
// bundle / ~30 KB gzip) with a thin native-fetch wrapper that exposes the
// same axios-shaped interface so the 20 consumer files don't have to change.
//
// API contract preserved:
//   await api.get(url)
//   await api.post(url, body)
//   await api.patch(url, body)
//   await api.put(url, body)
//   await api.delete(url)
//
// Response shape (success): { data, status, ok }
// Error shape (non-2xx): throws err with err.response = { status, data }
//                       — matches existing `err.response?.status` consumer code.
//
// Behaviors preserved from the previous axios setup:
//   1. baseURL '/api' — all paths relative to it.
//   2. Auto-attach `Authorization: Bearer <token>` from localStorage.
//   3. On 401 (except for /auth/login + /auth/refresh), try the refresh
//      token, then retry the original request once. If refresh also fails,
//      clear tokens and redirect to /login.
//   4. Single in-flight refresh: subsequent 401s during a refresh are
//      queued and resolved with the new token.

const BASE_URL = '/api'

// --- Refresh-flight bookkeeping ---------------------------------------
let isRefreshing = false
let failedQueue = []

function processQueue(error, token = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token)
  })
  failedQueue = []
}

// --- Helpers ----------------------------------------------------------
function getToken() {
  try {
    return localStorage.getItem('mep_token')
  } catch {
    return null
  }
}

async function parseBody(res) {
  // Try to parse JSON; fall back to text; fall back to null.
  const ct = res.headers.get('content-type') || ''
  try {
    if (ct.includes('application/json')) return await res.json()
    const text = await res.text()
    return text || null
  } catch {
    return null
  }
}

function shouldAttemptRefresh(res, url) {
  if (res.status !== 401) return false
  if (url.includes('/auth/refresh')) return false
  if (url.includes('/auth/login')) return false
  return true
}

async function refreshTokenOnce() {
  const refreshToken = localStorage.getItem('mep_refresh_token')
  if (!refreshToken) return null

  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })

  if (!res.ok) {
    const err = new Error(`Refresh failed: ${res.status}`)
    err.response = { status: res.status, data: await parseBody(res) }
    throw err
  }

  const data = await res.json()
  if (!data.ok) {
    const err = new Error('Refresh response not ok')
    err.response = { status: 200, data }
    throw err
  }

  localStorage.setItem('mep_token', data.token)
  localStorage.setItem('mep_refresh_token', data.refresh_token)
  return data.token
}

function clearAuthAndRedirect() {
  try {
    localStorage.removeItem('mep_token')
    localStorage.removeItem('mep_refresh_token')
  } catch {
    // ignore — localStorage might be unavailable
  }
  // window may not exist in test envs; guard.
  if (typeof window !== 'undefined' && window.location) {
    window.location.href = '/login'
  }
}

// --- Core request -----------------------------------------------------
async function apiFetch(method, url, body, options = {}) {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`

  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const init = { method, headers }
  if (body !== undefined && body !== null) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(fullUrl, init)
  } catch (networkErr) {
    // Mimic axios shape — wrap network errors.
    const err = new Error(networkErr.message || 'Network error')
    err.request = init
    err.response = undefined
    throw err
  }

  // Happy path
  if (res.ok) {
    return { data: await parseBody(res), status: res.status, ok: true }
  }

  // 401 → try refresh, then retry the original request once
  if (shouldAttemptRefresh(res, fullUrl) && !options._retry) {
    if (isRefreshing) {
      // Queue this request until the in-flight refresh resolves
      const newToken = await new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      })
      const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` }
      return apiFetch(method, url, body, { ...options, _retry: true, headers: retryHeaders })
    }

    isRefreshing = true
    try {
      const newToken = await refreshTokenOnce()
      if (!newToken) {
        clearAuthAndRedirect()
        const err = new Error('No refresh token')
        err.response = { status: 401, data: null }
        throw err
      }
      processQueue(null, newToken)
      const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` }
      return apiFetch(method, url, body, { ...options, _retry: true, headers: retryHeaders })
    } catch (refreshErr) {
      processQueue(refreshErr, null)
      clearAuthAndRedirect()
      throw refreshErr
    } finally {
      isRefreshing = false
    }
  }

  // Non-401 error (or refresh already failed) → throw with axios-shaped err
  const err = new Error(`HTTP ${res.status}`)
  err.response = { status: res.status, data: await parseBody(res) }
  throw err
}

// --- Public API (axios-shaped) ---------------------------------------
const api = {
  get: (url, options) => apiFetch('GET', url, undefined, options),
  post: (url, body, options) => apiFetch('POST', url, body, options),
  put: (url, body, options) => apiFetch('PUT', url, body, options),
  patch: (url, body, options) => apiFetch('PATCH', url, body, options),
  delete: (url, options) => apiFetch('DELETE', url, undefined, options),
}

export default api
