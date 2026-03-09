import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { User, LogOut, Info, X, LayoutDashboard, Wallet, Users, FileCheck, Settings, Phone } from 'lucide-react';

const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [changelog, setChangelog] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [, setWinLogin] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/changelog')
      .then(res => res.json())
      .then(data => setChangelog(data))
      .catch(err => console.error("Error fetching changelog:", err));

    // Récupération automatique du login Windows
    fetch('/api/auth/ntlm', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.login) setWinLogin(data.login);
      })
      .catch(err => console.error("NTLM detection failed:", err));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.setItem('manualLogout', 'true');
    navigate('/login');
  };

  const navItems = [
    { path: '/', label: 'Tableau de bord', icon: <LayoutDashboard size={18} /> },
    { path: '/budget', label: 'Budget', icon: <Wallet size={18} /> },
    { path: '/tiers', label: 'Tiers', icon: <Users size={18} /> },
    { path: '/telecom', label: 'Télécom', icon: <Phone size={18} /> },
    { path: '/certif', label: 'Certificats', icon: <FileCheck size={18} /> },
  ];

  return (
    <header className="main-header">
      <div className="container header-content">
        <div className="logo-section">
          <Link to="/" className="logo">
            <span className="logo-ivry">ivry</span>
            <span className="logo-sur-seine">sur-seine</span>
            <span className="logo-dsi"> - Hub DSI</span>
          </Link>
          {changelog && (
            <button className="version-badge" onClick={() => setShowModal(true)} title="Voir les nouveautés">
              v{changelog.currentVersion} <Info size={14} style={{ marginLeft: '4px' }} />
            </button>
          )}
        </div>

        {token && (
          <nav className="main-nav">
            {navItems.map((item) => (
              <Link 
                key={item.path} 
                to={item.path} 
                className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        )}

        <nav className="header-nav">
          {token ? (
            <div className="user-menu">
              <Link to="/profile" className="user-info-link" title="Mon Profil">
                <span className="user-name">
                  {user.username} {user.service_code && <span className="service-badge-header">{user.service_code}</span>}
                </span>
                <User size={18} />
              </Link>
              {user.role === 'admin' && (
                <Link to="/admin" className={`admin-link ${location.pathname.startsWith('/admin') ? 'active' : ''}`} title="Administration">
                  <Settings size={20} />
                </Link>
              )}
              <button onClick={handleLogout} className="btn-logout" title="Déconnexion">
                <LogOut size={20} />
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn btn-primary btn-espace">
              <User size={18} style={{ marginRight: '8px' }} />
              Mon espace
            </Link>
          )}
        </nav>
      </div>

      {showModal && changelog && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>What's New ?</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}><X size={24} /></button>
            </div>
            <div className="modal-body">
              {changelog.history.map((release: any, idx: number) => (
                <div key={idx} className="release-block">
                  <div className="release-header">
                    <h3>Version {release.version}</h3>
                    <span className="release-date">{release.date}</span>
                  </div>
                  <ul className="release-changes">
                    {release.changes.map((change: string, cIdx: number) => (
                      <li key={cIdx}>{change}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .main-header {
          height: var(--header-height);
          background-color: var(--white);
          box-shadow: 0 2px 10px rgba(0,0,0,0.08);
          display: flex;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 1000;
          padding: 0 20px;
        }
        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          max-width: 1600px;
          margin: 0 auto;
        }
        .logo-section {
          display: flex;
          align-items: center;
          gap: 15px;
          flex-shrink: 0;
        }
        .logo {
          display: flex;
          align-items: baseline;
          font-size: 24px;
          text-decoration: none;
        }
        .logo-ivry {
          color: var(--primary-color);
          font-weight: 800;
          text-transform: lowercase;
        }
        .logo-sur-seine {
          color: var(--text-color);
          font-weight: 300;
          margin-left: 2px;
          font-size: 16px;
        }
        .logo-dsi {
          color: var(--secondary-color);
          font-weight: 600;
          margin-left: 8px;
          font-size: 14px;
          opacity: 0.7;
        }
        .version-badge {
          background-color: #f1f5f9;
          color: #64748b;
          border: 1px solid #e2e8f0;
          padding: 3px 8px;
          border-radius: 50px;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .version-badge:hover {
          background-color: var(--primary-color);
          color: white;
          border-color: var(--primary-color);
        }

        .main-nav {
          display: flex;
          align-items: center;
          gap: 5px;
          background: #f8fafc;
          padding: 4px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }
        .nav-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          text-decoration: none;
          color: #64748b;
          font-size: 14px;
          font-weight: 600;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .nav-item:hover {
          background: #f1f5f9;
          color: var(--secondary-color);
        }
        .nav-item.active {
          background: white;
          color: var(--primary-color);
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
          border: 1px solid #e2e8f0;
        }
        .nav-item svg {
          opacity: 0.7;
        }
        .nav-item.active svg {
          opacity: 1;
          color: var(--primary-color);
        }

        .header-nav {
          flex-shrink: 0;
        }
        .user-menu {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .user-info-link {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: var(--text-color);
          transition: var(--transition);
          padding: 6px 12px;
          border-radius: 8px;
        }
        .user-info-link:hover {
          background: #f8fafc;
          color: var(--primary-color);
        }
        .user-name {
          font-weight: 700;
          font-size: 14px;
        }
        .service-badge-header {
          background: var(--primary-color);
          color: white;
          padding: 1px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 800;
          margin-left: 4px;
        }
        .admin-link {
          color: #64748b;
          display: flex;
          align-items: center;
          padding: 8px;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .admin-link:hover, .admin-link.active {
          background: #f1f5f9;
          color: var(--secondary-color);
        }
        .btn-logout {
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 8px;
          border-radius: 8px;
          transition: all 0.2s;
          display: flex;
          align-items: center;
        }
        .btn-logout:hover {
          background: #fff1f2;
          color: #e11d48;
        }
        .btn-espace {
          display: flex;
          align-items: center;
          padding: 8px 20px;
          border-radius: 50px;
          font-size: 14px;
          font-weight: 700;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 2000;
        }
        .modal-content {
          background: white;
          width: 90%;
          max-width: 600px;
          border-radius: 16px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .modal-header {
          padding: 24px;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-header h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 800;
          color: var(--secondary-color);
        }
        .close-btn {
          background: #f8fafc;
          border: none;
          cursor: pointer;
          color: #64748b;
          padding: 8px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .close-btn:hover {
          background: #f1f5f9;
          color: var(--primary-color);
        }
        .modal-body {
          padding: 24px;
          overflow-y: auto;
        }
        .release-block {
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 1px solid #f1f5f9;
        }
        .release-block:last-child {
          border-bottom: none;
          margin-bottom: 0;
          padding-bottom: 0;
        }
        .release-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 12px;
        }
        .release-header h3 {
          margin: 0;
          color: var(--primary-color);
          font-size: 18px;
          font-weight: 800;
        }
        .release-date {
          font-size: 13px;
          color: #94a3b8;
          font-weight: 600;
        }
        .release-changes {
          margin: 0;
          padding-left: 20px;
          color: #475569;
          font-size: 14px;
          line-height: 1.7;
        }
      `}</style>
    </header>
  );
};

export default Header;



