import React, { useEffect, useState } from 'react';
import Tile from '../components/Tile';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, ShieldAlert, Clock, UserCheck } from 'lucide-react';
import axios from 'axios';

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
        <div className="restricted-overlay">
          <div className="restricted-card animate-in zoom-in-95 duration-300">
            <div className="restricted-icon-wrapper">
              <div className="restricted-icon-bg">
                <ShieldAlert size={48} className="text-amber-500" />
              </div>
              <div className="status-badge">
                <Clock size={14} /> En attente
              </div>
            </div>
            
            <h2 className="restricted-title text-gray-900 font-extrabold text-2xl mb-4">Accès Restreint</h2>
            
            <div className="restricted-message bg-amber-50 border border-amber-100 p-6 rounded-2xl mb-8">
              <p className="text-amber-900 leading-relaxed italic">
                "{restrictedMessage}"
              </p>
            </div>
            
            <div className="flex flex-col gap-3 w-full">
              <button 
                onClick={() => window.location.href = '/request-access'}
                className="bg-blue-600 text-white px-6 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
              >
                <UserCheck size={20} /> Demander un accès
              </button>
              <button 
                onClick={logout}
                className="text-gray-500 hover:text-gray-700 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-100 transition-all"
              >
                <LogOut size={20} /> Se déconnecter
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
          flex-col;
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
