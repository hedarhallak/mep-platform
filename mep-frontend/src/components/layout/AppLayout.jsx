import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions.jsx'
import { usePWA } from '@/hooks/usePWA.jsx'
import api from '@/lib/api'
import {
  LayoutDashboard, FolderKanban, Users, ClipboardList,
  Settings, LogOut, Building2, BarChart2,
  CalendarCheck, Inbox, Package, Truck, FileText, Shield, Send,
  Download, WifiOff, RefreshCw, Receipt, CreditCard, Recycle, Wrench, ReceiptText
} from 'lucide-react'

// Section 50: nav items reference i18n keys instead of inline EN strings.
// `labelKey` is resolved at render time via t().
const mainNav = [
  { to: '/dashboard',        icon: LayoutDashboard, labelKey: 'nav.dashboard',        permission: null },
  { to: '/employees',        icon: Users,           labelKey: 'nav.employees',        permission: { module: 'employees',       action: 'view'           } },
  { to: '/projects',         icon: FolderKanban,    labelKey: 'nav.projects',         permission: { module: 'projects',        action: 'view'           } },
  { to: '/suppliers',        icon: Truck,           labelKey: 'nav.suppliers',        permission: { module: 'suppliers',       action: 'view'           } },
  { to: '/assignments',      icon: ClipboardList,   labelKey: 'nav.assignments',      permission: { module: 'assignments',     action: 'view'           } },
  { to: '/attendance',       icon: CalendarCheck,   labelKey: 'nav.attendance',       permission: { module: 'attendance',      action: 'view_self'      } },
  { to: '/reports',          icon: BarChart2,       labelKey: 'nav.reports',          permission: { module: 'reports', action: 'view_self' } },
  { to: '/standup',          icon: ClipboardList,   labelKey: 'nav.standup',          permission: { module: 'standup',         action: 'manage'         } },
  { to: '/task-request',     icon: Send,            labelKey: 'nav.taskRequest',      permission: { module: 'hub',             action: 'send_tasks'     } },
  { to: '/material-request', icon: Package,         labelKey: 'nav.materialRequest',  permission: { module: 'materials',       action: 'request_submit' } },
  { to: '/purchase-orders',  icon: FileText,        labelKey: 'nav.purchaseOrders',   permission: { module: 'purchase_orders', action: 'view'           } },
  { to: '/surplus',          icon: Recycle,         labelKey: 'nav.surplus',          permission: { module: 'materials',       action: 'surplus_view'   } },
  { to: '/tools',            icon: Wrench,          labelKey: 'nav.tools',            permission: { module: 'materials',       action: 'request_submit' } },
  { to: '/expenses',         icon: ReceiptText,     labelKey: 'nav.expenses',         permission: { module: 'expense_claims',  action: 'submit'         } },
  { to: '/my-hub',           icon: Inbox,           labelKey: 'nav.myHub',            permission: null, badge: true },
]


export default function AppLayout() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const { can, loading: permsLoading } = usePermissions()
  const { installPrompt, isOnline, updateAvailable, promptInstall, applyUpdate } = usePWA()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [hubCount, setHubCount] = useState(0)

  const canMaterialsInbox  = !permsLoading && can('hub', 'materials_inbox')
  const canAttendanceApprove = !permsLoading && can('attendance', 'approve')

  // Materials inbox count
  useEffect(() => {
    if (!canMaterialsInbox) return
    const fetchCount = async () => {
      try {
        const r = await api.get('/materials/inbox/count')
        setHubCount(prev => {
          // preserve attendance portion — recalculate below
          return r.data.count || 0
        })
      } catch (_) {}
    }
    fetchCount()
    const interval = setInterval(fetchCount, 60_000)
    return () => clearInterval(interval)
  }, [canMaterialsInbox])

  // Attendance pending count (CHECKED_OUT awaiting foreman confirm)
  const [attendancePending, setAttendancePending] = useState(0)
  useEffect(() => {
    if (!canAttendanceApprove) return
    const fetchAttendance = async () => {
      try {
        const today = new Date().toISOString().split('T')[0]
        const r = await api.get(`/attendance?date=${today}`)
        const count = (r.data.records || []).filter(rec => rec.attendance_status === 'CHECKED_OUT').length
        setAttendancePending(count)
      } catch (_) {}
    }
    fetchAttendance()
    const interval = setInterval(fetchAttendance, 30_000)
    return () => clearInterval(interval)
  }, [canAttendanceApprove])

  const totalHubCount = hubCount + attendancePending

  const handleLogout = () => { logout(); navigate('/login') }

  const canSeeReports = !permsLoading && (
    can('reports', 'view') ||
    can('reports', 'view_self')
  )
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
  const canSeeSurplus = !permsLoading && (
    can('materials', 'surplus_view') ||
    can('materials', 'surplus_declare')
  )
  const canSeeTools = !permsLoading && (
    can('materials', 'request_submit') ||
    can('materials', 'surplus_view')
  )
  const canSeeExpenses = !permsLoading && (
    can('expense_claims', 'submit') ||
    can('expense_claims', 'view')
  )

  const visibleMain = mainNav.filter(item => {
    if (!item.permission) return true
    if (permsLoading) return false
    if (item.to === '/reports')          return canSeeReports
    if (item.to === '/attendance')       return canSeeAttendance
    if (item.to === '/material-request') return canSeeMaterials
    if (item.to === '/purchase-orders')  return canSeePurchaseOrders
    if (item.to === '/surplus')           return canSeeSurplus
    if (item.to === '/tools')             return canSeeTools
    if (item.to === '/expenses')          return canSeeExpenses
    return can(item.permission.module, item.permission.action)
  })

  const showUserMgmt    = !permsLoading && can('settings', 'user_management')
  const showPermissions = !permsLoading && can('settings', 'permissions')
  const showSettings    = !permsLoading && can('settings', 'company')
  // Phase 6-D-5 PR 1+2: Subscription + Billing pages reuse `settings.company`
  // (COMPANY_ADMIN + IT_ADMIN + SUPER_ADMIN). Foremen/workers never see them.
  const showSubscription = !permsLoading && can('settings', 'company')
  const showBilling      = !permsLoading && can('settings', 'company')

  return (
    <>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 flex flex-col bg-[#0f172a] text-slate-300 flex-shrink-0">

          {/* Brand */}
          <div className="flex items-center gap-2 px-5 py-5 border-b border-slate-800">
            <Building2 size={20} className="text-primary-light" />
            <span className="font-bold text-white text-sm">{t('common.appName')}</span>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">

            {visibleMain.map(({ to, icon: Icon, labelKey, badge }) => (
              <NavLink key={to} to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Icon size={16} />
                <span className="flex-1">{t(labelKey)}</span>
                {badge && totalHubCount > 0 && (
                  <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {totalHubCount > 99 ? '99+' : totalHubCount}
                  </span>
                )}
              </NavLink>
            ))}

            <div className="pt-2 pb-1">
              <div className="border-t border-slate-800" />
            </div>

            {/* User Management */}
            {showUserMgmt && (
              <NavLink to="/user-management"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Users size={16} />{t('nav.userManagement')}
              </NavLink>
            )}

            {/* Subscription (Phase 6-D-5 PR 1) */}
            {showSubscription && (
              <NavLink to="/subscription"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Receipt size={16} />{t('nav.subscription')}
              </NavLink>
            )}

            {/* Billing — Invoices (Phase 6-D-5 PR 2) */}
            {showBilling && (
              <NavLink to="/billing/invoices"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <CreditCard size={16} />{t('nav.billing')}
              </NavLink>
            )}

            {/* Permissions */}
            {showPermissions && (
              <NavLink to="/permissions"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Shield size={16} />{t('nav.permissions')}
              </NavLink>
            )}

            {/* Settings */}
            {showSettings && (
              <NavLink to="/settings"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Settings size={16} />{t('nav.settings')}
              </NavLink>
            )}

          </nav>

          {/* User */}
          <div className="px-4 py-4 border-t border-slate-800">
            <div className="text-xs text-slate-500 mb-1 truncate">{user?.company_name || t('nav.companyFallback')}</div>
            <div className="flex items-center justify-between gap-2">
              <NavLink to="/profile" className="min-w-0 flex-1 hover:opacity-80 transition-opacity">
                <div className="text-sm font-medium text-white truncate">{user?.username}</div>
                <div className="text-xs text-primary-light">{user?.role}</div>
              </NavLink>
              <button onClick={handleLogout}
                className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title={t('nav.logout')}
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-auto bg-slate-50 flex flex-col">

          {/* Offline banner */}
          {!isOnline && (
            <div className="flex-shrink-0 flex items-center justify-center gap-2 bg-amber-500 text-white text-xs font-semibold py-2 px-4">
              <WifiOff size={13} />
              {t('layout.offline')}
            </div>
          )}

          {/* Update banner */}
          {updateAvailable && (
            <div className="flex-shrink-0 flex items-center justify-between gap-2 bg-primary text-white text-xs font-semibold py-2 px-4">
              <span>{t('layout.updateAvailable')}</span>
              <button onClick={applyUpdate}
                className="flex items-center gap-1.5 px-3 py-1 bg-white text-primary rounded-full font-bold hover:bg-primary-pale transition-colors">
                <RefreshCw size={11} />{t('layout.updateNow')}
              </button>
            </div>
          )}

          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Install App prompt */}
      {installPrompt && (
        <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-6 md:max-w-sm">
          <div className="bg-slate-900 text-white rounded-2xl shadow-2xl p-4 flex items-center gap-3 border border-slate-700">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
              <Download size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{t('layout.installTitle')}</p>
              <p className="text-xs text-slate-400 mt-0.5">{t('layout.installSubtitle')}</p>
            </div>
            <button onClick={promptInstall}
              className="flex-shrink-0 px-3 py-1.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-lg transition-colors">
              {t('layout.installButton')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
