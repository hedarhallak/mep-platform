import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions.jsx'
import api from '@/lib/api'
import {
  LayoutDashboard, FolderKanban, Users, ClipboardList,
  Settings, LogOut, Building2, BarChart2, Brain,
  ChevronDown, ChevronRight, CalendarCheck, Inbox, Package, Truck, FileText, Shield, Send
} from 'lucide-react'

const mainNav = [
  { to: '/dashboard',        icon: LayoutDashboard, label: 'Dashboard',        permission: null },
  { to: '/employees',        icon: Users,           label: 'Employees',        permission: { module: 'employees',       action: 'view'           } },
  { to: '/projects',         icon: FolderKanban,    label: 'Projects',         permission: { module: 'projects',        action: 'view'           } },
  { to: '/suppliers',        icon: Truck,           label: 'Suppliers',        permission: { module: 'suppliers',       action: 'view'           } },
  { to: '/assignments',      icon: ClipboardList,   label: 'Assignments',      permission: { module: 'assignments',     action: 'view'           } },
  { to: '/attendance',       icon: CalendarCheck,   label: 'Attendance',       permission: { module: 'attendance',      action: 'view_self'      } },
  { to: '/task-request',     icon: Send,            label: 'Task Request',     permission: { module: 'hub',             action: 'send_tasks'     } },
  { to: '/material-request', icon: Package,         label: 'Material Request', permission: { module: 'materials',       action: 'request_submit' } },
  { to: '/purchase-orders',  icon: FileText,        label: 'Purchase Orders',  permission: { module: 'purchase_orders', action: 'view'           } },
  { to: '/my-hub',           icon: Inbox,           label: 'My Hub',           permission: null, badge: true },
]

const biNav = [
  { to: '/bi/workforce-planner', icon: Brain, label: 'Workforce Planner', permission: { module: 'bi', action: 'workforce_planner' } },
]

export default function AppLayout() {
  const { user, logout } = useAuth()
  const { can, loading: permsLoading } = usePermissions()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [biOpen, setBiOpen] = useState(location.pathname.startsWith('/bi'))
  const [hubCount, setHubCount] = useState(0)

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const r = await api.get('/materials/inbox/count')
        setHubCount(r.data.count || 0)
      } catch (_) {}
    }
    fetchCount()
    const interval = setInterval(fetchCount, 60_000)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = () => { logout(); navigate('/login') }
  const isBiActive = location.pathname.startsWith('/bi')

  const canSeeAttendance = !permsLoading && (
    can('attendance', 'view_self') ||
    can('attendance', 'view') ||
    can('attendance', 'view_own_trade')
  )
  const canSeeMaterials = !permsLoading && (
    can('materials', 'request_submit') ||
    can('materials', 'request_view_own') ||
    can('materials', 'request_view_all') ||
    can('materials', 'request_view_own_trade')
  )
  const canSeePurchaseOrders = !permsLoading && (
    can('purchase_orders', 'view') ||
    can('purchase_orders', 'view_own') ||
    can('purchase_orders', 'view_own_trade')
  )

  const visibleMain = mainNav.filter(item => {
    if (!item.permission) return true
    if (permsLoading) return false
    if (item.to === '/attendance')       return canSeeAttendance
    if (item.to === '/material-request') return canSeeMaterials
    if (item.to === '/purchase-orders')  return canSeePurchaseOrders
    return can(item.permission.module, item.permission.action)
  })

  const visibleBi = biNav.filter(item =>
    !item.permission || permsLoading || can(item.permission.module, item.permission.action)
  )

  const showUserMgmt    = !permsLoading && can('settings', 'user_management')
  const showPermissions = !permsLoading && can('settings', 'permissions')
  const showSettings    = !permsLoading && can('settings', 'company')

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 flex flex-col bg-[#0f172a] text-slate-300 flex-shrink-0">

        {/* Brand */}
        <div className="flex items-center gap-2 px-5 py-5 border-b border-slate-800">
          <Building2 size={20} className="text-indigo-400" />
          <span className="font-bold text-white text-sm">MEP Platform</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">

          {visibleMain.map(({ to, icon: Icon, label, badge }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon size={16} />
              <span className="flex-1">{label}</span>
              {badge && hubCount > 0 && (
                <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {hubCount > 99 ? '99+' : hubCount}
                </span>
              )}
            </NavLink>
          ))}

          <div className="pt-2 pb-1">
            <div className="border-t border-slate-800" />
          </div>

          {/* BI Section */}
          {visibleBi.length > 0 && (
            <>
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
                  {visibleBi.map(({ to, icon: Icon, label }) => (
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

              <div className="pt-2 pb-1">
                <div className="border-t border-slate-800" />
              </div>
            </>
          )}

          {/* User Management */}
          {showUserMgmt && (
            <NavLink to="/user-management"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Users size={16} />User Management
            </NavLink>
          )}

          {/* Permissions */}
          {showPermissions && (
            <NavLink to="/permissions"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Shield size={16} />Permissions
            </NavLink>
          )}

          {/* Settings */}
          {showSettings && (
            <NavLink to="/settings"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Settings size={16} />Settings
            </NavLink>
          )}

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
