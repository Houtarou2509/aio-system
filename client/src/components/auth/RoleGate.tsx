import { ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';

interface RoleGateProps {
  roles: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleGate({ roles, children, fallback = null }: RoleGateProps) {
  const { user } = useAuth();
  if (!user) return <>{fallback}</>;
  if (!roles.includes(user.role)) return <>{fallback}</>;
  return <>{children}</>;
}