import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from '../components/notifications/NotificationBell';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/assets', label: 'Assets', icon: '📦' },
  { to: '/users', label: 'Users', icon: '👥', adminOnly: true },
  { to: '/audit', label: 'Audit Trail', icon: '📋' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
      isActive
        ? 'bg-primary text-primary-foreground font-medium'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-border bg-card">
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-bold">AIO System</h1>
          <p className="text-xs text-muted-foreground">Asset Inventory</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.filter(item => !item.adminOnly || user?.role === 'ADMIN').map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={linkClass}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2">
            <NotificationBell />
            <div className="px-3 py-1 text-xs text-muted-foreground">
              {user?.username} · {user?.role}
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full mt-1 flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <h1 className="text-base font-bold">AIO</h1>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button onClick={() => setMobileOpen(!mobileOpen)} className="text-xl">
            {mobileOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setMobileOpen(false)}>
          <div className="w-56 h-full bg-card border-r border-border p-3 space-y-1 pt-16" onClick={e => e.stopPropagation()}>
            {navItems.filter(item => !item.adminOnly || user?.role === 'ADMIN').map(item => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={linkClass} onClick={() => setMobileOpen(false)}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
            <div className="pt-3 border-t border-border mt-3">
              <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10">
                <span>🚪</span><span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto md:p-0 p-12 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}