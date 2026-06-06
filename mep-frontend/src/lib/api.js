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
  // Section 106 (May 15, 2026): /auth/whoami is itself the "am I logged in?"
  // query. A 401 from it IS the answer — "no". Don't trigger refresh-then-retry
  // because if there's no valid session at all, the refresh will also 401, the
  // catch path will redirect to /login, and the /login page's AuthProvider
  // will re-fire /whoami → loop. Treat /whoami 401 as a terminal state; the
  // caller (useAuth) handles it by setting user=null + loading=false.
  if (url.includes('/auth/whoami')) return false
  return true
}

async function refreshTokenOnce() {
  // Phase 6-D-1b: send cookies via credentials:'include' so the backend
  // can fall back to the refresh_token HttpOnly cookie when localStorage
  // is empty (e.g., right after a cross-subdomain redirect where
  // localStorage doesn't follow the origin change). Backend cookie path
  // wins inside /api/auth/refresh when both arrive.
  //
  // Phase 6-D-1c: identify as a web client via X-Auth-Channel so the
  // backend omits body tokens. The fresh access_token rides in the new
  // Set-Cookie header (rotated by the backend alongside the refresh
  // token); no client-side localStorage write is needed for the cookie
  // path. The legacy localStorage writes are kept ONLY for the
  // transitional case where the backend returns body tokens (older
  // server build) — guarded with truthy checks so `undefined` never
  // gets serialised into localStorage.
  const refreshToken = localStorage.getItem('mep_refresh_token')

  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Channel': 'cookie',
    },
    body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
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

  // Phase 6-D-1c: body tokens are absent for web responses — the rotated
  // access_token cookie has already been Set-Cookie'd by the backend.
  // The retry path in apiFetch will resend with `credentials: 'include'`
  // and the browser will attach the new cookie automatically; no Bearer
  // header needs rebuilding. Returns the body token if present (legacy /
  // mobile-shaped response) or `null` for the cookie-only response —
  // apiFetch interprets `null` as "refresh succeeded, retry without
  // mutating Authorization header".
  //
  // When the response is cookie-only, also CLEAR any stale localStorage
  // tokens left over from a pre-6-D-1c session. Without this cleanup the
  // next apiFetch would call getToken(), find the stale value, attach
  // `Authorization: Bearer <stale>`, and the backend's Bearer-beats-cookie
  // policy in middleware/auth.js would return 401 INVALID_TOKEN —
  // triggering a fresh refresh-retry loop that never terminates.
  if (data.token) {
    localStorage.setItem('mep_token', data.token)
  } else {
    try { localStorage.removeItem('mep_token') } catch { /* ignore */ }
  }
  if (data.refresh_token) {
    localStorage.setItem('mep_refresh_token', data.refresh_token)
  } else {
    try { localStorage.removeItem('mep_refresh_token') } catch { /* ignore */ }
  }
  return data.token || null
}

function clearAuthAndRedirect(reason) {
  try {
    localStorage.removeItem('mep_token')
    localStorage.removeItem('mep_refresh_token')
  } catch {
    // ignore — localStorage might be unavailable
  }
  // window may not exist in test envs; guard.
  if (typeof window !== 'undefined' && window.location) {
    // Section 106 (May 15, 2026): belt-and-suspenders safety. If the
    // user is ALREADY on a login screen, don't redirect to /login —
    // that would reload the page, re-fire useAuth.useEffect → /whoami
    // → 401 → refresh → 401 → clearAuthAndRedirect → infinite loop.
    // The /whoami exclusion in shouldAttemptRefresh already prevents
    // this for the initial mount, but other 401s (e.g., from a
    // protected endpoint hit by a stale button) could still trip it.
    const path = window.location.pathname || ''
    const onLoginScreen = path === '/login' || path.startsWith('/login/') || path === '/admin/login' || path.startsWith('/admin/login/')
    if (!onLoginScreen) {
      window.location.href = reason ? `/login?reason=${encodeURIComponent(reason)}` : '/login'
    }
  }
}

// --- Core request -----------------------------------------------------
async function apiFetch(method, url, body, options = {}) {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`

  // Phase 6-D-1c: identify this client as the web/cookie channel. The
  // backend uses this to decide whether to echo tokens in the response
  // body (mobile: yes; web: no — cookies travel the auth state). The
  // header is set BEFORE options.headers merges so a caller can override
  // it deliberately if needed (e.g., to test the mobile-shaped response).
  const headers = {
    'Content-Type': 'application/json',
    'X-Auth-Channel': 'cookie',
    ...(options.headers || {}),
  }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const init = {
    method,
    headers,
    // Phase 6-D-1b: include cookies on every request. Same-origin auth
    // flows (app.constrai.ca → /api/...) pick up the access_token cookie
    // even without an Authorization header. Cross-subdomain navigations
    // (acm.constrai.ca after redirect from app.constrai.ca) rely on the
    // Domain=.constrai.ca cookie set by Phase 6-D-1a.
    credentials: 'include',
  }
  if (body !== undefined && body !== null) {
    // Section 129.6: FormData bodies must pass through untouched — the
    // browser sets Content-Type to multipart/form-data WITH the boundary.
    // JSON.stringify(FormData) silently produces '{}' and any manually
    // set 'multipart/form-data' header lacks the boundary, so busboy
    // fails with "Boundary not found" (surfaced as UPLOAD_FAILED).
    // Before this fix, upload callers had to bypass lib/api with raw
    // fetch (see the old note in CompanyBranding.jsx).
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      delete headers['Content-Type']
      init.body = body
    } else {
      init.body = typeof body === 'string' ? body : JSON.stringify(body)
    }
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
      // Queue this request until the in-flight refresh resolves. The
      // queue resolves with the new Bearer token OR null (Phase 6-D-1c
      // cookie path — refresh succeeded but no body token, the rotated
      // access_token cookie is already on the document).
      const newToken = await new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      })
      const retryHeaders = { ...headers }
      if (newToken) {
        retryHeaders.Authorization = `Bearer ${newToken}`
      } else {
        delete retryHeaders.Authorization
      }
      return apiFetch(method, url, body, { ...options, _retry: true, headers: retryHeaders })
    }

    isRefreshing = true
    try {
      // refreshTokenOnce returns:
      //   - string: new Bearer token (legacy / mobile-shaped response).
      //     Use it on the retry's Authorization header.
      //   - null: refresh succeeded via cookies; no Bearer token to add.
      //     Retry WITHOUT an Authorization header — the browser will send
      //     the rotated access_token cookie.
      //   - throws: refresh failed → clear local state + redirect to /login.
      const newToken = await refreshTokenOnce()
      processQueue(null, newToken)
      const retryHeaders = { ...headers }
      if (newToken) {
        retryHeaders.Authorization = `Bearer ${newToken}`
      } else {
        delete retryHeaders.Authorization
      }
      return apiFetch(method, url, body, { ...options, _retry: true, headers: retryHeaders })
    } catch (refreshErr) {
      processQueue(refreshErr, null)
      // §133: a server-side SUPER_ADMIN session cap explains WHY the session
      // ended — surface it on the login screen so the admin isn't confused.
      const code = refreshErr?.response?.data?.error
      const reason =
        code === 'SESSION_IDLE_TIMEOUT'
          ? 'idle'
          : code === 'SESSION_ABSOLUTE_TIMEOUT'
            ? 'expired'
            : null
      clearAuthAndRedirect(reason)
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
