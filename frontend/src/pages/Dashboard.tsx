import React, { useEffect, useState } from 'react';
import Tile from '../components/Tile';
import Header from '../components/Header';

interface TileData {
  id: number;
  title: string;
  icon: string;
  description: string;
  links: any[];
  status?: 'active' | 'maintenance' | 'soon';
  orphan_orders?: number;
  orphan_invoices?: number;
}

const Dashboard: React.FC = () => {
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTiles = async () => {
      try {
        const response = await fetch('/api/tiles', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setTiles(data);
        } else {
          setError('Erreur lors du chargement des tuiles');
        }
      } catch (err) {
        setError('Impossible de contacter le serveur');
      } finally {
        setLoading(false);
      }
    };

    fetchTiles();
  }, []);

  return (
    <div className="dashboard-page">
      <Header />
      
      <main className="container">
        <section className="dashboard-hero">
          <h1 className="hero-title">Hub DSI - Ivry-sur-Seine</h1>
          <p className="hero-subtitle">Retrouvez tous vos outils et services en un seul endroit.</p>
        </section>

        {loading ? (
          <div className="loading">Chargement...</div>
        ) : error ? (
          <div className="error-msg">{error}</div>
        ) : (
          <div className="tiles-grid">
            {tiles.map((tile) => (
              <Tile
                key={tile.id}
                title={tile.title}
                icon={tile.icon}
                description={tile.description}
                links={tile.links}
                status={tile.status}
                orphan_orders={tile.orphan_orders}
                orphan_invoices={tile.orphan_invoices}
              />
            ))}
          </div>
        )}
      </main>

      <style>{`
        .dashboard-page {
          min-height: 100vh;
        }
        .dashboard-hero {
          padding: 60px 0 40px;
          text-align: center;
        }
        .hero-title {
          font-size: 36px;
          color: var(--secondary-color);
          margin-bottom: 15px;
          font-weight: 800;
        }
        .hero-subtitle {
          font-size: 18px;
          color: #666;
          max-width: 600px;
          margin: 0 auto;
        }
        .tiles-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 30px;
          padding-bottom: 60px;
        }
        .loading, .error-msg {
          text-align: center;
          padding: 50px;
          font-size: 18px;
        }
        .error-msg {
          color: var(--primary-color);
        }
      `}</style>
    </div>
  );
};

export default Dashboard;



