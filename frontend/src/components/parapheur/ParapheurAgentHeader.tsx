import React, { useState } from 'react';
import axios from 'axios';
import { FileSignature, LogOut, X, HelpCircle } from 'lucide-react';

interface Props {
    user?: {
        displayName?: string;
        username?: string;
        email?: string;
        role?: string;
    } | null;
}

/**
 * En-tête « magasin d'applications » affiché à la place du header complet du
 * Hub DSI lorsque le parapheur est ouvert depuis le MagApp (accès restreint au
 * seul module, rôle 'parapheur_agent'). Même principe que `ModuleAgentHeader`.
 */
const ParapheurAgentHeader: React.FC<Props> = ({ user }) => {
    const [showHelp, setShowHelp] = useState(false);
    const [helpHtml, setHelpHtml] = useState<string | null>(null);
    const [helpLoading, setHelpLoading] = useState(false);

    const openHelp = async () => {
        setShowHelp(true);
        if (helpHtml !== null || helpLoading) return;
        setHelpLoading(true);
        try {
            const res = await axios.get(`/api/page-help/${encodeURIComponent('/parapheur')}`);
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

    const name = user?.displayName || user?.username || 'Parapheur';
    const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();

    return (
        <>
            <style>{`
                .phh-header {
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
                .phh-header-left {
                    display: flex;
                    align-items: center;
                    gap: 0.65rem;
                    color: #0078a4;
                    font-weight: 600;
                    font-size: 1.05rem;
                    white-space: nowrap;
                }
                .phh-header-left .phh-badge {
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
                .phh-header-right {
                    display: flex;
                    align-items: center;
                    gap: 0.7rem;
                    margin-left: auto;
                }
                .phh-identity {
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
                .phh-avatar {
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
                .phh-identity-text {
                    display: flex;
                    flex-direction: column;
                    line-height: 1.15;
                }
                .phh-identity-name {
                    font-weight: 600;
                    color: #0369a1;
                    max-width: 200px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .phh-identity-mail {
                    font-size: 0.72rem;
                    color: #64748b;
                    max-width: 200px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .phh-btn-help, .phh-btn-close, .phh-btn-logout {
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
                .phh-btn-close { background: #f0f9ff; border: 1px solid #0078a4; color: #0078a4; }
                .phh-btn-close:hover { background: #e0f2fe; }
                .phh-btn-logout { background: #fff1f2; border: 1px solid #fecdd3; color: #e11d48; padding: 9px; }
                .phh-btn-logout:hover { background: #ffe4e6; }
                .phh-btn-help { background: #fff; border: 1px solid #cbd5e1; color: #475569; }
                .phh-btn-help:hover { background: #f8fafc; }
                .phh-help-overlay {
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
                .phh-help-modal {
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
                .phh-help-head {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 16px 20px;
                    border-bottom: 1px solid #f1f5f9;
                    font-weight: 800;
                    font-size: 1rem;
                    color: #0f172a;
                }
                .phh-help-head span { display: flex; align-items: center; gap: 8px; }
                .phh-help-close {
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
                .phh-help-body { padding: 20px 24px 28px; overflow-y: auto; }
                .phh-help-md { font-size: 14.5px; color: #334155; line-height: 1.7; }
                .phh-help-md > *:first-child { margin-top: 0; }
                .phh-help-md h1 { font-size: 1.5rem; font-weight: 800; color: #0f172a; margin: 0 0 6px; }
                .phh-help-md h2 { font-size: 1.18rem; font-weight: 800; color: #1e293b; margin: 26px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #eef2f7; }
                .phh-help-md h3 { font-size: 1.02rem; font-weight: 700; color: #334155; margin: 18px 0 6px; }
                .phh-help-md p { margin: 8px 0; }
                .phh-help-md ul, .phh-help-md ol { margin: 8px 0; padding-left: 22px; }
                .phh-help-md li { margin: 4px 0; }
                .phh-help-md a { color: #0078a4; text-decoration: none; }
                .phh-help-md a:hover { text-decoration: underline; }
                .phh-help-md hr { border: none; border-top: 1px solid #e2e8f0; margin: 22px 0; }
                .phh-help-md code { background: #f1f5f9; color: #be123c; padding: 1px 6px; border-radius: 5px;
                    font-family: "SFMono-Regular", Consolas, Menlo, monospace; font-size: 0.85em; }
                .phh-help-md blockquote { margin: 12px 0; padding: 8px 14px; border-left: 4px solid #93c5fd; background: #eff6ff; color: #1e3a8a; border-radius: 0 8px 8px 0; }
                .phh-help-md table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13.5px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
                .phh-help-md th, .phh-help-md td { border: 1px solid #e9eef5; padding: 9px 12px; text-align: left; vertical-align: top; }
                .phh-help-md th { background: #f1f5f9; color: #334155; font-weight: 700; }
                .phh-help-md tbody tr:nth-child(even) { background: #f8fafc; }
                .phh-help-md strong { color: #0f172a; }
            `}</style>
            <div className="phh-header">
                <div className="phh-header-left">
                    <FileSignature size={20} />
                    Parapheur électronique
                    <span className="phh-badge">Magasin d'applications</span>
                </div>
                <div className="phh-header-right">
                    <div className="phh-identity">
                        <div className="phh-avatar">{initials}</div>
                        <div className="phh-identity-text">
                            <span className="phh-identity-name">{name}</span>
                            {user?.email && <span className="phh-identity-mail">{user.email}</span>}
                        </div>
                    </div>
                    <button className="phh-btn-help" onClick={openHelp} title="Aide">
                        <HelpCircle size={16} />
                        Aide
                    </button>
                    <button className="phh-btn-close" onClick={handleClose} title="Fermer et revenir au Magasin d'applications">
                        <X size={15} />
                        Fermer
                    </button>
                    <button className="phh-btn-logout" onClick={handleLogout} title="Se déconnecter">
                        <LogOut size={16} />
                    </button>
                </div>
            </div>

            {showHelp && (
                <div className="phh-help-overlay" onClick={() => setShowHelp(false)}>
                    <div className="phh-help-modal" onClick={e => e.stopPropagation()}>
                        <div className="phh-help-head">
                            <span><HelpCircle size={18} color="#0078a4" /> Aide — Parapheur électronique</span>
                            <button className="phh-help-close" onClick={() => setShowHelp(false)}><X size={18} /></button>
                        </div>
                        <div className="phh-help-body">
                            {helpLoading ? (
                                <p style={{ color: '#64748b' }}>Chargement de l'aide...</p>
                            ) : (
                                <div className="phh-help-md" dangerouslySetInnerHTML={{ __html: helpHtml || '' }} />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ParapheurAgentHeader;
