import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, Outlet } from 'react-router-dom';
import Header from './Header';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, Users, MessageSquare, ShieldCheck, 
  Mail, Settings, LayoutGrid, Activity, 
  Monitor, Database, Shield, ChevronRight, Bell, Lock, Sliders
} from 'lucide-react';

const AdminLayout: React.FC = () => {
  const location = useLocation();
  const { token } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const fetchPendingCount = async () => {
      try {
        const res = await axios.get('/api/admin/access-requests', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPendingCount(res.data.length);
      } catch (err) {
        console.error("Error fetching pending requests count", err);
      }
    };

    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [token]);

  const menuItems = [
    { title: "Dashboard", icon: LayoutDashboard, path: "/admin", exact: true },
    { title: "Utilisateurs", icon: Users, path: "/admin/users" },
    { title: "Demandes d'Accès", icon: ShieldCheck, path: "/admin/access-requests", badge: pendingCount },
    { title: "Messages Système", icon: MessageSquare, path: "/admin/messages" },
    { title: "Modèles d'Emails", icon: Mail, path: "/admin/email-templates" },
    { title: "Serveur Mail", icon: Settings, path: "/admin/mail" },
    { title: "Configuration Hub", icon: LayoutGrid, path: "/admin/tiles" },
    { title: "Paramètres", icon: Sliders, path: "/admin/settings" },
    { title: "SMS Frizbi", icon: MessageSquare, path: "/admin/frizbi" },
    { title: "Liaison AD", icon: Monitor, path: "/admin/ad" },
    { title: "Azure AD (Entra)", icon: Shield, path: "/admin/azure-ad" },
    { title: "Liaison GLPI", icon: Database, path: "/admin/glpi" },
    { title: "Liaison Oracle", icon: Database, path: "/admin/oracle" },
    { title: "Liaison MariaDB", icon: Database, path: "/admin/mariadb" },
    { title: "SQL", icon: Database, path: "/admin/sql" },
    { title: "Logs Système", icon: Activity, path: "/mouchard", external: true },
  ];

  const getPageTitle = () => {
    const item = menuItems.find(i => location.pathname === i.path);
    return item ? item.title : "Administration";
  };

  return (
    <div className="admin-root">
      <Header />
      
      <div className="admin-container">
        <aside className="admin-sidebar">
          <div className="sidebar-brand">
            <Shield size={24} className="brand-icon" />
            <span>Console Admin</span>
          </div>
          
          <nav className="sidebar-nav">
            {menuItems.map((item, idx) => (
              item.external ? (
                <a 
                  key={idx}
                  href={item.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nav-link external"
                >
                  <item.icon size={18} />
                  <span>{item.title}</span>
                  <Activity size={14} className="status-indicator" />
                </a>
              ) : (
                <NavLink
                  key={idx}
                  to={item.path}
                  end={item.exact}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  <item.icon size={18} />
                  <span>{item.title}</span>
                  {(item.badge ?? 0) > 0 && (
                    <span className="nav-badge animate-bounce">{item.badge}</span>
                  )}
                  {location.pathname === item.path && <div className="active-marker" />}
                </NavLink>
              )
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="system-status">
              <div className="status-dot online"></div>
              <span>Système Opérationnel</span>
            </div>
          </div>
        </aside>

        <main className="admin-main">
          <header className="admin-content-header">
            <div className="breadcrumb">
              <span className="crumb-root">Admin</span>
              <ChevronRight size={14} />
              <span className="crumb-active">{getPageTitle()}</span>
            </div>
            <div className="header-actions">
              <button className="icon-btn" title="Notifications"><Bell size={18} /></button>
              <button className="icon-btn" title="Sécurité"><Lock size={18} /></button>
            </div>
          </header>
          
          <div className="admin-content-body">
            <Outlet />
          </div>
        </main>
      </div>

      <style>{`
        .admin-root {
          height: 100vh;
          display: flex;
          flex-direction: column;
          background-color: #f0f2f5;
          overflow: hidden;
        }

        .admin-container {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .admin-sidebar {
          width: 260px;
          background-color: #1a2234;
          color: #a3b1cc;
          display: flex;
          flex-direction: column;
          border-right: 1px solid #0f172a;
          transition: all 0.3s ease;
          z-index: 50;
        }

        .sidebar-brand {
          padding: 25px;
          display: flex;
          align-items: center;
          gap: 12px;
          color: white;
          font-weight: 800;
          font-size: 1.1rem;
          letter-spacing: -0.02em;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .brand-icon { color: #3b82f6; }

        .sidebar-nav {
          padding: 20px 12px;
          flex: 1;
          overflow-y: auto;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          color: #94a3b8;
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 600;
          border-radius: 8px;
          margin-bottom: 4px;
          transition: all 0.2s;
          position: relative;
        }

        .nav-link:hover {
          background-color: rgba(255,255,255,0.05);
          color: white;
        }

        .nav-link.active {
          background-color: #3b82f6;
          color: white;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .nav-badge {
          margin-left: auto;
          background: #ef4444;
          color: white;
          font-size: 10px;
          font-weight: 900;
          padding: 2px 8px;
          border-radius: 20px;
          box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
        }

        .active-marker {
          position: absolute;
          right: 0;
          width: 4px;
          height: 20px;
          background-color: white;
          border-radius: 4px 0 0 4px;
        }

        .sidebar-footer {
          padding: 20px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        .system-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #64748b;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .status-dot.online {
          background-color: #22c55e;
          box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
        }

        .admin-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .admin-content-header {
          height: 64px;
          background-color: white;
          border-bottom: 1px solid #e2e8f0;
          padding: 0 30px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          font-weight: 600;
        }

        .crumb-root { color: #94a3b8; }
        .crumb-active { color: #1e293b; }

        .header-actions { display: flex; gap: 10px; }

        .icon-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s;
        }

        .icon-btn:hover {
          background: #f1f5f9;
          color: #1e293b;
          border-color: #cbd5e1;
        }

        .admin-content-body {
          flex: 1;
          overflow-y: auto;
          padding: 30px;
          background-color: #f8fafc;
        }

        .admin-content-body::-webkit-scrollbar { width: 6px; }
        .admin-content-body::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default AdminLayout;
