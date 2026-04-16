import React, { useEffect, useState } from 'react';
import Tile from '../components/Tile';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, ShieldAlert, Clock, UserCheck } from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

interface TileData {
  id: number;
  title: string;
  icon: string;
  description: string;
  sort_order: number;
  status: 'active' | 'maintenance' | 'soon';
  is_authorized?: boolean;
  links: { label: string; url: string; is_internal: boolean }[];
}

const Dashboard: React.FC = () => {
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [restrictedMessage, setRestrictedMessage] = useState('');
  const { user, logout, token, refreshUser } = useAuth();
  const navigate = useNavigate();

  const isApproved = user?.is_approved === 1 || user?.role === 'admin' || user?.username?.toLowerCase() === 'admin';

  useEffect(() => {
    // Rafraîchir les infos utilisateur au chargement pour vérifier si l'approbation a été donnée
    if (token) refreshUser();
  }, [token]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/tiles', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await response.json();
        if (Array.isArray(data)) {
          setTiles(data);
        }
      } catch (error) {
        console.error('Error fetching tiles:', error);
      } finally {
        setLoading(false);
      }
    };

    const fetchRestrictedMessage = async () => {
      if (!isApproved) {
        try {
          const res = await axios.get('/api/messages/code/nologin');
          setRestrictedMessage(res.data.content || "Votre compte est en attente d'approbation.");
        } catch (err) {
          setRestrictedMessage("Votre compte n'est pas encore activé. Veuillez contacter un administrateur.");
        }
      }
    };

    fetchData();
    fetchRestrictedMessage();
  }, [token, isApproved]);

  return (
    <div className="dashboard">
      <Header />
      
      <main className={`container main-content ${!isApproved ? 'blurred' : ''}`}>
        <section className="welcome-section">
          <h1>Bienvenue, {user?.username}</h1>
          <p>Choisissez un service pour commencer votre session de travail.</p>
        </section>

        {loading ? (
          <div className="loading">Chargement des services...</div>
        ) : (
          <div className="tiles-grid">
            {tiles
              .filter(t => t.status === 'active')
              .map((tile) => (
                <Tile
                  key={tile.id}
                  id={tile.id}
                  title={tile.title}
                  icon={tile.icon}
                  description={tile.description}
                  links={tile.links}
                  status={tile.status}
                  is_authorized={tile.is_authorized}
                />
              ))}
          </div>
        )}
      </main>

      {!isApproved && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(12px)' }}>
          <div style={{ background: 'white', borderRadius: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', maxWidth: '520px', width: '100%', padding: '48px 40px', textAlign: 'center' }}>
            <div style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #fef3c7, #fef9c3)', color: '#d97706', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(217, 119, 6, 0.15)' }}>
              <ShieldAlert size={40} strokeWidth={1.8} />
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fef3c7', color: '#92400e', padding: '4px 14px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700, marginBottom: '24px' }}>
              <Clock size={14} /> En attente
            </div>
            
            <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', marginBottom: '12px', letterSpacing: '-0.02em' }}>Accès restreint</h2>
            
            <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '24px 32px', marginBottom: '32px', color: '#475569', lineHeight: 1.7, fontSize: '0.95rem', whiteSpace: 'pre-wrap', textAlign: 'left', border: '1px solid #f1f5f9' }}>
              "{restrictedMessage}"
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <button 
                onClick={() => navigate('/request-access')}
                style={{ width: '100%', background: '#2563eb', color: 'white', padding: '16px', borderRadius: '16px', fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', cursor: 'pointer', border: 'none', boxShadow: '0 8px 24px rgba(37, 99, 235, 0.25)', transition: 'all 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
                onMouseLeave={e => e.currentTarget.style.background = '#2563eb'}
              >
                <UserCheck size={22} /> Demander un accès
              </button>
              <button 
                onClick={() => { logout(); navigate('/login'); }}
                style={{ width: '100%', background: 'white', color: '#64748b', padding: '14px', borderRadius: '16px', fontWeight: 600, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', border: '1px solid #e2e8f0', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
              >
                <LogOut size={18} /> Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .dashboard {
          min-height: 100vh;
          background-color: var(--bg-color);
          position: relative;
        }
        .main-content {
          padding: 60px 20px;
          transition: filter 0.5s ease;
        }
        .main-content.blurred {
          filter: blur(8px) grayscale(20%);
          pointer-events: none;
          user-select: none;
        }
        .welcome-section {
          margin-bottom: 50px;
          text-align: center;
        }
        .welcome-section h1 {
          font-size: 36px;
          color: var(--secondary-color);
          margin-bottom: 10px;
          font-weight: 800;
        }
        .welcome-section p {
          color: #666;
          font-size: 18px;
        }
        .tiles-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 30px;
        }
        .loading {
          text-align: center;
          padding: 50px;
          font-size: 18px;
        }

        /* Overlay Styles */
        .restricted-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background-color: rgba(255, 255, 255, 0.4);
          backdrop-blur: 4px;
        }
        .restricted-card {
          background: white;
          width: 100%;
          max-width: 500px;
          border-radius: 32px;
          padding: 40px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          text-align: center;
          border: 1px solid rgba(255, 255, 255, 0.8);
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .restricted-icon-wrapper {
          position: relative;
          margin-bottom: 24px;
        }
        .restricted-icon-bg {
          width: 96px;
          height: 96px;
          background: #fffbeb;
          border-radius: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #f59e0b;
        }
        .status-badge {
          position: absolute;
          bottom: -8px;
          right: -8px;
          background: #f59e0b;
          color: white;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 4px;
          box-shadow: 0 4px 6px rgba(245, 158, 11, 0.3);
        }
        .restricted-title {
          letter-spacing: -0.025em;
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
