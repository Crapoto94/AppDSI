import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { UserCheck, UserX, Clock, ShieldCheck, User, Box, Loader2 } from 'lucide-react';

interface AccessRequest {
    id: number;
    user_id: number;
    username: string;
    requested_tiles: string;
    status: string;
    created_at: string;
}

interface Tile {
    id: number;
    title: string;
}

const AdminAccessRequests: React.FC = () => {
    const [requests, setRequests] = useState<AccessRequest[]>([]);
    const [tiles, setTiles] = useState<Tile[]>([]);
    const [loading, setLoading] = useState(true);
    const { token } = useAuth();

    const fetchTiles = async () => {
        try {
            const res = await axios.get('/api/tiles-all');
            setTiles(res.data);
        } catch (err) {
            console.error('Error fetching tiles:', err);
        }
    };

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/admin/access-requests', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRequests(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { 
        fetchTiles();
        fetchRequests(); 
    }, []);

    const getTileTitle = (id: string) => {
        const tile = tiles.find(t => t.id === parseInt(id));
        return tile ? tile.title : `Service #${id}`;
    };

    const handleAction = async (id: number, action: 'approve' | 'reject') => {
        try {
            await axios.post(`/api/admin/access-requests/${id}/${action}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchRequests();
        } catch (err) {
            alert('Erreur lors de l\'action');
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('fr-FR', { 
            day: '2-digit', 
            month: 'long', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-600" size={40} /></div>;

    return (
        <div className="admin-requests-container animate-in fade-in duration-500">
            <div className="header-section mb-10">
                <div className="flex items-center gap-4 mb-2">
                    <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100">
                        <ShieldCheck size={28} />
                    </div>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">Demandes d'Accès</h2>
                </div>
                <p className="text-gray-500 font-medium text-lg">Gérez les autorisations et l'accès aux briques applicatives du Hub.</p>
            </div>

            {requests.length === 0 ? (
                <div className="empty-state-card">
                    <div className="icon-circle">
                        <ShieldCheck size={44} />
                    </div>
                    <h3>Aucune demande en attente</h3>
                    <p>Toutes les demandes d'accès ont été traitées. Bon travail !</p>
                </div>
            ) : (
                <div className="requests-grid">
                    {requests.map(req => (
                        <div key={req.id} className="request-card-premium">
                            <div className="card-inner">
                                <div className="request-header-row">
                                    <div className="user-profile">
                                        <div className="avatar-premium">
                                            <User size={24} />
                                        </div>
                                        <div className="user-details">
                                            <h4>{req.username}</h4>
                                            <div className="timestamp">
                                                <Clock size={12} />
                                                <span>{formatDate(req.created_at)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`status-pill ${req.status}`}>
                                        {req.status === 'pending' ? 'En attente' : req.status}
                                    </div>
                                </div>

                                <div className="services-requested-section">
                                    <div className="section-label">
                                        <Box size={14} />
                                        Services demandés
                                    </div>
                                    <div className="tiles-list-premium">
                                        {req.requested_tiles.split(',').map((id, idx) => (
                                            <div key={idx} className="tile-item-badge">
                                                <span className="dot"></span>
                                                {getTileTitle(id.trim())}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="card-footer-actions">
                                    <button 
                                        onClick={() => handleAction(req.id, 'reject')}
                                        className="action-btn reject"
                                        title="Rejeter la demande"
                                    >
                                        <UserX size={18} />
                                        Refuser
                                    </button>
                                    <button 
                                        onClick={() => handleAction(req.id, 'approve')}
                                        className="action-btn approve"
                                        title="Approuver la demande"
                                    >
                                        <UserCheck size={18} />
                                        Approuver l'accès
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <style>{`
                .admin-requests-container {
                    padding: 10px;
                    font-family: 'Montserrat', sans-serif;
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
                    background: #f0fdf4; 
                    color: #16a34a; 
                    border-radius: 35px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    margin-bottom: 10px;
                }
                .empty-state-card h3 { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
                .empty-state-card p { font-size: 18px; color: #64748b; font-weight: 500; margin: 0; }

                .requests-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
                    gap: 25px;
                }

                .request-card-premium {
                    background: white;
                    border-radius: 32px;
                    border: 1px solid #f1f5f9;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.03);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                }
                .request-card-premium:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 20px 40px rgba(0,0,0,0.06);
                    border-color: #e2e8f0;
                }

                .card-inner { padding: 30px; }

                .request-header-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 25px;
                }

                .user-profile { display: flex; align-items: center; gap: 18px; }
                .avatar-premium { 
                    width: 56px; 
                    height: 56px; 
                    background: #eff6ff; 
                    color: #3b82f6; 
                    border-radius: 18px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    box-shadow: inset 0 2px 4px rgba(59, 130, 246, 0.1);
                }
                .user-details h4 { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; }
                .timestamp { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #94a3b8; font-weight: 600; margin-top: 4px; }

                .status-pill {
                    padding: 6px 14px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .status-pill.pending { background: #fffbeb; color: #b45309; border: 1px solid #fef3c7; }

                .services-requested-section {
                    background: #f8fafc;
                    border-radius: 24px;
                    padding: 20px;
                    margin-bottom: 25px;
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
                    margin-bottom: 15px;
                }
                .tiles-list-premium { display: flex; flex-wrap: wrap; gap: 10px; }
                .tile-item-badge { 
                    background: white; 
                    color: #1e293b; 
                    padding: 8px 16px; 
                    border-radius: 14px; 
                    font-size: 13px; 
                    font-weight: 700; 
                    border: 1px solid #e2e8f0; 
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.02);
                }
                .tile-item-badge .dot {
                    width: 6px;
                    height: 6px;
                    background: var(--primary-color, #E30613);
                    border-radius: 50%;
                }

                .card-footer-actions { display: flex; gap: 12px; }
                .action-btn { 
                    flex: 1; 
                    padding: 14px; 
                    border-radius: 16px; 
                    font-weight: 800; 
                    font-size: 14px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    gap: 10px; 
                    transition: all 0.2s;
                    cursor: pointer;
                    border: none;
                }
                .action-btn.approve { 
                    background: #16a34a; 
                    color: white; 
                    box-shadow: 0 8px 15px rgba(22, 163, 74, 0.15); 
                }
                .action-btn.approve:hover { 
                    background: #15803d; 
                    transform: translateY(-2px);
                    box-shadow: 0 12px 20px rgba(22, 163, 74, 0.2); 
                }
                .action-btn.reject { 
                    background: #f8fafc; 
                    color: #64748b; 
                    border: 1px solid #e2e8f0;
                }
                .action-btn.reject:hover { 
                    background: #fee2e2; 
                    color: #dc2626; 
                    border-color: #fecaca;
                }

                @media (max-width: 600px) {
                    .requests-grid { grid-template-columns: 1fr; }
                    .request-header-row { flex-direction: column; gap: 15px; }
                }
            `}</style>
        </div>
    );
};

export default AdminAccessRequests;
