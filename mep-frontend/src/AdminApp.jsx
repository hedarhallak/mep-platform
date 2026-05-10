// src/AdminApp.jsx
//
// Phase 5 / 90-D — admin portal root with React Router.
//
// 90-C shipped a single-component placeholder. 90-D adds the routing
// shell + the first real screen (CompaniesList). Future screens land
// here as new <Route> entries:
//
//   /                        → CompaniesList (read-only dashboard, 90-D)
//   /companies/:id           → CompanyDetail   (deferred to a later piece)
//   /audit                   → AuditLog        (deferred — Phase 8 territory)
//   /login, /logout          → auth UI         (deferred to 90-E)
//
// Anything that doesn't match a registered route falls through to the
// "Not found" stub. We don't redirect to a default route to avoid hiding
// link rot — visible 404s are louder than silent redirects.

import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import CompaniesList from './admin/CompaniesList.jsx'

function NotFound() {
  const { pathname } = useLocation()
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-200">
      <div className="text-center px-8 py-12">
        <h1 className="text-3xl font-bold mb-2">Not found</h1>
        <p className="text-slate-400 mb-4">
          No admin route matches <code className="text-slate-200">{pathname}</code>.
        </p>
        <Link to="/" className="text-indigo-400 hover:text-indigo-300 text-sm">
          ← Back to companies
        </Link>
      </div>
    </div>
  )
}

export default function AdminApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CompaniesList />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
