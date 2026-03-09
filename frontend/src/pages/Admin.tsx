import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import * as Icons from 'lucide-react';
import { 
  Plus, Trash2, X, UserPlus, Users, Edit2, 
  ChevronUp, ChevronDown, Check, LayoutDashboard, LayoutGrid,
  FileText, Mail, ChevronRight, ArrowLeft,
  Link as LinkIcon, ExternalLink, Loader2, Search, ShieldCheck, Radio, Save,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  last_activity: string | null;
  service_code: string | null;
  service_complement: string | null;
}

const AVAILABLE_ICONS = [
  'LayoutDashboard', 'Wallet', 'Users', 'FileCheck', 'ShieldCheck', 
  'FileText', 'Database', 'Mail', 'Calendar', 'CreditCard', 
  'Building2', 'Briefcase', 'BarChart3', 'HardDrive', 'Globe', 
  'Lock', 'Settings', 'AlertTriangle', 'HelpCircle', 'Box',
  'ShoppingCart', 'Users2', 'Zap', 'Star', 'Heart', 'Shield',
  'Paperclip', 'Printer', 'Monitor', 'Cpu', 'Server',
  'Activity', 'Anchor', 'Archive', 'Award', 'Bell', 'Bookmark',
  'Camera', 'CheckCircle', 'Cloud', 'Code', 'Compass', 'Copy',
  'Download', 'Edit', 'ExternalLink', 'Eye', 'File', 'Filter',
  'Flag', 'Folder', 'Gift', 'Home', 'Image', 'Info', 'Key',
  'Layers', 'Link', 'List', 'Map', 'Maximize', 'Menu', 'MessageCircle',
  'MessageSquare', 'Mic', 'Minimize', 'MoreHorizontal', 'MoreVertical',
  'Navigation', 'Package', 'Phone', 'Play', 'Plus', 'Power', 'RefreshCw',
  'Search', 'Send', 'Share2', 'ShoppingBag', 'Sliders', 'Smartphone',
  'Tag', 'Target', 'ThumbsUp', 'Trash2', 'TrendingUp', 'Truck', 'Upload',
  'User', 'Video', 'Wifi', 'X', 'ZoomIn', 'ZoomOut',
  'PieChart', 'LineChart', 'ClipboardList', 'Tablet', 'Laptop',
  'Headphones', 'Speaker', 'Tv', 'Disc', 'Music',
  'Clapperboard', 'Gamepad2', 'Lightbulb', 'Umbrella', 'Sun', 'Moon',
  'CloudRain', 'CloudLightning', 'Wind', 'Thermometer', 'Droplets',
  'Flame', 'Leaf', 'Sprout', 'TreeDeciduous', 'Mountain', 'Waves',
  'Car', 'Bike', 'Plane', 'Train', 'Ship', 'Footprints',
  'LifeBuoy', 'Smile', 'Frown', 'Meh', 'Angry', 'Laugh', 'Wink',
  'Scale', 'Calculator', 'Book', 'Pencil', 'GraduationCap', 'FlaskConical',
  'Dna', 'Atom', 'Stethoscope', 'Syringe', 'Pill', 'MapPin', 'Locate', 
  'Milestone', 'Signpost', 'Tool', 'Hammer', 'Wrench', 'Construction',
  'Ticket', 'Tags', 'Barcode', 'QrCode', 'Coins', 'Banknote', 'PiggyBank'
];

const Admin: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'main' | 'tiles' | 'users' | 'ad'>('main');
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [newTile, setNewTile] = useState({ title: '', icon: 'Box', description: '', status: 'active' as any });
  const [editingTile, setEditingTile] = useState<TileData | null>(null);
  const [newLink, setNewLink] = useState({ label: '', url: '', is_internal: true });
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user', service_code: '', service_complement: '' });
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  
  // Active Directory states
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
  
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const fetchTiles = async () => {
    const response = await fetch('/api/tiles', { headers: { 'Authorization': `Bearer ${token}` } });
    if (response.ok) {
      const data = await response.json();
      setTiles(data.sort((a: any, b: any) => a.sort_order - b.sort_order));
    }
  };

  const fetchUsers = async () => {
    const response = await fetch('/api/users', { headers: { 'Authorization': `Bearer ${token}` } });
    if (response.ok) setUsers(await response.json());
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
          bind_password: data.bind_password || ''
        });
      }
    } catch (error) {
      console.error('Erreur chargement AD:', error);
    }
  };

  useEffect(() => {
    if (activeSection === 'tiles') fetchTiles();
    if (activeSection === 'users') fetchUsers();
    if (activeSection === 'ad') fetchADSettings();
    if (activeSection === 'main') { fetchTiles(); fetchUsers(); }
  }, [activeSection]);

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

  const handleAddTile = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/tiles', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newTile, sort_order: tiles.length })
    });
    if (res.ok) {
      setNewTile({ title: '', icon: 'Box', description: '', status: 'active' });
      fetchTiles();
    }
  };

  const handleUpdateTile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTile) return;
    const res = await fetch(`/api/tiles/${editingTile.id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(editingTile)
    });
    if (res.ok) {
      setEditingTile(null);
      fetchTiles();
    }
  };

  const handleDeleteTile = async (id: number) => {
    if (window.confirm('Supprimer cette tuile ?')) {
      await fetch(`/api/tiles/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      fetchTiles();
    }
  };

  const handleAddLink = async (tileId: number) => {
    if (!newLink.label || !newLink.url) return;
    const res = await fetch(`/api/tiles/${tileId}/links`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(newLink)
    });
    if (res.ok) {
      setNewLink({ label: '', url: '', is_internal: true });
      fetchTiles();
      if (editingTile && editingTile.id === tileId) {
        const updatedTiles = await (await fetch('/api/tiles', { headers: { 'Authorization': `Bearer ${token}` } })).json();
        const updatedTile = updatedTiles.find((t: any) => t.id === tileId);
        setEditingTile(updatedTile);
      }
    }
  };

  const handleDeleteLink = async (linkId: number) => {
    if (window.confirm('Supprimer ce lien ?')) {
      const res = await fetch(`/api/links/${linkId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchTiles();
        if (editingTile) {
          const updatedTiles = await (await fetch('/api/tiles', { headers: { 'Authorization': `Bearer ${token}` } })).json();
          const updatedTile = updatedTiles.find((t: any) => t.id === editingTile.id);
          setEditingTile(updatedTile);
        }
      }
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
    const response = await fetch(`/api/users/${editingUser.id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(editingUser)
    });
    if (response.ok) {
      setEditingUser(null);
      fetchUsers();
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (window.confirm('Supprimer cet utilisateur ?')) {
      await fetch(`/api/users/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      fetchUsers();
    }
  };

  const formatActivityDate = (dateStr: string | null) => {
    if (!dateStr) return 'Jamais connecté';
    const date = new Date(dateStr);
    return date.toLocaleString('fr-FR');
  };

  return (
    <div className="admin-page">
      <Header />
      <main className="container">
        <div className="admin-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            {activeSection !== 'main' && (
              <button className="btn-icon back-btn" onClick={() => setActiveSection('main')}>
                <ArrowLeft size={24} />
              </button>
            )}
            <h1 style={{ color: 'var(--color-navy)', fontWeight: 800, margin: 0 }}>
              {activeSection === 'main' ? 'Administration Système' : 
               activeSection === 'tiles' ? 'Configuration du Hub' : 
               activeSection === 'users' ? 'Gestion des Utilisateurs' : 'Liaison Active Directory'}
            </h1>
          </div>
        </div>

        {activeSection === 'main' && (
          <div className="admin-dashboard-grid">
            <AdminTile 
              title="Configuration du Hub" 
              description="Gérer les tuiles, les icônes et les liens de navigation."
              icon={<LayoutDashboard size={32} />}
              color="#3b82f6"
              onClick={() => setActiveSection('tiles')}
            />
            <AdminTile
              title="Modèles d'Emails"
              description="Personnaliser les messages automatiques envoyés aux tiers."
              icon={<FileText size={32} />}
              color="#10b981"
              onClick={() => navigate('/admin/email-templates')}
            />
            <AdminTile 
              title="Utilisateurs" 
              description="Gérer les accès, les rôles et les comptes utilisateurs."
              icon={<Users size={32} />}
              color="#6366f1"
              onClick={() => setActiveSection('users')}
            />
            <AdminTile
              title="Serveur de Messagerie"
              description="Relais SMTP, Proxy et Template global des emails."
              icon={<Mail size={32} />}
              color="#f59e0b"
              onClick={() => navigate('/admin/mail')}
            />
            <AdminTile
              title="Magasin d'Applications"
              description="Gérer le catalogue des applications du portail."
              icon={<LayoutGrid size={32} />}
              color="#0ea5e9"
              onClick={() => navigate('/admin/magapp')}
            />
            <AdminTile 
              title="Active Directory" 
              description="Lier les comptes Windows et tester l'authentification réseau."
              icon={<ShieldCheck size={32} />}
              color="#ef4444"
              onClick={() => setActiveSection('ad')}
            />
          </div>
        )}

        {activeSection === 'tiles' && (
          <div className="section-content">
            <div className="section-actions" style={{ marginBottom: '20px' }}>
              <button className="btn btn-primary" onClick={() => { setEditingTile(null); setNewTile({ title: '', icon: 'Box', description: '', status: 'active' }); }}>
                <Plus size={20} /> Nouvelle Tuile
              </button>
            </div>

            {(editingTile || (newTile.title === '' && !editingTile && tiles.length === 0)) && (
              <section className="admin-section highlight">
                <h3>{editingTile ? `Modifier : ${editingTile.title}` : 'Nouvelle Tuile'}</h3>
                <form onSubmit={editingTile ? handleUpdateTile : handleAddTile} className="admin-form">
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '15px' }}>
                    <input placeholder="Titre" value={editingTile ? editingTile.title : newTile.title} onChange={e => editingTile ? setEditingTile({...editingTile, title: e.target.value}) : setNewTile({...newTile, title: e.target.value})} required />
                    <select value={editingTile ? editingTile.status : newTile.status} onChange={e => editingTile ? setEditingTile({...editingTile, status: e.target.value as any}) : setNewTile({...newTile, status: e.target.value as any})}>
                      <option value="active">Active</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="soon">Bientôt</option>
                    </select>
                  </div>
                  
                  <div className="icon-selector-container">
                    <label>Icône :</label>
                    <div className="icon-grid-picker">
                      {AVAILABLE_ICONS.map(name => {
                        const Icon = (Icons as any)[name] || Icons.Box;
                        const currentIcon = editingTile ? editingTile.icon : newTile.icon;
                        return (
                          <button key={name} type="button" className={`icon-option ${currentIcon === name ? 'selected' : ''}`} onClick={() => editingTile ? setEditingTile({...editingTile, icon: name}) : setNewTile({...newTile, icon: name})}>
                            <Icon size={20} />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <textarea placeholder="Description" value={editingTile ? editingTile.description : newTile.description} onChange={e => editingTile ? setEditingTile({...editingTile, description: e.target.value}) : setNewTile({...newTile, description: e.target.value})} required />
                  
                  {editingTile && (
                    <div className="links-management">
                      <h4>Lien(s) associé(s)</h4>
                      <div className="links-list">
                        {editingTile.links.map(link => (
                          <div key={link.id} className="link-row">
                            <span className="link-label">{link.label}</span>
                            <span className="link-url">{link.url}</span>
                            <button type="button" className="btn-icon delete" onClick={() => handleDeleteLink(link.id)}><Trash2 size={16} /></button>
                          </div>
                        ))}
                      </div>
                      <div className="add-link-form">
                        <input placeholder="Libellé du lien" value={newLink.label} onChange={e => setNewLink({...newLink, label: e.target.value})} />
                        <input placeholder="URL" value={newLink.url} onChange={e => setNewLink({...newLink, url: e.target.value})} />
                        <label className="checkbox-label">
                          <input type="checkbox" checked={newLink.is_internal} onChange={e => setNewLink({...newLink, is_internal: e.target.checked})} /> Interne
                        </label>
                        <button type="button" className="btn btn-secondary" onClick={() => handleAddLink(editingTile.id)}>Ajouter</button>
                      </div>
                    </div>
                  )}

                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary"><Check size={18} /> Enregistrer</button>
                    {editingTile && <button type="button" className="btn" onClick={() => setEditingTile(null)}>Fermer</button>}
                  </div>
                </form>
              </section>
            )}

            <div className="tiles-list">
              {tiles.map((tile, index) => {
                const TileIcon = (Icons as any)[tile.icon] || Icons.Box;
                return (
                  <div key={tile.id} className="admin-tile-row">
                    <div className="reorder-controls">
                      <button className="btn-reorder" disabled={index === 0} onClick={() => handleMoveTile(index, 'up')}><ChevronUp size={16} /></button>
                      <button className="btn-reorder" disabled={index === tiles.length - 1} onClick={() => handleMoveTile(index, 'down')}><ChevronDown size={16} /></button>
                    </div>
                    <div className="tile-icon-preview"><TileIcon size={24} /></div>
                    <div className="tile-info">
                      <strong>{tile.title}</strong>
                      <p>{tile.description}</p>
                      <div className="tile-links-preview">
                        {tile.links.map(l => (
                          <span key={l.id} className="link-badge">
                            {l.is_internal ? <LinkIcon size={10} /> : <ExternalLink size={10} />} {l.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="tile-actions">
                      <button className="btn-icon" onClick={() => setEditingTile(tile)}><Edit2 size={20} color="var(--secondary-color)" /></button>
                      <button className="btn-icon" onClick={() => handleDeleteTile(tile.id)}><Trash2 size={20} color="var(--primary-color)" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeSection === 'ad' && (
          <div className="section-content ad-config-container" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '30px', padding: '0', alignItems: 'start' }}>
            {/* Colonne de gauche : Configuration principale */}
            <div className="ad-left-panel" style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
              <div className="panel-header" style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)', color: 'white', padding: '20px 25px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ShieldCheck size={24} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Paramètres Active Directory</h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.9 }}>Configurez la liaison avec votre annuaire d'entreprise</p>
                  </div>
                </div>
                <div style={{ 
                  background: adConfig.is_enabled ? '#dcfce7' : '#f1f5f9', 
                  color: adConfig.is_enabled ? '#166534' : '#64748b',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  textTransform: 'uppercase'
                }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: adConfig.is_enabled ? '#22c55e' : '#94a3b8' }}></div>
                  {adConfig.is_enabled ? 'Activé' : 'Désactivé'}
                </div>
              </div>
              
              <div className="panel-body" style={{ padding: '30px' }}>
                {/* Toggle d'activation */}
                <div style={{ 
                  background: '#f8fafc', 
                  padding: '15px 20px', 
                  borderRadius: '12px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  marginBottom: '30px',
                  border: '1px solid #f1f5f9'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ background: '#3b82f620', color: '#3b82f6', padding: '10px', borderRadius: '10px' }}>
                      <Power size={20} />
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: '1rem', display: 'block' }}>Authentification AD</span>
                      <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Permettre aux utilisateurs de se connecter via Windows</span>
                    </div>
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={adConfig.is_enabled} onChange={e => setAdConfig({...adConfig, is_enabled: e.target.checked})} />
                    <span className="slider round"></span>
                  </label>
                </div>

                <div style={{ opacity: adConfig.is_enabled ? 1 : 0.6, pointerEvents: adConfig.is_enabled ? 'auto' : 'none', transition: 'all 0.3s ease' }}>
                  <h4 style={{ fontSize: '0.9rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                    Connexion au serveur
                  </h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '20px', marginBottom: '25px' }}>
                    <div className="form-group">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.9rem' }}>Hôte (Serveur ou IP)</label>
                      <input 
                        style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }}
                        value={adConfig.host} 
                        onChange={e => setAdConfig({...adConfig, host: e.target.value})} 
                        placeholder="Ex: 10.103.130.118 ou ldap.ivry.fr" 
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.9rem' }}>Port</label>
                      <input 
                        type="number" 
                        style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }}
                        value={adConfig.port} 
                        onChange={e => setAdConfig({...adConfig, port: parseInt(e.target.value) || 389})} 
                        placeholder="389" 
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: '25px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.9rem' }}>Base DN (Contexte de recherche)</label>
                    <input 
                      style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }}
                      value={adConfig.base_dn} 
                      onChange={e => setAdConfig({...adConfig, base_dn: e.target.value})} 
                      placeholder="DC=ivry,DC=local" 
                    />
                  </div>

                  <h4 style={{ fontSize: '0.9rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', marginTop: '40px' }}>
                    Sécurité et Liaison
                  </h4>

                  <div className="form-group" style={{ marginBottom: '25px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.9rem' }}>Groupe AD requis (Optionnel)</label>
                    <input 
                      style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }}
                      value={adConfig.required_group} 
                      onChange={e => setAdConfig({...adConfig, required_group: e.target.value})} 
                      placeholder="Ex: gantto" 
                    />
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                      Seuls les membres de ce groupe pourront se connecter.
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
                    <div className="form-group">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.9rem' }}>Bind DN (Compte technique)</label>
                      <input 
                        style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }}
                        value={adConfig.bind_dn} 
                        onChange={e => setAdConfig({...adConfig, bind_dn: e.target.value})} 
                        placeholder="CN=user,OU=IRS,..." 
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.9rem' }}>Mot de passe Liaison</label>
                      <input 
                        type="password" 
                        style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }}
                        value={adConfig.bind_password} 
                        onChange={e => setAdConfig({...adConfig, bind_password: e.target.value})} 
                        placeholder="••••••••••••••••" 
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '15px', borderTop: '1px solid #f1f5f9', paddingTop: '25px', marginTop: '10px' }}>
                  <button className="btn btn-primary" onClick={handleSaveAD} disabled={isSaving} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 30px', borderRadius: '10px' }}>
                    {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    Enregistrer la configuration
                  </button>
                  <button 
                    className="btn btn-outline" 
                    onClick={handlePingAD} 
                    disabled={isTesting} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '10px', 
                      padding: '12px 20px', 
                      borderRadius: '10px',
                      border: '1px solid #3b82f6',
                      color: '#3b82f6',
                      background: 'white',
                      fontWeight: 600
                    }}
                  >
                    {isTesting ? <Loader2 className="animate-spin" size={20} /> : <Radio size={20} />}
                    Tester la liaison
                  </button>
                </div>
              </div>
            </div>

            {/* Colonne de droite : Outils de recherche et Aide */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="ad-right-panel" style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '25px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ background: '#3b82f615', color: '#3b82f6', padding: '8px', borderRadius: '8px' }}>
                    <Search size={22} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Chercher un utilisateur</h3>
                </div>
                
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '25px', lineHeight: '1.5' }}>
                  Saisissez l'identifiant Windows (sAMAccountName) pour vérifier ses informations dans l'AD.
                </p>

                <form onSubmit={handleVerifyUser} style={{ display: 'flex', gap: '10px' }}>
                  <input 
                    style={{ flex: 1, padding: '12px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }}
                    placeholder="Identifiant (ex: jdoe)" 
                    value={testUser.username} 
                    onChange={e => setTestUser({...testUser, username: e.target.value})} 
                  />
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    disabled={isTesting || !testUser.username}
                    style={{ padding: '12px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {isTesting ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
                  </button>
                </form>

                {testResult && (
                  <div style={{ 
                    marginTop: '25px', 
                    padding: '15px', 
                    borderRadius: '10px', 
                    background: testResult.success ? '#f0fdf4' : '#fef2f2', 
                    border: `1px solid ${testResult.success ? '#bbf7d0' : '#fecaca'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div style={{ color: testResult.success ? '#166534' : '#991b1b' }}>
                        {testResult.success ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: testResult.success ? '#166534' : '#991b1b', fontWeight: 600 }}>
                        {testResult.message}
                      </div>
                    </div>

                    {testResult.success && testResult.data && (
                      <div style={{ marginTop: '10px', borderTop: '1px solid #dcfce7', paddingTop: '15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#16653410', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700 }}>
                            {(testResult.data.displayName || testResult.data.cn || '?').charAt(0)}
                          </div>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>{testResult.data.displayName || testResult.data.cn}</h4>
                            <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{testResult.data.mail || 'Pas d\'email'}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <Icons.Building2 size={14} style={{ opacity: 0.5 }} />
                            <span><strong>Service :</strong> {testResult.data.department || 'Non renseigné'}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <Icons.Fingerprint size={14} style={{ opacity: 0.5 }} />
                            <span style={{ wordBreak: 'break-all' }}><strong>DN :</strong> {testResult.data.dn}</span>
                          </div>
                          
                          <div style={{ marginTop: '8px' }}>
                            <strong style={{ fontSize: '0.75rem', opacity: 0.7, display: 'block', marginBottom: '5px' }}>GROUPES AD</strong>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '100px', overflowY: 'auto' }}>
                              {testResult.data.memberOf ? (
                                (Array.isArray(testResult.data.memberOf) ? testResult.data.memberOf : [testResult.data.memberOf]).map((group: string, idx: number) => {
                                  const groupName = group.split(',')[0].replace('CN=', '');
                                  const isRequired = adConfig.required_group && groupName.toLowerCase().includes(adConfig.required_group.toLowerCase());
                                  return (
                                    <span key={idx} style={{ 
                                      fontSize: '0.65rem', 
                                      padding: '2px 6px', 
                                      borderRadius: '3px', 
                                      background: isRequired ? '#16653420' : '#00000008', 
                                      color: isRequired ? '#166534' : '#475569',
                                      border: `1px solid ${isRequired ? '#16653430' : '#00000010'}`,
                                      fontWeight: isRequired ? 700 : 400
                                    }}>
                                      {groupName}
                                    </span>
                                  );
                                })
                              ) : <span>Aucun</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ background: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1', padding: '25px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px', color: '#64748b' }}>
                  <HelpCircle size={18} />
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>Aide au paramétrage</h4>
                </div>
                <ul style={{ padding: 0, margin: 0, listStyle: 'none', fontSize: '0.8rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <li style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ color: '#3b82f6', fontWeight: 700 }}>•</div>
                    <span><strong>Base DN:</strong> En général DC=ivry,DC=local. C'est la racine où l'appli cherchera les comptes.</span>
                  </li>
                  <li style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ color: '#3b82f6', fontWeight: 700 }}>•</div>
                    <span><strong>Bind DN:</strong> Chemin complet du compte technique. Ex: CN=Svc_Hub,OU=Comptes,DC=ivry,DC=local.</span>
                  </li>
                  <li style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ color: '#3b82f6', fontWeight: 700 }}>•</div>
                    <span><strong>Login:</strong> L'application utilise le <i>sAMAccountName</i> pour identifier l'utilisateur.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'users' && (
          <div className="section-content">
            <div className="section-actions" style={{ marginBottom: '20px' }}>
              <button className="btn btn-primary" onClick={() => { setIsAddingUser(!isAddingUser); setEditingUser(null); }}>
                {isAddingUser ? <X size={20} /> : <UserPlus size={20} />} {isAddingUser ? 'Annuler' : 'Créer un utilisateur'}
              </button>
            </div>

            {(isAddingUser || editingUser) && (
              <section className="admin-section highlight">
                <h3>{editingUser ? `Modifier : ${editingUser.username}` : 'Nouvel utilisateur'}</h3>
                <form onSubmit={editingUser ? handleUpdateUser : handleAddUser} className="admin-form">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <input placeholder="Nom d'utilisateur" value={editingUser ? editingUser.username : newUser.username} onChange={e => editingUser ? setEditingUser({...editingUser, username: e.target.value}) : setNewUser({...newUser, username: e.target.value})} required />
                    {!editingUser && <input type="password" placeholder="Mot de passe" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} required />}
                    <select value={editingUser ? editingUser.role : newUser.role} onChange={e => editingUser ? setEditingUser({...editingUser, role: e.target.value}) : setNewUser({...newUser, role: e.target.value})}>
                      <option value="user">Utilisateur standard</option>
                      <option value="finances">Direction Finances</option>
                      <option value="compta">Comptabilité</option>
                      <option value="admin">Administrateur</option>
                    </select>
                    <input placeholder="Code Service" value={editingUser ? editingUser.service_code || '' : newUser.service_code} onChange={e => editingUser ? setEditingUser({...editingUser, service_code: e.target.value}) : setNewUser({...newUser, service_code: e.target.value})} />
                  </div>
                  <input placeholder="Complément service" value={editingUser ? editingUser.service_complement || '' : newUser.service_complement} onChange={e => editingUser ? setEditingUser({...editingUser, service_complement: e.target.value}) : setNewUser({...newUser, service_complement: e.target.value})} style={{ width: '100%' }} />
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary"><Check size={18} /> {editingUser ? 'Mettre à jour' : 'Créer'}</button>
                  </div>
                </form>
              </section>
            )}

            <div className="users-list">
              {users.map(u => (
                <div key={u.id} className="admin-tile-row">
                  <div className="user-info">
                    <strong>{u.username}</strong>
                    <div style={{ display: 'flex', gap: '10px', fontSize: '12px', color: '#64748b' }}>
                      <span>Rôle: {u.role}</span>
                      <span>Activité: {formatActivityDate(u.last_activity)}</span>
                    </div>
                  </div>
                  <div className="tile-actions">
                    <button className="btn-icon" onClick={() => setEditingUser(u)}><Edit2 size={20} color="var(--secondary-color)" /></button>
                    <button className="btn-icon" onClick={() => handleDeleteUser(u.id)} disabled={u.username === 'admin'}><Trash2 size={20} color="var(--primary-color)" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <style>{`
        .admin-page { padding-bottom: 50px; background: #f8fafc; min-height: 100vh; }
        .admin-header { padding: 40px 0; border-bottom: 1px solid #e2e8f0; margin-bottom: 30px; }
        .back-btn { background: white !important; border: 1px solid #e2e8f0 !important; border-radius: 12px !important; padding: 10px !important; margin-right: 10px; color: var(--color-navy); }
        .back-btn:hover { background: #f1f5f9 !important; }
        
        .admin-dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 25px; }
        .admin-tile-card { background: white; padding: 30px; border-radius: 16px; border: 1px solid #e2e8f0; cursor: pointer; transition: all 0.2s; display: flex; align-items: flex-start; gap: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .admin-tile-card:hover { transform: translateY(-4px); box-shadow: 0 12px 20px -5px rgba(0,0,0,0.1); border-color: var(--primary-color); }
        .admin-tile-icon { padding: 15px; border-radius: 12px; color: white; display: flex; align-items: center; justify-content: center; }
        .admin-tile-content h3 { margin: 0 0 8px 0; color: var(--color-navy); font-weight: 800; font-size: 1.1rem; }
        .admin-tile-content p { margin: 0; color: #64748b; font-size: 0.9rem; line-height: 1.5; }

        .admin-section { background: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .admin-form { display: grid; gap: 15px; }
        .admin-form input, .admin-form textarea, .admin-form select { padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; }
        .admin-tile-row { background: white; padding: 20px; border-radius: 12px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .tile-icon-preview { width: 48px; height: 48px; background: #f1f5f9; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--primary-color); margin-right: 20px; }
        .icon-grid-picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(45px, 1fr)); gap: 8px; max-height: 180px; overflow-y: auto; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; }
        .icon-option { width: 45px; height: 45px; display: flex; align-items: center; justify-content: center; border: 1px solid #f1f5f9; background: #f8fafc; border-radius: 8px; cursor: pointer; }
        .icon-option.selected { border-color: #3b82f6; background: #eff6ff; color: #2563eb; }
        .btn-icon { background: none; border: none; cursor: pointer; padding: 8px; transition: all 0.2s; }
        .btn-icon:hover { background: #f1f5f9; border-radius: 8px; }
        
        .links-management { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
        .links-list { display: grid; gap: 10px; margin-bottom: 15px; }
        .link-row { display: flex; align-items: center; gap: 10px; background: #f8fafc; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
        .link-label { font-weight: 700; width: 120px; }
        .link-url { color: #64748b; flex: 1; overflow: hidden; text-overflow: ellipsis; }
        .add-link-form { display: flex; gap: 10px; align-items: center; }
        .add-link-form input { flex: 1; padding: 8px !important; }
        .checkbox-label { font-size: 12px; display: flex; align-items: center; gap: 5px; white-space: nowrap; }
        
        .link-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: #f1f5f9; border-radius: 4px; font-size: 10px; font-weight: 600; color: #475569; margin-right: 5px; margin-top: 5px; }
        .reorder-controls { display: flex; flex-direction: column; gap: 2px; margin-right: 15px; }
        .btn-reorder { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 2px; }
        .btn-reorder:disabled { opacity: 0.2; cursor: not-allowed; }
        
        .form-group { display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px; }
        .form-group label { font-size: 13px; font-weight: 600; color: #475569; }
        
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
        .test-alert.success { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
        .test-alert.error { border-color: #fecaca; background: #fef2f2; color: #991b1b; }

        .switch { position: relative; display: inline-block; width: 44px; height: 22px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .4s; }
        .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .4s; }
        input:checked + .slider { background-color: #2563eb; }
        input:checked + .slider:before { transform: translateX(22px); }
        .slider.round { border-radius: 34px; }
        .slider.round:before { border-radius: 50%; }

        .btn-outline:hover { background: #f0f9ff !important; }
      `}</style>
    </div>
  );
};

const AdminTile: React.FC<{ title: string, description: string, icon: React.ReactNode, color: string, onClick: () => void }> = ({ title, description, icon, color, onClick }) => (
  <div className="admin-tile-card" onClick={onClick}>
    <div className="admin-tile-icon" style={{ backgroundColor: color }}>{icon}</div>
    <div className="admin-tile-content">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
    <ChevronRight size={20} color="#cbd5e1" style={{ marginLeft: 'auto' }} />
  </div>
);

export default Admin;
