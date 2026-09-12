import React from 'react';
import { FileText, LogOut } from 'lucide-react';

interface Props {
    user?: {
        displayName?: string;
        username?: string;
        email?: string;
    } | null;
    onLogout?: () => void;
}

const TranscriptAgentHeader: React.FC<Props> = ({ user, onLogout }) => {
    const handleClose = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('restrictedPath');
        sessionStorage.removeItem('magapp_user');
        if (onLogout) return onLogout();
        window.location.href = '/';
    };

    const name = user?.displayName || user?.username || 'Agent';

    return (
        <>
        <style>{`
            .tagent-header {
                position: sticky;
                top: 0;
                z-index: 50;
                display: flex;
                align-items: center;
                justify-content: space-between;
                height: 56px;
                padding: 0 1.25rem;
                background: linear-gradient(90deg, #0F172A 0%, #1E293B 100%);
                border-bottom: 2px solid #6366F1;
                font-family: 'Inter', sans-serif;
            }
            .tagent-header-left {
                display: flex;
                align-items: center;
                gap: 0.6rem;
                color: #fff;
                font-weight: 700;
                font-size: 1rem;
            }
            .tagent-badge {
                background: rgba(99,102,241,0.2);
                border: 1px solid rgba(129,140,248,0.5);
                color: #C7D2FE;
                font-size: 0.7rem;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                padding: 2px 8px;
                border-radius: 999px;
            }
            .tagent-header-right {
                display: flex;
                align-items: center;
                gap: 0.9rem;
            }
            .tagent-identity {
                color: #CBD5E1;
                font-size: 0.82rem;
                text-align: right;
                line-height: 1.25;
            }
            .tagent-identity strong {
                color: #fff;
                font-weight: 600;
                display: block;
            }
            .tagent-close {
                display: flex;
                align-items: center;
                gap: 0.4rem;
                background: transparent;
                border: 1px solid rgba(255,255,255,0.25);
                color: #E2E8F0;
                font-size: 0.8rem;
                font-weight: 600;
                padding: 0.35rem 0.8rem;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .tagent-close:hover {
                background: rgba(255,255,255,0.12);
                border-color: rgba(255,255,255,0.5);
            }
        `}</style>
        <div className="tagent-header">
            <div className="tagent-header-left">
                <FileText size={20} color="#A5B4FC" />
                Transcript Manager
                <span className="tagent-badge">Accès agent</span>
            </div>
            <div className="tagent-header-right">
                <div className="tagent-identity">
                    <strong>{name}</strong>
                    {(user?.email || user?.username) && <span>{user?.email || user?.username}</span>}
                </div>
                <button className="tagent-close" onClick={handleClose} title="Fermer l'accès au Transcript Manager">
                    <LogOut size={14} />
                    Fermer
                </button>
            </div>
        </div>
        </>
    );
};

export default TranscriptAgentHeader;