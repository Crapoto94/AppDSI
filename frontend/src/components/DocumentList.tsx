import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Eye, Upload, Trash2 } from 'lucide-react';
import DocumentViewer from './DocumentViewer';

/**
 * Liste des documents d'une entité + bouton upload + ouverture viewer.
 *
 * Usage :
 *   <DocumentList module="projets" entityType="documentation" entityId={9} canEdit />
 *
 * Les documents sont récupérés via /api/documents/by-entity et affichés
 * sous forme de liste cliquable. Au clic → ouverture du DocumentViewer.
 */

interface DocSummary {
    id: number;
    title: string;
    current_version: number;
    metadata: any;
    created_at: string;
    updated_at: string;
    current_version_row?: {
        original_name: string;
        mimetype: string | null;
        size: number | null;
        uploaded_at: string;
        uploaded_by: string | null;
    };
}

interface Props {
    module: string;
    entityType?: string;
    entityId: string | number;
    canEdit?: boolean;
    title?: string;
}

function formatSize(bytes: number | null | undefined): string {
    if (!bytes && bytes !== 0) return '—';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
}

function formatDate(iso: string): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
}

export default function DocumentList({ module, entityType = 'attachment', entityId, canEdit = false, title }: Props) {
    const { token } = useAuth();
    const [docs, setDocs] = useState<DocSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeDocId, setActiveDocId] = useState<number | null>(null);
    const [uploading, setUploading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await axios.get('/api/documents/by-entity', {
                params: { module, entityType, entityId },
                headers: { Authorization: `Bearer ${token}` },
            });
            setDocs(data || []);
        } catch (e) {
            setDocs([]);
        } finally { setLoading(false); }
    }, [module, entityType, entityId, token]);

    useEffect(() => { load(); }, [load]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('module', module);
            fd.append('entityType', entityType);
            fd.append('entityId', String(entityId));
            await axios.post('/api/documents', fd, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
            });
            await load();
        } catch (err: any) {
            alert(err?.response?.data?.error || 'Erreur upload');
        } finally { setUploading(false); }
    };

    const handleDelete = async (id: number, title: string) => {
        if (!confirm(`Supprimer "${title}" ? Le document et toutes ses versions seront supprimés.`)) return;
        try {
            await axios.delete(`/api/documents/${id}/purge`, { headers: { Authorization: `Bearer ${token}` } });
            await load();
        } catch (err: any) {
            alert(err?.response?.data?.error || 'Erreur suppression');
        }
    };

    return (
        <div>
            {(title || canEdit) && (
                <div style={s.head}>
                    {title && <h3 style={s.h3}>{title}</h3>}
                    {canEdit && (
                        <label style={s.uploadBtn}>
                            <Upload size={14} />
                            {uploading ? 'Envoi…' : 'Ajouter un document'}
                            <input type="file" hidden onChange={handleUpload} disabled={uploading} />
                        </label>
                    )}
                </div>
            )}
            {loading && <div style={s.empty}>Chargement…</div>}
            {!loading && docs.length === 0 && <div style={s.empty}>Aucun document</div>}
            {!loading && docs.length > 0 && (
                <div style={s.list}>
                    {docs.map(d => (
                        <div key={d.id} style={s.row}>
                            <FileText size={18} color="#4a6cf7" style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={s.rowTitle} title={d.title}>{d.title}</div>
                                <div style={s.rowMeta}>
                                    v{d.current_version} ·{' '}
                                    {d.current_version_row && (
                                        <>{formatSize(d.current_version_row.size)} · {formatDate(d.current_version_row.uploaded_at)}</>
                                    )}
                                    {d.current_version_row?.uploaded_by && <> · par {d.current_version_row.uploaded_by}</>}
                                </div>
                            </div>
                            <button onClick={() => setActiveDocId(d.id)} style={s.viewBtn} title="Voir">
                                <Eye size={14} /> Voir
                            </button>
                            {canEdit && (
                                <button onClick={() => handleDelete(d.id, d.title)} style={s.delBtn} title="Supprimer">
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    ))}
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

const s: Record<string, React.CSSProperties> = {
    head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    h3: { margin: 0, fontSize: 15, fontWeight: 600, color: '#1f2937' },
    uploadBtn: {
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13,
        background: '#4a6cf7', color: '#fff', padding: '6px 12px', borderRadius: 6,
        cursor: 'pointer', fontWeight: 500,
    },
    empty: { padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13, fontStyle: 'italic' },
    list: { display: 'flex', flexDirection: 'column', gap: 6 },
    row: {
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
        border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff',
    },
    rowTitle: {
        fontSize: 14, fontWeight: 500, color: '#1f2937',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    rowMeta: { fontSize: 11, color: '#6b7280', marginTop: 2 },
    viewBtn: {
        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12,
        background: '#fff', color: '#4a6cf7', border: '1px solid #4a6cf7',
        padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontWeight: 500,
    },
    delBtn: {
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: '#fff', color: '#dc2626', border: '1px solid #fca5a5',
        padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
    },
};
