import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isAutoLogging, setIsAutoLogging] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const attemptAutoLogin = async () => {
      // Si l'utilisateur s'est déconnecté manuellement, on ne le reconnecte pas automatiquement
      if (localStorage.getItem('manualLogout') === 'true') {
        setIsAutoLogging(false);
        return;
      }

      try {
        const response = await fetch('http://localhost:3001/api/auth/auto-login', { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          localStorage.setItem('token', data.accessToken);
          localStorage.setItem('user', JSON.stringify(data.user));
          localStorage.removeItem('manualLogout');
          navigate('/');
        }
      } catch (err) {
        console.error('Auto-login error:', err);
      } finally {
        setIsAutoLogging(false);
      }
    };

    // Si on est déjà connecté, on redirige
    if (localStorage.getItem('token')) {
      navigate('/');
    } else {
      attemptAutoLogin();
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:3001/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('token', data.accessToken);
        localStorage.setItem('user', JSON.stringify(data.user));
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
              
              <div className="login-help">
                <p>Identifiants par défaut : admin / admin123</p>
              </div>
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
        .login-help {
          margin-top: 30px;
          font-size: 12px;
          color: #999;
          border-top: 1px solid #eee;
          padding-top: 20px;
        }
      `}</style>
    </div>
  );
};

export default Login;
