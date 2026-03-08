import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import * as Icons from 'lucide-react';
import { 
  Plus, Trash2, X, UserPlus, Users, Edit2, Clock, Settings, 
  ChevronUp, ChevronDown, Check, Search, Info, LayoutDashboard,
  Wallet, FileCheck, ShieldCheck, FileText, Database, Mail,
  Calendar, CreditCard, Building2, Briefcase, BarChart3,
  HardDrive, Globe, Lock, AlertTriangle, HelpCircle, Box,
  ChevronRight, ArrowLeft, Link as LinkIcon, ExternalLink
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
  const [activeSection, setActiveSection] = useState<'main' | 'tiles' | 'users'>('main');
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [newTile, setNewTile] = useState({ title: '', icon: 'Box', description: '', status: 'active' as any });
  const [editingTile, setEditingTile] = useState<TileData | null>(null);
  const [newLink, setNewLink] = useState({ label: '', url: '', is_internal: true });
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user', service_code: '', service_complement: '' });
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  
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

  useEffect(() => {
    fetchTiles();
    fetchUsers();
  }, []);

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
      // Update editing tile links if we are editing it
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
               activeSection === 'tiles' ? 'Configuration du Hub' : 'Gestion des Utilisateurs'}
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
                      <span>Activé: {formatActivityDate(u.last_activity)}</span>
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
