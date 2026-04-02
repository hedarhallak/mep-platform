import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions.jsx'
import { FolderKanban, Users, ClipboardList, TrendingUp } from 'lucide-react'

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-start gap-4">
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-800">{value ?? '—'}</div>
        <div className="text-sm font-medium text-slate-600">{label}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { can, loading: permsLoading } = usePermissions()

  const canViewProjects    = !permsLoading && can('projects',    'view')
  const canViewAssignments = !permsLoading && can('assignments', 'view')
  const canViewEmployees   = !permsLoading && can('employees',   'view')

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data.projects),
    enabled: canViewProjects,
  })

  const { data: assignments } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => api.get('/assignments').then(r => r.data.assignments),
    enabled: canViewAssignments,
  })

  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get('/assignments/employees').then(r => r.data.employees),
    enabled: canViewEmployees,
  })

  const activeProjects  = projects?.filter(p => p.status_code === 'ACTIVE').length ?? 0
  const totalProjects   = projects?.length ?? 0
  const totalAssigned   = assignments?.length ?? 0
  const totalEmployees  = employees?.length ?? 0

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">
          Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {user?.username} 👋
        </h1>
        <p className="text-slate-500 text-sm mt-1">Here's what's happening with your projects today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={FolderKanban}
          label="Active Projects"
          value={activeProjects}
          sub={`${totalProjects} total`}
          color="bg-indigo-500"
        />
        <StatCard
          icon={Users}
          label="Employees"
          value={totalEmployees}
          sub="with profiles"
          color="bg-emerald-500"
        />
        <StatCard
          icon={ClipboardList}
          label="Active Assignments"
          value={totalAssigned}
          sub="currently on site"
          color="bg-amber-500"
        />
        <StatCard
          icon={TrendingUp}
          label="Utilization"
          value={totalEmployees ? `${Math.round((totalAssigned / totalEmployees) * 100)}%` : '0%'}
          sub="employees assigned"
          color="bg-violet-500"
        />
      </div>

      {/* Recent Projects */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Recent Active Projects</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {projects?.filter(p => p.status_code === 'ACTIVE').slice(0, 5).map(p => (
            <div key={p.id} className="px-6 py-3 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-indigo-600">{p.project_code}</span>
                <span className="text-sm text-slate-700 ml-2">{p.project_name}</span>
              </div>
              <span className="text-xs text-slate-400">{p.trade_name}</span>
            </div>
          ))}
          {!projects?.length && (
            <div className="px-6 py-8 text-center text-slate-400 text-sm">No projects yet</div>
          )}
        </div>
      </div>
    </div>
  )
}
