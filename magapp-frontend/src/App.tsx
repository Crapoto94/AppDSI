import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Search, Loader2, AlertTriangle, Clock } from 'lucide-react';
import './index.css';

interface Category {
  id: number;
  name: string;
  icon: string | null;
  display_order: number;
}

interface AppItem {
  id: number;
  category_id: number;
  name: string;
  description: string;
  url: string;
  icon: string;
  display_order: number;
  is_maintenance: number;
  maintenance_start: string | null;
  maintenance_end: string | null;
}

function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catsRes, appsRes] = await Promise.all([
          axios.get<Category[]>('/api/magapp/categories'),
          axios.get<AppItem[]>('/api/magapp/apps')
        ]);
        setCategories(catsRes.data.sort((a, b) => a.display_order - b.display_order));
        setApps(appsRes.data.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })));
      } catch (error) {
        console.error("Erreur de chargement des données", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#0078a4' }}>
        <Loader2 className="loading-spinner" size={48} />
      </div>
    );
  }

  const filteredApps = apps.filter(app => 
    app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (app.description && app.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const appsByCategory: Record<number, AppItem[]> = {};
  filteredApps.forEach(app => {
    if (!appsByCategory[app.category_id]) {
      appsByCategory[app.category_id] = [];
    }
    appsByCategory[app.category_id].push(app);
  });

  const handleAppClick = async (app: AppItem) => {
    try {
      // Tentative de récupération du login Windows via NTLM (si disponible)
      let username = 'Anonyme';
      try {
        const authRes = await axios.get('/api/auth/ntlm');
        if (authRes.data && authRes.data.login) username = authRes.data.login;
      } catch (e) { /* Pas de NTLM, on reste anonyme */ }

      await axios.post('/api/magapp/clicks', {
        app_id: app.id,
        username: username
      });
    } catch (error) {
      console.error("Erreur de tracking", error);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR');
  };

  return (
    <div className="magapp-container">
      <div className="search-container">
        <Search className="search-icon" size={20} />
        <input 
          type="text" 
          className="search-input" 
          placeholder="Entrez le nom de l'application pour la trouver"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="logo-header">
        <img src="https://magapp.ivry.local/DSI.PNG" alt="Logo Ivry DSI" onError={(e) => { (e.target as HTMLImageElement).src = 'https://magapp.ivry.local/img/default.png'; }} />
      </div>

      {categories.map(category => {
        const catApps = appsByCategory[category.id] || [];
        if (catApps.length === 0) return null;

        return (
          <section key={category.id} className="category-section">
            <h2 className="category-title">
              {category.name} ({catApps.length})
            </h2>
            
            <div className="apps-grid">
              {catApps.map(app => {
                const isMaint = app.is_maintenance === 1;
                
                return (
                  <div key={app.id} style={{ position: 'relative' }}>
                    <a 
                      href={isMaint ? undefined : app.url} 
                      target={isMaint ? undefined : "_blank"} 
                      rel="noopener noreferrer" 
                      className={`app-card ${isMaint ? 'maintenance' : ''}`}
                      title={isMaint ? `En maintenance du ${formatDate(app.maintenance_start)} au ${formatDate(app.maintenance_end)}` : app.description}
                      onClick={(e) => { 
                        if (isMaint) {
                          e.preventDefault(); 
                        } else {
                          handleAppClick(app);
                        }
                      }}
                      style={{ cursor: isMaint ? 'not-allowed' : 'pointer' }}
                    >
                      <div className="app-icon-container">
                        <img 
                          src={app.icon} 
                          alt={app.name} 
                          style={{ filter: isMaint ? 'grayscale(1) opacity(0.5)' : 'none' }}
                          onError={(e) => { (e.target as HTMLImageElement).src = 'https://magapp.ivry.local/img/default.png'; }} 
                        />
                      </div>
                      <span className="app-name" style={{ color: isMaint ? '#94a3b8' : 'var(--text-blue)' }}>{app.name}</span>
                      
                      {isMaint && (
                        <div className="maintenance-overlay">
                          <Clock size={14} />
                          <span>Maintenance</span>
                        </div>
                      )}
                    </a>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default App;
