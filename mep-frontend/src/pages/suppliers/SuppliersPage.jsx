import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { TRADES, tradeBadge } from '@/constants/trades'
import {
  Truck, Plus, X, Check, Loader2, AlertCircle,
  Edit2, Trash2, Phone, Mail, MapPin, Search
} from 'lucide-react'

function SupplierModal({ supplier, onClose, onSaved }) {
  const isEdit = !!supplier?.id
  const [form, setForm] = useState({
    name:       supplier?.name       || '',
    email:      supplier?.email      || '',
    phone:      supplier?.phone      || '',
    address:    supplier?.address    || '',
    trade_code: supplier?.trade_code || 'ALL',
    note:       supplier?.note       || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setError('')
    if (!form.name.trim())  return setError('Name is required')
    if (!form.email.trim()) return setError('Email is required')
    if (!form.phone.trim()) return setError('Phone is required')
    setSaving(true)
    try {
      if (isEdit) await api.patch(`/suppliers/${supplier.id}`, form)
      else        await api.post('/suppliers', form)
      onSaved()
    } catch (e) { setError(e.response?.data?.message || e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-slate-800">{isEdit ? 'Edit Supplier' : 'New Supplier'}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-6 py-4 space-y-3 max-h-[65vh] overflow-y-auto">
          {[
            { label: 'Supplier Name', key: 'name',    type: 'text',  placeholder: 'e.g. ABC Plumbing Supply' },
            { label: 'Email',         key: 'email',   type: 'email', placeholder: 'supplier@example.com' },
            { label: 'Phone',         key: 'phone',   type: 'text',  placeholder: '+1 514 000 0000' },
            { label: 'Address',       key: 'address', type: 'text',  placeholder: 'Optional — for pickup' },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{label}</label>
              <input type={type} value={form[key]} onChange={e => set(key, e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-300" />
            </div>
          ))}

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Trade</label>
            <div className="flex flex-wrap gap-2">
              {TRADES.map(t => (
                <button key={t.value} onClick={() => set('trade_code', t.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    form.trade_code === t.value ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Note (optional)</label>
            <textarea value={form.note} onChange={e => set('note', e.target.value)}
              rows={2} placeholder="Any notes about this supplier..."
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-300 resize-none" />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-dark disabled:opacity-60 transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" />{isEdit ? 'Update' : 'Add Supplier'}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [tradeFilter, setTradeFilter] = useState('ALL')
  const [modal, setModal]         = useState(null) // null | 'new' | supplier obj
  const [deleting, setDeleting]   = useState(null)
  const [successMsg, setSuccessMsg] = useState('')

  const fetchSuppliers = async () => {
    setLoading(true)
    try {
      const r = await api.get('/suppliers')
      setSuppliers(r.data.suppliers || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchSuppliers() }, [])

  const showSuccess = (msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000) }

  const handleDelete = async (id) => {
    if (!window.confirm('Deactivate this supplier?')) return
    setDeleting(id)
    try {
      await api.delete(`/suppliers/${id}`)
      showSuccess('Supplier removed')
      fetchSuppliers()
    } catch (e) { alert(e.response?.data?.message || e.message) }
    finally { setDeleting(null) }
  }

  const filtered = suppliers.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase())
    const matchTrade  = tradeFilter === 'ALL' || s.trade_code === tradeFilter || s.trade_code === 'ALL'
    return matchSearch && matchTrade
  })

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Suppliers</h1>
              <p className="text-xs text-slate-400 mt-0.5">Manage your supplier directory</p>
            </div>
          </div>
          <button onClick={() => setModal('new')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-dark transition-colors">
            <Plus className="w-3.5 h-3.5" />Add Supplier
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers..."
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-400" />
          </div>
          <div className="flex items-center gap-1">
            {TRADES.map(t => (
              <button key={t.value} onClick={() => setTradeFilter(t.value)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  tradeFilter === t.value ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">

        {successMsg && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-semibold mb-4">
            <Check className="w-4 h-4 flex-shrink-0" />{successMsg}
          </div>
        )}

        {loading && <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Truck className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm font-semibold text-slate-400">No suppliers found</p>
            <p className="text-xs text-slate-300 mt-1">Add your first supplier to get started</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 gap-3 max-w-4xl">
            {filtered.map(s => (
              <div key={s.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-start gap-4">
                <div className="w-10 h-10 bg-primary-pale rounded-xl flex items-center justify-center flex-shrink-0">
                  <Truck className="w-5 h-5 text-primary-light" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">{s.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tradeBadge(s.trade_code)}`}>
                      {s.trade_code}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Mail className="w-3 h-3" />{s.email}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Phone className="w-3 h-3" />{s.phone}
                    </span>
                    {s.address && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <MapPin className="w-3 h-3" />{s.address}
                      </span>
                    )}
                  </div>
                  {s.note && <p className="text-xs text-slate-400 mt-1">{s.note}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setModal(s)}
                    className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary-pale rounded-lg transition-colors">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                    {deleting === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <SupplierModal
          supplier={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchSuppliers(); showSuccess(modal === 'new' ? 'Supplier added ✓' : 'Supplier updated ✓') }}
        />
      )}
    </div>
  )
}
