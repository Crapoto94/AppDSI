import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { User, LogOut, Info, X, Settings, Plus, Trash2, CheckCircle2, Clock, AlertTriangle, Github, Loader2, LayoutGrid, HelpCircle } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { isAdminLike } from '../utils/roles';
import axios from 'axios';

interface Todo {
  id: number;
  task: string;
  status: 'à faire' | 'en cours' | 'à tester' | 'ok';
  priority: number;
  created_at: string;
}

interface BacklogItem {
  id: number;
  title: string;
  description: string;
  category: string;
  status: string;
  created_by: string;
  created_at: string;
  attachments?: Array<{
    filename: string;
    path: string;
    size: number;
  }>;
}

interface TileData {
  id: number;
  title: string;
  icon: string;
  description: string;
  sort_order: number;
  status: string;
  is_authorized: boolean;
  is_public: boolean;
  links: { label: string; url: string; is_internal: boolean }[];
}

interface HeaderProps {
}

const Header: React.FC<HeaderProps> = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  if (searchParams.get('nomenu') !== null) {
    return null;
  }
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
  const [activeTab, setActiveTab] = useState<'whatsnew' | 'backlog'>('whatsnew');
  const [todos, setTodos] = useState<Todo[]>([]);
  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([]);
  const [newTodo, setNewTodo] = useState({ task: '', priority: 0 });
  const [isReleasing, setIsReleasing] = useState(false);
  const [showNavDropdown, setShowNavDropdown] = useState(false);
  const [showAdminDropdown, setShowAdminDropdown] = useState(false);
  const [navTiles, setNavTiles] = useState<TileData[]>([]);
  const navDropdownRef = useRef<HTMLDivElement>(null);
  const adminDropdownRef = useRef<HTMLDivElement>(null);
  const [helpData, setHelpData] = useState<{ page_path: string; content_html: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const path = location.pathname;
    if (!path || path === '/') { setHelpData(null); return; }
    // Essaie le chemin exact, puis le préfixe de 1er niveau (ex : /tickets/123 → /tickets)
    const candidates = [path];
    const seg = '/' + (path.split('/').filter(Boolean)[0] || '');
    if (seg !== path && seg !== '/') candidates.push(seg);
    let cancelled = false;
    (async () => {
      for (const p of candidates) {
        try {
          const r = await axios.get(`/api/page-help/${encodeURIComponent(p)}`);
          if (!cancelled && r.data && r.data.content_html) { setHelpData(r.data); return; }
        } catch { /* ignore */ }
      }
      if (!cancelled) setHelpData(null);
    })();
    return () => { cancelled = true; };
  }, [location.pathname]);

  useEffect(() => {
    fetchChangelog();
    fetchTodos();
    if (token) {
      fetchBacklog();
      fetchNavTiles();
    }
  }, [token]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navDropdownRef.current && !navDropdownRef.current.contains(e.target as Node)) {
        setShowNavDropdown(false);
      }
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(e.target as Node)) {
        setShowAdminDropdown(false);
      }
    };
    if (showNavDropdown || showAdminDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNavDropdown, showAdminDropdown]);

  const getTileIcon = (iconName: string, size = 18) => {
    const name = iconName ? iconName.charAt(0).toUpperCase() + iconName.slice(1) : 'Box';
    // @ts-expect-error dynamic lucide icon
    const Icon = LucideIcons[name] || LucideIcons.Box;
    return <Icon size={size} />;
  };

  const fetchNavTiles = async () => {
    if (!token) return;
    try {
      const res = await axios.get('/api/tiles', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNavTiles((res.data || []).filter((t: TileData) => t.is_authorized && t.status === 'active'));
    } catch (err) {
      console.error("Error fetching nav tiles:", err);
    }
  };

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

  const fetchBacklog = async () => {
    if (!token) return;
    try {
      const res = await axios.get('/api/backlog', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBacklogItems(res.data);
    } catch (err) {
      console.error("Error fetching backlog:", err);
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


  return (
    <header className="main-header">
      <div className="container header-content">
        <div className="logo-section">
          <Link to="/" className="logo">
            <img src="/dsi_hub.gif" alt="DSI Hub" className="logo-icon" />
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


        <nav className="header-nav">
          {token ? (
            <div className="user-menu">
              <Link to="/profile" className="user-info-link" title="Mon Profil">
                <span className="user-name">
                  {user.displayName || user.username}
                  {user.service_code && <span className="service-badge-header">{user.service_code}</span>}
                  {user.role === 'superadmin' && <span style={{ marginLeft: '4px', fontSize: '10px', fontWeight: '700', padding: '1px 5px', borderRadius: '3px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', verticalAlign: 'middle' }}>SUPERADMIN</span>}
                  {user.role === 'admin' && <span style={{ marginLeft: '4px', fontSize: '10px', fontWeight: '700', padding: '1px 5px', borderRadius: '3px', background: '#fef3c7', color: '#d97706', border: '1px solid #fcd34d', verticalAlign: 'middle' }}>ADMIN</span>}
                </span>
                <User size={18} />
              </Link>
              {/* Navigation rapide */}
              <div ref={navDropdownRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowNavDropdown(v => !v)}
                  className={`nav-grid-btn ${showNavDropdown ? 'active' : ''}`}
                  title="Accès rapide aux modules"
                >
                  <LayoutGrid size={20} />
                </button>
                {showNavDropdown && navTiles.length > 0 && (
                  <div className="nav-dropdown">
                    <div className="nav-dropdown-header">Modules</div>
                    <div className="nav-dropdown-list">
                      {navTiles.map(tile => {
                        const internalLinks = tile.links.filter(l => l.is_internal);
                        if (internalLinks.length === 0) return null;
                        const isActive = internalLinks.some(l => location.pathname.startsWith(l.url));

                        if (internalLinks.length === 1) {
                          return (
                            <Link
                              key={tile.id}
                              to={internalLinks[0].url}
                              className={`nav-tile-item ${isActive ? 'active' : ''}`}
                              onClick={() => setShowNavDropdown(false)}
                            >
                              <span className="nav-tile-icon">{getTileIcon(tile.icon)}</span>
                              <span className="nav-tile-title">{tile.title}</span>
                            </Link>
                          );
                        }

                        return (
                          <div key={tile.id} className={`nav-tile-group ${isActive ? 'group-active' : ''}`}>
                            <div className="nav-tile-group-header">
                              <span className="nav-tile-icon">{getTileIcon(tile.icon)}</span>
                              <span className="nav-tile-title">{tile.title}</span>
                            </div>
                            {internalLinks.map((link, idx) => (
                              <Link
                                key={idx}
                                to={link.url}
                                className={`nav-tile-subitem ${location.pathname.startsWith(link.url) ? 'active' : ''}`}
                                onClick={() => setShowNavDropdown(false)}
                              >
                                {link.label}
                              </Link>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {isAdminLike(user) && (
                <div ref={adminDropdownRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowAdminDropdown(v => !v)}
                    className={`admin-link ${location.pathname.startsWith('/admin') ? 'active' : ''}`}
                    title="Administration"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '8px', borderRadius: 8, color: location.pathname.startsWith('/admin') ? 'var(--secondary-color)' : '#64748b' }}
                  >
                    <Settings size={20} />
                  </button>
                  {showAdminDropdown && (
                    <div className="nav-dropdown" style={{ right: 0, left: 'auto', minWidth: 200 }}>
                      <div className="nav-dropdown-header">Administration</div>
                      <div className="nav-dropdown-list">
                        <Link to="/admin" className="nav-tile-item" onClick={() => setShowAdminDropdown(false)}>
                          🏠 Accueil
                        </Link>
                        <Link to="/admin/hub" className="nav-tile-item" onClick={() => setShowAdminDropdown(false)}>
                          ⚙️ Hub
                        </Link>
                        <Link to="/admin/users" className="nav-tile-item" onClick={() => setShowAdminDropdown(false)}>
                          👥 Utilisateurs
                        </Link>
                        <Link to="/admin/tickets" className="nav-tile-item" onClick={() => setShowAdminDropdown(false)}>
                          🎫 Tickets
                        </Link>
                        <Link to="/admin/glpi" className="nav-tile-item" onClick={() => setShowAdminDropdown(false)}>
                          🔄 GLPI
                        </Link>
                        <Link to="/parc" className="nav-tile-item" onClick={() => setShowAdminDropdown(false)}>
                          🖥️ Parc informatique
                        </Link>
                        <Link to="/admin/param-ville" className="nav-tile-item" onClick={() => setShowAdminDropdown(false)}>
                          🏛️ Param Ville
                        </Link>
                        <Link to="/admin/organisation" className="nav-tile-item" onClick={() => setShowAdminDropdown(false)}>
                          🏢 Organisation
                        </Link>
                        <Link to="/admin/mail" className="nav-tile-item" onClick={() => setShowAdminDropdown(false)}>
                          📧 Mail
                        </Link>
                        <Link to="/admin/sql" className="nav-tile-item" onClick={() => setShowAdminDropdown(false)}>
                          🗄️ SQL
                        </Link>
                        <Link to="/admin/settings" className="nav-tile-item" onClick={() => setShowAdminDropdown(false)}>
                          🔧 Paramètres
                        </Link>
                        <Link to="/admin/ged" className="nav-tile-item" onClick={() => setShowAdminDropdown(false)}>
                          📄 GED
                        </Link>
                        <Link to="/admin/inventaire" className="nav-tile-item" onClick={() => setShowAdminDropdown(false)}>
                          📦 Inventaire
                        </Link>
                        <Link to="/admin/security" className="nav-tile-item" onClick={() => setShowAdminDropdown(false)}>
                          🔒 Sécurité
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {helpData && (
                <button onClick={() => setShowHelp(true)}
                  title="Aide sur cette page"
                  className="help-pulse"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #2563eb, #4f46e5)', color: '#fff', fontWeight: 700, fontSize: 13,
                    boxShadow: '0 4px 14px -4px rgba(37,99,235,0.55)' }}>
                  <HelpCircle size={18} /> Aide
                </button>
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
                  className={`modal-tab-btn ${activeTab === 'backlog' ? 'active' : ''}`}
                  onClick={() => setActiveTab('backlog')}
                >
                  Backlog
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
                      <div className="release-changes">
                        {release.release_notes_md && (
                          <div style={{
                            marginBottom: '16px',
                            padding: '16px',
                            background: '#f8fafc',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            color: '#334155',
                            lineHeight: 1.7,
                            fontSize: '0.9rem'
                          }} dangerouslySetInnerHTML={{ __html: release.release_notes_md }} />
                        )}
                        {release.changes.map((change: string, cIdx: number) => {
                          // Check if this is a category header (### Type)
                          const categoryMatch = change.match(/^###\s+(.+)$/);
                          if (categoryMatch) {
                            const category = categoryMatch[1];
                            const categoryColors: Record<string, { bg: string; text: string; icon: string }> = {
                              'Bug': { bg: '#fee2e2', text: '#991b1b', icon: '🐛' },
                              'Amélioration': { bg: '#dbeafe', text: '#1e40af', icon: '⬆️' },
                              'Nouvelle fonctionnalité': { bg: '#e9d5ff', text: '#5b21b6', icon: '✨' },
                              'Graphisme': { bg: '#fed7aa', text: '#92400e', icon: '🎨' },
                              'Autre': { bg: '#f3f4f6', text: '#374151', icon: '📝' }
                            };
                            const colors = categoryColors[category] || categoryColors['Autre'];
                            return (
                              <div key={cIdx} style={{
                                marginTop: cIdx > 0 ? '16px' : '0',
                                marginBottom: '8px',
                                paddingBottom: '8px',
                                borderBottom: `2px solid ${colors.bg}`,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                color: colors.text,
                                fontWeight: '700',
                                fontSize: '0.9rem'
                              }}>
                                <span>{colors.icon}</span>
                                <span>{category}</span>
                              </div>
                            );
                          }
                          // Check if this is HTML content (description from WYSIWYG)
                          const isHtml = /<[a-z][\s\S]*>/i.test(change);
                          if (isHtml) {
                            return (
                              <div key={cIdx} style={{
                                marginBottom: '12px',
                                color: '#64748b',
                                lineHeight: 1.6
                              }} dangerouslySetInnerHTML={{ __html: change }} />
                            );
                          }
                          // Regular item with bullet
                          return (
                            <div key={cIdx} style={{
                              marginBottom: '8px',
                              paddingLeft: '16px',
                              display: 'flex',
                              gap: '8px'
                            }}>
                              <span style={{ color: '#cbd5e1', marginLeft: '-12px' }}>•</span>
                              <span style={{ color: '#64748b', lineHeight: 1.5 }}>{change}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="backlog-view">
                  <div className="backlog-toolbar">
                    <button
                      className="btn-submit-backlog"
                      onClick={() => {
                        setShowModal(false);
                        navigate('/request-feature');
                      }}
                    >
                      <Plus size={18} />
                      Soumettre une demande
                    </button>
                  </div>
                  <div className="backlog-list">
                    {backlogItems.length === 0 ? (
                      <p className="empty-backlog">Aucune demande pour le moment</p>
                    ) : (
                      (() => {
                        const statusOrder = { 'open': 0, 'in_progress': 1, 'discussion': 2, 'accepted': 3, 'rejected': 4, 'completed': 5 };
                        const statusLabels = { 'open': 'En attente', 'in_progress': 'En cours', 'discussion': 'En discussion', 'accepted': 'Acceptée', 'rejected': 'Rejetée', 'completed': 'Complétée' };
                        const statusColors = { 'open': '#f59e0b', 'in_progress': '#3b82f6', 'discussion': '#8b5cf6', 'accepted': '#10b981', 'rejected': '#ef4444', 'completed': '#64748b' };

                        const sorted = [...backlogItems].sort((a, b) =>
                          (statusOrder[a.status as keyof typeof statusOrder] || 5) - (statusOrder[b.status as keyof typeof statusOrder] || 5)
                        );

                        const grouped: Record<string, BacklogItem[]> = {};
                        sorted.forEach(item => {
                          if (!grouped[item.status]) grouped[item.status] = [];
                          grouped[item.status].push(item);
                        });

                        return Object.entries(grouped).map(([status, items]) => (
                          <div key={status} style={{ marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: '700', color: statusColors[status as keyof typeof statusColors], textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px 0', paddingBottom: '8px', borderBottom: `2px solid ${statusColors[status as keyof typeof statusColors]}` }}>
                              {statusLabels[status as keyof typeof statusLabels]}
                            </h3>
                            {items.map(item => (
                              <div
                                key={item.id}
                                className="backlog-item"
                                style={{ backgroundColor: user?.username === item.created_by ? '#fef3c7' : '#f8fafc' }}
                              >
                                <div className="backlog-header">
                                  <h4 className="backlog-title">{item.title}</h4>
                                  <span className={`backlog-category cat-${item.category.toLowerCase().replace(' ', '-')}`}>
                                    {item.category}
                                  </span>
                                </div>
                                {item.description && (
                                  <p className="backlog-description">{item.description.substring(0, 100)}...</p>
                                )}
                                <div className="backlog-meta">
                                  <span className="backlog-status">{item.status}</span>
                                  <span className="backlog-author">par {item.created_by}{user?.username === item.created_by && ' (vous)'}</span>
                                  <span className="backlog-date">
                                    {new Date(item.created_at).toLocaleDateString('fr-FR')}
                                  </span>
                                </div>
                                {item.attachments && item.attachments.length > 0 && (
                                  <div className="backlog-attachments">
                                    {item.attachments.map((file, idx) => (
                                      <a
                                        key={idx}
                                        href={`/uploads/backlog_attachments/${file.path}`}
                                        download={file.filename}
                                        className="backlog-file-link"
                                      >
                                        📎 {file.filename}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ));
                      })()
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showHelp && helpData && (
        <div className="modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
            <div className="modal-header">
              <div style={{ fontWeight: 800, fontSize: 16, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                <HelpCircle size={20} /> Aide
              </div>
              <button className="close-btn" onClick={() => setShowHelp(false)}><X size={24} /></button>
            </div>
            <div className="modal-body">
              <div className="help-md" dangerouslySetInnerHTML={{ __html: helpData.content_html || '' }} />
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* ── Rendu du Markdown d'aide ── */
        .help-md { font-size: 14.5px; color: #334155; line-height: 1.7; }
        .help-md > *:first-child { margin-top: 0; }
        .help-md h1 { font-size: 1.5rem; font-weight: 800; color: #0f172a; margin: 0 0 6px; }
        .help-md h2 { font-size: 1.18rem; font-weight: 800; color: #1e293b; margin: 26px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #eef2f7; }
        .help-md h3 { font-size: 1.02rem; font-weight: 700; color: #334155; margin: 18px 0 6px; }
        .help-md p { margin: 8px 0; }
        .help-md ul, .help-md ol { margin: 8px 0; padding-left: 22px; }
        .help-md li { margin: 4px 0; }
        .help-md li > ul { margin: 4px 0; }
        .help-md a { color: #2563eb; text-decoration: none; }
        .help-md a:hover { text-decoration: underline; }
        .help-md hr { border: none; border-top: 1px solid #e2e8f0; margin: 22px 0; }
        .help-md code { background: #f1f5f9; color: #be123c; padding: 1px 6px; border-radius: 5px;
          font-family: "SFMono-Regular", Consolas, Menlo, monospace; font-size: 0.85em; }
        .help-md pre { background: #0f172a; color: #e2e8f0; padding: 14px 16px; border-radius: 10px; overflow: auto; font-size: 13px; line-height: 1.5; }
        .help-md pre code { background: none; color: inherit; padding: 0; }
        .help-md blockquote { margin: 12px 0; padding: 8px 14px; border-left: 4px solid #93c5fd; background: #eff6ff; color: #1e3a8a; border-radius: 0 8px 8px 0; }
        .help-md blockquote p { margin: 4px 0; }
        .help-md table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13.5px;
          border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
        .help-md th, .help-md td { border: 1px solid #e9eef5; padding: 9px 12px; text-align: left; vertical-align: top; }
        .help-md th { background: #f1f5f9; color: #334155; font-weight: 700; }
        .help-md tbody tr:nth-child(even) { background: #f8fafc; }
        .help-md strong { color: #0f172a; }

        .help-pulse { animation: helpPulse 2.4s ease-in-out infinite; }
        .help-pulse:hover { filter: brightness(1.08); animation: none; }
        @keyframes helpPulse {
          0%, 100% { box-shadow: 0 4px 14px -4px rgba(37,99,235,0.55); }
          50% { box-shadow: 0 0 0 5px rgba(37,99,235,0.18); }
        }
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
          align-items: center;
          font-size: 24px;
          text-decoration: none;
          gap: 8px;
        }
        .logo-icon {
          width: 48px;
          height: 48px;
          object-fit: contain;
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
        .nav-grid-btn {
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
        .nav-grid-btn:hover, .nav-grid-btn.active {
          background: #f1f5f9;
          color: var(--primary-color);
        }
        .nav-dropdown {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.12);
          min-width: 240px;
          max-width: 300px;
          z-index: 3000;
          overflow: hidden;
          animation: navDropIn 0.15s ease;
        }
        @keyframes navDropIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .nav-dropdown-header {
          padding: 10px 16px 8px;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: #94a3b8;
          border-bottom: 1px solid #f1f5f9;
        }
        .nav-dropdown-list {
          padding: 6px;
          max-height: 70vh;
          overflow-y: auto;
        }
        .nav-tile-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          border-radius: 8px;
          text-decoration: none;
          color: #334155;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.15s;
        }
        .nav-tile-item:hover {
          background: #f8fafc;
          color: var(--primary-color);
        }
        .nav-tile-item.active {
          background: #eff6ff;
          color: var(--primary-color);
        }
        .nav-tile-item.active::before {
          content: '';
          display: block;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--primary-color);
          flex-shrink: 0;
        }
        .nav-tile-icon {
          width: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #64748b;
        }
        .nav-tile-item.active .nav-tile-icon,
        .nav-tile-item:hover .nav-tile-icon {
          color: var(--primary-color);
        }
        .nav-tile-group.group-active .nav-tile-icon {
          color: var(--primary-color);
        }
        .nav-tile-title {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .nav-tile-group {
          margin-bottom: 2px;
        }
        .nav-tile-group.group-active .nav-tile-group-header {
          color: var(--primary-color);
        }
        .nav-tile-group-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px 4px;
          font-size: 13px;
          font-weight: 700;
          color: #475569;
        }
        .nav-tile-subitem {
          display: block;
          padding: 6px 12px 6px 46px;
          border-radius: 6px;
          text-decoration: none;
          font-size: 13px;
          color: #64748b;
          font-weight: 500;
          transition: all 0.15s;
        }
        .nav-tile-subitem:hover {
          background: #f8fafc;
          color: var(--primary-color);
        }
        .nav-tile-subitem.active {
          color: var(--primary-color);
          font-weight: 700;
          background: #eff6ff;
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
          max-width: 900px;
          border-radius: 16px;
          max-height: 90vh;
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
        .backlog-view {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .backlog-toolbar {
          padding: 12px 16px;
          border-bottom: 1px solid #e2e8f0;
          flex-shrink: 0;
        }
        .btn-submit-backlog {
          width: 100%;
          padding: 10px 16px;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background 0.2s;
        }
        .btn-submit-backlog:hover {
          background: #1d4ed8;
        }
        .backlog-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 16px;
          overflow-y: auto;
          flex: 1;
        }
        .backlog-item {
          padding: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #f8fafc;
        }
        .backlog-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
          gap: 8px;
        }
        .backlog-title {
          font-weight: 700;
          color: #1e293b;
          margin: 0;
          flex: 1;
        }
        .backlog-category {
          font-size: 0.75rem;
          padding: 3px 8px;
          border-radius: 4px;
          white-space: nowrap;
          font-weight: 600;
        }
        .backlog-category.cat-bug {
          background: #fee2e2;
          color: #991b1b;
        }
        .backlog-category.cat-amélioration {
          background: #dbeafe;
          color: #1e40af;
        }
        .backlog-category.cat-nouvelle-fonctionnalité {
          background: #e9d5ff;
          color: #5b21b6;
        }
        .backlog-category.cat-graphisme {
          background: #fed7aa;
          color: #92400e;
        }
        .backlog-description {
          font-size: 0.9rem;
          color: #475569;
          margin: 8px 0;
        }
        .backlog-meta {
          display: flex;
          gap: 12px;
          font-size: 0.8rem;
          color: #94a3b8;
          flex-wrap: wrap;
        }
        .backlog-status {
          background: #f1f5f9;
          padding: 2px 8px;
          border-radius: 4px;
        }
        .backlog-attachments {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        .backlog-file-link {
          font-size: 0.8rem;
          color: #0284c7;
          text-decoration: none;
          padding: 4px 8px;
          border-radius: 4px;
          border: 1px solid #7dd3fc;
          background: white;
        }
        .backlog-file-link:hover {
          background: #f0f9ff;
          border-color: #0284c7;
        }
        .empty-backlog {
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



