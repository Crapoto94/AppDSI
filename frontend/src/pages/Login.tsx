import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isAutoLogging, setIsAutoLogging] = useState(true);
  const [azureEnabled, setAzureEnabled] = useState(false);
  const navigate = useNavigate();
  const { setPendingApproval, login } = useAuth();

  useEffect(() => {
    const attemptAuth = async () => {
      // 1. Si on est déjà connecté via localStorage, on redirige vers l'accueil
      if (localStorage.getItem('token')) {
        navigate('/');
        return;
      }

      // Check Azure AD status
      try {
        const res = await fetch('/api/azure-ad-settings/status');
        if (res.ok) {
          const data = await res.json();
          setAzureEnabled(!!data.is_enabled);
        }
      } catch (e) {
        console.error('Error checking Azure AD:', e);
      }

      // Check for token in URL (callback from Azure)
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const azureError = params.get('error');

      if (token) {
        // Authentifier proprement avec le token reçu
        try {
          const userRes = await fetch('/api/me', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (userRes.ok) {
            const userData = await userRes.json();
            login(token, userData);
            navigate('/');
            return;
          }
        } catch (e) {
          console.error('Final auth error:', e);
        }
      }

      if (azureError) {
        setError("L'authentification Azure AD a échoué.");
      }

      // L'utilisateur ne veut plus de tentative de connexion automatique (SSO)
      setIsAutoLogging(false);
    };

    attemptAuth();
  }, [navigate, setPendingApproval]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();

      if (response.status === 202) {
        setPendingApproval({ username: data.username, message: data.message });
        return;
      }

      if (response.ok) {
        login(data.accessToken, data.user);
        localStorage.removeItem('manualLogout');
        navigate('/');
      } else {
        setError(data.message || 'Erreur de connexion');
      }
    } catch (err) {
      setError('Impossible de contacter le serveur');
    }
  };

  return (
    <div className="login-page">
      <Header />
      <div className="container login-container">
        <div className="login-box">
          {isAutoLogging ? (
            <div className="auto-logging">
              <div className="loader"></div>
              <h2>Connexion automatique...</h2>
              <p>Vérification de votre identité Windows</p>
            </div>
          ) : (
            <>
              <h2>Connexion Hub DSI</h2>
              <p>Connectez-vous pour accéder à vos services.</p>
              
              <form onSubmit={handleSubmit}>
                {error && <div className="error-msg">{error}</div>}
                
                <div className="form-group">
                  <label htmlFor="username">Identifiant</label>
                  <input
                    type="text"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="password">Mot de passe</label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                
                <button type="submit" className="btn btn-primary btn-full">
                  Se connecter
                </button>
              </form>

              {azureEnabled && (
                <>
                  <div className="login-divider">
                    <span>OU</span>
                  </div>
                  <button 
                    onClick={() => window.location.href = '/api/auth/azure/login'} 
                    className="btn btn-azure btn-full"
                  >
                    <svg className="microsoft-icon" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
                      <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z" fill="#f25022" />
                      <rect x="0" y="0" width="10.8" height="10.8" fill="#f25022" />
                      <rect x="12.2" y="0" width="10.8" height="10.8" fill="#7fba00" />
                      <rect x="0" y="12.2" width="10.8" height="10.8" fill="#00a4ef" />
                      <rect x="12.2" y="12.2" width="10.8" height="10.8" fill="#ffb900" />
                    </svg>
                    Se connecter avec Microsoft
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        .login-page {
          min-height: 100vh;
          background-color: var(--bg-color);
        }
        .login-container {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 80px 20px;
        }
        .login-box {
          background: var(--white);
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          width: 100%;
          max-width: 450px;
          text-align: center;
        }
        .auto-logging {
          padding: 20px 0;
        }
        .loader {
          border: 4px solid #f3f3f3;
          border-top: 4px solid var(--primary-color);
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .login-box h2 {
          color: var(--secondary-color);
          margin-bottom: 10px;
          font-weight: 800;
        }
        .login-box p {
          color: #666;
          margin-bottom: 30px;
        }
        .form-group {
          text-align: left;
          margin-bottom: 20px;
        }
        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          font-size: 14px;
        }
        .form-group input {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-family: inherit;
        }
        .form-group input:focus {
          outline: none;
          border-color: var(--primary-color);
        }
        .btn-full {
          width: 100%;
          padding: 14px;
          font-size: 16px;
          margin-top: 10px;
        }
        .error-msg {
          background-color: rgba(227, 6, 19, 0.1);
          color: var(--primary-color);
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 20px;
          font-size: 14px;
        }
        .login-divider {
          display: flex;
          align-items: center;
          margin: 20px 0;
          color: #999;
          font-size: 12px;
          font-weight: bold;
        }
        .login-divider::before, .login-divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: #eee;
        }
        .login-divider span {
          margin: 0 10px;
        }
        .btn-azure {
          background-color: #2f2f2f;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border: none;
          transition: background-color 0.2s;
        }
        .btn-azure:hover {
          background-color: #000;
        }
        .microsoft-icon {
          width: 18px;
          height: 18px;
        }
      `}</style>
    </div>
  );
};

export default Login;



