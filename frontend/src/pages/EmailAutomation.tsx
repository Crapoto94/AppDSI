import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
    Plus, Trash2, Edit3, Search, Mail, Clock, CheckCircle, XCircle,
    Play, ChevronDown, X, Bell, ScrollText, ListTodo, RefreshCw
} from 'lucide-react';

/* ─── types ──────────────────────────────────────────────────────────────── */
interface Recipient { id: number; automation_id: number; email: string; name: string; source: string; }
interface AutomLog  { id: number; automation_id: number; recipient_email: string; subject: string; status: string; error_message: string | null; sent_at: string; }
interface Automation {
    id: number; name: string; description: string; frequency: string; enabled: number;
    content_type: string; content_url: string; subject_template: string;
    condition_type: string; condition_value: string; last_sent_at: string | null;
    created_at: string; updated_at: string; recipients: Recipient[];
}
interface TaskAlertUser { username: string; displayname: string; email: string; }
interface MailLog {
    id: number; recipient: string; subject: string; status: string;
    error_message: string | null; source: string; sent_at: string;
}

type Tab = 'automations' | 'taches' | 'logs';

/* ─── helpers ────────────────────────────────────────────────────────────── */
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

const freqLabel = (f: string) => {
    if (f.startsWith('every:')) { const [, n] = f.match(/every:(\d+)/) || []; return `Toutes les ${n} min`; }
    if (f.startsWith('daily:')) { const [, h, m] = f.match(/daily:(\d{2}):(\d{2})/) || []; return `Quotidien à ${h}:${m}`; }
    if (f.startsWith('weekly:')) {
        const [, d, h, m] = f.match(/weekly:(\d):(\d{2}):(\d{2})/) || [];
        return `${['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][parseInt(d)] || '?'} à ${h}:${m}`;
    }
    return f;
};
const contentTypeLabel = (ct: string) => ct === 'calendar_daily' ? 'Calendrier DSI' : ct === 'url' ? 'URL' : ct;

const fmtDate = (s: string) => new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/* ════════════════════════════════════════════════════════════════════════════ */
const EmailAutomation: React.FC = () => {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    const [tab, setTab] = useState<Tab>('automations');

    /* ── automations ── */
    const [automations, setAutomations] = useState<Automation[]>([]);
    const [loadingAuto, setLoadingAuto] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Automation | null>(null);
    const [autoLogs, setAutoLogs] = useState<AutomLog[]>([]);
    const [showLogsFor, setShowLogsFor] = useState<number | null>(null);
    const [executing, setExecuting] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<{ username: string; displayName: string; email: string }[]>([]);
    const [searching, setSearching] = useState(false);
    const [newRecipientEmail, setNewRecipientEmail] = useState('');
    const [form, setForm] = useState({
        name: '', description: '', frequency: 'daily:08:00',
        content_type: 'calendar_daily', content_url: '',
        subject_template: 'Calendrier DSI - {{date}}',
        condition_type: 'none', condition_value: '', enabled: 1
    });

    /* ── tâches ── */
    const [taskUsers, setTaskUsers] = useState<TaskAlertUser[]>([]);
    const [loadingTaskUsers, setLoadingTaskUsers] = useState(false);

    /* ── logs globaux ── */
    const [mailLogs, setMailLogs] = useState<MailLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [logFilterSource, setLogFilterSource] = useState('');
    const [logFilterStatus, setLogFilterStatus] = useState('');

    /* ─── fetch helpers ─────────────────────────────────────────────────────── */
    const fetchAutomations = useCallback(async () => {
        setLoadingAuto(true);
        try { const r = await axios.get('/api/admin/email-automation', { headers }); setAutomations(r.data); }
        catch (e) { console.error(e); }
        finally { setLoadingAuto(false); }
    }, []);

    const fetchTaskUsers = useCallback(async () => {
        setLoadingTaskUsers(true);
        try { const r = await axios.get('/api/admin/email-automation/task-alerts', { headers }); setTaskUsers(r.data); }
        catch (e) { console.error(e); }
        finally { setLoadingTaskUsers(false); }
    }, []);

    const fetchMailLogs = useCallback(async () => {
        setLoadingLogs(true);
        try {
            const params: Record<string, string> = { limit: '300' };
            if (logFilterSource) params.source = logFilterSource;
            if (logFilterStatus) params.status = logFilterStatus;
            const r = await axios.get('/api/admin/email-automation/mail-logs', { headers, params });
            setMailLogs(r.data);
        } catch (e) { console.error(e); }
        finally { setLoadingLogs(false); }
    }, [logFilterSource, logFilterStatus]);

    useEffect(() => { fetchAutomations(); }, [fetchAutomations]);
    useEffect(() => { if (tab === 'taches') fetchTaskUsers(); }, [tab, fetchTaskUsers]);
    useEffect(() => { if (tab === 'logs') fetchMailLogs(); }, [tab, fetchMailLogs]);

    /* ─── automations actions ──────────────────────────────────────────────── */
    const openCreate = () => {
        setEditing(null);
        setForm({ name: '', description: '', frequency: 'daily:08:00', content_type: 'calendar_daily', content_url: '', subject_template: 'Calendrier DSI - {{date}}', condition_type: 'none', condition_value: '', enabled: 1 });
        setShowModal(true);
    };
    const openEdit = (a: Automation) => {
        setEditing(a);
        setForm({ name: a.name, description: a.description, frequency: a.frequency, content_type: a.content_type, content_url: a.content_url || '', subject_template: a.subject_template || '', condition_type: a.condition_type, condition_value: a.condition_value || '', enabled: a.enabled });
        setShowModal(true);
    };
    const save = async () => {
        try {
            editing ? await axios.put(`/api/admin/email-automation/${editing.id}`, form, { headers })
                    : await axios.post('/api/admin/email-automation', form, { headers });
            setShowModal(false); fetchAutomations();
        } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    };
    const deleteAuto = async (id: number) => {
        if (!confirm('Supprimer cette automatisation ?')) return;
        await axios.delete(`/api/admin/email-automation/${id}`, { headers });
        fetchAutomations();
    };
    const toggleEnabled = async (a: Automation) => {
        await axios.put(`/api/admin/email-automation/${a.id}`, { ...a, enabled: a.enabled ? 0 : 1 }, { headers });
        fetchAutomations();
    };
    const execute = async (id: number) => {
        setExecuting(id);
        try { const r = await axios.post(`/api/admin/email-automation/${id}/execute`, {}, { headers }); alert(r.data.message); fetchAutomations(); }
        catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
        finally { setExecuting(null); }
    };
    const addRecipient = async (automationId: number, email: string, name = '', source = 'manual') => {
        await axios.post(`/api/admin/email-automation/${automationId}/recipients`, { email, name, source }, { headers });
        setNewRecipientEmail('');
        const r = await axios.get(`/api/admin/email-automation/${automationId}`, { headers });
        setEditing(r.data);
        setAutomations(prev => prev.map(a => a.id === automationId ? r.data : a));
    };
    const removeRecipient = async (automationId: number, recipientId: number) => {
        await axios.delete(`/api/admin/email-automation/${automationId}/recipients/${recipientId}`, { headers });
        const r = await axios.get(`/api/admin/email-automation/${automationId}`, { headers });
        setEditing(r.data);
        setAutomations(prev => prev.map(a => a.id === automationId ? r.data : a));
    };
    const searchAD = async () => {
        if (!searchQuery || searchQuery.length < 2) return;
        setSearching(true);
        try { const r = await axios.post('/api/admin/email-automation/search-ad', { query: searchQuery }, { headers }); setSearchResults(r.data); }
        catch (e) { console.error(e); }
        finally { setSearching(false); }
    };
    const fetchAutoLogs = async (id: number) => {
        const r = await axios.get(`/api/admin/email-automation/${id}/logs`, { headers });
        setAutoLogs(r.data);
        setShowLogsFor(showLogsFor === id ? null : id);
    };

    /* ─── task alerts actions ──────────────────────────────────────────────── */
    const disableTaskAlert = async (username: string) => {
        if (!confirm(`Désactiver l'alerte de ${username} ?`)) return;
        await axios.delete(`/api/admin/email-automation/task-alerts/${encodeURIComponent(username)}`, { headers });
        setTaskUsers(prev => prev.filter(u => u.username !== username));
    };

    /* ─── tabs nav ─────────────────────────────────────────────────────────── */
    const tabBtn = (t: Tab, icon: React.ReactNode, label: string, badge?: number) => (
        <button onClick={() => setTab(t)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 20px', borderRadius: '10px 10px 0 0',
            border: '1px solid', borderBottom: 'none',
            borderColor: tab === t ? '#e2e8f0' : 'transparent',
            background: tab === t ? 'white' : 'transparent',
            color: tab === t ? '#4f46e5' : '#64748b',
            fontWeight: tab === t ? 700 : 500, fontSize: 14, cursor: 'pointer'
        }}>
            {icon} {label}
            {badge !== undefined && badge > 0 && (
                <span style={{ background: '#4f46e5', color: 'white', borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{badge}</span>
            )}
        </button>
    );

    /* ════════════════════════════════════════════════════════════════════════ */
    return (
        <div style={{ padding: '30px', maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Automatisation d'Emails</h1>
                    <p style={{ color: '#64748b', marginTop: 4, margin: 0 }}>Planifiez les envois automatiques et consultez les logs globaux.</p>
                </div>
                {tab === 'automations' && (
                    <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 12, fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer' }}>
                        <Plus size={18} /> Nouvelle automatisation
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #e2e8f0', marginBottom: 0 }}>
                {tabBtn('automations', <Mail size={15} />, 'Automations', automations.length)}
                {tabBtn('taches',      <Bell size={15} />, 'Alertes Tâches', taskUsers.length)}
                {tabBtn('logs',        <ScrollText size={15} />, 'Logs globaux')}
            </div>

            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 16px 16px', padding: 24, minHeight: 300 }}>

                {/* ─── ONGLET AUTOMATIONS ─────────────────────────────────── */}
                {tab === 'automations' && (
                    loadingAuto ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Chargement...</p> :
                    automations.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                            <Mail size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                            <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Aucune automatisation configurée</p>
                        </div>
                    ) : automations.map(a => (
                        <div key={a.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
                            <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
                                    <div style={{ width: 40, height: 40, borderRadius: 10, background: a.enabled ? '#eff6ff' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Mail size={20} style={{ color: a.enabled ? '#4f46e5' : '#94a3b8' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>{a.name}</span>
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 20, background: '#dbeafe', color: '#1e40af', fontWeight: 600 }}>{contentTypeLabel(a.content_type)}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 10, marginTop: 3, color: '#64748b', fontSize: '0.82rem' }}>
                                            <span><Clock size={12} style={{ verticalAlign: 'middle' }} /> {freqLabel(a.frequency)}</span>
                                            <span>· {a.recipients?.length || 0} dest.</span>
                                            {a.last_sent_at && <span>· {fmtDate(a.last_sent_at)}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <button onClick={() => toggleEnabled(a)} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid', borderColor: a.enabled ? '#22c55e' : '#e2e8f0', background: a.enabled ? '#f0fdf4' : '#f8fafc', color: a.enabled ? '#166534' : '#94a3b8', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                                        {a.enabled ? '✓ Actif' : 'Inactif'}
                                    </button>
                                    <button onClick={() => execute(a.id)} disabled={executing === a.id} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #4f46e5', background: '#eff6ff', color: '#4f46e5', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', fontWeight: 600 }}>
                                        <Play size={13} /> {executing === a.id ? '...' : 'Tester'}
                                    </button>
                                    <button onClick={() => fetchAutoLogs(a.id)} style={{ padding: 7, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', color: '#64748b' }} title="Logs"><ChevronDown size={15} /></button>
                                    <button onClick={() => openEdit(a)} style={{ padding: 7, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', color: '#64748b' }} title="Modifier"><Edit3 size={15} /></button>
                                    <button onClick={() => deleteAuto(a.id)} style={{ padding: 7, borderRadius: 8, border: '1px solid #fecdd3', background: '#fff1f2', cursor: 'pointer', color: '#e11d48' }} title="Supprimer"><Trash2 size={15} /></button>
                                </div>
                            </div>
                            {showLogsFor === a.id && (
                                <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 20px', background: '#f8fafc', maxHeight: 220, overflowY: 'auto' }}>
                                    <p style={{ margin: '0 0 8px', fontSize: 12, color: '#475569', fontWeight: 700 }}>Historique des envois</p>
                                    {autoLogs.filter(l => l.automation_id === a.id).length === 0
                                        ? <p style={{ color: '#94a3b8', fontSize: 13 }}>Aucun log</p>
                                        : autoLogs.filter(l => l.automation_id === a.id).slice(0, 50).map(l => (
                                            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}>
                                                {l.status === 'sent' ? <CheckCircle size={13} style={{ color: '#22c55e', flexShrink: 0 }} /> : <XCircle size={13} style={{ color: '#ef4444', flexShrink: 0 }} />}
                                                <span style={{ fontWeight: 600, minWidth: 200, color: '#334155' }}>{l.recipient_email}</span>
                                                <span style={{ flex: 1, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.subject}</span>
                                                <span style={{ color: '#94a3b8', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(l.sent_at)}</span>
                                                {l.error_message && <span style={{ color: '#ef4444', fontSize: 11 }}>{l.error_message}</span>}
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    ))
                )}

                {/* ─── ONGLET TÂCHES ──────────────────────────────────────── */}
                {tab === 'taches' && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                                    <ListTodo size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                                    Alertes tâches quotidiennes — 8h00
                                </h3>
                                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                                    Utilisateurs ayant activé le toggle « M'alerter » dans Mes Tâches.
                                </p>
                            </div>
                            <button onClick={fetchTaskUsers} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#475569' }}>
                                <RefreshCw size={13} style={{ animation: loadingTaskUsers ? 'spin 1s linear infinite' : 'none' }} /> Actualiser
                            </button>
                        </div>

                        {loadingTaskUsers ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Chargement...</p> :
                        taskUsers.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                                <Bell size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                                <p>Aucun utilisateur n'a activé les alertes tâches.</p>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase' }}>Utilisateur</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase' }}>Email</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase' }}>Username</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {taskUsers.map((u, i) => (
                                        <tr key={u.username} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>
                                                        {(u.displayname || u.username || '?')[0].toUpperCase()}
                                                    </div>
                                                    {u.displayname || u.username}
                                                </div>
                                            </td>
                                            <td style={{ padding: '10px 14px', color: '#475569' }}>{u.email || '—'}</td>
                                            <td style={{ padding: '10px 14px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 13 }}>{u.username}</td>
                                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => disableTaskAlert(u.username)}
                                                    style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #fecdd3', background: '#fff1f2', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                                                >
                                                    Désactiver
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {/* ─── ONGLET LOGS GLOBAUX ────────────────────────────────── */}
                {tab === 'logs' && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a', flex: 1 }}>
                                <ScrollText size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                                Journal global des emails ({mailLogs.length})
                            </h3>
                            <select value={logFilterSource} onChange={e => setLogFilterSource(e.target.value)}
                                style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#475569' }}>
                                <option value=''>Toutes les sources</option>
                                <option value='task_alert'>Alertes tâches</option>
                                <option value='automation'>Automations</option>
                                <option value='projet'>Projets</option>
                                <option value='system'>Système</option>
                            </select>
                            <select value={logFilterStatus} onChange={e => setLogFilterStatus(e.target.value)}
                                style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#475569' }}>
                                <option value=''>Tous les statuts</option>
                                <option value='sent'>Envoyé ✓</option>
                                <option value='failed'>Échec ✗</option>
                            </select>
                            <button onClick={fetchMailLogs} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#475569' }}>
                                <RefreshCw size={13} style={{ animation: loadingLogs ? 'spin 1s linear infinite' : 'none' }} /> Actualiser
                            </button>
                        </div>

                        {loadingLogs ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Chargement...</p> :
                        mailLogs.length === 0 ? (
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
                                        {mailLogs.map((l, i) => (
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
                    </div>
                )}
            </div>

            {/* ─── Modal création/édition ────────────────────────────────── */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'white', borderRadius: 20, padding: 30, width: '90%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
                        <h2 style={{ margin: '0 0 20px', fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>{editing ? 'Modifier' : 'Nouvelle'} automatisation</h2>

                        <div style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 5 }}>Nom *</label>
                            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }} placeholder="Ex: Calendrier quotidien DSI" />
                        </div>
                        <div style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 5 }}>Description</label>
                            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 5 }}>Fréquence</label>
                                <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }}>
                                    {['every:1','every:5','every:15','every:30','every:60','daily:05:00','daily:06:00','daily:07:00','daily:08:00','daily:09:00','daily:12:00','daily:17:00','weekly:1:08:00','weekly:5:08:00'].map(v => <option key={v} value={v}>{freqLabel(v)}</option>)}
                                    <option value="custom">Personnalisé</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 5 }}>Type de contenu</label>
                                <select value={form.content_type} onChange={e => setForm({ ...form, content_type: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }}>
                                    <option value="calendar_daily">Calendrier DSI</option>
                                    <option value="url">URL</option>
                                </select>
                            </div>
                        </div>
                        {form.frequency === 'custom' && (
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 5 }}>Expression</label>
                                <input value={''} onChange={e => setForm({ ...form, frequency: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }} placeholder="every:N ou daily:HH:MM" />
                            </div>
                        )}
                        {form.content_type === 'url' && (
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 5 }}>URL du contenu</label>
                                <input value={form.content_url} onChange={e => setForm({ ...form, content_url: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }} />
                            </div>
                        )}
                        <div style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 5 }}>Objet de l'email</label>
                            <input value={form.subject_template} onChange={e => setForm({ ...form, subject_template: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }} />
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Variables: {'{{date}}'}, {'{{eventCount}}'}</span>
                        </div>
                        <div style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 5 }}>Condition d'envoi</label>
                            <select value={form.condition_type} onChange={e => setForm({ ...form, condition_type: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }}>
                                <option value="none">Toujours envoyer</option>
                                <option value="has_events">Seulement s'il y a des événements</option>
                            </select>
                        </div>

                        {editing && (
                            <div style={{ marginBottom: 14, padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                <label style={{ fontWeight: 600, fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: 10 }}>Destinataires</label>
                                {editing.recipients?.map(r => (
                                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'white', borderRadius: 8, marginBottom: 6, border: '1px solid #e2e8f0' }}>
                                        <Mail size={13} style={{ color: '#64748b' }} />
                                        <span style={{ flex: 1, fontSize: '0.9rem' }}>{r.email}</span>
                                        {r.name && <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{r.name}</span>}
                                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 10, background: r.source === 'ad' ? '#dbeafe' : '#f1f5f9', color: r.source === 'ad' ? '#1e40af' : '#64748b' }}>{r.source === 'ad' ? 'AD' : 'Manuel'}</span>
                                        <button onClick={() => removeRecipient(editing.id, r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><X size={14} /></button>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                    <input value={newRecipientEmail} onChange={e => setNewRecipientEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newRecipientEmail.includes('@')) addRecipient(editing.id, newRecipientEmail); }} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem' }} placeholder="Ajouter un email..." />
                                    <button onClick={() => { if (newRecipientEmail.includes('@')) addRecipient(editing.id, newRecipientEmail); }} style={{ padding: '8px 14px', borderRadius: 8, background: '#4f46e5', color: 'white', border: 'none', cursor: 'pointer' }}><Plus size={14} /></button>
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') searchAD(); }} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem' }} placeholder="Rechercher dans l'AD..." />
                                    <button onClick={searchAD} disabled={searching} style={{ padding: '8px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}><Search size={14} /> {searching ? '...' : 'Chercher'}</button>
                                </div>
                                {searchResults.length > 0 && (
                                    <div style={{ marginTop: 8, maxHeight: 140, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                                        {searchResults.map((r, i) => (
                                            <div key={i} onClick={() => { if (r.email) { addRecipient(editing.id, r.email, r.displayName, 'ad'); setSearchResults([]); setSearchQuery(''); } }} style={{ padding: '8px 12px', cursor: r.email ? 'pointer' : 'default', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: r.email ? '#0f172a' : '#94a3b8' }}>
                                                <span style={{ fontWeight: 600 }}>{r.displayName}</span>
                                                <span>{r.email || 'Pas d\'email'}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                            <button onClick={() => setShowModal(false)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontWeight: 600 }}>Annuler</button>
                            <button onClick={save} disabled={!form.name} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: form.name ? '#4f46e5' : '#cbd5e1', color: 'white', cursor: form.name ? 'pointer' : 'not-allowed', fontWeight: 700 }}>Enregistrer</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmailAutomation;
