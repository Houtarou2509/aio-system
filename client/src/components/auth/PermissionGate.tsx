import { ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';

interface PermissionGateProps {
  permissions: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGate({ permissions, children, fallback = null }: PermissionGateProps) {
  const { user } = useAuth();
  if (!user || !user.permissions) return <>{fallback}</>;
  const hasAll = permissions.every(p => user.permissions.includes(p));
  if (!hasAll) return <>{fallback}</>;
  return <>{children}</>;
}
