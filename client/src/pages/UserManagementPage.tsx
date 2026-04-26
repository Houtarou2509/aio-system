import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { AddUserModal } from '../components/users/AddUserModal';
import { EditUserModal } from '../components/users/EditUserModal';
import { Users, Shield, Clock, Search, Edit3, UserX, UserCheck, UserPlus, Activity } from 'lucide-react';

interface User {
  id: string;
  username: string;
  fullName: string | null;
  email: string;
  role: string;
  status: string;
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

  // ── Clock ──
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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
          isNavy ? 'text-white' : 'bg-slate-100 text-slate-600'
        }`}
        style={isNavy ? { backgroundColor: '#012061' } : undefined}
      >
        {role.replace('_', '-')}
      </span>
    );
  };

  const statusBadge = (status: string) =>
    status === 'active' ? (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#012061]/5 text-[#012061]">
        <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-emerald-500" />
        Active
      </span>
    ) : (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
        <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-slate-400" />
        Inactive
      </span>
    );

  const formatDate = (iso: string | null) => {
    if (!iso) return <span className="italic text-slate-400">Never</span>;
    return (
      <span className="text-sm text-slate-500">
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
    <div className="min-h-screen bg-slate-50">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 text-white px-4 py-2 rounded-lg shadow-lg text-sm"
          style={{ backgroundColor: '#012061' }}
        >
          {toast}
        </div>
      )}

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">User Management</h1>
          </div>
          <span className="hidden sm:flex items-center gap-2 text-xs text-white/60 bg-white/10 rounded-lg px-3 py-2 tabular-nums">
            <Activity className="w-3.5 h-3.5" />
            {now.toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            {' · '}
            {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </header>

      {/* ── KPI Bar ── */}
      <div className="grid grid-cols-3 gap-4 px-6 pt-4 pb-2">
        <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-slate-100">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#012061]/5">
            <Users className="h-5 w-5 text-[#f8931f]" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-tight text-[#f8931f]">{kpis.totalUsers}</p>
            <p className="text-[10px] tracking-widest text-slate-500 uppercase">Total Users</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-slate-100">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#012061]/5">
            <Shield className="h-5 w-5 text-[#f8931f]" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-tight text-[#f8931f]">{kpis.activeAdmins}</p>
            <p className="text-[10px] tracking-widest text-slate-500 uppercase">Active Admins</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-slate-100">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#012061]/5">
            <Clock className="h-5 w-5 text-[#f8931f]" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-tight text-[#f8931f]">{kpis.recentlyLoggedIn}</p>
            <p className="text-[10px] tracking-widest text-slate-500 uppercase">Active Users</p>
          </div>
        </div>
      </div>

      {/* ── Action Toolbar ── */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-slate-200">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, username, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f8931f] focus:border-transparent transition"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#f8931f] focus:border-transparent"
          >
            <option value="All">All Roles</option>
            <option value="ADMIN">Admin</option>
            <option value="STAFF_ADMIN">Staff-Admin</option>
            <option value="STAFF">Staff</option>
            <option value="GUEST">Guest</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#f8931f] focus:border-transparent"
          >
            <option value="All">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <button
          onClick={() => {
            setServerErrors({});
            setShowAddModal(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm hover:shadow-md transition-all"
          style={{ backgroundColor: '#f8931f' }}
        >
          <UserPlus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* ── Table ── */}
      <div className="px-6">
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#012061]/5 mb-3">
              <Users className="h-6 w-6 text-[#f8931f]" />
            </div>
            <p className="text-sm font-medium text-[#012061]">No Users Found</p>
            <p className="text-xs text-slate-400 mt-1">Add your first user to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#012061]">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/80">
                    User
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/80">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/80">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/80">
                    Last Login
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/80">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((u) => {
                  const isSelf = currentUser?.id === u.id;
                  const busy = actionLoading === u.id;
                  return (
                    <tr
                      key={u.id}
                      className="group hover:bg-slate-50 transition-colors"
                      style={{
                        borderLeftWidth: '2px',
                        borderLeftStyle: 'solid',
                        borderLeftColor: 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderLeftColor = '#f8931f';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderLeftColor = 'transparent';
                      }}
                    >
                      {/* User (Avatar + Name + Email) */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                            style={{ backgroundColor: '#012061' }}
                          >
                            {getInitials(u.fullName || u.username)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[#012061]">
                              {u.fullName || u.username}
                            </p>
                            <p className="text-xs text-slate-400">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="px-4 py-3">{roleBadge(u.role)}</td>

                      {/* Status Badge */}
                      <td className="px-4 py-3">{statusBadge(u.status)}</td>

                      {/* Last Login */}
                      <td className="px-4 py-3">{formatDate(u.lastLogin)}</td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setServerErrors({});
                              setEditingUser(u);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md text-[#f8931f] hover:bg-[#f8931f]/10 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          {u.status === 'active' ? (
                            <button
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              disabled={isSelf || busy}
                              onClick={() => handleStatusToggle(u)}
                              title={isSelf ? 'Cannot deactivate your own account' : undefined}
                            >
                              <UserX className="w-3.5 h-3.5" />
                              Deactivate
                            </button>
                          ) : (
                            <button
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors"
                              disabled={busy}
                              onClick={() => handleStatusToggle(u)}
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              Activate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-slate-400 text-sm"
                    >
                      No users match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add User Modal ── */}
      {showAddModal && (
        <AddUserModal
          onSubmit={handleAddUser}
          onClose={() => setShowAddModal(false)}
          serverErrors={serverErrors}
        />
      )}

      {/* ── Edit User Modal ── */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          isSelf={currentUser?.id === editingUser.id}
          onSubmit={async (data) => {
            await handleEditUser(data);
          }}
          onClose={() => setEditingUser(null)}
          serverErrors={serverErrors}
        />
      )}
    </div>
  );
}