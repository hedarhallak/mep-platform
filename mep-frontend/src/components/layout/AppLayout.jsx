import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  LayoutDashboard, FolderKanban, Users, ClipboardList,
  Map, Settings, LogOut, Building2
} from 'lucide-react'

const nav = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/projects',    icon: FolderKanban,    label: 'Projects' },
  { to: '/employees',   icon: Users,           label: 'Employees' },
  { to: '/assignments', icon: ClipboardList,   label: 'Assignments' },
  { to: '/map',         icon: Map,             label: 'Map View' },
  { to: '/settings',    icon: Settings,        label: 'Settings' },
]

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex flex-col bg-[#0f172a] text-slate-300 flex-shrink-0">
        {/* Brand */}
        <div className="flex items-center gap-2 px-5 py-5 border-b border-slate-800">
          <Building2 size={20} className="text-indigo-400" />
          <span className="font-bold text-white text-sm">MEP Platform</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-slate-800">
          <div className="text-xs text-slate-500 mb-1">{user?.company_name || 'Company'}</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-white">{user?.username}</div>
              <div className="text-xs text-indigo-400">{user?.role}</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Logout"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-slate-50">
        <Outlet />
      </main>
    </div>
  )
}
