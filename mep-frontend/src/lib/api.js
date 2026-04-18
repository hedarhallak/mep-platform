import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Flag to prevent multiple refresh attempts at once
let isRefreshing = false
let failedQueue = []

function processQueue(error, token = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token)
  })
  failedQueue = []
}

// Auto-attach token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('mep_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 → try refresh token, then redirect to login
api.interceptors.response.use(
  res => res,
  async err => {
    const originalRequest = err.config

    // If 401 and not already retrying and not a refresh/login request
    if (
      err.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/login')
    ) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      const refreshToken = localStorage.getItem('mep_refresh_token')

      if (refreshToken) {
        try {
          const res = await axios.post('/api/auth/refresh', { refresh_token: refreshToken })

          if (res.data.ok) {
            localStorage.setItem('mep_token', res.data.token)
            localStorage.setItem('mep_refresh_token', res.data.refresh_token)

            api.defaults.headers.Authorization = `Bearer ${res.data.token}`
            originalRequest.headers.Authorization = `Bearer ${res.data.token}`

            processQueue(null, res.data.token)
            return api(originalRequest)
          }
        } catch (refreshErr) {
          processQueue(refreshErr, null)
          // Refresh failed — clear everything and redirect
          localStorage.removeItem('mep_token')
          localStorage.removeItem('mep_refresh_token')
          window.location.href = '/login'
          return Promise.reject(refreshErr)
        } finally {
          isRefreshing = false
        }
      }

      // No refresh token — redirect to login
      localStorage.removeItem('mep_token')
      localStorage.removeItem('mep_refresh_token')
      window.location.href = '/login'
    }

    return Promise.reject(err)
  }
)

export default api
