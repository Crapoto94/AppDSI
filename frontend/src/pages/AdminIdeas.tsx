import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Lightbulb, CheckCircle, XCircle, Clock, MessageSquare, Trash2, Send, Loader2, Paperclip } from 'lucide-react';

interface IdeaAttachment {
    id: number;
    filename: string;
    original_name: string;
    file_path: string;
}

interface Idea {
    id: number;
    title: string;
    description: string;
    author_email: string;
    author_name: string;
    status: string;
    admin_response: string;
    created_at: string;
    updated_at: string;
    attachments?: IdeaAttachment[];
}

const statusLabels: Record<string, string> = {
    new: 'Nouvelle',
    in_progress: 'En cours',
    accepted: 'Acceptée',
    rejected: 'Refusée',
};

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    new: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
    in_progress: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
    accepted: { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
    rejected: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
};

const AdminIdeas: React.FC = () => {
    const [ideas, setIdeas] = useState<Idea[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');
    const [responseText, setResponseText] = useState<Record<number, string>>({});
    const [sending, setSending] = useState<Record<number, boolean>>({});
    const { token } = useAuth();

    const fetchIdeas = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/admin/magapp/ideas', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setIdeas(res.data);
        } catch (err) {
            console.error('Erreur chargement idées:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchIdeas(); }, []);

    const handleStatusUpdate = async (id: number, status: string) => {
        try {
            await axios.put(`/api/admin/magapp/ideas/${id}`, { status, admin_response: ideas.find(i => i.id === id)?.admin_response || '' }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchIdeas();
        } catch (err) {
            alert('Erreur lors de la mise à jour');
        }
    };

    const handleSendResponse = async (id: number) => {
        const response = responseText[id];
        if (!response?.trim()) return;
        setSending(prev => ({ ...prev, [id]: true }));
        try {
            await axios.put(`/api/admin/magapp/ideas/${id}`, {
                status: ideas.find(i => i.id === id)?.status || 'in_progress',
                admin_response: response
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setResponseText(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
            fetchIdeas();
        } catch (err) {
            alert("Erreur lors de l'envoi de la réponse");
        } finally {
            setSending(prev => ({ ...prev, [id]: false }));
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Supprimer cette idée ?')) return;
        try {
            await axios.delete(`/api/admin/magapp/ideas/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchIdeas();
        } catch (err) {
            alert('Erreur lors de la suppression');
        }
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('fr-FR', {
            day: '2-digit', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(date);
    };

    const filteredIdeas = filter === 'all' ? ideas : ideas.filter(i => i.status === filter);
    const counts = {
        all: ideas.length,
        new: ideas.filter(i => i.status === 'new').length,
        in_progress: ideas.filter(i => i.status === 'in_progress').length,
        accepted: ideas.filter(i => i.status === 'accepted').length,
        rejected: ideas.filter(i => i.status === 'rejected').length,
    };

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-600" size={40} /></div>;

    return (
        <div className="admin-ideas-container animate-in fade-in duration-500">
            <div className="header-section mb-10">
                <div className="flex items-center gap-4 mb-2">
                    <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100">
                        <Lightbulb size={28} />
                    </div>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">Idées MAGAPP</h2>
                </div>
                <p className="text-gray-500 font-medium text-lg">Consultez, répondez et traitez les idées envoyées via le Magasin d'Apps.</p>
            </div>

            <div className="filter-bar">
                {['all', 'new', 'in_progress', 'accepted', 'rejected'].map(f => (
                    <button
                        key={f}
                        className={`filter-chip ${filter === f ? 'active' : ''}`}
                        onClick={() => setFilter(f)}
                    >
                        {f === 'all' ? 'Toutes' : statusLabels[f]}
                        <span className="chip-count">{counts[f as keyof typeof counts] ?? 0}</span>
                    </button>
                ))}
            </div>

            {filteredIdeas.length === 0 ? (
                <div className="empty-state-card">
                    <div className="icon-circle" style={{ background: '#f0f9ff', color: '#3b82f6' }}>
                        <Lightbulb size={44} />
                    </div>
                    <h3>Aucune idée{filter !== 'all' ? ` ${statusLabels[filter]?.toLowerCase()}` : ''}</h3>
                    <p>{filter === 'all' ? 'Aucune idée n\'a encore été soumise.' : `Aucune idée avec le statut "${statusLabels[filter]}".`}</p>
                </div>
            ) : (
                <div className="ideas-grid">
                    {filteredIdeas.map(idea => {
                        const sc = statusColors[idea.status] || statusColors.new;
                        return (
                            <div key={idea.id} className="idea-card">
                                <div className="card-inner">
                                    <div className="idea-header">
                                        <div className="idea-title-row">
                                            <h3 className="idea-title">{idea.title}</h3>
                                            <span className="status-pill" style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                                                {statusLabels[idea.status] || idea.status}
                                            </span>
                                        </div>
                                        <div className="idea-meta">
                                            <span className="meta-author">{idea.author_name || idea.author_email || 'Anonyme'}</span>
                                            {idea.author_email && idea.author_name && (
                                                <span className="meta-email">{idea.author_email}</span>
                                            )}
                                            <span className="meta-date">
                                                <Clock size={12} />
                                                {formatDate(idea.created_at)}
                                            </span>
                                        </div>
                                    </div>

                                    {idea.description && (
                                        <div className="idea-description">
                                            {idea.description}
                                        </div>
                                    )}

                                    {idea.attachments && idea.attachments.length > 0 && (
                                        <div className="idea-attachments">
                                            <div className="section-label">
                                                <Paperclip size={14} />
                                                Pièces jointes ({idea.attachments.length})
                                            </div>
                                            <div className="attachments-list">
                                                {idea.attachments.map(att => (
                                                    <a key={att.id} href={`/api/magapp/ideas/attachment/${att.id}`} className="attachment-badge" target="_blank" rel="noopener noreferrer">
                                                        <Paperclip size={12} />
                                                        {att.original_name || att.filename}
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {idea.admin_response && (
                                        <div className="admin-response-display">
                                            <div className="response-label">
                                                <MessageSquare size={14} />
                                                Réponse admin
                                            </div>
                                            <p>{idea.admin_response}</p>
                                        </div>
                                    )}

                                    <div className="idea-actions-bar">
                                        {idea.status !== 'accepted' && (
                                            <button className="action-btn accept" onClick={() => handleStatusUpdate(idea.id, 'accepted')} title="Acquiter l'idée">
                                                <CheckCircle size={16} />
                                                Accepter
                                            </button>
                                        )}
                                        {idea.status !== 'rejected' && (
                                            <button className="action-btn reject" onClick={() => handleStatusUpdate(idea.id, 'rejected')} title="Refuser l'idée">
                                                <XCircle size={16} />
                                                Refuser
                                            </button>
                                        )}
                                        {(idea.status === 'new' || idea.status === 'in_progress') && (
                                            <button className="action-btn progress-btn" onClick={() => handleStatusUpdate(idea.id, 'in_progress')} title="Passer en cours">
                                                <Clock size={16} />
                                                En cours
                                            </button>
                                        )}
                                        <button className="action-btn delete-btn" onClick={() => handleDelete(idea.id)} title="Supprimer">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <div className="response-section">
                                        <textarea
                                            className="response-textarea"
                                            placeholder="Écrire une réponse..."
                                            value={responseText[idea.id] ?? idea.admin_response ?? ''}
                                            onChange={e => setResponseText(prev => ({ ...prev, [idea.id]: e.target.value }))}
                                        />
                                        <button
                                            className="send-response-btn"
                                            onClick={() => handleSendResponse(idea.id)}
                                            disabled={sending[idea.id] || !(responseText[idea.id] ?? '').trim()}
                                        >
                                            {sending[idea.id] ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                            Répondre
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <style>{`
                .admin-ideas-container {
                    padding: 10px;
                    font-family: 'Montserrat', sans-serif;
                }

                .filter-bar {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 30px;
                    flex-wrap: wrap;
                }

                .filter-chip {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 18px;
                    border-radius: 14px;
                    font-size: 14px;
                    font-weight: 700;
                    background: white;
                    color: #64748b;
                    border: 1px solid #e2e8f0;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .filter-chip:hover {
                    border-color: #818cf8;
                    color: #4f46e5;
                }

                .filter-chip.active {
                    background: #4f46e5;
                    color: white;
                    border-color: #4f46e5;
                    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
                }

                .chip-count {
                    background: rgba(0,0,0,0.08);
                    padding: 2px 8px;
                    border-radius: 10px;
                    font-size: 11px;
                    font-weight: 800;
                }

                .filter-chip.active .chip-count {
                    background: rgba(255,255,255,0.25);
                }

                .empty-state-card {
                    background: white;
                    padding: 80px 40px;
                    border-radius: 40px;
                    border: 1px solid #f1f5f9;
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 20px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.02);
                }

                .icon-circle {
                    width: 100px;
                    height: 100px;
                    border-radius: 35px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 10px;
                }

                .empty-state-card h3 { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
                .empty-state-card p { font-size: 18px; color: #64748b; font-weight: 500; margin: 0; }

                .ideas-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(480px, 1fr));
                    gap: 25px;
                }

                .idea-card {
                    background: white;
                    border-radius: 32px;
                    border: 1px solid #f1f5f9;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.03);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    overflow: hidden;
                }

                .idea-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 20px 40px rgba(0,0,0,0.06);
                    border-color: #e2e8f0;
                }

                .card-inner { padding: 30px; }

                .idea-header { margin-bottom: 18px; }

                .idea-title-row {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 12px;
                    margin-bottom: 8px;
                }

                .idea-title {
                    font-size: 19px;
                    font-weight: 800;
                    color: #0f172a;
                    margin: 0;
                    line-height: 1.3;
                }

                .status-pill {
                    padding: 5px 12px;
                    border-radius: 10px;
                    font-size: 11px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    white-space: nowrap;
                    flex-shrink: 0;
                }

                .idea-meta {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-size: 13px;
                    color: #94a3b8;
                    font-weight: 600;
                    flex-wrap: wrap;
                }

                .meta-author { color: #475569; font-weight: 700; }
                .meta-email { color: #94a3b8; }
                .meta-date { display: flex; align-items: center; gap: 4px; }

                .idea-description {
                    background: #f8fafc;
                    border-radius: 18px;
                    padding: 18px;
                    font-size: 14px;
                    line-height: 1.6;
                    color: #334155;
                    margin-bottom: 18px;
                    white-space: pre-wrap;
                    word-break: break-word;
                }

                .idea-attachments {
                    margin-bottom: 18px;
                }

                .section-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 11px;
                    font-weight: 800;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    margin-bottom: 12px;
                }

                .attachments-list {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }

                .attachment-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: white;
                    color: #4f46e5;
                    padding: 6px 14px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 700;
                    border: 1px solid #e2e8f0;
                    text-decoration: none;
                    transition: all 0.2s;
                }

                .attachment-badge:hover {
                    background: #eef2ff;
                    border-color: #c7d2fe;
                }

                .admin-response-display {
                    background: #f0fdf4;
                    border: 1px solid #bbf7d0;
                    border-radius: 18px;
                    padding: 16px;
                    margin-bottom: 18px;
                }

                .response-label {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                    font-weight: 800;
                    color: #16a34a;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    margin-bottom: 8px;
                }

                .admin-response-display p {
                    margin: 0;
                    font-size: 14px;
                    color: #15803d;
                    line-height: 1.5;
                    white-space: pre-wrap;
                }

                .idea-actions-bar {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 18px;
                    flex-wrap: wrap;
                }

                .action-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 10px 18px;
                    border-radius: 14px;
                    font-weight: 700;
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                }

                .action-btn.accept {
                    background: #16a34a;
                    color: white;
                    box-shadow: 0 4px 12px rgba(22, 163, 74, 0.15);
                }

                .action-btn.accept:hover {
                    background: #15803d;
                    transform: translateY(-2px);
                    box-shadow: 0 8px 16px rgba(22, 163, 74, 0.2);
                }

                .action-btn.reject {
                    background: #f8fafc;
                    color: #64748b;
                    border: 1px solid #e2e8f0;
                }

                .action-btn.reject:hover {
                    background: #fef2f2;
                    color: #dc2626;
                    border-color: #fecaca;
                }

                .action-btn.progress-btn {
                    background: #fffbeb;
                    color: #b45309;
                    border: 1px solid #fde68a;
                }

                .action-btn.progress-btn:hover {
                    background: #fef3c7;
                    transform: translateY(-1px);
                }

                .action-btn.delete-btn {
                    background: transparent;
                    color: #94a3b8;
                    padding: 10px 12px;
                    margin-left: auto;
                }

                .action-btn.delete-btn:hover {
                    background: #fef2f2;
                    color: #dc2626;
                }

                .response-section {
                    display: flex;
                    gap: 10px;
                    align-items: flex-end;
                }

                .response-textarea {
                    flex: 1;
                    border: 1px solid #e2e8f0;
                    border-radius: 14px;
                    padding: 12px 16px;
                    font-family: 'Montserrat', sans-serif;
                    font-size: 14px;
                    color: #334155;
                    resize: vertical;
                    min-height: 60px;
                    transition: border-color 0.2s;
                    outline: none;
                    background: #f8fafc;
                }

                .response-textarea:focus {
                    border-color: #818cf8;
                    background: white;
                }

                .send-response-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 20px;
                    border-radius: 14px;
                    background: #4f46e5;
                    color: white;
                    font-weight: 700;
                    font-size: 14px;
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s;
                    white-space: nowrap;
                }

                .send-response-btn:hover:not(:disabled) {
                    background: #4338ca;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
                }

                .send-response-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                @media (max-width: 600px) {
                    .ideas-grid { grid-template-columns: 1fr; }
                    .idea-title-row { flex-direction: column; }
                    .response-section { flex-direction: column; }
                }
            `}</style>
        </div>
    );
};

export default AdminIdeas;