import React from 'react';
import { FileText, LogOut, X } from 'lucide-react';

interface Props {
    user?: {
        displayName?: string;
        username?: string;
        email?: string;
        role?: string;
    } | null;
}

const TranscriptAgentHeader: React.FC<Props> = ({ user }) => {
    const isGuest = user?.role !== 'transcript_agent';

    const clearSession = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('restrictedPath');
        sessionStorage.removeItem('magapp_user');
    };

    const handleClose = () => {
        clearSession();
        // Fenêtre ouverte depuis le Magasin (window.open) : la fermer ramène au magapp.
        try { window.close(); } catch { /* noop */ }
        setTimeout(() => { window.location.href = '/'; }, 300);
    };

    const handleLogout = () => {
        clearSession();
        window.location.href = '/';
    };

    const name = user?.displayName || user?.username || 'Transcript Manager';
    const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();

    return (
        <>
        <style>{`
            .trm-header {
                position: sticky;
                top: 0;
                z-index: 50;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
                height: 60px;
                padding: 0 1.5rem;
                background: #ffffff;
                border-bottom: 2px solid #0078a4;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                box-shadow: 0 1px 4px rgba(0,120,164,0.08);
            }
            .trm-header-left {
                display: flex;
                align-items: center;
                gap: 0.65rem;
                color: #0078a4;
                font-weight: 600;
                font-size: 1.05rem;
                white-space: nowrap;
            }
            .trm-header-left .trm-badge {
                background: #f0f9ff;
                border: 1px solid #bae6fd;
                color: #0369a1;
                font-size: 0.68rem;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                padding: 3px 9px;
                border-radius: 999px;
            }
            .trm-header-right {
                display: flex;
                align-items: center;
                gap: 0.7rem;
                margin-left: auto;
            }
            .trm-identity {
                display: flex;
                align-items: center;
                gap: 0.6rem;
                background: #f0f9ff;
                padding: 5px 12px 5px 6px;
                border-radius: 22px;
                border: 1px solid #bae6fd;
                color: #0369a1;
                font-size: 0.85rem;
                font-weight: 500;
                white-space: nowrap;
            }
            .trm-avatar {
                width: 30px;
                height: 30px;
                min-width: 30px;
                border-radius: 50%;
                background: #0078a4;
                color: #fff;
                font-size: 0.75rem;
                font-weight: 700;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .trm-identity .trm-identity-text {
                display: flex;
                flex-direction: column;
                line-height: 1.15;
            }
            .trm-identity .trm-identity-name {
                font-weight: 600;
                color: #0369a1;
                max-width: 200px;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .trm-identity .trm-identity-mail {
                font-size: 0.72rem;
                color: #64748b;
                max-width: 200px;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .trm-btn-close, .trm-btn-logout {
                display: flex;
                align-items: center;
                gap: 0.35rem;
                border-radius: 10px;
                padding: 9px 13px;
                font-size: 0.82rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                white-space: nowrap;
            }
            .trm-btn-close {
                background: #f0f9ff;
                border: 1px solid #0078a4;
                color: #0078a4;
            }
            .trm-btn-close:hover {
                background: #e0f2fe;
            }
            .trm-btn-logout {
                background: #fff1f2;
                border: 1px solid #fecdd3;
                color: #e11d48;
                padding: 9px;
            }
            .trm-btn-logout:hover {
                background: #ffe4e6;
            }
        `}</style>
        <div className="trm-header">
            <div className="trm-header-left">
                <FileText size={20} />
                Transcript Manager
                <span className="trm-badge">{isGuest ? 'Lien de partage' : 'Magasin d\'applications'}</span>
            </div>
            <div className="trm-header-right">
                <div className="trm-identity">
                    <div className="trm-avatar">{initials}</div>
                    <div className="trm-identity-text">
                        <span className="trm-identity-name">{name}</span>
                        {user?.email && <span className="trm-identity-mail">{user.email}</span>}
                    </div>
                </div>
                <button
                    className="trm-btn-close"
                    onClick={handleClose}
                    title={isGuest ? "Fermer l'accès au Transcript Manager" : "Fermer et revenir au Magasin d'applications"}
                >
                    <X size={15} />
                    {isGuest ? "Fermer l'accès" : 'Fermer'}
                </button>
                <button className="trm-btn-logout" onClick={handleLogout} title="Se déconnecter">
                    <LogOut size={16} />
                </button>
            </div>
        </div>
        </>
    );
};

export default TranscriptAgentHeader;