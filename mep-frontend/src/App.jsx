import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/hooks/useAuth'

import AppLayout           from '@/components/layout/AppLayout'
import LoginPage           from '@/pages/auth/LoginPage'
import DashboardPage       from '@/pages/dashboard/DashboardPage'
import ProjectsPage        from '@/pages/projects/ProjectsPage'
import EmployeesPage       from '@/pages/employees/EmployeesPage'
import OnboardingPage      from '@/pages/onboarding/OnboardingPage'
import AssignmentsPage     from '@/pages/assignments/AssignmentsPage'
import AttendancePage      from '@/pages/attendance/AttendancePage'
import MyHubPage           from '@/pages/hub/MyHubPage'
import WorkforcePlannerPage from '@/pages/bi/WorkforcePlannerPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login"      element={user ? <Navigate to="/dashboard" /> : <LoginPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/" element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"   element={<DashboardPage />} />
        <Route path="projects"    element={<ProjectsPage />} />
        <Route path="employees"   element={<EmployeesPage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="attendance"  element={<AttendancePage />} />
        <Route path="my-hub"      element={<MyHubPage />} />
        <Route path="settings"    element={<div className="p-8 text-slate-400">Settings — Coming soon</div>} />

        {/* Business Intelligence */}
        <Route path="bi/workforce-planner" element={<WorkforcePlannerPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
