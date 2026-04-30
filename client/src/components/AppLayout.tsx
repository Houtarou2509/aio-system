import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BookOpen, Settings2, LayoutDashboard, Package, Users, History, LogOut, Menu, X, FileSignature, Database } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NotificationBell from '../components/notifications/NotificationBell';

/* ─── Navigation Sections ─── */
const inventoryNav = [
  { to: '/', label: 'Dashboard', IconComponent: LayoutDashboard, end: true },
  { to: '/assets', label: 'Assets', IconComponent: Package },
  { to: '/lookup', label: 'Inventory Lookup', IconComponent: BookOpen, roles: ['ADMIN', 'STAFF_ADMIN'] },
];

const issuanceNav = [
  { to: '/profiles', label: 'Profiles', IconComponent: Users, roles: ['ADMIN', 'STAFF_ADMIN'] },
  { to: '/issuances', label: 'Issuances', IconComponent: FileSignature, roles: ['ADMIN', 'STAFF_ADMIN'] },
  { to: '/accountability-lookup', label: 'Accountability Lookup', IconComponent: Database, roles: ['ADMIN', 'STAFF_ADMIN'] },
];

const systemNav = [
  { to: '/users', label: 'Users', IconComponent: Users, roles: ['ADMIN'] },
  { to: '/audit', label: 'Audit Trail', IconComponent: History },
  { to: '/settings', label: 'Settings', IconComponent: Settings2 },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleInventory = inventoryNav.filter(item => !item.roles || item.roles.includes(user?.role || ''));
  const visibleIssuance = issuanceNav.filter(item => !item.roles || item.roles.includes(user?.role || ''));
  const visibleSystem = systemNav.filter(item => !item.roles || item.roles.includes(user?.role || ''));

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? 'relative flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-semibold bg-[#f8931f] text-white before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-1 before:h-5 before:rounded-r before:bg-white'
      : 'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-white/10 hover:text-[#f8931f] transition-colors';

  return (
    <div className="flex h-screen bg-slate-50">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex w-56 flex-col bg-[#012061]">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-[#001a4d] flex items-center min-h-[56px]">
          <h1 className="text-lg font-bold tracking-tight text-[#f8931f]">AIO System</h1>
        </div>

        {/* Navigation — Inventory */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          <div className="px-3 pt-2 pb-1">
            <span className="text-[10px] tracking-widest font-semibold text-slate-500 uppercase">Inventory</span>
          </div>
          {visibleInventory.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end ?? (item.to === '/')} className={linkClass}>
              <item.IconComponent className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* Issuance */}
          <div className="px-3 pt-4 pb-1 border-t border-[#001a4d] mt-2">
            <span className="text-[10px] tracking-widest font-semibold text-slate-500 uppercase">Accountability</span>
          </div>
          {visibleIssuance.map(item => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              <item.IconComponent className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* System */}
          <div className="px-3 pt-4 pb-1 border-t border-[#001a4d] mt-2">
            <span className="text-[10px] tracking-widest font-semibold text-slate-500 uppercase">System</span>
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
            <div>
              <p className="text-sm font-semibold text-white leading-tight">{user?.username}</p>
              <p className="text-[10px] tracking-widest font-medium text-[#f8931f] uppercase">{user?.role?.replace('_', '-')}</p>
            </div>
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
        <div className="md:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setMobileOpen(false)}>
          <div className="w-56 h-full bg-[#012061] border-r border-[#001a4d]" onClick={e => e.stopPropagation()}>
            {/* Mobile Nav Links */}
            <nav className="px-3 py-2 space-y-0.5 pt-20 overflow-y-auto">
              <div className="px-3 pt-2 pb-1">
                <span className="text-[10px] tracking-widest font-semibold text-slate-500 uppercase">Inventory</span>
              </div>
              {visibleInventory.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end ?? (item.to === '/')} className={linkClass} onClick={() => setMobileOpen(false)}>
                  <item.IconComponent className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              ))}

              <div className="px-3 pt-4 pb-1 border-t border-[#001a4d] mt-2">
                <span className="text-[10px] tracking-widest font-semibold text-slate-500 uppercase">Accountability</span>
              </div>
              {visibleIssuance.map(item => (
                <NavLink key={item.to} to={item.to} className={linkClass} onClick={() => setMobileOpen(false)}>
                  <item.IconComponent className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              ))}

              <div className="px-3 pt-4 pb-1 border-t border-[#001a4d] mt-2">
                <span className="text-[10px] tracking-widest font-semibold text-slate-500 uppercase">System</span>
              </div>
              {visibleSystem.map(item => (
                <NavLink key={item.to} to={item.to} className={linkClass} onClick={() => setMobileOpen(false)}>
                  <item.IconComponent className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            {/* Mobile Profile & Logout */}
            <div className="absolute bottom-0 left-0 right-0 bg-black/20 px-3 py-3 border-t border-[#001a4d]">
              <div className="mb-2">
                <p className="text-sm font-semibold text-white leading-tight">{user?.username}</p>
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
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}