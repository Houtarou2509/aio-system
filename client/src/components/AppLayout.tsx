import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BookOpen, Settings2, LayoutDashboard, Package, Wrench, Users, LogOut, Menu, X, FileSignature, Database, FileText, Sun, Moon, BarChart3, ScanLine } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from '../components/notifications/NotificationBell';
import { useTheme } from '../context/ThemeContext';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import ShortcutsHelpModal from '../components/ShortcutsHelpModal';

/* ─── Navigation Sections ─── */
const inventoryNav = [
  { to: '/', label: 'Dashboard', IconComponent: LayoutDashboard, end: true },
  { to: '/assets', label: 'Assets', IconComponent: Package },
  { to: '/maintenance-calendar', label: 'Maintenance', IconComponent: Wrench },
  { to: '/reports', label: 'Reports', IconComponent: BarChart3 },
  { to: '/lookup', label: 'Inventory Lookup', IconComponent: BookOpen, roles: ['ADMIN', 'STAFF_ADMIN'] },
];

const issuanceNav = [
  { to: '/profiles', label: 'Profiles', IconComponent: Users, roles: ['ADMIN', 'STAFF_ADMIN'] },
  { to: '/issuances', label: 'Issuances', IconComponent: FileSignature, roles: ['ADMIN', 'STAFF_ADMIN'] },
  { to: '/accountability-lookup', label: 'Accountability Lookup', IconComponent: Database, roles: ['ADMIN', 'STAFF_ADMIN'] },
  { to: '/accountability/templates', label: 'Agreement Templates', IconComponent: FileText, roles: ['ADMIN'] },
];

const systemNav: Array<{ to: string; label: string; IconComponent: any; roles?: string[] }> = [
  { to: '/settings', label: 'Admin Hub', IconComponent: Settings2 },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { helpOpen, setHelpOpen } = useKeyboardShortcuts();

  const visibleInventory = inventoryNav.filter(item => !item.roles || item.roles.includes(user?.role || ''));
  const visibleIssuance = issuanceNav.filter(item => !item.roles || item.roles.includes(user?.role || ''));
  const visibleSystem = systemNav.filter(item => !item.roles || item.roles.includes(user?.role || ''));

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? 'relative flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-semibold bg-[#f8931f] text-white before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-1 before:h-5 before:rounded-r before:bg-white'
      : 'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-white/10 hover:text-[#f8931f] transition-colors';

  return (
    <div className="flex h-screen bg-light-bg dark:bg-slate-900">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex w-56 flex-col bg-[#012061]">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-[#001a4d] flex items-center min-h-[56px]">
          <h1 className="text-lg font-bold tracking-tight text-[#f8931f]">AIO System</h1>
        </div>

        {/* Navigation — Inventory */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          <div className="px-3 pt-2 pb-1">
            <span className="text-[10px] tracking-widest font-semibold text-slate-500 dark:text-slate-400 uppercase">Inventory</span>
          </div>
          {visibleInventory.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end ?? (item.to === '/')} className={linkClass}>
              <item.IconComponent className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* Issuance */}
          <div className="px-3 pt-4 pb-1 border-t border-[#001a4d] mt-2">
            <span className="text-[10px] tracking-widest font-semibold text-slate-500 dark:text-slate-400 uppercase">Accountability</span>
          </div>
          {visibleIssuance.map(item => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              <item.IconComponent className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* System */}
          <div className="px-3 pt-4 pb-1 border-t border-[#001a4d] mt-2">
            <span className="text-[10px] tracking-widest font-semibold text-slate-500 dark:text-slate-400 uppercase">System</span>
          </div>
          {visibleSystem.map(item => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              <item.IconComponent className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Profile & Logout */}
        <div className="relative px-3 py-3 border-t border-[#001a4d] bg-black/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="relative z-50">
              <NotificationBell />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white leading-tight truncate">{user?.fullName}</p>
              <p className="text-[10px] tracking-widest font-medium text-[#f8931f] uppercase">{user?.role?.replace('_', '-')}</p>
            </div>
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md text-slate-400 hover:text-[#f8931f] hover:bg-white/10 transition-colors shrink-0"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-400 hover:bg-[#7B1113] hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile Header ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between bg-[#012061] px-4 py-4 min-h-[56px]">
        <h1 className="text-lg font-bold tracking-tight text-[#f8931f]">AIO System</h1>
        <div className="flex items-center gap-2">
          <div className="relative z-50">
            <NotificationBell />
          </div>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="text-white/70 hover:text-white">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* ── Mobile Nav Overlay ── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) setMobileOpen(false); }}>
          <div className="w-56 h-full bg-[#012061] border-r border-[#001a4d] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Mobile Nav Links — fills remaining space, scrolls if needed */}
            <nav className="flex-1 px-3 py-2 space-y-0.5 pt-20 overflow-y-auto">
              <div className="px-3 pt-2 pb-1">
                <span className="text-[10px] tracking-widest font-semibold text-slate-500 dark:text-slate-400 uppercase">Inventory</span>
              </div>
              {visibleInventory.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end ?? (item.to === '/')} className={linkClass} onClick={() => setMobileOpen(false)}>
                  <item.IconComponent className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              ))}

              <div className="px-3 pt-4 pb-1 border-t border-[#001a4d] mt-2">
                <span className="text-[10px] tracking-widest font-semibold text-slate-500 dark:text-slate-400 uppercase">Accountability</span>
              </div>
              {visibleIssuance.map(item => (
                <NavLink key={item.to} to={item.to} className={linkClass} onClick={() => setMobileOpen(false)}>
                  <item.IconComponent className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              ))}

              <div className="px-3 pt-4 pb-1 border-t border-[#001a4d] mt-2">
                <span className="text-[10px] tracking-widest font-semibold text-slate-500 dark:text-slate-400 uppercase">System</span>
              </div>
              {visibleSystem.map(item => (
                <NavLink key={item.to} to={item.to} className={linkClass} onClick={() => setMobileOpen(false)}>
                  <item.IconComponent className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            {/* Mobile Profile & Logout — pinned to bottom */}
            <div className="shrink-0 bg-black/20 px-3 py-3 border-t border-[#001a4d]">
              <div className="mb-2">
                <p className="text-sm font-semibold text-white leading-tight">{user?.fullName}</p>
                <p className="text-[10px] tracking-widest font-medium text-[#f8931f] uppercase">{user?.role?.replace('_', '-')}</p>
              </div>
              <button
                onClick={() => { setMobileOpen(false); logout(); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-400 hover:bg-[#7B1113] hover:text-white transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-auto md:pb-0 pb-16 md:pt-0 bg-[#012061] md:bg-transparent">
        <Outlet />
      </main>

      {/* ── Mobile Bottom Tab Bar (md:hidden) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#012061] border-t border-[#001a4d] flex items-center justify-around safe-bottom"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {[
          { to: '/', icon: LayoutDashboard, label: 'Home', end: true },
          { to: '/assets', icon: Package, label: 'Assets' },
          { to: '/assets?action=scan', icon: ScanLine, label: 'Scan' },
          { to: '/reports', icon: BarChart3, label: 'Reports' },
          { to: '/issuances', icon: FileSignature, label: 'Issuances', roles: ['ADMIN', 'STAFF_ADMIN'] },
        ].filter(item => !item.roles || item.roles.includes(user?.role || '')).slice(0, 5).map(item => {
          const isActive = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to.replace(/\/$/, '')) && item.to !== '/';
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 px-3 min-w-[44px] min-h-[44px] transition-colors duration-200 ${
                isActive ? 'text-[#f8931f]' : 'text-white/50 hover:text-white/80'
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[9px] font-medium leading-none">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Keyboard Shortcuts Help Modal */}
      <ShortcutsHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}