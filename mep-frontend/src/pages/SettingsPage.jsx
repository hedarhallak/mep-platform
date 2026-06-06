import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { Settings as SettingsIcon, Clock, Phone, Mail, MapPin, Check, Loader2, AlertCircle } from 'lucide-react'

// Section 134.4 — tenant company Settings. Replaces the old "Coming soon"
// placeholder. Reads /api/company/settings; lets a settings.company holder
// edit the self-serviceable fields (default shift times + contact). Company
// name / code / plan are Constrai-managed → shown read-only.

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export default function SettingsPage() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState(null)
  const [form, setForm] = useState({
    default_shift_start: '', default_shift_end: '', phone: '', procurement_email: '', address: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    api.get('/company/settings')
      .then(r => {
        const s = r.data.settings
        setSettings(s)
        setForm({
          default_shift_start: s.default_shift_start || '',
          default_shift_end: s.default_shift_end || '',
          phone: s.phone || '',
          procurement_email: s.procurement_email || '',
          address: s.address || '',
        })
      })
      .catch(e => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false))
  }, [])

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setSuccess(false) }

  const handleSave = async () => {
    setError(''); setSuccess(false)
    if (form.default_shift_start && !TIME_RE.test(form.default_shift_start)) return setError(t('settings.errors.shiftStart'))
    if (form.default_shift_end && !TIME_RE.test(form.default_shift_end)) return setError(t('settings.errors.shiftEnd'))
    setSaving(true)
    try {
      const r = await api.patch('/company/settings', form)
      setSettings(r.data.settings)
      setSuccess(true)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />{t('settings.loading')}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary-pale flex items-center justify-center">
          <SettingsIcon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t('settings.title')}</h1>
          <p className="text-xs text-slate-400">{settings?.name}</p>
        </div>
      </div>

      {/* Read-only company identity (Constrai-managed) */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: t('settings.company'), value: settings?.name },
          { label: t('settings.code'), value: settings?.company_code },
          { label: t('settings.plan'), value: settings?.plan },
        ].map((f, i) => (
          <div key={i} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{f.label}</div>
            <div className="text-sm font-semibold text-slate-700 truncate">{f.value || '—'}</div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-semibold">
          <Check className="w-4 h-4" />{t('settings.saved')}
        </div>
      )}

      <div className="space-y-5">
        {/* Default shift */}
        <div>
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            <Clock className="w-3 h-3" />{t('settings.defaultShift')}
          </label>
          <div className="flex items-center gap-2 max-w-xs">
            <input type="time" value={form.default_shift_start} onChange={e => set('default_shift_start', e.target.value)}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light" />
            <span className="text-slate-400 text-sm">→</span>
            <input type="time" value={form.default_shift_end} onChange={e => set('default_shift_end', e.target.value)}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light" />
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{t('settings.defaultShiftHint')}</p>
        </div>

        {/* Phone */}
        <div>
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            <Phone className="w-3 h-3" />{t('settings.phone')}
          </label>
          <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
            className="w-full max-w-sm px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light" />
        </div>

        {/* Procurement email */}
        <div>
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            <Mail className="w-3 h-3" />{t('settings.procurementEmail')}
          </label>
          <input type="email" value={form.procurement_email} onChange={e => set('procurement_email', e.target.value)}
            className="w-full max-w-sm px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light" />
        </div>

        {/* Address */}
        <div>
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            <MapPin className="w-3 h-3" />{t('settings.address')}
          </label>
          <textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2}
            className="w-full max-w-sm px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light resize-none" />
        </div>

        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {t('settings.save')}
        </button>
      </div>
    </div>
  )
}
