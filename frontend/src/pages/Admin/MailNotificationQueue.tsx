import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Mail, Trash2, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

interface QueueItem {
    id: number;
    ticket_id: number | null;
    recipient_email: string;
    recipient_name: string;
    subject: string;
    body_html: string;
    status: string;
    created_at: string;
    sent_at: string | null;
}

const fmtDate = (s: string) => new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const MailNotificationQueue: React.FC = () => {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    const [items, setItems] = useState<QueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');

    const fetch = async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = {};
            if (filter) params.status = filter;
            const r = await axios.get('/api/admin/notification-queue', { headers, params });
            setItems(r.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetch(); }, [filter]);

    const remove = async (id: number) => {
        if (!confirm('Supprimer cet élément de la file ?')) return;
        try { await axios.delete(`/api/admin/notification-queue/${id}`, { headers }); fetch(); }
        catch (e) { console.error(e); }
    };

    const clearAll = async (status?: string) => {
        const msg = status
            ? `Supprimer tous les éléments "${status}" ?`
            : 'Vider toute la file d\'attente ?';
        if (!confirm(msg)) return;
        try {
            const params: Record<string, string> = {};
            if (status) params.status = status;
            const r = await axios.delete('/api/admin/notification-queue', { headers, params });
            alert(r.data.message);
            fetch();
        } catch (e) { console.error(e); }
    };

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a', flex: 1 }}>
                    <Mail size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    File d'attente des notifications ({items.length})
                </h3>
                <select value={filter} onChange={e => setFilter(e.target.value)}
                    style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#475569' }}>
                    <option value=''>Tous les statuts</option>
                    <option value='pending'>En attente</option>
                    <option value='sent'>Envoyé</option>
                    <option value='failed'>Échec</option>
                </select>
                <button onClick={() => clearAll('pending')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#fef2f2', border: '1px solid #fecdd3', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#dc2626' }}>
                    <Trash2 size={13} /> Vider les attentes
                </button>
                <button onClick={() => clearAll()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#475569' }}>
                    <Trash2 size={13} /> Tout vider
                </button>
                <button onClick={fetch} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#475569' }}>
                    <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Actualiser
                </button>
            </div>

            {loading ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Chargement...</p> :
            items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                    <Mail size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                    <p>Aucune notification dans la file.</p>
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Statut</th>
                                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Email</th>
                                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Objet</th>
                                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Ticket</th>
                                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Créé le</th>
                                <th style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, i) => (
                                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                        {item.status === 'pending'
                                            ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#ca8a04', fontWeight: 600 }}><Clock size={13} /> En attente</span>
                                            : item.status === 'sent'
                                            ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a', fontWeight: 600 }}><CheckCircle size={13} /> Envoyé</span>
                                            : <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626', fontWeight: 600 }}><XCircle size={13} /> Échec</span>
                                        }
                                    </td>
                                    <td style={{ padding: '8px 12px', color: '#334155', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.recipient_email}</td>
                                    <td style={{ padding: '8px 12px', color: '#475569', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject}</td>
                                    <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 12 }}>{item.ticket_id || '—'}</td>
                                    <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(item.created_at)}</td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                        <button onClick={() => remove(item.id)} style={{ padding: 5, borderRadius: 6, border: '1px solid #fecdd3', background: '#fff1f2', cursor: 'pointer', color: '#e11d48', display: 'inline-flex', alignItems: 'center' }}>
                                            <Trash2 size={13} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

export default MailNotificationQueue;
