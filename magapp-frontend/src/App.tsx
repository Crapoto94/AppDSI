import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Search, Loader2, Clock, Bell, User, Heart, X, LogOut, LifeBuoy, AlertTriangle, Activity, CheckCircle2, XCircle, Tag, Lightbulb, Paperclip, Eye } from 'lucide-react';
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
  solution?: string;
  content?: string;
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
  const [settings, setSettings] = useState({ show_tickets: true, show_subscriptions: true, show_health_check: true, show_create_buttons: true, show_ideas: true, is_beta_user: false, show_tickets_original: true, show_subscriptions_original: true, show_health_check_original: true, show_create_buttons_original: true, show_ideas_original: true });
  const [activeVersion, setActiveVersion] = useState<{ id: number; version_number: string; release_notes_html: string; release_date: string } | null>(null);
  const [allVersions, setAllVersions] = useState<{ id: number; version_number: string; release_notes_html: string; release_date: string; is_active: boolean }[]>([]);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [ticketType, setTicketType] = useState<'incident' | 'demande'>('incident');
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketPhone, setTicketPhone] = useState('');
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [showCreateIdea, setShowCreateIdea] = useState(false);
  const [showMyIdeas, setShowMyIdeas] = useState(false);
  const [showObservedTickets, setShowObservedTickets] = useState(false);
  const [observedTickets, setObservedTickets] = useState<{glpi_id: number, title: string, status_label: string, date_creation: string, type: string, status: string, solution: string, content: string, requester_name: string, requester_email: string}[]>([]);
  const [showClosedObserved, setShowClosedObserved] = useState(false);
  const [ideaTitle, setIdeaTitle] = useState('');
  const [ideaDescription, setIdeaDescription] = useState('');
  const [ideaAttachments, setIdeaAttachments] = useState<File[]>([]);
  const [ticketAttachments, setTicketAttachments] = useState<File[]>([]);
  const [isIncidentGeneral, setIsIncidentGeneral] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showIncidentSelector, setShowIncidentSelector] = useState(false);
  const [highPriorityIncidents, setHighPriorityIncidents] = useState<{glpi_id: number, title: string, status_label: string, date_creation: string}[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const [isCreatingIdea, setIsCreatingIdea] = useState(false);
  const [userIdeas, setUserIdeas] = useState<{id: number, title: string, description: string, status: string, admin_response: string, created_at: string}[]>([]);
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
          await checkVersions();
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
        fetchSafe(`${apiBase}/magapp/settings?username=${encodeURIComponent(username)}${email ? '&email=' + encodeURIComponent(email) : ''}`, { show_tickets: true, show_subscriptions: true, show_health_check: true, show_create_buttons: true, show_ideas: true, is_beta_user: false, show_tickets_original: true, show_subscriptions_original: true, show_health_check_original: true, show_create_buttons_original: true, show_ideas_original: true })
      ]);

      setCategories(cats.sort((a: Category, b: Category) => (a.display_order || 0) - (b.display_order || 0)));
      setApps(appsData.sort((a: AppItem, b: AppItem) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })));
      setFavorites(favs);
      setSubscriptions(subs);
      setTicketCount(tickets.count || 0);
      setUserTickets(ticketsList);
      setSettings({...settingsData, is_beta_user: settingsData.is_beta_user || false, show_tickets_original: settingsData.show_tickets_original ?? settingsData.show_tickets, show_subscriptions_original: settingsData.show_subscriptions_original ?? settingsData.show_subscriptions, show_health_check_original: settingsData.show_health_check_original ?? settingsData.show_health_check, show_create_buttons_original: settingsData.show_create_buttons_original ?? settingsData.show_create_buttons, show_ideas_original: settingsData.show_ideas_original ?? settingsData.show_ideas});
    } catch (error) {
      console.error("Erreur globale de chargement des données", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch versions and check if user has seen the active one
  const checkVersions = async () => {
    try {
      const versionsRes = await axios.get(`${apiBase}/magapp/versions`);
      const versions = versionsRes.data;
      setAllVersions(versions);
      const active = versions.find((v: any) => v.is_active);
      if (active) {
        setActiveVersion(active);
        // Check if user has seen this version
        const token = localStorage.getItem('token');
        if (token) {
          try {
            const prefRes = await axios.get(`${apiBase}/magapp/user-version`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const pref = prefRes.data;
            if (!pref.last_seen_version_id || pref.last_seen_version_id !== active.id) {
              setShowWhatsNew(true);
            }
          } catch {
            // If API fails (no token etc), show the modal anyway
            setShowWhatsNew(true);
          }
        }
      }
    } catch (e) {
      console.error('Erreur chargement versions', e);
    }
  };

  const handleWhatsNewDismiss = async (markAsSeen: boolean) => {
    setShowWhatsNew(false);
    if (markAsSeen && activeVersion) {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          await axios.post(`${apiBase}/magapp/user-version`, { version_id: activeVersion.id }, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
        } catch (e) {
          console.error('Erreur enregistrement version vue', e);
        }
      }
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

  const handleCreateTicket = async () => {
    if (!ticketTitle.trim() || !ticketDescription.trim()) return;
    
    setIsCreatingTicket(true);
    try {
      let content = ticketDescription;
      if (ticketPhone) {
        content += `\n\nNuméro de téléphone pour contact: ${ticketPhone}`;
      }
      content += `\n\nDemandeur: ${userEmail}`;
      content += `\nDate: ${new Date().toLocaleString('fr-FR')}`;
      
      const token = localStorage.getItem('token');
      const isGeneral = ticketType === 'incident' && isIncidentGeneral;
      const blocked = isBlocked;
      
      let urgency = ticketType === 'incident' ? 3 : 2;
      let impact = ticketType === 'incident' ? 2 : 1;
      if (blocked) urgency = 4;
      if (isGeneral) impact = 4;
      
      const response = await axios.post('/api/glpi/tickets', {
        title: ticketTitle,
        content: isGeneral ? `[INCIDENT GENERAL] ${content}` : content,
        type: ticketType === 'incident' ? 1 : 2,
        urgency,
        impact
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const ticketId = response.data?.ticket?.id;
      
      // Upload des pièces jointes
      if (ticketId && ticketAttachments.length > 0) {
        const formData = new FormData();
        ticketAttachments.forEach(file => {
          formData.append('files', file);
        });
        try {
          const uploadRes = await axios.post(`/api/glpi/tickets/${ticketId}/attachments`, formData, {
            headers: { 
              'Authorization': `Bearer ${token}`
            }
          });
          console.log('[Upload] PJ envoyées:', uploadRes.data);
        } catch (uploadError: any) {
          console.error('[Upload] Erreur upload PJ:', uploadError.response?.data || uploadError.message);
        }
      }
      
      setTicketTitle('');
      setTicketDescription('');
      setTicketPhone('');
      setTicketAttachments([]);
      setIsIncidentGeneral(false);
      setIsBlocked(false);
      setShowCreateTicket(false);
      
      if (ticketId) {
        setModalConfig({
          isOpen: true,
          type: 'success',
          title: ticketType === 'incident' ? 'Incident créé' : 'Demande créée',
          message: `${ticketType === 'incident' ? 'Votre incident' : 'Votre demande'} a été créé avec succès.\nNuméro GLPI: ${ticketId}`,
          onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
        });
        
        // Récupérer immédiatement le ticket créé depuis GLPI et l'ajouter à la liste
        try {
          const newTicketRes = await axios.get(`/api/glpi/tickets/${ticketId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (newTicketRes.data) {
            setUserTickets(prev => [newTicketRes.data, ...prev]);
          }
        } catch (e) {
          console.error('Erreur fetch nouveau ticket:', e);
        }
        
        const countRes = await axios.get(`${apiBase}/magapp/tickets-count?email=${userEmail}`);
        setTicketCount(countRes.data.count || 0);
      }
    } catch (error: any) {
      console.error('Erreur création ticket:', error);
      setModalConfig({
        isOpen: true,
        type: 'error',
        title: 'Erreur',
        message: error.response?.data?.message || 'Erreur lors de la création du ticket.',
        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
      });
    } finally {
      setIsCreatingTicket(false);
    }
  };

  const handleCreateIdea = async () => {
    if (!ideaTitle.trim()) return;
    
    setIsCreatingIdea(true);
    try {
      // Créer d'abord l'idée
      const response = await axios.post('/api/magapp/ideas', {
        title: ideaTitle,
        description: ideaDescription,
        author_email: userEmail,
        author_name: displayName
      });
      
      const ideaId = response.data?.id;
      
      // Upload des fichiers si présents
      if (ideaId && ideaAttachments.length > 0) {
        const formData = new FormData();
        formData.append('idea_id', ideaId);
        ideaAttachments.forEach(file => {
          formData.append('files', file);
        });
        await axios.post('/api/magapp/ideas/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      
      setIdeaTitle('');
      setIdeaDescription('');
      setIdeaAttachments([]);
      setShowCreateIdea(false);
      
      setModalConfig({
        isOpen: true,
        type: 'success',
        title: 'Idée créée',
        message: 'Votre idée a été soumise avec succès. Elle sera étudiée par notre équipe.',
        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
      });
    } catch (error: any) {
      console.error('Erreur création idée:', error);
      setModalConfig({
        isOpen: true,
        type: 'error',
        title: 'Erreur',
        message: error.response?.data?.message || 'Erreur lors de la création de l\'idée.',
        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
      });
    } finally {
      setIsCreatingIdea(false);
    }
  };

  const fetchUserIdeas = async () => {
    try {
      const response = await axios.get(`/api/magapp/ideas/user?email=${userEmail}`);
      setUserIdeas(response.data);
    } catch (error) {
      console.error('Erreur chargement idées:', error);
    }
  };

  const fetchObservedTickets = async (includeClosed = false) => {
    try {
      const response = await axios.get(`/api/magapp/observed-tickets?email=${userEmail}&showClosed=${includeClosed}`);
      setObservedTickets(response.data);
    } catch (error) {
      console.error('Erreur chargement tickets observés:', error);
    }
  };

  const handleIncidentClick = async () => {
    try {
      const response = await axios.get('/api/magapp/high-priority-incidents');
      if (response.data && response.data.length > 0) {
        setHighPriorityIncidents(response.data);
        setShowIncidentSelector(true);
      } else {
        setTicketType('incident');
        setShowCreateTicket(true);
      }
    } catch (error) {
      console.error('Erreur chargement incidents haute priorité:', error);
      setTicketType('incident');
      setShowCreateTicket(true);
    }
  };

  const handleSelectExistingIncident = async () => {
    if (!selectedIncidentId) return;
    
    try {
      const token = localStorage.getItem('token');
      const content = `Signalé par ${displayName || userEmail}`;
      await axios.post(`/api/glpi/tickets/${selectedIncidentId}/followup`, { content }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setShowIncidentSelector(false);
      setSelectedIncidentId(null);
      
      setModalConfig({
        isOpen: true,
        type: 'success',
        title: 'Signalement enregistré',
        message: `Votre signalement a été ajouté à l'incident #${selectedIncidentId}.`,
        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
      });
    } catch (error: any) {
      console.error('Erreur signalement:', error);
      setModalConfig({
        isOpen: true,
        type: 'error',
        title: 'Erreur',
        message: error.response?.data?.message || 'Erreur lors du signalement.',
        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
      });
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR');
  };

  const decodeHtmlEntities = (html: string | null | undefined) => {
    if (!html) return '';
    const txt = document.createElement('textarea');
    let prev = '';
    let current = html;
    while (prev !== current) {
      prev = current;
      txt.innerHTML = current;
      current = txt.value;
    }
    return current;
  };

  const renderHtmlTooltip = (html: string | null | undefined) => {
    if (!html) return '';
    return decodeHtmlEntities(html).replace(/<p>/g, '').replace(/<\/p>/g, '<br/>');
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
      opacity: isClosed ? 0.7 : 1,
      cursor: isClosed ? 'default' : 'pointer'
    }}
    onMouseEnter={(e) => {
      const content = isClosed ? (ticket.solution || ticket.content) : ticket.content;
      if (!content) return;
      const removeExisting = () => { const el = document.getElementById('ticket-desc-tooltip'); if (el) el.remove(); };
      removeExisting();
      const rect = e.currentTarget.getBoundingClientRect();
      const tooltip = document.createElement('div');
      tooltip.id = 'ticket-desc-tooltip';
      tooltip.style.cssText = 'position:fixed;z-index:9999;background:#1e293b;color:#fff;padding:10px 14px;border-radius:8px;font-size:0.8rem;max-width:480px;max-height:300px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.25);line-height:1.5;text-align:left;';
      tooltip.innerHTML = renderHtmlTooltip(content);
      document.body.appendChild(tooltip);
      const tipRect = tooltip.getBoundingClientRect();
      let top = rect.bottom + 6;
      let left = rect.left + 10;
      if (top + tipRect.height > window.innerHeight - 10) top = rect.top - tipRect.height - 6;
      if (left + tipRect.width > window.innerWidth - 10) left = window.innerWidth - tipRect.width - 10;
      if (left < 10) left = 10;
      tooltip.style.top = top + 'px';
      tooltip.style.left = left + 'px';
    }}
    onMouseLeave={() => {
      const el = document.getElementById('ticket-desc-tooltip'); if (el) el.remove();
    }}
    onClick={() => {
      if (!isClosed && ticket.status !== 6) {
        setModalConfig({
          isOpen: true,
          type: 'confirm',
          title: 'Clore le ticket',
          message: `Voulez-vous clore le ticket #${ticket.glpi_id} ?`,
          confirmLabel: 'Clore',
          cancelLabel: 'Annuler',
          onConfirm: async () => {
            setModalConfig(prev => ({ ...prev, isOpen: false }));
            try {
              const token = localStorage.getItem('token');
              await axios.put(`/api/glpi/tickets/${ticket.glpi_id}/close`, {}, {
                headers: { Authorization: `Bearer ${token}` }
              });
              // Rafraîchir les tickets
              const ticketsRes = await axios.get(`${apiBase}/magapp/tickets?email=${userEmail}`);
              setUserTickets(ticketsRes.data);
              const countRes = await axios.get(`${apiBase}/magapp/tickets-count?email=${userEmail}`);
              setTicketCount(countRes.data.count || 0);
              setModalConfig({
                isOpen: true,
                type: 'success',
                title: 'Ticket clos',
                message: `Le ticket #${ticket.glpi_id} a été clos avec succès.`,
                onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
              });
            } catch (error) {
              setModalConfig({
                isOpen: true,
                type: 'error',
                title: 'Erreur',
                message: 'Impossible de clore le ticket.',
                onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
              });
            }
          }
        });
      }
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
        }}>
          {ticket.title}
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
          {ticket.date_creation ? formatDate(ticket.date_creation) : ''}
        </div>
        {ticket.status_label && (
          <div style={{ 
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 10px', 
            borderRadius: '12px', 
            fontSize: '0.7rem', 
            fontWeight: 700, 
            background: isClosed ? '#f1f5f9' : '#e2e8f0', 
            color: isClosed ? '#94a3b8' : '#475569',
            whiteSpace: 'nowrap',
            cursor: 'pointer'
          }} 
          onMouseEnter={(e) => {
            if (!ticket.solution) return;
            const el = document.getElementById('ticket-solution-tooltip'); if (el) el.remove();
            const rect = e.currentTarget.getBoundingClientRect();
            const tooltip = document.createElement('div');
            tooltip.id = 'ticket-solution-tooltip';
            tooltip.style.cssText = 'position:fixed;z-index:9999;background:#1e293b;color:#fff;padding:10px 14px;border-radius:8px;font-size:0.8rem;max-width:480px;max-height:300px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.25);line-height:1.5;text-align:left;';
            tooltip.innerHTML = renderHtmlTooltip(ticket.solution || '');
            document.body.appendChild(tooltip);
            const tipRect = tooltip.getBoundingClientRect();
            let top = rect.bottom + 6;
            let left = rect.left + rect.width / 2 - tipRect.width / 2;
            if (top + tipRect.height > window.innerHeight - 10) top = rect.top - tipRect.height - 6;
            if (left + tipRect.width > window.innerWidth - 10) left = window.innerWidth - tipRect.width - 10;
            if (left < 10) left = 10;
            tooltip.style.top = top + 'px';
            tooltip.style.left = left + 'px';
          }}
          onMouseLeave={() => {
            const el = document.getElementById('ticket-solution-tooltip'); if (el) el.remove();
          }}>
            {ticket.status_label}
            {ticket.solution && <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>ⓘ</span>}
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
            {activeVersion && (
              <span
                onClick={() => setShowVersionHistory(true)}
                style={{ 
                  fontSize: '0.7rem', 
                  fontWeight: 700, 
                  color: '#7c3aed', 
                  background: '#f5f3ff', 
                  padding: '2px 10px', 
                  borderRadius: '20px', 
                  cursor: 'pointer',
                  border: '1px solid #e9d5ff',
                  transition: 'all 0.2s',
                  userSelect: 'none'
                }}
                title="Voir l'historique des versions"
              >
                {activeVersion.version_number}
              </span>
            )}
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

            {(settings.show_tickets || settings.is_beta_user) && (
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
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  position: 'relative'
                }}
              >
                <LifeBuoy size={18} />
                Mes tickets ({ticketCount})
                {settings.is_beta_user && !settings.show_tickets_original && <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#f59e0b', color: '#1e293b', fontSize: '0.55rem', fontWeight: 800, padding: '1px 4px', borderRadius: '6px', letterSpacing: '0.05em' }}>BETA</span>}
              </button>
            )}

            {(settings.show_subscriptions || settings.is_beta_user) && (
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
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  position: 'relative'
                }}
              >
                <Heart size={18} />
                Mes abonnements
                {settings.is_beta_user && !settings.show_subscriptions_original && <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#f59e0b', color: '#1e293b', fontSize: '0.55rem', fontWeight: 800, padding: '1px 4px', borderRadius: '6px', letterSpacing: '0.05em' }}>BETA</span>}
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

      {/* Modal What's New */}
      {showWhatsNew && activeVersion && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(6px)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', maxWidth: '560px', width: '100%', borderRadius: '24px', padding: '0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            {/* Header violet */}
            <div style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)', padding: '30px 40px', color: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <Tag size={24} />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '3px 12px', borderRadius: '20px' }}>{activeVersion.version_number}</span>
              </div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Nouveautés !</h2>
              <p style={{ margin: '6px 0 0', fontSize: '0.85rem', opacity: 0.85 }}>
                {new Date(activeVersion.release_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            {/* Contenu */}
            <div style={{ padding: '30px 40px', maxHeight: '40vh', overflowY: 'auto' }}>
              <div
                className="whatsnew-content"
                dangerouslySetInnerHTML={{ __html: activeVersion.release_notes_html }}
                style={{ fontSize: '0.95rem', lineHeight: 1.7, color: '#334155', overflowWrap: 'break-word' }}
              />
            </div>
            {/* Actions */}
            <div style={{ padding: '20px 40px 30px', display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9' }}>
              <button
                onClick={() => handleWhatsNewDismiss(false)}
                style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}
              >
                Afficher à ma prochaine connexion
              </button>
              <button
                onClick={() => handleWhatsNewDismiss(true)}
                style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: '#7c3aed', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', boxShadow: '0 4px 6px -1px rgba(124,58,237,0.3)' }}
              >
                J'ai compris ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Historique des versions */}
      {showVersionHistory && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', maxWidth: '600px', width: '100%', borderRadius: '24px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '30px 40px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Tag size={22} color="#7c3aed" /> Historique des versions
              </h2>
              <button
                onClick={() => setShowVersionHistory(false)}
                style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '20px 40px 30px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {allVersions.map(v => (
                <div key={v.id} style={{ borderLeft: v.is_active ? '3px solid #7c3aed' : '3px solid #e2e8f0', paddingLeft: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 800, fontSize: '1.05rem', color: v.is_active ? '#7c3aed' : '#475569' }}>{v.version_number}</span>
                    {v.is_active && <span style={{ background: '#7c3aed', color: 'white', padding: '1px 8px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: 700 }}>ACTUELLE</span>}
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', marginLeft: 'auto' }}>
                      {new Date(v.release_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  <div
                    className="whatsnew-content"
                    dangerouslySetInnerHTML={{ __html: v.release_notes_html }}
                    style={{ fontSize: '0.85rem', lineHeight: 1.6, color: '#64748b' }}
                  />
                </div>
              ))}
              {allVersions.length === 0 && <p style={{ textAlign: 'center', color: '#94a3b8' }}>Aucune version publiée</p>}
            </div>
          </div>
        </div>
      )}

      {/* Modal Abonnements */}
      {showSubs && (settings.show_subscriptions || settings.is_beta_user) && (
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
      {showTickets && (settings.show_tickets || settings.is_beta_user) && (
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

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              {(settings.show_create_buttons || settings.is_beta_user) && (
                <>
                  <button
                    onClick={handleIncidentClick}
                    style={{ flex: 1, padding: '12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', position: 'relative' }}
                  >
                    <AlertTriangle size={18} />
                    Déclarer un incident
                    {settings.is_beta_user && !settings.show_create_buttons_original && <span style={{ position: 'absolute', top: '-4px', right: '6px', baselineShift: '2mm', background: '#f59e0b', color: '#1e293b', fontSize: '0.6rem', fontWeight: 800, padding: '1px 5px', borderRadius: '6px', letterSpacing: '0.05em' }}>BETA</span>}
                  </button>
                  <button
                    onClick={() => { setTicketType('demande'); setShowCreateTicket(true); }}
                    style={{ flex: 1, padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', position: 'relative' }}
                  >
                    <Clock size={18} />
                    Faire une demande
                    {settings.is_beta_user && !settings.show_create_buttons_original && <span style={{ position: 'absolute', top: '-4px', right: '6px', background: '#f59e0b', color: '#1e293b', fontSize: '0.6rem', fontWeight: 800, padding: '1px 5px', borderRadius: '6px', letterSpacing: '0.05em' }}>BETA</span>}
                  </button>
                </>
              )}
              {(settings.show_ideas || settings.is_beta_user) && (
                <button
                  onClick={() => { setShowCreateIdea(true); setShowMyIdeas(false); }}
                  style={{ flex: 1, padding: '12px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', position: 'relative' }}
                >
                  <Lightbulb size={18} />
                  J'ai une idée !
                  {settings.is_beta_user && !settings.show_ideas_original && <span style={{ position: 'absolute', top: '-4px', right: '6px', background: '#f59e0b', color: '#1e293b', fontSize: '0.6rem', fontWeight: 800, padding: '1px 5px', borderRadius: '6px', letterSpacing: '0.05em' }}>BETA</span>}
                </button>
              )}
              {(settings.show_ideas || settings.is_beta_user) && (
                <button
                  onClick={() => { setShowMyIdeas(true); fetchUserIdeas(); }}
                  style={{ flex: 1, padding: '12px', background: showMyIdeas ? '#7c3aed' : '#6b7280', color: 'white', border: 'none', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', position: 'relative' }}
                >
                  <Lightbulb size={18} />
                  Mes Idées
                  {settings.is_beta_user && !settings.show_ideas_original && <span style={{ position: 'absolute', top: '-4px', right: '6px', background: '#f59e0b', color: '#1e293b', fontSize: '0.6rem', fontWeight: 800, padding: '1px 5px', borderRadius: '6px', letterSpacing: '0.05em' }}>BETA</span>}
                </button>
              )}
{(settings.show_tickets || settings.is_beta_user) && (
                <button
                  onClick={() => { setShowObservedTickets(true); fetchObservedTickets(); setShowMyIdeas(false); }}
                  style={{ flex: 1, padding: '12px', background: showObservedTickets ? '#0891b2' : '#0e7490', color: 'white', border: 'none', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', position: 'relative' }}
                >
                  <Eye size={18} />
                  Tickets observés
                  {settings.is_beta_user && !settings.show_tickets_original && <span style={{ position: 'absolute', top: '-4px', right: '6px', background: '#f59e0b', color: '#1e293b', fontSize: '0.6rem', fontWeight: 800, padding: '1px 5px', borderRadius: '6px', letterSpacing: '0.05em' }}>BETA</span>}
                </button>
              )}
            </div>

            <div style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '10px', marginBottom: '15px' }} className="custom-scrollbar">
              {showMyIdeas ? (
                <>
                  <div style={{ marginBottom: '20px', padding: '15px', background: '#f3e8ff', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Lightbulb size={24} color="#7c3aed" />
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Mes Idées soumises</h3>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Suggestions proposées à la DSI</p>
                    </div>
                    <button
                      onClick={() => setShowMyIdeas(false)}
                      style={{ marginLeft: 'auto', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Revenir à mes tickets
                    </button>
                  </div>
                  {userIdeas.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                      <Lightbulb size={40} style={{ marginBottom: '10px', opacity: 0.5 }} />
                      <p>Aucune idée soumise pour le moment.</p>
                      <p style={{ fontSize: '0.85rem' }}>Cliquez sur "J'ai une idée !" pour en soumettre une !</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {userIdeas.map(idea => (
                        <div key={idea.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{idea.title}</h4>
                            <span style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              background: idea.status === 'new' ? '#fef3c7' : idea.status === 'in_progress' ? '#dbeafe' : idea.status === 'accepted' ? '#dcfce7' : '#fee2e2',
                              color: idea.status === 'new' ? '#92400e' : idea.status === 'in_progress' ? '#1e40af' : idea.status === 'accepted' ? '#166534' : '#991b1b',
                              whiteSpace: 'nowrap'
                            }}>
                              {idea.status === 'new' ? 'Nouvelle' : idea.status === 'in_progress' ? 'En cours' : idea.status === 'accepted' ? 'Acceptée' : idea.status === 'rejected' ? 'Refusée' : idea.status}
                            </span>
                          </div>
                          <p style={{ margin: '0 0 10px 0', color: '#475569', fontSize: '0.9rem' }}>{idea.description}</p>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: idea.admin_response ? '10px' : '0' }}>
                            Soumise le {new Date(idea.created_at).toLocaleDateString('fr-FR')}
                          </div>
                          {idea.admin_response && (
                            <div style={{ marginTop: '12px', padding: '12px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                              <strong style={{ fontSize: '0.8rem', color: '#166534' }}>Réponse de la DSI :</strong>
                              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#15803d' }}>{idea.admin_response}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : showObservedTickets ? (
                <>
                  <div style={{ marginBottom: '20px', padding: '15px', background: '#ecfeff', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <Eye size={24} color="#0891b2" />
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Tickets en observation</h3>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                        {observedTickets.length} ticket{observedTickets.length > 1 ? 's' : ''} ouvert{observedTickets.length > 1 ? 's' : ''}
                        {!showClosedObserved && ' (sans les clos)'}
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        const newValue = !showClosedObserved;
                        setShowClosedObserved(newValue);
                        try {
                          const response = await axios.get(`/api/magapp/observed-tickets?email=${userEmail}&showClosed=${newValue}`);
                          setObservedTickets(response.data);
                        } catch (error) {
                          console.error('Erreur:', error);
                        }
                      }}
                      style={{ background: showClosedObserved ? '#0891b2' : '#e0f2fe', color: showClosedObserved ? 'white' : '#0891b2', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      {showClosedObserved ? 'Masquer clos' : 'Afficher clos'}
                    </button>
                    <button
                      onClick={() => { setShowObservedTickets(false); setShowMyIdeas(false); }}
                      style={{ background: '#0891b2', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Revenir à mes tickets
                    </button>
                  </div>
{observedTickets.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                      <Eye size={40} style={{ marginBottom: '10px', opacity: 0.5 }} />
                      <p>Aucun ticket{showClosedObserved ? '' : ' ouvert'} en observation.</p>
                      <p style={{ fontSize: '0.85rem' }}>Vous n'observez aucun ticket pour le moment.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(() => {
                        const incidents = observedTickets.filter(t => String(t.type) === '1');
                        const demandes = observedTickets.filter(t => String(t.type) !== '1');
                        const groupByRequester = (tickets: typeof observedTickets) => {
                          const groups: Record<string, typeof observedTickets> = {};
                          tickets.forEach(t => {
                            const key = t.requester_name || 'Inconnu';
                            if (!groups[key]) groups[key] = [];
                            groups[key].push(t);
                          });
                          return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
                        };
                        const renderGroup = (tickets: typeof observedTickets) => {
                          const groups = groupByRequester(tickets);
                          return groups.map(([requester, groupTickets]) => (
                            <div key={requester}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0 6px 4px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e0f2fe', color: '#0891b2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>
                                  {requester.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                                </div>
                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>{requester}</span>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{groupTickets.length} ticket{groupTickets.length > 1 ? 's' : ''}</span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginLeft: '40px' }}>
                                {groupTickets.map(ticket => (
                                  <div key={ticket.glpi_id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', cursor: 'pointer' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                                      <div style={{ flex: 1 }}>
                                        <h4
                                          style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b', cursor: 'default' }}
                                          onMouseEnter={(e) => {
                                            const content = String(ticket.status) === '6' ? (ticket.solution || ticket.content) : ticket.content;
                                            if (!content) return;
                                            const el = document.getElementById('ticket-desc-tooltip'); if (el) el.remove();
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const tooltip = document.createElement('div');
                                            tooltip.id = 'ticket-desc-tooltip';
                                            tooltip.style.cssText = 'position:fixed;z-index:9999;background:#1e293b;color:#fff;padding:10px 14px;border-radius:8px;font-size:0.8rem;max-width:480px;max-height:300px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.25);line-height:1.5;text-align:left;';
                                            tooltip.innerHTML = renderHtmlTooltip(content);
                                            document.body.appendChild(tooltip);
                                            const tipRect = tooltip.getBoundingClientRect();
                                            let top = rect.bottom + 6;
                                            let left = rect.left;
                                            if (top + tipRect.height > window.innerHeight - 10) top = rect.top - tipRect.height - 6;
                                            if (left + tipRect.width > window.innerWidth - 10) left = window.innerWidth - tipRect.width - 10;
                                            if (left < 10) left = 10;
                                            tooltip.style.top = top + 'px';
                                            tooltip.style.left = left + 'px';
                                          }}
                                          onMouseLeave={() => {
                                            const el = document.getElementById('ticket-desc-tooltip'); if (el) el.remove();
                                          }}
                                        >
                                          {ticket.title}
                                        </h4>
                                        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Ticket #{ticket.glpi_id}</p>
                                      </div>
                                      <span style={{
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        fontSize: '0.7rem',
                                        fontWeight: 600,
                                        background: ticket.status === '1' ? '#fef3c7' : ticket.status === '2' ? '#dbeafe' : ticket.status === '3' ? '#dbeafe' : ticket.status === '4' ? '#fef3c7' : ticket.status === '5' ? '#dcfce7' : ticket.status === '6' ? '#f3f4f6' : '#f3f4f6',
                                        color: ticket.status === '1' ? '#92400e' : ticket.status === '2' ? '#1e40af' : ticket.status === '3' ? '#1e40af' : ticket.status === '4' ? '#92400e' : ticket.status === '5' ? '#166534' : ticket.status === '6' ? '#374151' : '#374151',
                                        whiteSpace: 'nowrap'
                                      }}>
                                        {ticket.status_label || 'Inconnu'}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '8px' }}>
                                      Créé le {formatDate(ticket.date_creation)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ));
                        };
                        return (
                          <>
                            {incidents.length > 0 && (
                              <div style={{ marginBottom: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', padding: '8px 12px', background: '#fff1f2', borderRadius: '10px', border: '1px solid #fecdd3' }}>
                                  <AlertTriangle size={18} color='#e11d48' />
                                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#9f1239' }}>Incidents</span>
                                  <span style={{ fontSize: '0.75rem', color: '#f43f5e', fontWeight: 600, background: '#fff1f2', padding: '2px 8px', borderRadius: '12px', border: '1px solid #fecdd3' }}>{incidents.length}</span>
                                </div>
                                {renderGroup(incidents)}
                              </div>
                            )}
                            {demandes.length > 0 && (
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', padding: '8px 12px', background: '#f0f9ff', borderRadius: '10px', border: '1px solid #bae6fd' }}>
                                  <Clock size={18} color='#0891b2' />
                                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0c4a6e' }}>Demandes</span>
                                  <span style={{ fontSize: '0.75rem', color: '#0891b2', fontWeight: 600, background: '#f0f9ff', padding: '2px 8px', borderRadius: '12px', border: '1px solid #bae6fd' }}>{demandes.length}</span>
                                </div>
                                {renderGroup(demandes)}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </>
              ) : (
                userTickets.length === 0 ? (
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
                )
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
        
        {(settings.show_health_check || settings.is_beta_user) && (
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
              whiteSpace: 'nowrap',
              position: 'relative'
            }}
          >
            {isTesting ? <Loader2 className="loading-spinner" size={18} /> : <Activity size={18} />}
            {isTesting ? "Test en cours..." : "Tester les applis"}
            {settings.is_beta_user && !settings.show_health_check_original && <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#f59e0b', color: '#1e293b', fontSize: '0.55rem', fontWeight: 800, padding: '1px 4px', borderRadius: '6px', letterSpacing: '0.05em' }}>BETA</span>}
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

      {showCreateTicket && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '30px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>
                {ticketType === 'incident' ? 'Signaler un incident' : 'Faire une demande'}
              </h3>
              <button
                onClick={() => { setShowCreateTicket(false); setTicketDescription(''); setTicketPhone(''); setTicketTitle(''); setTicketAttachments([]); setIsIncidentGeneral(false); setIsBlocked(false); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px' }}
              >
                <X size={24} color="#64748b" />
              </button>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#475569' }}>
                Titre *
              </label>
              <input
                type="text"
                value={ticketTitle}
                onChange={(e) => setTicketTitle(e.target.value)}
                placeholder={ticketType === 'incident' ? 'Courte description de l\'incident' : 'Objet de la demande'}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            {ticketType === 'incident' && (
              <>
                <div style={{ marginBottom: '20px', padding: '15px', background: isIncidentGeneral ? '#fef3c7' : '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'block', marginBottom: '10px', fontWeight: 600, color: '#475569' }}>
                    Cet incident concerne :
                  </label>
                  <div style={{ display: 'flex', gap: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="incidentScope"
                        checked={!isIncidentGeneral}
                        onChange={() => setIsIncidentGeneral(false)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.95rem', color: '#1e293b' }}>Uniquement moi</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="incidentScope"
                        checked={isIncidentGeneral}
                        onChange={() => setIsIncidentGeneral(true)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.95rem', color: '#1e293b' }}>Tout le monde (incident général)</span>
                    </label>
                  </div>
                </div>

                <div style={{ marginBottom: '20px', padding: '12px 15px', background: isBlocked ? '#fee2e2' : '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isBlocked}
                      onChange={(e) => setIsBlocked(e.target.checked)}
                      style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#dc2626' }}
                    />
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: isBlocked ? '#991b1b' : '#1e293b' }}>
                      Je suis bloqué(e) dans mon travail
                    </span>
                  </label>
                </div>
              </>
            )}

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#475569' }}>
                Description
              </label>
              <textarea
                value={ticketDescription}
                onChange={(e) => setTicketDescription(e.target.value)}
                placeholder={ticketType === 'incident' ? 'Décrivez l\'incident en détail...' : 'Décrivez votre demande en détail...'}
                rows={5}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '0.95rem',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#475569' }}>
                Numéro de téléphone (pour vous joindre)
              </label>
              <input
                type="tel"
                value={ticketPhone}
                onChange={(e) => setTicketPhone(e.target.value)}
                placeholder="Ex: 01 43 60 80 00"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#475569' }}>
                Pièces jointes
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#f1f5f9', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <Paperclip size={16} />
                  Ajouter des fichiers
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setTicketAttachments([...ticketAttachments, ...Array.from(e.target.files || [])])}
                    style={{ display: 'none' }}
                  />
                </label>
                {ticketAttachments.map((file, idx) => (
                  <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: '#e0f2fe', borderRadius: '4px', fontSize: '0.8rem' }}>
                    {file.name}
                    <X size={14} style={{ cursor: 'pointer' }} onClick={() => setTicketAttachments(ticketAttachments.filter((_, i) => i !== idx))} />
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => { setShowCreateTicket(false); setTicketDescription(''); setTicketPhone(''); setTicketTitle(''); setTicketAttachments([]); setIsIncidentGeneral(false); setIsBlocked(false); }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleCreateTicket}
                disabled={!ticketTitle.trim() || !ticketDescription.trim() || isCreatingTicket}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: ticketTitle.trim() && ticketDescription.trim() && !isCreatingTicket ? '#dc2626' : '#fca5a5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: ticketTitle.trim() && ticketDescription.trim() && !isCreatingTicket ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {isCreatingTicket ? <Loader2 size={18} className="loading-spinner" /> : (ticketType === 'incident' ? <AlertTriangle size={18} /> : <Clock size={18} />)}
                {isCreatingTicket ? 'Création...' : (ticketType === 'incident' ? "Créer l'incident" : "Créer la demande")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale de sélection d'incident haute priorité */}
      {showIncidentSelector && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '30px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#dc2626' }}>
                Incidents en cours
              </h3>
              <button
                onClick={() => { setShowIncidentSelector(false); setSelectedIncidentId(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px' }}
              >
                <X size={24} color="#64748b" />
              </button>
            </div>

            <p style={{ marginBottom: '20px', color: '#64748b', fontSize: '0.95rem' }}>
              Des incidents majeurs sont déjà signalés. Votre problème est-il lié à l'un d'eux ?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {highPriorityIncidents.map(ticket => (
                <div 
                  key={ticket.glpi_id}
                  onClick={() => setSelectedIncidentId(ticket.glpi_id)}
                  style={{ 
                    padding: '15px', 
                    background: selectedIncidentId === ticket.glpi_id ? '#fef2f2' : '#f8fafc',
                    border: `2px solid ${selectedIncidentId === ticket.glpi_id ? '#dc2626' : '#e2e8f0'}`,
                    borderRadius: '12px', 
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <input
                      type="radio"
                      checked={selectedIncidentId === ticket.glpi_id}
                      onChange={() => setSelectedIncidentId(ticket.glpi_id)}
                      style={{ marginTop: '4px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                        #{ticket.glpi_id} - {ticket.title}
                      </h4>
                      <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        {ticket.status_label} • {formatDate(ticket.date_creation)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => { setShowIncidentSelector(false); setSelectedIncidentId(null); setTicketType('incident'); setShowCreateTicket(true); }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Mon problème est différent
              </button>
              <button
                onClick={handleSelectExistingIncident}
                disabled={!selectedIncidentId}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: selectedIncidentId ? '#dc2626' : '#fca5a5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: selectedIncidentId ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <AlertTriangle size={18} />
Je confirme l'incident
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale de création d'idée */}
      {showCreateIdea && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '30px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>Proposer une idée</h3>
              <button
                onClick={() => { setShowCreateIdea(false); setIdeaTitle(''); setIdeaDescription(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px' }}
              >
                <X size={24} color="#64748b" />
              </button>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#475569' }}>
                Titre de l'idée *
              </label>
              <input
                type="text"
                value={ideaTitle}
                onChange={(e) => setIdeaTitle(e.target.value)}
                placeholder="Décrivez votre idée en quelques mots"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#475569' }}>
                Description détaillée
              </label>
              <textarea
                value={ideaDescription}
                onChange={(e) => setIdeaDescription(e.target.value)}
                placeholder="Expliquez votre idée en détail..."
                rows={5}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '0.95rem',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#475569' }}>
                Pièces jointes
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#f1f5f9', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <Paperclip size={16} />
                  Ajouter des fichiers
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setIdeaAttachments([...ideaAttachments, ...Array.from(e.target.files || [])])}
                    style={{ display: 'none' }}
                  />
                </label>
                {ideaAttachments.map((file, idx) => (
                  <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: '#e0f2fe', borderRadius: '4px', fontSize: '0.8rem' }}>
                    {file.name}
                    <X size={14} style={{ cursor: 'pointer' }} onClick={() => setIdeaAttachments(ideaAttachments.filter((_, i) => i !== idx))} />
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => { setShowCreateIdea(false); setIdeaTitle(''); setIdeaDescription(''); setIdeaAttachments([]); }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleCreateIdea}
                disabled={!ideaTitle.trim() || isCreatingIdea}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: ideaTitle.trim() && !isCreatingIdea ? '#7c3aed' : '#c4b5fd',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: ideaTitle.trim() && !isCreatingIdea ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {isCreatingIdea ? <Loader2 size={18} className="loading-spinner" /> : <Lightbulb size={18} />}
                {isCreatingIdea ? 'Envoi...' : 'Proposer'}
              </button>
            </div>
          </div>
        </div>
      )}
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
            onError={(e) => { (e.target as HTMLImageElement).src = '/api/img/default.png'; }} 
          />
        </div>
        <span className="app-name" style={{ 
          color: isMaint ? '#94a3b8' : 'var(--text-blue)', 
          paddingRight: '80px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{app.name}</span>

          </div>
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
