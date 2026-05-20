import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Trash2, Edit3, Search, Mail, Clock, CheckCircle, XCircle, Play, ChevronDown, X } from 'lucide-react';

interface Recipient {
    id: number;
    automation_id: number;
    email: string;
    name: string;
    source: string;
}

interface LogEntry {
    id: number;
    automation_id: number;
    recipient_email: string;
    subject: string;
    status: string;
    error_message: string | null;
    sent_at: string;
}

interface Automation {
    id: number;
    name: string;
    description: string;
    frequency: string;
    enabled: number;
    content_type: string;
    content_url: string;
    subject_template: string;
    condition_type: string;
    condition_value: string;
    last_sent_at: string | null;
    created_at: string;
    updated_at: string;
    recipients: Recipient[];
}

const EmailAutomation: React.FC = () => {
    const [automations, setAutomations] = useState<Automation[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Automation | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [showLogsFor, setShowLogsFor] = useState<number | null>(null);
    const [executing, setExecuting] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<{username: string; displayName: string; email: string}[]>([]);
    const [searching, setSearching] = useState(false);
    const [newRecipientEmail, setNewRecipientEmail] = useState('');

    const [form, setForm] = useState({
        name: '', description: '', frequency: 'daily:08:00',
        content_type: 'calendar_daily', content_url: '',
        subject_template: 'Calendrier DSI - {{date}}',
        condition_type: 'none', condition_value: '', enabled: 1
    });

    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    useEffect(() => { fetchAutomations(); }, []);

    const fetchAutomations = async () => {
        try {
            const res = await axios.get('/api/admin/email-automation', { headers });
            setAutomations(res.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

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
            if (editing) {
                await axios.put(`/api/admin/email-automation/${editing.id}`, form, { headers });
            } else {
                await axios.post('/api/admin/email-automation', form, { headers });
            }
            setShowModal(false);
            fetchAutomations();
        } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    };

    const deleteAutomation = async (id: number) => {
        if (!confirm('Supprimer cette automatisation ?')) return;
        try {
            await axios.delete(`/api/admin/email-automation/${id}`, { headers });
            fetchAutomations();
        } catch (e) { console.error(e); }
    };

    const toggleEnabled = async (a: Automation) => {
        await axios.put(`/api/admin/email-automation/${a.id}`, { ...a, enabled: a.enabled ? 0 : 1 }, { headers });
        fetchAutomations();
    };

    const execute = async (id: number) => {
        setExecuting(id);
        try {
            const res = await axios.post(`/api/admin/email-automation/${id}/execute`, {}, { headers });
            alert(res.data.message);
            fetchAutomations();
        } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
        finally { setExecuting(null); }
    };

    const addRecipient = async (automationId: number, email: string, name: string = '', source: string = 'manual') => {
        try {
            await axios.post(`/api/admin/email-automation/${automationId}/recipients`, { email, name, source }, { headers });
            setNewRecipientEmail('');
            const res = await axios.get(`/api/admin/email-automation/${automationId}`, { headers });
            const updated = res.data;
            setEditing(updated);
            setAutomations(prev => prev.map(a => a.id === automationId ? updated : a));
        } catch (e) { console.error(e); }
    };

    const removeRecipient = async (automationId: number, recipientId: number) => {
        try {
            await axios.delete(`/api/admin/email-automation/${automationId}/recipients/${recipientId}`, { headers });
            const res = await axios.get(`/api/admin/email-automation/${automationId}`, { headers });
            const updated = res.data;
            setEditing(updated);
            setAutomations(prev => prev.map(a => a.id === automationId ? updated : a));
        } catch (e) { console.error(e); }
    };

    const searchAD = async () => {
        if (!searchQuery || searchQuery.length < 2) return;
        setSearching(true);
        try {
            const res = await axios.post('/api/admin/email-automation/search-ad', { query: searchQuery }, { headers });
            setSearchResults(res.data);
        } catch (e) { console.error(e); }
        finally { setSearching(false); }
    };

    const fetchLogs = async (id: number) => {
        try {
            const res = await axios.get(`/api/admin/email-automation/${id}/logs`, { headers });
            setLogs(res.data);
            setShowLogsFor(showLogsFor === id ? null : id);
        } catch (e) { console.error(e); }
    };

    const freqLabel = (f: string) => {
        if (f.startsWith('every:')) { const [, n] = f.match(/every:(\d+)/) || []; return `Toutes les ${n} min`; }
        if (f.startsWith('daily:')) { const [, h, m] = f.match(/daily:(\d{2}):(\d{2})/) || []; return `Tous les jours à ${h}:${m}`; }
        if (f.startsWith('weekly:')) {
            const [, d, h, m] = f.match(/weekly:(\d):(\d{2}):(\d{2})/) || [];
            const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
            return `Chaque ${days[parseInt(d)] || '?'} à ${h}:${m}`;
        }
        return f;
    };

    const contentTypeLabel = (ct: string) => {
        if (ct === 'calendar_daily') return 'Calendrier DSI';
        if (ct === 'url') return 'URL';
        return ct;
    };

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Chargement...</div>;

    return (
        <div style={{ padding: '30px', maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Automatisation d'Emails</h1>
                    <p style={{ color: '#64748b', marginTop: 4 }}>Planifiez et gérez l'envoi automatique d'emails.</p>
                </div>
                <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 12, fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer' }}>
                    <Plus size={18} /> Nouvelle automatisation
                </button>
            </div>

            {automations.length === 0 && (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', background: 'white', borderRadius: 20 }}>
                    <Mail size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                    <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Aucune automatisation configurée</p>
                    <p style={{ fontSize: '0.9rem' }}>Créez une automatisation pour planifier l'envoi d'emails.</p>
                </div>
            )}

            {automations.map(a => (
                <div key={a.id} style={{ background: 'white', borderRadius: 16, marginBottom: 20, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
                            <div style={{ width: 44, height: 44, borderRadius: 12, background: a.enabled ? '#eff6ff' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Mail size={22} style={{ color: a.enabled ? '#4f46e5' : '#94a3b8' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a' }}>{a.name}</span>
                                    <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: 20, background: a.content_type === 'calendar_daily' ? '#dbeafe' : '#fef3c7', color: a.content_type === 'calendar_daily' ? '#1e40af' : '#92400e', fontWeight: 600 }}>
                                        {contentTypeLabel(a.content_type)}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, color: '#64748b', fontSize: '0.85rem' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={14} /> {freqLabel(a.frequency)}</span>
                                    <span>·</span>
                                    <span>{a.recipients?.length || 0} destinataire{(a.recipients?.length || 0) > 1 ? 's' : ''}</span>
                                    {a.last_sent_at && <><span>·</span><span>Dernier envoi: {new Date(a.last_sent_at).toLocaleString('fr-FR')}</span></>}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button onClick={() => toggleEnabled(a)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid', borderColor: a.enabled ? '#22c55e' : '#e2e8f0', background: a.enabled ? '#f0fdf4' : '#f8fafc', color: a.enabled ? '#166534' : '#94a3b8', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                                {a.enabled ? '✓ Actif' : 'Inactif'}
                            </button>
                            <button onClick={() => execute(a.id)} disabled={executing === a.id} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #4f46e5', background: '#eff6ff', color: '#4f46e5', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem', fontWeight: 600 }}>
                                <Play size={14} /> {executing === a.id ? 'Envoi...' : 'Tester'}
                            </button>
                            <button onClick={() => fetchLogs(a.id)} style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', color: '#64748b' }} title="Voir les logs">
                                <ChevronDown size={16} />
                            </button>
                            <button onClick={() => openEdit(a)} style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', color: '#64748b' }} title="Modifier">
                                <Edit3 size={16} />
                            </button>
                            <button onClick={() => deleteAutomation(a.id)} style={{ padding: 8, borderRadius: 8, border: '1px solid #fecdd3', background: '#fff1f2', cursor: 'pointer', color: '#e11d48' }} title="Supprimer">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>

                    {showLogsFor === a.id && (
                        <div style={{ borderTop: '1px solid #e2e8f0', padding: '16px 24px', background: '#f8fafc', maxHeight: 250, overflow: 'auto' }}>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#475569' }}>Historique des envois</h4>
                            {logs.filter(l => l.automation_id === a.id).length === 0 ? (
                                <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Aucun log</p>
                            ) : logs.filter(l => l.automation_id === a.id).slice(0, 50).map(l => (
                                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: '0.85rem', borderBottom: '1px solid #f1f5f9' }}>
                                    {l.status === 'sent' ? <CheckCircle size={14} style={{ color: '#22c55e' }} /> : <XCircle size={14} style={{ color: '#ef4444' }} />}
                                    <span style={{ color: '#334155', fontWeight: 600, minWidth: 200 }}>{l.recipient_email}</span>
                                    <span style={{ color: '#64748b' }}>{l.subject}</span>
                                    <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '0.8rem' }}>{new Date(l.sent_at).toLocaleString('fr-FR')}</span>
                                    {l.error_message && <span style={{ color: '#ef4444', fontSize: '0.8rem', marginLeft: 8 }}>Erreur: {l.error_message}</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}

            {showModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'white', borderRadius: 20, padding: 30, width: '90%', maxWidth: 700, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
                        <h2 style={{ margin: '0 0 20px 0', fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>{editing ? 'Modifier' : 'Nouvelle'} automatisation</h2>

                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 6 }}>Nom</label>
                            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }} placeholder="Ex: Calendrier quotidien DSI" />
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 6 }}>Description</label>
                            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }} placeholder="Description optionnelle" />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 6 }}>Fréquence</label>
                                <select value={form.frequency.startsWith('every:') || form.frequency.startsWith('daily:') || form.frequency.startsWith('weekly:') ? form.frequency : 'custom'} onChange={e => setForm({ ...form, frequency: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }}>
                                    <option value="every:1">Toutes les 1 min</option>
                                    <option value="every:2">Toutes les 2 min</option>
                                    <option value="every:5">Toutes les 5 min</option>
                                    <option value="every:10">Toutes les 10 min</option>
                                    <option value="every:15">Toutes les 15 min</option>
                                    <option value="every:30">Toutes les 30 min</option>
                                    <option value="every:60">Toutes les heures</option>
                                    <option value="daily:05:00">Tous les jours à 05:00</option>
                                    <option value="daily:06:00">Tous les jours à 06:00</option>
                                    <option value="daily:07:00">Tous les jours à 07:00</option>
                                    <option value="daily:08:00">Tous les jours à 08:00</option>
                                    <option value="daily:09:00">Tous les jours à 09:00</option>
                                    <option value="daily:12:00">Tous les jours à 12:00</option>
                                    <option value="daily:17:00">Tous les jours à 17:00</option>
                                    <option value="weekly:1:08:00">Lundi à 08:00</option>
                                    <option value="weekly:5:08:00">Vendredi à 08:00</option>
                                    <option value="custom">Personnalisé</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 6 }}>Type de contenu</label>
                                <select value={form.content_type} onChange={e => setForm({ ...form, content_type: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }}>
                                    <option value="calendar_daily">Calendrier DSI du jour</option>
                                    <option value="url">URL (contenu web)</option>
                                </select>
                            </div>
                        </div>

                        {form.frequency === 'custom' && (
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 6 }}>Expression cron ou intervalle</label>
                                <input value={form.frequency === 'custom' ? '' : form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }} placeholder="every:2 ou 0 8 * * *" />
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Format : every:N (minutes), daily:HH:MM, weekly:D:HH:MM, ou expression cron</span>
                            </div>
                        )}

                        {form.content_type === 'url' && (
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 6 }}>URL du contenu</label>
                                <input value={form.content_url} onChange={e => setForm({ ...form, content_url: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }} placeholder="https://example.com/page" />
                            </div>
                        )}

                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 6 }}>Objet de l'email</label>
                            <input value={form.subject_template} onChange={e => setForm({ ...form, subject_template: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }} placeholder="Calendrier DSI - {{date}}" />
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Variables disponibles: {'{{date}}'}, {'{{eventCount}}'}</span>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 6 }}>Condition d'envoi</label>
                            <select value={form.condition_type} onChange={e => setForm({ ...form, condition_type: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }}>
                                <option value="none">Toujours envoyer (sans condition)</option>
                                <option value="has_events">Envoyer uniquement s'il y a des événements</option>
                            </select>
                        </div>

                        {editing && (
                            <div style={{ marginBottom: 16, padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <label style={{ fontWeight: 600, fontSize: '0.85rem', color: '#475569' }}>Destinataires</label>
                                </div>

                                {editing.recipients?.map(r => (
                                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'white', borderRadius: 8, marginBottom: 6, border: '1px solid #e2e8f0' }}>
                                        <Mail size={14} style={{ color: '#64748b' }} />
                                        <span style={{ flex: 1, fontSize: '0.9rem' }}>{r.email}</span>
                                        {r.name && <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{r.name}</span>}
                                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 10, background: r.source === 'ad' ? '#dbeafe' : '#f1f5f9', color: r.source === 'ad' ? '#1e40af' : '#64748b' }}>{r.source === 'ad' ? 'AD' : 'Manuel'}</span>
                                        <button onClick={() => removeRecipient(editing.id, r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}><X size={14} /></button>
                                    </div>
                                ))}

                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                    <input value={newRecipientEmail} onChange={e => setNewRecipientEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newRecipientEmail.includes('@')) { addRecipient(editing.id, newRecipientEmail); setNewRecipientEmail(''); } }} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem' }} placeholder="Ajouter un email directement..." />
                                    <button onClick={() => { if (newRecipientEmail.includes('@')) { addRecipient(editing.id, newRecipientEmail); setNewRecipientEmail(''); } }} style={{ padding: '8px 14px', borderRadius: 8, background: '#4f46e5', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                                        <Plus size={14} />
                                    </button>
                                </div>

                                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') searchAD(); }} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem' }} placeholder="Rechercher dans l'AD..." />
                                    <button onClick={searchAD} disabled={searching} style={{ padding: '8px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}>
                                        <Search size={14} /> {searching ? '...' : 'Chercher'}
                                    </button>
                                </div>

                                {searchResults.length > 0 && (
                                    <div style={{ marginTop: 8, maxHeight: 150, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                                        {searchResults.map((r, i) => (
                                            <div key={i} onClick={() => { if (r.email) { addRecipient(editing.id, r.email, r.displayName, 'ad'); setSearchResults([]); setSearchQuery(''); } }} style={{ padding: '8px 12px', cursor: r.email ? 'pointer' : 'default', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', color: r.email ? '#0f172a' : '#94a3b8', fontSize: '0.85rem' }}>
                                                <span style={{ fontWeight: 600 }}>{r.displayName}</span>
                                                <span>{r.email || 'Pas d\'email'}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                            <button onClick={() => setShowModal(false)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>Annuler</button>
                            <button onClick={save} disabled={!form.name} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: form.name ? '#4f46e5' : '#cbd5e1', color: 'white', cursor: form.name ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '0.9rem' }}>Enregistrer</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmailAutomation;