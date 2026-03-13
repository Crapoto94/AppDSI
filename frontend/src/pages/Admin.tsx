import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, X, UserPlus, Users, Edit2, 
  ChevronUp, ChevronDown, 
  Loader2, Search, ShieldCheck, Radio, Save,
  CheckCircle2, Activity, Database, Euro,
  ShieldAlert, Box, LayoutGrid,
  Globe, Key, Fingerprint, Check, AlertTriangle, BarChart3,
  Zap, History as HistoryIcon, Hash, Lock, Download
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

interface TileLink {
  id: number;
  tile_id: number;
  label: string;
  url: string;
  is_internal: number;
}

interface TileData {
  id: number;
  title: string;
  icon: string;
  description: string;
  links: TileLink[];
  status: 'active' | 'maintenance' | 'soon';
  sort_order: number;
}

interface UserData {
  id: number;
  username: string;
  role: string;
  is_approved: number;
  last_activity: string | null;
  service_code: string | null;
  service_complement: string | null;
}

interface AdminProps {
  section?: 'main' | 'tiles' | 'users' | 'ad' | 'glpi' | 'oracle';
}

const Admin: React.FC<AdminProps> = ({ section = 'main' }) => {
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [newTile, setNewTile] = useState({ title: '', icon: 'Box', description: '', status: 'active' as any });
  const [editingTile, setEditingTile] = useState<TileData | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user', service_code: '', service_complement: '' });
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [adConfig, setAdConfig] = useState({ 
    is_enabled: false,
    host: '10.103.130.118', 
    port: 389,
    base_dn: 'DC=ivry,DC=local',
    required_group: 'gantto',
    bind_dn: 'CN=testo,OU=IRS,OU=IVRY,DC=ivry,DC=local',
    bind_password: ''
  });
  const [testUser, setTestUser] = useState({ username: '' });
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [glpiConfig, setGlpiConfig] = useState({
    url: '',
    app_token: '',
    user_token: '',
    login: '',
    password: '',
    is_enabled: false
  });
  const [glpiTestResult, setGlpiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [ticketsCount, setTicketsCount] = useState<number | null>(null);
  const [recentTickets, setRecentTickets] = useState<any[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [profileResult, setProfileResult] = useState<any>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ active: false, processed: 0, total: 0 });
  
  const [oracleConfigs, setOracleConfigs] = useState<any[]>([
    { type: 'FINANCES', host: '', port: 1521, service_name: '', username: '', password: '', is_enabled: 0 },
    { type: 'RH', host: '', port: 1521, service_name: '', username: '', password: '', is_enabled: 0 }
  ]);
  const [oracleTestResults, setOracleTestResults] = useState<Record<string, { success: boolean, message: string, details?: string[] }>>({});
  const [isTestingOracle, setIsTestingOracle] = useState<Record<string, boolean>>({});
  const [selectedTables, setSelectedTables] = useState<Record<string, string[]>>({});
  const [tableFilters, setTableFilters] = useState<Record<string, Record<string, string>>>({});
  const [tableSearch, setTableSearch] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState<Record<string, boolean>>({});
  const [importReports, setImportReports] = useState<Record<string, any[]>>({});
  const [tableColumns, setTableColumns] = useState<Record<string, string[]>>({});
  const [substitutions, setSubstitutions] = useState<Record<string, Record<string, any>>>({});
  const [activeSubstModal, setActiveSubstModal] = useState<{type: string, table: string} | null>(null);
  const [loadingCols, setLoadingCols] = useState(false);

  const fetchTableColumns = async (type: string, tableName: string) => {
    setLoadingCols(true);
    try {
      const res = await axios.post('/api/oracle/table-columns', { type, tableName }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTableColumns(prev => ({ ...prev, [`${type}:${tableName}`]: res.data.columns }));
    } catch (error) {
      console.error('Erreur colonnes:', error);
    } finally {
      setLoadingCols(false);
    }
  };

  const handleOpenSubstModal = async (type: string, tableName: string) => {
    setActiveSubstModal({ type, table: tableName });
    if (!tableColumns[`${type}:${tableName}`]) {
      await fetchTableColumns(type, tableName);
    }
  };

  const updateSubstitution = (type: string, table: string, field: string, data: any) => {
    const current = substitutions[type] || {};
    const tableSubst = current[table] || {};
    
    if (!data) {
      delete tableSubst[field];
    } else {
      tableSubst[field] = data;
    }

    setSubstitutions({
      ...substitutions,
      [type]: { ...current, [table]: { ...tableSubst } }
    });
  };


  const { token } = useAuth();

  const handleImportOracleTables = async (type: string) => {
    const tables = selectedTables[type] || [];
    if (tables.length === 0) return;
    
    if (!window.confirm(`Confirmer l'importation de ${tables.length} objet(s) (tables/vues) depuis Oracle ${type} vers la base locale ?\nLes tables locales seront préfixées par 'oracle_'.`)) return;

    setImporting(prev => ({ ...prev, [type]: true }));
    setImportReports(prev => ({ ...prev, [type]: null }));
    try {
      const res = await axios.post('/api/oracle/import-tables', { 
        type, 
        tables,
        filters: tableFilters[type] || {},
        substitutions: substitutions[type] || {}
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setImportReports(prev => ({ ...prev, [type]: res.data.report }));
      alert(res.data.message);
    } catch (error: any) {
      alert(error.response?.data?.message || "Erreur lors de l'importation");
    } finally {
      setImporting(prev => ({ ...prev, [type]: false }));
    }
  };

  const fetchTiles = async () => {
    try {
      const response = await fetch('/api/tiles', { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) {
        const data = await response.json();
        setTiles(Array.isArray(data) ? data.sort((a: any, b: any) => a.sort_order - b.sort_order) : []);
      }
    } catch (e) {}
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchADSettings = async () => {
    try {
      const response = await fetch('/api/ad-settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAdConfig({ 
          is_enabled: !!data.is_enabled,
          host: data.host || '',
          port: data.port || 389,
          base_dn: data.base_dn || '',
          required_group: data.required_group || '',
          bind_dn: data.bind_dn || '',
          bind_password: '' 
        });
      }
    } catch (error) {
      console.error('Erreur chargement AD:', error);
    }
  };

  const fetchGLPISettings = async () => {
    try {
      const res = await fetch('/api/glpi-settings', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setGlpiConfig({ ...data, is_enabled: !!data.is_enabled });
      }
    } catch (e) {}
  };

  const fetchOracleSettings = async () => {
    try {
      const res = await fetch('/api/oracle-settings', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const types = ['FINANCES', 'RH'];
        const syncedData = types.map(t => {
          const existing = data.find((d: any) => d.type === t);
          return existing || { type: t, host: '', port: 1521, service_name: '', username: '', password: '', is_enabled: 0 };
        });
        setOracleConfigs(syncedData);
        
        // Load permanent sync config for each type
        for (const type of types) {
          const configRes = await axios.get(`/api/oracle/sync-config/${type}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (configRes.data && Array.isArray(configRes.data)) {
            const tables = configRes.data.map((item: any) => item.table_name);
            const filters: Record<string, string> = {};
            configRes.data.forEach((item: any) => {
              filters[item.table_name] = item.where_clause || '';
            });
            
            setSelectedTables(prev => ({ ...prev, [type]: tables }));
            setTableFilters(prev => ({ ...prev, [type]: filters }));
          }
        }
      }
    } catch (e) {}
  };

  const handleSaveOracleSyncConfig = async (type: string) => {
    setIsSaving(true);
    try {
      await axios.post('/api/oracle/sync-config', {
        type,
        tables: selectedTables[type] || [],
        filters: tableFilters[type] || {}
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Configuration de synchronisation enregistrée');
    } catch (error) {
      alert('Erreur lors de la sauvegarde de la configuration');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (section === 'tiles') fetchTiles();
    if (section === 'users') fetchUsers();
    if (section === 'ad') fetchADSettings();
    if (section === 'glpi') fetchGLPISettings();
    if (section === 'oracle') fetchOracleSettings();
    if (section === 'main') { fetchTiles(); fetchUsers(); }
  }, [section, token]);

  const handleSaveGLPI = async () => {
    setIsSaving(true);
    try {
      await axios.post('/api/glpi-settings', glpiConfig, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Paramètres GLPI enregistrés');
    } catch (error) {
      alert('Erreur lors de l\'enregistrement');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestGLPI = async () => {
    setIsTesting(true);
    setGlpiTestResult(null);
    try {
      const response = await axios.post('/api/glpi/test-connection', {
        url: glpiConfig.url,
        app_token: glpiConfig.app_token,
        user_token: glpiConfig.user_token,
        login: glpiConfig.login,
        password: glpiConfig.password
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGlpiTestResult({ success: response.data.success, message: response.data.message });
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Erreur lors du test';
      setGlpiTestResult({ success: false, message: msg });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCountTickets = async () => {
    setIsLoadingTickets(true);
    try {
      const res = await fetch('/api/glpi/tickets-count', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setTicketsCount(data.count);
      } else {
        const data = await res.json();
        alert(data.message);
      }
    } catch (e) {
      alert('Erreur lors de la récupération du nombre de tickets');
    } finally {
      setIsLoadingTickets(false);
    }
  };

  const handleFetchRecentTickets = async () => {
    setIsLoadingRecent(true);
    try {
      const res = await axios.get('/api/glpi/recent-tickets', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRecentTickets(res.data.tickets);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erreur lors de la récupération des tickets récents');
    } finally {
      setIsLoadingRecent(false);
    }
  };

  const handleSyncTickets = async () => {
    setIsSyncing(true);
    setSyncStatus({ active: true, processed: 0, total: 0 });

    const pollInterval = setInterval(async () => {
      try {
        const res = await axios.get('/api/glpi/sync-status', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSyncStatus(res.data);
        if (!res.data.active) clearInterval(pollInterval);
      } catch (e) {
        console.error('Erreur polling status:', e);
      }
    }, 1500);

    try {
      const response = await axios.post('/api/glpi/sync-tickets', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`Synchronisation réussie : ${response.data.count} tickets importés dans la base locale.`);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erreur lors de la synchronisation');
    } finally {
      setIsSyncing(false);
      setSyncStatus(prev => ({ ...prev, active: false }));
      clearInterval(pollInterval);
    }
  };

  const handleSyncAllTickets = async () => {
    if (!window.confirm("Attention : Vous allez synchroniser l'intégralité de la base GLPI (+36 000 tickets). Cette opération peut prendre quelques minutes. Souhaitez-vous continuer ?")) return;
    
    setIsSyncingAll(true);
    setSyncStatus({ active: true, processed: 0, total: 0 });

    // Lancer le polling
    const pollInterval = setInterval(async () => {
      try {
        const res = await axios.get('/api/glpi/sync-status', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSyncStatus(res.data);
        if (!res.data.active) {
            clearInterval(pollInterval);
        }
      } catch (e) {
        console.error('Erreur polling status:', e);
      }
    }, 2000);

    try {
      const response = await axios.post('/api/glpi/sync-all-tickets', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`Synchronisation totale réussie : ${response.data.count} / ${response.data.total} tickets importés.`);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erreur lors de la synchronisation totale');
    } finally {
      setIsSyncingAll(false);
      setSyncStatus(prev => ({ ...prev, active: false }));
      clearInterval(pollInterval);
    }
  };

  const handleGetProfile = async () => {
    setIsLoadingProfile(true);
    setProfileResult(null);
    try {
      const res = await fetch('/api/glpi/my-profile', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setProfileResult({ success: true, profiles: data.profiles });
      } else {
        const data = await res.json();
        setProfileResult({ success: false, message: data.message });
      }
    } catch (e) {
      setProfileResult({ success: false, message: 'Erreur lors de la récupération du profil' });
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handleSaveOracle = async (config: any) => {
    setIsSaving(true);
    try {
      await axios.post('/api/oracle-settings', config, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`Paramètres Oracle ${config.type} enregistrés`);
      fetchOracleSettings();
    } catch (error) {
      alert('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestOracle = async (type: string) => {
    const config = oracleConfigs.find(c => c.type === type);
    if (!config) return;
    
    setIsTestingOracle(prev => ({ ...prev, [type]: true }));
    setOracleTestResults(prev => ({ ...prev, [type]: { success: false, message: 'Test en cours...' } }));
    
    try {
        const res = await axios.post('/api/oracle/test-connection', { host: config.host, type }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        setOracleTestResults(prev => ({ ...prev, [type]: { success: res.data.success, message: res.data.message } }));
    } catch (error: any) {
        setOracleTestResults(prev => ({ ...prev, [type]: { success: false, message: error.response?.data?.message || 'Erreur de connexion' } }));
    } finally {
        setIsTestingOracle(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleCheckOracleTables = async (type: string) => {
    setIsTestingOracle(prev => ({ ...prev, [type]: true }));
    try {
        const res = await axios.post('/api/oracle/check-tables', { type }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        setOracleTestResults(prev => ({ ...prev, [type]: { success: res.data.success, message: res.data.message, details: res.data.details } }));
    } catch (error: any) {
        setOracleTestResults(prev => ({ ...prev, [type]: { success: false, message: 'Erreur lors de la vérification' } }));
    } finally {
        setIsTestingOracle(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleSaveAD = async () => {
    setIsSaving(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/ad-settings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(adConfig)
      });
      if (response.ok) {
        setTestResult({ success: true, message: 'Configuration enregistrée avec succès.' });
      } else {
        setTestResult({ success: false, message: 'Erreur lors de l\'enregistrement.' });
      }
    } catch (error) {
      setTestResult({ success: false, message: 'Erreur de connexion.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePingAD = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/auth/ad-ping', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(adConfig)
      });
      const data = await response.json();
      setTestResult({ success: response.ok, message: data.message });
    } catch (error) {
      setTestResult({ success: false, message: 'Erreur de liaison au serveur AD.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleVerifyUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testUser.username) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/auth/ad-test', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...adConfig, username: testUser.username })
      });
      const data = await response.json();
      setTestResult({ success: response.ok, message: data.message, data: data.data });
    } catch (error) {
      setTestResult({ success: false, message: 'Erreur de recherche.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDeleteTile = async (id: number) => {
    if (window.confirm('Supprimer cette tuile ?')) {
      await fetch(`/api/tiles/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      fetchTiles();
    }
  };

  const handleMoveTile = async (index: number, direction: 'up' | 'down') => {
    const newTiles = [...tiles];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newTiles.length) return;
    [newTiles[index], newTiles[targetIndex]] = [newTiles[targetIndex], newTiles[index]];
    setTiles(newTiles);
    for (let i = 0; i < newTiles.length; i++) {
      await fetch(`/api/tiles/${newTiles[i].id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newTiles[i], sort_order: i })
      });
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser)
    });
    if (response.ok) {
      setNewUser({ username: '', password: '', role: 'user', service_code: '', service_complement: '' });
      setIsAddingUser(false);
      fetchUsers();
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await axios.put(`/api/users/${editingUser.id}`, editingUser, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      alert('Erreur lors de la mise à jour');
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (window.confirm('Supprimer cet utilisateur ?')) {
      await axios.delete(`/api/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchUsers();
    }
  };

  const formatActivityDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Jamais';
    try {
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(new Date(dateStr));
    } catch (e) { return dateStr; }
  };

  const filteredUsers = (users || []).filter(u => 
    u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.service_code && u.service_code.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-blue-500" size={48} />
      </div>
    );
  }

  return (
    <div className="admin-page-content animate-in fade-in duration-500">
        {section === 'main' && (
          <div className="space-y-8">
            <div className="welcome-banner">
              <div className="banner-content">
                <h2>Vue d'ensemble</h2>
                <p>Bienvenue dans votre console d'administration. Gérez les paramètres globaux du DSI Hub.</p>
              </div>
              <ShieldCheck size={80} className="banner-icon" />
            </div>

            <div className="stats-cards">
              <div className="stat-card">
                <div className="stat-icon users"><Users size={20} /></div>
                <div className="stat-info">
                  <span className="stat-value">{users.length}</span>
                  <span className="stat-label">Utilisateurs</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon tiles"><LayoutGrid size={20} /></div>
                <div className="stat-info">
                  <span className="stat-value">{tiles.length}</span>
                  <span className="stat-label">Briques actives</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon status"><Activity size={20} /></div>
                <div className="stat-info">
                  <span className="stat-value">OK</span>
                  <span className="stat-label">Statut Système</span>
                </div>
              </div>
            </div>

            <div className="kpi-placeholder bg-white p-12 rounded-[2rem] border-2 border-dashed border-gray-200 text-center">
               <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                  <Activity size={32} />
               </div>
               <h3 className="text-xl font-bold text-gray-400">KPIs et Statistiques</h3>
               <p className="text-gray-400">Cet espace sera prochainement dédié aux indicateurs de performance.</p>
            </div>
          </div>
        )}

        {section === 'users' && (
          <div className="section-container">
            <div className="section-header">
              <div className="search-bar">
                <Search size={18} className="search-icon" />
                <input 
                  type="text" 
                  placeholder="Rechercher un utilisateur..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button className="btn btn-primary" onClick={() => { setIsAddingUser(!isAddingUser); setEditingUser(null); }}>
                <UserPlus size={18} /> Nouvel Utilisateur
              </button>
            </div>

            {(isAddingUser || editingUser) && (
              <div className="edit-form-card animate-in zoom-in-95 duration-200 p-8 bg-gray-50 border-b border-gray-100">
                <div className="form-header flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black">{editingUser ? `Modifier : ${editingUser.username}` : 'Nouvel utilisateur'}</h3>
                  <button onClick={() => { setIsAddingUser(false); setEditingUser(null); }} className="icon-btn"><X size={20} /></button>
                </div>
                <form onSubmit={editingUser ? handleUpdateUser : handleAddUser} className="admin-form">
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Identifiant</label>
                      <input disabled={!!editingUser} value={editingUser ? editingUser.username : newUser.username} onChange={e => editingUser ? setEditingUser({...editingUser, username: e.target.value}) : setNewUser({...newUser, username: e.target.value})} required />
                    </div>
                    <div className="form-group">
                      <label>Rôle</label>
                      <select value={editingUser ? editingUser.role : newUser.role} onChange={e => editingUser ? setEditingUser({...editingUser, role: e.target.value}) : setNewUser({...newUser, role: e.target.value})}>
                        <option value="user">Utilisateur standard</option>
                        <option value="finances">Direction Finances</option>
                        <option value="compta">Comptabilité</option>
                        <option value="magapp">Magasin d'Apps</option>
                        <option value="admin">Administrateur</option>
                      </select>
                    </div>
                    {!editingUser && (
                      <div className="form-group">
                        <label>Mot de passe</label>
                        <input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} required />
                      </div>
                    )}
                    <div className="form-group">
                      <label>Statut Approbation</label>
                      <div className="approval-toggle flex gap-2">
                        <button type="button" onClick={() => editingUser && setEditingUser({...editingUser, is_approved: 1})} className={`toggle-btn approved flex-1 p-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${editingUser?.is_approved === 1 ? 'bg-emerald-600 text-white' : 'bg-white text-gray-400 border border-gray-200'}`}>
                          <CheckCircle2 size={16} /> Approuvé
                        </button>
                        <button type="button" onClick={() => editingUser && setEditingUser({...editingUser, is_approved: 0})} className={`toggle-btn pending flex-1 p-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${editingUser?.is_approved === 0 ? 'bg-amber-500 text-white' : 'bg-white text-gray-400 border border-gray-200'}`}>
                          <ShieldAlert size={16} /> En attente
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Code Service</label>
                      <input placeholder="ex: DSI" value={editingUser ? editingUser.service_code || '' : newUser.service_code} onChange={e => editingUser ? setEditingUser({...editingUser, service_code: e.target.value}) : setNewUser({...newUser, service_code: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>Complément Service</label>
                      <input placeholder="Description longue..." value={editingUser ? editingUser.service_complement || '' : newUser.service_complement} onChange={e => editingUser ? setEditingUser({...editingUser, service_complement: e.target.value}) : setNewUser({...newUser, service_complement: e.target.value})} />
                    </div>
                  </div>
                  <div className="form-footer mt-6 pt-6 border-t border-gray-200 flex justify-end">
                    <button type="submit" className="btn btn-primary"><Save size={18} /> {editingUser ? 'Sauvegarder' : 'Créer'}</button>
                  </div>
                </form>
              </div>
            )}

            <div className="data-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th>Rôle</th>
                    <th>Statut</th>
                    <th>Service</th>
                    <th>Activité</th>
                    <th className="actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => (
                    <tr key={user.id}>
                      <td className="user-cell">
                        <div className="avatar">{user.username?.substring(0, 2).toUpperCase() || '??'}</div>
                        <span className="username font-bold text-gray-900">{user.username}</span>
                      </td>
                      <td>
                        <span className={`role-badge ${user.role}`}>{user.role}</span>
                      </td>
                      <td>
                        {user.is_approved === 1 ? (
                          <span className="status-badge approved"><ShieldCheck size={12} /> OK</span>
                        ) : (
                          <span className="status-badge pending"><ShieldAlert size={12} /> ATTENTE</span>
                        )}
                      </td>
                      <td className="service-cell">
                        <div className="service-code font-bold text-gray-700">{user.service_code || '-'}</div>
                        <div className="service-full text-[10px] text-gray-400">{user.service_complement}</div>
                      </td>
                      <td className="activity-cell text-xs text-gray-500">{formatActivityDate(user.last_activity)}</td>
                      <td className="actions">
                        <button className="icon-btn edit" onClick={() => setEditingUser(user)}><Edit2 size={16} /></button>
                        <button className="icon-btn delete" onClick={() => handleDeleteUser(user.id)} disabled={user.username === 'admin' || user.username === 'adminhub'}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {section === 'ad' && (
          <div className="admin-ad-container">
            <div className="ad-layout-grid">
                <div className="ad-main-column">
                    <div className="admin-card ad-config-card">
                        <div className="card-banner">
                            <div className="banner-info">
                                <h3 className="banner-title">Paramètres Active Directory</h3>
                                <p className="banner-subtitle">Liaison avec l'annuaire LDAP de la Ville d'Ivry-sur-Seine.</p>
                            </div>
                            <div className="banner-controls">
                                <span className={`status-pill ${adConfig.is_enabled ? 'active' : 'inactive'}`}>
                                    {adConfig.is_enabled ? 'Activé' : 'Désactivé'}
                                </span>
                                <label className="switch">
                                    <input type="checkbox" checked={adConfig.is_enabled} onChange={e => setAdConfig({...adConfig, is_enabled: e.target.checked})} />
                                    <span className="slider round"></span>
                                </label>
                            </div>
                        </div>
                        
                        <div className={`card-content ${!adConfig.is_enabled ? 'is-disabled' : ''}`}>
                            <div className="form-responsive-grid">
                                <div className="form-field">
                                    <label className="field-label"><Globe size={14} /> Hôte (Serveur ou IP)</label>
                                    <input 
                                        className="admin-input"
                                        value={adConfig.host} 
                                        onChange={e => setAdConfig({...adConfig, host: e.target.value})} 
                                        placeholder="10.103.130.118" 
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="field-label"><Hash size={14} /> Port</label>
                                    <input 
                                        type="number"
                                        className="admin-input"
                                        value={adConfig.port} 
                                        onChange={e => setAdConfig({...adConfig, port: parseInt(e.target.value) || 389})} 
                                    />
                                </div>
                                <div className="form-field full-width">
                                    <label className="field-label"><ShieldCheck size={14} /> Base DN (Recherche)</label>
                                    <input 
                                        className="admin-input font-mono text-xs"
                                        value={adConfig.base_dn} 
                                        onChange={e => setAdConfig({...adConfig, base_dn: e.target.value})} 
                                        placeholder="DC=ivry,DC=local" 
                                    />
                                </div>
                                <div className="form-field full-width">
                                    <label className="field-label"><Key size={14} /> Bind DN (Compte technique)</label>
                                    <input 
                                        className="admin-input font-mono text-xs"
                                        value={adConfig.bind_dn} 
                                        onChange={e => setAdConfig({...adConfig, bind_dn: e.target.value})} 
                                        placeholder="CN=user,OU=..." 
                                    />
                                </div>
                                <div className="form-field full-width">
                                    <label className="field-label"><Lock size={14} /> Mot de passe Liaison</label>
                                    <input 
                                        type="password"
                                        className="admin-input"
                                        value={adConfig.bind_password} 
                                        onChange={e => setAdConfig({...adConfig, bind_password: e.target.value})} 
                                    />
                                </div>
                            </div>

                            <div className="card-footer-btns">
                                <button className="btn-admin-primary" onClick={handleSaveAD} disabled={isSaving}>
                                    {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                    Enregistrer la configuration
                                </button>
                                <button className="btn-admin-outline" onClick={handlePingAD} disabled={isTesting}>
                                    <Radio size={18} className={isTesting ? "animate-pulse" : ""} />
                                    Tester la liaison
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="ad-side-column">
                    <div className="admin-side-card lookup-card">
                        <h3 className="side-card-title"><Search size={18} /> Outil de Lookup AD</h3>
                        <p className="side-card-desc">Vérifiez si un utilisateur est correctement identifié par l'AD.</p>
                        
                        <form onSubmit={handleVerifyUser} className="lookup-search-form">
                            <input 
                                placeholder="Login windows..." 
                                className="admin-input" 
                                value={testUser.username} 
                                onChange={e => setTestUser({...testUser, username: e.target.value})} 
                            />
                            <button type="submit" className="btn-admin-primary" disabled={isTesting || !testUser.username}>
                                {isTesting ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                            </button>
                        </form>

                        {testResult && (
                            <div className={`lookup-result-box ${testResult.success ? 'is-success' : 'is-error'}`}>
                                <div className="result-header">
                                    {testResult.success ? <Check size={16} /> : <AlertTriangle size={16} />}
                                    <span>{testResult.message}</span>
                                </div>
                                {testResult.data && (
                                    <div className="result-details">
                                        <div className="detail-item"><strong>Nom :</strong> {testResult.data.displayName}</div>
                                        <div className="detail-item"><strong>Email :</strong> {testResult.data.mail || 'N/A'}</div>
                                        <div className="detail-item"><strong>Dept :</strong> {testResult.data.department || 'N/A'}</div>
                                        <div className="detail-item"><strong>DN :</strong> <span className="font-mono text-[9px]">{testResult.data.dn}</span></div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
          </div>
        )}

        {section === 'oracle' && (
          <div className="admin-oracle-section">
            <div className="section-header luxe-header">
              <div className="header-icon-container">
                <Database size={32} strokeWidth={1.5} />
              </div>
              <div className="header-content">
                <h2>Synchronisation Oracle</h2>
                <p>Paramétrez les flux de données entre les bases Oracle RH/FINANCES et la base locale.</p>
              </div>
            </div>

            <div className="oracle-grid">
              {['FINANCES', 'RH'].map(type => {
                const config = oracleConfigs.find(c => c.type === type) || { type, host: '', port: 1521, service_name: '', username: '', password: '', is_enabled: 0 };
                const result = oracleTestResults[type];
                const testing = isTestingOracle[type];

                return (
                  <div key={type} className="oracle-card glass-card">
                    <div className="card-header">
                      <div className="header-info">
                        <div className="type-icon">
                          {type === 'FINANCES' ? <Euro size={20} /> : <Users size={20} />}
                        </div>
                        <h3>Oracle {type}</h3>
                      </div>
                      <div className={`status-badge ${config.is_enabled ? 'active' : 'inactive'}`}>
                        {config.is_enabled ? 'Activé' : 'Désactivé'}
                      </div>
                    </div>

                    <div className="card-body">
                      <div className="form-grid">
                        <div className="input-group">
                          <label><Globe size={14} /> Hôte / IP</label>
                          <input 
                            type="text" 
                            placeholder="ex: 10.1.x.x"
                            value={config.host || ''} 
                            onChange={(e) => {
                              const updated = oracleConfigs.map(c => c.type === type ? { ...c, host: e.target.value } : c);
                              setOracleConfigs(updated);
                            }}
                          />
                        </div>
                        <div className="input-group">
                          <label><Hash size={14} /> Port</label>
                          <input 
                            type="number" 
                            value={config.port || 1521} 
                            onChange={(e) => {
                              const updated = oracleConfigs.map(c => c.type === type ? { ...c, port: parseInt(e.target.value) } : c);
                              setOracleConfigs(updated);
                            }}
                          />
                        </div>
                        <div className="input-group full">
                          <label><Box size={14} /> Service Name / SID</label>
                          <input 
                            type="text" 
                            placeholder="ex: XE, ORCL, PROD..."
                            value={config.service_name || ''} 
                            onChange={(e) => {
                              const updated = oracleConfigs.map(c => c.type === type ? { ...c, service_name: e.target.value } : c);
                              setOracleConfigs(updated);
                            }}
                          />
                        </div>
                        <div className="input-group">
                          <label><UserPlus size={14} /> Utilisateur</label>
                          <input 
                            type="text" 
                            value={config.username || ''} 
                            onChange={(e) => {
                              const updated = oracleConfigs.map(c => c.type === type ? { ...c, username: e.target.value } : c);
                              setOracleConfigs(updated);
                            }}
                          />
                        </div>
                        <div className="input-group">
                          <label><Lock size={14} /> Mot de passe</label>
                          <input 
                            type="password" 
                            value={config.password || ''} 
                            onChange={(e) => {
                              const updated = oracleConfigs.map(c => c.type === type ? { ...c, password: e.target.value } : c);
                              setOracleConfigs(updated);
                            }}
                          />
                        </div>
                      </div>

                      <div className="toggle-container">
                        <label className="luxe-toggle">
                          <input 
                            type="checkbox" 
                            checked={!!config.is_enabled}
                            onChange={(e) => {
                              const updated = oracleConfigs.map(c => c.type === type ? { ...c, is_enabled: e.target.checked ? 1 : 0 } : c);
                              setOracleConfigs(updated);
                            }}
                          />
                          <span className="slider"></span>
                          <span className="label-text">Activer cette liaison</span>
                        </label>
                      </div>

                      <div className="card-actions">
                      <button className="btn-save-luxe" onClick={() => handleSaveOracle(config)} disabled={isSaving}>
                        <Save size={18} /> Enregistrer Paramètres Connexion
                      </button>
                      <div className="btn-group">
                        <button className="btn-test-luxe" onClick={() => handleTestOracle(type)} disabled={testing}>
                          {testing ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
                          Tester Connexion
                        </button>
                        <button className="btn-test-luxe" onClick={() => handleCheckOracleTables(type)} disabled={testing}>
                          <LayoutGrid size={18} /> Lister Tables & Vues Oracle
                        </button>
                      </div>
                      </div>

                      {result && result.details && result.details.length > 0 && (
                      <div className="oracle-tables-selector mt-4">
                        <div className="selector-header flex justify-between items-center mb-4">
                          <h4 className="selector-title mb-0">Sélection des objets (tables/vues) à synchroniser :</h4>
                          <div className="search-mini">
                            <Search size={14} />
                            <input 
                              type="text" 
                              placeholder="Chercher table ou vue..." 
                              value={tableSearch[type] || ''}
                              onChange={(e) => setTableSearch({ ...tableSearch, [type]: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="tables-grid">
                          {result.details
                            .filter((name: string) => !tableSearch[type] || name.toLowerCase().includes(tableSearch[type].toLowerCase()))
                            .map((tableName: string) => {
                              const isSelected = selectedTables[type]?.includes(tableName);
                              return (
                                <div key={tableName} className={`table-row-config ${isSelected ? 'selected' : ''}`}>
                                  <label className="table-checkbox-label">
                                    <input 
                                      type="checkbox" 
                                      checked={isSelected || false}
                                      onChange={(e) => {
                                        const current = selectedTables[type] || [];
                                        const updated = e.target.checked 
                                          ? [...current, tableName]
                                          : current.filter(t => t !== tableName);
                                        setSelectedTables({ ...selectedTables, [type]: updated });
                                      }}
                                    />
                                    <span className="table-name">{tableName}</span>
                                  </label>

                                  {isSelected && (
                                    <div className="table-filter-input animate-in slide-in-from-left-2 duration-200">
                                      <div className="flex items-center gap-2 mb-2">
                                        <input 
                                          type="text"
                                          className="flex-1"
                                          placeholder="Clause WHERE (ex: ANNEE=2024)"
                                          value={tableFilters[type]?.[tableName] || ''}
                                          onChange={(e) => {
                                            const currentFilters = tableFilters[type] || {};
                                            setTableFilters({
                                              ...tableFilters,
                                              [type]: { ...currentFilters, [tableName]: e.target.value }
                                            });
                                          }}
                                        />
                                        <button 
                                          className="btn-champs-config px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors"
                                          onClick={() => handleOpenSubstModal(type, tableName)}
                                        >
                                          <LayoutGrid size={12} /> Champs
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>

                        <div className="selector-footer mt-4 pt-4 border-t border-gray-200 flex flex-col gap-3">
                          <button 
                            className="btn-save-luxe bg-blue-600 hover:bg-blue-700" 
                            onClick={() => handleSaveOracleSyncConfig(type)} 
                            disabled={isSaving}
                          >
                            <Save size={18} /> Enregistrer la configuration
                          </button>

                          <button 
                            className="btn-import-oracle" 
                            disabled={importing[type] || !(selectedTables[type]?.length > 0)}
                            onClick={() => handleImportOracleTables(type)}
                          >
                            {importing[type] ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                            Lancer l'Import (Tables & Vues)
                          </button>

                          <p className="text-[10px] text-gray-400 mt-1 italic text-center">
                            La synchronisation supprimera et recréera les tables locales sélectionnées.
                          </p>
                        </div>
                      </div>
                      )}

                      {/* Default import button (when tables list is NOT visible) but config is saved */}
                      {(!result || !result.details) && selectedTables[type]?.length > 0 && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <p className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-2">
                           <Check size={14} className="text-green-500" /> 
                           {selectedTables[type].length} objet(s) configuré(s) pour synchronisation.
                        </p>
                        <button 
                          className="btn-import-oracle" 
                          disabled={importing[type]}
                          onClick={() => handleImportOracleTables(type)}
                        >
                          {importing[type] ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                          Synchroniser maintenant
                        </button>
                      </div>
                      )}

                      {result && !result.details && (
                      <div className={`result-feedback ${result.success ? 'success' : 'error'}`}>
                        {result.success ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                        <div className="result-content">
                          <span className="result-title">{result.message}</span>
                        </div>
                      </div>
                      )}

                      {importReports[type] && (
                      <div className="import-report mt-4">
                        <h4 className="report-title">Rapport d'import {type} :</h4>
                        <div className="report-list">
                          {importReports[type]?.map((item: any, idx: number) => (
                            <div key={idx} className={`report-item ${item.status.toLowerCase()}`}>
                              <span className="item-table">{item.table}</span>
                              <span className="item-status">{item.status}</span>
                              {item.count !== undefined && <span className="item-count">{item.count} lignes</span>}
                              {item.message && <span className="item-msg">{item.message}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                      )}
                      </div>                  </div>
                );
              })}
            </div>
          </div>
        )}

        {section === 'glpi' && (
          <div className="admin-glpi-container">
            <div className="glpi-layout-grid">
                <div className="glpi-main-column">
                    <div className="admin-card glpi-config-card">
                        <div className="card-banner">
                            <div className="banner-info">
                                <h3 className="banner-title">Configuration GLPI</h3>
                                <p className="banner-subtitle">Liaison temps réel avec l'écosystème de tickets DSI.</p>
                            </div>
                            <div className="banner-controls">
                                <span className={`status-pill ${glpiConfig.is_enabled ? 'active' : 'inactive'}`}>
                                    {glpiConfig.is_enabled ? 'Activé' : 'Désactivé'}
                                </span>
                                <label className="switch">
                                    <input type="checkbox" checked={glpiConfig.is_enabled} onChange={e => setGlpiConfig({...glpiConfig, is_enabled: e.target.checked})} />
                                    <span className="slider round"></span>
                                </label>
                            </div>
                        </div>
                        
                        <div className={`card-content ${!glpiConfig.is_enabled ? 'is-disabled' : ''}`}>
                            <div className="form-responsive-grid">
                                <div className="form-field full-width">
                                    <label className="field-label"><Globe size={14} /> URL de l'API GLPI</label>
                                    <input 
                                        className="admin-input"
                                        value={glpiConfig.url} 
                                        onChange={e => setGlpiConfig({...glpiConfig, url: e.target.value})} 
                                        placeholder="https://glpi-prod.../apirest.php" 
                                    />
                                    <span className="field-tip">Conseil : privilégiez le HTTPS pour une session stable.</span>
                                </div>
                                <div className="form-field">
                                    <label className="field-label"><Key size={14} /> App-Token</label>
                                    <input 
                                        className="admin-input font-mono"
                                        value={glpiConfig.app_token} 
                                        onChange={e => setGlpiConfig({...glpiConfig, app_token: e.target.value})} 
                                        placeholder="Token application" 
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="field-label"><ShieldCheck size={14} /> User-Token</label>
                                    <input 
                                        type="password"
                                        className="admin-input font-mono"
                                        value={glpiConfig.user_token} 
                                        onChange={e => setGlpiConfig({...glpiConfig, user_token: e.target.value})} 
                                        placeholder="••••••••••••" 
                                    />
                                </div>
                            </div>

                            <div className="auth-alt-box">
                                <h4 className="box-title"><Fingerprint size={14} /> Authentification Alternative</h4>
                                <div className="box-fields">
                                    <input 
                                        className="admin-input small"
                                        value={glpiConfig.login} 
                                        onChange={e => setGlpiConfig({...glpiConfig, login: e.target.value})} 
                                        placeholder="Identifiant" 
                                    />
                                    <input 
                                        type="password"
                                        className="admin-input small"
                                        value={glpiConfig.password} 
                                        onChange={e => setGlpiConfig({...glpiConfig, password: e.target.value})} 
                                        placeholder="Mot de passe" 
                                    />
                                </div>
                                <p className="box-note">L'identifiant/password est prioritaire sur le User-Token si renseigné.</p>
                            </div>

                            <div className="card-footer-btns">
                                <button className="btn-admin-primary" onClick={handleSaveGLPI} disabled={isSaving}>
                                    {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                    Enregistrer
                                </button>
                                <button className="btn-admin-outline" onClick={handleTestGLPI} disabled={isTesting}>
                                    <Radio size={18} className={isTesting ? "animate-pulse" : ""} />
                                    Tester la connexion
                                </button>
                            </div>
                            
                            {glpiTestResult && (
                                <div className={`admin-result-alert ${glpiTestResult.success ? 'is-success' : 'is-error'}`}>
                                    {glpiTestResult.success ? <Check size={18} /> : <AlertTriangle size={18} />}
                                    <span>{glpiTestResult.message}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="glpi-side-column">
                    <div className="admin-side-card monitor-card">
                        <h3 className="side-card-title"><BarChart3 size={18} /> Moniteur GLPI</h3>
                        
                        <div className="counter-display">
                            {isLoadingTickets ? (
                                <Loader2 className="animate-spin" size={30} />
                            ) : ticketsCount !== null ? (
                                <div className="counter-body">
                                    <div className="counter-value">{ticketsCount.toLocaleString()}</div>
                                    <div className="counter-label">Tickets en base locale</div>
                                </div>
                            ) : (
                                <div className="counter-empty">Non testé</div>
                            )}
                        </div>

                        <div className="action-grid">
                            <button onClick={handleCountTickets} className="action-tile" disabled={isLoadingTickets || !glpiConfig.is_enabled}>
                                <Activity size={18} />
                                <span>Actualiser</span>
                            </button>
                            
                            <button onClick={handleFetchRecentTickets} className="action-tile" disabled={isLoadingRecent || !glpiConfig.is_enabled}>
                                <HistoryIcon size={18} />
                                <span>Récents</span>
                            </button>

                            <button onClick={handleSyncTickets} className="action-tile warning" disabled={isSyncing || !glpiConfig.is_enabled}>
                                <Box size={18} />
                                <span>Partielle</span>
                            </button>

                            <button onClick={handleSyncAllTickets} className="action-tile danger" disabled={isSyncingAll || !glpiConfig.is_enabled}>
                                <Zap size={18} />
                                <span>Totale</span>
                            </button>

                            <button onClick={handleGetProfile} className="action-tile info full-width" disabled={isLoadingProfile || !glpiConfig.is_enabled}>
                                <UserPlus size={18} />
                                <span>Vérifier mon profil GLPI</span>
                            </button>
                        </div>

                        {syncStatus.active && (
                            <div className="sync-progress-box">
                                <div className="progress-header">
                                    <div className="progress-label">Sync en cours...</div>
                                    <div className="progress-percent">
                                        {syncStatus.total > 0 ? Math.round((syncStatus.processed / syncStatus.total) * 100) : 0}%
                                    </div>
                                </div>
                                <div className="progress-bar-container">
                                    <div className="progress-bar-fill" style={{ width: `${syncStatus.total > 0 ? (syncStatus.processed / syncStatus.total) * 100 : 0}%` }}></div>
                                </div>
                                <div className="progress-stats">
                                    {syncStatus.processed.toLocaleString()} / {syncStatus.total.toLocaleString()}
                                </div>
                            </div>
                        )}

                        {recentTickets.length > 0 && (
                            <div className="history-section">
                                <h4 className="history-title">Historique Récent</h4>
                                <div className="history-list">
                                    {recentTickets.map(ticket => (
                                        <div key={ticket.id} className="history-item">
                                            <div className="item-header">
                                                <span className="item-id">#{ticket.id}</span>
                                                <span className="item-date">{ticket.date}</span>
                                            </div>
                                            <div className="item-title">{ticket.title}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {profileResult && (
                            <div className="profile-debug-box">
                                <h4 className="side-card-title">Données Profil</h4>
                                <div className={`profile-content ${profileResult.success ? 'is-success' : 'is-error'}`}>
                                    {profileResult.success ? (
                                        <pre>{JSON.stringify(profileResult.profiles, null, 2)}</pre>
                                    ) : (
                                          profileResult.message
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
          </div>
        )}

        {/* Modal Substitutions Oracle */}
        {activeSubstModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div>
                  <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                    <Database size={20} className="text-blue-600" />
                    Configuration des champs : {activeSubstModal.table}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Remplacez un code par sa description via une jointure Oracle.</p>
                </div>
                <button onClick={() => setActiveSubstModal(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {loadingCols ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 size={40} className="animate-spin text-blue-600" />
                    <span className="text-sm font-bold text-gray-400">Récupération des colonnes Oracle...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(tableColumns[`${activeSubstModal.type}:${activeSubstModal.table}`] || []).map(col => {
                      const subst = substitutions[activeSubstModal.type]?.[activeSubstModal.table]?.[col];
                      return (
                        <div key={col} className={`p-4 rounded-xl border-2 transition-all ${subst ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-white'}`}>
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-mono font-bold text-sm text-gray-700">{col}</span>
                            {subst ? (
                              <button 
                                onClick={() => updateSubstitution(activeSubstModal.type, activeSubstModal.table, col, null)}
                                className="text-[10px] text-red-500 font-bold hover:underline"
                              >
                                Supprimer le remplacement
                              </button>
                            ) : (
                              <span className="text-[10px] text-gray-400 italic">Aucun remplacement</span>
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-gray-400 uppercase">Table de référence</label>
                              <input 
                                type="text" 
                                className="w-full p-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="ex: SERVICE"
                                value={subst?.secondaryTable || ''}
                                onChange={(e) => updateSubstitution(activeSubstModal.type, activeSubstModal.table, col, { ...subst, secondaryTable: e.target.value.toUpperCase() })}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-gray-400 uppercase">Champ de jointure</label>
                              <input 
                                type="text" 
                                className="w-full p-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="ex: CODE_SERV"
                                value={subst?.joinField || ''}
                                onChange={(e) => updateSubstitution(activeSubstModal.type, activeSubstModal.table, col, { ...subst, joinField: e.target.value.toUpperCase() })}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-gray-400 uppercase">Champ du libellé</label>
                              <input 
                                type="text" 
                                className="w-full p-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="ex: LIB_SERV"
                                value={subst?.labelField || ''}
                                onChange={(e) => updateSubstitution(activeSubstModal.type, activeSubstModal.table, col, { ...subst, labelField: e.target.value.toUpperCase() })}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                <button 
                  onClick={() => setActiveSubstModal(null)}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-200"
                >
                  Terminer la configuration
                </button>
              </div>
            </div>
          </div>
        )}

        {section === 'tiles' && (
          <div className="section-container">
            <div className="section-header">
              <div className="flex flex-col">
                <h3 className="text-xl font-black">Configuration du Hub</h3>
                <p className="text-sm text-gray-500">Gérez les briques de services et leur ordre d'affichage.</p>
              </div>
              <button className="btn btn-primary" onClick={() => { setEditingTile(null); setNewTile({ title: '', icon: 'Box', description: '', status: 'active' }); }}>
                <Plus size={18} /> Ajouter une brique
              </button>
            </div>

            {(editingTile || newTile.title !== '') && (
              <div className="p-4 bg-blue-50 border-b border-blue-100 text-xs text-blue-600 italic">
                Mode édition activé pour : {editingTile?.title || 'Nouvelle brique'}
              </div>
            )}

            <div className="data-table-container">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th style={{ width: '80px' }}>Ordre</th>
                            <th style={{ width: '60px' }}>Icône</th>
                            <th>Service</th>
                            <th>Description</th>
                            <th>Statut</th>
                            <th className="actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tiles.map((tile, index) => (
                            <tr key={tile.id}>
                                <td>
                                    <div className="order-controls flex items-center gap-1">
                                        <button className="icon-btn small" onClick={() => handleMoveTile(index, 'up')} disabled={index === 0}><ChevronUp size={12} /></button>
                                        <button className="icon-btn small" onClick={() => handleMoveTile(index, 'down')} disabled={index === tiles.length - 1}><ChevronDown size={12} /></button>
                                    </div>
                                </td>
                                <td><div className="avatar bg-gray-100"><Box size={18} /></div></td>
                                <td><span className="font-bold text-gray-900">{tile.title}</span></td>
                                <td><span className="text-sm text-gray-500 line-clamp-1">{tile.description}</span></td>
                                <td><span className={`status-tag ${tile.status}`}>{tile.status}</span></td>
                                <td className="actions">
                                    <button className="icon-btn edit" onClick={() => setEditingTile(tile)}><Edit2 size={16} /></button>
                                    <button className="icon-btn delete" onClick={() => handleDeleteTile(tile.id)}><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          </div>
        )}

      <style>{`
        .admin-page-content { color: #1e293b; }
        .welcome-banner { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 40px; border-radius: 24px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .welcome-banner h2 { font-size: 2rem; font-weight: 800; margin: 0 0 10px 0; }
        .banner-icon { opacity: 0.2; }

        .stats-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 20px; border-radius: 16px; display: flex; align-items: center; gap: 15px; border: 1px solid #e2e8f0; }
        .stat-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .stat-icon.users { background: #e0e7ff; color: #4338ca; }
        .stat-icon.tiles { background: #dbeafe; color: #1d4ed8; }
        .stat-icon.status { background: #dcfce7; color: #15803d; }
        .stat-value { font-size: 1.5rem; font-weight: 800; display: block; color: #0f172a; }
        .stat-label { font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; }

        .section-container { background: white; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; }
        .section-header { padding: 25px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; }
        .search-bar { position: relative; width: 300px; }
        .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        .search-bar input { width: 100%; padding: 10px 15px 10px 40px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 0.9rem; outline: none; }

        .admin-table { width: 100%; border-collapse: collapse; text-align: left; }
        .admin-table th { padding: 15px 25px; background: #f8fafc; color: #64748b; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; }
        .admin-table td { padding: 15px 25px; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; }

        .user-cell { display: flex; align-items: center; gap: 12px; }
        .avatar { width: 36px; height: 36px; background: #eff6ff; color: #3b82f6; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.8rem; }
        .role-badge { padding: 4px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; }
        .role-badge.admin { background: #fef2f2; color: #dc2626; }
        .role-badge.magapp { background: #eff6ff; color: #2563eb; }
        .role-badge.user { background: #f8fafc; color: #64748b; }
        .status-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 0.7rem; font-weight: 800; }
        .status-badge.approved { color: #16a34a; }
        .status-badge.pending { color: #ea580c; }

        .status-tag { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 900; text-transform: uppercase; }
        .status-tag.active { background: #dcfce7; color: #166534; }
        .status-tag.maintenance { background: #fef2f2; color: #991b1b; }

        .admin-glpi-container { padding: 20px; color: #333; }
        .glpi-layout-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 30px; }
        @media (max-width: 1024px) { .glpi-layout-grid { grid-template-columns: 1fr; } }

        /* General Card Styles */
        .admin-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); overflow: hidden; }
        .card-banner { background: var(--secondary-color, #003366); color: white; padding: 25px; display: flex; justify-content: space-between; align-items: center; }
        .card-banner .banner-title { font-size: 1.4rem; font-weight: 800; margin: 0; }
        .card-banner .banner-subtitle { font-size: 0.85rem; opacity: 0.8; margin-top: 4px; }
        
        .card-content { padding: 30px; }
        .card-content.is-disabled { pointer-events: none; opacity: 0.5; filter: grayscale(1); }

        .banner-controls { display: flex; align-items: center; gap: 15px; }
        .status-pill { padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; background: rgba(0,0,0,0.2); }
        .status-pill.active { color: #4ade80; border: 1px solid #4ade80; }
        .status-pill.inactive { color: #94a3b8; border: 1px solid #94a3b8; }

        /* Form Styles */
        .form-responsive-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .form-responsive-grid .full-width { grid-column: 1 / -1; }
        .form-field { display: flex; flex-direction: column; gap: 8px; }
        .field-label { font-size: 0.75rem; font-weight: 800; color: #475569; display: flex; align-items: center; gap: 6px; text-transform: uppercase; }
        .admin-input { width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.95rem; background: #f8fafc; transition: border-color 0.2s; }
        .admin-input:focus { border-color: var(--primary-color, #E30613); outline: none; background: white; }
        .admin-input.small { padding: 8px 12px; font-size: 0.85rem; }
        .field-tip { font-size: 0.7rem; color: #64748b; font-style: italic; }

        .auth-alt-box { margin-top: 30px; padding: 20px; background: #f1f5f9; border-radius: 10px; }
        .box-title { font-size: 0.75rem; font-weight: 800; color: #0f172a; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; text-transform: uppercase; }
        .box-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .box-note { font-size: 0.7rem; color: #64748b; margin-top: 10px; font-weight: 600; }

        .card-footer-btns { margin-top: 30px; display: flex; gap: 12px; padding-top: 20px; border-top: 1px solid #f1f5f9; }
        
        /* Side Cards */
        .admin-side-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); margin-bottom: 30px; }
        .side-card-title { font-size: 1rem; font-weight: 800; border-bottom: 2px solid #f1f5f9; padding-bottom: 15px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
        
        .counter-display { background: #f8fafc; padding: 25px; border-radius: 12px; text-align: center; border: 1px solid #e2e8f0; margin-bottom: 20px; }
        .counter-value { font-size: 2.5rem; font-weight: 900; color: var(--secondary-color, #003366); }
        .counter-label { font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 5px; }

        .action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .action-tile { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 10px; padding: 15px; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: all 0.2s; }
        .action-tile span { font-size: 0.75rem; font-weight: 700; }
        .action-tile:hover:not(:disabled) { transform: translateY(-2px); background: white; border-color: var(--primary-color, #E30613); color: var(--primary-color, #E30613); cursor: pointer; }
        .action-tile.warning { color: #f59e0b; }
        .action-tile.danger { color: #ef4444; }
        .action-tile.info { color: #6366f1; }
        .action-tile.full-width { grid-column: 1 / -1; }

        /* Buttons Style */
        .btn-admin-primary { background: var(--primary-color, #E30613); color: white; padding: 12px 24px; border-radius: 8px; font-weight: 700; display: flex; align-items: center; gap: 10px; flex: 1; justify-content: center; }
        .btn-admin-outline { background: white; border: 2px solid #e2e8f0; color: #475569; padding: 12px 24px; border-radius: 8px; font-weight: 700; display: flex; align-items: center; gap: 10px; flex: 1; justify-content: center; }
        .btn-admin-primary:hover:not(:disabled) { opacity: 0.9; transform: scale(1.02); }
        .btn-admin-outline:hover:not(:disabled) { border-color: #94a3b8; }

        /* Progress Bar */
        .sync-progress-box { margin-top: 25px; padding-top: 20px; border-top: 1px solid #f1f5f9; }
        .progress-header { display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 800; margin-bottom: 8px; }
        .progress-bar-container { height: 10px; background: #e2e8f0; border-radius: 10px; overflow: hidden; }
        .progress-bar-fill { height: 100%; background: linear-gradient(to right, #3b82f6, #6366f1); transition: width 0.5s; }
        .progress-stats { font-size: 0.7rem; color: #64748b; text-align: right; margin-top: 5px; font-weight: 700; }

        /* History */
        .history-list { display: flex; flex-direction: column; gap: 12px; }
        .history-item { background: #f8fafc; padding: 12px; border-radius: 8px; border-left: 4px solid var(--secondary-color, #003366); }
        .item-header { display: flex; justify-content: space-between; font-size: 0.7rem; font-weight: 800; margin-bottom: 4px; color: #94a3b8; }
        .item-title { font-size: 0.8rem; font-weight: 700; color: #334155; }

        /* Results / Profile */
        .admin-result-alert { margin-top: 20px; padding: 15px; border-radius: 8px; display: flex; align-items: center; gap: 10px; font-size: 0.85rem; font-weight: 700; }
        .admin-result-alert.is-success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
        .admin-result-alert.is-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
        .profile-content { margin-top: 15px; padding: 15px; background: #0f172a; color: #38bdf8; border-radius: 8px; font-size: 11px; max-height: 200px; overflow: auto; }

        /* Switches & Rest */
        .switch { position: relative; display: inline-block; width: 44px; height: 22px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .4s; }
        .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .4s; }
        input:checked + .slider { background-color: #22c55e; }
        input:checked + .slider:before { transform: translateX(22px); }
        .slider.round { border-radius: 34px; }
        .slider.round:before { border-radius: 50%; }
        /* Styles Oracle */
        .admin-oracle-section { padding: 30px; animation: fadeIn 0.5s ease-out; }
        .oracle-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)); gap: 25px; margin-top: 25px; }
        .oracle-card { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(10px); border-radius: 20px; border: 1px solid rgba(250, 250, 250, 0.5); overflow: hidden; transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .oracle-card:hover { transform: translateY(-5px); box-shadow: 0 15px 35px rgba(0,0,0,0.1); }
        .card-header { padding: 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; background: rgba(255,255,255,0.4); }
        .header-info { display: flex; align-items: center; gap: 15px; }
        .type-icon { width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, #6366f1, #a855f7); color: white; display: flex; align-items: center; justify-content: center; }
        .status-badge { padding: 5px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
        .status-badge.active { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
        .status-badge.inactive { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
        .card-body { padding: 25px; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .form-grid .full { grid-column: span 2; }
        .input-group label { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 600; color: #64748b; margin-bottom: 8px; }
        .input-group input { width: 100%; padding: 12px; border: 2px solid #f1f5f9; border-radius: 12px; font-size: 0.95rem; transition: border-color 0.2s, box-shadow 0.2s; background: white; }
        .input-group input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
        .toggle-container { margin: 20px 0; }
        .luxe-toggle { display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .luxe-toggle input { display: none; }
        .luxe-toggle .slider { width: 44px; height: 24px; background: #e2e8f0; border-radius: 24px; position: relative; transition: 0.3s; }
        .luxe-toggle .slider:before { content: ""; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .luxe-toggle input:checked + .slider { background: #6366f1; }
        .luxe-toggle input:checked + .slider:before { transform: translateX(20px); }
        .card-actions { display: flex; flex-direction: column; gap: 12px; margin-top: 25px; }
        .btn-save-luxe { width: 100%; background: #1e293b; color: white; border: none; padding: 12px; border-radius: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; transition: 0.2s; }
        .btn-save-luxe:hover { background: #0f172a; }
        .btn-group { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .btn-test-luxe { background: #f8fafc; color: #475569; border: 2px solid #f1f5f9; padding: 10px; border-radius: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: 0.2s; }
        .btn-test-luxe:hover { background: #f1f5f9; border-color: #e2e8f0; }
        .result-feedback { margin-top: 20px; padding: 15px; border-radius: 15px; display: flex; gap: 12px; align-items: flex-start; animation: slideInUp 0.3s ease-out; }
        .result-feedback.success { background: #f0fdf4; color: #166534; border: 1px solid #dcfce7; }
        .result-feedback.error { background: #fef2f2; color: #991b1b; border: 1px solid #fee2e2; }
        .result-title { font-weight: 600; font-size: 0.9rem; display: block; }
        .result-details { font-size: 0.8rem; margin-top: 5px; opacity: 0.9; }
        
        /* Oracle Import UI Styles */
        .oracle-tables-selector { background: #f8fafc; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; }
        .selector-title { font-size: 0.9rem; font-weight: 700; color: #1e293b; margin-bottom: 15px; }
        .tables-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; max-height: 250px; overflow-y: auto; padding: 10px; background: white; border-radius: 10px; border: 1px solid #f1f5f9; }
        .table-checkbox-label { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; cursor: pointer; transition: background 0.2s; }
        .table-checkbox-label:hover { background: #f1f5f9; }
        .table-checkbox-label input { width: 18px; height: 18px; cursor: pointer; }
        .table-name { font-size: 0.85rem; font-family: monospace; color: #475569; overflow: hidden; text-overflow: ellipsis; }
        
        /* New Table Config Styles */
        .search-mini { position: relative; display: flex; align-items: center; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px 10px; gap: 8px; }
        .search-mini input { border: none; outline: none; font-size: 0.8rem; width: 120px; }
        .table-row-config { border-bottom: 1px solid #f1f5f9; padding: 10px; transition: 0.2s; border-radius: 8px; }
        .table-row-config.selected { background: #f0f9ff; border-color: #bae6fd; }
        .table-filter-input { margin-top: 8px; padding-left: 28px; }
        .table-filter-input input { width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.75rem; background: white; color: #1e293b; font-family: monospace; }
        .table-filter-input input:focus { border-color: #6366f1; outline: none; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); }
        .tables-grid { display: flex; flex-direction: column; gap: 4px; max-height: 350px; overflow-y: auto; padding: 10px; background: white; border-radius: 10px; border: 1px solid #f1f5f9; }

        .btn-import-oracle { width: 100%; background: #6366f1; color: white; border: none; padding: 12px; border-radius: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; transition: 0.2s; }
        .btn-import-oracle:hover:not(:disabled) { background: #4f46e5; transform: translateY(-2px); }
        .btn-import-oracle:disabled { background: #cbd5e1; cursor: not-allowed; }

        .import-report { background: #1e293b; color: white; padding: 20px; border-radius: 16px; }
        .report-title { font-size: 0.9rem; font-weight: 700; margin-bottom: 15px; color: #94a3b8; }
        .report-list { display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto; }
        .report-item { display: flex; align-items: center; gap: 15px; padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.05); font-size: 0.8rem; }
        .report-item.ok { border-left: 4px solid #22c55e; }
        .report-item.error { border-left: 4px solid #ef4444; }
        .report-item.skip { border-left: 4px solid #f59e0b; }
        .item-table { font-weight: 700; font-family: monospace; min-width: 120px; }
        .item-status { font-weight: 800; font-size: 0.7rem; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; }
        .ok .item-status { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
        .error .item-status { background: rgba(239, 68, 68, 0.2); color: #f87171; }
        .item-count { color: #94a3b8; font-style: italic; }
        .item-msg { color: #f87171; font-size: 0.75rem; }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default Admin;
