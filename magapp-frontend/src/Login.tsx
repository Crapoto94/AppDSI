import React, { useState } from 'react';
import { Loader2, User, Lock, AlertCircle } from 'lucide-react';
import axios from 'axios';
import logoDsiHub from './assets/DSI.png';

interface LoginProps {
  isAutoLogging: boolean;
}

const Login: React.FC<LoginProps> = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/auth/magapp-login', {
        username: username.trim(),
        password
      });

      const { user, accessToken } = response.data;

      // Sauvegarder les infos utilisateur
      sessionStorage.setItem('magapp_user', JSON.stringify({
        username: user.username,
        displayName: user.displayName || user.username,
        email: user.email || ''
      }));

      // Si un token JWT a été renvoyé (utilisateur reconnu localement)
      if (accessToken) {
        localStorage.setItem('token', accessToken);
        localStorage.setItem('user', JSON.stringify(user));
      }

      // Recharger l'application pour passer à l'écran principal
      window.location.reload();
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.response?.data?.message || 'Erreur lors de la connexion. Vérifiez vos identifiants.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <img src={logoDsiHub} alt="Logo DSI Hub" className="login-logo" />
          <h1>Magasin d'Applications</h1>
          <p className="login-subtitle">Connectez-vous avec vos identifiants de session Windows (AD)</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          {error && (
            <div className="error-banner">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="input-group">
            <label htmlFor="username">Identifiant Windows</label>
            <div className="input-wrapper">
              <User size={18} className="input-icon" />
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Votre login windows"
                autoFocus
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="password">Mot de passe</label>
            <div className="input-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                required
                disabled={loading}
              />
            </div>
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading || !username || !password}
          >
            {loading ? (
              <>
                <Loader2 className="spinner-small" size={20} />
                Connexion...
              </>
            ) : (
              'Se connecter'
            )}
          </button>
        </form>

        <div className="login-footer">
          <p>DSI Ville d'Ivry-sur-Seine &copy; 2026</p>
        </div>
      </div>

      <style>{`
        .login-screen {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #f0f4f8 0%, #d9e2ec 100%);
          padding: 20px;
          font-family: 'Inter', -apple-system, sans-serif;
        }
        .login-card {
          background: white;
          width: 100%;
          max-width: 420px;
          border-radius: 24px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          padding: 40px;
        }
        .login-header {
          text-align: center;
          margin-bottom: 30px;
        }
        .login-logo {
          height: 60px;
          margin-bottom: 15px;
        }
        .login-header h1 {
          font-size: 1.5rem;
          color: #0078a4;
          margin: 0;
          font-weight: 800;
        }
        .login-subtitle {
          color: #64748b;
          font-size: 0.9rem;
          margin-top: 8px;
        }
        .error-banner {
          background: #fff1f2;
          color: #e11d48;
          padding: 12px;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 600;
          margin-bottom: 20px;
          border: 1px solid #fecdd3;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .input-group {
          margin-bottom: 20px;
        }
        .input-group label {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: #475569;
          margin-bottom: 8px;
        }
        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .input-icon {
          position: absolute;
          left: 12px;
          color: #94a3b8;
        }
        .input-wrapper input {
          width: 100%;
          padding: 12px 12px 12px 40px;
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          font-size: 1rem;
          transition: all 0.2s;
        }
        .input-wrapper input:focus {
          outline: none;
          border-color: #0078a4;
          box-shadow: 0 0 0 3px rgba(0, 120, 164, 0.1);
        }
        .login-button {
          width: 100%;
          padding: 14px;
          background: #0078a4;
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 10px;
        }
        .login-button:hover:not(:disabled) {
          background: #006b91;
          transform: translateY(-1px);
          box-shadow: 0 4px 6px -1px rgba(0, 120, 164, 0.2);
        }
        .login-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .spinner-small {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .login-footer {
          margin-top: 30px;
          text-align: center;
          font-size: 0.8rem;
          color: #94a3b8;
          border-top: 1px solid #f1f5f9;
          padding-top: 20px;
        }
      `}</style>
    </div>
  );
};

export default Login;