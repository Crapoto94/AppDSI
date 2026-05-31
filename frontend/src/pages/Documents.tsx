import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Eye, Trash2, Search, Filter } from 'lucide-react';
import DocumentViewer from '../components/DocumentViewer';

/**
 * Page Documents — vue centralisée de la gestion documentaire.
 *
 * Liste tous les documents de hub_docs avec filtres par module et entityType,
 * recherche par titre, et ouverture du viewer intégré.
 */

interface DocSummary {
    id: number;
    module: string;
    entity_type: string;
    entity_id: string;
    title: string;
    current_version: number;
    metadata: any;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

const MODULES = [
    { key: '', label: 'Tous les modules' },
    { key: 'certificats', label: 'Certificats' },
    { key: 'projets', label: 'Projets' },
    { key: 'contrats', label: 'Contrats' },
    { key: 'tickets', label: 'Tickets' },
    { key: 'telecom', label: 'Télécom' },
    { key: 'rencontres', label: 'Rencontres' },
    { key: 'tasks', label: 'Tâches' },
    { key: 'live', label: 'Live' },
];

function formatDate(iso: string): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
}

export default function Documents() {
    const { token, user } = useAuth();
    const [docs, setDocs] = useState<DocSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [moduleFilter, setModuleFilter] = useState('');
    const [search, setSearch] = useState('');
    const [activeDocId, setActiveDocId] = useState<number | null>(null);

    const canEdit = ['admin', 'superadmin'].includes(user?.role || '');

    const load = async () => {
        setLoading(true);
        try {
            // Pas d'endpoint global "list" pour l'instant : on requête les principaux entityTypes
            // par module en parallèle, et on agrège côté front. Un endpoint dédié /api/documents
            // (sans entityId) pourrait simplifier ça plus tard.
            const modules = moduleFilter ? [moduleFilter] : MODULES.filter(m => m.key).map(m => m.key);
            const requests: Promise<any>[] = [];
            for (const mod of modules) {
                // On ne connaît pas tous les entity ids — on utilise un endpoint à étendre.
                // Pour démarrer simple, on lit directement la base via /api/documents/all (à ajouter)
                // ou on délègue au backend. Ici on fait un appel direct par module sans entityId :
                // on s'appuie sur un nouvel endpoint /api/documents/by-module.
                requests.push(
                    axios.get('/api/documents/by-module', {
                        params: { module: mod },
                        headers: { Authorization: `Bearer ${token}` },
                    }).then(r => r.data).catch(() => [])
                );
            }
            const arrs = await Promise.all(requests);
            const all: DocSummary[] = arrs.flat();
            all.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
            setDocs(all);
        } catch (e) {
            setDocs([]);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [moduleFilter, token]);

    const filtered = useMemo(() => {
        if (!search.trim()) return docs;
        const q = search.toLowerCase();
        return docs.filter(d => d.title.toLowerCase().includes(q) || d.module.toLowerCase().includes(q));
    }, [docs, search]);

    const handleDelete = async (id: number, title: string) => {
        if (!confirm(`Supprimer "${title}" ? Le document et toutes ses versions seront supprimés du stockage.`)) return;
        try {
            await axios.delete(`/api/documents/${id}/purge`, { headers: { Authorization: `Bearer ${token}` } });
            await load();
        } catch (err: any) {
            alert(err?.response?.data?.error || 'Erreur suppression');
        }
    };

    return (
        <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <FileText size={28} color="#4a6cf7" />
                <div>
                    <h1 style={{ margin: 0, fontSize: 24, color: '#1f2937' }}>Gestion documentaire</h1>
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                        Tous les documents de l'application, centralisés avec versionning.
                    </p>
                </div>
            </div>

            {/* Filtres */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px' }}>
                    <Search size={16} color="#9ca3af" />
                    <input
                        type="text"
                        placeholder="Rechercher par titre…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ border: 'none', outline: 'none', flex: 1, fontSize: 14 }}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px' }}>
                    <Filter size={16} color="#9ca3af" />
                    <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} style={{ border: 'none', outline: 'none', fontSize: 14, background: 'transparent' }}>
                        {MODULES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                </div>
                <button onClick={load} style={{ background: '#4a6cf7', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                    Rafraîchir
                </button>
            </div>

            {loading && <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Chargement…</div>}

            {!loading && filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', background: '#fff', borderRadius: 8 }}>
                    Aucun document {moduleFilter && `dans le module "${moduleFilter}"`}.
                </div>
            )}

            {!loading && filtered.length > 0 && (
                <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#f9fafb' }}>
                            <tr style={{ textAlign: 'left', fontSize: 12, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                <th style={{ padding: '10px 12px' }}>Titre</th>
                                <th style={{ padding: '10px 12px' }}>Module</th>
                                <th style={{ padding: '10px 12px' }}>Type</th>
                                <th style={{ padding: '10px 12px' }}>Entité</th>
                                <th style={{ padding: '10px 12px' }}>Versions</th>
                                <th style={{ padding: '10px 12px' }}>MAJ</th>
                                <th style={{ padding: '10px 12px' }}>Créé par</th>
                                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(d => (
                                <tr key={d.id} style={{ borderTop: '1px solid #f3f4f6', fontSize: 13 }}>
                                    <td style={{ padding: '10px 12px', maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.title}>
                                        <strong>{d.title}</strong>
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>
                                        <span style={{ background: '#eef2ff', color: '#4a6cf7', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                                            {d.module}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{d.entity_type}</td>
                                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>#{d.entity_id}</td>
                                    <td style={{ padding: '10px 12px' }}>v{d.current_version}</td>
                                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{formatDate(d.updated_at)}</td>
                                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{d.created_by || '—'}</td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                        <button onClick={() => setActiveDocId(d.id)} style={btn.view} title="Voir">
                                            <Eye size={14} />
                                        </button>
                                        {canEdit && (
                                            <button onClick={() => handleDelete(d.id, d.title)} style={btn.del} title="Supprimer">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeDocId != null && (
                <DocumentViewer
                    documentId={activeDocId}
                    canEdit={canEdit}
                    onClose={() => setActiveDocId(null)}
                    onChanged={load}
                />
            )}
        </div>
    );
}

const btn = {
    view: {
        background: '#fff', color: '#4a6cf7', border: '1px solid #4a6cf7',
        padding: '4px 8px', borderRadius: 4, cursor: 'pointer', marginRight: 4,
    } as React.CSSProperties,
    del: {
        background: '#fff', color: '#dc2626', border: '1px solid #fca5a5',
        padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
    } as React.CSSProperties,
};
