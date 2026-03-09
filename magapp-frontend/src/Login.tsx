import React from 'react';
import logoDsiHub from './assets/logo-dsi-hub.svg';

interface LoginProps {
  onLoginSuccess: (user: any, token: string) => void;
  isAutoLogging: boolean;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess, isAutoLogging }) => {
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <img src={logoDsiHub} alt="Logo DSI Hub" className="login-logo" />
          <h1>Magasin d'Applications</h1>
        </div>

        {isAutoLogging ? (
          <div className="auto-login-status">
            <div className="spinner" style={{ display: 'inline-block' }}></div> {/* Placeholder for spinner */}
            <p>Connexion SSO en cours...</p>
            <span>Vérification de votre session Windows</span>
          </div>
        ) : (
          <div className="login-footer" style={{ borderTop: 'none', marginTop: 0 }}>
            <p>Si vous êtes connecté au VPN ou au bureau et que ce message persiste, merci de contacter le support DSI.</p>
            <button
              onClick={() => window.location.reload()}
              className="login-button"
              style={{ marginTop: '20px' }}
            >
              Réessayer la connexion
            </button>
          </div>
        )}
      </div>

      <style>{`
        .login-screen {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #f0f4f8 0%, #d9e2ec 100%);
          padding: 20px;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .login-card {
          background: white;
          width: 100%;
          max-width: 420px;
          border-radius: 24px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          overflow: hidden;
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
        .auto-login-status {
          text-align: center;
          padding: 40px 0;
        }
        .spinner {
          color: #0078a4;
          animation: spin 1s linear infinite;
          margin-bottom: 20px;
        }
        .spinner-small {
          animation: spin 1s linear infinite;
          margin-right: 10px;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .auto-login-status p {
          font-size: 1.1rem;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 8px;
        }
        .auto-login-status span {
          color: #64748b;
          font-size: 0.9rem;
        }
        .login-form h2 {
          font-size: 1.25rem;
          color: #1e293b;
          margin-bottom: 8px;
          font-weight: 700;
        }
        .login-subtitle {
          color: #64748b;
          font-size: 0.9rem;
          margin-bottom: 25px;
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
        .login-button:hover {
          background: #006b91;
          transform: translateY(-1px);
          box-shadow: 0 4px 6px -1px rgba(0, 120, 164, 0.2);
        }
        .login-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
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