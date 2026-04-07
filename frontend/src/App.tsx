import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Admin from './pages/Admin';
import Budget from './pages/Budget';
import Profile from './pages/Profile';
import Certif from './pages/Certif';
import MailSettings from './pages/MailSettings';
import EmailTemplates from './pages/EmailTemplates';
import Tiers from './pages/Tiers';
import MagappAdmin from './pages/MagappAdmin';
import AdminSQL from './pages/AdminSQL';
import AdminSettings from './pages/AdminSettings';
import TelecomManagement from './pages/TelecomManagement';
import AdminMessages from './pages/AdminMessages';
import AccessRequestPage from './pages/AccessRequestPage';
import AdminAccessRequests from './pages/AdminAccessRequests';
import AccessRequestOverlay from './components/AccessRequestOverlay';
import AdminLayout from './components/AdminLayout';
import StudioRH from './pages/StudioRH';
import FrizbiSettings from './pages/FrizbiSettings';

// Protected Route Component
const PrivateRoute = ({ children, allowedRoles, path }: { children: React.ReactNode, allowedRoles?: string[], path?: string }) => {
  const token = localStorage.getItem('token');
  let user: any = {};
  try {
    const userStr = localStorage.getItem('user');
    user = JSON.parse(userStr || '{}');
  } catch (e) {
    console.error('Erreur lors du parsing du user en localStorage', e);
  }

  if (!token) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" />;
  
  if (path && user.authorized_urls && !user.authorized_urls.includes('*')) {
    // Basic prefix matching or exact matching
    const isAuthorized = user.authorized_urls.some((url: string) => path === url || path.startsWith(url + '/'));
    if (!isAuthorized && path !== '/' && path !== '/profile' && path !== '/request-access') {
       return <Navigate to="/" />;
    }
  }

  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter>
      <AccessRequestOverlay />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/request-access" element={<AccessRequestPage />} />
        
        <Route path="/" element={<PrivateRoute path="/"><Dashboard /></PrivateRoute>} />
        <Route path="/budget" element={<PrivateRoute path="/budget"><Budget /></PrivateRoute>} />
        <Route path="/tiers" element={<PrivateRoute path="/tiers"><Tiers /></PrivateRoute>} />
        <Route path="/profile" element={<PrivateRoute path="/profile"><Profile /></PrivateRoute>} />
        <Route path="/certif" element={<PrivateRoute path="/certif"><Certif /></PrivateRoute>} />
        <Route path="/telecom" element={<PrivateRoute path="/telecom"><TelecomManagement /></PrivateRoute>} />

        {/* Admin Routes with Sidebar Layout */}
        <Route 
          path="/admin" 
          element={
            <PrivateRoute allowedRoles={['admin']}>
              <AdminLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Admin section="main" />} />
          <Route path="users" element={<Admin section="users" />} />
          <Route path="tiles" element={<Admin section="tiles" />} />
          <Route path="ad" element={<Admin section="ad" />} />
          <Route path="azure-ad" element={<Admin section="azure-ad" />} />
          <Route path="glpi" element={<Admin section="glpi" />} />
          <Route path="oracle" element={<Admin section="oracle" />} />
          <Route path="mariadb" element={<Admin section="mariadb" />} />
          <Route path="messages" element={<AdminMessages />} />
          <Route path="access-requests" element={<AdminAccessRequests />} />
          <Route path="mail" element={<MailSettings />} />
          <Route path="email-templates" element={<EmailTemplates />} />
          <Route path="sql" element={<AdminSQL />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="frizbi" element={<FrizbiSettings />} />
        </Route>

        <Route path="/rh" element={<PrivateRoute path="/rh"><StudioRH /></PrivateRoute>} />
        <Route path="/admin/magapp" element={<PrivateRoute allowedRoles={['admin']}><MagappAdmin /></PrivateRoute>} />
        <Route path="/studio-rh" element={<Navigate to="/rh" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
