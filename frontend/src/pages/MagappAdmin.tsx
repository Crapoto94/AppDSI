import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ArrowLeft, Save, X, Globe, Type, AlignLeft, Image as ImageIcon, Hash, LayoutGrid, AlertTriangle, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import '../App.css';

interface Category {
  id: number;
  name: string;
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

const MagappAdmin: React.FC = () => {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingApp, setEditingApp] = useState<AppItem | null>(null);
  const [newApp, setNewApp] = useState<Partial<AppItem>>({
    name: '', 
    category_id: 1, 
    description: '', 
    url: '', 
    icon: 'https://magapp.ivry.local/img/default.png', 
    display_order: 0,
    is_maintenance: 0,
    maintenance_start: '',
    maintenance_end: ''
  });
  
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const fetchData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [appsRes, catsRes] = await Promise.all([
        fetch('/api/magapp/apps', { headers }),
        fetch('/api/magapp/categories', { headers })
      ]);
      
      if (appsRes.ok) setApps(await appsRes.json());
      if (catsRes.ok) setCategories(await catsRes.json());
    } catch (e) {
      console.error("Erreur de chargement", e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveApp = async (app: Partial<AppItem>, isEditing: boolean) => {
    const url = isEditing ? `/api/magapp/apps/${app.id}` : '/api/magapp/apps';
    const method = isEditing ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(app)
    });

    if (response.ok) {
      setEditingApp(null);
      setNewApp({ 
        name: '', 
        category_id: categories.length > 0 ? categories[0].id : 1, 
        description: '', 
        url: '', 
        icon: 'https://magapp.ivry.local/img/default.png', 
        display_order: 0,
        is_maintenance: 0,
        maintenance_start: '',
        maintenance_end: ''
      });
      fetchData();
    } else {
      alert("Erreur lors de l'enregistrement de l'application.");
    }
  };

  const handleDeleteApp = async (id: number) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette application ?")) return;
    const response = await fetch(`/api/magapp/apps/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      fetchData();
    }
  };

  return (
    <div className="admin-container">
      <Header />
      <main className="admin-main">
        <div className="admin-page-header">
          <button className="back-button" onClick={() => navigate('/admin')}>
            <ArrowLeft size={20} />
          </button>
          <div className="title-group">
            <h1>Catalogue MagApp</h1>
            <p>Gérez les applications visibles sur le portail public</p>
          </div>
        </div>

        <section className="admin-card creation-section">
          <div className="card-header">
            <Plus size={20} className="header-icon" />
            <h2>Nouvelle Application</h2>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label><Type size={14} /> Nom</label>
              <input type="text" placeholder="Ex: Outlook Web Access" value={newApp.name} onChange={e => setNewApp({...newApp, name: e.target.value})} />
            </div>
            <div className="form-group">
              <label><LayoutGrid size={14} /> Catégorie</label>
              <select value={newApp.category_id} onChange={e => setNewApp({...newApp, category_id: parseInt(e.target.value)})}>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label><Globe size={14} /> URL</label>
              <input type="text" placeholder="https://..." value={newApp.url} onChange={e => setNewApp({...newApp, url: e.target.value})} />
            </div>
            <div className="form-group full-width">
              <label><AlignLeft size={14} /> Description</label>
              <input type="text" placeholder="Description courte pour l'infobulle..." value={newApp.description} onChange={e => setNewApp({...newApp, description: e.target.value})} />
            </div>
            <div className="form-group">
              <label><ImageIcon size={14} /> URL Icône</label>
              <input type="text" placeholder="./img/..." value={newApp.icon} onChange={e => setNewApp({...newApp, icon: e.target.value})} />
            </div>
            <div className="form-group">
              <label><Hash size={14} /> Ordre</label>
              <input type="number" value={newApp.display_order} onChange={e => setNewApp({...newApp, display_order: parseInt(e.target.value)})} />
            </div>
            
            <div className="form-group maintenance-group">
              <label className="checkbox-label">
                <input type="checkbox" checked={newApp.is_maintenance === 1} onChange={e => setNewApp({...newApp, is_maintenance: e.target.checked ? 1 : 0})} /> 
                <AlertTriangle size={14} style={{ color: '#f59e0b' }} /> Mode Maintenance
              </label>
              {newApp.is_maintenance === 1 && (
                <div className="date-inputs">
                  <input type="date" value={newApp.maintenance_start || ''} onChange={e => setNewApp({...newApp, maintenance_start: e.target.value})} />
                  <span>au</span>
                  <input type="date" value={newApp.maintenance_end || ''} onChange={e => setNewApp({...newApp, maintenance_end: e.target.value})} />
                </div>
              )}
            </div>

            <div className="form-actions">
              <button className="submit-btn" onClick={() => handleSaveApp(newApp, false)} disabled={!newApp.name}>
                <Plus size={18} /> Ajouter au catalogue
              </button>
            </div>
          </div>
        </section>

        <section className="list-section">
          <div className="list-header">
            <h2>Applications configurées ({apps.length})</h2>
          </div>
          
          <div className="admin-apps-grid">
            {apps.map(app => (
              <div key={app.id} className={`app-admin-card ${editingApp?.id === app.id ? 'editing' : ''}`}>
                {editingApp?.id === app.id ? (
                  <div className="edit-form">
                    <div className="edit-row">
                      <input type="text" value={editingApp.name} onChange={e => setEditingApp({...editingApp, name: e.target.value})} placeholder="Nom" />
                      <select value={editingApp.category_id} onChange={e => setEditingApp({...editingApp, category_id: parseInt(e.target.value)})}>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <input type="text" value={editingApp.url} onChange={e => setEditingApp({...editingApp, url: e.target.value})} placeholder="URL" />
                    <input type="text" value={editingApp.icon} onChange={e => setEditingApp({...editingApp, icon: e.target.value})} placeholder="Icône" />
                    
                    <div className="edit-maintenance-row">
                      <label className="checkbox-label">
                        <input type="checkbox" checked={editingApp.is_maintenance === 1} onChange={e => setEditingApp({...editingApp, is_maintenance: e.target.checked ? 1 : 0})} /> Mode Maintenance
                      </label>
                      {editingApp.is_maintenance === 1 && (
                        <div className="maint-dates">
                          <input type="date" value={editingApp.maintenance_start || ''} onChange={e => setEditingApp({...editingApp, maintenance_start: e.target.value})} />
                          <span>au</span>
                          <input type="date" value={editingApp.maintenance_end || ''} onChange={e => setEditingApp({...editingApp, maintenance_end: e.target.value})} />
                        </div>
                      )}
                    </div>

                    <textarea value={editingApp.description} onChange={e => setEditingApp({...editingApp, description: e.target.value})} placeholder="Description" rows={2} />
                    <div className="edit-actions">
                      <button className="save-btn" onClick={() => handleSaveApp(editingApp, true)}><Save size={16} /> Enregistrer</button>
                      <button className="cancel-btn" onClick={() => setEditingApp(null)}><X size={16} /> Annuler</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={`app-card-side ${app.is_maintenance === 1 ? 'maintenance' : ''}`}></div>
                    <div className="app-card-content">
                      <div className="app-card-main">
                        <div className="app-card-icon">
                          <img src={app.icon} alt={app.name} onError={(e) => { (e.target as HTMLImageElement).src = 'https://magapp.ivry.local/img/default.png'; }} />
                        </div>
                        <div className="app-card-text">
                          <div className="app-card-title-row">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {app.name}
                              {app.is_maintenance === 1 && <AlertTriangle size={14} color="#f59e0b" title="En maintenance" />}
                            </h3>
                            <span className="category-tag">{categories.find(c => c.id === app.category_id)?.name}</span>
                          </div>
                          <p className="app-card-url">{app.url}</p>
                        </div>
                      </div>
                      <div className="app-card-footer">
                        <div className="footer-left">
                          {app.is_maintenance === 1 ? (
                            <span className="maint-status">
                              Maintenance du {app.maintenance_start ? new Date(app.maintenance_start).toLocaleDateString() : '?'} au {app.maintenance_end ? new Date(app.maintenance_end).toLocaleDateString() : '?'}
                            </span>
                          ) : (
                            <p className="app-card-desc">{app.description || "Aucune description"}</p>
                          )}
                        </div>
                        <div className="app-card-actions">
                          <button className="edit-btn" onClick={() => setEditingApp(app)} title="Modifier">
                            <Edit2 size={16} />
                          </button>
                          <button className="delete-btn" onClick={() => handleDeleteApp(app.id)} title="Supprimer">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>

      <style>{`
        .admin-container {
          min-height: 100vh;
          background-color: #f0f4f8;
          color: #1e293b;
        }

        .admin-main {
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 20px;
        }

        .admin-page-header {
          display: flex;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 40px;
        }

        .back-button {
          background: white;
          border: 1px solid #e2e8f0;
          padding: 10px;
          border-radius: 12px;
          cursor: pointer;
          color: #64748b;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }

        .back-button:hover {
          color: #0078a4;
          border-color: #0078a4;
          transform: translateX(-2px);
        }

        .title-group h1 {
          margin: 0;
          font-size: 2rem;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.025em;
        }

        .title-group p {
          margin: 4px 0 0 0;
          color: #64748b;
          font-size: 1rem;
        }

        .admin-card {
          background: white;
          border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1);
          padding: 24px;
          margin-bottom: 40px;
          border: 1px solid #e2e8f0;
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid #f1f5f9;
        }

        .header-icon {
          color: #0078a4;
          background: #f0f9ff;
          padding: 8px;
          border-radius: 8px;
          width: 36px;
          height: 36px;
        }

        .card-header h2 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
          color: #1e293b;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group.full-width {
          grid-column: span 3;
        }

        .form-group label {
          font-size: 0.875rem;
          font-weight: 600;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .form-group input, .form-group select {
          padding: 10px 14px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 0.95rem;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .form-group input:focus, .form-group select:focus {
          outline: none;
          border-color: #0078a4;
          box-shadow: 0 0 0 3px rgba(0, 120, 164, 0.1);
        }

        .maintenance-group {
          grid-column: span 3;
          background: #fffbeb;
          padding: 15px;
          border-radius: 12px;
          border: 1px solid #fef3c7;
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 30px;
        }

        .date-inputs {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .date-inputs input {
          padding: 6px 10px !important;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
        }

        .form-actions {
          grid-column: span 3;
          display: flex;
          justify-content: flex-end;
          margin-top: 10px;
        }

        .submit-btn {
          background: #0078a4;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background 0.2s;
        }

        .submit-btn:hover {
          background: #005a7c;
        }

        .submit-btn:disabled {
          background: #cbd5e1;
          cursor: not-allowed;
        }

        .list-header {
          margin-bottom: 24px;
        }

        .list-header h2 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1e293b;
        }

        .admin-apps-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
          gap: 20px;
        }

        .app-admin-card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          display: flex;
          position: relative;
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
          height: 120px;
        }

        .app-admin-card:hover {
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
        }

        .app-admin-card.editing {
          height: auto;
          min-height: 280px;
          border-color: #0078a4;
          box-shadow: 0 0 0 2px rgba(0, 120, 164, 0.1);
        }

        .app-card-side {
          width: 8px;
          background-color: #74b1c7;
          flex-shrink: 0;
        }

        .app-card-side.maintenance {
          background-color: #f59e0b;
        }

        .app-card-content {
          flex-grow: 1;
          display: flex;
          flex-direction: column;
          padding: 16px;
        }

        .app-card-main {
          display: flex;
          gap: 16px;
          align-items: center;
          margin-bottom: 12px;
        }

        .app-card-icon {
          width: 48px;
          height: 48px;
          flex-shrink: 0;
          background: #f8fafc;
          border-radius: 8px;
          padding: 4px;
          border: 1px solid #f1f5f9;
        }

        .app-card-icon img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .app-card-text {
          flex-grow: 1;
        }

        .app-card-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2px;
        }

        .app-card-title-row h3 {
          margin: 0;
          font-size: 1.1rem;
          color: #0078a4;
          font-weight: 600;
        }

        .category-tag {
          font-size: 0.7rem;
          background: #f1f5f9;
          color: #64748b;
          padding: 2px 8px;
          border-radius: 20px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .app-card-url {
          margin: 0;
          font-size: 0.8rem;
          color: #94a3b8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 300px;
        }

        .app-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: auto;
          border-top: 1px solid #f1f5f9;
          padding-top: 10px;
        }

        .footer-left {
          flex: 1;
        }

        .maint-status {
          font-size: 0.75rem;
          color: #92400e;
          font-weight: 700;
          background: #fef3c7;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .app-card-desc {
          margin: 0;
          font-size: 0.85rem;
          color: #64748b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 300px;
        }

        .app-card-actions {
          display: flex;
          gap: 8px;
        }

        .edit-btn, .delete-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          transition: background 0.2s;
        }

        .edit-btn { color: #0078a4; }
        .edit-btn:hover { background: #f0f9ff; }
        .delete-btn { color: #ef4444; }
        .delete-btn:hover { background: #fef2f2; }

        .edit-form {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
        }

        .edit-row {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 12px;
        }

        .edit-form input, .edit-form select, .edit-form textarea {
          padding: 8px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        .edit-maintenance-row {
          background: #fffbeb;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid #fef3c7;
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .maint-dates {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .edit-actions {
          display: flex;
          gap: 10px;
          margin-top: 10px;
        }

        .save-btn {
          background: #10b981;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .cancel-btn {
          background: #f1f5f9;
          color: #64748b;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        @media (max-width: 900px) {
          .form-grid { grid-template-columns: 1fr 1fr; }
          .form-group.full-width, .form-actions { grid-column: span 2; }
          .admin-apps-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};

export default MagappAdmin;
