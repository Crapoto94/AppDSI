import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { AppWindow, FolderOpen, Library, Save, Search, Trash2, User, X } from 'lucide-react';

export interface DiagramAsset { type: string; id: number; name: string }

export interface DiagramMeta {
  id: number;
  title: string;
  description: string | null;
  assets: DiagramAsset[];
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  can_modify?: boolean;
}

export interface AppOption { id: number; name: string }

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

const fmtDate = (d: string) => {
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const errMsg = (e: unknown) =>
  axios.isAxiosError(e) ? (e.response?.data?.message || e.message) : (e instanceof Error ? e.message : String(e));

const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
  border: '1px solid #cbd5e1', background: 'white', color: '#0f172a', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
};
const primaryBtn: React.CSSProperties = { ...btn, background: '#4f46e5', borderColor: '#4f46e5', color: 'white' };
const field: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'inherit',
};
const label: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', margin: '12px 0 4px' };

const Overlay: React.FC<{ onClose: () => void; width?: number; title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ onClose, width = 560, title, icon, children }) => (
  <div
    onClick={onClose}
    style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ background: 'white', borderRadius: '12px', width: `${width}px`, maxWidth: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {icon}
        <strong style={{ flex: 1, color: '#0f172a' }}>{title}</strong>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }} title="Fermer"><X size={18} /></button>
      </div>
      {children}
    </div>
  </div>
);

export const AssetChips: React.FC<{ assets: DiagramAsset[] }> = ({ assets }) => (
  <>
    {assets.map((a) => (
      <span
        key={`${a.type}-${a.id}`}
        title="Logiciel (application du Magasin d'applications)"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '999px', background: '#eef2ff', color: '#4338ca', fontSize: '0.72rem', fontWeight: 600 }}
      >
        <AppWindow size={11} /> {a.name}
      </span>
    ))}
  </>
);

// ─── Enregistrement dans la bibliothèque ─────────────────────────────────────

export interface SaveDialogProps {
  current: DiagramMeta | null;
  initialTitle: string;
  initialDescription: string;
  initialTags: string[];
  detectedAssets: DiagramAsset[];
  onClose: () => void;
  /** Enregistre (création ou mise à jour) ; lève une erreur affichée dans la fenêtre. */
  onSave: (values: { title: string; description: string; tags: string[]; asCopy: boolean }) => Promise<void>;
}

export const SaveDiagramDialog: React.FC<SaveDialogProps> = ({ current, initialTitle, initialDescription, initialTags, detectedAssets, onClose, onSave }) => {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [tags, setTags] = useState(initialTags.join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updating = !!current && !!current.can_modify;

  const submit = async (asCopy: boolean) => {
    if (!title.trim()) { setError('Le titre est obligatoire.'); return; }
    setBusy(true);
    setError(null);
    try {
      await onSave({ title: title.trim(), description: description.trim(), tags: tags.split(',').map((t) => t.trim()).filter(Boolean), asCopy });
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <Overlay onClose={onClose} title="Enregistrer dans la bibliothèque" icon={<Save size={18} color="#4f46e5" />}>
      <div style={{ padding: '4px 16px 16px', overflowY: 'auto' }}>
        {current && (
          <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#64748b' }}>
            <User size={12} style={{ verticalAlign: '-1px' }} /> Créé par <strong>{current.created_by || 'inconnu'}</strong> le {fmtDate(current.created_at)}
            {!current.can_modify && <div style={{ color: '#b45309', marginTop: '4px' }}>Vous n'êtes pas le créateur : vous pouvez enregistrer une copie à votre nom.</div>}
          </div>
        )}
        <label style={label}>Titre *</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} style={field} maxLength={200} placeholder="Ex. Accueil informatique d'un nouvel arrivant" />
        <label style={label}>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...field, resize: 'vertical' }} placeholder="Objet du processus, périmètre, services concernés…" />
        <label style={label}>Étiquettes (séparées par des virgules)</label>
        <input value={tags} onChange={(e) => setTags(e.target.value)} style={field} placeholder="RH, arrivée, comptes" />
        <label style={label}>Logiciels concernés (détectés dans le diagramme)</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', minHeight: '24px' }}>
          {detectedAssets.length > 0
            ? <AssetChips assets={detectedAssets} />
            : <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Aucun. Ajoutez des applications avec le bouton « Application » : elles seront référencées automatiquement.</span>}
        </div>
        {error && <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: '8px', marginTop: '12px', fontSize: '0.85rem' }}>{error}</div>}
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button style={btn} onClick={onClose} disabled={busy}>Annuler</button>
        {updating && <button style={btn} onClick={() => submit(true)} disabled={busy}>Enregistrer une copie</button>}
        <button style={primaryBtn} onClick={() => submit(false)} disabled={busy}>
          {updating ? 'Mettre à jour' : 'Enregistrer'}
        </button>
      </div>
    </Overlay>
  );
};

// ─── Bibliothèque ────────────────────────────────────────────────────────────

export interface LibraryDialogProps {
  apps: AppOption[];
  currentId: number | null;
  onClose: () => void;
  onOpen: (id: number) => Promise<void>;
}

export const DiagramLibraryDialog: React.FC<LibraryDialogProps> = ({ apps, currentId, onClose, onOpen }) => {
  const [items, setItems] = useState<DiagramMeta[] | null>(null);
  const [search, setSearch] = useState('');
  const [appFilter, setAppFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      axios.get<DiagramMeta[]>('/api/bpmn/diagrams', {
        headers: authHeaders(),
        params: { search: search || undefined, application_id: appFilter || undefined },
      }).then((res) => { if (!cancelled) { setItems(res.data); setError(null); } })
        .catch((e) => { if (!cancelled) setError(errMsg(e)); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, appFilter]);

  const open = async (d: DiagramMeta) => {
    setBusyId(d.id);
    try { await onOpen(d.id); } catch (e) { setError(errMsg(e)); setBusyId(null); }
  };

  const remove = async (d: DiagramMeta) => {
    if (!window.confirm(`Supprimer définitivement le diagramme « ${d.title} » de la bibliothèque ?`)) return;
    try {
      await axios.delete(`/api/bpmn/diagrams/${d.id}`, { headers: authHeaders() });
      setItems((prev) => (prev || []).filter((x) => x.id !== d.id));
    } catch (e) { setError(errMsg(e)); }
  };

  return (
    <Overlay onClose={onClose} width={760} title="Bibliothèque de diagrammes" icon={<Library size={18} color="#4f46e5" />}>
      <div style={{ padding: '12px 16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '11px', color: '#94a3b8' }} />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Titre, description, créateur, logiciel, étiquette…"
            style={{ ...field, paddingLeft: '32px' }}
          />
        </div>
        <select value={appFilter} onChange={(e) => setAppFilter(e.target.value)} style={{ ...field, width: 'auto', flex: '0 1 240px' }} title="Filtrer par logiciel concerné">
          <option value="">Tous les logiciels</option>
          {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div style={{ overflowY: 'auto', padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '160px' }}>
        {error && <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem' }}>{error}</div>}
        {items === null && !error && <div style={{ color: '#64748b', padding: '8px 0' }}>Chargement…</div>}
        {items !== null && items.length === 0 && <div style={{ color: '#64748b', padding: '8px 0' }}>Aucun diagramme ne correspond.</div>}
        {(items || []).map((d) => (
          <div
            key={d.id}
            style={{ border: `1px solid ${d.id === currentId ? '#a5b4fc' : '#e2e8f0'}`, background: d.id === currentId ? '#f5f7ff' : 'white', borderRadius: '10px', padding: '10px 12px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{d.title}{d.id === currentId && <span style={{ marginLeft: '8px', fontSize: '0.7rem', color: '#4338ca' }}>(ouvert)</span>}</div>
              {d.description && (
                <div style={{ color: '#64748b', fontSize: '0.8rem', margin: '2px 0 4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.description}</div>
              )}
              <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                <User size={11} style={{ verticalAlign: '-1px' }} /> {d.created_by || 'inconnu'} · créé le {fmtDate(d.created_at)}
                {d.updated_at !== d.created_at && <> · modifié le {fmtDate(d.updated_at)}{d.updated_by && d.updated_by !== d.created_by ? ` par ${d.updated_by}` : ''}</>}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                <AssetChips assets={d.assets} />
                {d.tags.map((t) => (
                  <span key={t} style={{ padding: '2px 8px', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontSize: '0.72rem' }}>#{t}</span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button style={primaryBtn} onClick={() => open(d)} disabled={busyId === d.id}><FolderOpen size={14} /> Ouvrir</button>
              {d.can_modify && <button style={{ ...btn, color: '#b91c1c' }} onClick={() => remove(d)}><Trash2 size={14} /> Supprimer</button>}
            </div>
          </div>
        ))}
      </div>
    </Overlay>
  );
};
