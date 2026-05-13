// src/admin/CreateCompany.jsx
//
// Phase 5.1 — Create company form on admin portal.
//
// Wires up the existing backend POST /api/super/companies endpoint (already
// implemented in routes/super_admin.js since 89-C/15). The endpoint:
//   * inserts a row in public.companies
//   * inserts an ADMIN app_user with the provided temp PIN
//   * sends a welcome email via Resend if admin_email is provided
//   * audit-logs COMPANY_CREATED
//
// This form just collects the inputs + posts them + renders the response.
// On success we show the temp PIN once (since the user won't see it again
// in the backend response after this navigation) so the SA can hand it off
// to the new tenant admin manually if email delivery fails.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../lib/api'

const PLANS = [
  { value: 'BASIC', label: 'Basic' },
  { value: 'PRO', label: 'Pro' },
  { value: 'ENTERPRISE', label: 'Enterprise' },
]

export default function CreateCompany() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    admin_username: '',
    admin_pin: '',
    admin_pin_confirm: '',
    plan: 'BASIC',
    admin_email: '',
    phone: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function validate() {
    if (!form.name.trim()) return 'Company name is required'
    if (form.name.trim().length < 2) return 'Company name must be at least 2 characters'
    if (!form.admin_username.trim()) return 'Admin username is required'
    if (form.admin_username.trim().length < 3) return 'Admin username must be at least 3 characters'
    if (!form.admin_pin) return 'Admin temporary PIN is required'
    if (form.admin_pin.length < 4 || form.admin_pin.length > 8)
      return 'Admin PIN must be 4-8 characters'
    if (form.admin_pin !== form.admin_pin_confirm) return 'PIN and confirmation do not match'
    if (form.admin_email && !/^\S+@\S+\.\S+$/.test(form.admin_email))
      return 'Admin email format looks invalid'
    return null
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post('/super/companies', {
        name: form.name.trim(),
        admin_username: form.admin_username.trim().toLowerCase(),
        admin_pin: form.admin_pin,
        plan: form.plan,
        admin_email: form.admin_email.trim() || undefined,
        phone: form.phone.trim() || undefined,
      })
      setSuccess({
        company: res.data.company,
        admin: res.data.admin,
        email_sent: res.data.email_sent,
        temp_pin: form.admin_pin, // show once — backend doesn't return it
      })
    } catch (err) {
      const msg =
        (err.response && err.response.data && err.response.data.error) ||
        err.message ||
        'Failed to create company'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success screen ─────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-200 px-6 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-lg p-6 mb-6">
            <h1 className="text-2xl font-bold text-emerald-300 mb-2">Company created</h1>
            <p className="text-emerald-100/80 text-sm">
              {success.company.name} ({success.company.company_code}) is now active.
            </p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Company</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-400">Name</dt>
              <dd>{success.company.name}</dd>
              <dt className="text-slate-400">Code</dt>
              <dd className="font-mono text-indigo-300">{success.company.company_code}</dd>
              <dt className="text-slate-400">Plan</dt>
              <dd>{success.company.plan}</dd>
              <dt className="text-slate-400">Status</dt>
              <dd>{success.company.status}</dd>
            </dl>
          </div>

          <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-2 text-amber-200">
              Admin credentials — save now
            </h2>
            <p className="text-amber-100/80 text-xs mb-4">
              This temporary PIN is not retrievable after you leave this screen. Hand it off
              securely to the admin user, or rely on the welcome email if you provided one.
            </p>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-400">Username</dt>
              <dd className="font-mono text-slate-100">{success.admin.username}</dd>
              <dt className="text-slate-400">Temporary PIN</dt>
              <dd className="font-mono text-amber-300 text-lg tracking-widest">
                {success.temp_pin}
              </dd>
              <dt className="text-slate-400">Welcome email</dt>
              <dd>
                {success.email_sent ? (
                  <span className="text-emerald-300">Sent ✓</span>
                ) : (
                  <span className="text-slate-300">Not sent (no email provided)</span>
                )}
              </dd>
            </dl>
            <p className="text-amber-100/70 text-xs mt-4">
              The admin must change their PIN on first login.
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              to="/"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-md text-white text-sm font-medium"
            >
              ← All companies
            </Link>
            <button
              onClick={() => {
                setSuccess(null)
                setForm({
                  name: '',
                  admin_username: '',
                  admin_pin: '',
                  admin_pin_confirm: '',
                  plan: 'BASIC',
                  admin_email: '',
                  phone: '',
                })
              }}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 text-sm"
            >
              Create another
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Form ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Create company</h1>
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-200">
            ← Back to companies
          </Link>
        </div>

        {error && (
          <div className="bg-rose-900/30 border border-rose-700/50 rounded-md px-4 py-3 mb-6 text-rose-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="bg-slate-800/40 border border-slate-700 rounded-lg p-6 space-y-5">
          <Field
            label="Company name"
            required
            value={form.name}
            onChange={(v) => setField('name', v)}
            placeholder="ACME Construction Ltd."
          />

          <Field
            label="Plan"
            type="select"
            value={form.plan}
            onChange={(v) => setField('plan', v)}
            options={PLANS}
          />

          <div className="border-t border-slate-700 pt-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
              First admin account
            </h2>

            <Field
              label="Admin username"
              required
              value={form.admin_username}
              onChange={(v) => setField('admin_username', v.toLowerCase().replace(/\s/g, ''))}
              placeholder="jane.doe"
              hint="Lowercase, no spaces. Used to log in."
            />

            <div className="grid grid-cols-2 gap-4 mt-4">
              <Field
                label="Temporary PIN"
                required
                type="password"
                value={form.admin_pin}
                onChange={(v) => setField('admin_pin', v)}
                hint="4-8 chars. Admin changes on first login."
                maxLength={8}
              />
              <Field
                label="Confirm PIN"
                required
                type="password"
                value={form.admin_pin_confirm}
                onChange={(v) => setField('admin_pin_confirm', v)}
                maxLength={8}
              />
            </div>

            <Field
              label="Admin email"
              type="email"
              value={form.admin_email}
              onChange={(v) => setField('admin_email', v)}
              placeholder="admin@acme.com"
              hint="If provided, a welcome email with credentials will be sent."
            />

            <Field
              label="Phone (optional)"
              value={form.phone}
              onChange={(v) => setField('phone', v)}
              placeholder="+1 514-555-0100"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-700 pt-5">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-400 rounded-md text-white text-sm font-medium"
            >
              {submitting ? 'Creating…' : 'Create company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Reusable field component ──────────────────────────────────────
function Field({ label, value, onChange, required, type, placeholder, hint, options, maxLength }) {
  return (
    <div className="space-y-1 mt-4 first:mt-0">
      <label className="block text-xs font-medium text-slate-300 uppercase tracking-wide">
        {label}
        {required && <span className="text-rose-400 ml-1">*</span>}
      </label>
      {type === 'select' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type || 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
        />
      )}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
