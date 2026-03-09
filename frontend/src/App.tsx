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
import TelecomManagement from './pages/TelecomManagement';

// Protected Route Component
const PrivateRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) => {
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
  
  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route 
          path="/" 
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/budget" 
          element={
            <PrivateRoute>
              <Budget />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/tiers" 
          element={
            <PrivateRoute>
              <Tiers />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin" 
          element={
            <PrivateRoute allowedRoles={['admin']}>
              <Admin />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/profile" 
          element={
            <PrivateRoute>
              <Profile />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/certif" 
          element={
            <PrivateRoute>
              <Certif />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/mail" 
          element={
            <PrivateRoute allowedRoles={['admin']}>
              <MailSettings />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/email-templates" 
          element={
            <PrivateRoute allowedRoles={['admin']}>
              <EmailTemplates />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/magapp" 
          element={
            <PrivateRoute allowedRoles={['admin']}>
              <MagappAdmin />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/telecom" 
          element={
            <PrivateRoute>
              <TelecomManagement />
            </PrivateRoute>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;



