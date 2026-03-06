import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, LogOut } from 'lucide-react';

const Header: React.FC = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <header className="main-header">
      <div className="container header-content">
        <Link to="/" className="logo">
          <span className="logo-ivry">ivry</span>
          <span className="logo-sur-seine">sur-seine</span>
          <span className="logo-dsi"> - Hub DSI</span>
        </Link>

        <nav className="header-nav">
          {token ? (
            <div className="user-menu">
              <Link to="/profile" className="user-info-link" title="Mon Profil">
                <span className="user-name">Bonjour, {user.username}</span>
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
      `}</style>
    </header>
  );
};

export default Header;
