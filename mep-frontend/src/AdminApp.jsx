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
import SubscriptionRequestsPage from './admin/SubscriptionRequestsPage.jsx'
import TrainingQuotesPage from './admin/TrainingQuotesPage.jsx'
import CustomDemandsPage from './admin/CustomDemandsPage.jsx'
import PaymentsPage from './admin/PaymentsPage.jsx'
import SuperAuditPage from './admin/SuperAuditPage.jsx'
import AdminIdleGuard from './admin/AdminIdleGuard.jsx'
import RequireAdminTab from './admin/RequireAdminTab.jsx'

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
      {/* Section 133.2 — idle auto-logout for the SUPER_ADMIN portal. */}
      <AdminIdleGuard />
      <Routes>
        {/* Section 133.5 — every protected route is gated on a per-tab
            sessionStorage marker; a reopened/new tab (no marker) is sent to
            /login for a fresh PIN + TOTP. /login itself is NOT gated. */}
        <Route path="/" element={<RequireAdminTab><CompaniesList /></RequireAdminTab>} />
        <Route path="/companies/new" element={<RequireAdminTab><CreateCompany /></RequireAdminTab>} />
        {/* Section 113 / Phase 6-D-3 frontend — per-tenant branding + seat usage page. */}
        <Route path="/companies/:id/branding" element={<RequireAdminTab><CompanyBranding /></RequireAdminTab>} />
        {/* Section 120 / Phase 6-D-6 PR 1 — pending customer subscription change inbox. */}
        <Route path="/subscription-requests" element={<RequireAdminTab><SubscriptionRequestsPage /></RequireAdminTab>} />
        {/* Section 120 / Phase 6-D-6 PR 2 — cross-company training quote management. */}
        <Route path="/training-quotes" element={<RequireAdminTab><TrainingQuotesPage /></RequireAdminTab>} />
        {/* Section 122 / Phase 6-D-6 PR 3 — cross-company custom demand management. */}
        <Route path="/custom-demands" element={<RequireAdminTab><CustomDemandsPage /></RequireAdminTab>} />
        {/* Section 123 / Phase 6-D-6 PR 4 — cross-company payments management. */}
        <Route path="/payments" element={<RequireAdminTab><PaymentsPage /></RequireAdminTab>} />
        {/* §132.6 / §140 Slice 3b — cross-tenant audit oversight. */}
        <Route path="/audit" element={<RequireAdminTab><SuperAuditPage /></RequireAdminTab>} />
        <Route path="/login" element={<AdminLogin />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
