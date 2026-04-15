import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { Plus, Edit2, Trash2, Save, X, Globe, LayoutGrid, BarChart2, Bell, Tag, Code, CheckCircle, Settings, Users } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

interface Category {
  id: number;
  name: string;
  icon: string;
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
  mercator_id: number | null;
  mercator_name: string;
  user_count?: number;
}

interface AppUser {
  id: number;
  app_id: number;
  username: string;
  display_name: string;
  last_connection: string;
  source?: 'magapp' | 'admin';
}


interface ClickStats {
  id: number;
  name: string;
  total_clicks: number;
  avg_clicks_per_day: number;
  avg_unique_users_per_day: number;
  has_today_stats: number;
  today_clicks: number;
}

interface Subscription {
  id: number;
  app_id: number;
  email: string;
  app_name: string;
  subscribed_at: string;
}

interface AppVersion {
  id: number;
  version_number: string;
  release_notes_html: string;
  release_date: string;
  is_active: boolean;
}

interface PostgresSettings {
  id: number;
  is_enabled: number;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  updated_at: string;
}

const MagappAdmin: React.FC = () => {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<ClickStats[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [activeTab, setActiveTab] = useState<'apps' | 'categories' | 'versions' | 'subscriptions' | 'stats' | 'postgres' | 'settings'>('apps');
  const [showAllStats, setShowAllStats] = useState(false);
  const [editingApp, setEditingApp] = useState<AppItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [postgresSettings, setPostgresSettings] = useState<PostgresSettings | null>(null);
  const [newCategory, setNewCategory] = useState<Partial<Category>>({ name: '', icon: '', display_order: 0 });
  const [newApp, setNewApp] = useState<Partial<AppItem>>({
    name: '', 
    category_id: 1, 
    description: '', 
    url: '', 
    icon: '/api/img/default.png', 
    display_order: 0,
    is_maintenance: 0,
    maintenance_start: '',
    maintenance_end: '',
    app_type: 'Web',
    present_magapp: 'oui',
    present_onboard: 'oui',
    email_createur: '',
    lien_mercator: ''
  });
  const [magappSettings, setMagappSettings] = useState({ show_tickets: true, show_subscriptions: true, show_health_check: true });
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [mercatorApps, setMercatorApps] = useState<{id: number, name: string, description?: string}[]>([]);
  const [editingVersion, setEditingVersion] = useState<AppVersion | null>(null);
  const [newVersion, setNewVersion] = useState({ version_number: '', release_notes_html: '' });
  const [showAppModal, setShowAppModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [appToDelete, setAppToDelete] = useState<AppItem | null>(null);
  const [filterPublished, setFilterPublished] = useState<'all' | 'oui' | 'non'>('all');

  // User tracking states
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [adSearchQuery, setAdSearchQuery] = useState('');
  const [adResults, setAdResults] = useState<{username: string, displayName: string, email: string}[]>([]);
  const [isSearchingAD, setIsSearchingAD] = useState(false);
  const [modalTab, setModalTab] = useState<'general' | 'users'>('general');


  const token = localStorage.getItem('token');

  const fetchData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [appsRes, catsRes, statsRes, pgSettingsRes, settingsRes, mercatorRes] = await Promise.all([
        fetch('/api/magapp/apps', { headers }),
        fetch('/api/magapp/categories', { headers }),
        fetch('/api/magapp/stats', { headers }),
        fetch('/api/postgres-settings', { headers }),
        fetch('/api/magapp/settings', { headers }),
        fetch('/api/magapp/mercator-apps', { headers })
      ]);

      if (appsRes.ok) setApps(await appsRes.json());
      if (catsRes.ok) setCategories(await catsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (pgSettingsRes.ok) setPostgresSettings(await pgSettingsRes.json());
      if (settingsRes.ok) setMagappSettings(await settingsRes.json());
      if (mercatorRes.ok) setMercatorApps(await mercatorRes.json());
    } catch (e) { console.error(e); }
  };

  const fetchSubscriptions = async () => {
    try {
      const response = await fetch('/api/magapp/subscriptions', { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) setSubscriptions(await response.json());
    } catch (e) { console.error(e); }
  };

  const fetchVersions = async () => {
    try {
      const response = await fetch('/api/magapp/versions');
      if (response.ok) setVersions(await response.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchData(); fetchVersions(); fetchSubscriptions(); }, []);
  useEffect(() => { if (activeTab === 'subscriptions') fetchSubscriptions(); if (activeTab === 'versions') fetchVersions(); }, [activeTab]);

  // Set default category for "New App" when categories change
  useEffect(() => {
    if (categories.length > 0 && !newApp.category_id) {
       setNewApp(prev => ({ ...prev, category_id: categories[0].id }));
    } else if (categories.length > 0 && newApp.category_id === 1 && !categories.find(c => c.id === 1)) {
       // If default 1 is not in list, pick the first one
       setNewApp(prev => ({ ...prev, category_id: categories[0].id }));
    }
  }, [categories]);

  const handleSaveApp = async (appData: Partial<AppItem>, isEditing: boolean) => {
    const url = isEditing ? `/api/magapp/apps/${appData.id}` : '/api/magapp/apps';
    const method = isEditing ? 'PUT' : 'POST';
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(appData)
      });
      if (response.ok) { 
        setEditingApp(null); 
        setShowAppModal(false);
        fetchData();
        if (!isEditing) {
          setNewApp({
            name: '', 
            category_id: categories[0]?.id || 1, 
            description: '', 
            url: '', 
            icon: '/api/img/default.png', 
            display_order: 0,
            is_maintenance: 0,
            maintenance_start: '',
            maintenance_end: '',
            app_type: 'Web',
            present_magapp: 'oui',
            present_onboard: 'oui',
            email_createur: '',
            lien_mercator: '',
            mercator_id: null,
            mercator_name: ''
          });
        }
      } else {
        const errData = await response.json();
        alert(`Erreur: ${errData.message || 'Échec de la sauvegarde'}`);
      }
    } catch (e) { 
      console.error(e);
      alert("Erreur réseau ou serveur"); 
    }
  };

  const handleDeleteApp = (app: AppItem) => {
    setAppToDelete(app);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!appToDelete) return;
    try {
      const response = await fetch(`/api/magapp/apps/${appToDelete.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) {
        setShowDeleteModal(false);
        setAppToDelete(null);
        fetchData();
      } else {
        const err = await response.json();
        alert("Erreur lors de la suppression: " + (err.message || "Cause inconnue"));
      }
    } catch (e) {
      alert("Erreur réseau lors de la suppression");
    }
  };

  const handleIconUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('target_type', 'magapp_icon');
    formData.append('icon', file);
    
    try {
      const response = await fetch('/api/magapp/upload-icon', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (response.ok) {
        const data = await response.json();
        if (editingApp) setEditingApp({ ...editingApp, icon: data.url });
        else setNewApp({ ...newApp, icon: data.url });
      } else {
        alert("Erreur lors de l'upload de l'icône");
      }
    } catch (e) {
      console.error(e);
      alert("Erreur réseau");
    }
  };

  const handleSaveCategory = async (catData: Partial<Category>, isEditing: boolean) => {
    const url = isEditing ? `/api/magapp/categories/${catData.id}` : '/api/magapp/categories';
    const method = isEditing ? 'PUT' : 'POST';
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(catData)
      });
      if (response.ok) { setEditingCategory(null); fetchData(); }
    } catch (e) { alert("Erreur"); }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!window.confirm("Supprimer cette catégorie ?")) return;
    await fetch(`/api/magapp/categories/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    fetchData();
  };

  const handleDeleteSubscription = async (id: number) => {
    if (!window.confirm("Supprimer cet abonnement ?")) return;
    await fetch(`/api/magapp/subscriptions/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    fetchSubscriptions();
  };

  const handleSaveVersion = async (vData: any, isEditing: boolean) => {
    const url = isEditing ? `/api/admin/magapp/versions/${vData.id}` : '/api/admin/magapp/versions';
    const method = isEditing ? 'PUT' : 'POST';
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(vData)
    });
    if (response.ok) { setEditingVersion(null); setNewVersion({ version_number: '', release_notes_html: '' }); fetchVersions(); }
  };

  const handleDeleteVersion = async (id: number) => {
    if (!window.confirm("Supprimer cette version ?")) return;
    await fetch(`/api/admin/magapp/versions/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    fetchVersions();
  };

  const handleActivateVersion = async (id: number) => {
    await fetch(`/api/admin/magapp/versions/${id}/activate`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
    fetchVersions();
  };

  const handleSavePostgresSettings = async () => {
    if (!postgresSettings) return;
    await fetch('/api/postgres-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(postgresSettings)
    });
    alert('Config mise à jour');
  };

  const handleSaveMagappSettings = async () => {
    try {
      const response = await fetch('/api/magapp/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(magappSettings)
      });
      if (response.ok) {
        alert('Paramètres MagApp mis à jour avec succès');
      } else {
        alert('Erreur lors de la mise à jour des paramètres');
      }
    } catch (e) {
      alert("Erreur réseau");
    }
  };

  const fetchAppUsers = async (appId: number) => {
    try {
      const response = await fetch(`/api/magapp/apps/${appId}/users`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) setAppUsers(await response.json());
    } catch (e) { console.error(e); }
  };

  const handleSearchAD = async () => {
    if (adSearchQuery.length < 2) return;
    setIsSearchingAD(true);
    try {
      const response = await fetch('/api/magapp/ad/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ query: adSearchQuery })
      });
      if (response.ok) setAdResults(await response.json());
    } catch (e) { console.error(e); }
    finally { setIsSearchingAD(false); }
  };

  const handleAddUserToApp = async (username: string, displayName: string) => {
    if (!editingApp) return;
    try {
      const response = await fetch(`/api/magapp/apps/${editingApp.id}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ username, display_name: displayName })
      });
      if (response.ok) {
        fetchAppUsers(editingApp.id);
        setAdSearchQuery('');
        setAdResults([]);
        fetchData();
      } else {
        const errorData = await response.json();
        alert(`Erreur: ${errorData.message || 'Impossible d\'ajouter l\'utilisateur'}`);
      }
    } catch (e) {
      console.error('Add user error:', e);
      alert(`Erreur: ${(e as Error).message}`);
    }
  };

  const handleRemoveUserFromApp = async (username: string) => {
    if (!editingApp || !window.confirm(`Retirer ${username} de la liste ?`)) return;
    try {
      const response = await fetch(`/api/magapp/apps/${editingApp.id}/users/${username}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchAppUsers(editingApp.id);
        fetchData(); // refresh user count
      }
    } catch (e) { console.error(e); }
  };


  const filteredStats = showAllStats ? stats : stats.filter(s => s.today_clicks > 0);
  const filteredApps = apps.filter(app => filterPublished === 'all' || app.present_magapp === filterPublished);

  return (
    <div className="magapp-admin-container animate-fade-in">
      <Header />
      
      <div className="magapp-admin-content container">
        <header className="admin-header-v2">
          <div className="header-info">
            <h1>Administration MagApp</h1>
            <p>Pilotage du catalogue et des statistiques d'usage.</p>
          </div>
          
          <nav className="admin-tabs-v2">
            {[
              { id: 'apps', icon: <LayoutGrid size={18} />, label: 'Applications' },
              { id: 'categories', icon: <Tag size={18} />, label: 'Catégories' },
              { id: 'versions', icon: <Code size={18} />, label: 'Versions' },
              { id: 'subscriptions', icon: <Bell size={18} />, label: 'Abonnés' },
              { id: 'stats', icon: <BarChart2 size={18} />, label: 'Stats' },
              { id: 'postgres', icon: <Globe size={18} />, label: 'DB' },
              { id: 'settings', icon: <Settings size={18} />, label: 'Paramètres' }
            ].map(tab => (
              <button 
                key={tab.id}
                className={`tab-btn-v2 ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id as any)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </header>

        <main className="admin-workspace-v2">
          {activeTab === 'apps' && (
            <div className="workspace-grid" style={{ gridTemplateColumns: '1fr' }}>
              <section className="workspace-section">
                <div className="section-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <h2>Annuaire ({filteredApps.length})</h2>
                    <div className="header-icon-v2"><LayoutGrid size={20} /></div>
                    
                    <div className="filter-group-v2" style={{ marginLeft: '10px' }}>
                      <button 
                        className={`filter-btn-v2 ${filterPublished === 'all' ? 'active' : ''}`}
                        onClick={() => setFilterPublished('all')}
                      >
                        Toutes
                      </button>
                      <button 
                        className={`filter-btn-v2 ${filterPublished === 'oui' ? 'active' : ''}`}
                        onClick={() => setFilterPublished('oui')}
                      >
                        Publiées
                      </button>
                      <button 
                        className={`filter-btn-v2 ${filterPublished === 'non' ? 'active' : ''}`}
                        onClick={() => setFilterPublished('non')}
                      >
                        Masquées
                      </button>
                    </div>
                  </div>
                  <button className="primary-btn-v2" onClick={() => { setEditingApp(null); setShowAppModal(true); }}>
                    <Plus size={18} /> Nouvelle Application
                  </button>
                </div>
                
                <div className="apps-grid-v2">
                  {filteredApps.map(app => (
                    <div key={app.id} className={`app-card-v2 ${app.present_magapp === 'oui' ? 'is-published' : ''}`}>
                      <div className="app-card-inner-v2">
                        <img src={app.icon} alt="" onError={(e) => { (e.target as HTMLImageElement).src = '/api/img/default.png'; }} />
                        <div className="app-details-v2">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h4>{app.name}</h4>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {app.mercator_id && <div className="status-dot mercator" title={`Lié à Mercator : ${app.mercator_name}`}></div>}
                              {(!app.mercator_id && app.lien_mercator) && <div className="status-dot mercator" title="Lien Mercator renseigné (ancienne version)"></div>}
                              {app.email_createur && <div className="status-dot creator" title="Email créateur renseigné"></div>}
                              {app.present_magapp === 'oui' && <span className="published-badge">Publiée</span>}
                              {app.user_count !== undefined && app.user_count > 0 && (
                                <span
                                  className="user-count-badge"
                                  title={`${app.user_count} utilisateur(s)`}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    backgroundColor: '#ef4444',
                                    color: 'white',
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    minWidth: '24px'
                                  }}
                                >
                                  {app.user_count}
                                </span>
                              )}
                            </div>
                          </div>
                          <p>{app.url}</p>
                        </div>
                        <div className="app-actions-v2">
                          <button onClick={() => { setEditingApp(app); setShowAppModal(true); }}><Edit2 size={16} /></button>
                          <button onClick={() => handleDeleteApp(app)} className="delete"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>


              {showAppModal && (
                <div className="modal-overlay-v2">
                  <div className="modal-content-v2 animate-fade-in">
                    <div className="modal-header-v2">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="header-icon-v2">{editingApp ? <Edit2 size={18} /> : <Plus size={18} />}</div>
                        <h3>{editingApp ? 'Modifier Application' : 'Nouvelle Application'}</h3>
                      </div>
                      <button className="close-modal-btn" onClick={() => setShowAppModal(false)}><X size={20} /></button>
                    </div>

                    <div className="modal-tabs">
                      <button className={modalTab === 'general' ? 'active' : ''} onClick={() => setModalTab('general')}>Général</button>
                      {editingApp && (
                        <button className={modalTab === 'users' ? 'active' : ''} onClick={() => { setModalTab('users'); fetchAppUsers(editingApp.id); }}>
                          Utilisateurs {editingApp.user_count ? `(${editingApp.user_count})` : ''}
                        </button>
                      )}
                    </div>
                    
                    <div className="modal-body-v2">
                      {modalTab === 'general' ? (
                        <div className="form-grid-v2">
                          <div className="form-group-v2">
                            <label>Nom</label>
                            <input type="text" value={editingApp ? editingApp.name : newApp.name} onChange={e => editingApp ? setEditingApp({...editingApp, name: e.target.value}) : setNewApp({...newApp, name: e.target.value})} />
                          </div>
                          <div className="form-group-v2">
                            <label>URL</label>
                            <input type="text" value={editingApp ? editingApp.url : newApp.url} onChange={e => editingApp ? setEditingApp({...editingApp, url: e.target.value}) : setNewApp({...newApp, url: e.target.value})} />
                          </div>
                          <div className="form-group-v2">
                            <label>Catégorie</label>
                            <select value={editingApp ? editingApp.category_id : newApp.category_id} onChange={e => editingApp ? setEditingApp({...editingApp, category_id: parseInt(e.target.value)}) : setNewApp({...newApp, category_id: parseInt(e.target.value)})}>
                              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                          <div className="form-group-v2">
                            <label>Type</label>
                            <select value={editingApp ? editingApp.app_type : newApp.app_type} onChange={e => editingApp ? setEditingApp({...editingApp, app_type: e.target.value}) : setNewApp({...newApp, app_type: e.target.value})}>
                              <option value="Web">Web</option>
                              <option value="SAAS">SAAS</option>
                              <option value="Client/serveur">Client/serveur</option>
                              <option value="Monoposte">Monoposte</option>
                            </select>
                          </div>
                          <div className="form-group-v2 full-width">
                            <label>Description</label>
                            <textarea rows={2} value={editingApp ? editingApp.description : newApp.description} onChange={e => editingApp ? setEditingApp({...editingApp, description: e.target.value}) : setNewApp({...newApp, description: e.target.value})}></textarea>
                          </div>
                          <div className="form-group-v2">
                            <label>MagApp</label>
                            <select value={editingApp ? editingApp.present_magapp : newApp.present_magapp} onChange={e => editingApp ? setEditingApp({...editingApp, present_magapp: e.target.value}) : setNewApp({...newApp, present_magapp: e.target.value})}>
                              <option value="oui">Oui</option>
                              <option value="non">Non</option>
                            </select>
                          </div>
                          <div className="form-group-v2">
                            <label>OnBoard</label>
                            <select value={editingApp ? editingApp.present_onboard : newApp.present_onboard} onChange={e => editingApp ? setEditingApp({...editingApp, present_onboard: e.target.value}) : setNewApp({...newApp, present_onboard: e.target.value})}>
                              <option value="oui">Oui</option>
                              <option value="non">Non</option>
                            </select>
                          </div>
                          <div className="form-group-v2">
                            <label>Email Créateur</label>
                            <input type="text" value={editingApp ? editingApp.email_createur : newApp.email_createur} onChange={e => editingApp ? setEditingApp({...editingApp, email_createur: e.target.value}) : setNewApp({...newApp, email_createur: e.target.value})} />
                          </div>

                          <div className="form-group-v2">
                            <label>Application Mercator</label>
                            <select 
                              value={editingApp ? (editingApp.mercator_id || '') : (newApp.mercator_id || '')} 
                              onChange={e => {
                                  const val = e.target.value ? parseInt(e.target.value) : null;
                                  const name = e.target.value ? (mercatorApps.find(m => m.id === val)?.name || '') : '';
                                  if (editingApp) {
                                      setEditingApp({...editingApp, mercator_id: val, mercator_name: name});
                                  } else {
                                      setNewApp({...newApp, mercator_id: val, mercator_name: name});
                                  }
                              }}>
                              <option value="">Aucune</option>
                              {mercatorApps.map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                            {(() => {
                                const currId = editingApp ? editingApp.mercator_id : newApp.mercator_id;
                                const currMercator = currId ? mercatorApps.find(m => m.id === currId) : null;
                                if (currMercator && currMercator.description) {
                                    return (
                                        <div style={{ marginTop: '10px', padding: '10px 15px', background: '#eef2ff', borderRadius: '8px', color: '#4338ca', fontSize: '0.85rem', lineHeight: '1.4' }}>
                                            <strong>Description Mercator :</strong><br/>
                                            <div dangerouslySetInnerHTML={{ __html: currMercator.description }} />
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                          </div>
                          
                          <div className="form-group-v2 full-width" style={{ marginTop: '10px', padding: '15px', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #e2e8f0' }}>
                            <label style={{ color: '#4f46e5' }}>Logo de l'application</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '10px' }}>
                              <img 
                                src={editingApp ? editingApp.icon : newApp.icon} 
                                alt="Preview" 
                                style={{ width: '60px', height: '60px', borderRadius: '12px', objectFit: 'contain', background: 'white', padding: '5px', border: '1px solid #e2e8f0' }} 
                                onError={(e) => { (e.target as HTMLImageElement).src = '/api/img/default.png'; }}
                              />
                              <div style={{ flex: 1 }}>
                                <input 
                                  type="file" 
                                  id="icon-upload" 
                                  style={{ display: 'none' }} 
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleIconUpload(file);
                                  }}
                                />
                                <label htmlFor="icon-upload" className="filter-btn-v2" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                  <Globe size={16} /> Choisir un fichier
                                </label>
                                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '5px' }}>Recommandé: PNG/WebP avec fond transparent.</p>
                              </div>
                            </div>
                          </div>

                          <div className="form-group-v2">
                            <label>Maintenance</label>
                            <select value={editingApp ? editingApp.is_maintenance : newApp.is_maintenance} onChange={e => editingApp ? setEditingApp({...editingApp, is_maintenance: parseInt(e.target.value)}) : setNewApp({...newApp, is_maintenance: parseInt(e.target.value)})}>
                              <option value={0}>Non</option>
                              <option value={1}>En cours</option>
                            </select>
                          </div>
                          <div className="form-group-v2">
                            <label>Début Maintenance</label>
                            <input type="datetime-local" value={editingApp ? (editingApp.maintenance_start ? new Date(editingApp.maintenance_start).toISOString().slice(0, 16) : '') : (newApp.maintenance_start || '')} onChange={e => editingApp ? setEditingApp({...editingApp, maintenance_start: e.target.value}) : setNewApp({...newApp, maintenance_start: e.target.value})} />
                          </div>
                          <div className="form-group-v2">
                            <label>Fin Maintenance (estimée)</label>
                            <input type="datetime-local" value={editingApp ? (editingApp.maintenance_end ? new Date(editingApp.maintenance_end).toISOString().slice(0, 16) : '') : (newApp.maintenance_end || '')} onChange={e => editingApp ? setEditingApp({...editingApp, maintenance_end: e.target.value}) : setNewApp({...newApp, maintenance_end: e.target.value})} />
                          </div>
                          <div className="form-group-v2">
                            <label>Ordre</label>
                            <input type="number" value={editingApp ? editingApp.display_order : newApp.display_order} onChange={e => editingApp ? setEditingApp({...editingApp, display_order: parseInt(e.target.value)}) : setNewApp({...newApp, display_order: parseInt(e.target.value)})} />
                          </div>
                        </div>
                      ) : (
                        <div className="users-management">
                            <div className="ad-search-box" style={{ padding: '0 5px' }}>
                              <label style={{ fontWeight: 700, color: '#64748b', fontSize: '0.85rem' }}>Ajouter un agent (recherche AD)</label>
                              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <input 
                                  type="text" 
                                  placeholder="Nom, login..." 
                                  value={adSearchQuery} 
                                  onChange={e => setAdSearchQuery(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && handleSearchAD()}
                                  style={{ flex: 1, padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '0.9rem' }}
                                />
                                <button 
                                  className="primary-btn-v2" 
                                  style={{ padding: '0 20px', fontSize: '0.9rem', boxShadow: 'none' }}
                                  onClick={handleSearchAD} 
                                  disabled={isSearchingAD}
                                >
                                  {isSearchingAD ? '...' : 'Rechercher'}
                                </button>
                              </div>
                              
                              {adResults.length > 0 && (
                                <div className="ad-results" style={{ marginTop: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden' }}>
                                  {adResults.map(res => (
                                    <div key={res.username} className="ad-result-item" style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{res.displayName}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{res.username}</div>
                                      </div>
                                      <button 
                                        onClick={() => handleAddUserToApp(res.username, res.displayName)}
                                        style={{ padding: '6px 12px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                      >
                                        Ajouter
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            
                            <div className="app-users-list" style={{ marginTop: '32px', padding: '0 5px' }}>
                              <label style={{ fontWeight: 700, color: '#64748b', fontSize: '0.85rem' }}>Agents ayant accès / connectés ({appUsers.length})</label>
                              {appUsers.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                                  <div style={{ marginBottom: '10px' }}><Users size={32} opacity={0.3} /></div>
                                  <p style={{ fontStyle: 'italic', fontSize: '0.9rem' }}>Aucun utilisateur enregistré pour le moment.</p>
                                </div>
                              ) : (
                                <div className="users-table-scroll">
                                  <table className="modern-table-v2" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                                    <thead>
                                      <tr>
                                        <th style={{ textAlign: 'left', padding: '0 12px', fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Agent</th>
                                        <th style={{ textAlign: 'left', padding: '0 12px', fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Dernière connexion</th>
                                        <th style={{ textAlign: 'left', padding: '0 12px', fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Source</th>
                                        <th style={{ textAlign: 'right', padding: '0 12px', fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Action</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {appUsers.map(u => (
                                        <tr key={u.id}>
                                          <td style={{ background: '#f8fafc', padding: '12px', borderTopLeftRadius: '12px', borderBottomLeftRadius: '12px' }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{u.display_name}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{u.username}</div>
                                          </td>
                                          <td style={{ background: '#f8fafc', padding: '12px' }}>
                                            <div style={{ fontSize: '0.85rem' }}>
                                              {u.last_connection ? new Date(u.last_connection).toLocaleString('fr-FR', {
                                                day: '2-digit', month: '2-digit', year: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                              }) : 'Jamais'}
                                            </div>
                                          </td>
                                          <td style={{ background: '#f8fafc', padding: '12px' }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                                              <span style={{
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                background: u.source === 'admin' ? '#dbeafe' : '#e0f2fe',
                                                color: u.source === 'admin' ? '#0c4a6e' : '#0c4a6e',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                display: 'inline-block'
                                              }}>
                                                {u.source === 'admin' ? 'Admin' : 'Magapp'}
                                              </span>
                                            </div>
                                          </td>
                                          <td style={{ background: '#f8fafc', padding: '12px', borderTopRightRadius: '12px', borderBottomRightRadius: '12px', textAlign: 'right' }}>
                                            <button
                                              onClick={() => handleRemoveUserFromApp(u.username)}
                                              style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '5px' }}
                                              title="Retirer l'accès"
                                            >
                                              <Trash2 size={16} />
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                        </div>
                      )}
                    </div>

                    <div className="modal-footer-v2">
                      <button className="primary-btn-v2" style={{ width: '100%' }} onClick={() => {
                        handleSaveApp(editingApp || newApp, !!editingApp);
                      }}>
                        <Save size={18} /> {editingApp ? 'Enregistrer les modifications' : 'Créer l\'application'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showDeleteModal && appToDelete && (
                <div className="modal-overlay-v2">
                  <div className="modal-content-v2 animate-fade-in" style={{ maxWidth: '450px' }}>
                    <div className="modal-header-v2">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="header-icon-v2" style={{ background: '#fff1f2', color: '#e11d48' }}><Trash2 size={18} /></div>
                        <h3>Supprimer l'application</h3>
                      </div>
                      <button className="close-modal-btn" onClick={() => setShowDeleteModal(false)}><X size={20} /></button>
                    </div>
                    
                    <div className="modal-body-v2">
                      <p style={{ margin: 0, color: '#475569', lineHeight: '1.6' }}>
                        Êtes-vous sûr de vouloir supprimer l'application <strong>{appToDelete.name}</strong> ?<br/>
                        <span style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: '700', display: 'block', marginTop: '10px' }}>
                          Cette action est irréversible et supprimera également tous les favoris et abonnés associés à cette application.
                        </span>
                      </p>
                    </div>

                    <div className="modal-footer-v2" style={{ display: 'flex', gap: '12px' }}>
                      <button className="filter-btn-v2" style={{ flex: 1 }} onClick={() => setShowDeleteModal(false)}>Annuler</button>
                      <button className="primary-btn-v2" style={{ flex: 1, background: '#e11d48' }} onClick={confirmDelete}>
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'categories' && (
            <div className="workspace-grid">
              <section className="workspace-section">
                <div className="section-header">
                  <h2>{editingCategory ? 'Modifier Catégorie' : 'Nouvelle Catégorie'}</h2>
                  <div className="header-icon-v2">{editingCategory ? <Edit2 size={20} /> : <Tag size={20} />}</div>
                </div>
                <div className="form-group-v2">
                  <label>Nom</label>
                  <input type="text" value={editingCategory ? editingCategory.name : newCategory.name} onChange={e => editingCategory ? setEditingCategory({...editingCategory, name: e.target.value}) : setNewCategory({...newCategory, name: e.target.value})} />
                </div>
                <div className="form-group-v2" style={{ marginTop: '10px' }}>
                  <label>Icône (Badge/Emoji)</label>
                  <input type="text" value={editingCategory ? editingCategory.icon : newCategory.icon} onChange={e => editingCategory ? setEditingCategory({...editingCategory, icon: e.target.value}) : setNewCategory({...newCategory, icon: e.target.value})} />
                </div>
                <div className="form-group-v2" style={{ marginTop: '10px' }}>
                  <label>Ordre</label>
                  <input type="number" value={editingCategory ? editingCategory.display_order : newCategory.display_order} onChange={e => editingCategory ? setEditingCategory({...editingCategory, display_order: parseInt(e.target.value)}) : setNewCategory({...newCategory, display_order: parseInt(e.target.value)})} />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button className="primary-btn-v2" style={{ flex: 1 }} onClick={() => editingCategory ? handleSaveCategory(editingCategory, true) : handleSaveCategory(newCategory, false)}>
                    <Save size={18} /> {editingCategory ? 'Sauvegarder' : 'Ajouter'}
                  </button>
                  {editingCategory && (
                    <button className="filter-btn-v2" onClick={() => setEditingCategory(null)}>
                      Annuler
                    </button>
                  )}
                </div>
              </section>

              <section className="workspace-section">
                <div className="section-header">
                  <h2>Existantes</h2>
                </div>
                <div className="categories-list-v2">
                  {categories.map(cat => (
                    <div key={cat.id} className="category-item-v2">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{cat.icon}</span>
                        <span>{cat.name}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setEditingCategory(cat)} style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDeleteCategory(cat.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'versions' && (
            <div className="workspace-grid">
              <section className="workspace-section">
                <div className="section-header">
                  <h2>{editingVersion ? 'Modifier Version' : 'Nouvelle Version'}</h2>
                  <div className="header-icon-v2"><Code size={20} /></div>
                </div>
                <div className="form-group-v2">
                  <label>Numéro de version</label>
                  <input type="text" value={editingVersion ? editingVersion.version_number : newVersion.version_number} onChange={e => editingVersion ? setEditingVersion({...editingVersion, version_number: e.target.value}) : setNewVersion({...newVersion, version_number: e.target.value})} />
                </div>
                <div className="form-group-v2" style={{ marginTop: '10px' }}>
                  <label>Notes de mise à jour</label>
                  <ReactQuill 
                    theme="snow" 
                    value={editingVersion ? editingVersion.release_notes_html : newVersion.release_notes_html} 
                    onChange={val => editingVersion ? setEditingVersion({...editingVersion, release_notes_html: val}) : setNewVersion({...newVersion, release_notes_html: val})} 
                    style={{ height: '200px', marginBottom: '50px' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="primary-btn-v2" style={{ flex: 1 }} onClick={() => editingVersion ? handleSaveVersion(editingVersion, true) : handleSaveVersion(newVersion, false)}>
                    {editingVersion ? 'Mettre à jour' : 'Publier'}
                  </button>
                  {editingVersion && <button className="filter-btn-v2" onClick={() => setEditingVersion(null)}>Annuler</button>}
                </div>
              </section>

              <section className="workspace-section">
                <div className="section-header">
                  <h2>Historique</h2>
                </div>
                {versions.map(v => (
                  <div key={v.id} className="app-card-v2" style={{ marginBottom: '10px' }}>
                    <div className="app-card-inner-v2" style={{ alignItems: 'flex-start' }}>
                      <div className="app-details-v2" style={{ flex: 1 }}>
                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {v.version_number}
                          {v.is_active && <CheckCircle size={14} color="#10b981" />}
                        </h4>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(v.release_date).toLocaleDateString()}</span>
                        <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#64748b', maxHeight: '40px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }} dangerouslySetInnerHTML={{ __html: v.release_notes_html }}></div>
                      </div>
                      <div className="app-actions-v2">
                        {!v.is_active && <button onClick={() => handleActivateVersion(v.id)} style={{ color: '#10b981' }} title="Activer"><CheckCircle size={16} /></button>}
                        <button onClick={() => setEditingVersion(v)} title="Modifier"><Edit2 size={16} /></button>
                        <button onClick={() => handleDeleteVersion(v.id)} className="delete" title="Supprimer"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            </div>
          )}

          {activeTab === 'subscriptions' && (
            <section className="workspace-section">
              <div className="section-header">
                <h2>Abonnements Actifs</h2>
                <div className="header-icon-v2"><Bell size={20} /></div>
              </div>
              <table className="modern-table-v2">
                <thead>
                  <tr><th>App</th><th>Utilisateur</th><th>Date</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {subscriptions.map(s => (
                    <tr key={s.id}>
                      <td><strong>{s.app_name}</strong></td>
                      <td>{s.email || 'Utilisateur'}</td>
                      <td>{new Date(s.subscribed_at).toLocaleDateString()}</td>
                      <td><button onClick={() => handleDeleteSubscription(s.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {activeTab === 'stats' && (
            <section className="workspace-section">
              <div className="section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h2>Usage</h2>
                  <div className="header-icon-v2"><BarChart2 size={20} /></div>
                </div>
                <button className={`filter-btn-v2 ${showAllStats ? 'active' : ''}`} onClick={() => setShowAllStats(!showAllStats)}>
                  {showAllStats ? "Toutes" : "Aujourd'hui"}
                </button>
              </div>
              <div className="stats-visual-grid-v2">
                {filteredStats.map(s => (
                  <div key={s.id} className="stat-card-v2">
                    <div className="stat-info-v2">
                      <span className="stat-name-v2">{s.name}</span>
                      <span className="stat-value-v2">{showAllStats ? s.total_clicks : s.today_clicks} 🖱️</span>
                    </div>
                    <div className="stat-bar-bg-v2">
                      <div className="stat-bar-fill-v2" style={{ width: `${Math.min(100, ((showAllStats ? s.total_clicks : s.today_clicks) / (Math.max(...stats.map(x => showAllStats ? x.total_clicks : x.today_clicks)) || 1)) * 100)}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'postgres' && postgresSettings && (
            <section className="workspace-section" style={{ maxWidth: '600px' }}>
              <div className="section-header">
                <h2>PostgreSQL Configuration</h2>
                <div className="header-icon-v2"><Globe size={20} /></div>
              </div>
              <div className="form-grid-v2">
                <div className="form-group-v2 full-width">
                  <label>Host</label>
                  <input type="text" value={postgresSettings.host} onChange={e => setPostgresSettings({...postgresSettings, host: e.target.value})} />
                </div>
                <div className="form-group-v2">
                  <label>Database</label>
                  <input type="text" value={postgresSettings.database} onChange={e => setPostgresSettings({...postgresSettings, database: e.target.value})} />
                </div>
                <div className="form-group-v2">
                  <label>User</label>
                  <input type="text" value={postgresSettings.username} onChange={e => setPostgresSettings({...postgresSettings, username: e.target.value})} />
                </div>
                <div className="form-group-v2 full-width">
                  <label>Password</label>
                  <input type="password" value={postgresSettings.password || ''} onChange={e => setPostgresSettings({...postgresSettings, password: e.target.value})} placeholder="••••••••" />
                </div>
                <button className="primary-btn-v2" style={{ marginTop: '10px' }} onClick={handleSavePostgresSettings}><Save size={18} /> Sauvegarder</button>
              </div>
            </section>
          )}

          {activeTab === 'settings' && (
            <section className="workspace-section" style={{ maxWidth: '600px' }}>
              <div className="section-header">
                <h2>Paramètres MagApp</h2>
                <div className="header-icon-v2"><Settings size={20} /></div>
              </div>
              <div className="form-grid-v2">
                <div className="form-group-v2 full-width" style={{ padding: '15px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>Afficher les tickets système (GLPI)</span>
                    <input 
                      type="checkbox" 
                      checked={magappSettings.show_tickets} 
                      onChange={e => setMagappSettings({...magappSettings, show_tickets: e.target.checked})} 
                      style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#4f46e5' }}
                    />
                  </label>
                  <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Active l'affichage du panneau latéral des tickets incidents pour les utilisateurs.</p>
                </div>
                <div className="form-group-v2 full-width" style={{ padding: '15px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>Afficher les abonnements Push</span>
                    <input 
                      type="checkbox" 
                      checked={magappSettings.show_subscriptions} 
                      onChange={e => setMagappSettings({...magappSettings, show_subscriptions: e.target.checked})} 
                      style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#4f46e5' }}
                    />
                  </label>
                  <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Permet aux utilisateurs de s'abonner aux notifications d'état d'un service (abonnement Push).</p>
                </div>
                <div className="form-group-v2 full-width" style={{ padding: '15px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>Afficher le Health Check global</span>
                    <input 
                      type="checkbox" 
                      checked={magappSettings.show_health_check} 
                      onChange={e => setMagappSettings({...magappSettings, show_health_check: e.target.checked})} 
                      style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#4f46e5' }}
                    />
                  </label>
                  <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Affiche le badge d'état global du système (Health Check) en haut de la page.</p>
                </div>
                <button className="primary-btn-v2 full-width" style={{ marginTop: '10px' }} onClick={handleSaveMagappSettings}>
                  <Save size={18} /> Mettre à jour les paramètres
                </button>
              </div>
            </section>
          )}
        </main>
      </div>

      <style>{`
        .magapp-admin-container {
          min-height: 100vh;
          background: #f8fafc;
          padding-bottom: 50px;
          color: #1e293b;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }

        .magapp-admin-content {
          margin-top: 30px;
          max-width: 1400px !important;
          padding: 0 40px;
        }

        .admin-header-v2 {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
          padding: 32px 40px;
          background: rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(12px);
          border-radius: 30px;
          border: 1px solid rgba(255, 255, 255, 0.8);
          box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.05);
          flex-wrap: wrap;
          gap: 20px;
        }

        .header-info h1 {
          font-size: 2.2rem;
          font-weight: 1000;
          margin: 0;
          color: #0f172a;
          letter-spacing: -0.04em;
        }

        .header-info p {
          color: #64748b;
          margin: 6px 0 0 0;
          font-size: 1.05rem;
          font-weight: 500;
        }

        .admin-tabs-v2 {
          display: flex;
          background: rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(8px);
          padding: 6px;
          border-radius: 18px;
          gap: 6px;
          border: 1px solid white;
        }

        .tab-btn-v2 {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          border: none;
          background: none;
          border-radius: 14px;
          color: #64748b;
          font-weight: 800;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .tab-btn-v2:hover {
          color: #4f46e5;
          background: rgba(255, 255, 255, 0.8);
          transform: translateY(-1px);
        }

        .tab-btn-v2.active {
          background: white;
          color: #4f46e5;
          box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.1);
          transform: scale(1.05);
        }

        .admin-workspace-v2 {
          animation: fadeSlideUp 0.5s ease-out;
        }

        .workspace-grid {
          display: grid;
          grid-template-columns: 400px 1fr;
          gap: 30px;
        }

        .workspace-section {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(16px);
          border-radius: 28px;
          border: 1px solid rgba(255, 255, 255, 0.8);
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.02);
          padding: 32px;
          display: flex;
          flex-direction: column;
          margin-bottom: 30px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .section-header h2 {
          font-size: 1.2rem;
          font-weight: 800;
          margin: 0;
          color: #1e293b;
        }

        .header-icon-v2 {
          width: 40px;
          height: 40px;
          background: #eef2ff;
          color: #4f46e5;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
        }

        .form-grid-v2 {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
        }

        .form-group-v2 {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group-v2.full-width { grid-column: span 2; }

        .form-group-v2 label {
          font-size: 0.9rem;
          font-weight: 600;
          color: #334155;
          margin-left: 0;
        }

        .form-group-v2 input,
        .form-group-v2 textarea,
        .form-group-v2 select {
          padding: 12px 16px;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          background: #fafbfc;
          font-size: 0.95rem;
          transition: all 0.2s;
        }

        .form-group-v2 input::placeholder,
        .form-group-v2 textarea::placeholder {
          color: #94a3b8;
        }

        .form-group-v2 input:focus,
        .form-group-v2 textarea:focus,
        .form-group-v2 select:focus {
          border-color: #4f46e5;
          background: white;
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1);
          outline: none;
        }

        .apps-grid-v2 {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 24px;
        }

        .app-card-v2 {
          background: white;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .app-card-v2:hover {
          transform: translateY(-4px);
          border-color: #4f46e5;
          box-shadow: 0 12px 20px -8px rgba(79, 70, 229, 0.2);
        }

        .app-card-v2.is-published {
          background: #f0f3ff;
          border-color: #c7d2fe;
        }

        .published-badge {
          font-size: 0.65rem;
          font-weight: 800;
          padding: 2px 6px;
          background: #e0e7ff;
          color: #4338ca;
          border-radius: 6px;
          text-transform: uppercase;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .status-dot.mercator { background-color: #10b981; } /* Green */
        .status-dot.creator { background-color: #3b82f6; } /* Blue */

        .app-card-inner-v2 {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .app-card-inner-v2 img {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          background: white;
          padding: 8px;
          border: 1px solid #f1f5f9;
          object-fit: contain;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          transition: transform 0.3s;
        }

        .app-card-v2:hover img {
          transform: rotate(-5deg) scale(1.1);
        }

        .app-details-v2 h4 {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.01em;
        }

        .app-details-v2 p {
          margin: 2px 0 0 0;
          font-size: 0.75rem;
          color: #94a3b8;
          max-width: 150px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .app-actions-v2 {
          margin-left: auto;
          display: flex;
          gap: 8px;
        }

        .app-actions-v2 button {
          width: 36px;
          height: 36px;
          border: none;
          background: #f8fafc;
          color: #64748b;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }

        .app-actions-v2 button:hover { 
          background: #4f46e5; 
          color: white; 
          transform: scale(1.1);
          box-shadow: 0 4px 8px rgba(79, 70, 229, 0.2);
        }
        
        .app-actions-v2 button.delete:hover { 
          background: #e11d48; 
          box-shadow: 0 4px 8px rgba(225, 29, 72, 0.2);
        }

        .stats-visual-grid-v2 {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 20px;
        }

        .stat-card-v2 {
          background: white;
          padding: 20px;
          border-radius: 18px;
          border: 1px solid #e2e8f0;
        }

        .stat-info-v2 {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .stat-name-v2 { font-weight: 700; color: #475569; }
        .stat-value-v2 { font-weight: 900; color: #1e293b; font-size: 1.1rem; }

        .stat-bar-bg-v2 {
          height: 6px;
          background: #f1f5f9;
          border-radius: 10px;
          overflow: hidden;
        }

        .stat-bar-fill-v2 {
          height: 100%;
          background: linear-gradient(90deg, #4f46e5, #7c3aed);
          border-radius: 10px;
          transition: width 1s ease-out;
        }

        .primary-btn-v2 {
          background: linear-gradient(135deg, #4f46e5 0%, #4f46e5 100%);
          color: white;
          border: none;
          padding: 13px 28px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 0.95rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          box-shadow: 0 8px 16px -2px rgba(79, 70, 229, 0.3);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .primary-btn-v2:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 24px -4px rgba(79, 70, 229, 0.4);
          background: linear-gradient(135deg, #4338ca 0%, #4338ca 100%);
        }

        .primary-btn-v2:active {
          transform: translateY(0);
          box-shadow: 0 4px 8px -1px rgba(79, 70, 229, 0.3);
        }

        .primary-btn-v2:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .categories-list-v2 {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
        }

        .category-item-v2 {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: white;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }

        .category-item-v2 span { font-weight: 700; color: #334155; }

        .modern-table-v2 {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0 10px;
        }

        .modern-table-v2 th {
          text-align: left;
          padding: 12px 16px;
          color: #94a3b8;
          font-weight: 700;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .modern-table-v2 tr {
          background: white;
          border-radius: 12px;
          transition: all 0.2s;
        }

        .modern-table-v2 tbody tr:hover {
          box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.08);
          transform: translateY(-1px);
        }

        .modern-table-v2 td {
          padding: 14px 16px;
          background: white;
          border: none;
        }

        .modern-table-v2 td:first-child { border-top-left-radius: 12px; border-bottom-left-radius: 12px; }
        .modern-table-v2 td:last-child { border-top-right-radius: 12px; border-bottom-right-radius: 12px; }

        .filter-btn-v2 {
          padding: 8px 16px;
          border: 1px solid #e2e8f0;
          background: white;
          border-radius: 10px;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
        }

        .filter-btn-v2.active {
          background: #4f46e5;
          color: white;
          border-color: #4f46e5;
        }

        .filter-group-v2 {
          display: flex;
          background: #f1f5f9;
          padding: 4px;
          border-radius: 12px;
          gap: 2px;
        }

        .filter-group-v2 .filter-btn-v2 {
          padding: 6px 12px;
          border: none;
          background: none;
          font-size: 0.75rem;
          border-radius: 8px;
        }

        .filter-group-v2 .filter-btn-v2.active {
          background: white;
          color: #4f46e5;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }

        .modal-overlay-v2 {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 20px;
        }

        .modal-content-v2 {
          background: white;
          border-radius: 24px;
          width: 100%;
          max-width: 1000px;
          max-height: 92vh;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 10px 25px -5px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          border: 1px solid #e2e8f0;
          overflow: hidden;
        }

        .modal-header-v2 {
          padding: 28px 36px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #f1f5f9;
          flex-shrink: 0;
          background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
        }

        .modal-header-v2 h3 {
          margin: 0;
          font-size: 1.6rem;
          font-weight: 700;
          color: #0f172a;
          letter-spacing: -0.025em;
        }

        .header-icon-v2 {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          border-radius: 12px;
          color: white;
        }

        .modal-body-v2 {
          padding: 36px;
          overflow-y: auto;
          flex: 1;
          min-height: 0;
          background: white;
        }

        /* Style des barres de défilement - webkit browsers */
        .modal-body-v2::-webkit-scrollbar {
          width: 10px;
        }

        .modal-body-v2::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 10px;
        }

        .modal-body-v2::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 5px;
        }

        .modal-body-v2::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .modal-footer-v2 {
          padding: 24px 36px;
          border-top: 2px solid #f1f5f9;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
          border-bottom-left-radius: 24px;
          border-bottom-right-radius: 24px;
          flex-shrink: 0;
        }

        .close-modal-btn {
          background: #f1f5f9;
          border: none;
          padding: 10px;
          border-radius: 12px;
          cursor: pointer;
          color: #64748b;
          transition: all 0.2s;
        }

        .close-modal-btn:hover {
          background: #fee2e2;
          color: #ef4444;
          transform: rotate(90deg);
        }

        .animate-fade-in {
          animation: modalFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .user-count-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: white;
          border-radius: 50%;
          font-size: 0.7rem;
          font-weight: 800;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }

        .modal-tabs {
          display: flex;
          padding: 0 36px;
          border-bottom: none;
          gap: 8px;
          flex-shrink: 0;
          background: white;
          align-items: center;
        }

        .modal-tabs button {
          padding: 12px 20px;
          background: transparent;
          border: 2px solid transparent;
          border-radius: 12px;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
          font-size: 0.95rem;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }

        .modal-tabs button:hover {
          background: #f1f5f9;
          color: #4f46e5;
        }

        .modal-tabs button.active {
          background: white;
          color: #4f46e5;
          border-bottom-color: #4f46e5;
          box-shadow: 0 0 0 2px #dbeafe;
        }

        .ad-search-box input {
          flex: 1;
          padding: 10px 14px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
        }

        .ad-results {
          margin-top: 12px;
          background: white;
          border-radius: 14px;
          border: 2px solid #e2e8f0;
          max-height: 260px;
          overflow-y: auto;
          transition: all 0.2s;
        }

        .ad-results::-webkit-scrollbar {
          width: 8px;
        }

        .ad-results::-webkit-scrollbar-track {
          background: transparent;
        }

        .ad-results::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }

        .ad-results::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .ad-result-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
          border-bottom: 1px solid #f1f5f9;
          transition: all 0.15s;
        }

        .ad-result-item:hover {
          background: #f8fafc;
        }

        .ad-result-item:last-child { border-bottom: none; }
        .ad-result-item strong { display: block; font-size: 0.9rem; color: #0f172a; font-weight: 600; }
        .ad-result-item span { font-size: 0.8rem; color: #64748b; }
        .ad-result-item button {
          padding: 6px 14px;
          background: #4f46e5;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .ad-result-item button:hover {
          background: #4338ca;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }

        .empty-msg {
          text-align: center;
          color: #94a3b8;
          font-style: italic;
          padding: 20px;
        }

        .users-table-scroll {
          max-height: 380px;
          overflow-y: auto;
          margin-top: 16px;
          border-radius: 14px;
          border: 2px solid #e2e8f0;
          background: white;
        }

        .users-table-scroll::-webkit-scrollbar {
          width: 10px;
        }

        .users-table-scroll::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 10px;
        }

        .users-table-scroll::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 5px;
        }

        .users-table-scroll::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .users-management {
          display: flex;
          flex-direction: column;
          gap: 40px;
        }

        .ad-search-box {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .ad-search-box label {
          font-weight: 600;
          color: #334155;
          font-size: 0.95rem;
        }

        .app-users-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .app-users-list > label {
          font-weight: 600;
          color: #334155;
          font-size: 0.95rem;
        }

        @media (max-width: 1024px) {
          .workspace-grid { grid-template-columns: 1fr; }
          .form-grid-v2 { grid-template-columns: 1fr; }
          .form-group-v2.full-width { grid-column: span 1; }
          .modal-content-v2 { max-width: 95vw; }
          .modal-header-v2, .modal-body-v2, .modal-footer-v2 { padding: 20px 24px; }
          .modal-tabs { padding: 0 24px; }
        }

        @media (max-width: 640px) {
          .modal-content-v2 { max-width: 100vw; border-radius: 16px; max-height: 95vh; }
          .modal-header-v2 { padding: 16px 20px; }
          .modal-header-v2 h3 { font-size: 1.3rem; }
          .modal-body-v2 { padding: 20px; }
          .modal-footer-v2 { padding: 16px 20px; }
          .modal-tabs { padding: 0 20px; gap: 0; }
          .modal-tabs button { padding: 12px 16px; font-size: 0.85rem; }
          .form-grid-v2 { gap: 16px; }
        }
      `}</style>
    </div>
  );
};

export default MagappAdmin;
