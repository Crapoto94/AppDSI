import React, { useState } from 'react';
import axios from 'axios';
import { LogOut, X, HelpCircle } from 'lucide-react';

// En-tête DSI « lite » affiché lorsqu'un module est ouvert en accès restreint
// (depuis le Magasin d'applications ou via un lien de partage) : pas de
// navigation vers les autres modules, seulement l'identité de l'agent, l'aide,
// la fermeture (retour au Magasin) et la déconnexion. Utilisé par le Transcript
// Manager, Mes tâches et Mes notes IA.
interface Props {
    title: string;
    helpPath: string;
    icon?: React.ReactNode;
    badge?: string;
    isGuest?: boolean;
    user?: {
        displayName?: string;
        username?: string;
        email?: string;
        role?: string;
    } | null;
}

const ModuleAgentHeader: React.FC<Props> = ({
    title,
    helpPath,
    icon,
    badge,
    isGuest = false,
    user,
}) => {
    const [showHelp, setShowHelp] = useState(false);
    const [helpHtml, setHelpHtml] = useState<string | null>(null);
    const [helpLoading, setHelpLoading] = useState(false);

    const openHelp = async () => {
        setShowHelp(true);
        if (helpHtml !== null || helpLoading) return;
        setHelpLoading(true);
        try {
            const res = await axios.get(`/api/page-help/${encodeURIComponent(helpPath)}`);
            setHelpHtml(res.data?.content_html || "<p>Aucune aide disponible pour l'instant.</p>");
        } catch {
            setHelpHtml('<p>Aide momentanément indisponible. Réessayez plus tard.</p>');
        } finally {
            setHelpLoading(false);
        }
    };

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

    const name = user?.displayName || user?.username || title;
    const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
    const badgeLabel = badge ?? (isGuest ? 'Lien de partage' : "Magasin d'applications");

    return (
        <>
        <style>{`
            .mah-header {
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
            .mah-header-left {
                display: flex;
                align-items: center;
                gap: 0.65rem;
                color: #0078a4;
                font-weight: 600;
                font-size: 1.05rem;
                white-space: nowrap;
            }
            .mah-header-left .mah-badge {
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
            .mah-header-right {
                display: flex;
                align-items: center;
                gap: 0.7rem;
                margin-left: auto;
            }
            .mah-identity {
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
            .mah-avatar {
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
            .mah-identity .mah-identity-text {
                display: flex;
                flex-direction: column;
                line-height: 1.15;
            }
            .mah-identity .mah-identity-name {
                font-weight: 600;
                color: #0369a1;
                max-width: 200px;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .mah-identity .mah-identity-mail {
                font-size: 0.72rem;
                color: #64748b;
                max-width: 200px;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .mah-btn-help, .mah-btn-close, .mah-btn-logout {
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
            .mah-btn-close {
                background: #f0f9ff;
                border: 1px solid #0078a4;
                color: #0078a4;
            }
            .mah-btn-close:hover {
                background: #e0f2fe;
            }
            .mah-btn-logout {
                background: #fff1f2;
                border: 1px solid #fecdd3;
                color: #e11d48;
                padding: 9px;
            }
            .mah-btn-logout:hover {
                background: #ffe4e6;
            }
            .mah-btn-help {
                background: #fff;
                border: 1px solid #cbd5e1;
                color: #475569;
            }
            .mah-btn-help:hover {
                background: #f8fafc;
            }
            .mah-help-overlay {
                position: fixed;
                inset: 0;
                background: rgba(15, 23, 42, 0.55);
                backdrop-filter: blur(3px);
                z-index: 3000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .mah-help-modal {
                background: #fff;
                width: 100%;
                max-width: 700px;
                max-height: 85vh;
                border-radius: 16px;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.3);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
            .mah-help-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px 20px;
                border-bottom: 1px solid #f1f5f9;
                font-weight: 800;
                font-size: 1rem;
                color: #0f172a;
            }
            .mah-help-head span { display: flex; align-items: center; gap: 8px; }
            .mah-help-close {
                background: #f1f5f9;
                border: none;
                cursor: pointer;
                color: #64748b;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .mah-help-body { padding: 20px 24px 28px; overflow-y: auto; }
            .mah-help-md { font-size: 14.5px; color: #334155; line-height: 1.7; }
            .mah-help-md > *:first-child { margin-top: 0; }
            .mah-help-md h1 { font-size: 1.5rem; font-weight: 800; color: #0f172a; margin: 0 0 6px; }
            .mah-help-md h2 { font-size: 1.18rem; font-weight: 800; color: #1e293b; margin: 26px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #eef2f7; }
            .mah-help-md h3 { font-size: 1.02rem; font-weight: 700; color: #334155; margin: 18px 0 6px; }
            .mah-help-md p { margin: 8px 0; }
            .mah-help-md ul, .mah-help-md ol { margin: 8px 0; padding-left: 22px; }
            .mah-help-md li { margin: 4px 0; }
            .mah-help-md a { color: #0078a4; text-decoration: none; }
            .mah-help-md a:hover { text-decoration: underline; }
            .mah-help-md hr { border: none; border-top: 1px solid #e2e8f0; margin: 22px 0; }
            .mah-help-md code { background: #f1f5f9; color: #be123c; padding: 1px 6px; border-radius: 5px;
                font-family: "SFMono-Regular", Consolas, Menlo, monospace; font-size: 0.85em; }
            .mah-help-md blockquote { margin: 12px 0; padding: 8px 14px; border-left: 4px solid #93c5fd; background: #eff6ff; color: #1e3a8a; border-radius: 0 8px 8px 0; }
            .mah-help-md table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13.5px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
            .mah-help-md th, .mah-help-md td { border: 1px solid #e9eef5; padding: 9px 12px; text-align: left; vertical-align: top; }
            .mah-help-md th { background: #f1f5f9; color: #334155; font-weight: 700; }
            .mah-help-md tbody tr:nth-child(even) { background: #f8fafc; }
            .mah-help-md strong { color: #0f172a; }
        `}</style>
        <div className="mah-header">
            <div className="mah-header-left">
                {icon}
                {title}
                <span className="mah-badge">{badgeLabel}</span>
            </div>
            <div className="mah-header-right">
                <div className="mah-identity">
                    <div className="mah-avatar">{initials}</div>
                    <div className="mah-identity-text">
                        <span className="mah-identity-name">{name}</span>
                        {user?.email && <span className="mah-identity-mail">{user.email}</span>}
                    </div>
                </div>
                <button className="mah-btn-help" onClick={openHelp} title="Aide">
                    <HelpCircle size={16} />
                    Aide
                </button>
                <button
                    className="mah-btn-close"
                    onClick={handleClose}
                    title={isGuest ? "Fermer l'accès" : "Fermer et revenir au Magasin d'applications"}
                >
                    <X size={15} />
                    {isGuest ? "Fermer l'accès" : 'Fermer'}
                </button>
                <button className="mah-btn-logout" onClick={handleLogout} title="Se déconnecter">
                    <LogOut size={16} />
                </button>
            </div>
        </div>

        {showHelp && (
            <div className="mah-help-overlay" onClick={() => setShowHelp(false)}>
                <div className="mah-help-modal" onClick={e => e.stopPropagation()}>
                    <div className="mah-help-head">
                        <span><HelpCircle size={18} color="#0078a4" /> Aide — {title}</span>
                        <button className="mah-help-close" onClick={() => setShowHelp(false)}><X size={18} /></button>
                    </div>
                    <div className="mah-help-body">
                        {helpLoading ? (
                            <p style={{ color: '#64748b' }}>Chargement de l'aide...</p>
                        ) : (
                            <div className="mah-help-md" dangerouslySetInnerHTML={{ __html: helpHtml || '' }} />
                        )}
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default ModuleAgentHeader;
