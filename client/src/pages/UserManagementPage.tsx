import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { AddUserModal } from '../components/users/AddUserModal';
import { EditUserModal } from '../components/users/EditUserModal';
import { Users, Shield, Search, Edit3, UserX, UserCheck, UserPlus, Activity, Download } from 'lucide-react';

interface User {
  id: string;
  username: string;
  fullName: string | null;
  email: string;
  role: string;
  status: string;
  permissions: string[];
  lastLogin: string | null;
  createdAt: string;
}

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

export default function UserManagementPage() {
  const { user: currentUser, accessToken } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const token = accessToken || localStorage.getItem('accessToken');
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to fetch users');
      setUsers(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAddUser = async (data: {
    fullName: string;
    username: string;
    email: string;
    password: string;
    role: string;
    permissions: string[];
  }) => {
    setServerErrors({});
    try {
      const token = accessToken || localStorage.getItem('accessToken');
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!result.success) {
        if (result.error?.message?.includes('Username')) {
          setServerErrors({ username: 'Username already taken' });
        } else if (result.error?.message?.includes('Email')) {
          setServerErrors({ email: 'Email already in use' });
        } else {
          showToast('Failed to create user. Try again.');
        }
        throw new Error(result.error?.message);
      }
      showToast('User created successfully');
      setShowAddModal(false);
      await fetchUsers();
    } catch {
      throw new Error('failed');
    }
  };

  const handleEditUser = async (data: {
    fullName: string;
    username: string;
    email: string;
    role: string;
    password?: string;
    permissions: string[];
  }) => {
    if (!editingUser) return { success: false };
    setServerErrors({});
    try {
      const token = accessToken || localStorage.getItem('accessToken');
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!result.success) {
        if (result.error?.message?.includes('Username')) {
          setServerErrors({ username: 'Username already taken' });
        } else if (result.error?.message?.includes('Email')) {
          setServerErrors({ email: 'Email already in use' });
        } else {
          showToast('Failed to update user. Try again.');
        }
        throw new Error(result.error?.message);
      }
      showToast('User updated successfully');
      setEditingUser(null);
      await fetchUsers();
    } catch {
      throw new Error('failed');
    }
  };

  const handleStatusToggle = async (user: User) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    if (newStatus === 'inactive') {
      const confirmed = window.confirm(
        `Deactivate ${user.username}? They will no longer be able to log in.`
      );
      if (!confirmed) return;
    }
    try {
      setActionLoading(user.id);
      const token = accessToken || localStorage.getItem('accessToken');
      const res = await fetch(`/api/users/${user.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to update status');
      showToast(`${user.username} is now ${newStatus}`);
      await fetchUsers();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Export ──
  const [exportLoading, setExportLoading] = useState(false);

  const handleExportCSV = () => {
    setExportLoading(true);
    try {
      const headers = ['ID', 'Username', 'Full Name', 'Email', 'Role', 'Status', 'Last Login', 'Created At'];
      const esc = (val: string | number | null | undefined) => {
        if (val == null) return '';
        const s = String(val);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const rows = users.map(u => [
        esc(u.id),
        esc(u.username),
        esc(u.fullName),
        esc(u.email),
        esc(u.role),
        esc(u.status),
        esc(u.lastLogin ? new Date(u.lastLogin).toISOString().split('T')[0] : ''),
        esc(u.createdAt ? new Date(u.createdAt).toISOString().split('T')[0] : ''),
      ].join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err: any) {
      // silently fail
    }
    setExportLoading(false);
  };

  // ── KPIs ──
  const kpis = {
    totalUsers: users.length,
    activeAdmins: users.filter((u) => u.role === 'ADMIN' && u.status === 'active').length,
    recentlyLoggedIn: users.filter((u) => u.status === 'active').length,
  };

  // ── Filtered users ──
  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      u.username.toLowerCase().includes(q) ||
      (u.fullName || '').toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q);
    const matchRole = roleFilter === 'All' || u.role === roleFilter;
    const matchStatus = statusFilter === 'All' || u.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  // ── Badges ──
  const roleBadge = (role: string) => {
    const isNavy = role === 'ADMIN' || role === 'STAFF_ADMIN';
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
          isNavy ? 'text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
        }`}
        style={isNavy ? { backgroundColor: '#012061' } : undefined}
      >
        {role.replace('_', '-')}
      </span>
    );
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return <span className="italic text-slate-400">Never</span>;
    return (
      <span className="text-sm text-slate-500 dark:text-slate-400">
        {new Date(iso).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })}
      </span>
    );
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{ borderColor: '#f8931f' }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-600">{error}</p>
        <Button variant="outline" onClick={fetchUsers} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen pt-14 md:pt-0 bg-[#012061] md:bg-transparent">

      {/* ═══ STICKY NAVY HEADER ═════════════════════════════ */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Title */}
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">Users</h1>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button onClick={handleExportCSV} disabled={exportLoading || users.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {exportLoading ? 'Exporting…' : 'Export CSV'}
            </button>
            <button
              onClick={() => { setServerErrors({}); setShowAddModal(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#f8931f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors"
            >
              <UserPlus className="h-3.5 w-3.5" /> Add User
            </button>
          </div>
        </div>
      </header>

      {/* ═══ CONTENT AREA ════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-auto bg-light-bg dark:bg-slate-900">

      {/* ═══ KPI TILES ═══════════════════════════════════════ */}
      <section className="px-6 pt-4 shrink-0">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f8931f]/10">
              <Users className="h-5 w-5 text-[#f8931f]" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold leading-tight text-[#f8931f]">{kpis.totalUsers}</p>
              <p className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase">Total Users</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f8931f]/10">
              <Shield className="h-5 w-5 text-[#f8931f]" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold leading-tight text-[#f8931f]">{kpis.activeAdmins}</p>
              <p className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase">Admins</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f8931f]/10">
              <Activity className="h-5 w-5 text-[#f8931f]" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold leading-tight text-[#f8931f]">{kpis.recentlyLoggedIn}</p>
              <p className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase">Active</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HORIZONTAL FILTER BAR ══════════════════════════ */}
      <section className="px-6 pt-3 pb-2 shrink-0">
        <div className="flex flex-row items-center gap-4 flex-wrap bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, username, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-9 pr-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors"
            />
          </div>

          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 h-8 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
          >
            <option value="All">Role: All</option>
            <option value="ADMIN">Role: Admin</option>
            <option value="STAFF_ADMIN">Role: Staff-Admin</option>
            <option value="STAFF">Role: Staff</option>
            <option value="GUEST">Role: Guest</option>
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 h-8 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
          >
            <option value="All">Status: All</option>
            <option value="active">Status: Active</option>
            <option value="inactive">Status: Inactive</option>
          </select>
        </div>
      </section>

      {/* Toast */}
      {toast && (
        <div className="shrink-0 px-6 py-2 bg-[#f8931f]/10 border-b border-[#f8931f]/20 text-sm text-[#012061] dark:text-slate-100 text-center font-medium">
          {toast}
        </div>
      )}

      {/* ═══ TABLE or EMPTY STATE ═══════════════════════════ */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#f8931f]/10 mb-4">
              <Users className="h-10 w-10 text-[#f8931f]" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">No users yet</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-xs">
              Add users to grant access to the system.
            </p>
            <button onClick={() => { setServerErrors({}); setShowAddModal(true); }}
              className="inline-flex items-center gap-2 rounded-lg bg-[#f8931f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors">
              <UserPlus className="h-4 w-4" /> Add User
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#012061] text-left">
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">User</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Role</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Status</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Last Login</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((u) => {
                  const isSelf = currentUser?.id === u.id;
                  const busy = actionLoading === u.id;
                  return (
                    <tr key={u.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-all group">
                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white bg-[#012061]">
                            {getInitials(u.fullName || u.username)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[#012061] dark:text-slate-100">
                              {u.fullName || u.username}
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">{roleBadge(u.role)}</td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {u.status === 'active' ? (
                          <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200 border border-emerald-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Last Login */}
                      <td className="px-4 py-3">{formatDate(u.lastLogin)}</td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setServerErrors({}); setEditingUser(u); }}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-[#f8931f] transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {u.status === 'active' ? (
                            <button
                              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-slate-400 hover:text-[#7B1113] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              disabled={isSelf || busy}
                              onClick={() => handleStatusToggle(u)}
                              title={isSelf ? 'Cannot deactivate your own account' : 'Deactivate'}
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950 text-slate-400 hover:text-emerald-600 transition-colors"
                              disabled={busy}
                              onClick={() => handleStatusToggle(u)}
                              title="Activate"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400 text-sm bg-white dark:bg-slate-800">
                      No users match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ MODALS ════════════════════════════════════════ */}
      {showAddModal && (
        <AddUserModal onSubmit={handleAddUser} onClose={() => setShowAddModal(false)} serverErrors={serverErrors} />
      )}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          isSelf={currentUser?.id === editingUser.id}
          onSubmit={async (data) => { await handleEditUser(data); }}
          onClose={() => setEditingUser(null)}
          serverErrors={serverErrors}
        />
      )}
      </div>{/* close content area */}
    </div>
  );
}