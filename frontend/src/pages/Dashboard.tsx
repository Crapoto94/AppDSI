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
  is_public?: number;
  links: { label: string; url: string; is_internal: boolean }[];
  pending_requests?: number;
  warning_count?: number;
  info_count?: number;
}

const Dashboard: React.FC = () => {
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [tileOrder, setTileOrder] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [restrictedMessage, setRestrictedMessage] = useState('');
  const [draggedTile, setDraggedTile] = useState<number | null>(null);
  const [dragOverTile, setDragOverTile] = useState<number | null>(null);
  const { user, logout, token, refreshUser } = useAuth();
  const navigate = useNavigate();

  const isApproved = user?.is_approved === 1 || user?.role === 'admin' || user?.username?.toLowerCase() === 'admin';

  // Pour un superadmin, les tuiles personnelles ("Mes ...") sont affichées
  // sans le possessif et donnent accès à toutes les données.
  const isSuperAdmin = user?.role === 'superadmin'
    || user?.username?.toLowerCase() === 'admin'
    || user?.username?.toLowerCase() === 'adminhub';

  const adminLabel = (text: string): string => {
    if (!isSuperAdmin || !text) return text;
    return text
      .replace(/^Mes\s+/, '')      // "Mes Réunions" -> "Réunions"
      .replace(/\bmes\s+/gi, 'les '); // "Voir mes réunions" -> "Voir les réunions"
  };

  const saveTileOrder = async (order: number[]) => {
    try {
      await fetch('/api/user-tile-order', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tileOrder: order })
      });
      console.log('Tile order saved:', order);
    } catch (error) {
      console.error('Error saving tile order:', error);
    }
  };

  const handleDragStart = (tileId: number) => {
    setDraggedTile(tileId);
  };

  const handleDragOver = (tileId: number, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverTile(tileId);
  };

  const handleDragLeave = () => {
    setDragOverTile(null);
  };

  const handleDrop = (targetTileId: number) => {
    if (draggedTile === null || draggedTile === targetTileId) {
      setDraggedTile(null);
      setDragOverTile(null);
      return;
    }

    // Rebuild from current display order (tileOrder may be empty or partial)
    const displayed = tiles
      .filter(t => t.status === 'active' || t.status === 'soon')
      .sort((a, b) => {
        const ia = tileOrder.indexOf(a.id);
        const ib = tileOrder.indexOf(b.id);
        return (ia === -1 ? tiles.length : ia) - (ib === -1 ? tiles.length : ib);
      })
      .map(t => t.id);

    const draggedIndex = displayed.indexOf(draggedTile);
    const targetIndex = displayed.indexOf(targetTileId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const [removed] = displayed.splice(draggedIndex, 1);
      displayed.splice(targetIndex, 0, removed);
      setTileOrder(displayed);
      saveTileOrder(displayed);
    }

    setDraggedTile(null);
    setDragOverTile(null);
  };

  useEffect(() => {
    // Rafraîchir les infos utilisateur au chargement pour vérifier si l'approbation a été donnée
    if (token) refreshUser();
  }, [token]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const headers = { 'Authorization': `Bearer ${token}` };
        const [tilesRes, pendingRes, renewalRes, contratsExpiryRes, tasksCountRes] = await Promise.all([
          fetch('/api/tiles', { headers }),
          axios.get('/api/consumable/pending-count').catch(() => ({ data: { count: 0 } })),
          axios.get('/api/certificates/renewal-count', { headers }).catch(() => ({ data: { count: 0 } })),
          axios.get('/api/contrats/expiry-count', { headers }).catch(() => ({ data: { expired: 0, soon: 0 } })),
          axios.get('/api/tasks/count', { headers }).catch(() => ({ data: { count: 0, overdue: 0, en_cours: 0, a_faire: 0 } }))
        ]);

        const tilesData = await tilesRes.json();
        const pendingCount = pendingRes.data.count || 0;
        const renewalCount = renewalRes.data.count || 0;
        const contratsExpired = contratsExpiryRes.data.expired || 0;
        const contratsSoon = contratsExpiryRes.data.soon || 0;
        const tasksOverdue = tasksCountRes.data.overdue ?? tasksCountRes.data.count ?? 0;
        const tasksEnCours = tasksCountRes.data.en_cours ?? 0;
        const tasksAFaire  = tasksCountRes.data.a_faire ?? 0;

        if (Array.isArray(tilesData)) {
          const updatedTiles = tilesData.map((t: TileData) => {
            const urls = (t.links || []).map(l => l.url || '');
            const isConsommables = urls.some(u => u.includes('/consommables') || u.includes('/consumable')) || t.title === 'Gestion des Consommables';
            const isCertif = urls.some(u => u.includes('/certif')) || t.title === 'Suivi des Certificats';
            const isContrats = urls.some(u => u.includes('/contrats')) || t.title === 'Gestion des Contrats';
            const isTaches = urls.some(u => u.includes('/mes-taches')) || t.title === 'Mes Tâches';
            if (isConsommables) return { ...t, pending_requests: pendingCount };
            if (isCertif) return { ...t, pending_requests: renewalCount };
            if (isContrats) return { ...t, pending_requests: contratsExpired, warning_count: contratsSoon };
            if (isTaches) return { ...t, pending_requests: tasksOverdue, warning_count: tasksEnCours, info_count: tasksAFaire };
            return t;
          });
          setTiles(updatedTiles);

          try {
            const orderResponse = await fetch('/api/user-tile-order', { headers });
            const orderData = await orderResponse.json();
            setTileOrder(Array.isArray(orderData) ? orderData.map((o: any) => o.tile_id) : tilesData.map((t: TileData) => t.id));
          } catch (err) {
            setTileOrder(tilesData.map((t: TileData) => t.id));
          }
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
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
              .filter(t => t.status === 'active' || t.status === 'soon')
              .sort((a, b) => {
                const indexA = tileOrder.indexOf(a.id);
                const indexB = tileOrder.indexOf(b.id);
                return (indexA === -1 ? tiles.length : indexA) - (indexB === -1 ? tiles.length : indexB);
              })
              .map((tile) => (
                <div
                  key={tile.id}
                  draggable
                  onDragStart={() => handleDragStart(tile.id)}
                  onDragOver={(e) => handleDragOver(tile.id, e)}
                  onDragLeave={handleDragLeave}
                  onDrop={() => handleDrop(tile.id)}
                  style={{
                    opacity: draggedTile === tile.id ? 0.5 : 1,
                    backgroundColor: dragOverTile === tile.id ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
                    borderRadius: '8px',
                    transition: 'all 0.2s'
                  }}
                >
                    <Tile
                    key={`${tile.id}-${tile.pending_requests || 0}-${tile.warning_count || 0}-${tile.info_count || 0}`}
                    id={tile.id}
                    title={adminLabel(tile.title)}
                    icon={tile.icon}
                    description={tile.description}
                    links={(tile.links || []).map(l => ({ ...l, label: adminLabel(l.label) }))}
                    status={tile.status}
                    is_authorized={tile.is_authorized}
                    is_public={tile.is_public === 1}
                    isAdmin={user?.role === 'admin'}
                    pending_requests={tile.pending_requests || 0}
                    warning_count={tile.warning_count || 0}
                    info_count={tile.info_count || 0}
                  />
                </div>
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
        .tiles-grid > div {
          cursor: move;
        }
        .tiles-grid > div[draggable="true"] {
          cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 11V7a2 2 0 0 0-4 0v4'/%3E%3Cpath d='M14 7V5a2 2 0 0 0-4 0v6'/%3E%3Cpath d='M10 5V4a2 2 0 0 0-4 0v10'/%3E%3Cpath d='M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8 2 2 0 1 1 4 0'/%3E%3C/svg%3E") 10 1, grab;
        }
        .tiles-grid > div[draggable="true"]:active {
          cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 11V7a2 2 0 0 0-4 0v4'/%3E%3Cpath d='M14 7V5a2 2 0 0 0-4 0v6'/%3E%3Cpath d='M10 5V4a2 2 0 0 0-4 0v10'/%3E%3Cpath d='M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8 2 2 0 1 1 4 0'/%3E%3C/svg%3E") 10 1, grabbing;
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
