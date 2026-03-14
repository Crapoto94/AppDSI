import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutGrid, Send, CheckCircle2, User, Info, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Tile {
    id: number;
    title: string;
    description: string;
    icon: string;
}

const AccessRequestPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const { user } = useAuth();
    const username = searchParams.get('username') || user?.username || '';
    const preselectId = searchParams.get('preselect');
    const initialSelected = preselectId ? [Number(preselectId)] : [];
    
    const [tiles, setTiles] = useState<Tile[]>([]);
    const [selected, setSelected] = useState<number[]>(initialSelected);
    const [message, setMessage] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [tilesRes, msgRes] = await Promise.all([
                    axios.get('/api/tiles-all'),
                    axios.get('/api/messages/code/demandeacces')
                ]);
                setTiles(tilesRes.data);
                setMessage(msgRes.data.content);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleSubmit = async () => {
        if (selected.length === 0) {
            alert('Veuillez sélectionner au moins une brique.');
            return;
        }
        try {
            await axios.post('/api/access-requests', {
                username,
                requested_tiles: selected
            });
            setSubmitted(true);
        } catch (err) {
            alert('Erreur lors de la soumission.');
        }
    };

    if (submitted) {
        return (
            <div className="access-request-container success">
                <style>{`
                    .access-request-container {
                        min-height: 100vh;
                        background: #f8fafc;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                        font-family: 'Montserrat', sans-serif;
                    }
                    .success-card {
                        background: white;
                        padding: 60px 40px;
                        border-radius: 40px;
                        box-shadow: 0 20px 50px rgba(0,0,0,0.05);
                        max-width: 600px;
                        width: 100%;
                        text-align: center;
                        border: 1px solid #f1f5f9;
                        animation: slideUp 0.5s ease-out;
                    }
                    @keyframes slideUp {
                        from { transform: translateY(20px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                    .success-icon {
                        width: 100px;
                        height: 100px;
                        background: #f0fdf4;
                        color: #16a34a;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 30px;
                    }
                    .success-card h1 {
                        font-size: 32px;
                        font-weight: 800;
                        color: #0f172a;
                        margin-bottom: 15px;
                    }
                    .success-card p {
                        font-size: 18px;
                        color: #64748b;
                        line-height: 1.6;
                        margin-bottom: 40px;
                    }
                    .btn-back {
                        background: var(--secondary-color, #003366);
                        color: white;
                        padding: 18px 40px;
                        border-radius: 20px;
                        font-weight: 700;
                        font-size: 18px;
                        width: 100%;
                        transition: all 0.3s ease;
                        box-shadow: 0 10px 20px rgba(0,51,102,0.15);
                    }
                    .btn-back:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 15px 30px rgba(0,51,102,0.2);
                        filter: brightness(1.1);
                    }
                `}</style>
                <div className="success-card">
                    <div className="success-icon">
                        <CheckCircle2 size={50} />
                    </div>
                    <h1>Demande envoyée !</h1>
                    <p>
                        Votre demande d'accès a été transmise aux administrateurs. 
                        Elle sera traitée dans les plus brefs délais.
                    </p>
                    <button onClick={() => navigate('/')} className="btn-back">
                        Retour à l'accueil
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="access-request-page">
            <style>{`
                .access-request-page {
                    min-height: 100vh;
                    background: #f1f5f9;
                    padding: 60px 20px;
                    font-family: 'Montserrat', sans-serif;
                }
                .content-wrapper {
                    max-width: 1000px;
                    margin: 0 auto;
                }
                .main-card {
                    background: white;
                    border-radius: 40px;
                    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.08);
                    overflow: hidden;
                    border: 1px solid rgba(255,255,255,0.8);
                }
                .card-header {
                    padding: 50px 50px 30px;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    flex-wrap: wrap;
                    gap: 30px;
                }
                .header-title h1 {
                    font-size: 34px;
                    font-weight: 800;
                    color: #0f172a;
                    margin-bottom: 10px;
                    letter-spacing: -0.02em;
                }
                .header-title p {
                    font-size: 18px;
                    color: #64748b;
                    font-weight: 500;
                }
                .user-badge {
                    background: #f8fafc;
                    padding: 12px 24px;
                    border-radius: 20px;
                    border: 1px solid #e2e8f0;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .user-icon {
                    width: 36px;
                    height: 36px;
                    background: white;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--primary-color, #E30613);
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                }
                .user-info .label {
                    display: block;
                    font-size: 10px;
                    font-weight: 800;
                    text-transform: uppercase;
                    color: #94a3b8;
                    letter-spacing: 0.05em;
                }
                .user-info .name {
                    font-weight: 700;
                    color: #1e293b;
                    font-size: 15px;
                }
                .instruction-box {
                    margin: 0 50px 40px;
                    background: #eff6ff;
                    border: 1px solid #dbeafe;
                    padding: 25px 30px;
                    border-radius: 24px;
                    display: flex;
                    gap: 20px;
                    align-items: center;
                }
                .info-icon {
                    color: #3b82f6;
                    flex-shrink: 0;
                }
                .instruction-text {
                    color: #1e40af;
                    font-size: 16px;
                    font-weight: 600;
                    line-height: 1.5;
                }
                .tiles-section {
                    padding: 0 50px 40px;
                }
                .section-title {
                    font-size: 14px;
                    font-weight: 800;
                    text-transform: uppercase;
                    color: #94a3b8;
                    margin-bottom: 20px;
                    letter-spacing: 0.1em;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .grid-container {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: 20px;
                }
                .tile-item {
                    padding: 24px;
                    border-radius: 28px;
                    border: 2px solid #f1f5f9;
                    background: #fcfdfe;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }
                .tile-item:hover {
                    border-color: #cbd5e1;
                    transform: translateY(-4px);
                    box-shadow: 0 12px 20px rgba(0,0,0,0.04);
                }
                .tile-item.selected {
                    border-color: var(--primary-color, #E30613);
                    background: #fffafa;
                    box-shadow: 0 10px 25px rgba(227, 6, 19, 0.08);
                }
                .tile-icon-wrapper {
                    width: 54px;
                    height: 54px;
                    border-radius: 18px;
                    background: white;
                    border: 1px solid #e2e8f0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #64748b;
                    transition: all 0.3s ease;
                }
                .tile-item.selected .tile-icon-wrapper {
                    background: var(--primary-color, #E30613);
                    color: white;
                    border-color: var(--primary-color, #E30613);
                    box-shadow: 0 8px 15px rgba(227, 6, 19, 0.2);
                }
                .check-mark {
                    position: absolute;
                    top: 24px;
                    right: 24px;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    border: 2px solid #e2e8f0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: white;
                    transition: all 0.3s ease;
                }
                .tile-item.selected .check-mark {
                    background: var(--primary-color, #E30613);
                    border-color: var(--primary-color, #E30613);
                    color: white;
                }
                .tile-content h3 {
                    font-size: 18px;
                    font-weight: 800;
                    color: #0f172a;
                    margin-bottom: 6px;
                }
                .tile-content p {
                    font-size: 14px;
                    color: #64748b;
                    line-height: 1.5;
                    font-weight: 500;
                }
                .footer-actions {
                    padding: 40px 50px;
                    background: #f8fafc;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 30px;
                }
                .selection-count {
                    color: #64748b;
                    font-weight: 600;
                    font-size: 15px;
                }
                .action-btns {
                    display: flex;
                    gap: 15px;
                }
                .btn-cancel {
                    padding: 14px 28px;
                    border-radius: 16px;
                    font-weight: 700;
                    color: #64748b;
                    background: transparent;
                    transition: all 0.2s;
                }
                .btn-cancel:hover {
                    background: #f1f5f9;
                    color: #1e293b;
                }
                .btn-submit {
                    background: var(--primary-color, #E30613);
                    color: white;
                    padding: 16px 40px;
                    border-radius: 18px;
                    font-weight: 800;
                    font-size: 17px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    transition: all 0.3s ease;
                    box-shadow: 0 10px 20px rgba(227, 6, 19, 0.15);
                }
                .btn-submit:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 15px 30px rgba(227, 6, 19, 0.2);
                    filter: brightness(1.1);
                }
                .btn-submit:disabled {
                    background: #cbd5e1;
                    box-shadow: none;
                    cursor: not-allowed;
                }
                .btn-submit:active:not(:disabled) {
                    transform: translateY(0);
                }
                
                @media (max-width: 768px) {
                    .card-header, .instruction-box, .tiles-section, .footer-actions {
                        padding: 30px 25px;
                    }
                    .instruction-box { margin: 0 25px 30px; }
                    .footer-actions { flex-direction: column; text-align: center; }
                    .action-btns { width: 100%; flex-direction: column; }
                    .btn-submit, .btn-cancel { width: 100%; justify-content: center; }
                }
            `}</style>

            <div className="content-wrapper">
                <div className="main-card">
                    <div className="card-header">
                        <div className="header-title">
                            <h1>Demande d'accès</h1>
                            <p>Configurez vos accès aux services du Hub DSI</p>
                        </div>
                        <div className="user-badge">
                            <div className="user-icon">
                                <User size={20} />
                            </div>
                            <div className="user-info">
                                <span className="label">Compte</span>
                                <span className="name">{username || 'Invité'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="instruction-box">
                        <div className="info-icon">
                            <Info size={28} />
                        </div>
                        <p className="instruction-text">
                            {message || 'Veuillez sélectionner les briques applicatives auxquelles vous souhaitez accéder :'}
                        </p>
                    </div>

                    <div className="tiles-section">
                        <div className="section-title">
                            <LayoutGrid size={16} />
                            Services Disponibles
                        </div>

                        {loading ? (
                            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                                <div style={{ 
                                    width: '40px', 
                                    height: '40px', 
                                    border: '4px solid #f1f5f9', 
                                    borderTopColor: 'var(--primary-color, #E30613)', 
                                    borderRadius: '50%',
                                    margin: '0 auto 20px',
                                    animation: 'spin 1s linear infinite'
                                }}></div>
                                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                                Chargement des services...
                            </div>
                        ) : (
                            <div className="grid-container">
                                {tiles.map(tile => (
                                    <div 
                                        key={tile.id}
                                        className={`tile-item ${selected.includes(tile.id) ? 'selected' : ''}`}
                                        onClick={() => {
                                            if (selected.includes(tile.id)) {
                                                setSelected(selected.filter(id => id !== tile.id));
                                            } else {
                                                setSelected([...selected, tile.id]);
                                            }
                                        }}
                                    >
                                        <div className="tile-icon-wrapper">
                                            <LayoutGrid size={28} />
                                        </div>
                                        <div className="check-mark">
                                            {selected.includes(tile.id) && <CheckCircle2 size={16} />}
                                        </div>
                                        <div className="tile-content">
                                            <h3>{tile.title}</h3>
                                            <p>{tile.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="footer-actions">
                        <div className="selection-count">
                            {selected.length === 0 ? (
                                'Aucun service sélectionné'
                            ) : (
                                <span>
                                    <strong>{selected.length}</strong> service{selected.length > 1 ? 's' : ''} sélectionné{selected.length > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                        <div className="action-btns">
                            <button 
                                onClick={() => navigate('/')}
                                className="btn-cancel"
                            >
                                Annuler
                            </button>
                            <button 
                                onClick={handleSubmit}
                                disabled={selected.length === 0}
                                className="btn-submit"
                            >
                                <Send size={20} />
                                Envoyer la demande
                            </button>
                        </div>
                    </div>
                </div>
                
                <div style={{ 
                    marginTop: '30px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '10px',
                    color: '#94a3b8',
                    fontSize: '14px',
                    fontWeight: 600
                }}>
                    <ShieldAlert size={16} />
                    Accès sécurisé DSI Ivry-sur-Seine
                </div>
            </div>
        </div>
    );
};

export default AccessRequestPage;
