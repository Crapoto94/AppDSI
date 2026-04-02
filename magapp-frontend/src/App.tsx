import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Search, Loader2, Clock, Bell, User, Heart, X, LogOut, LifeBuoy, AlertTriangle, Activity, CheckCircle2, XCircle } from 'lucide-react';
import './index.css';
import logoDsiHub from './assets/DSI.png';
import Login from './Login';
import ConfirmationModal from './components/ConfirmationModal';

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
  app_type: string;
  present_magapp: string;
  present_onboard: string;
  email_createur: string;
  lien_mercator: string;
}

interface Ticket {
  glpi_id: number;
  title: string;
  status_label: string | null;
  date_creation: string | null;
  type: string;
  status: number;
}

function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [subscriptions, setSubscriptions] = useState<number[]>([]);
  const [ticketCount, setTicketCount] = useState<number>(0);
  const [userTickets, setUserTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAutoLogging, setIsAutoLogging] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [windowLogin, setWindowLogin] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('bel.le inconnu.e');
  const [userEmail, setUserEmail] = useState<string>('');
  const [showSubs, setShowSubs] = useState(false);
  const [showTickets, setShowTickets] = useState(false);
  const [showClosedIncidents, setShowClosedIncidents] = useState(false);
  const [showClosedDemandes, setShowClosedDemandes] = useState(false);
  const [showClosedOthers, setShowClosedOthers] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [healthResults, setHealthResults] = useState<Record<number, 'ok' | 'fail'>>({});
  const [isTesting, setIsTesting] = useState(false);
  const [settings, setSettings] = useState({ show_tickets: true, show_subscriptions: true, show_health_check: true });
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean,
    type: 'info' | 'confirm' | 'prompt' | 'error' | 'success',
    title: string,
    message: string,
    onConfirm: (val?: string) => void,
    defaultValue?: string,
    placeholder?: string,
    confirmLabel?: string,
    cancelLabel?: string
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const apiBase = `/api`; // Utiliser le proxy Vite pour les données

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Vérifier la session temporaire
        const sessionUser = sessionStorage.getItem('magapp_user');
        if (sessionUser) {
          const user = JSON.parse(sessionUser);
          setWindowLogin(user.username);
          setDisplayName(user.displayName);
          setUserEmail(user.email);
          setIsLoggedIn(true);
          setIsAutoLogging(false);
          await loadAppData(user.username, user.email);
          return;
        }

        // Sinon, on demande la connexion (Login.tsx)
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

  const loadAppData = async (username: string, email: string) => {
    try {
      setLoading(true);
      
      const fetchSafe = async (url: string, defaultValue: any) => {
        try {
          const res = await axios.get(url);
          return res.data;
        } catch (e) {
          console.error(`Erreur lors du fetch de ${url}:`, e);
          return defaultValue;
        }
      };

      const [cats, appsData, favs, subs, tickets, ticketsList, settingsData] = await Promise.all([
        fetchSafe(`${apiBase}/magapp/categories`, []),
        fetchSafe(`${apiBase}/magapp/apps`, []),
        fetchSafe(`${apiBase}/magapp/favorites?username=${username}`, []),
        email ? fetchSafe(`${apiBase}/magapp/user-subscriptions?email=${email}`, []) : Promise.resolve([]),
        email ? fetchSafe(`${apiBase}/magapp/tickets-count?email=${email}`, { count: 0 }) : Promise.resolve({ count: 0 }),
        email ? fetchSafe(`${apiBase}/magapp/tickets?email=${email}`, []) : Promise.resolve([]),
        fetchSafe(`${apiBase}/magapp/settings`, { show_tickets: true, show_subscriptions: true, show_health_check: true })
      ]);

      setCategories(cats.sort((a: Category, b: Category) => (a.display_order || 0) - (b.display_order || 0)));
      setApps(appsData.sort((a: AppItem, b: AppItem) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })));
      setFavorites(favs);
      setSubscriptions(subs);
      setTicketCount(tickets.count || 0);
      setUserTickets(ticketsList);
      setSettings(settingsData);
    } catch (error) {
      console.error("Erreur globale de chargement des données", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async (e: React.MouseEvent, appId: number) => {
    e.preventDefault();
    e.stopPropagation();
    const isFav = favorites.includes(appId);
    try {
      if (isFav) {
        await axios.delete(`${apiBase}/magapp/favorites?username=${windowLogin}&app_id=${appId}`);
        setFavorites(prev => prev.filter(id => id !== appId));
      } else {
        await axios.post(`${apiBase}/magapp/favorites`, { username: windowLogin, app_id: appId });
        setFavorites(prev => [...prev, appId]);
      }
    } catch (err) {
      console.error("Erreur favoris", err);
    }
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
    return <Login isAutoLogging={isAutoLogging} />;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#0078a4' }}>
        <Loader2 className="loading-spinner" size={48} />
      </div>
    );
  }

  const appsVisible = apps.filter(app => app.present_magapp === 'oui');

  const filteredApps = appsVisible.filter(app => 
    app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (app.description && app.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const favoriteApps = appsVisible.filter(app => favorites.includes(app.id));

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

  const handleHealthCheck = async () => {
    setIsTesting(true);
    try {
      const res = await axios.post(`${apiBase}/magapp/health-check`);
      setHealthResults(res.data.results || {});
    } catch (error) {
      console.error("Erreur lors du test des applications", error);
      setModalConfig({
        isOpen: true,
        type: 'error',
        title: 'Erreur de test',
        message: 'Erreur lors du test de connectivité des applications.',
        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
      });
    } finally {
      setIsTesting(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR');
  };

  const handleSubscribe = async (e: React.MouseEvent, app: AppItem) => {
    e.preventDefault();
    e.stopPropagation();
    
    const isSubscribed = subscriptions.includes(app.id);

    if (isSubscribed) {
      setModalConfig({
        isOpen: true,
        type: 'confirm',
        title: 'Désabonnement',
        message: `Voulez-vous vous désabonner des alertes pour "${app.name}" ?`,
        confirmLabel: 'Se désabonner',
        cancelLabel: 'Rester abonné',
        onConfirm: async () => {
          setModalConfig(prev => ({ ...prev, isOpen: false }));
          try {
            await axios.delete(`${apiBase}/magapp/user-subscriptions?email=${userEmail}&app_id=${app.id}`);
            setSubscriptions(prev => prev.filter(id => id !== app.id));
          } catch (error) {
            setModalConfig({
              isOpen: true,
              type: 'error',
              title: 'Erreur',
              message: 'Erreur lors du désabonnement.',
              onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
            });
          }
        }
      });
      return;
    }

    if (!userEmail) {
      setModalConfig({
        isOpen: true,
        type: 'prompt',
        title: 'Saisir votre email',
        message: `Nous n'avons pas trouvé votre email. Entrez votre adresse pour être informé des maintenances de ${app.name} :`,
        placeholder: 'nom@villedivry.fr',
        onConfirm: async (email) => {
          if (!email) return;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setModalConfig({
              isOpen: true,
              type: 'error',
              title: 'Email invalide',
              message: 'Veuillez entrer une adresse email valide.',
              onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
            });
            return;
          }
          setModalConfig(prev => ({ ...prev, isOpen: false }));
          try {
            const res = await axios.post(`${apiBase}/magapp/subscribe`, { app_id: app.id, email });
            setSubscriptions(prev => [...prev, app.id]);
            setModalConfig({
              isOpen: true,
              type: 'success',
              title: 'Abonnement réussi',
              message: res.data.message,
              onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
            });
          } catch (error) {
            setModalConfig({
              isOpen: true,
              type: 'error',
              title: 'Erreur',
              message: "Une erreur est survenue lors de l'abonnement.",
              onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
            });
          }
        }
      });
      return;
    }

    setModalConfig({
      isOpen: true,
      type: 'confirm',
      title: 'Confirmation d\'abonnement',
      message: `Voulez-vous vous abonner aux alertes de maintenance pour "${app.name}" via votre adresse : ${userEmail} ?`,
      onConfirm: async () => {
        setModalConfig(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await axios.post(`${apiBase}/magapp/subscribe`, { app_id: app.id, email: userEmail });
          setSubscriptions(prev => [...prev, app.id]);
          setModalConfig({
            isOpen: true,
            type: 'success',
            title: 'Abonnement réussi',
            message: res.data.message,
            onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
          });
        } catch (error) {
          setModalConfig({
            isOpen: true,
            type: 'error',
            title: 'Erreur',
            message: "Une erreur est survenue lors de l'abonnement.",
            onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
          });
        }
      }
    });
  };

  const renderTicketsList = (tickets: Ticket[], title: string, icon: React.ReactNode, accentColor: string, showClosed: boolean, setShowClosed: (v: boolean) => void) => {
    const openTickets = tickets.filter(t => String(t.status) !== '6');
    const closedTickets = tickets.filter(t => String(t.status) === '6');

    if (tickets.length === 0) return null;

    return (
      <div style={{ marginBottom: '25px' }}>
        <h3 style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '10px', 
          fontSize: '1.1rem', 
          fontWeight: 800, 
          color: accentColor,
          marginBottom: '15px',
          borderBottom: `2px solid ${accentColor}20`,
          paddingBottom: '8px'
        }}>
          {icon}
          {title} ({openTickets.length})
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {openTickets.map(ticket => (
            <TicketItem key={ticket.glpi_id} ticket={ticket} />
          ))}
          
          {closedTickets.length > 0 && (
            <>
              <button 
                onClick={() => setShowClosed(!showClosed)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '5px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  marginTop: '5px',
                  alignSelf: 'flex-start'
                }}
              >
                {showClosed ? <X size={14} /> : <Clock size={14} />}
                {showClosed ? "Masquer les tickets clos" : `Afficher les tickets clos (${closedTickets.length})`}
              </button>
              
              {showClosed && closedTickets.map(ticket => (
                <TicketItem key={ticket.glpi_id} ticket={ticket} isClosed={true} />
              ))}
            </>
          )}
        </div>
      </div>
    );
  };

  const TicketItem = ({ ticket, isClosed = false }: { ticket: Ticket, isClosed?: boolean }) => (
    <div style={{ 
      padding: '10px 14px', 
      background: isClosed ? '#f8fafc80' : '#f8fafc', 
      borderRadius: '8px', 
      border: '1px solid #e2e8f0', 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      gap: '15px',
      opacity: isClosed ? 0.7 : 1
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexGrow: 1, minWidth: 0 }}>
        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
          #{ticket.glpi_id}
        </span>
        <div style={{ 
          fontSize: '0.9rem', 
          fontWeight: 600, 
          color: '#1e293b', 
          whiteSpace: 'nowrap', 
          overflow: 'hidden', 
          textOverflow: 'ellipsis',
          textDecoration: isClosed ? 'line-through' : 'none'
        }} title={ticket.title}>
          {ticket.title}
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
          {ticket.date_creation ? formatDate(ticket.date_creation) : ''}
        </div>
        {ticket.status_label && (
          <div style={{ 
            padding: '2px 10px', 
            borderRadius: '12px', 
            fontSize: '0.7rem', 
            fontWeight: 700, 
            background: isClosed ? '#f1f5f9' : '#e2e8f0', 
            color: isClosed ? '#94a3b8' : '#475569',
            whiteSpace: 'nowrap'
          }}>
            {ticket.status_label}
          </div>
        )}
      </div>
    </div>
  );

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

            {settings.show_tickets && (
              <button 
                onClick={() => setShowTickets(true)}
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
                <LifeBuoy size={18} />
                Mes tickets ({ticketCount})
              </button>
            )}

            {settings.show_subscriptions && (
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
            )}

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
      {showSubs && settings.show_subscriptions && (
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

      {/* Modal Tickets */}
      {showTickets && settings.show_tickets && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', maxWidth: '800px', width: '100%', borderRadius: '24px', padding: '40px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', position: 'relative', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <button 
              onClick={() => setShowTickets(false)} 
              style={{ position: 'absolute', top: '25px', right: '25px', background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={20} />
            </button>

            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              <div style={{ width: '60px', height: '60px', background: '#e0f2fe', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <LifeBuoy size={32} color="#0369a1" />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>Mes tickets GLPI</h2>
              <p style={{ color: '#64748b', fontSize: '1rem', marginTop: '10px' }}>
                Liste des tickets associés à l'adresse : {userEmail}
              </p>
            </div>

            <div style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '10px', marginBottom: '15px' }} className="custom-scrollbar">
              {userTickets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                  Aucun ticket trouvé.
                </div>
              ) : (
                <>
                  {renderTicketsList(
                    userTickets.filter(t => String(t.type) === '1'), 
                    "Incidents", 
                    <AlertTriangle size={20} />, 
                    "#e11d48",
                    showClosedIncidents,
                    setShowClosedIncidents
                  )}
                  {renderTicketsList(
                    userTickets.filter(t => String(t.type) === '2'), 
                    "Demandes", 
                    <Clock size={20} />, 
                    "#0078a4",
                    showClosedDemandes,
                    setShowClosedDemandes
                  )}
                  {userTickets.filter(t => String(t.type) !== '1' && String(t.type) !== '2').length > 0 && renderTicketsList(
                    userTickets.filter(t => String(t.type) !== '1' && String(t.type) !== '2'), 
                    "Autres", 
                    <LifeBuoy size={20} />, 
                    "#64748b",
                    showClosedOthers,
                    setShowClosedOthers
                  )}
                </>
              )}
            </div>

            <button 
              onClick={() => setShowTickets(false)} 
              style={{ width: '100%', padding: '14px', background: '#0078a4', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,120,164,0.2)' }}
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
        
        {settings.show_health_check && (
          <button 
            onClick={handleHealthCheck}
            disabled={isTesting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: isTesting ? '#f1f5f9' : '#0078a4',
              color: isTesting ? '#94a3b8' : 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '12px',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: isTesting ? 'wait' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: isTesting ? 'none' : '0 4px 6px -1px rgba(0,120,164,0.2)',
              marginLeft: '15px',
              whiteSpace: 'nowrap'
            }}
          >
            {isTesting ? <Loader2 className="loading-spinner" size={18} /> : <Activity size={18} />}
            {isTesting ? "Test en cours..." : "Tester les applis"}
          </button>
        )}
      </div>

      {/* Mes Favoris Section Dynamique */}
      {favoriteApps.length > 0 && (
        <section className="category-section">
          <h2 className="category-title" style={{ color: '#e11d48', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Heart size={24} fill="#e11d48" color="#e11d48" />
            Mes applications ({favoriteApps.length})
          </h2>
          <div className="apps-grid">
            {favoriteApps.map(app => (
              <AppCard 
                key={`fav-${app.id}`} 
                app={app} 
                isFavorite={true}
                isSubscribed={subscriptions.includes(app.id)}
                showSubscriptions={settings.show_subscriptions}
                toggleFavorite={toggleFavorite}
                handleSubscribe={handleSubscribe}
                handleAppClick={handleAppClick}
                formatDate={formatDate}
                healthStatus={healthResults[app.id]}
              />
            ))}
          </div>
        </section>
      )}

      {categories.map(category => {
        const catApps = appsByCategory[category.id] || [];
        if (catApps.length === 0) return null;

        return (
          <section key={category.id} className="category-section">
            <h2 className="category-title">
              {category.name} ({catApps.length})
            </h2>
            
            <div className="apps-grid">
              {catApps.map(app => (
                <AppCard 
                  key={app.id} 
                  app={app} 
                  isFavorite={favorites.includes(app.id)}
                  isSubscribed={subscriptions.includes(app.id)}
                  showSubscriptions={settings.show_subscriptions}
                  toggleFavorite={toggleFavorite}
                  handleSubscribe={handleSubscribe}
                  handleAppClick={handleAppClick}
                  formatDate={formatDate}
                  healthStatus={healthResults[app.id]}
                />
              ))}
            </div>
          </section>
        );
      })}

      <ConfirmationModal 
        isOpen={modalConfig.isOpen}
        type={modalConfig.type}
        title={modalConfig.title}
        message={modalConfig.message}
        defaultValue={modalConfig.defaultValue}
        placeholder={modalConfig.placeholder}
        confirmLabel={modalConfig.confirmLabel}
        cancelLabel={modalConfig.cancelLabel}
        onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

interface AppCardProps {
  app: AppItem;
  isFavorite: boolean;
  isSubscribed: boolean;
  showSubscriptions: boolean;
  toggleFavorite: (e: React.MouseEvent, appId: number) => void;
  handleSubscribe: (e: React.MouseEvent, app: AppItem) => void;
  handleAppClick: (app: AppItem) => void;
  formatDate: (dateStr: string | null) => string;
  healthStatus?: 'ok' | 'fail';
}

const AppCard: React.FC<AppCardProps> = ({ app, isFavorite, isSubscribed, showSubscriptions, toggleFavorite, handleSubscribe, handleAppClick, formatDate, healthStatus }) => {
  const isMaint = app.is_maintenance === 1;
  const healthClass = healthStatus === 'ok' ? 'health-ok' : (healthStatus === 'fail' ? 'health-fail' : '');
  
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <a 
        href={isMaint ? undefined : app.url} 
        target={isMaint ? undefined : "_blank"} 
        rel="noopener noreferrer" 
        className={`app-card ${isMaint ? 'maintenance' : ''} ${healthClass}`}
        title={isMaint ? `En maintenance du ${formatDate(app.maintenance_start)} au ${formatDate(app.maintenance_end)}` : app.description}
        onClick={(e) => { 
          if (isMaint) {
            e.preventDefault(); 
          } else {
            handleAppClick(app);
          }
        }}
        style={{ cursor: isMaint ? 'not-allowed' : 'pointer', flexGrow: 1 }}
      >
        <div className="health-bar"></div>
        <div className="app-icon-container">
          <img 
            src={app.icon} 
            alt={app.name} 
            style={{ filter: isMaint ? 'grayscale(1) opacity(0.5)' : 'none' }}
            onError={(e) => { (e.target as HTMLImageElement).src = '/img/default.png'; }} 
          />
        </div>
        <span className="app-name" style={{ 
          color: isMaint ? '#94a3b8' : 'var(--text-blue)', 
          paddingRight: '80px'
        }}>
          {app.name}
          {healthStatus === 'ok' && <CheckCircle2 size={14} color="#22c55e" />}
          {healthStatus === 'fail' && <XCircle size={14} color="#ef4444" />}
        </span>
        
        {isMaint && (
          <div className="maintenance-overlay" style={{ right: '85px' }}>
            <Clock size={14} />
            <span>Maintenance</span>
          </div>
        )}
      </a>

      <div className="card-actions" style={{ position: 'absolute', right: '25px', display: 'flex', gap: '8px', zIndex: 5 }}>
        {showSubscriptions && (
          <button 
            className="subscribe-btn-custom"
            onClick={(e) => handleSubscribe(e, app)}
            title={isSubscribed ? "Se désabonner des alertes" : "S'abonner aux alertes maintenance"}
            style={{ 
              background: 'white', 
              border: '1px solid #e2e8f0', 
              borderRadius: '50%', 
              width: '32px', 
              height: '32px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              color: isSubscribed ? '#0078a4' : '#94a3b8',
              transition: 'all 0.2s'
            }}
          >
            <Bell size={16} fill={isSubscribed ? "#0078a4" : "none"} />
          </button>
        )}
        <button 
          className="favorite-btn"
          onClick={(e) => toggleFavorite(e, app.id)}
          title={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          style={{ 
            background: 'white', 
            border: '1px solid #e2e8f0', 
            borderRadius: '50%', 
            width: '32px', 
            height: '32px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            color: isFavorite ? '#e11d48' : '#94a3b8',
            transition: 'all 0.2s'
          }}
        >
          <Heart size={18} fill={isFavorite ? "#e11d48" : "none"} />
        </button>
      </div>
    </div>
  );
};

export default App;
