import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { Building2, Lock, User, Eye, EyeOff } from 'lucide-react'
import LanguageSwitcher from '@/components/shared/LanguageSwitcher'

export default function LoginPage() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [form, setForm]       = useState({ username: '', pin: '' })
  const [showPin, setShowPin] = useState(false)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.username, form.pin)
      navigate('/dashboard')
    } catch (err) {
      // Map backend error codes to translated strings; fall back to generic.
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
        {/* Language switcher — top-right */}
        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
            <Building2 size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">{t('common.appName')}</h1>
          <p className="text-slate-400 text-sm mt-1">{t('common.appTagline')}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">{t('login.title')}</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                {t('login.username')}
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent"
                  placeholder={t('login.usernamePlaceholder')}
                  required
                />
              </div>
            </div>

            {/* PIN */}
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

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
                {error}
              </div>
            )}

            {/* Submit */}
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
