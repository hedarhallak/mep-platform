import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import {
  Inbox, CalendarCheck, CheckCheck, Loader2, AlertCircle,
  Check, X, Clock, Users, ChevronRight, RefreshCw,
  Briefcase, MapPin, Package
} from 'lucide-react'

const todayStr = () => new Date().toISOString().split('T')[0]

function fmtTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function fmtHours(h) {
  if (h == null || h === '') return '—'
  const n = Number(h)
  if (isNaN(n)) return '—'
  const hrs  = Math.floor(n)
  const mins = Math.round((n - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

const TRADE_DOT = {
  PLUMBING: '#0ea5e9', ELECTRICAL: '#f59e0b', HVAC: '#10b981',
  CARPENTRY: '#f97316', GENERAL: '#64748b',
}
const dot = (code) => TRADE_DOT[(code||'').toUpperCase()] || '#94a3b8'

// ── Attendance Approval Tab ───────────────────────────────────
function AttendanceApprovalTab() {
  const [date, setDate]         = useState(todayStr())
  const [records, setRecords]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [approving, setApproving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [error, setError]       = useState('')

  const fetchRecords = useCallback(async () => {
    setLoading(true); setError('')
    try {
      // Fetch all attendance for this date (no project filter)
      const r = await api.get(`/attendance/report/daily?date=${date}`)
      setRecords(r.data.records || [])
    } catch (e) { setError(e.response?.data?.message || e.message) }
    finally { setLoading(false) }
  }, [date])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const showSuccess = (msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 4000) }

  const handleApproveAll = async () => {
    const toApprove = records.filter(r => r.check_in_at && r.check_out_at && !r.manager_approved)
    if (!toApprove.length) return
    setApproving(true)
    try {
      await Promise.all(toApprove.map(r =>
        api.patch(`/attendance/overtime/${r.attendance_id}/approve`, { approved: true })
      ))
      showSuccess(`${toApprove.length} records approved ✓`)
      fetchRecords()
    } catch (e) { setError(e.response?.data?.message || e.message) }
    finally { setApproving(false) }
  }

  const handleApproveOne = async (attendanceId) => {
    try {
      await api.patch(`/attendance/overtime/${attendanceId}/approve`, { approved: true })
      showSuccess('Approved ✓')
      fetchRecords()
    } catch (e) { alert(e.response?.data?.message || e.message) }
  }

  const pendingCount = records.filter(r => r.check_in_at && r.check_out_at && !r.manager_approved).length

  // Group by project
  const grouped = records.reduce((acc, r) => {
    const key = r.project_code
    if (!acc[key]) acc[key] = { project_code: r.project_code, project_name: r.project_name, records: [] }
    acc[key].records.push(r)
    return acc
  }, {})
  const groups = Object.values(grouped)

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Date</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <button onClick={fetchRecords} disabled={loading}
          className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        {pendingCount > 0 && (
          <button onClick={handleApproveAll} disabled={approving}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60">
            {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCheck className="w-3.5 h-3.5" />Approve All ({pendingCount})</>}
          </button>
        )}
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-semibold">
          <Check className="w-4 h-4 flex-shrink-0" />{successMsg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {loading && <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>}

      {!loading && records.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarCheck className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">No attendance records for {date}</p>
        </div>
      )}

      {!loading && groups.map(group => (
        <div key={group.project_code} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Project header */}
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-slate-800">{group.project_code}</span>
            {group.project_name && <span className="text-xs text-slate-400">{group.project_name}</span>}
            <span className="ml-auto text-[10px] font-semibold px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg">
              {group.records.length} employees
            </span>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Employee</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Check In</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Check Out</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Hours</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Overtime</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Status</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {group.records.map((r, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/60 last:border-0 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: dot(r.trade_code) }}>
                        {(r.employee_name || '?')[0]}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-700">{r.employee_name}</div>
                        <div className="text-[10px] text-slate-400">{r.assignment_role || 'WORKER'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{fmtTime(r.check_in_at)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{fmtTime(r.check_out_at)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700">{fmtHours(r.worked_hours)}</td>
                  <td className="px-4 py-3">
                    {r.overtime_hours > 0
                      ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">+{r.overtime_hours}h OT</span>
                      : <span className="text-xs text-slate-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {!r.check_in_at
                      ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Absent</span>
                      : !r.check_out_at
                        ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">On Site</span>
                        : r.manager_approved
                          ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1 w-fit"><Check className="w-3 h-3" />Approved</span>
                          : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">Pending</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {r.check_in_at && r.check_out_at && !r.manager_approved && (
                      <button onClick={() => handleApproveOne(r.attendance_id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 border border-emerald-200 hover:bg-emerald-50 rounded-lg transition-colors whitespace-nowrap">
                        <Check className="w-3 h-3" />Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ── Purchase Order HTML Generator ────────────────────────────
function generatePOHtml(d) {
  const itemRows = (d.items || []).map((it, i) => `
    <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b">${i + 1}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;font-weight:500">${it.item_name}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#4f46e5;font-weight:700;text-align:center">${it.quantity}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;text-align:center">${it.unit}</td>
    </tr>
  `).join('')

  const toSection = d.supplier
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:20px">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">To — Supplier</div>
        <div style="font-size:14px;font-weight:700;color:#1e293b">${d.supplier.name}</div>
        ${d.supplier.email ? `<div style="font-size:12px;color:#64748b;margin-top:2px">✉ ${d.supplier.email}</div>` : ''}
        ${d.supplier.phone ? `<div style="font-size:12px;color:#64748b">📞 ${d.supplier.phone}</div>` : ''}
        ${d.supplier.address ? `<div style="font-size:12px;color:#64748b">📍 ${d.supplier.address}</div>` : ''}
      </div>`
    : `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin-bottom:20px">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">To — Internal</div>
        <div style="font-size:14px;font-weight:700;color:#1e293b">Procurement Department</div>
        ${d.company.procurement_email ? `<div style="font-size:12px;color:#64748b;margin-top:2px">✉ ${d.company.procurement_email}</div>` : ''}
      </div>`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Purchase Order ${d.ref}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #1e293b; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none; }
    }
  </style>
</head>
<body style="padding:40px;max-width:800px;margin:0 auto">

  <!-- Print button -->
  <div class="no-print" style="margin-bottom:20px;text-align:right">
    <button onclick="window.print()" style="background:#4f46e5;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">
      🖨 Print / Save as PDF
    </button>
  </div>

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid #4f46e5">
    <div>
      <div style="font-size:22px;font-weight:800;color:#4f46e5">${d.company.name || 'Company'}</div>
      ${d.company.address ? `<div style="font-size:12px;color:#64748b;margin-top:4px">📍 ${d.company.address}</div>` : ''}
      ${d.company.phone ? `<div style="font-size:12px;color:#64748b">📞 ${d.company.phone}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div style="font-size:20px;font-weight:800;color:#1e293b">Purchase Order</div>
      <div style="font-size:13px;color:#64748b;margin-top:4px">Ref: <strong>${d.ref}</strong></div>
      <div style="font-size:13px;color:#64748b">Date: ${d.date}</div>
    </div>
  </div>

  <!-- Project & Foreman -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px">
      <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Project</div>
      <div style="font-size:14px;font-weight:700;color:#1e293b">${d.project?.project_code || ''} ${d.project?.project_name ? '— ' + d.project.project_name : ''}</div>
      ${d.project?.site_address ? `<div style="font-size:12px;color:#64748b;margin-top:4px">📍 ${d.project.site_address}</div>` : ''}
    </div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px">
      <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Requested By</div>
      <div style="font-size:14px;font-weight:700;color:#1e293b">${d.foreman?.full_name || ''}</div>
      ${d.foreman?.foreman_phone ? `<div style="font-size:12px;color:#64748b;margin-top:4px">📞 ${d.foreman.foreman_phone}</div>` : ''}
    </div>
  </div>

  <!-- To section -->
  ${toSection}

  <!-- Items table -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <thead>
      <tr style="background:#4f46e5">
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;width:40px">#</th>
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px">Item Description</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;width:80px">Qty</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;width:80px">Unit</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- Notes -->
  ${d.note ? `
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;margin-bottom:24px">
    <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Notes</div>
    <div style="font-size:13px;color:#78350f">${d.note}</div>
  </div>` : ''}

  <!-- Footer -->
  <div style="border-top:1px solid #e2e8f0;padding-top:16px;display:flex;justify-content:space-between;align-items:center">
    <div style="font-size:11px;color:#94a3b8">Generated by MEP Platform · ${d.date}</div>
    <div style="font-size:11px;color:#94a3b8">${d.ref}</div>
  </div>

</body>
</html>`
}

// ── Inbox Tab ─────────────────────────────────────────────────
function InboxTab() {
  const [requests, setRequests]   = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [expanded, setExpanded]   = useState({})
  const [mergedItems, setMergedItems] = useState(null) // null = not merged yet
  const [surplus, setSurplus]     = useState({})       // item_name → surplus info
  const [sendModal, setSendModal] = useState(false)
  const [sendTarget, setSendTarget] = useState('')     // supplier id or 'procurement'
  const [sendNote, setSendNote]   = useState('')
  const [sending, setSending]     = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const fetchInbox = async () => {
    setLoading(true); setError('')
    try {
      const [inboxRes, supplierRes] = await Promise.all([
        api.get('/materials/inbox'),
        api.get('/suppliers'),
      ])
      setRequests(inboxRes.data.requests || [])
      setSuppliers(supplierRes.data.suppliers || [])
      setMergedItems(null)
    } catch (e) { setError(e.response?.data?.message || e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchInbox() }, [])

  const showSuccess = (msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 4000) }

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  const pendingRequests = requests.filter(r => r.status === 'PENDING' || r.status === 'REVIEWED')

  // ── Merge all pending requests ───────────────────────────────
  const handleMerge = async () => {
    // Combine all items, sum duplicates by item_name + unit
    const map = {}
    for (const req of pendingRequests) {
      for (const item of (req.items || [])) {
        const key = `${item.item_name.toLowerCase()}__${item.unit}`
        if (!map[key]) {
          map[key] = { item_name: item.item_name, quantity: 0, unit: item.unit, sources: [] }
        }
        map[key].quantity += Number(item.quantity)
        map[key].sources.push({ requester: req.requester_name, qty: Number(item.quantity) })
      }
    }
    const merged = Object.values(map)
    setMergedItems(merged)

    // Check surplus for each item
    const surplusMap = {}
    for (const item of merged) {
      try {
        const r = await api.get(`/materials/surplus?item_name=${encodeURIComponent(item.item_name)}`)
        const found = r.data.surplus || []
        if (found.length) surplusMap[item.item_name.toLowerCase()] = found
      } catch (_) {}
    }
    setSurplus(surplusMap)
  }

  // ── Update merged item quantity ──────────────────────────────
  const updateMergedQty = (index, val) => {
    setMergedItems(prev => prev.map((it, i) =>
      i === index ? { ...it, quantity: Math.max(0, Math.floor(Number(val) || 0)) } : it
    ))
  }

  // ── Send + PDF ───────────────────────────────────────────────
  const handleSend = async () => {
    if (!sendTarget) return
    setSending(true)
    try {
      // 1. Fetch PDF data
      const ids = pendingRequests.map(r => r.id).join(',')
      const params = new URLSearchParams({ request_ids: ids })
      if (sendTarget !== 'procurement') params.set('supplier_id', sendTarget)
      if (sendNote) params.set('note', sendNote)
      const pdfRes = await api.get(`/materials/pdf-data?${params}`)
      const d = pdfRes.data.pdf_data

      // 2. Generate PDF HTML
      const html = generatePOHtml(d)

      // 3. Open print window
      const win = window.open('', '_blank', 'width=900,height=700')
      win.document.write(html)
      win.document.close()
      win.focus()

      // 4. Mark as SENT
      await Promise.all(pendingRequests.map(r =>
        api.patch(`/materials/requests/${r.id}/review`, { status: 'SENT' })
      ))
      setSendModal(false)
      setSendNote('')
      setMergedItems(null)
      showSuccess('Request sent successfully ✓')
      fetchInbox()
    } catch (e) { alert(e.response?.data?.message || e.message) }
    finally { setSending(false) }
  }

  const statusColor = (s) => {
    if (s === 'PENDING')  return 'bg-amber-100 text-amber-700'
    if (s === 'REVIEWED') return 'bg-blue-100 text-blue-700'
    if (s === 'MERGED')   return 'bg-violet-100 text-violet-700'
    if (s === 'SENT')     return 'bg-emerald-100 text-emerald-700'
    return 'bg-slate-100 text-slate-500'
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700">Material Requests</span>
          {pendingRequests.length > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {pendingRequests.length} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {pendingRequests.length > 0 && !mergedItems && (
            <button onClick={handleMerge}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors">
              <Package className="w-3.5 h-3.5" />Merge & Review
            </button>
          )}
          <button onClick={fetchInbox} disabled={loading}
            className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-semibold">
          <Check className="w-4 h-4 flex-shrink-0" />{successMsg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {loading && <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>}

      {/* ── Merged View ── */}
      {!loading && mergedItems && (
        <div className="bg-white rounded-xl border border-indigo-200 overflow-hidden">
          <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-bold text-indigo-800">Merged Request — {mergedItems.length} items</span>
              <span className="text-[10px] text-indigo-500">from {pendingRequests.length} requests</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setMergedItems(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={() => setSendModal(true)}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors">
                <Check className="w-3.5 h-3.5" />Send Request
              </button>
            </div>
          </div>

          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Item</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Total Qty</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Unit</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Sources</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Surplus Available</th>
              </tr>
            </thead>
            <tbody>
              {mergedItems.map((item, i) => {
                const surplusItems = surplus[item.item_name.toLowerCase()] || []
                const totalSurplus = surplusItems.reduce((s, x) => s + Number(x.qty_available), 0)
                return (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{item.item_name}</td>
                    <td className="px-4 py-3">
                      <input type="number" min="0" step="1" value={item.quantity}
                        onChange={e => updateMergedQty(i, e.target.value)}
                        className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm font-bold text-indigo-600 text-center focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{item.unit}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {item.sources.map((s, j) => (
                          <span key={j} className="text-[10px] text-slate-400">{s.requester}: {s.qty}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {totalSurplus > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {surplusItems.map((s, j) => (
                            <span key={j} className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit">
                              {s.qty_available} {item.unit} @ {s.project_code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300">None</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Individual Requests ── */}
      {!loading && requests.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">No material requests</p>
          <p className="text-xs text-slate-300 mt-1">Requests from your team will appear here</p>
        </div>
      )}

      {!loading && requests.map(req => (
        <div key={req.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <button onClick={() => toggleExpand(req.id)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
              style={{ background: '#6366f1' }}>
              {(req.requester_name || '?')[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-800">{req.requester_name}</span>
                <span className="text-xs text-slate-400">{req.project_code}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(req.status)}`}>
                  {req.status}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {req.items?.length || 0} items · {new Date(req.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <ChevronRight className={`w-4 h-4 text-slate-300 flex-shrink-0 transition-transform ${expanded[req.id] ? 'rotate-90' : ''}`} />
          </button>

          {expanded[req.id] && (
            <div className="border-t border-slate-100">
              {req.note && (
                <div className="px-4 py-2 bg-amber-50 text-xs text-amber-700 border-b border-amber-100">
                  📝 {req.note}
                </div>
              )}
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2">Item</th>
                    <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2">Qty</th>
                    <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2">Unit</th>
                    <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {(req.items || []).map((item, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{item.item_name}</td>
                      <td className="px-4 py-2.5 text-sm font-bold text-indigo-600">{item.quantity}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">{item.unit}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">{item.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {/* ── Send Modal ── */}
      {sendModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Send Request To</h3>
              <button onClick={() => setSendModal(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-2 max-h-[55vh] overflow-y-auto">
              {/* Procurement option */}
              <button onClick={() => setSendTarget('procurement')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                  sendTarget === 'procurement' ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
                }`}>
                <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Briefcase className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Procurement Department</div>
                  <div className="text-[10px] text-slate-400">Internal — company purchasing team</div>
                </div>
                {sendTarget === 'procurement' && <Check className="w-4 h-4 text-indigo-600 ml-auto" />}
              </button>

              {/* Suppliers */}
              {suppliers.length > 0 && (
                <>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-1">Suppliers</div>
                  {suppliers.map(s => (
                    <button key={s.id} onClick={() => setSendTarget(String(s.id))}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                        sendTarget === String(s.id) ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
                      }`}>
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Package className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800 truncate">{s.name}</div>
                        <div className="text-[10px] text-slate-400">{s.trade_code} · {s.email}</div>
                      </div>
                      {sendTarget === String(s.id) && <Check className="w-4 h-4 text-indigo-600 ml-auto flex-shrink-0" />}
                    </button>
                  ))}
                </>
              )}
            </div>
            <div className="px-6 py-3 border-t border-slate-100">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Notes (optional)</label>
              <textarea value={sendNote} onChange={e => setSendNote(e.target.value)}
                rows={2} placeholder="e.g. Contact Ahmad if foreman unavailable — 514-000-0000"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-slate-300 resize-none" />
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setSendModal(false)} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
              <button onClick={handleSend} disabled={!sendTarget || sending}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" />Confirm Send</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function MyHubPage() {
  const [tab, setTab] = useState('attendance')
  const [materialsCount, setMaterialsCount] = useState(0)

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const r = await api.get('/materials/inbox/count')
        setMaterialsCount(r.data.count || 0)
      } catch (_) {}
    }
    fetchCount()
    const interval = setInterval(fetchCount, 30_000)
    return () => clearInterval(interval)
  }, [])

  const tabs = [
    { id: 'attendance', icon: CalendarCheck, label: 'Attendance Approval' },
    { id: 'materials',  icon: Package,       label: 'Materials', count: materialsCount },
  ]

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Inbox className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">My Hub</h1>
            <p className="text-xs text-slate-400 mt-0.5">Your daily tasks, approvals and requests</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {t.count > 0 && (
                <span className={`min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full flex items-center justify-center ${
                  tab === t.id ? 'bg-white text-indigo-600' : 'bg-red-500 text-white'
                }`}>
                  {t.count > 99 ? '99+' : t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === 'attendance' && <AttendanceApprovalTab />}
        {tab === 'materials'  && <InboxTab />}
      </div>
    </div>
  )
}
