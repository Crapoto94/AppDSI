import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { ScrollText, CheckCircle, XCircle, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface MailLog {
    id: number; recipient: string; subject: string; status: string;
    error_message: string | null; source: string; sent_at: string;
}

interface PageData {
    data: MailLog[];
    total: number;
    page: number;
    perPage: number;
}

const SOURCE_COLORS: Record<string, { bg: string; color: string }> = {
    task_alert:  { bg: '#dbeafe', color: '#1d4ed8' },
    automation:  { bg: '#ede9fe', color: '#7c3aed' },
    projet:      { bg: '#d1fae5', color: '#065f46' },
    system:      { bg: '#f1f5f9', color: '#475569' },
};
const sourceChip = (src: string) => {
    const c = SOURCE_COLORS[src] || SOURCE_COLORS.system;
    const labels: Record<string, string> = { task_alert: 'Tâches', automation: 'Automation', projet: 'Projet', system: 'Système' };
    return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.color, fontWeight: 700 }}>{labels[src] || src}</span>;
};

const fmtDate = (s: string) => new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const MailLogs: React.FC = () => {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    const [pageData, setPageData] = useState<PageData | null>(null);
    const [loading, setLoading] = useState(false);

    const [filterSource, setFilterSource] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [searchQ, setSearchQ] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(50);

    const totalPages = pageData ? Math.ceil(pageData.total / pageData.perPage) : 0;

    const fetch = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = { page: String(page), perPage: String(perPage) };
            if (filterSource) params.source = filterSource;
            if (filterStatus) params.status = filterStatus;
            if (searchQ) params.q = searchQ;
            const r = await axios.get('/api/admin/email-automation/mail-logs', { headers, params });
            setPageData(r.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [page, perPage, filterSource, filterStatus, searchQ]);

    useEffect(() => { fetch(); }, [fetch]);

    const doSearch = () => {
        setSearchQ(searchInput);
        setPage(1);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') doSearch();
    };

    const goToPage = (p: number) => {
        if (p >= 1 && p <= totalPages) setPage(p);
    };

    return (
        <div>
            {/* Filtres + recherche */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a', flex: 1 }}>
                    <ScrollText size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    Journal global des emails{pageData ? ` (${pageData.total})` : ''}
                </h3>

                {/* Recherche libre */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 8px', background: 'white' }}>
                    <Search size={14} style={{ color: '#94a3b8' }} />
                    <input
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Rechercher (destinataire, sujet…)"
                        style={{ border: 'none', outline: 'none', padding: '4px 6px', fontSize: 13, minWidth: 200, color: '#334155' }}
                    />
                    <button onClick={doSearch} style={{ padding: '3px 10px', borderRadius: 6, background: '#4f46e5', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>OK</button>
                </div>

                <select value={filterSource} onChange={e => { setFilterSource(e.target.value); setPage(1); }}
                    style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#475569' }}>
                    <option value=''>Toutes les sources</option>
                    <option value='task_alert'>Alertes tâches</option>
                    <option value='automation'>Automations</option>
                    <option value='projet'>Projets</option>
                    <option value='system'>Système</option>
                </select>
                <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
                    style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#475569' }}>
                    <option value=''>Tous les statuts</option>
                    <option value='sent'>Envoyé ✓</option>
                    <option value='failed'>Échec ✗</option>
                </select>
                <button onClick={fetch} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#475569' }}>
                    <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Actualiser
                </button>
            </div>

            {/* Tableau */}
            {loading ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Chargement...</p> :
            !pageData || pageData.data.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                    <ScrollText size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                    <p>Aucun email enregistré.</p>
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Statut</th>
                                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Destinataire</th>
                                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Objet</th>
                                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Source</th>
                                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageData.data.map((l, i) => (
                                <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}
                                    title={l.error_message || ''}>
                                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                        {l.status === 'sent'
                                            ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a', fontWeight: 600 }}><CheckCircle size={13} /> Envoyé</span>
                                            : <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626', fontWeight: 600 }} title={l.error_message || ''}><XCircle size={13} /> Échec</span>
                                        }
                                    </td>
                                    <td style={{ padding: '8px 12px', color: '#334155', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.recipient}</td>
                                    <td style={{ padding: '8px 12px', color: '#475569', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.subject}</td>
                                    <td style={{ padding: '8px 12px' }}>{sourceChip(l.source)}</td>
                                    <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(l.sent_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {pageData && pageData.total > perPage && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
                    <button onClick={() => goToPage(page - 1)} disabled={page <= 1}
                        style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: page <= 1 ? '#f1f5f9' : 'white', color: page <= 1 ? '#cbd5e1' : '#475569', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ChevronLeft size={14} /> Précédent
                    </button>

                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                        let p: number;
                        if (totalPages <= 7) {
                            p = i + 1;
                        } else if (page <= 4) {
                            p = i + 1;
                        } else if (page >= totalPages - 3) {
                            p = totalPages - 6 + i;
                        } else {
                            p = page - 3 + i;
                        }
                        return (
                            <button key={p} onClick={() => goToPage(p)}
                                style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid', borderColor: p === page ? '#4f46e5' : '#e2e8f0', background: p === page ? '#4f46e5' : 'white', color: p === page ? 'white' : '#475569', fontWeight: p === page ? 700 : 500, cursor: 'pointer', fontSize: 13 }}>
                                {p}
                            </button>
                        );
                    })}

                    <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages}
                        style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: page >= totalPages ? '#f1f5f9' : 'white', color: page >= totalPages ? '#cbd5e1' : '#475569', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                        Suivant <ChevronRight size={14} />
                    </button>

                    <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>
                        {((page - 1) * perPage) + 1}–{Math.min(page * perPage, pageData.total)} sur {pageData.total}
                    </span>

                    <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                        style={{ marginLeft: 8, padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, color: '#475569' }}>
                        <option value={25}>25 / page</option>
                        <option value={50}>50 / page</option>
                        <option value={100}>100 / page</option>
                        <option value={200}>200 / page</option>
                    </select>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

export default MailLogs;
