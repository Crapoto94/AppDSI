import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Search, Loader2, Clock, Bell, User, Heart, X, LogOut } from 'lucide-react';
import './index.css';
import logoDsiHub from './assets/logo-dsi-hub.svg';
import Login from './Login';

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
  const [isAutoLogging, setIsAutoLogging] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [windowLogin, setWindowLogin] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('bel.le inconnu.e');
  const [userEmail, setUserEmail] = useState<string>('');
  const [showSubs, setShowSubs] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const apiBase = `/api`; // Utiliser le proxy Vite

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // 1. Vérifier si on a des infos dans l'URL (Retour de SSO Redirect)
        const params = new URLSearchParams(window.location.search);
        const urlLogin = params.get('login');
        const urlName = params.get('name');
        const urlEmail = params.get('email');

        if (urlLogin) {
          setWindowLogin(urlLogin);
          setDisplayName(urlName || urlLogin);
          setUserEmail(urlEmail || '');
          setIsLoggedIn(true);
          setIsAutoLogging(false);
          
          // Sauvegarder pour la session en cours uniquement
          sessionStorage.setItem('magapp_user', JSON.stringify({
            username: urlLogin,
            displayName: urlName || urlLogin,
            email: urlEmail || ''
          }));

          // Nettoyer l'URL
          window.history.replaceState({}, document.title, window.location.pathname);
          await loadAppData();
          return;
        }

        // 2. Vérifier la session temporaire
        const sessionUser = sessionStorage.getItem('magapp_user');
        if (sessionUser) {
          const user = JSON.parse(sessionUser);
          setWindowLogin(user.username);
          setDisplayName(user.displayName);
          setUserEmail(user.email);
          setIsLoggedIn(true);
          setIsAutoLogging(false);
          await loadAppData();
          return;
        }

        // 3. Tenter l'appel NTLM direct
        try {
          const authRes = await axios.get(`${apiBase}/auth/ntlm`, { 
            withCredentials: true,
            timeout: 2000 
          });
          if (authRes.data && authRes.data.login) {
            setWindowLogin(authRes.data.login);
            setDisplayName(authRes.data.displayName || authRes.data.login);
            setUserEmail(authRes.data.email || '');
            setIsLoggedIn(true);
            setIsAutoLogging(false);
            await loadAppData();
            return;
          }
        } catch (e) {
          console.log("Appel NTLM direct impossible");
        }

        // 4. Tenter la redirection SSO si pas déjà fait
        if (!sessionStorage.getItem('sso_attempted')) {
          sessionStorage.setItem('sso_attempted', 'true');
          window.location.href = `${apiBase}/auth/sso-redirect?redirect=${encodeURIComponent(window.location.href)}`;
          return;
        }

        // 5. Si on arrive ici, le SSO a échoué
        setIsAutoLogging(false);
        setIsLoggedIn(false);
        setLoading(false);
      } catch (error) {
        console.error("Erreur d'authentification", error);
        setIsAutoLogging(false);
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const loadAppData = async () => {
    try {
      setLoading(true);
      const [catsRes, appsRes] = await Promise.all([
        axios.get<Category[]>(`${apiBase}/magapp/categories`),
        axios.get<AppItem[]>(`${apiBase}/magapp/apps`)
      ]);
      setCategories(catsRes.data.sort((a, b) => a.display_order - b.display_order));
      setApps(appsRes.data.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })));
    } catch (error) {
      console.error("Erreur de chargement des données", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (user: any, token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setWindowLogin(user.username);
    setDisplayName(user.username);
    setIsLoggedIn(true);
    loadAppData();
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('magapp_user');
    sessionStorage.removeItem('sso_attempted');
    setIsLoggedIn(false);
    setWindowLogin('');
    setDisplayName('bel.le inconnu.e');
  };

  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} isAutoLogging={isAutoLogging} />;
  }

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
      await axios.post(`${apiBase}/magapp/clicks`, {
        app_id: app.id,
        username: windowLogin || 'Anonyme'
      });
    } catch (error) {
      console.error("Erreur de tracking", error);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR');
  };

  const handleSubscribe = async (e: React.MouseEvent, app: AppItem) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!userEmail) {
      const email = window.prompt(`Nous n'avons pas trouvé votre email AD. Entrez votre adresse email pour être informé des maintenances de ${app.name} :`);
      if (!email) return;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert("Veuillez entrer une adresse email valide.");
        return;
      }
      try {
        const res = await axios.post(`${apiBase}/magapp/subscribe`, { app_id: app.id, email });
        alert(res.data.message);
      } catch (error) {
        alert("Une erreur est survenue lors de l'abonnement.");
      }
      return;
    }

    if (window.confirm(`Voulez-vous vous abonner aux alertes de maintenance pour "${app.name}" via votre adresse : ${userEmail} ?`)) {
      try {
        const res = await axios.post(`${apiBase}/magapp/subscribe`, { app_id: app.id, email: userEmail });
        alert(res.data.message);
      } catch (error) {
        console.error("Erreur d'abonnement", error);
        alert("Une erreur est survenue lors de l'abonnement.");
      }
    }
  };

  return (
    <div className="magapp-container" style={{ paddingTop: '100px' }}>
      {/* Header Fixe */}
      <header style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        height: '80px', 
        background: 'white', 
        borderBottom: '1px solid #e2e8f0', 
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '0 20px'
      }}>
        <div style={{ maxWidth: '1400px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <img src={logoDsiHub} alt="Logo" style={{ height: '50px' }} />
            <div style={{ width: '2px', height: '30px', background: '#0078a4', opacity: 0.3 }}></div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0078a4', letterSpacing: '-0.025em' }}>Magasin d'Applications</h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '25px' }}>
            <div 
              onClick={() => setShowEmail(!showEmail)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px', 
                background: '#f8fafc', 
                padding: '8px 16px', 
                borderRadius: '12px', 
                border: '1px solid #f1f5f9',
                cursor: 'pointer',
                transition: 'all 0.2s',
                userSelect: 'none'
              }}
              className="identity-block"
              onMouseOver={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.borderColor = '#0078a430'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#f1f5f9'; }}
            >
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>Bienvenue, {displayName}</div>
                <div style={{ fontSize: '0.75rem', color: showEmail ? '#0078a4' : '#64748b', fontWeight: showEmail ? 700 : 400 }}>
                  {showEmail ? (userEmail || 'Email non trouvé') : (windowLogin ? 'Session Active' : 'Utilisateur invité')}
                </div>
              </div>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #0078a4 0%, #00a0db 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px -1px rgba(0,120,164,0.2)' }}>
                <User size={22} color="white" />
              </div>
            </div>

            <button 
              onClick={() => setShowSubs(true)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                background: 'white', 
                border: '1px solid #cbd5e1', 
                padding: '10px 18px', 
                borderRadius: '10px',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            >
              <Heart size={18} />
              Mes abonnements
            </button>

            <button 
              onClick={handleLogout}
              style={{ 
                background: '#fff1f2', 
                border: '1px solid #fecdd3', 
                padding: '10px', 
                borderRadius: '10px',
                color: '#e11d48',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              title="Déconnexion"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Modal Abonnements */}
      {showSubs && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', maxWidth: '500px', width: '100%', borderRadius: '24px', padding: '40px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', position: 'relative' }}>
            <button 
              onClick={() => setShowSubs(false)} 
              style={{ position: 'absolute', top: '25px', right: '25px', background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={20} />
            </button>

            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              <div style={{ width: '60px', height: '60px', background: '#fff1f2', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <Heart size={32} color="#e11d48" fill="#e11d48" />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>Mes abonnements</h2>
              <p style={{ color: '#64748b', fontSize: '1rem', marginTop: '10px', lineHeight: '1.5' }}>
                Gérez vos alertes de maintenance pour vos applications favorites.
              </p>
            </div>

            <div style={{ padding: '30px', background: '#f8fafc', borderRadius: '20px', textAlign: 'center', border: '1px dashed #cbd5e1' }}>
              <Bell size={40} color="#94a3b8" style={{ marginBottom: '15px', opacity: 0.5 }} />
              <div style={{ fontSize: '1rem', color: '#64748b', fontWeight: 500 }}>
                {userEmail ? `Les alertes sont envoyées à : ${userEmail}` : "Aucun email configuré."}
              </div>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '8px' }}>
                Cliquez sur l'icône <Bell size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> d'une application pour vous abonner.
              </p>
            </div>

            <button 
              onClick={() => setShowSubs(false)} 
              style={{ width: '100%', marginTop: '30px', padding: '14px', background: '#0078a4', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,120,164,0.2)' }}
            >
              Fermer
            </button>
          </div>
        </div>
      )}

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
        <img src={logoDsiHub} alt="Logo Ivry DSI" />
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
                    <button 
                      className="subscribe-btn"
                      onClick={(e) => handleSubscribe(e, app)}
                      title="S'abonner aux alertes maintenance"
                    >
                      <Bell size={14} />
                    </button>
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
                          onError={(e) => { (e.target as HTMLImageElement).src = '/img/default.png'; }} 
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
