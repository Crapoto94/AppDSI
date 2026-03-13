import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { User, LogOut, Info, X, LayoutDashboard, Wallet, Users, FileCheck, Settings, Phone, Plus, Trash2, CheckCircle2, Clock, AlertTriangle, Github, Loader2 } from 'lucide-react';
import axios from 'axios';

interface Todo {
  id: number;
  task: string;
  status: 'à faire' | 'en cours' | 'à tester' | 'ok';
  priority: number;
  created_at: string;
}

const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem('token');
  const [user, setUser] = useState<any>({});

  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr && userStr !== 'undefined') {
        setUser(JSON.parse(userStr));
      }
    } catch (e) {
      console.error("Error parsing user from localStorage", e);
    }
  }, []);
  const [changelog, setChangelog] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'whatsnew' | 'todo'>('whatsnew');
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState({ task: '', priority: 0 });
  const [isReleasing, setIsReleasing] = useState(false);
  const [, setWinLogin] = useState<string | null>(null);

  useEffect(() => {
    fetchChangelog();
    fetchTodos();

    // Récupération automatique du login Windows
    fetch('/api/auth/ntlm', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.login) setWinLogin(data.login);
      })
      .catch(err => console.error("NTLM detection failed:", err));
  }, []);

  const fetchChangelog = async () => {
    try {
      const res = await axios.get('/api/changelog');
      setChangelog(res.data);
    } catch (err) {
      console.error("Error fetching changelog:", err);
    }
  };

  const fetchTodos = async () => {
    if (!token) return;
    try {
      const res = await axios.get('/api/todos', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTodos(res.data);
    } catch (err) {
      console.error("Error fetching todos:", err);
    }
  };

  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.task.trim()) return;
    try {
      await axios.post('/api/todos', newTodo, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNewTodo({ task: '', priority: 0 });
      fetchTodos();
    } catch (err) {
      alert("Erreur lors de l'ajout du todo");
    }
  };

  const handleUpdateTodo = async (id: number, updates: Partial<Todo>) => {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    try {
      await axios.put(`/api/todos/${id}`, { ...todo, ...updates }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchTodos();
    } catch (err) {
      alert("Erreur lors de la mise à jour");
    }
  };

  const handleDeleteTodo = async (id: number) => {
    if (!window.confirm("Supprimer cette tâche ?")) return;
    try {
      await axios.delete(`/api/todos/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchTodos();
    } catch (err) {
      alert("Erreur lors de la suppression");
    }
  };

  const handleRelease = async () => {
    const okCount = todos.filter(t => t.status === 'ok').length;
    if (okCount === 0) {
      alert("Aucune tâche n'est marquée comme 'ok'. Impossible de générer une release.");
      return;
    }

    if (!window.confirm(`Générer la version ${getNextVersion()} avec les ${okCount} tâches terminées et commiter sur GitHub ?`)) return;

    setIsReleasing(true);
    try {
      const res = await axios.post('/api/release', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(res.data.message);
      fetchChangelog();
      fetchTodos();
      setActiveTab('whatsnew');
    } catch (err: any) {
      alert("Erreur release : " + (err.response?.data?.message || err.message));
    } finally {
      setIsReleasing(false);
    }
  };

  const getNextVersion = () => {
    if (!changelog) return "";
    const parts = changelog.currentVersion.split('.');
    parts[parts.length - 1] = parseInt(parts[parts.length - 1]) + 1;
    return parts.join('.');
  };

  const getStatusIcon = (status: Todo['status']) => {
    switch (status) {
      case 'à faire': return <Clock size={16} className="status-todo" />;
      case 'en cours': return <AlertTriangle size={16} className="status-doing" />;
      case 'à tester': return <Loader2 size={16} className="status-test" />;
      case 'ok': return <CheckCircle2 size={16} className="status-done" />;
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.setItem('manualLogout', 'true');
    navigate('/login');
  };

  const navItems = [
    { path: '/', label: 'Tableau de bord', icon: <LayoutDashboard size={18} /> },
    { path: '/budget', label: 'Budget', icon: <Wallet size={18} /> },
    { path: '/tiers', label: 'Tiers', icon: <Users size={18} /> },
    { path: '/telecom', label: 'Télécom', icon: <Phone size={18} /> },
    { path: '/certif', label: 'Certificats', icon: <FileCheck size={18} /> },
  ];

  return (
    <header className="main-header">
      <div className="container header-content">
        <div className="logo-section">
          <Link to="/" className="logo">
            <span className="logo-ivry">ivry</span>
            <span className="logo-sur-seine">sur-seine</span>
            <span className="logo-dsi"> - Hub DSI</span>
          </Link>
          {changelog && (
            <button className="version-badge" onClick={() => setShowModal(true)} title="Voir les nouveautés">
              v{changelog.currentVersion} <Info size={14} style={{ marginLeft: '4px' }} />
            </button>
          )}
        </div>

        {token && (
          <nav className="main-nav">
            {navItems.map((item) => (
              <Link 
                key={item.path} 
                to={item.path} 
                className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        )}

        <nav className="header-nav">
          {token ? (
            <div className="user-menu">
              <Link to="/profile" className="user-info-link" title="Mon Profil">
                <span className="user-name">
                  {user.username} {user.service_code && <span className="service-badge-header">{user.service_code}</span>}
                </span>
                <User size={18} />
              </Link>
              {user.role === 'admin' && (
                <Link to="/admin" className={`admin-link ${location.pathname.startsWith('/admin') ? 'active' : ''}`} title="Administration">
                  <Settings size={20} />
                </Link>
              )}
              <button onClick={handleLogout} className="btn-logout" title="Déconnexion">
                <LogOut size={20} />
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn btn-primary btn-espace">
              <User size={18} style={{ marginRight: '8px' }} />
              Mon espace
            </Link>
          )}
        </nav>
      </div>

      {showModal && changelog && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-tabs">
                <button 
                  className={`modal-tab-btn ${activeTab === 'whatsnew' ? 'active' : ''}`}
                  onClick={() => setActiveTab('whatsnew')}
                >
                  What's New ?
                </button>
                <button 
                  className={`modal-tab-btn ${activeTab === 'todo' ? 'active' : ''}`}
                  onClick={() => setActiveTab('todo')}
                >
                  Backlog {todos.length > 0 && <span className="todo-count">{todos.length}</span>}
                </button>
              </div>
              <button className="close-btn" onClick={() => setShowModal(false)}><X size={24} /></button>
            </div>
            
            <div className="modal-body">
              {activeTab === 'whatsnew' ? (
                <div className="whatsnew-view">
                  {changelog.history.map((release: any, idx: number) => (
                    <div key={idx} className="release-block">
                      <div className="release-header">
                        <h3>Version {release.version}</h3>
                        <span className="release-date">{release.date}</span>
                      </div>
                      <ul className="release-changes">
                        {release.changes.map((change: string, cIdx: number) => (
                          <li key={cIdx}>{change}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="todo-view">
                  <form className="todo-add-form" onSubmit={handleAddTodo}>
                    <input 
                      type="text" 
                      placeholder="Nouvelle fonctionnalité ou bug..." 
                      value={newTodo.task}
                      onChange={e => setNewTodo({...newTodo, task: e.target.value})}
                      required
                    />
                    <select 
                      value={newTodo.priority} 
                      onChange={e => setNewTodo({...newTodo, priority: parseInt(e.target.value)})}
                      className="priority-select"
                    >
                      <option value="0">Normal</option>
                      <option value="1">Important</option>
                      <option value="2">Urgent</option>
                    </select>
                    <button type="submit" className="btn-add-todo"><Plus size={18} /></button>
                  </form>

                  <div className="todo-list">
                    {todos.map(todo => (
                      <div key={todo.id} className={`todo-item prio-${todo.priority}`}>
                        <div className="todo-main">
                          <button 
                            className={`todo-status-btn status-${todo.status.replace(' ', '-')}`}
                            onClick={() => {
                              const states: Todo['status'][] = ['à faire', 'en cours', 'à tester', 'ok'];
                              const nextIdx = (states.indexOf(todo.status) + 1) % states.length;
                              handleUpdateTodo(todo.id, { status: states[nextIdx] });
                            }}
                            title="Changer le statut"
                          >
                            {getStatusIcon(todo.status)}
                          </button>
                          <span className="todo-task">{todo.task}</span>
                        </div>
                        <div className="todo-actions">
                          <select 
                            value={todo.priority} 
                            onChange={e => handleUpdateTodo(todo.id, { priority: parseInt(e.target.value) })}
                            className="todo-prio-select"
                          >
                            <option value="0">Normal</option>
                            <option value="1">Haut</option>
                            <option value="2">Urgent</option>
                          </select>
                          <button 
                            className="btn-delete-todo"
                            onClick={() => handleDeleteTodo(todo.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {todos.length === 0 && <p className="empty-todo">Aucune tâche prévue. Tout est prêt !</p>}
                  </div>

                  {user.role === 'admin' && todos.some(t => t.status === 'ok') && (
                    <div className="release-action-footer">
                      <button 
                        className="btn-release" 
                        onClick={handleRelease}
                        disabled={isReleasing}
                      >
                        {isReleasing ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            Génération de la version...
                          </>
                        ) : (
                          <>
                            <Github size={18} />
                            Déployer Release {getNextVersion()}
                          </>
                        )}
                      </button>
                      <p className="release-hint">
                        Documente les tâches marquées <span className="status-ok-text">ok</span> et commit sur GitHub.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .main-header {
          height: var(--header-height);
          background-color: var(--white);
          box-shadow: 0 2px 10px rgba(0,0,0,0.08);
          display: flex;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 1000;
          padding: 0 20px;
        }
        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          max-width: 1600px;
          margin: 0 auto;
        }
        .logo-section {
          display: flex;
          align-items: center;
          gap: 15px;
          flex-shrink: 0;
        }
        .logo {
          display: flex;
          align-items: baseline;
          font-size: 24px;
          text-decoration: none;
        }
        .logo-ivry {
          color: var(--primary-color);
          font-weight: 800;
          text-transform: lowercase;
        }
        .logo-sur-seine {
          color: var(--text-color);
          font-weight: 300;
          margin-left: 2px;
          font-size: 16px;
        }
        .logo-dsi {
          color: var(--secondary-color);
          font-weight: 600;
          margin-left: 8px;
          font-size: 14px;
          opacity: 0.7;
        }
        .version-badge {
          background-color: #f1f5f9;
          color: #64748b;
          border: 1px solid #e2e8f0;
          padding: 3px 8px;
          border-radius: 50px;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .version-badge:hover {
          background-color: var(--primary-color);
          color: white;
          border-color: var(--primary-color);
        }

        .main-nav {
          display: flex;
          align-items: center;
          gap: 5px;
          background: #f8fafc;
          padding: 4px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }
        .nav-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          text-decoration: none;
          color: #64748b;
          font-size: 14px;
          font-weight: 600;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .nav-item:hover {
          background: #f1f5f9;
          color: var(--secondary-color);
        }
        .nav-item.active {
          background: white;
          color: var(--primary-color);
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
          border: 1px solid #e2e8f0;
        }
        .nav-item svg {
          opacity: 0.7;
        }
        .nav-item.active svg {
          opacity: 1;
          color: var(--primary-color);
        }

        .header-nav {
          flex-shrink: 0;
        }
        .user-menu {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .user-info-link {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: var(--text-color);
          transition: var(--transition);
          padding: 6px 12px;
          border-radius: 8px;
        }
        .user-info-link:hover {
          background: #f8fafc;
          color: var(--primary-color);
        }
        .user-name {
          font-weight: 700;
          font-size: 14px;
        }
        .service-badge-header {
          background: var(--primary-color);
          color: white;
          padding: 1px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 800;
          margin-left: 4px;
        }
        .admin-link {
          color: #64748b;
          display: flex;
          align-items: center;
          padding: 8px;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .admin-link:hover, .admin-link.active {
          background: #f1f5f9;
          color: var(--secondary-color);
        }
        .btn-logout {
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 8px;
          border-radius: 8px;
          transition: all 0.2s;
          display: flex;
          align-items: center;
        }
        .btn-logout:hover {
          background: #fff1f2;
          color: #e11d48;
        }
        .btn-espace {
          display: flex;
          align-items: center;
          padding: 8px 20px;
          border-radius: 50px;
          font-size: 14px;
          font-weight: 700;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 2000;
        }
        .modal-content {
          background: white;
          width: 90%;
          max-width: 600px;
          border-radius: 16px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .modal-header {
          padding: 16px 24px;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-title-tabs {
          display: flex;
          gap: 15px;
        }
        .modal-tab-btn {
          background: none;
          border: none;
          font-size: 18px;
          font-weight: 800;
          color: #94a3b8;
          cursor: pointer;
          padding: 8px 0;
          position: relative;
        }
        .modal-tab-btn.active {
          color: var(--secondary-color);
        }
        .modal-tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: -8px; left: 0; right: 0;
          height: 3px;
          background: var(--primary-color);
          border-radius: 50px;
        }
        .todo-count {
          background: var(--primary-color);
          color: white;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 50px;
          vertical-align: middle;
          margin-left: 5px;
        }

        .close-btn {
          background: #f8fafc;
          border: none;
          cursor: pointer;
          color: #64748b;
          padding: 8px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .close-btn:hover {
          background: #f1f5f9;
          color: var(--primary-color);
        }
        .modal-body {
          padding: 24px;
          overflow-y: auto;
        }
        .release-block {
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 1px solid #f1f5f9;
        }
        .release-block:last-child {
          border-bottom: none;
          margin-bottom: 0;
          padding-bottom: 0;
        }
        .release-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 12px;
        }
        .release-header h3 {
          margin: 0;
          color: var(--primary-color);
          font-size: 18px;
          font-weight: 800;
        }
        .release-date {
          font-size: 13px;
          color: #94a3b8;
          font-weight: 600;
        }
        .release-changes {
          margin: 0;
          padding-left: 20px;
          color: #475569;
          font-size: 14px;
          line-height: 1.7;
        }

        /* Todo View */
        .todo-add-form {
          display: flex;
          gap: 10px;
          margin-bottom: 24px;
        }
        .todo-add-form input {
          flex: 1;
          padding: 10px 16px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          font-size: 14px;
          outline: none;
        }
        .todo-add-form input:focus {
          border-color: var(--primary-color);
        }
        .priority-select {
          padding: 0 10px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          font-size: 13px;
          color: #64748b;
          outline: none;
        }
        .btn-add-todo {
          background: var(--primary-color);
          color: white;
          border: none;
          padding: 10px;
          border-radius: 10px;
          cursor: pointer;
        }

        .todo-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .todo-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: #f8fafc;
          border-radius: 12px;
          border-left: 4px solid #cbd5e1;
        }
        .todo-item.prio-1 { border-left-color: #f59e0b; }
        .todo-item.prio-2 { border-left-color: #ef4444; }

        .todo-main {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
        }
        .todo-task {
          font-size: 14px;
          font-weight: 600;
          color: #334155;
        }
        .todo-status-btn {
          background: white;
          border: 1px solid #e2e8f0;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .todo-status-btn:hover {
          border-color: var(--primary-color);
          transform: scale(1.05);
        }
        .status-todo { color: #94a3b8; }
        .status-doing { color: #3b82f6; }
        .status-test { color: #a855f7; }
        .status-done { color: #22c55e; }
        .todo-status-btn.status-ok { background: #f0fdf4; border-color: #22c55e; }

        .todo-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .todo-prio-select {
          font-size: 12px;
          border: none;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
        }
        .btn-delete-todo {
          background: none;
          border: none;
          color: #cbd5e1;
          cursor: pointer;
          padding: 4px;
        }
        .btn-delete-todo:hover { color: #ef4444; }

        .release-action-footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 2px dashed #f1f5f9;
          text-align: center;
        }
        .btn-release {
          background: var(--secondary-color);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 50px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          cursor: pointer;
          width: 100%;
          transition: all 0.2s;
        }
        .btn-release:hover:not(:disabled) {
          background: var(--primary-color);
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
        }
        .btn-release:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .release-hint {
          font-size: 12px;
          color: #94a3b8;
          margin-top: 10px;
        }
        .status-ok-text {
          color: #22c55e;
          font-weight: 700;
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .empty-todo {
          text-align: center;
          padding: 30px;
          color: #94a3b8;
          font-style: italic;
        }
      `}</style>
    </header>
  );
};

export default Header;



