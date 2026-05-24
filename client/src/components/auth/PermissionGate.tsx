import { ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';

interface PermissionGateProps {
  permissions: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGate({ permissions, children, fallback = null }: PermissionGateProps) {
  const { user } = useAuth();
  if (!user) return <>{fallback}</>;

  // ADMIN role bypass — mirrors backend hasPermission() where ADMIN always passes
  if (user.role === 'ADMIN') return <>{children}</>;

  // Ensure permissions is a parsed array (may be JSON string from API)
  const userPerms: string[] = Array.isArray(user.permissions)
    ? user.permissions
    : (() => { try { return JSON.parse(user.permissions as unknown as string || '[]'); } catch { return []; } })();

  if (userPerms.length === 0) return <>{fallback}</>;
  const hasAll = permissions.every(p => userPerms.includes(p));
  if (!hasAll) return <>{fallback}</>;
  return <>{children}</>;
}