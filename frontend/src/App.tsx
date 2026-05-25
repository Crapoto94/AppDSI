import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Admin from './pages/Admin';
import Budget from './pages/Budget';
import Profile from './pages/Profile';
import Certif from './pages/Certif';
import MesTaches from './pages/MesTaches';
import MailSettings from './pages/MailSettings';
import EmailTemplates from './pages/EmailTemplates';
import Tiers from './pages/Tiers';
import MagappAdmin from './pages/MagappAdmin';
import AdminSQL from './pages/AdminSQL';
import AdminSettings from './pages/AdminSettings';
import AdminFinance from './pages/AdminFinance';
import TelecomManagement from './pages/TelecomManagement';
import AdminMessages from './pages/AdminMessages';
import AdminIdeas from './pages/AdminIdeas';
import AccessRequestPage from './pages/AccessRequestPage';
import AdminAccessRequests from './pages/AdminAccessRequests';
import AccessRequestOverlay from './components/AccessRequestOverlay';
import AdminLayout from './components/AdminLayout';
import FrizbiSettings from './pages/FrizbiSettings';
import EmailAutomation from './pages/EmailAutomation';
import RencontresBudgetaires from './pages/RencontresBudgetaires';
import MesReunions from './pages/MesReunions';
import PortefeuilleProjets from './pages/PortefeuilleProjets';
import RevueDeProjets from './pages/RevueDeProjets';
import ProjetDetail from './pages/ProjetDetail';
import TranscriptManager from './pages/TranscriptManager';
import O365MailSettings from './pages/O365MailSettings';
import TranscriptMeetingDetail from './pages/TranscriptManager/MeetingDetail';
import Contrats from './pages/Contrats';
import Copieurs from './pages/Copieurs';
import CalendrierDSI from './pages/CalendrierDSI';
import AgentsDSI from './pages/AgentsDSI';
import ConsommablesManagement from './pages/ConsommablesManagement';
import RequestFeature from './pages/RequestFeature';
import AdminBacklog from './pages/AdminBacklog';
import AdminOrganisation from './pages/AdminOrganisation';
import WhatsNew from './pages/WhatsNew';
import Doctrines from './pages/Doctrines';
import TicketsDashboard from './pages/Tickets/TicketsDashboard';
import TicketDetail from './pages/Tickets/TicketDetail';
import TicketCreate from './pages/Tickets/TicketCreate';
import TicketAdmin from './pages/Tickets/TicketAdmin';
import PublicTicketReply from './pages/PublicTicketReply';

// Protected Route Component
const PrivateRoute = ({ children, allowedRoles, path }: { children: React.ReactNode, allowedRoles?: string[], path?: string }) => {
  const token = localStorage.getItem('token');
  const restrictedPath = localStorage.getItem('restrictedPath');
  let user: any = {};
  try {
    const userStr = localStorage.getItem('user');
    user = JSON.parse(userStr || '{}');
  } catch (e) {
    console.error('Erreur lors du parsing du user en localStorage', e);
  }

  if (!token) {
    // Store the intended path for redirect after login
    const hasNomenu = window.location.search.includes('nomenu');
    if (hasNomenu) {
      localStorage.setItem('restrictedPath', window.location.pathname + window.location.search);
    }
    return <Navigate to="/login" />;
  }

  // Si un restrictedPath est en cours, on bloque l'accès au dashboard et aux autres pages
  if (restrictedPath) {
    if (path === '/') {
      return <Navigate to={restrictedPath} />;
    }
    if (path && path !== restrictedPath && path !== '/login') {
      const isSamePath = path === restrictedPath || (restrictedPath && path && restrictedPath.startsWith(path));
      if (!isSamePath) {
        return <Navigate to={restrictedPath} />;
      }
    }
  }

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
        <Route path="/repondre/:token" element={<PublicTicketReply />} />
        <Route path="/request-feature" element={<PrivateRoute path="/request-feature"><RequestFeature /></PrivateRoute>} />
        <Route path="/whats-new" element={<PrivateRoute path="/whats-new"><WhatsNew /></PrivateRoute>} />
        <Route path="/doctrines" element={<PrivateRoute path="/doctrines"><Doctrines /></PrivateRoute>} />

        <Route path="/" element={<PrivateRoute path="/"><Dashboard /></PrivateRoute>} />
        <Route path="/budget" element={<PrivateRoute path="/budget"><Budget /></PrivateRoute>} />
        <Route path="/tiers" element={<PrivateRoute path="/tiers"><Tiers /></PrivateRoute>} />
        <Route path="/profile" element={<PrivateRoute path="/profile"><Profile /></PrivateRoute>} />
        <Route path="/certif" element={<PrivateRoute path="/certif"><Certif /></PrivateRoute>} />
        <Route path="/mes-taches" element={<PrivateRoute path="/mes-taches"><MesTaches /></PrivateRoute>} />
        <Route path="/telecom" element={<PrivateRoute path="/telecom"><TelecomManagement /></PrivateRoute>} />
        <Route path="/rencontres-budgetaires" element={<PrivateRoute path="/rencontres-budgetaires"><RencontresBudgetaires /></PrivateRoute>} />
        <Route path="/mes-reunions" element={<PrivateRoute path="/mes-reunions"><MesReunions /></PrivateRoute>} />
        <Route path="/portefeuille-projets" element={<PrivateRoute path="/portefeuille-projets"><PortefeuilleProjets /></PrivateRoute>} />
        <Route path="/revue-de-projets" element={<PrivateRoute path="/revue-de-projets"><RevueDeProjets /></PrivateRoute>} />
        <Route path="/projets/:id" element={<PrivateRoute path="/projets"><ProjetDetail /></PrivateRoute>} />
        <Route path="/projets/nouveau" element={<PrivateRoute path="/projets"><PortefeuilleProjets /></PrivateRoute>} />
        
        <Route path="/transcriptmanager" element={<PrivateRoute path="/transcriptmanager"><TranscriptManager /></PrivateRoute>} />
        <Route path="/transcriptmanager/meeting/:id" element={<PrivateRoute path="/transcriptmanager"><TranscriptMeetingDetail /></PrivateRoute>} />
        <Route path="/contrats" element={<PrivateRoute path="/contrats"><Contrats /></PrivateRoute>} />
        <Route path="/copieurs" element={<PrivateRoute path="/copieurs"><Copieurs /></PrivateRoute>} />
        <Route path="/consommables" element={<PrivateRoute path="/consommables"><ConsommablesManagement /></PrivateRoute>} />
        <Route path="/calendrier-dsi" element={<PrivateRoute path="/calendrier-dsi"><CalendrierDSI /></PrivateRoute>} />
        <Route path="/calendrier-dsi/agents" element={<PrivateRoute path="/calendrier-dsi"><AgentsDSI /></PrivateRoute>} />

        {/* Tickets Routes */}
        <Route path="/tickets" element={<PrivateRoute path="/tickets"><TicketsDashboard /></PrivateRoute>} />
        <Route path="/tickets/new" element={<PrivateRoute path="/tickets"><TicketCreate /></PrivateRoute>} />
        <Route path="/tickets/:id" element={<PrivateRoute path="/tickets"><TicketDetail /></PrivateRoute>} />
        {/* Admin Routes with Sidebar Layout */}
        <Route 
          path="/admin" 
          element={
            <PrivateRoute allowedRoles={['admin', 'superadmin']}>
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
          <Route path="ideas" element={<AdminIdeas />} />
          <Route path="frizbi" element={<FrizbiSettings />} />
          <Route path="transcript" element={<Admin section="transcript" />} />
          <Route path="finance" element={<AdminFinance />} />
          <Route path="email-automation" element={<EmailAutomation />} />
          <Route path="backlog" element={<AdminBacklog />} />
          <Route path="o365-mail" element={<O365MailSettings />} />
          <Route path="organisation" element={<AdminOrganisation />} />
          <Route path="tickets" element={<TicketAdmin />} />
        </Route>

        <Route path="/admin/magapp" element={<PrivateRoute path="/admin/magapp"><MagappAdmin /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
