// ── Shared formatting helpers ────────────────────────────────

/** Today as YYYY-MM-DD */
export const todayStr = () => new Date().toISOString().split('T')[0]

/** Tomorrow as YYYY-MM-DD */
export const tomorrowStr = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

/** Format a time string (HH:mm) or timestamp to 12-hour display */
export function fmtTime(t) {
  if (!t) return '—'
  const str = String(t).substring(0, 5)
  const [h, m] = str.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return '—'
  const ap  = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`
}

/** Format decimal hours → "Xh Ym" */
export function fmtHours(h) {
  if (h === null || h === undefined || h === '') return '—'
  const num = parseFloat(h)
  if (isNaN(num)) return '—'
  const hrs  = Math.floor(num)
  const mins = Math.round((num - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

/** Format a date/timestamp → "Mon DD, YYYY" */
export function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Format a timestamp → "Mon DD, HH:MM AM/PM" */
export function fmtDateTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
