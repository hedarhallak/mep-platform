import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { Building2, Lock, Mail, Eye, EyeOff } from 'lucide-react'
import LanguageSwitcher from '@/components/shared/LanguageSwitcher'

// Phase 6-D-2 (Section 109, May 15, 2026): tenant logo + remember-me.
// `window.__BRANDING__` is populated by `lib/branding.js` (Section 99)
// before React mounts. On generic `app.constrai.ca` it's null; on a
// tenant subdomain (e.g., `acm.constrai.ca`) it carries `company_name`
// + `brand_color` + `brand_logo_url`. We render the tenant logo when
// present and fall back to the Constrai default Building2 icon on
// null / load error.
//
// Field name nuance: the column in `companies` is `brand_logo_url`,
// the API returns `brand_logo_url`, and `branding.js` stashes the
// value on `window.__BRANDING__.brand_logo_url`. Use that exact name.
function readTenantLogoUrl() {
  if (typeof window === 'undefined') return null
  const b = window.__BRANDING__
  if (!b || typeof b !== 'object') return null
  const url = typeof b.brand_logo_url === 'string' ? b.brand_logo_url.trim() : ''
  return url || null
}

const REMEMBER_EMAIL_KEY = 'mep_remember_email'

export default function LoginPage() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate  = useNavigate()
  // Section 87 / migration 011: login is now email-based.
  const [form, setForm]       = useState({ email: '', pin: '' })
  const [showPin, setShowPin] = useState(false)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  // Phase 6-D-2: remember-me checkbox. Persists ONLY the email (not the
  // PIN — never store the PIN in localStorage; that defeats the JWT-in-
  // cookie security model). On mount we restore the saved email and
  // pre-check the box.
  const [rememberMe, setRememberMe] = useState(false)
  // Phase 6-D-2: tenant logo state. The URL comes from window.__BRANDING__
  // at module-init time; `logoFailed` flips to true if the <img> onError
  // fires (404, network error, CORS, etc.) so we fall back to the default
  // Constrai icon for the rest of the page lifetime.
  const tenantLogoUrl = readTenantLogoUrl()
  const [logoFailed, setLogoFailed] = useState(false)
  const showTenantLogo = !!tenantLogoUrl && !logoFailed

  useEffect(() => {
    // Restore remembered email on first mount.
    try {
      const saved = localStorage.getItem(REMEMBER_EMAIL_KEY)
      if (saved) {
        setForm((f) => ({ ...f, email: saved }))
        setRememberMe(true)
      }
    } catch {
      /* localStorage may be unavailable — silent fallback */
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    // Persist / clear the remembered email BEFORE the network call so
    // the toggle reflects the user's most-recent choice even if login
    // fails. We only store the email; the PIN never touches localStorage.
    try {
      if (rememberMe && form.email) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, form.email)
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY)
      }
    } catch {
      /* localStorage may be unavailable — silent fallback */
    }
    try {
      const result = await login(form.email, form.pin)
      // Phase 6-D-1b: Pattern B routing. If the backend returned a
      // redirect_url (login came in on app.constrai.ca and the user
      // belongs to a tenant), do a full cross-origin navigation to the
      // tenant subdomain. The Domain=.constrai.ca auth cookies set by
      // /api/auth/login travel with the navigation; the branding
      // bootstrap on the target origin reads /api/companies/<code>/branding
      // and renders the dashboard already styled for the tenant.
      // If redirect_url is null/absent (admin portal, default host, or
      // already at a tenant subdomain), stay in the React Router shell.
      if (result && result.redirect_url) {
        window.location.assign(result.redirect_url)
        return
      }
      navigate('/dashboard')
    } catch (err) {
      const code = err.message
      const known = ['INVALID_CREDENTIALS', 'ACCOUNT_SUSPENDED', 'COMPANY_SUSPENDED']
      setError(known.includes(code) ? t(`login.errors.${code}`) : t('login.errors.LOGIN_FAILED'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>

        <div className="text-center mb-8">
          {showTenantLogo ? (
            <img
              src={tenantLogoUrl}
              alt={t('login.logoAlt')}
              onError={() => setLogoFailed(true)}
              className="inline-block w-14 h-14 rounded-2xl object-contain bg-white p-1.5 mb-4 shadow-md"
            />
          ) : (
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
              <Building2 size={28} className="text-white" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">{t('common.appName')}</h1>
          <p className="text-slate-400 text-sm mt-1">{t('common.appTagline')}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">{t('login.title')}</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                {t('login.email')}
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent"
                  placeholder={t('login.emailPlaceholder')}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                {t('login.pin')}
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPin ? 'text' : 'password'}
                  value={form.pin}
                  onChange={e => setForm(f => ({ ...f, pin: e.target.value }))}
                  className="w-full pl-9 pr-10 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent"
                  placeholder={t('login.pinPlaceholder')}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPin(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPin ? t('login.hidePin') : t('login.showPin')}
                >
                  {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="remember-me"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary-light cursor-pointer"
              />
              <label
                htmlFor="remember-me"
                className="text-xs text-slate-600 cursor-pointer select-none"
              >
                {t('login.rememberMe')}
              </label>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-dark disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              {loading ? t('login.submitLoading') : t('login.submit')}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          {t('common.appName')} © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
