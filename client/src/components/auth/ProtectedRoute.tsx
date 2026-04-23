import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: string | string[] }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  // Wait for auth to be restored from localStorage before redirecting
  if (isLoading) return null;

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!roles.includes(user?.role || '')) return <Navigate to="/assets" replace />;
  }
  return <>{children}</>;
}
