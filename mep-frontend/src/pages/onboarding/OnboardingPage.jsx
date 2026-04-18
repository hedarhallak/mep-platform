import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import {
  Building2, User, Lock, MapPin, Phone,
  CheckCircle, AlertCircle, Loader2, Eye, EyeOff,
  ChevronRight, ChevronLeft
} from 'lucide-react'

const MAPBOX_TOKEN = 'pk.eyJ1IjoiaGVkYXJoYWxsYWs3NiIsImEiOiJjbWxsenc1ZmkwY3JyM2RxOGpya2N0bDl0In0.fivZACTIk6dgF79Uw6-8iQ'

// ── Step indicator ────────────────────────────────────────────
function StepBar({ current, total }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
            i < current ? 'bg-primary text-white'
            : i === current ? 'bg-primary text-white ring-4 ring-primary-pale'
            : 'bg-slate-100 text-slate-400'
          }`}>
            {i < current ? <CheckCircle size={16} /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`h-0.5 w-12 transition-all ${i < current ? 'bg-primary' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Address autocomplete ──────────────────────────────────────
function AddressInput({ value, onChange, onCoords }) {
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
        <input
          type="text" value={value}
          onChange={e => {
            onChange(e.target.value)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => search(e.target.value), 400)
            setOpen(true)
          }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onFocus={() => suggestions.length && setOpen(true)}
          className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Start typing your home address..."
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-auto">
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

// ── Main Onboarding Page ──────────────────────────────────────
export default function OnboardingPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [step, setStep]       = useState(0) // 0=verify, 1=credentials, 2=profile, 3=done
  const [invite, setInvite]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPin, setShowPin] = useState(false)

  const [form, setForm] = useState({
    username: '',
    pin: '',
    pin_confirm: '',
    phone: '',
    home_address: '',
    home_lat: null,
    home_lng: null,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Verify token on load
  useEffect(() => {
    if (!token) { setError('Invalid invitation link'); setLoading(false); return }
    api.get(`/onboarding/verify?token=${token}`)
      .then(r => {
        if (r.data.ok) { setInvite(r.data.invite); setStep(1) }
        else setError(r.data.error === 'TOKEN_EXPIRED' ? 'This invitation link has expired.' : 'Invalid invitation link.')
      })
      .catch(() => setError('Invalid or expired invitation link.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleCredentials = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.username.trim()) return setError('Username is required')
    if (form.username.length < 3) return setError('Username must be at least 3 characters')
    if (!form.pin.trim()) return setError('PIN is required')
    if (form.pin.length < 4) return setError('PIN must be at least 4 characters')
    if (form.pin !== form.pin_confirm) return setError('PINs do not match')
    setStep(2)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.home_address) return setError('Home address is required for assignment matching')
    setSubmitting(true)
    try {
      const res = await api.post('/onboarding/complete', {
        token,
        username:     form.username,
        pin:          form.pin,
        phone:        form.phone,
        home_address: form.home_address,
        home_lat:     form.home_lat,
        home_lng:     form.home_lng,
      })
      if (res.data.ok) setStep(3)
      else setError(res.data.error === 'USERNAME_TAKEN' ? 'Username already taken, choose another.' : res.data.error)
    } catch (err) {
      setError(err.response?.data?.error === 'USERNAME_TAKEN'
        ? 'Username already taken, choose another.'
        : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading ───────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 size={32} className="animate-spin text-primary-light" />
    </div>
  )

  // ── Error (invalid token) ─────────────────────────────────
  if (error && !invite) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={28} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Link Invalid</h2>
        <p className="text-slate-500 text-sm">{error}</p>
        <p className="text-slate-400 text-xs mt-4">Please contact your administrator for a new invitation.</p>
      </div>
    </div>
  )

  // ── Done ──────────────────────────────────────────────────
  if (step === 3) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-sm w-full text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle size={32} className="text-emerald-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">You're all set! 🎉</h2>
        <p className="text-slate-500 text-sm mb-6">
          Your account is ready. Sign in with your username and PIN to get started.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-xl transition-colors"
        >
          Go to Sign In
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
            <Building2 size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">MEP Platform</h1>
          <p className="text-slate-400 text-sm mt-1">Account Setup</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Welcome */}
          {invite && (
            <div className="mb-6 pb-5 border-b border-slate-100">
              <p className="text-slate-500 text-xs uppercase tracking-wide font-semibold mb-1">Welcome</p>
              <h2 className="text-lg font-bold text-slate-800">
                {invite.first_name} {invite.last_name}
              </h2>
              <div className="flex items-center gap-3 mt-2">
                {invite.trade_name && (
                  <span className="text-xs bg-primary-pale text-primary-dark border border-primary-pale px-2 py-0.5 rounded-md font-medium">
                    {invite.trade_name}
                  </span>
                )}
                <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md font-medium">
                  {invite.role?.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          )}

          {/* Step bar */}
          <StepBar current={step - 1} total={2} />

          {/* ── Step 1: Credentials ── */}
          {step === 1 && (
            <form onSubmit={handleCredentials} className="space-y-4">
              <div>
                <p className="font-semibold text-slate-800 mb-1">Choose your credentials</p>
                <p className="text-sm text-slate-500 mb-5">You'll use these to sign in every day.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Username</label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={form.username}
                    onChange={e => set('username', e.target.value.toLowerCase().replace(/\s/g, ''))}
                    className="w-full pl-9 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Choose a username" autoFocus />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">PIN</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type={showPin ? 'text' : 'password'} value={form.pin}
                    onChange={e => set('pin', e.target.value)}
                    className="w-full pl-9 pr-10 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Choose a secure PIN" />
                  <button type="button" onClick={() => setShowPin(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Confirm PIN</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type={showPin ? 'text' : 'password'} value={form.pin_confirm}
                    onChange={e => set('pin_confirm', e.target.value)}
                    className="w-full pl-9 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Confirm your PIN" />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5">
                  <AlertCircle size={14} />{error}
                </div>
              )}

              <button type="submit"
                className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                Continue <ChevronRight size={16} />
              </button>
            </form>
          )}

          {/* ── Step 2: Profile ── */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <p className="font-semibold text-slate-800 mb-1">Your profile</p>
                <p className="text-sm text-slate-500 mb-5">
                  Your home address helps us assign you to the closest projects.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  <Phone size={11} className="inline mr-1" />Phone Number
                </label>
                <input type="tel" value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="+1 514 000 0000" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  <MapPin size={11} className="inline mr-1" />Home Address *
                </label>
                <AddressInput
                  value={form.home_address}
                  onChange={v => set('home_address', v)}
                  onCoords={c => { set('home_lat', c.lat); set('home_lng', c.lng) }}
                />
                {form.home_lat && (
                  <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                    <CheckCircle size={11} /> Location confirmed
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-1.5">
                  Used only for smart assignment matching — never shared publicly.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5">
                  <AlertCircle size={14} />{error}
                </div>
              )}

              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(1)}
                  className="flex items-center gap-1 px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  <ChevronLeft size={15} /> Back
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 bg-primary hover:bg-primary-dark disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  Complete Setup
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">MEP Platform © {new Date().getFullYear()}</p>
      </div>
    </div>
  )
}
