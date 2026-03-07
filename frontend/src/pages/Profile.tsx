import React, { useState } from 'react';
import Header from '../components/Header';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';

const Profile: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Les nouveaux mots de passe ne correspondent pas' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Le nouveau mot de passe doit faire au moins 6 caractÃ¨res' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: 'Mot de passe mis Ã  jour avec succÃ¨s !' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: data.message || 'Une erreur est survenue' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur de connexion au serveur' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-page">
      <Header />
      <main className="container">
        <div className="profile-content">
          <div className="profile-card">
            <div className="profile-header">
              <div className="user-icon">
                {user.username?.charAt(0).toUpperCase()}
              </div>
              <h1>Mon Profil</h1>
              <p className="username">{user.username}</p>
              <span className={`role-badge ${user.role}`}>{user.role}</span>
            </div>

            <section className="password-section">
              <div className="section-title">
                <KeyRound size={20} />
                <h2>Changer mon mot de passe</h2>
              </div>

              {message.text && (
                <div className={`message-banner ${message.type}`}>
                  {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                  {message.text}
                </div>
              )}

              <form onSubmit={handleSubmit} className="profile-form">
                <div className="form-group">
                  <label>Mot de passe actuel</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Nouveau mot de passe</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Confirmer le nouveau mot de passe</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Mise Ã  jour...' : 'Mettre Ã  jour le mot de passe'}
                </button>
              </form>
            </section>
          </div>
        </div>
      </main>

      <style>{`
        .profile-page { min-height: 100vh; background-color: var(--bg-color); }
        .profile-content { padding: 60px 0; display: flex; justify-content: center; }
        .profile-card {
          background: var(--white);
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.05);
          width: 100%;
          max-width: 500px;
        }
        .profile-header { text-align: center; margin-bottom: 40px; border-bottom: 1px solid #eee; padding-bottom: 30px; }
        .user-icon {
          width: 80px;
          height: 80px;
          background: var(--secondary-color);
          color: white;
          font-size: 32px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          margin: 0 auto 15px;
        }
        .profile-header h1 { margin: 0; font-size: 24px; color: var(--secondary-color); }
        .username { color: #666; margin: 5px 0 10px; font-size: 18px; }
        
        .role-badge {
          font-size: 11px;
          text-transform: uppercase;
          padding: 3px 10px;
          border-radius: 12px;
          font-weight: bold;
        }
        .role-badge.admin { background: #ffebeb; color: var(--primary-color); }
        .role-badge.user { background: #e3f2fd; color: #1976d2; }

        .section-title { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; color: var(--secondary-color); }
        .section-title h2 { font-size: 18px; margin: 0; }

        .message-banner {
          padding: 12px 15px;
          border-radius: 6px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
        }
        .message-banner.success { background-color: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; }
        .message-banner.error { background-color: #ffebee; color: #c62828; border: 1px solid #ffcdd2; }

        .profile-form { display: grid; gap: 20px; }
        .form-group { display: flex; flex-direction: column; gap: 8px; }
        .form-group label { font-size: 14px; font-weight: 600; color: #444; }
        .form-group input {
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-family: inherit;
          transition: border-color 0.2s;
        }
        .form-group input:focus { outline: none; border-color: var(--secondary-color); }
        
        .profile-form .btn-primary { padding: 14px; font-weight: 700; margin-top: 10px; }
      `}</style>
    </div>
  );
};

export default Profile;
