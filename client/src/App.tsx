import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/auth';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import Setup2FaPage from './pages/Setup2FaPage';
import DashboardPage from './pages/DashboardPage';
import AssetsPage from './pages/AssetsPage';
import AuditPage from './pages/AuditPage';
import GuestAssetPage from './pages/GuestAssetPage';
import AgreementVerificationPage from './pages/AgreementVerificationPage';
import SettingsPage from './pages/SettingsPage';
import UserManagementPage from './pages/UserManagementPage';
import InventoryLookupPage from './pages/InventoryLookupPage';
import AccountabilityLookupPage from './pages/AccountabilityLookupPage';
import AccountabilityTemplatesPage from './pages/AccountabilityTemplatesPage';
import ProfilesPage from './pages/ProfilesPage';
import IssuancesPage from './pages/IssuancesPage';
import ReportsPage from './pages/ReportsPage';
import PurchaseRequestsPage from './pages/PurchaseRequestsPage';
import SuppliersPage from './pages/SuppliersPage';
import NotificationsPage from './pages/NotificationsPage';
import MaintenanceCalendarPage from './pages/MaintenanceCalendarPage';
import BackupManagementPage from './pages/BackupManagementPage';
import AccountabilityReportPage from './pages/AccountabilityReportPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import HelpPage from './pages/HelpPage';
import IssueReportsPage from './pages/IssueReportsPage';
import SystemHealthPage from './pages/SystemHealthPage';
import DataQualityPage from './pages/DataQualityPage';
import './index.css';

function App() {
  return (
    <BrowserRouter basename="/aio-system">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/setup-2fa" element={<ProtectedRoute><Setup2FaPage /></ProtectedRoute>} />
          <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
          <Route path="/guest/:token" element={<GuestAssetPage />} />
          <Route path="/agreements/verify/:documentNumber" element={<AgreementVerificationPage />} />

          {/* All authenticated routes share the sidebar layout */}
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="assets" element={<AssetsPage />} />
            <Route path="reports" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN','STAFF'] as any}><ReportsPage /></ProtectedRoute>} />
            <Route path="suppliers" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN'] as any}><SuppliersPage /></ProtectedRoute>} />
            <Route path="purchase-requests" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN'] as any}><PurchaseRequestsPage /></ProtectedRoute>} />
            <Route path="labels" element={<Navigate to="/assets" replace />} />
            <Route path="users" element={<ProtectedRoute requiredRole="ADMIN"><UserManagementPage /></ProtectedRoute>} />
            <Route path="audit" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN','STAFF'] as any}><AuditPage /></ProtectedRoute>} />
            <Route path="lookup" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN'] as any}><InventoryLookupPage /></ProtectedRoute>} />
            <Route path="accountability-lookup" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN'] as any}><AccountabilityLookupPage /></ProtectedRoute>} />
            <Route path="accountability/templates" element={<ProtectedRoute requiredRole="ADMIN"><AccountabilityTemplatesPage /></ProtectedRoute>} />
            {/* Redirect old template paths */}
            <Route path="templates" element={<Navigate to="/accountability/templates" replace />} />
            <Route path="settings/templates" element={<Navigate to="/accountability/templates" replace />} />
            <Route path="profiles" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN'] as any}><ProfilesPage /></ProtectedRoute>} />
            <Route path="issuances" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN'] as any}><IssuancesPage /></ProtectedRoute>} />
            <Route path="settings" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN','STAFF'] as any}><SettingsPage /></ProtectedRoute>} />
            <Route path="notifications" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN','STAFF'] as any}><NotificationsPage /></ProtectedRoute>} />
            <Route path="maintenance-calendar" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN','STAFF'] as any}><MaintenanceCalendarPage /></ProtectedRoute>} />
            <Route path="backups" element={<ProtectedRoute requiredRole="ADMIN"><BackupManagementPage /></ProtectedRoute>} />
            <Route path="accountability/report" element={<ProtectedRoute requiredRole="ADMIN"><AccountabilityReportPage /></ProtectedRoute>} />
            <Route path="help" element={<HelpPage />} />
            <Route path="issues" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN'] as any}><IssueReportsPage /></ProtectedRoute>} />
            <Route path="system-health" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN'] as any}><SystemHealthPage /></ProtectedRoute>} />
            <Route path="data-quality" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN'] as any}><DataQualityPage /></ProtectedRoute>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
