import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  LayoutDashboard, FolderKanban, Users, ClipboardList,
  Settings, LogOut, Building2, BarChart2, Brain,
  ChevronDown, ChevronRight, CalendarCheck, Inbox, Package, Truck
} from 'lucide-react'

const mainNav = [
  { to: '/dashboard',        icon: LayoutDashboard, label: 'Dashboard'        },
  { to: '/employees',        icon: Users,           label: 'Employees'        },
  { to: '/projects',         icon: FolderKanban,    label: 'Projects'         },
  { to: '/suppliers',        icon: Truck,           label: 'Suppliers'        },
  { to: '/assignments',      icon: ClipboardList,   label: 'Assignments'      },
  { to: '/attendance',       icon: CalendarCheck,   label: 'Attendance'       },
  { to: '/my-hub',           icon: Inbox,           label: 'My Hub'           },
  { to: '/material-request', icon: Package,         label: 'Material Request' },
]

const biNav = [
  { to: '/bi/workforce-planner', icon: Brain, label: 'Workforce Planner' },
]

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [biOpen, setBiOpen] = useState(location.pathname.startsWith('/bi'))

  const handleLogout = () => { logout(); navigate('/login') }
  const isBiActive = location.pathname.startsWith('/bi')

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
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">

          {/* Main items */}
          {mainNav.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon size={16} />{label}
            </NavLink>
          ))}

          {/* Divider */}
          <div className="pt-2 pb-1">
            <div className="border-t border-slate-800" />
          </div>

          {/* BI Section */}
          <button onClick={() => setBiOpen(v => !v)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isBiActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <BarChart2 size={16} />
              <span>Business Intelligence</span>
            </div>
            {biOpen
              ? <ChevronDown size={13} className="text-slate-500" />
              : <ChevronRight size={13} className="text-slate-500" />
            }
          </button>

          {biOpen && (
            <div className="ml-3 pl-3 border-l border-slate-700 space-y-0.5">
              {biNav.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`
                  }
                >
                  <Icon size={15} />{label}
                </NavLink>
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="pt-2 pb-1">
            <div className="border-t border-slate-800" />
          </div>

          {/* Settings */}
          <NavLink to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Settings size={16} />Settings
          </NavLink>

        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-slate-800">
          <div className="text-xs text-slate-500 mb-1 truncate">{user?.company_name || 'Company'}</div>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white truncate">{user?.username}</div>
              <div className="text-xs text-indigo-400">{user?.role}</div>
            </div>
            <button onClick={handleLogout}
              className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
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
