import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import api from '@/lib/api'
import {
  User, Phone, MapPin, Mail, Shield, Wrench, Users, Settings,
  AlertCircle, CheckCircle, Loader2, Save, Lock, Eye, EyeOff
} from 'lucide-react'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoiaGVkYXJoYWxsYWs3NiIsImEiOiJjbWxsenc1ZmkwY3JyM2RxOGpya2N0bDl0In0.fivZACTIk6dgF79Uw6-8iQ'

// ── Address autocomplete ──
function AddressInput({ value, onChange, onCoords, placeholder }) {
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const timer = useRef(null)

  const search = useCallback(async (q) => {
    if (q.length < 3) { setSuggestions([]); return }
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&country=ca,us&types=address&limit=5`
      )
      const data = await res.json()
      setSuggestions(data.features || [])
    } catch { setSuggestions([]) }
  }, [])

  return (
    <div className="relative">
      <div className="relative">
        <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" value={value}
          onChange={e => {
            onChange(e.target.value)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => search(e.target.value), 400)
            setOpen(true)
          }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onFocus={() => suggestions.length && setOpen(true)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder={placeholder}
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-auto">
          {suggestions.map((f, i) => (
            <li key={i} onMouseDown={() => {
              onChange(f.place_name)
              onCoords({ lng: f.center[0], lat: f.center[1] })
              setSuggestions([]); setOpen(false)
            }}
              className="px-4 py-2.5 text-sm hover:bg-primary-pale cursor-pointer flex items-start gap-2 border-b border-slate-50 last:border-0">
              <MapPin size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <span>{f.place_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ProfilePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const qc = useQueryClient()

  const { data: profileData, isLoading } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => api.get('/profile/me').then(r => r.data),
  })

  const profile = profileData?.profile
  const isAdmin = profileData?.is_admin === true

  const { data: dropdowns } = useQuery({
    queryKey: ['profile-dropdowns'],
    queryFn: () => api.get('/profile/dropdowns').then(r => r.data),
  })

  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [showPinSection, setShowPinSection] = useState(false)
  const [pinForm, setPinForm] = useState({ current: '', new_pin: '', confirm: '' })
  const [showPin, setShowPin] = useState(false)
  const [pinError, setPinError] = useState('')
  const [pinSuccess, setPinSuccess] = useState(false)

  // Initialize form when profile loads
  if (profile && !form) {
    setForm({
      trade_code:          profile.trade_code || '',
      rank_code:           profile.rank_code || '',
      phone:               profile.phone || '',
      home_address:        profile.home_address || '',
      home_unit:           profile.home_unit || '',
      city:                profile.city || '',
      postal_code:         profile.postal_code || '',
      emergency_contact_name:         profile.emergency_contact_name || '',
      emergency_contact_phone:        profile.emergency_contact_phone || '',
      emergency_contact_relationship: profile.emergency_contact_relationship || '',
      home_lat: null,
      home_lng: null,
    })
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const saveMutation = useMutation({
    mutationFn: data => api.post('/profile', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-profile'] })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    },
    onError: (err) => {
      setError(err.response?.data?.error || t('profile.errors.saveFailed'))
    }
  })

  const pinMutation = useMutation({
    mutationFn: data => api.post('/auth/change-pin', data),
    onSuccess: () => {
      setPinSuccess(true)
      setPinForm({ current: '', new_pin: '', confirm: '' })
      setTimeout(() => { setPinSuccess(false); setShowPinSection(false) }, 3000)
    },
    onError: (err) => {
      setPinError(err.response?.data?.error || t('profile.errors.pinChangeFailed'))
    }
  })

  const handleSave = () => {
    setError('')
    if (!form.trade_code) return setError(t('profile.errors.tradeRequired'))
    if (!form.rank_code) return setError(t('profile.errors.levelRequired'))
    if (!form.phone) return setError(t('profile.errors.phoneRequired'))
    if (!form.home_address) return setError(t('profile.errors.addressRequired'))
    if (!form.city) return setError(t('profile.errors.cityRequired'))
    if (!form.postal_code) return setError(t('profile.errors.postalCodeRequired'))
    saveMutation.mutate(form)
  }

  const handleChangePin = () => {
    setPinError('')
    if (!pinForm.current) return setPinError(t('profile.errors.currentPinRequired'))
    if (!pinForm.new_pin) return setPinError(t('profile.errors.newPinRequired'))
    if (pinForm.new_pin.length < 4) return setPinError(t('profile.errors.pinTooShort'))
    if (pinForm.new_pin !== pinForm.confirm) return setPinError(t('profile.errors.pinsMismatch'))
    pinMutation.mutate({ current_pin: pinForm.current, new_pin: pinForm.new_pin })
  }

  if (isLoading) return (
    <div className="p-8 flex items-center justify-center">
      <Loader2 size={24} className="animate-spin text-primary-light" />
    </div>
  )

  const trades = dropdowns?.trades || []
  const ranks = dropdowns?.ranks || []

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">{t('profile.title')}</h1>
      <p className="text-slate-500 text-sm mb-8">
        {profile?.first_name} {profile?.last_name}
        {user?.role && <span className="ml-2 text-xs bg-primary-pale text-primary-dark px-2 py-0.5 rounded-md font-medium">{user.role.replace(/_/g, ' ')}</span>}
      </p>

      {/* Incomplete profile banner for employees */}
      {!isAdmin && profileData && !profileData.exists && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800 mb-1">{t('profile.incompleteBanner.title')}</p>
              <p className="text-sm text-amber-700">{t('profile.incompleteBanner.body')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Admin profile — no employee record */}
      {isAdmin && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Settings size={15} /> {t('profile.admin.accountInfo')}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{t('profile.admin.username')}</label>
                <div className="text-sm font-medium text-slate-800">{user?.username || '—'}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{t('profile.admin.role')}</label>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-pale text-primary-dark px-2.5 py-1 rounded-md">
                  <Shield size={12} />
                  {(user?.role || 'Admin').replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <Users size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800 mb-1">{t('profile.admin.adminAccountTitle')}</p>
                <p className="text-sm text-amber-700">
                  {t('profile.admin.adminAccountBody', { employeesLink: t('profile.admin.employees') })}{' '}
                  <a href="/employees" className="font-medium underline hover:text-amber-900">→</a>
                </p>
              </div>
            </div>
          </div>

          {/* Change PIN section for admin */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <button onClick={() => setShowPinSection(s => !s)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Lock size={15} /> {t('profile.pinSection.heading')}
            </button>
            {showPinSection && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('profile.pinSection.currentPin')}</label>
                  <div className="relative">
                    <input type={showPin ? 'text' : 'password'} value={pinForm.current}
                      onChange={e => setPinForm(f => ({ ...f, current: e.target.value }))}
                      className="w-full px-3 pr-10 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light" />
                    <button type="button" onClick={() => setShowPin(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('profile.pinSection.newPin')}</label>
                    <input type={showPin ? 'text' : 'password'} value={pinForm.new_pin}
                      onChange={e => setPinForm(f => ({ ...f, new_pin: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('profile.pinSection.confirmNewPin')}</label>
                    <input type={showPin ? 'text' : 'password'} value={pinForm.confirm}
                      onChange={e => setPinForm(f => ({ ...f, confirm: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light" />
                  </div>
                </div>
                {pinError && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
                    <AlertCircle size={14} />{pinError}
                  </div>
                )}
                {pinSuccess && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-2.5">
                    <CheckCircle size={14} />{t('profile.success.pinChanged')}
                  </div>
                )}
                <button onClick={handleChangePin} disabled={pinMutation.isPending}
                  className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white font-medium py-2.5 px-4 rounded-lg text-sm flex items-center gap-2">
                  {pinMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                  {t('profile.pinSection.updateButton')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {form && !isAdmin && (
        <div className="space-y-6">
          {/* Trade & Level */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Wrench size={15} /> {t('profile.tradeInfo.heading')}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('profile.tradeInfo.trade')}</label>
                <select value={form.trade_code} onChange={e => set('trade_code', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light">
                  <option value="">{t('profile.tradeInfo.selectTrade')}</option>
                  {trades.map(tt => <option key={tt.code} value={tt.code}>{tt.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('profile.tradeInfo.level')}</label>
                <select value={form.rank_code} onChange={e => set('rank_code', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light">
                  <option value="">{t('profile.tradeInfo.selectLevel')}</option>
                  {ranks.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Phone size={15} /> {t('profile.contact.heading')}
            </h2>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('profile.contact.phone')}</label>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light"
                placeholder={t('profile.contact.phonePlaceholder')} />
            </div>
          </div>

          {/* Address */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <MapPin size={15} /> {t('profile.address.heading')}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('profile.address.street')}</label>
                <AddressInput value={form.home_address}
                  onChange={v => set('home_address', v)}
                  onCoords={c => { set('home_lat', c.lat); set('home_lng', c.lng) }}
                  placeholder={t('profile.addressPlaceholder')} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('profile.address.unit')}</label>
                  <input type="text" value={form.home_unit} onChange={e => set('home_unit', e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('profile.address.city')}</label>
                  <input type="text" value={form.city} onChange={e => set('city', e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('profile.address.postalCode')}</label>
                  <input type="text" value={form.postal_code} onChange={e => set('postal_code', e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light"
                    placeholder={t('profile.address.postalCodePlaceholder')} />
                </div>
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Shield size={15} /> {t('profile.emergency.heading')}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('profile.emergency.name')}</label>
                <input type="text" value={form.emergency_contact_name} onChange={e => set('emergency_contact_name', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('profile.emergency.phone')}</label>
                <input type="tel" value={form.emergency_contact_phone} onChange={e => set('emergency_contact_phone', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('profile.emergency.relationship')}</label>
                <input type="text" value={form.emergency_contact_relationship} onChange={e => set('emergency_contact_relationship', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light"
                  placeholder={t('profile.emergency.relationshipPlaceholder')} />
              </div>
            </div>
          </div>

          {/* Error / Success */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
              <AlertCircle size={14} />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-2.5">
              <CheckCircle size={14} />{t('profile.success.profileUpdated')}
            </div>
          )}

          {/* Save */}
          <button onClick={handleSave} disabled={saveMutation.isPending}
            className="w-full bg-primary hover:bg-primary-dark disabled:opacity-60 text-white font-semibold py-3 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors">
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {t('profile.save')}
          </button>

          {/* Change PIN section */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <button onClick={() => setShowPinSection(s => !s)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Lock size={15} /> {t('profile.pinSection.heading')}
            </button>
            {showPinSection && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('profile.pinSection.currentPin')}</label>
                  <div className="relative">
                    <input type={showPin ? 'text' : 'password'} value={pinForm.current}
                      onChange={e => setPinForm(f => ({ ...f, current: e.target.value }))}
                      className="w-full px-3 pr-10 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light" />
                    <button type="button" onClick={() => setShowPin(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('profile.pinSection.newPin')}</label>
                    <input type={showPin ? 'text' : 'password'} value={pinForm.new_pin}
                      onChange={e => setPinForm(f => ({ ...f, new_pin: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('profile.pinSection.confirmNewPin')}</label>
                    <input type={showPin ? 'text' : 'password'} value={pinForm.confirm}
                      onChange={e => setPinForm(f => ({ ...f, confirm: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light" />
                  </div>
                </div>
                {pinError && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
                    <AlertCircle size={14} />{pinError}
                  </div>
                )}
                {pinSuccess && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-2.5">
                    <CheckCircle size={14} />{t('profile.success.pinChanged')}
                  </div>
                )}
                <button onClick={handleChangePin} disabled={pinMutation.isPending}
                  className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white font-medium py-2.5 px-4 rounded-lg text-sm flex items-center gap-2">
                  {pinMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                  {t('profile.pinSection.updateButton')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
