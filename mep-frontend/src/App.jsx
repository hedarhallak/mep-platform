import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { PermissionsProvider, usePermissions } from '@/hooks/usePermissions.jsx'

// Eager imports — needed on first paint:
//   AppLayout: layout shell wrapping every authenticated route
//   LoginPage: first thing unauth'd users see; lazy would add a flicker
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/auth/LoginPage'

// Lazy-loaded pages — each becomes its own chunk, fetched on first navigation.
// Section 66 (May 4, 2026): cuts initial bundle from 728 KB to ~250-300 KB.
const DashboardPage        = lazy(() => import('@/pages/dashboard/DashboardPage'))
const ProjectsPage         = lazy(() => import('@/pages/projects/ProjectsPage'))
const EmployeesPage        = lazy(() => import('@/pages/employees/EmployeesPage'))
const OnboardingPage       = lazy(() => import('@/pages/onboarding/OnboardingPage'))
const AssignmentsPage      = lazy(() => import('@/pages/assignments/AssignmentsPage'))
const CrewsPage            = lazy(() => import('@/pages/crews/CrewsPage'))
const PendingRequestsPage  = lazy(() => import('@/pages/assignments/PendingRequestsPage'))
const ForemanRequestPage   = lazy(() => import('@/pages/assignments/ForemanRequestPage'))
const ProjectStaffingPage  = lazy(() => import('@/pages/projects/ProjectStaffingPage'))
const AttendancePage       = lazy(() => import('@/pages/attendance/AttendancePage'))
const MyHubPage            = lazy(() => import('@/pages/hub/MyHubPage'))
const MaterialRequestPage  = lazy(() => import('@/pages/materials/MaterialRequestPage'))
const PurchaseOrdersPage   = lazy(() => import('@/pages/materials/PurchaseOrdersPage'))
const SurplusPage          = lazy(() => import('@/pages/materials/SurplusPage'))
const ToolsPage            = lazy(() => import('@/pages/materials/ToolsPage'))
const ExpensesPage         = lazy(() => import('@/pages/materials/ExpensesPage'))
const SuppliersPage        = lazy(() => import('@/pages/suppliers/SuppliersPage'))
const PermissionsPage      = lazy(() => import('@/pages/PermissionsPage'))
const OwnerAuditPage       = lazy(() => import('@/pages/OwnerAuditPage'))
const UserManagementPage   = lazy(() => import('@/pages/UserManagementPage'))
const TaskRequestPage      = lazy(() => import('@/pages/TaskRequestPage'))
const StandupPage          = lazy(() => import('@/pages/StandupPage'))
const ReportsPage          = lazy(() => import('@/pages/ReportsPage'))
const BIPage               = lazy(() => import('@/pages/BIPage'))
const ProfilePage          = lazy(() => import('@/pages/profile/ProfilePage'))
const SubscriptionPage     = lazy(() => import('@/pages/subscription/SubscriptionPage'))
const InvoicesPage         = lazy(() => import('@/pages/billing/InvoicesPage'))
const SettingsPage         = lazy(() => import('@/pages/SettingsPage'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

// Reusable centered loading state — matches the pattern already used by
// ProtectedRoute / RequirePermission for auth/permission resolution.
function PageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  )
}

// ── Auth guard ────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoading />
  return user ? children : <Navigate to="/login" replace />
}

// ── Permission guard — supports multiple allowed permissions ───
// Pass `anyOf` array: user needs at least ONE of them
function RequirePermission({ module, action, anyOf, children }) {
  const { can, loading } = usePermissions()

  if (loading) return <PageLoading />

  // Check multiple permission options
  if (anyOf) {
    const allowed = anyOf.some(p => can(p.module, p.action))
    return allowed ? children : <Navigate to="/dashboard" replace />
  }

  // Single permission check
  return can(module, action || 'view') ? children : <Navigate to="/dashboard" replace />
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login"      element={user ? <Navigate to="/dashboard" /> : <LoginPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/" element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />

          {/* Always accessible */}
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="my-hub"    element={<MyHubPage />} />
          <Route path="profile"  element={<ProfilePage />} />

          {/* Single permission routes */}
          <Route path="employees" element={
            <RequirePermission module="employees" action="view">
              <EmployeesPage />
            </RequirePermission>
          }/>
          <Route path="projects" element={
            <RequirePermission module="projects" action="view">
              <ProjectsPage />
            </RequirePermission>
          }/>
          <Route path="assignments" element={
            <RequirePermission module="assignments" action="view">
              <AssignmentsPage />
            </RequirePermission>
          }/>
          <Route path="crews" element={
            <RequirePermission module="assignments" action="view">
              <CrewsPage />
            </RequirePermission>
          }/>
          <Route path="assignments/requests" element={
            <RequirePermission module="assignments" action="edit">
              <PendingRequestsPage />
            </RequirePermission>
          }/>
          <Route path="assignments/submit" element={
            <RequirePermission module="assignments" action="create">
              <ForemanRequestPage />
            </RequirePermission>
          }/>
          <Route path="projects/staffing" element={
            <RequirePermission module="assignments" action="view">
              <ProjectStaffingPage />
            </RequirePermission>
          }/>
          <Route path="suppliers" element={
            <RequirePermission module="suppliers" action="view">
              <SuppliersPage />
            </RequirePermission>
          }/>
          {/* Section 131: planning + optimization merged INTO Assignments
              (wizard + in-context panel). Old planner routes redirect. */}
          <Route path="workforce-planner" element={<Navigate to="/assignments" replace />} />
          <Route path="bi/workforce-planner" element={<Navigate to="/assignments" replace />} />
          <Route path="bi" element={
            <RequirePermission module="bi" action="access_full">
              <BIPage />
            </RequirePermission>
          }/>
          <Route path="standup" element={
            <RequirePermission module="standup" action="manage">
              <StandupPage />
            </RequirePermission>
          }/>
          {/* Section 134: route-level guard for consistency with siblings.
              The page already self-gates all-vs-self internally and the
              backend authorizes the data; this blocks direct-URL access for
              users with no reports permission at all. */}
          <Route path="reports" element={
            <RequirePermission anyOf={[
              { module: 'reports', action: 'view'      },
              { module: 'reports', action: 'view_self' },
            ]}>
              <ReportsPage />
            </RequirePermission>
          }/>
          <Route path="task-request" element={
            <RequirePermission module="hub" action="send_tasks">
              <TaskRequestPage />
            </RequirePermission>
          }/>
          <Route path="user-management" element={
            <RequirePermission module="settings" action="user_management">
              <UserManagementPage />
            </RequirePermission>
          }/>
          <Route path="permissions" element={
            <RequirePermission module="settings" action="permissions">
              <PermissionsPage />
            </RequirePermission>
          }/>
          <Route path="owner-audit" element={
            <RequirePermission module="audit" action="view">
              <OwnerAuditPage />
            </RequirePermission>
          }/>
          <Route path="settings" element={
            <RequirePermission module="settings" action="company">
              <SettingsPage />
            </RequirePermission>
          }/>
          <Route path="subscription" element={
            <RequirePermission module="settings" action="company">
              <SubscriptionPage />
            </RequirePermission>
          }/>
          <Route path="billing/invoices" element={
            <RequirePermission module="settings" action="company">
              <InvoicesPage />
            </RequirePermission>
          }/>

          {/* Multi-permission routes — user needs ANY ONE of the listed permissions */}
          <Route path="attendance" element={
            <RequirePermission anyOf={[
              { module: 'attendance', action: 'view'            },
              { module: 'attendance', action: 'view_self'       },
              { module: 'attendance', action: 'view_own_trade'  },
            ]}>
              <AttendancePage />
            </RequirePermission>
          }/>
          <Route path="material-request" element={
            <RequirePermission anyOf={[
              { module: 'materials', action: 'request_submit'         },
              { module: 'materials', action: 'request_view_own'       },
              { module: 'materials', action: 'request_view_all'       },
              { module: 'materials', action: 'request_view_own_trade' },
            ]}>
              <MaterialRequestPage />
            </RequirePermission>
          }/>
          <Route path="purchase-orders" element={
            <RequirePermission anyOf={[
              { module: 'purchase_orders', action: 'view'            },
              { module: 'purchase_orders', action: 'view_own'        },
              { module: 'purchase_orders', action: 'view_own_trade'  },
            ]}>
              <PurchaseOrdersPage />
            </RequirePermission>
          }/>
          <Route path="surplus" element={
            <RequirePermission anyOf={[
              { module: 'materials', action: 'surplus_view'    },
              { module: 'materials', action: 'surplus_declare' },
            ]}>
              <SurplusPage />
            </RequirePermission>
          }/>
          <Route path="tools" element={
            <RequirePermission anyOf={[
              { module: 'materials', action: 'request_submit' },
              { module: 'materials', action: 'surplus_view'   },
            ]}>
              <ToolsPage />
            </RequirePermission>
          }/>
          <Route path="expenses" element={
            <RequirePermission anyOf={[
              { module: 'expense_claims', action: 'submit' },
              { module: 'expense_claims', action: 'view'   },
            ]}>
              <ExpensesPage />
            </RequirePermission>
          }/>

        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}

function AuthenticatedApp() {
  return (
    <PermissionsProvider>
      <AppRoutes />
    </PermissionsProvider>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AuthenticatedApp />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
