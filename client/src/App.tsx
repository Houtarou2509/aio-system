import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/auth';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import Setup2FaPage from './pages/Setup2FaPage';
import DashboardPage from './pages/DashboardPage';
import AssetsPage from './pages/AssetsPage';
import AuditPage from './pages/AuditPage';
import GuestAssetPage from './pages/GuestAssetPage';
import SettingsPage from './pages/SettingsPage';
import UserManagementPage from './pages/UserManagementPage';
import InventoryLookupPage from './pages/InventoryLookupPage';
import AccountabilityLookupPage from './pages/AccountabilityLookupPage';
import ProfilesPage from './pages/ProfilesPage';
import IssuancesPage from './pages/IssuancesPage';
import './index.css';

function App() {
  return (
    <BrowserRouter basename="/aio-system">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup-2fa" element={<ProtectedRoute><Setup2FaPage /></ProtectedRoute>} />
          <Route path="/guest/:token" element={<GuestAssetPage />} />

          {/* All authenticated routes share the sidebar layout */}
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="assets" element={<AssetsPage />} />
            <Route path="labels" element={<Navigate to="/assets" replace />} />
            <Route path="users" element={<ProtectedRoute requiredRole="ADMIN"><UserManagementPage /></ProtectedRoute>} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="lookup" element={<ProtectedRoute requiredRole={["ADMIN","STAFF_ADMIN"] as any}><InventoryLookupPage /></ProtectedRoute>} />
            <Route path="accountability-lookup" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN'] as any}><AccountabilityLookupPage /></ProtectedRoute>} />
            <Route path="profiles" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN'] as any}><ProfilesPage /></ProtectedRoute>} />
            <Route path="issuances" element={<ProtectedRoute requiredRole={['ADMIN','STAFF_ADMIN'] as any}><IssuancesPage /></ProtectedRoute>} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
