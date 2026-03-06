import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { Plus, Trash2, X, UserPlus, Users, Edit2 } from 'lucide-react';

interface TileData {
  id: number;
  title: string;
  icon: string;
  description: string;
  links: any[];
}

interface UserData {
  id: number;
  username: string;
  role: string;
}

const Admin: React.FC = () => {
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [newTile, setNewTile] = useState({ title: '', icon: 'box', description: '', status: 'normal' });
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [isAddingTile, setIsAddingTile] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [activeTab, setActiveTab] = useState<'tiles' | 'users'>('tiles');
  
  const token = localStorage.getItem('token');

  const fetchTiles = async () => {
    const response = await fetch('http://localhost:3001/api/tiles', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      const data = await response.json();
      setTiles(data);
    }
  };

  const fetchUsers = async () => {
    const response = await fetch('http://localhost:3001/api/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      const data = await response.json();
      setUsers(data);
    }
  };

  useEffect(() => {
    fetchTiles();
    fetchUsers();
  }, []);

  // Tiles Handlers
  const handleDeleteTile = async (id: number) => {
    if (window.confirm('Voulez-vous vraiment supprimer cette tuile ?')) {
      const response = await fetch(`http://localhost:3001/api/tiles/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) fetchTiles();
    }
  };

  const handleAddTile = async (e: React.FormEvent) => {
    e.preventDefault();
    const response = await fetch('http://localhost:3001/api/tiles', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newTile)
    });
    if (response.ok) {
      setNewTile({ title: '', icon: 'box', description: '', status: 'normal' });
      setIsAddingTile(false);
      fetchTiles();
    }
  };

  const handleAddLink = async (tileId: number, currentLinksCount: number) => {
    if (currentLinksCount >= 3) {
      alert('Maximum 3 liens par tuile.');
      return;
    }
    const label = window.prompt('Libellé du lien :');
    const url = window.prompt('URL (ex: https://... ou /page) :');
    if (label && url) {
      const isInternal = url.startsWith('/');
      await fetch(`http://localhost:3001/api/tiles/${tileId}/links`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ label, url, is_internal: isInternal })
      });
      fetchTiles();
    }
  };

  const handleDeleteLink = async (linkId: number) => {
    await fetch(`http://localhost:3001/api/links/${linkId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    fetchTiles();
  };

  // Users Handlers
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const response = await fetch('http://localhost:3001/api/users', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newUser)
    });
    if (response.ok) {
      setNewUser({ username: '', password: '', role: 'user' });
      setIsAddingUser(false);
      fetchUsers();
    } else {
      const data = await response.json();
      alert(data.message || 'Erreur lors de la création de l\'utilisateur');
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    
    const response = await fetch(`http://localhost:3001/api/users/${editingUser.id}`, {
      method: 'PUT',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(editingUser)
    });
    if (response.ok) {
      setEditingUser(null);
      fetchUsers();
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (window.confirm('Voulez-vous vraiment supprimer cet utilisateur ?')) {
      const response = await fetch(`http://localhost:3001/api/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) fetchUsers();
    }
  };

  return (
    <div className="admin-page">
      <Header />
      <main className="container">
        <div className="admin-header">
          <h1>Administration</h1>
          <div className="admin-tabs">
            <button 
              className={`tab-btn ${activeTab === 'tiles' ? 'active' : ''}`}
              onClick={() => setActiveTab('tiles')}
            >
              Hub (Tuiles)
            </button>
            <button 
              className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              Utilisateurs
            </button>
          </div>
        </div>

        {activeTab === 'tiles' ? (
          <>
            <div className="section-header">
              <h2>Configuration du Hub</h2>
              <button className="btn btn-primary" onClick={() => setIsAddingTile(!isAddingTile)}>
                {isAddingTile ? <X size={20} /> : <Plus size={20} />}
                {isAddingTile ? 'Annuler' : 'Ajouter une tuile'}
              </button>
            </div>

            {isAddingTile && (
              <section className="admin-section">
                <h3>Nouvelle tuile</h3>
                <form onSubmit={handleAddTile} className="admin-form">
                  <input 
                    placeholder="Titre" 
                    value={newTile.title} 
                    onChange={e => setNewTile({...newTile, title: e.target.value})}
                    required
                  />
                  <input 
                    placeholder="Icône (nom Lucide)" 
                    value={newTile.icon} 
                    onChange={e => setNewTile({...newTile, icon: e.target.value})}
                    required
                  />
                  <textarea 
                    placeholder="Description" 
                    value={newTile.description} 
                    onChange={e => setNewTile({...newTile, description: e.target.value})}
                    required
                  />
                  <button type="submit" className="btn btn-primary">Enregistrer</button>
                </form>
              </section>
            )}

            <section className="tiles-list">
              {tiles.map(tile => (
                <div key={tile.id} className="admin-tile-row">
                  <div className="tile-info">
                    <strong>{tile.title}</strong>
                    <p>{tile.description}</p>
                    <div className="tile-links-admin">
                      {tile.links.map(link => (
                        <span key={link.id} className="admin-link-badge">
                          {link.label}
                          <button onClick={() => handleDeleteLink(link.id)}><X size={12} /></button>
                        </span>
                      ))}
                      <button className="btn-add-link" onClick={() => handleAddLink(tile.id, tile.links.length)}>
                        <Plus size={14} /> Ajouter un lien
                      </button>
                    </div>
                  </div>
                  <div className="tile-actions">
                    <button className="btn-icon" title="Supprimer" onClick={() => handleDeleteTile(tile.id)}>
                      <Trash2 size={20} color="var(--primary-color)" />
                    </button>
                  </div>
                </div>
              ))}
            </section>
          </>
        ) : (
          <>
            <div className="section-header">
              <h2>Gestion des Utilisateurs</h2>
              <button className="btn btn-primary" onClick={() => setIsAddingUser(!isAddingUser)}>
                {isAddingUser ? <X size={20} /> : <UserPlus size={20} />}
                {isAddingUser ? 'Annuler' : 'Créer un utilisateur'}
              </button>
            </div>

            {isAddingUser && (
              <section className="admin-section">
                <h3>Nouvel utilisateur</h3>
                <form onSubmit={handleAddUser} className="admin-form">
                  <input 
                    placeholder="Nom d'utilisateur" 
                    value={newUser.username} 
                    onChange={e => setNewUser({...newUser, username: e.target.value})}
                    required
                  />
                  <input 
                    type="password"
                    placeholder="Mot de passe" 
                    value={newUser.password} 
                    onChange={e => setNewUser({...newUser, password: e.target.value})}
                    required
                  />
                  <select 
                    value={newUser.role} 
                    onChange={e => setNewUser({...newUser, role: e.target.value})}
                  >
                    <option value="user">Utilisateur</option>
                    <option value="admin">Administrateur</option>
                  </select>
                  <button type="submit" className="btn btn-primary">Créer</button>
                </form>
              </section>
            )}

            {editingUser && (
              <section className="admin-section">
                <h3>Modifier l'utilisateur : {editingUser.username}</h3>
                <form onSubmit={handleUpdateUser} className="admin-form">
                  <input 
                    placeholder="Nom d'utilisateur" 
                    value={editingUser.username} 
                    onChange={e => setEditingUser({...editingUser, username: e.target.value})}
                    required
                  />
                  <select 
                    value={editingUser.role} 
                    onChange={e => setEditingUser({...editingUser, role: e.target.value})}
                  >
                    <option value="user">Utilisateur</option>
                    <option value="admin">Administrateur</option>
                  </select>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">Mettre à jour</button>
                    <button type="button" className="btn" onClick={() => setEditingUser(null)}>Annuler</button>
                  </div>
                </form>
              </section>
            )}

            <section className="users-list">
              {users.map(user => (
                <div key={user.id} className="admin-tile-row">
                  <div className="user-info">
                    <div className="user-avatar">
                      <Users size={20} />
                    </div>
                    <div>
                      <strong>{user.username}</strong>
                      <span className={`role-badge ${user.role}`}>{user.role}</span>
                    </div>
                  </div>
                  <div className="tile-actions">
                    <button className="btn-icon" title="Modifier" onClick={() => setEditingUser(user)}>
                      <Edit2 size={20} color="var(--secondary-color)" />
                    </button>
                    <button 
                      className="btn-icon" 
                      title="Supprimer" 
                      onClick={() => handleDeleteUser(user.id)}
                      disabled={user.username === 'admin'}
                    >
                      <Trash2 size={20} color="var(--primary-color)" />
                    </button>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </main>

      <style>{`
        .admin-page { padding-bottom: 50px; }
        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 40px 0;
          border-bottom: 1px solid #eee;
          margin-bottom: 30px;
        }
        .admin-header h1 { color: var(--secondary-color); font-weight: 800; margin: 0; }
        
        .admin-tabs { display: flex; gap: 10px; }
        .tab-btn {
          padding: 10px 20px;
          border-radius: 6px;
          border: 1px solid #ddd;
          background: white;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s;
        }
        .tab-btn.active {
          background: var(--secondary-color);
          color: white;
          border-color: var(--secondary-color);
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .section-header h2 { font-size: 1.5rem; color: var(--secondary-color); margin: 0; }

        .admin-section {
          background: var(--white);
          padding: 30px;
          border-radius: 8px;
          margin-bottom: 30px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        }
        .admin-form {
          display: grid;
          gap: 15px;
          margin-top: 20px;
        }
        .admin-form input, .admin-form textarea, .admin-form select {
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-family: inherit;
        }
        .form-actions { display: flex; gap: 10px; }

        .admin-tile-row {
          background: var(--white);
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 15px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        
        .user-info { display: flex; align-items: center; gap: 15px; }
        .user-avatar {
          width: 40px;
          height: 40px;
          background: #f0f0f0;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #666;
        }
        .role-badge {
          margin-left: 10px;
          font-size: 11px;
          text-transform: uppercase;
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: bold;
        }
        .role-badge.admin { background: #ffebeb; color: var(--primary-color); }
        .role-badge.finances { background: #e8f5e9; color: #2e7d32; }
        .role-badge.user { background: #e3f2fd; color: #1976d2; }

        .tile-info p { color: #666; font-size: 14px; margin: 5px 0 10px; }
        .tile-links-admin { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .admin-link-badge {
          background: var(--bg-color);
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .admin-link-badge button { background: none; display: flex; align-items: center; cursor: pointer; border: none; }
        .btn-add-link {
          background: none;
          color: var(--primary-color);
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
          border: none;
          cursor: pointer;
        }
        .btn-icon { background: none; padding: 10px; border-radius: 50%; transition: var(--transition); border: none; cursor: pointer; }
        .btn-icon:hover { background: rgba(0, 0, 0, 0.05); }
        .btn-icon:disabled { opacity: 0.3; cursor: not-allowed; }
      `}</style>
    </div>
  );
};

export default Admin;
