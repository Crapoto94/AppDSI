import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { X, Download, FileText, Image as ImageIcon, File, Clock, User, Upload } from 'lucide-react';

/**
 * DocumentViewer — modal de visualisation des documents du module centralisé.
 *
 * Usage :
 *   <DocumentViewer documentId={123} onClose={() => setOpen(false)} />
 *
 * Affiche : liste des versions à gauche, prévisualisation (PDF/image inline)
 * ou bouton de téléchargement à droite. L'upload d'une nouvelle version se
 * fait via le bouton "Ajouter une version" (si canEdit).
 */

interface DocVersion {
    id: number;
    version: number;
    filename: string;
    original_name: string;
    mimetype: string | null;
    size: number | null;
    storage_backend: string;
    uploaded_by: string | null;
    uploaded_at: string;
    metadata?: any;
}

interface DocMeta {
    id: number;
    module: string;
    entity_type: string;
    entity_id: string;
    title: string;
    current_version: number;
    metadata: any;
    created_by: string | null;
    created_at: string;
    versions: DocVersion[];
}

interface Props {
    documentId: number;
    onClose: () => void;
    canEdit?: boolean;     // afficher le bouton "Ajouter une version" / supprimer
    onChanged?: () => void; // appelé après upload/suppression
}

function isPreviewableMime(m: string | null | undefined): { kind: 'pdf' | 'image' | 'none' } {
    if (!m) return { kind: 'none' };
    const mm = m.toLowerCase();
    if (mm === 'application/pdf') return { kind: 'pdf' };
    if (mm.startsWith('image/')) return { kind: 'image' };
    return { kind: 'none' };
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
        const d = new Date(iso);
        return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
}

export default function DocumentViewer({ documentId, onClose, canEdit = false, onChanged }: Props) {
    const { token } = useAuth();
    const [doc, setDoc] = useState<DocMeta | null>(null);
    const [activeVersion, setActiveVersion] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    const load = async () => {
        setLoading(true); setError(null);
        try {
            const { data } = await axios.get(`/api/documents/${documentId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setDoc(data);
            setActiveVersion(data.current_version);
        } catch (e: any) {
            setError(e?.response?.data?.error || 'Impossible de charger le document');
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [documentId]);

    const current = useMemo(() => doc?.versions.find(v => v.version === activeVersion) || null, [doc, activeVersion]);

    const contentUrl = current
        ? `/api/documents/${documentId}/versions/${current.version}/content?mode=inline&token=${encodeURIComponent(token || '')}`
        : '';
    const downloadUrl = current
        ? `/api/documents/${documentId}/versions/${current.version}/content?token=${encodeURIComponent(token || '')}`
        : '';

    const preview = current ? isPreviewableMime(current.mimetype) : { kind: 'none' as const };

    const handleAddVersion = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            await axios.post(`/api/documents/${documentId}/versions`, fd, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
            });
            await load();
            onChanged?.();
        } catch (e: any) {
            alert(e?.response?.data?.error || 'Erreur upload');
        } finally { setUploading(false); }
    };

    const handleDeleteVersion = async (versionNumber: number) => {
        if (!confirm(`Supprimer la version ${versionNumber} ? Cette action est irréversible.`)) return;
        try {
            await axios.delete(`/api/documents/${documentId}/versions/${versionNumber}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await load();
            onChanged?.();
        } catch (e: any) {
            alert(e?.response?.data?.error || 'Erreur suppression');
        }
    };

    return (
        <div style={styles.backdrop} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={styles.header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <FileText size={20} color="#4a6cf7" />
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={styles.title}>{doc?.title || 'Document'}</div>
                            <div style={styles.subtitle}>
                                {doc?.module} · {doc?.entity_type} · {doc?.versions?.length || 0} version(s)
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} style={styles.iconBtn} title="Fermer"><X size={20} /></button>
                </div>

                {/* Body */}
                {loading && <div style={styles.center}>Chargement…</div>}
                {error && <div style={{ ...styles.center, color: '#c53030' }}>{error}</div>}

                {!loading && !error && doc && (
                    <div style={styles.body}>
                        {/* Liste des versions */}
                        <div style={styles.sidebar}>
                            <div style={styles.sidebarHeader}>
                                <span>Versions</span>
                                {canEdit && (
                                    <label style={styles.uploadBtn} title="Ajouter une nouvelle version">
                                        <Upload size={14} />
                                        {uploading ? '…' : 'Nouvelle version'}
                                        <input type="file" hidden onChange={handleAddVersion} disabled={uploading} />
                                    </label>
                                )}
                            </div>
                            <div style={{ overflowY: 'auto', flex: 1 }}>
                                {doc.versions.map(v => (
                                    <div
                                        key={v.id}
                                        onClick={() => setActiveVersion(v.version)}
                                        style={{
                                            ...styles.versionItem,
                                            ...(v.version === activeVersion ? styles.versionActive : {}),
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                            <strong>v{v.version}</strong>
                                            {v.version === doc.current_version && (
                                                <span style={styles.badge}>courante</span>
                                            )}
                                        </div>
                                        <div style={styles.versionMeta}>
                                            <Clock size={11} /> {formatDate(v.uploaded_at)}
                                        </div>
                                        {v.uploaded_by && (
                                            <div style={styles.versionMeta}>
                                                <User size={11} /> {v.uploaded_by}
                                            </div>
                                        )}
                                        <div style={styles.versionMeta}>
                                            {formatSize(v.size)} · {v.mimetype || '?'}
                                        </div>
                                        {canEdit && doc.versions.length > 1 && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteVersion(v.version); }}
                                                style={styles.deleteVersionBtn}
                                                title="Supprimer cette version"
                                            >
                                                Supprimer
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Preview */}
                        <div style={styles.preview}>
                            <div style={styles.previewHeader}>
                                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <strong>{current?.original_name}</strong>
                                </div>
                                {current && (
                                    <a href={downloadUrl} download={current.original_name} style={styles.downloadBtn}>
                                        <Download size={14} /> Télécharger
                                    </a>
                                )}
                            </div>
                            <div style={styles.previewBody}>
                                {current && preview.kind === 'pdf' && (
                                    <iframe src={contentUrl} style={styles.iframe} title={current.original_name} />
                                )}
                                {current && preview.kind === 'image' && (
                                    <div style={styles.imgWrap}>
                                        <img src={contentUrl} alt={current.original_name} style={styles.img} />
                                    </div>
                                )}
                                {current && preview.kind === 'none' && (
                                    <div style={styles.noPreview}>
                                        <File size={64} color="#9ca3af" />
                                        <div style={{ marginTop: 12, color: '#6b7280' }}>
                                            Prévisualisation non disponible pour ce type de fichier.
                                        </div>
                                        <a href={downloadUrl} download={current.original_name} style={{ ...styles.downloadBtn, marginTop: 16 }}>
                                            <Download size={16} /> Télécharger {current.original_name}
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    backdrop: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    },
    modal: {
        width: '95vw', maxWidth: 1200, height: '90vh', background: '#fff',
        borderRadius: 12, display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
    },
    header: {
        padding: '14px 18px', borderBottom: '1px solid #e5e7eb',
        display: 'flex', alignItems: 'center', gap: 12,
    },
    title: {
        fontSize: 16, fontWeight: 600, color: '#1f2937',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    },
    subtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 },
    iconBtn: {
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: 6, borderRadius: 6, color: '#6b7280',
    },
    body: { display: 'flex', flex: 1, minHeight: 0 },
    sidebar: {
        width: 280, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column',
        background: '#f9fafb',
    },
    sidebarHeader: {
        padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#374151',
        textTransform: 'uppercase', letterSpacing: 0.5,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
        borderBottom: '1px solid #e5e7eb',
    },
    uploadBtn: {
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: '#4a6cf7', color: '#fff', padding: '4px 8px', borderRadius: 6,
        fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
    },
    versionItem: {
        padding: '10px 12px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
        fontSize: 13, color: '#374151',
    },
    versionActive: { background: '#eef2ff', borderLeft: '3px solid #4a6cf7' },
    versionMeta: { fontSize: 11, color: '#6b7280', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 },
    badge: {
        background: '#10b981', color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 600,
    },
    deleteVersionBtn: {
        marginTop: 6, fontSize: 11, color: '#dc2626', background: 'transparent',
        border: '1px solid #fca5a5', padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
    },
    preview: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
    previewHeader: {
        padding: '10px 14px', borderBottom: '1px solid #e5e7eb',
        display: 'flex', alignItems: 'center', gap: 10, background: '#fff',
    },
    downloadBtn: {
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13,
        background: '#4a6cf7', color: '#fff', padding: '6px 12px', borderRadius: 6,
        textDecoration: 'none', fontWeight: 500,
    },
    previewBody: { flex: 1, background: '#f3f4f6', overflow: 'hidden', display: 'flex' },
    iframe: { width: '100%', height: '100%', border: 'none', background: '#fff' },
    imgWrap: { width: '100%', height: '100%', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    img: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
    noPreview: {
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40,
    },
    center: { padding: 40, textAlign: 'center', color: '#6b7280' },
};
