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
const AttendancePage       = lazy(() => import('@/pages/attendance/AttendancePage'))
const MyHubPage            = lazy(() => import('@/pages/hub/MyHubPage'))
const MaterialRequestPage  = lazy(() => import('@/pages/materials/MaterialRequestPage'))
const PurchaseOrdersPage   = lazy(() => import('@/pages/materials/PurchaseOrdersPage'))
const SuppliersPage        = lazy(() => import('@/pages/suppliers/SuppliersPage'))
const WorkforcePlannerPage = lazy(() => import('@/pages/bi/WorkforcePlannerPage'))
const PermissionsPage      = lazy(() => import('@/pages/PermissionsPage'))
const UserManagementPage   = lazy(() => import('@/pages/UserManagementPage'))
const TaskRequestPage      = lazy(() => import('@/pages/TaskRequestPage'))
const StandupPage          = lazy(() => import('@/pages/StandupPage'))
const ReportsPage          = lazy(() => import('@/pages/ReportsPage'))
const ProfilePage          = lazy(() => import('@/pages/profile/ProfilePage'))
const SubscriptionPage     = lazy(() => import('@/pages/subscription/SubscriptionPage'))
const InvoicesPage         = lazy(() => import('@/pages/billing/InvoicesPage'))

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
          <Route path="suppliers" element={
            <RequirePermission module="suppliers" action="view">
              <SuppliersPage />
            </RequirePermission>
          }/>
          <Route path="bi/workforce-planner" element={
            <RequirePermission module="bi" action="workforce_planner">
              <WorkforcePlannerPage />
            </RequirePermission>
          }/>
          <Route path="standup" element={
            <RequirePermission module="standup" action="manage">
              <StandupPage />
            </RequirePermission>
          }/>
          <Route path="reports" element={<ReportsPage />} />
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
          <Route path="settings" element={
            <RequirePermission module="settings" action="company">
              <div className="p-8 text-slate-400">Settings — Coming soon</div>
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
