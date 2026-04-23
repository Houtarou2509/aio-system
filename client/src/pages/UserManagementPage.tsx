import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { AddUserModal } from '../components/users/AddUserModal';
import { EditUserModal } from '../components/users/EditUserModal';

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

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleAddUser = async (data: { fullName: string; username: string; email: string; password: string; role: string }) => {
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

  const handleEditUser = async (data: { fullName: string; username: string; email: string; role: string; password?: string }) => {
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

  const roleBadge = (role: string) => {
    const styles: Record<string, string> = {
      ADMIN: 'bg-gray-900 text-white',
      STAFF_ADMIN: 'bg-blue-600 text-white',
      STAFF: 'bg-gray-200 text-gray-800',
      GUEST: 'bg-gray-100 text-gray-600',
    };
    return (
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles[role] || 'bg-gray-100 text-gray-600'}`}>
        {role.replace('_', '-')}
      </span>
    );
  };

  const statusBadge = (status: string) => {
    if (status === 'active') {
      return <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Active</span>;
    }
    return <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Inactive</span>;
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return <span className="italic text-gray-400">Never</span>;
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-600">{error}</p>
        <Button variant="outline" onClick={fetchUsers} className="mt-2">Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2 rounded shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <Button onClick={() => { setServerErrors({}); setShowAddModal(true); }}>+ Add User</Button>
      </div>

      {/* Table */}
      {users.length === 0 ? (
        <p className="text-gray-500 text-center py-12">No users found</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Username</th>
                <th className="text-left px-4 py-3 font-medium">Full Name</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Last Login</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map(u => {
                const isSelf = currentUser?.id === u.id;
                const busy = actionLoading === u.id;
                return (
                  <tr key={u.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3">{u.username}</td>
                    <td className="px-4 py-3">{u.fullName || '—'}</td>
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3">{roleBadge(u.role)}</td>
                    <td className="px-4 py-3">{statusBadge(u.status)}</td>
                    <td className="px-4 py-3">{formatDate(u.lastLogin)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setServerErrors({}); setEditingUser(u); }}>Edit</Button>
                        {u.status === 'active' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 border-red-300 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={isSelf || busy}
                            onClick={() => handleStatusToggle(u)}
                            title={isSelf ? 'Cannot deactivate your own account' : undefined}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-green-600 border-green-300 hover:bg-green-50"
                            disabled={busy}
                            onClick={() => handleStatusToggle(u)}
                          >
                            Activate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <AddUserModal
          onSubmit={handleAddUser}
          onClose={() => setShowAddModal(false)}
          serverErrors={serverErrors}
        />
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          isSelf={currentUser?.id === editingUser.id}
          onSubmit={async (data) => { await handleEditUser(data) }}
          onClose={() => setEditingUser(null)}
          serverErrors={serverErrors}
        />
      )}
    </div>
  );
}
