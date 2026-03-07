import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, LogOut, Info, X } from 'lucide-react';

const Header: React.FC = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [changelog, setChangelog] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [winLogin, setWinLogin] = useState<string | null>(null);

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

        <nav className="header-nav">
          {token ? (
            <div className="user-menu">
              <Link to="/profile" className="user-info-link" title="Mon Profil">
                <span className="user-name">
                  Bonjour, {user.username} {user.service_code && <span className="service-badge-header">{user.service_code}</span>} {winLogin && <span className="win-login">({winLogin})</span>}
                </span>
                <User size={18} />
              </Link>
              {user.role === 'admin' && (
                <Link to="/admin" className="nav-link">Configuration</Link>
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
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          display: flex;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 1000;
        }
        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }
        .logo-section {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .logo {
          display: flex;
          align-items: baseline;
          font-size: 28px;
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
          font-size: 18px;
        }
        .logo-dsi {
          color: var(--secondary-color);
          font-weight: 600;
          margin-left: 10px;
          font-size: 16px;
          opacity: 0.8;
        }
        .version-badge {
          background-color: var(--secondary-color);
          color: white;
          border: none;
          padding: 4px 10px;
          border-radius: 50px;
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .version-badge:hover {
          background-color: var(--primary-color);
        }
        .user-menu {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .user-info-link {
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          color: var(--text-color);
          transition: var(--transition);
        }
        .user-info-link:hover {
          color: var(--primary-color);
        }
        .user-name {
          font-weight: 600;
          font-size: 14px;
        }
        .win-login {
          font-weight: 400;
          color: #64748b;
          font-size: 12px;
          margin-left: 4px;
        }
        .service-badge-header {
          background: #f1f5f9;
          color: #475569;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
          margin-left: 4px;
          border: 1px solid #e2e8f0;
        }
        .nav-link {
          font-weight: 600;
          color: var(--secondary-color);
          transition: var(--transition);
        }
        .nav-link:hover {
          color: var(--primary-color);
        }
        .btn-logout {
          background: none;
          color: var(--text-color);
          transition: var(--transition);
          display: flex;
          align-items: center;
        }
        .btn-logout:hover {
          color: var(--primary-color);
        }
        .btn-espace {
          display: flex;
          align-items: center;
          padding: 8px 24px;
          border-radius: 50px;
          font-size: 14px;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 2000;
        }
        .modal-content {
          background: white;
          width: 90%;
          max-width: 600px;
          border-radius: 12px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
        }
        .modal-header {
          padding: 20px;
          border-bottom: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-header h2 {
          margin: 0;
          font-size: 20px;
          color: var(--secondary-color);
        }
        .close-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #666;
        }
        .modal-body {
          padding: 20px;
          overflow-y: auto;
        }
        .release-block {
          margin-bottom: 25px;
          padding-bottom: 15px;
          border-bottom: 1px dashed #eee;
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
          margin-bottom: 10px;
        }
        .release-header h3 {
          margin: 0;
          color: var(--primary-color);
          font-size: 18px;
        }
        .release-date {
          font-size: 13px;
          color: #888;
        }
        .release-changes {
          margin: 0;
          padding-left: 20px;
          color: #444;
          font-size: 14px;
          line-height: 1.6;
        }
      `}</style>
    </header>
  );
};

export default Header;



