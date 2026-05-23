// src/AdminApp.jsx
//
// Phase 5 / 90-D + 90-E — admin portal root with React Router.
//
// 90-C shipped a single-component placeholder. 90-D added routing +
// the first real screen (CompaniesList). 90-E adds the /login route
// + AdminLogin component so SUPER_ADMIN can authenticate without
// borrowing a token from the tenant portal.
//
//   /                 → CompaniesList  (read-only dashboard, 90-D)
//   /companies/new    → CreateCompany  (form, Phase 5.1)
//   /login            → AdminLogin     (sign-in form, 90-E)
//   *                 → NotFound       (stub linking back to /)
//
// Future screens (CompanyDetail, AuditLog) land here as new <Route>
// entries. Anything that doesn't match a registered route falls
// through to NotFound — we don't redirect to a default route to avoid
// hiding link rot.

import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import CompaniesList from './admin/CompaniesList.jsx'
import CreateCompany from './admin/CreateCompany.jsx'
import CompanyBranding from './admin/CompanyBranding.jsx'
import AdminLogin from './admin/AdminLogin.jsx'

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
        <Route path="/companies/new" element={<CreateCompany />} />
        {/* Section 113 / Phase 6-D-3 frontend — per-tenant branding + seat usage page. */}
        <Route path="/companies/:id/branding" element={<CompanyBranding />} />
        <Route path="/login" element={<AdminLogin />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
