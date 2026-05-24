import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert } from 'lucide-react';

export function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: string | string[] }) {
  const { isAuthenticated, isLoading, user, mustChangePassword } = useAuth();
  const location = useLocation();

  // Wait for auth to be restored from localStorage before redirecting
  if (isLoading) return null;

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // If user must change password, redirect to change-password page
  if (mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!roles.includes(user?.role || '')) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-light-bg dark:bg-slate-900 p-8">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/30 mb-6">
            <ShieldAlert className="h-10 w-10 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Access Denied</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md">
            You don't have access to this page or feature. Please contact your Administrator.
          </p>
        </div>
      );
    }
  }
  return <>{children}</>;
}