// src/admin/CompanyBranding.jsx
//
// Phase 6-D-3 frontend (Section 113, May 16, 2026).
//
// SUPER_ADMIN page for managing a single tenant's branding (logo +
// brand_color) and observing their seat usage. The upload form posts
// multipart/form-data to POST /api/super/companies/:id/branding (route
// already exists from Section 112 / PR #249). The seat counter reads
// the new `current_users` field returned by GET /api/super/companies/:id
// (super_admin.js change in this same PR — Section 113).
//
// Why bundled with the seat-cap bits: the admin Branding screen is the
// single place a SUPER_ADMIN goes to "configure this tenant" — branding
// + seat usage are both per-tenant configuration concerns and should
// live on the same page so the SA doesn't have to context-switch. This
// also avoids an extra navigation entry in the admin shell for what is
// essentially one settings page per tenant.
//
// Multipart note: lib/api.js JSON-serializes its body and forces
// Content-Type: application/json, which doesn't work for file uploads.
// We bypass lib/api here and use native fetch() with credentials:'include'
// — the same pattern AdminLogin.jsx uses for the cookie-based admin auth
// flow. The browser sets the multipart boundary header automatically when
// FormData is the body.
//
// Bilingual labels: web i18n is still TODO (per CLAUDE.md §3.6), so this
// page uses inline English-primary + French-secondary labels. When the
// web i18next setup lands, these literals collapse into t('...') calls.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import api from '../lib/api'

const MAX_FILE_BYTES = 2 * 1024 * 1024 // matches multer limit in routes/super_admin_branding.js
const ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/webp']
const BRAND_COLOR_RE = /^#[0-9A-Fa-f]{6}$/
const DEFAULT_BRAND_COLOR = '#16a34a' // matches the Constrai green default

const BILLING_EMAIL = 'billing@constrai.ca'

// Map backend error codes → friendly bilingual messages. Anything not
// matched here is rendered as "Server error (CODE)" so an unexpected code
// still surfaces visibly instead of disappearing.
const ERROR_MESSAGES = {
  NO_CHANGES: {
    en: 'No changes to save — pick a logo, a color, or check the "remove logo" box.',
    fr: 'Aucune modification à enregistrer — choisissez un logo, une couleur ou cochez la case « retirer le logo ».',
  },
  NO_FILE: {
    en: 'No file was uploaded.',
    fr: 'Aucun fichier téléchargé.',
  },
  FILE_TOO_LARGE: {
    en: 'Logo file must be 2 MB or smaller.',
    fr: 'Le fichier du logo doit faire 2 Mo ou moins.',
  },
  INVALID_FILE_TYPE: {
    en: 'Logo must be a PNG, JPEG, or WebP image.',
    fr: 'Le logo doit être une image PNG, JPEG ou WebP.',
  },
  IMAGE_UNREADABLE: {
    en: "We couldn't read the uploaded image — try re-exporting it from your editor.",
    fr: "Nous n'avons pas pu lire l'image téléchargée — essayez de la réexporter depuis votre éditeur.",
  },
  IMAGE_DIMENSIONS_INVALID: {
    en: 'Logo dimensions must be between 64×64 and 2048×2048 pixels.',
    fr: 'Les dimensions du logo doivent être entre 64×64 et 2048×2048 pixels.',
  },
  INVALID_BRAND_COLOR: {
    en: 'Brand color must be a hex value like #16a34a.',
    fr: 'La couleur de marque doit être une valeur hexadécimale comme #16a34a.',
  },
  COMPANY_NOT_FOUND: {
    en: 'Company not found.',
    fr: 'Entreprise introuvable.',
  },
  SPACES_NOT_CONFIGURED: {
    en: 'Logo uploads are disabled on this server — the storage bucket has not been activated yet. Brand color changes still work.',
    fr: "Les téléchargements de logos sont désactivés sur ce serveur — le bucket de stockage n'a pas encore été activé. Les changements de couleur fonctionnent toujours.",
  },
  USER_LIMIT_REACHED: {
    en: 'This company has reached its seat limit. Upgrade the plan to add more users.',
    fr: "Cette entreprise a atteint sa limite de sièges. Passez à un plan supérieur pour ajouter d'autres utilisateurs.",
  },
}

// Build a friendly bilingual error message for a backend error code.
//
// Precedence (highest → lowest):
//   1. Backend's own bilingual pair (data.message_en + data.message_fr) —
//      used for codes like USER_LIMIT_REACHED where the backend already
//      bakes the live counts (e.g. "Seat limit reached (5/5)..."). Always
//      prefer the live-data version when available so the user sees the
//      actual numbers, not a static template.
//   2. The static ERROR_MESSAGES dict — used for codes where the backend
//      returns only `error` (no message_*) and we have a canned bilingual
//      translation.
//   3. Backend's plain `message` field — last-resort fallback for codes
//      we haven't translated.
//   4. Generic "Server error (CODE)".
function errorMessageFor(code, fallbackMessage, data) {
  if (data && data.message_en && data.message_fr) {
    return `${data.message_en} (${data.message_fr})`
  }
  const m = ERROR_MESSAGES[code]
  if (m) return `${m.en} (${m.fr})`
  if (fallbackMessage) return fallbackMessage
  return `Server error (${code || 'UNKNOWN'})`
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—'
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

function buildMailto(company) {
  const subject = `Upgrade plan for ${company?.name || company?.company_code || 'company'} (id ${company?.company_id || '?'})`
  const body = [
    `Hello Constrai billing,`,
    ``,
    `Please upgrade the plan for the following company:`,
    ``,
    `  Company name : ${company?.name || '—'}`,
    `  Company code : ${company?.company_code || '—'}`,
    `  Current plan : ${company?.plan || '—'}`,
    `  Current seats: ${company?.current_users ?? '—'} of ${company?.subscribed_seats ?? company?.max_users ?? '—'}`,
    `  Current bracket: ${company?.current_bracket_label ?? '—'} (${typeof company?.current_unit_price_cents === 'number' ? '$' + (company.current_unit_price_cents / 100).toFixed(2) : '—'}/seat/mo)`,
    ``,
    `Requested action: upgrade to ___ (BASIC / PRO / ENTERPRISE).`,
    ``,
    `Thanks.`,
  ].join('\n')
  return `mailto:${BILLING_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export default function CompanyBranding() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [company, setCompany] = useState(null)

  // Form state
  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_COLOR)
  const [file, setFile] = useState(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [clientError, setClientError] = useState(null)

  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  // ── Initial load: GET /api/super/companies/:id ─────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    api
      .get(`/super/companies/${id}`)
      .then((res) => {
        if (cancelled) return
        const c = (res.data && res.data.company) || null
        if (!c) {
          setLoadError('COMPANY_NOT_FOUND')
          setLoading(false)
          return
        }
        setCompany(c)
        if (c.brand_color && BRAND_COLOR_RE.test(c.brand_color)) {
          setBrandColor(c.brand_color)
        }
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        const code =
          (err.response && err.response.data && err.response.data.error) || null
        setLoadError(code || err.message || 'Failed to load company')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  // ── Object URL bookkeeping for the file preview ────────────────
  useEffect(() => {
    if (!file) {
      setFilePreviewUrl(null)
      return undefined
    }
    const url = URL.createObjectURL(file)
    setFilePreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // ── File picker handler with client-side validation ────────────
  function onFilePicked(e) {
    setClientError(null)
    const picked = e.target.files && e.target.files[0]
    if (!picked) {
      setFile(null)
      return
    }
    if (!ACCEPTED_MIME.includes(picked.type)) {
      setClientError(errorMessageFor('INVALID_FILE_TYPE'))
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (picked.size > MAX_FILE_BYTES) {
      setClientError(errorMessageFor('FILE_TOO_LARGE'))
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setFile(picked)
    // If the user picks a file, they obviously aren't trying to remove
    // the logo — auto-clear the remove checkbox to avoid the backend's
    // NO_CHANGES conflict (upload + remove in same request → 400).
    setRemoveLogo(false)
  }

  function onColorPickerChange(value) {
    setClientError(null)
    setBrandColor(value)
  }

  function onColorTextChange(value) {
    setClientError(null)
    // Normalize: leading # plus 6 hex chars. Accept lowercase or uppercase
    // input; the backend lower-cases on write.
    let v = value.trim()
    if (v && !v.startsWith('#')) v = `#${v}`
    setBrandColor(v)
  }

  const colorValid = useMemo(() => BRAND_COLOR_RE.test(brandColor), [brandColor])
  const originalColor = company?.brand_color || null
  const colorChanged = colorValid && brandColor.toLowerCase() !== (originalColor || '').toLowerCase()

  const canSubmit = !submitting && !!company && (
    !!file || colorChanged || (removeLogo && !!company.brand_logo_url)
  )

  // ── Submit handler — multipart fetch ───────────────────────────
  async function onSubmit(e) {
    e.preventDefault()
    setClientError(null)
    setServerError(null)
    setSuccessMessage(null)

    if (!company) return

    if (file && removeLogo) {
      // Should be unreachable given onFilePicked clears the checkbox, but
      // guard defensively — the backend rejects this combination too.
      setClientError(
        'Cannot upload a new logo and remove the existing one at the same time. (Vous ne pouvez pas téléverser un nouveau logo et supprimer le logo existant en même temps.)'
      )
      return
    }
    if (brandColor && !colorValid) {
      setClientError(errorMessageFor('INVALID_BRAND_COLOR'))
      return
    }
    if (!file && !colorChanged && !(removeLogo && company.brand_logo_url)) {
      setClientError(errorMessageFor('NO_CHANGES'))
      return
    }

    const fd = new FormData()
    if (file) fd.append('logo', file)
    // Only send brand_color if it changed — avoids triggering an unrelated
    // UPDATE write when the user only picked a logo.
    if (colorChanged) fd.append('brand_color', brandColor.toLowerCase())
    if (removeLogo && !file) fd.append('remove_logo', 'true')

    setSubmitting(true)
    try {
      const res = await fetch(`/api/super/companies/${id}/branding`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          // Section 103: identify as the web channel so cookie auth is used.
          // Do NOT set Content-Type — the browser fills it in with the
          // correct multipart boundary when body is a FormData.
          'X-Auth-Channel': 'cookie',
        },
        body: fd,
      })

      let data = null
      try {
        data = await res.json()
      } catch {
        // non-JSON response — leave data null, handled below
      }

      if (!res.ok || !data || data.ok === false) {
        const code = (data && data.error) || `HTTP_${res.status}`
        const msg = (data && data.message) || null
        setServerError(errorMessageFor(code, msg, data))
        return
      }

      // Success — server returned the updated company row. Merge into
      // local state so the preview reflects what's now persisted (e.g.,
      // the new brand_logo_url with cache-busting timestamp), and reset
      // the picker state.
      const updated = data.company || null
      if (updated) {
        // Preserve current_users since the branding endpoint doesn't
        // return it; only the GET /companies/:id does.
        setCompany((prev) => ({ ...prev, ...updated, current_users: prev?.current_users }))
        if (updated.brand_color && BRAND_COLOR_RE.test(updated.brand_color)) {
          setBrandColor(updated.brand_color)
        }
      }
      setFile(null)
      setRemoveLogo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setSuccessMessage(
        'Branding saved. (Image de marque enregistrée.)'
      )
    } catch (networkErr) {
      setServerError(
        networkErr.message
          ? `Network error: ${networkErr.message}`
          : 'Network error.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-200 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading company…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-200 px-6 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="bg-rose-900/30 border border-rose-700/50 rounded-lg p-6 mb-4">
            <h1 className="text-xl font-semibold text-rose-200 mb-2">
              Couldn&apos;t load company
            </h1>
            <p className="text-sm text-rose-100/80">{errorMessageFor(loadError)}</p>
          </div>
          <Link to="/" className="text-sm text-indigo-300 hover:text-indigo-200">
            ← Back to companies
          </Link>
        </div>
      </div>
    )
  }

  const currentLogoUrl = company?.brand_logo_url || null
  // Section 116 (May 24, 2026) — prefer the canonical `subscribed_seats` from
  // the new subscriptions table; fall back to `max_users` (legacy from Section
  // 114) for older API responses during the transition window.
  const seatLimit = company?.subscribed_seats ?? company?.max_users
  const atCap =
    company &&
    Number.isFinite(Number(company.current_users)) &&
    Number.isFinite(Number(seatLimit)) &&
    Number(company.current_users) >= Number(seatLimit)

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Branding · {company.name}</h1>
            <p className="text-xs text-slate-500 mt-1">
              Section 113 · Tenant branding &amp; seat usage
            </p>
          </div>
          <Link
            to="/"
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            ← Back to companies
          </Link>
        </div>

        {/* ── Seat-cap panel ──────────────────────────────────── */}
        <section
          aria-labelledby="seat-cap-heading"
          className={
            'rounded-lg border p-6 mb-6 ' +
            (atCap
              ? 'bg-amber-900/20 border-amber-700/50'
              : 'bg-slate-800/40 border-slate-700')
          }
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="seat-cap-heading"
                className="text-sm font-semibold uppercase tracking-wide text-slate-300 mb-1"
              >
                Seat usage <span className="text-slate-500 normal-case">·</span>{' '}
                <span className="text-slate-500 normal-case">Utilisation des sièges</span>
              </h2>
              <p className="text-3xl font-bold text-slate-100 tabular-nums">
                {company.current_users ?? '—'} <span className="text-slate-500">/</span>{' '}
                {seatLimit ?? '—'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Plan: <span className="font-mono text-slate-300">{company.plan || 'BASIC'}</span>
                {company.current_bracket_label && (
                  <>
                    {' '}
                    <span className="text-slate-500">·</span>{' '}
                    <span className="text-slate-300">
                      Bracket {company.current_bracket_label}
                      {typeof company.current_unit_price_cents === 'number'
                        ? ` ($${(company.current_unit_price_cents / 100).toFixed(2)}/seat/mo)`
                        : ''}
                    </span>
                  </>
                )}
                {atCap && (
                  <>
                    {' '}
                    <span className="text-amber-300">
                      · At capacity — new invites will be rejected with HTTP 402.
                    </span>
                  </>
                )}
              </p>
            </div>
            <a
              href={buildMailto(company)}
              className="shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-md text-white text-sm font-medium whitespace-nowrap"
            >
              Upgrade plan →
            </a>
          </div>
          <p className="text-xs text-slate-500 mt-4">
            Phase 9-B (post-conference, Q4 2026) will replace this <code>mailto:</code> link
            with a Stripe Customer Portal deep-link. Until then, plan changes are handled
            manually by Constrai billing.
          </p>
        </section>

        {/* ── Branding form ───────────────────────────────────── */}
        <form
          onSubmit={onSubmit}
          className="bg-slate-800/40 border border-slate-700 rounded-lg p-6 space-y-6"
          aria-label="Company branding form"
        >
          {/* ── Logo ──────────────────────────────────────────── */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300 mb-3">
              Logo <span className="text-slate-500 normal-case">· Logo</span>
            </h2>
            <div className="flex items-start gap-6">
              {/* Preview area */}
              <div className="shrink-0">
                <div className="w-32 h-32 bg-slate-900 border border-slate-700 rounded-md flex items-center justify-center overflow-hidden">
                  {filePreviewUrl ? (
                    <img
                      src={filePreviewUrl}
                      alt="Selected logo preview"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : currentLogoUrl && !removeLogo ? (
                    <img
                      src={currentLogoUrl}
                      alt="Current company logo"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-slate-500 text-center px-2">
                      No logo
                      <br />
                      (Aucun logo)
                    </span>
                  )}
                </div>
                {file && (
                  <p className="text-xs text-slate-400 mt-2 max-w-[8rem] truncate">
                    {file.name}
                    <br />
                    <span className="text-slate-500">{formatBytes(file.size)}</span>
                  </p>
                )}
              </div>

              {/* Controls */}
              <div className="grow space-y-3">
                <label
                  htmlFor="logo-input"
                  className="inline-block cursor-pointer px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-100"
                >
                  Choose file… <span className="text-slate-400">(Choisir un fichier…)</span>
                </label>
                <input
                  id="logo-input"
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_MIME.join(',')}
                  onChange={onFilePicked}
                  className="sr-only"
                />
                <p className="text-xs text-slate-500">
                  PNG, JPEG, or WebP. Max 2 MB. Backend resizes to 256×256 PNG.
                  <br />
                  <span className="text-slate-600">
                    PNG, JPEG ou WebP. Max 2 Mo. Le serveur redimensionne en PNG 256×256.
                  </span>
                </p>

                {currentLogoUrl && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="remove-logo"
                      checked={removeLogo}
                      onChange={(e) => {
                        setClientError(null)
                        setRemoveLogo(e.target.checked)
                        if (e.target.checked) {
                          // Clear any pending file pick — backend rejects the combo.
                          setFile(null)
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }
                      }}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-rose-500 focus:ring-rose-400 cursor-pointer"
                    />
                    <label htmlFor="remove-logo" className="text-xs text-slate-300 cursor-pointer">
                      Remove existing logo on save{' '}
                      <span className="text-slate-500">
                        (Supprimer le logo existant à l&apos;enregistrement)
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Brand color ───────────────────────────────────── */}
          <div className="border-t border-slate-700 pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300 mb-3">
              Brand color <span className="text-slate-500 normal-case">· Couleur de marque</span>
            </h2>
            <div className="flex items-center gap-4">
              {/* Live swatch */}
              <div
                aria-label="Brand color preview"
                className="w-16 h-16 rounded-md border border-slate-700"
                style={{ background: colorValid ? brandColor : 'transparent' }}
              />
              <div className="grow space-y-2">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colorValid ? brandColor : DEFAULT_BRAND_COLOR}
                    onChange={(e) => onColorPickerChange(e.target.value)}
                    aria-label="Brand color picker"
                    className="h-10 w-14 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => onColorTextChange(e.target.value)}
                    aria-label="Brand color hex value"
                    placeholder="#16a34a"
                    className="font-mono w-32 px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-100 focus:outline-none focus:border-slate-500"
                  />
                  {!colorValid && (
                    <span className="text-xs text-rose-300">
                      Invalid hex (e.g. <code>#16a34a</code>)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Tenant&apos;s primary accent color. Frontend bootstrap reads this and
                  builds the full shade palette via <code>color-mix()</code>.
                </p>
              </div>
            </div>
          </div>

          {/* ── Errors / success ─────────────────────────────── */}
          {clientError && (
            <div
              role="alert"
              className="bg-rose-900/30 border border-rose-700/50 rounded p-3 text-sm text-rose-200"
            >
              {clientError}
            </div>
          )}
          {serverError && (
            <div
              role="alert"
              className="bg-rose-900/30 border border-rose-700/50 rounded p-3 text-sm text-rose-200"
            >
              {serverError}
            </div>
          )}
          {successMessage && (
            <div
              role="status"
              className="bg-emerald-900/30 border border-emerald-700/50 rounded p-3 text-sm text-emerald-200"
            >
              {successMessage}
            </div>
          )}

          {/* ── Submit row ───────────────────────────────────── */}
          <div className="flex justify-end gap-3 border-t border-slate-700 pt-5">
            <button
              type="button"
              onClick={() => navigate('/')}
              disabled={submitting}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-slate-200 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed rounded text-white text-sm font-medium"
            >
              {submitting ? 'Saving…' : 'Save branding'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
