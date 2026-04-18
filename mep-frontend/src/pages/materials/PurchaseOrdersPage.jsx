import { useState, useEffect } from 'react'
import api from '@/lib/api'
import {
  FileText, Loader2, AlertCircle, Search,
  Building2, Package, Calendar, ChevronRight,
  Printer, X
} from 'lucide-react'

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtDateTime(ts) {
  return new Date(ts).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Reuse the same PDF generator from MyHub
function generatePOHtml(d) {
  const itemRows = (d.items || []).map((it, i) => `
    <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b">${i + 1}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;font-weight:500">${it.item_name}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#162d4a;font-weight:700;text-align:center">${it.quantity}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;text-align:center">${it.unit}</td>
    </tr>
  `).join('')

  const toSection = !d.is_procurement && d.supplier_name
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:16px">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">To — Supplier</div>
        <div style="font-size:14px;font-weight:700;color:#1e293b">${d.supplier_name}</div>
        ${d.supplier_email   ? `<div style="font-size:12px;color:#64748b;margin-top:2px">✉ ${d.supplier_email}</div>` : ''}
        ${d.supplier_phone   ? `<div style="font-size:12px;color:#64748b">📞 ${d.supplier_phone}</div>` : ''}
        ${d.supplier_address ? `<div style="font-size:12px;color:#64748b">📍 ${d.supplier_address}</div>` : ''}
      </div>`
    : `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin-bottom:16px">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">To — Internal</div>
        <div style="font-size:14px;font-weight:700;color:#1e293b">Procurement Department</div>
      </div>`

  const sentDate = fmtDate(d.sent_at || d.created_at)

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
  <div class="no-print" style="margin-bottom:20px;text-align:right">
    <button onclick="window.print()" style="background:#162d4a;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">
      🖨 Print / Save as PDF
    </button>
  </div>

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #162d4a">
    <div>
      <div style="font-size:22px;font-weight:800;color:#162d4a">${d.company_name || 'Company'}</div>
      ${d.company_address ? `<div style="font-size:12px;color:#64748b;margin-top:4px">📍 ${d.company_address}</div>` : ''}
      ${d.company_phone   ? `<div style="font-size:12px;color:#64748b">📞 ${d.company_phone}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div style="font-size:20px;font-weight:800;color:#1e293b">Purchase Order</div>
      <div style="font-size:13px;color:#64748b;margin-top:4px">Ref: <strong>${d.ref}</strong></div>
      <div style="font-size:13px;color:#64748b">Date: ${sentDate}</div>
      ${d.po_number ? `<div style="font-size:15px;font-weight:800;color:#162d4a;margin-top:6px">PO # ${d.po_number}</div>` : ''}
    </div>
  </div>

  <!-- Delivery Location (most important for driver) -->
  <div style="background:#fefce8;border:2px solid #fbbf24;border-radius:10px;padding:16px;margin-bottom:16px">
    <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">📦 Delivery Location</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <div style="font-size:11px;font-weight:600;color:#92400e;margin-bottom:4px">Project</div>
        <div style="font-size:15px;font-weight:800;color:#1e293b">${d.project_code}${d.project_name ? ' — ' + d.project_name : ''}</div>
        ${d.site_address ? `<div style="font-size:13px;color:#64748b;margin-top:6px">📍 ${d.site_address}</div>` : '<div style="font-size:12px;color:#94a3b8;margin-top:4px">No site address on file</div>'}
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:#92400e;margin-bottom:4px">On-Site Contact (Foreman)</div>
        <div style="font-size:15px;font-weight:800;color:#1e293b">${d.foreman_name || '—'}</div>
        ${d.foreman_phone ? `<div style="font-size:14px;font-weight:700;color:#162d4a;margin-top:6px">📞 ${d.foreman_phone}</div>` : ''}
        ${d.foreman_email ? `<div style="font-size:12px;color:#64748b;margin-top:2px">✉ ${d.foreman_email}</div>` : ''}
      </div>
    </div>
  </div>

  <!-- To (supplier or procurement) -->
  ${toSection}

  <!-- Items table -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <thead>
      <tr style="background:#162d4a">
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;width:40px">#</th>
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px">Item Description</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;width:80px">Qty</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;width:80px">Unit</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  ${d.note ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;margin-bottom:24px">
    <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Notes</div>
    <div style="font-size:13px;color:#78350f">${d.note}</div>
  </div>` : ''}

  <div style="border-top:1px solid #e2e8f0;padding-top:16px;display:flex;justify-content:space-between;align-items:center">
    <div style="font-size:11px;color:#94a3b8">Generated by MEP Platform · ${sentDate}</div>
    <div style="font-size:11px;color:#94a3b8">${d.ref}</div>
  </div>
</body>
</html>`
}

export default function PurchaseOrdersPage() {
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [error, setError]     = useState('')
  const [printing, setPrinting] = useState(null)

  useEffect(() => {
    api.get('/materials/purchase-orders')
      .then(r => setOrders(r.data.purchase_orders || []))
      .catch(e => setError(e.response?.data?.message || e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleReprint = async (id) => {
    setPrinting(id)
    try {
      const r = await api.get(`/materials/purchase-orders/${id}`)
      const po = r.data.purchase_order
      const html = generatePOHtml(po)
      const win = window.open('', '_blank', 'width=900,height=700')
      win.document.write(html)
      win.document.close()
      win.focus()
    } catch (e) { alert(e.response?.data?.message || e.message) }
    finally { setPrinting(null) }
  }

  const filtered = orders.filter(o => {
    if (!search) return true
    const q = search.toLowerCase()
    return o.ref.toLowerCase().includes(q)
      || o.project_code?.toLowerCase().includes(q)
      || o.foreman_name?.toLowerCase().includes(q)
      || o.supplier_name?.toLowerCase().includes(q)
  })

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Purchase Orders</h1>
              <p className="text-xs text-slate-400 mt-0.5">History of all sent material requests</p>
            </div>
          </div>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by ref, project, foreman..."
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-400" />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}

        {loading && <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm font-semibold text-slate-400">No purchase orders yet</p>
            <p className="text-xs text-slate-300 mt-1">Sent requests will appear here</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Ref</th>
                  <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">PO #</th>
                  <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Date</th>
                  <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Project</th>
                  <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Foreman</th>
                  <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Sent To</th>
                  <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Items</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => (
                  <tr key={o.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold text-primary bg-primary-pale px-2 py-1 rounded-lg">{o.ref}</span>
                    </td>
                    <td className="px-4 py-3">
                      {o.po_number
                        ? <span className="text-xs font-bold text-slate-700">{o.po_number}</span>
                        : <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmtDateTime(o.sent_at)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold text-slate-700">{o.project_code}</span>
                      {o.project_name && <span className="text-xs text-slate-400 ml-1">— {o.project_name}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{o.foreman_name}</td>
                    <td className="px-4 py-3">
                      {o.is_procurement
                        ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Procurement</span>
                        : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{o.supplier_name}</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {Array.isArray(o.items) ? o.items.length : 0} items
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleReprint(o.id)} disabled={printing === o.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-primary border border-primary-pale hover:bg-primary-pale rounded-lg transition-colors disabled:opacity-50">
                        {printing === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Printer className="w-3 h-3" />}
                        Reprint
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
