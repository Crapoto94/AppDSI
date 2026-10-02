import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import EmailMessageView from './EmailMessageView';
import {
  Folder, FolderPlus, File, FileArchive, Upload, Download, Pencil, Trash2, X,
  ChevronRight, Settings, Home, Tag, Mail, History, Filter, CheckSquare, Square,
  Copy, ClipboardPaste, Edit3, GripVertical,
} from 'lucide-react';

/**
 * Explorateur de documents pour un projet — dossiers/sous-dossiers, glisser-déposer
 * (fichiers, dossier entier, ou .zip qui recrée l'arborescence), renommage, versions
 * automatiques par nom de fichier, métadonnées libres définies par projet (typage),
 * aperçus intégrés (pdf/image direct ; .msg/.docx/.xlsx/.pptx via l'API).
 *
 * Calqué sur le module Documents de l'appli "mandat" (C:\dev\mandat\frontend\src\
 * components\DocumentsModule.tsx), adapté aux conventions de ce projet (styles
 * inline, pas de Tailwind) et à ses propres routes (/api/projets/:id/explorateur/...
 * — distinctes de /api/projets/:id/documents, l'ancien système type_documentaire
 * conservé tel quel dans DocumentsTab).
 */

interface Folder_ { id: number; parent_id: number | null; nom: string }
interface MetadataField { id: number; cle: string; libelle: string; type: 'texte' | 'date' | 'liste'; options?: string[]; is_builtin?: boolean }
interface DocRow {
  id: number; folder_id: number | null; display_name: string; original_name: string;
  size_bytes: number | null; mime_type: string | null; version: string; version_count: number;
  metadata: Record<string, string>; uploaded_by: string | null; created_at: string;
}
interface DocVersion { id: number; version: string; fichier_original: string; fichier_taille: number | null; depose_par_username: string | null; date_depot: string }

function formatSize(bytes: number | null) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
function fileTypeLabel(name: string): string {
  const ext = name.split('.').pop();
  return ext && ext !== name ? ext.toUpperCase() : '—';
}

type PreviewKind = 'pdf' | 'image' | 'msg' | 'docx' | 'xlsx' | 'pptx' | 'md' | 'none';
function previewKind(mimeType: string | null, name: string): PreviewKind {
  const mt = (mimeType || '').toLowerCase();
  const n = name.toLowerCase();
  if (mt === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (mt.startsWith('image/')) return 'image';
  if (n.endsWith('.msg') || n.endsWith('.eml') || mt === 'message/rfc822' || mt === 'application/vnd.ms-outlook') return 'msg';
  if (n.endsWith('.docx')) return 'docx';
  if (n.endsWith('.xlsx')) return 'xlsx';
  if (n.endsWith('.pptx')) return 'pptx';
  if (mt === 'text/markdown' || n.endsWith('.md') || n.endsWith('.markdown')) return 'md';
  return 'none';
}

const btnBase: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, border: 'none' };

export default function ProjetDocumentExplorer({ projetId, token }: { projetId: number; token: string | null }) {
  const base = `/api/projets/${projetId}/explorateur`;
  const headers = { Authorization: `Bearer ${token}` };

  const [folders, setFolders] = useState<Folder_[]>([]);
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [fields, setFields] = useState<MetadataField[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocRow | null>(null);
  const [editDoc, setEditDoc] = useState<DocRow | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bulkMetaField, setBulkMetaField] = useState('');
  const [bulkMetaValue, setBulkMetaValue] = useState('');
  const [clipboard, setClipboard] = useState<number[]>([]);
  const [pasting, setPasting] = useState(false);
  const [draggedDocIds, setDraggedDocIds] = useState<number[] | null>(null);
  const [dropTarget, setDropTarget] = useState<number | 'racine' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFolders = useCallback(() => {
    fetch(`${base}/dossiers`, { headers }).then(r => r.json()).then(setFolders).catch(() => {});
  }, [base, token]);
  const loadDocuments = useCallback(() => {
    const qs = currentFolderId ? `?folder_id=${currentFolderId}` : '';
    fetch(`${base}/fichiers${qs}`, { headers }).then(r => r.json()).then(d => Array.isArray(d) && setDocuments(d))
      .catch(() => setError('Documents indisponibles'));
  }, [base, token, currentFolderId]);
  const loadFields = useCallback(() => {
    fetch(`${base}/champs-metadonnees`, { headers }).then(r => r.json()).then(setFields).catch(() => {});
  }, [base, token]);

  useEffect(() => { loadFolders(); loadFields(); /* eslint-disable-next-line */ }, [projetId]);
  useEffect(() => { loadDocuments(); }, [loadDocuments]);
  useEffect(() => { setSelectedIds(new Set()); setSelectedFolderIds(new Set()); }, [currentFolderId]);

  const filterableFields = fields.filter(f => documents.some(d => d.metadata?.[f.cle]));
  const filteredDocuments = documents.filter(doc => filterableFields.every(f => {
    const want = filters[f.cle];
    if (!want) return true;
    const have = doc.metadata?.[f.cle] || '';
    return f.type === 'liste' ? have === want : have.toLowerCase().includes(want.toLowerCase());
  }));
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const childFolders = folders.filter(f => f.parent_id === currentFolderId);
  const breadcrumb: Folder_[] = [];
  { let cur = currentFolderId; while (cur) { const f = folders.find(x => x.id === cur); if (!f) break; breadcrumb.unshift(f); cur = f.parent_id; } }

  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await fetch(`${base}/dossiers`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ nom: newFolderName.trim(), parent_id: currentFolderId }) });
      setNewFolderName(''); setCreatingFolder(false); loadFolders();
    } catch { setError('Création du dossier impossible'); }
  }

  async function removeFolder(folderId: number) {
    if (!window.confirm('Supprimer ce dossier et tout son contenu ? Cette action est irréversible.')) return;
    try { await fetch(`${base}/dossiers/${folderId}`, { method: 'DELETE', headers }); loadFolders(); loadDocuments(); }
    catch { setError('Suppression impossible'); }
  }

  async function uploadFiles(fileList: FileList | File[], relativePaths?: (string | null)[]) {
    const files = Array.from(fileList);
    if (!files.length) return;
    setError(null); setUploading(true);
    try {
      const isSoloZip = !relativePaths && files.length === 1 && files[0].name.toLowerCase().endsWith('.zip');
      if (isSoloZip && window.confirm(`« ${files[0].name} » est une archive zip.\n\nOK = dézipper (recrée les dossiers et fichiers qu'elle contient)\nAnnuler = déposer l'archive telle quelle, sans l'ouvrir`)) {
        const form = new FormData();
        form.append('file', files[0]);
        if (currentFolderId) form.append('folder_id', String(currentFolderId));
        await fetch(`${base}/fichiers/zip`, { method: 'POST', headers, body: form });
      } else {
        const form = new FormData();
        for (const f of files) form.append('files', f);
        if (currentFolderId) form.append('folder_id', String(currentFolderId));
        if (relativePaths) form.append('paths', JSON.stringify(relativePaths));
        await fetch(`${base}/fichiers`, { method: 'POST', headers, body: form });
      }
      loadFolders(); loadDocuments();
    } catch { setError('Dépôt impossible'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }

  /** Parcourt récursivement les entrées glissées-déposées (fichiers et dossiers) via
   * l'API navigateur webkitGetAsEntry — sans elle, dataTransfer.files suffit et ne
   * contient jamais de dossier. */
  async function readEntry(entry: any, prefix: string, files: File[], paths: string[]): Promise<void> {
    if (entry.isFile) {
      const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
      files.push(file); paths.push(prefix + entry.name);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch: any[] = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      while (batch.length > 0) {
        for (const child of batch) await readEntry(child, `${prefix}${entry.name}/`, files, paths);
        batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      }
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const items = e.dataTransfer.items;
    const supportsEntries = items && items.length > 0 && typeof (items[0] as any)?.webkitGetAsEntry === 'function';
    if (supportsEntries) {
      const files: File[] = []; const paths: string[] = [];
      for (const item of Array.from(items)) {
        const entry = (item as any).webkitGetAsEntry?.();
        if (entry) await readEntry(entry, '', files, paths);
      }
      if (files.length) {
        const hasNesting = paths.some(p => p.includes('/'));
        return uploadFiles(files, hasNesting ? paths : undefined);
      }
      return;
    }
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  }

  async function renameDocument(doc: DocRow) {
    const name = window.prompt(`Nouveau nom pour « ${doc.display_name} » :`, doc.display_name);
    if (!name || !name.trim() || name === doc.display_name) return;
    try { await fetch(`${base}/fichiers/${doc.id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: name.trim() }) }); loadDocuments(); }
    catch { setError('Renommage impossible'); }
  }

  async function removeDocument(doc: DocRow) {
    if (!window.confirm(`Supprimer "${doc.display_name}" ?`)) return;
    try { await fetch(`${base}/fichiers/${doc.id}`, { method: 'DELETE', headers }); loadDocuments(); }
    catch { setError('Suppression impossible'); }
  }

  async function setMetadataValue(doc: DocRow, cle: string, valeur: string) {
    const metadata = { ...doc.metadata, [cle]: valeur };
    try { await fetch(`${base}/fichiers/${doc.id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ metadata }) }); loadDocuments(); }
    catch { setError('Métadonnée non enregistrée'); }
  }

  /** Déplace un ou plusieurs documents vers un dossier (glisser-déposer interne à
   * l'explorateur — distinct du glisser-déposer de fichiers du système d'exploitation
   * géré par handleDrop). `folderId` null = Racine. */
  async function moveDocumentsToFolder(docIds: number[], folderId: number | null) {
    setError(null);
    const results = await Promise.allSettled(docIds.map(idv =>
      fetch(`${base}/fichiers/${idv}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_id: folderId }) })
    ));
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed) setError(`${failed} document(s) n'ont pas pu être déplacés`);
    setSelectedIds(new Set()); loadDocuments();
  }

  function toggleSelected(idv: number) { setSelectedIds(prev => { const n = new Set(prev); n.has(idv) ? n.delete(idv) : n.add(idv); return n; }); }
  function toggleSelectedFolder(idv: number) { setSelectedFolderIds(prev => { const n = new Set(prev); n.has(idv) ? n.delete(idv) : n.add(idv); return n; }); }
  const allSelected = !!(childFolders.length || filteredDocuments.length) && selectedFolderIds.size === childFolders.length && selectedIds.size === filteredDocuments.length;
  function toggleSelectAll() {
    if (allSelected) { setSelectedIds(new Set()); setSelectedFolderIds(new Set()); }
    else { setSelectedIds(new Set(filteredDocuments.map(d => d.id))); setSelectedFolderIds(new Set(childFolders.map(f => f.id))); }
  }

  async function bulkDelete() {
    const total = selectedIds.size + selectedFolderIds.size;
    if (!window.confirm(`Supprimer ${total} élément(s) sélectionné(s) ?${selectedFolderIds.size ? '\n\nLes dossiers sélectionnés seront supprimés avec tout leur contenu.' : ''}`)) return;
    const docIds = Array.from(selectedIds);
    const folderIds = Array.from(selectedFolderIds);
    const results = await Promise.allSettled([
      ...docIds.map(idv => fetch(`${base}/fichiers/${idv}`, { method: 'DELETE', headers })),
      ...folderIds.map(idv => fetch(`${base}/dossiers/${idv}`, { method: 'DELETE', headers })),
    ]);
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed) setError(`${failed} élément(s) n'ont pas pu être supprimés`);
    setSelectedIds(new Set()); setSelectedFolderIds(new Set()); loadFolders(); loadDocuments();
  }

  async function bulkApplyMetadata() {
    if (!bulkMetaField || !bulkMetaValue.trim()) return;
    const docIds = Array.from(selectedIds);
    const folderIds = Array.from(selectedFolderIds);
    const results = await Promise.allSettled([
      ...docIds.map(idv => {
        const doc = documents.find(d => d.id === idv);
        const metadata = { ...(doc?.metadata || {}), [bulkMetaField]: bulkMetaValue.trim() };
        return fetch(`${base}/fichiers/${idv}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ metadata }) });
      }),
      // Un dossier sélectionné applique la métadonnée à tout son contenu, y compris
      // ses sous-dossiers (récursif côté serveur) — pas seulement aux documents
      // actuellement affichés dans la vue courante.
      ...folderIds.map(idv => fetch(`${base}/dossiers/${idv}/metadonnees-en-masse`, {
        method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cle: bulkMetaField, valeur: bulkMetaValue.trim() }),
      })),
    ]);
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed) setError(`${failed} élément(s) n'ont pas pu être mis à jour`);
    setBulkMetaValue(''); loadDocuments();
  }

  function copySelection() {
    if (!selectedIds.size) return;
    setClipboard(Array.from(selectedIds));
  }

  /** Colle le presse-papiers dans le dossier courant — copie le fichier (nouveau
   * document indépendant, métadonnées conservées) ; si un document du même nom
   * existe déjà ici, le collage en devient une nouvelle version (même règle que
   * pour un dépôt normal). Le presse-papiers reste actif pour coller ailleurs. */
  async function pasteClipboard() {
    if (!clipboard.length) return;
    setError(null); setPasting(true);
    try {
      const r = await fetch(`${base}/fichiers/copier`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_ids: clipboard, folder_id: currentFolderId }),
      });
      if (!r.ok) throw new Error();
      loadDocuments();
    } catch { setError('Collage impossible'); }
    finally { setPasting(false); }
  }

  const fileUrl = (docId: number, download?: boolean) =>
    `/api/projets/explorateur/fichiers/${docId}/fichier?token=${encodeURIComponent(token || '')}${download ? '&download=1' : ''}`;

  return (
    <div style={{ borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', padding: 18 }}>
      <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>
          <Folder size={16} /> Documents
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setCreatingFolder(true)} style={{ ...btnBase, border: '1px solid #cbd5e1', color: '#475569', background: 'white', padding: '7px 10px' }}>
            <FolderPlus size={13} /> Nouveau dossier
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ ...btnBase, background: '#2563eb', color: 'white', padding: '7px 10px', opacity: uploading ? 0.6 : 1 }}>
            <Upload size={13} /> {uploading ? 'Dépôt…' : 'Ajouter des fichiers'}
          </button>
          {!!clipboard.length && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button onClick={pasteClipboard} disabled={pasting} title={`Coller ${clipboard.length} document(s) copié(s) ici`}
                style={{ ...btnBase, border: '1px solid #93c5fd', color: '#2563eb', background: '#eff6ff', padding: '7px 10px', opacity: pasting ? 0.6 : 1 }}>
                <ClipboardPaste size={13} /> {pasting ? 'Collage…' : `Coller (${clipboard.length})`}
              </button>
              <button onClick={() => setClipboard([])} title="Vider le presse-papiers" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={13} /></button>
            </span>
          )}
          {!!filterableFields.length && (
            <button onClick={() => setFiltersOpen(v => !v)} title="Filtrer par métadonnée"
              style={{ position: 'relative', border: 'none', background: 'none', cursor: 'pointer', padding: 6, color: (filtersOpen || activeFilterCount) ? '#2563eb' : '#94a3b8' }}>
              <Filter size={15} />
              {!!activeFilterCount && <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: '#2563eb', color: 'white', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{activeFilterCount}</span>}
            </button>
          )}
          <button onClick={() => setSettingsOpen(true)} title="Champs de métadonnées (typage)" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 6, color: '#94a3b8' }}>
            <Settings size={15} />
          </button>
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => e.target.files && uploadFiles(e.target.files)} />
        </div>
      </div>

      <div
        onDragOver={e => { if (!draggedDocIds) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { if (draggedDocIds) return; handleDrop(e); }}
        style={{ borderRadius: 10, border: `1px dashed ${dragOver ? '#2563eb' : 'transparent'}`, background: dragOver ? '#eff6ff' : 'transparent', transition: 'colors 0.15s' }}
      >
        {dragOver && (
          <p style={{ margin: '0 0 10px', fontSize: 12, color: '#2563eb', fontWeight: 600 }}>
            Déposez pour ajouter des fichiers ou un dossier ici (ou un .zip seul : son contenu recrée les dossiers automatiquement).
          </p>
        )}
      {/* Fil d'Ariane — chaque niveau est aussi une cible de dépose pour déplacer un
          document glissé (glisser-déposer interne), y compris "Racine". */}
      <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: 13 }}>
        <button onClick={() => setCurrentFolderId(null)}
          onDragOver={e => { if (draggedDocIds) { e.preventDefault(); e.stopPropagation(); setDropTarget('racine'); } }}
          onDragLeave={() => setDropTarget(prev => prev === 'racine' ? null : prev)}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); if (draggedDocIds) { moveDocumentsToFolder(draggedDocIds, null); setDraggedDocIds(null); } setDropTarget(null); }}
          style={{ display: 'flex', alignItems: 'center', gap: 4, border: dropTarget === 'racine' ? '1px dashed #2563eb' : '1px solid transparent', background: dropTarget === 'racine' ? '#eff6ff' : 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: 4, fontWeight: currentFolderId === null ? 700 : 500, color: currentFolderId === null ? '#1e293b' : '#64748b' }}>
          <Home size={13} /> Racine
        </button>
        {breadcrumb.map(f => (
          <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ChevronRight size={13} color="#cbd5e1" />
            <button onClick={() => setCurrentFolderId(f.id)}
              onDragOver={e => { if (draggedDocIds) { e.preventDefault(); e.stopPropagation(); setDropTarget(f.id); } }}
              onDragLeave={() => setDropTarget(prev => prev === f.id ? null : prev)}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); if (draggedDocIds) { moveDocumentsToFolder(draggedDocIds, f.id); setDraggedDocIds(null); } setDropTarget(null); }}
              style={{ border: dropTarget === f.id ? '1px dashed #2563eb' : '1px solid transparent', background: dropTarget === f.id ? '#eff6ff' : 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: 4, fontWeight: f.id === currentFolderId ? 700 : 500, color: f.id === currentFolderId ? '#1e293b' : '#64748b' }}>
              {f.nom}
            </button>
          </span>
        ))}
      </div>

      {filtersOpen && !!filterableFields.length && (
        <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, background: '#f8fafc', borderRadius: 8, padding: 10 }}>
          {filterableFields.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>{f.libelle} :</span>
              {f.type === 'liste' ? (
                <select value={filters[f.cle] || ''} onChange={e => setFilters(p => ({ ...p, [f.cle]: e.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 6px', fontSize: 12 }}>
                  <option value="">Tous</option>
                  {Array.from(new Set(documents.map(d => d.metadata?.[f.cle]).filter(Boolean))).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input value={filters[f.cle] || ''} onChange={e => setFilters(p => ({ ...p, [f.cle]: e.target.value }))} placeholder="contient…" style={{ width: 110, border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 6px', fontSize: 12 }} />
              )}
            </div>
          ))}
          {!!activeFilterCount && <button onClick={() => setFilters({})} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#94a3b8' }}>Réinitialiser</button>}
        </div>
      )}

      {!!(selectedIds.size + selectedFolderIds.size) && (
        <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: 8, padding: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#2563eb' }}>
            {selectedIds.size + selectedFolderIds.size} sélectionné(s)
            {!!selectedFolderIds.size && ` (dont ${selectedFolderIds.size} dossier${selectedFolderIds.size > 1 ? 's' : ''})`}
          </span>
          {!!fields.length && !!(selectedIds.size || selectedFolderIds.size) && (
            <>
              <select value={bulkMetaField} onChange={e => { setBulkMetaField(e.target.value); setBulkMetaValue(''); }} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 6px', fontSize: 12 }}>
                <option value="">Appliquer une métadonnée…</option>
                {fields.map(f => <option key={f.id} value={f.cle}>{f.libelle}</option>)}
              </select>
              {bulkMetaField && (
                <>
                  {fields.find(f => f.cle === bulkMetaField)?.type === 'liste' ? (
                    <select value={bulkMetaValue} onChange={e => setBulkMetaValue(e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 6px', fontSize: 12 }}>
                      <option value="">Choisir…</option>
                      {(fields.find(f => f.cle === bulkMetaField)?.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <input value={bulkMetaValue} onChange={e => setBulkMetaValue(e.target.value)} placeholder="Valeur"
                      type={fields.find(f => f.cle === bulkMetaField)?.type === 'date' ? 'date' : 'text'}
                      style={{ width: 110, border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 6px', fontSize: 12 }} />
                  )}
                  <button onClick={bulkApplyMetadata} disabled={!bulkMetaValue.trim()} style={{ ...btnBase, background: '#2563eb', color: 'white', padding: '5px 10px', opacity: !bulkMetaValue.trim() ? 0.5 : 1 }}>Appliquer à {selectedIds.size + selectedFolderIds.size}</button>
                </>
              )}
            </>
          )}
          {!!selectedIds.size && (
            <button onClick={copySelection} title="Copier — puis ouvrez un dossier et cliquez sur Coller"
              style={{ ...btnBase, marginLeft: 'auto', border: '1px solid #cbd5e1', color: '#475569', background: 'white', padding: '5px 10px' }}>
              <Copy size={13} /> Copier {selectedIds.size} document(s)
            </button>
          )}
          <button onClick={bulkDelete} style={{ ...btnBase, marginLeft: selectedIds.size ? 0 : 'auto', background: 'none', color: '#dc2626', padding: '5px 10px' }}><Trash2 size={13} /> Supprimer la sélection</button>
          <button onClick={() => { setSelectedIds(new Set()); setSelectedFolderIds(new Set()); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#94a3b8' }}>Annuler</button>
        </div>
      )}

      {creatingFolder && (
        <form onSubmit={createFolder} style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} autoFocus placeholder="Nom du dossier" style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
          <button type="submit" style={{ ...btnBase, background: '#2563eb', color: 'white', padding: '7px 12px' }}>Créer</button>
          <button type="button" onClick={() => setCreatingFolder(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#94a3b8' }}>Annuler</button>
        </form>
      )}

      {error && <p style={{ marginBottom: 10, background: '#fef2f2', borderRadius: 8, padding: 8, fontSize: 12, color: '#b91c1c' }}>{error}</p>}

      {!childFolders.length && !documents.length ? (
        <p style={{ border: '1px dashed #e2e8f0', borderRadius: 8, padding: 32, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Dossier vide — déposez des fichiers ici.</p>
      ) : !childFolders.length && !filteredDocuments.length ? (
        <p style={{ border: '1px dashed #e2e8f0', borderRadius: 8, padding: 32, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Aucun document ne correspond aux filtres.</p>
      ) : (
        <div style={{ border: '1px solid #f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
          {!!(childFolders.length || filteredDocuments.length) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc60', padding: '5px 12px' }}>
              <button onClick={toggleSelectAll} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, color: '#94a3b8' }}>
                {allSelected ? <CheckSquare size={14} /> : <Square size={14} />} Tout sélectionner
              </button>
            </div>
          )}
          {childFolders.map(f => (
            <div key={`f${f.id}`}
              onDragOver={e => { if (draggedDocIds) { e.preventDefault(); e.stopPropagation(); setDropTarget(f.id); } }}
              onDragLeave={() => setDropTarget(prev => prev === f.id ? null : prev)}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); if (draggedDocIds) { moveDocumentsToFolder(draggedDocIds, f.id); setDraggedDocIds(null); } setDropTarget(null); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', borderBottom: '1px solid #f1f5f9', background: dropTarget === f.id ? '#eff6ff' : undefined, outline: dropTarget === f.id ? '2px dashed #2563eb' : undefined, outlineOffset: -2 }}>
              <button onClick={() => toggleSelectedFolder(f.id)} title="Sélectionner" style={{ border: 'none', background: 'none', cursor: 'pointer', color: selectedFolderIds.has(f.id) ? '#2563eb' : '#cbd5e1', flexShrink: 0 }}>
                {selectedFolderIds.has(f.id) ? <CheckSquare size={15} /> : <Square size={15} />}
              </button>
              <button onClick={() => setCurrentFolderId(f.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, minWidth: 0 }}>
                <Folder size={16} color="#f59e0b" />
                <span style={{ fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nom}</span>
              </button>
              <button onClick={() => removeFolder(f.id)} title="Supprimer le dossier" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}><Trash2 size={14} /></button>
            </div>
          ))}
          {filteredDocuments.map(doc => (
            <div key={`d${doc.id}`}
              style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', borderBottom: '1px solid #f1f5f9', opacity: draggedDocIds?.includes(doc.id) ? 0.4 : 1 }}>
              {/* Poignée dédiée : seule zone qui déclenche le glisser-déposer INTERNE
                  (déplacer vers un dossier) — le reste de la ligne reste cliquable
                  normalement (sélection, aperçu, renommer…) sans risque de glisser
                  par erreur. */}
              <span
                draggable
                onDragStart={e => { const ids = selectedIds.has(doc.id) ? Array.from(selectedIds) : [doc.id]; setDraggedDocIds(ids); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', ''); } catch {} }}
                onDragEnd={() => { setDraggedDocIds(null); setDropTarget(null); }}
                title="Glisser pour déplacer vers un dossier"
                style={{ display: 'flex', alignItems: 'center', cursor: 'grab', color: '#cbd5e1', flexShrink: 0 }}
              >
                <GripVertical size={14} />
              </span>
              <button onClick={() => toggleSelected(doc.id)} title="Sélectionner" style={{ border: 'none', background: 'none', cursor: 'pointer', color: selectedIds.has(doc.id) ? '#2563eb' : '#cbd5e1', flexShrink: 0 }}>
                {selectedIds.has(doc.id) ? <CheckSquare size={15} /> : <Square size={15} />}
              </button>
              <button onClick={() => setPreviewDoc(doc)} title={doc.original_name} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>
                {doc.original_name.toLowerCase().endsWith('.zip') ? <FileArchive size={16} color="#94a3b8" /> : <File size={16} color="#94a3b8" />}
                <span style={{ color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.display_name}</span>
                <span style={{ flexShrink: 0, background: '#f1f5f9', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600, color: '#64748b' }}>{fileTypeLabel(doc.original_name)}</span>
                {Number(doc.version) > 1 && <span title={`Version ${doc.version}`} style={{ flexShrink: 0, background: '#dbeafe', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 600, color: '#2563eb' }}>v{doc.version}</span>}
                <span style={{ flexShrink: 0, fontSize: 11, color: '#94a3b8' }}>{formatSize(doc.size_bytes)}</span>
              </button>
              {!!fields.length && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                  {fields.map(field => <MetadataChip key={field.id} field={field} value={doc.metadata?.[field.cle] || ''} onChange={v => setMetadataValue(doc, field.cle, v)} />)}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {Number(doc.version) > 1 && <button onClick={() => setPreviewDoc(doc)} title="Historique des versions" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 5 }}><History size={14} /></button>}
                {['docx', 'xlsx', 'pptx'].includes(previewKind(doc.mime_type, doc.original_name)) && (
                  <button onClick={() => setEditDoc(doc)} title="Modifier ce document dans OnlyOffice"
                    style={{ ...btnBase, border: '1px solid #93c5fd', color: '#2563eb', background: '#eff6ff', padding: '4px 9px', fontSize: 11 }}>
                    <Edit3 size={12} /> Modifier
                  </button>
                )}
                <a href={fileUrl(doc.id, true)} title="Télécharger" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 5, display: 'flex' }}><Download size={14} /></a>
                <button onClick={() => renameDocument(doc)} title="Renommer" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 5 }}><Pencil size={14} /></button>
                <button onClick={() => removeDocument(doc)} title="Supprimer" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 5 }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {previewDoc && <DocPreviewModal doc={previewDoc} base={base} headers={headers} token={token} fileUrl={fileUrl} onClose={() => setPreviewDoc(null)} />}
      {editDoc && <DocPreviewModal doc={editDoc} base={base} headers={headers} token={token} fileUrl={fileUrl} editMode onClose={() => { setEditDoc(null); loadDocuments(); }} />}
      {settingsOpen && <MetadataSettingsModal base={base} headers={headers} fields={fields} onClose={() => setSettingsOpen(false)} onChange={loadFields} />}
    </div>
  );
}

function MetadataChip({ field, value, onChange }: { field: MetadataField; value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <button onClick={e => { e.stopPropagation(); setDraft(value); setEditing(true); }} title={field.libelle}
        style={{ display: 'flex', alignItems: 'center', gap: 4, borderRadius: 10, border: 'none', cursor: 'pointer', padding: '2px 8px', fontSize: 11, background: value ? '#dbeafe' : '#f1f5f9', color: value ? '#2563eb' : '#94a3b8' }}>
        <Tag size={10} /> {value || field.libelle}
      </button>
    );
  }
  return (
    <span onClick={e => e.stopPropagation()}>
      {field.type === 'liste' ? (
        <select autoFocus value={draft} onChange={e => { setDraft(e.target.value); onChange(e.target.value); setEditing(false); }} onBlur={() => setEditing(false)}
          style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '2px 4px', fontSize: 11 }}>
          <option value="">—</option>
          {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : (
        <input autoFocus type={field.type === 'date' ? 'date' : 'text'} value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={() => { onChange(draft); setEditing(false); }}
          onKeyDown={e => { if (e.key === 'Enter') { onChange(draft); setEditing(false); } }}
          style={{ width: 90, border: '1px solid #cbd5e1', borderRadius: 6, padding: '2px 4px', fontSize: 11 }} />
      )}
    </span>
  );
}

interface MsgPreview { subject: string; from: string; to: string[]; cc: string[]; date: string | null; bodyText: string; bodyHtml: string; attachments: { index: number; fileName: string; contentLength: number }[] }
interface XlsxPreview { sheets: { name: string; html: string }[] }
interface PptxPreview { slides: { index: number; text: string }[] }

function DocPreviewModal({ doc, base, headers, token, fileUrl, editMode, onClose }: { doc: DocRow; base: string; headers: Record<string, string>; token: string | null; fileUrl: (id: number, dl?: boolean) => string; editMode?: boolean; onClose: () => void }) {
  const kind = previewKind(doc.mime_type, doc.original_name);
  const url = fileUrl(doc.id);
  const [loading, setLoading] = useState(['msg', 'docx', 'xlsx', 'pptx', 'md'].includes(kind));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<MsgPreview | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [ooConfig, setOoConfig] = useState<{ sdk: string; config: any } | null>(null);
  const [xlsx, setXlsx] = useState<XlsxPreview | null>(null);
  const [pptx, setPptx] = useState<PptxPreview | null>(null);
  const [mdText, setMdText] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  // Historique des versions — inspiré de la visionneuse native DSI Hub (DocumentViewer.tsx) :
  // une barre latérale liste les versions, la courante étant celle prévisualisée à droite
  // (seule la version courante a un aperçu riche côté serveur ; les anciennes se téléchargent).
  const [versions, setVersions] = useState<DocVersion[] | null>(null);

  useEffect(() => {
    fetch(`${base}/fichiers/${doc.id}/versions`, { headers }).then(r => r.json()).then(setVersions).catch(() => {});
    // eslint-disable-next-line
  }, [doc.id]);

  useEffect(() => {
    const ep = `/api/projets/explorateur/fichiers/${doc.id}/apercu`;
    if (editMode) {
      // L'édition n'a pas de repli "maison" (mammoth/xlsx/pptx sont en lecture seule) :
      // sans OnlyOffice configuré, on affiche directement l'erreur.
      fetch(`/api/projets/explorateur/fichiers/${doc.id}/edition/onlyoffice`, { headers }).then(async r => {
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Édition indisponible'); }
        setOoConfig(await r.json());
        setLoading(false);
      }).catch((e: any) => { setLoadError(e?.message || 'Édition indisponible'); setLoading(false); });
      return;
    }
    // OnlyOffice (rendu fidèle, moteur du client) en priorité pour les formats Office
    // qu'il gère, si configuré ; repli silencieux sur l'aperçu "maison" sinon (503 =
    // non configuré côté serveur, cf. onlyoffice.estPriseEnCharge côté client ici).
    const viaOnlyOfficeSinon = (repli: () => void) => {
      fetch(`${ep}/onlyoffice`, { headers }).then(async r => {
        if (!r.ok) throw new Error('non configuré');
        setOoConfig(await r.json());
        setLoading(false);
      }).catch(repli);
    };
    if (kind === 'msg') fetch(`${ep}/msg`, { headers }).then(r => r.json()).then(setMsg).catch(() => setLoadError('Lecture impossible')).finally(() => setLoading(false));
    else if (kind === 'docx') viaOnlyOfficeSinon(() => {
      fetch(`${ep}/docx`, { headers }).then(r => r.json()).then(d => setDocxHtml(d.html)).catch(() => setLoadError('Aperçu impossible')).finally(() => setLoading(false));
    });
    else if (kind === 'xlsx') viaOnlyOfficeSinon(() => {
      fetch(`${ep}/xlsx`, { headers }).then(r => r.json()).then(setXlsx).catch(() => setLoadError('Aperçu impossible')).finally(() => setLoading(false));
    });
    else if (kind === 'pptx') viaOnlyOfficeSinon(() => {
      fetch(`${ep}/pptx`, { headers }).then(r => r.json()).then(setPptx).catch(() => setLoadError('Aperçu impossible')).finally(() => setLoading(false));
    });
    else if (kind === 'md') fetch(url, { headers }).then(r => r.text()).then(setMdText).catch(() => setLoadError('Lecture impossible')).finally(() => setLoading(false));
    // eslint-disable-next-line
  }, [doc.id, kind, editMode]);

  const ooContainerId = `oo-preview-${doc.id}${editMode ? '-edit' : ''}`;
  useEffect(() => {
    if (!ooConfig) return;
    let cancelled = false;
    const mount = () => {
      if (cancelled) return;
      const DocsAPI = (window as any).DocsAPI;
      if (!DocsAPI) { setLoadError('Moteur OnlyOffice indisponible (script non chargé)'); return; }
      try { new DocsAPI.DocEditor(ooContainerId, ooConfig.config); }
      catch (e: any) { setLoadError(`OnlyOffice : ${e?.message || 'erreur de chargement'}`); }
    };
    // Un seul chargement du script du moteur par page, réutilisé pour toutes les
    // prévisualisations suivantes (le SDK gère lui-même plusieurs instances).
    const existing = document.querySelector(`script[src="${ooConfig.sdk}"]`) as HTMLScriptElement | null;
    if ((window as any).DocsAPI) { mount(); }
    else if (existing) { existing.addEventListener('load', mount); }
    else {
      const script = document.createElement('script');
      script.src = ooConfig.sdk;
      script.async = true;
      script.onload = mount;
      script.onerror = () => setLoadError('Impossible de charger le moteur OnlyOffice');
      document.body.appendChild(script);
    }
    return () => { cancelled = true; };
  }, [ooConfig, ooContainerId]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: editMode ? 0 : 20 }} onClick={editMode ? undefined : onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: editMode ? '100%' : 1100, height: editMode ? '100vh' : '88vh', borderRadius: editMode ? 0 : 12, background: 'white', overflow: 'hidden', boxShadow: editMode ? 'none' : '0 25px 50px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #e2e8f0', padding: '10px 16px' }}>
          {editMode ? <Edit3 size={18} color="#2563eb" /> : kind === 'msg' ? <Mail size={18} color="#2563eb" /> : <File size={18} color="#2563eb" />}
          <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {editMode && <span style={{ marginRight: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#2563eb', background: '#eff6ff', borderRadius: 4, padding: '2px 6px' }}>Modification</span>}
            {kind === 'msg' && msg ? <><span style={{ color: '#2563eb' }}>{msg.from || 'Expéditeur inconnu'}</span> — {msg.subject}</> : doc.display_name}
          </p>
          <a href={fileUrl(doc.id, true)} style={{ ...btnBase, background: '#2563eb', color: 'white', padding: '6px 12px', textDecoration: 'none' }}><Download size={13} /> Télécharger</a>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 6 }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Versions — même esprit que la visionneuse native DSI Hub (DocumentViewer.tsx) :
              seule la version courante a un aperçu riche (rendu côté serveur) ; les anciennes
              se téléchargent, sauf pdf/image (prévisualisables directement). Masqué en édition :
              OnlyOffice occupe tout l'espace et la sauvegarde crée elle-même une nouvelle version. */}
          {!editMode && !!versions && versions.length > 0 && (
            <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #e5e7eb', background: '#f9fafb', overflowY: 'auto' }}>
              <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e5e7eb' }}>Versions</div>
              <div style={{ padding: '8px 10px', fontSize: 12, background: '#eef2ff', borderLeft: '3px solid #2563eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>v{doc.version}</strong><span style={{ fontSize: 9, background: '#2563eb', color: 'white', borderRadius: 8, padding: '1px 6px', fontWeight: 700 }}>courante</span></div>
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{formatSize(doc.size_bytes)}</div>
              </div>
              {versions.filter(v => v.version !== doc.version).map(v => (
                <a key={v.id} href={`/api/projets/explorateur/versions/${v.id}/fichier?token=${encodeURIComponent(token || '')}`}
                  style={{ display: 'block', padding: '8px 10px', fontSize: 12, color: '#374151', textDecoration: 'none', borderBottom: '1px solid #f3f4f6' }}>
                  <div><strong>v{v.version}</strong></div>
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{v.depose_par_username || 'inconnu'} · {new Date(v.date_depot).toLocaleDateString('fr-FR')}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}><Download size={10} /> {formatSize(v.fichier_taille)}</div>
                </a>
              ))}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', background: '#f1f5f9' }}>
          {kind === 'pdf' && <iframe src={url} title={doc.display_name} style={{ width: '100%', height: '100%', border: 0 }} />}
          {kind === 'image' && (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: 20 }}>
              <img src={url} alt={doc.display_name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          )}
          {loading && <p style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#64748b' }}>Chargement de l'aperçu…</p>}
          {loadError && <p style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#dc2626' }}>{loadError}</p>}
          {kind === 'md' && !loading && !loadError && mdText !== null && (
            <div style={{ height: '100%', overflowY: 'auto', background: 'white', padding: '28px 36px' }}>
              {/* .markdown-body n'avait aucune règle CSS définie nulle part dans le projet
                  (classe orpheline) : ReactMarkdown rendait des <h1>/<ul>/<table>… bruts,
                  sans hiérarchie ni espacement — d'où le rendu "moche" signalé. Même
                  convention que .contrat-ai-md dans Contrats.tsx (balise <style> locale). */}
              <style>{`
                .markdown-body { font-size: 14px; color: #1e293b; line-height: 1.7; max-width: 760px; margin: 0 auto; }
                .markdown-body > *:first-child { margin-top: 0; }
                .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 { color: #0f172a; font-weight: 700; line-height: 1.3; }
                .markdown-body h1 { font-size: 26px; margin: 28px 0 14px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
                .markdown-body h2 { font-size: 21px; margin: 24px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #f1f5f9; }
                .markdown-body h3 { font-size: 17px; margin: 20px 0 10px; }
                .markdown-body h4 { font-size: 15px; margin: 16px 0 8px; }
                .markdown-body p { margin: 0 0 14px; }
                .markdown-body ul, .markdown-body ol { margin: 0 0 14px; padding-left: 24px; }
                .markdown-body li { margin-bottom: 4px; }
                .markdown-body li > ul, .markdown-body li > ol { margin-top: 4px; margin-bottom: 0; }
                .markdown-body a { color: #2563eb; text-decoration: none; }
                .markdown-body a:hover { text-decoration: underline; }
                .markdown-body strong { font-weight: 700; color: #0f172a; }
                .markdown-body blockquote { margin: 0 0 14px; padding: 4px 16px; border-left: 3px solid #cbd5e1; color: #64748b; background: #f8fafc; }
                .markdown-body hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
                .markdown-body code { background: #f1f5f9; color: #be185d; padding: 2px 5px; border-radius: 4px; font-size: 0.88em; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; }
                .markdown-body pre { background: #0f172a; color: #e2e8f0; padding: 14px 16px; border-radius: 8px; overflow-x: auto; margin: 0 0 14px; }
                .markdown-body pre code { background: none; color: inherit; padding: 0; font-size: 12.5px; }
                .markdown-body table { border-collapse: collapse; width: 100%; margin: 0 0 16px; font-size: 13px; }
                .markdown-body th, .markdown-body td { border: 1px solid #e2e8f0; padding: 7px 10px; text-align: left; vertical-align: top; }
                .markdown-body th { background: #f8fafc; font-weight: 700; color: #374151; }
                .markdown-body img { max-width: 100%; border-radius: 6px; }
                .markdown-body input[type="checkbox"] { margin-right: 6px; }
              `}</style>
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{mdText}</ReactMarkdown>
              </div>
            </div>
          )}
          {kind === 'msg' && !loading && !loadError && msg && (
            <EmailMessageView
              data={msg}
              accent="#2563eb"
              attachmentHref={(i) => `/api/projets/explorateur/fichiers/${doc.id}/apercu/msg/pieces-jointes/${i}?token=${encodeURIComponent(headers.Authorization.replace('Bearer ', ''))}&download=1`}
            />
          )}
          {['docx', 'xlsx', 'pptx'].includes(kind) && !loading && !loadError && ooConfig && (
            <div id={ooContainerId} style={{ width: '100%', height: '100%' }} />
          )}
          {kind === 'docx' && !loading && !loadError && !ooConfig && docxHtml !== null && (
            <div style={{ height: '100%', overflowY: 'auto', background: 'white', padding: 28 }} dangerouslySetInnerHTML={{ __html: docxHtml }} />
          )}
          {kind === 'xlsx' && !loading && !loadError && !ooConfig && xlsx && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
              {xlsx.sheets.length > 1 && (
                <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '6px 10px' }}>
                  {xlsx.sheets.map((s, i) => (
                    <button key={s.name} onClick={() => setActiveSheet(i)} style={{ border: 'none', borderRadius: 6, cursor: 'pointer', padding: '5px 10px', fontSize: 11, fontWeight: 600, background: i === activeSheet ? '#2563eb' : 'transparent', color: i === activeSheet ? 'white' : '#475569' }}>{s.name}</button>
                  ))}
                </div>
              )}
              <div style={{ flex: 1, overflow: 'auto', padding: 14, fontSize: 12 }} dangerouslySetInnerHTML={{ __html: xlsx.sheets[activeSheet]?.html || '' }} />
            </div>
          )}
          {kind === 'pptx' && !loading && !loadError && !ooConfig && pptx && (
            <div style={{ height: '100%', overflowY: 'auto', background: 'white', padding: 18 }}>
              <p style={{ marginBottom: 12, fontSize: 11, color: '#94a3b8' }}>Aperçu texte des diapositives (mise en forme et images non affichées) — téléchargez pour le rendu complet.</p>
              {pptx.slides.map(s => (
                <div key={s.index} style={{ marginBottom: 12, border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8' }}>Diapositive {s.index}</p>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13, color: '#1e293b' }}>{s.text || <span style={{ color: '#cbd5e1' }}>(vide)</span>}</p>
                </div>
              ))}
              {!pptx.slides.length && <p style={{ fontSize: 13, color: '#94a3b8' }}>Aucune diapositive détectée.</p>}
            </div>
          )}
          {kind === 'none' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
              <File size={56} color="#94a3b8" />
              <p style={{ fontSize: 13, color: '#64748b' }}>Prévisualisation non disponible pour ce type de fichier.</p>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}


function MetadataSettingsModal({ base, headers, fields, onClose, onChange }: { base: string; headers: Record<string, string>; fields: MetadataField[]; onClose: () => void; onChange: () => void }) {
  const [libelle, setLibelle] = useState('');
  const [type, setType] = useState<'texte' | 'date' | 'liste'>('texte');
  const [optionsText, setOptionsText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function slugify(str: string) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!libelle.trim()) return;
    try {
      const r = await fetch(`${base}/champs-metadonnees`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cle: slugify(libelle) || `champ_${Date.now()}`, libelle: libelle.trim(), type, options: type === 'liste' ? optionsText.split(',').map(s => s.trim()).filter(Boolean) : undefined }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Création impossible'); }
      setLibelle(''); setOptionsText(''); setError(null); onChange();
    } catch (e: any) { setError(e.message || 'Création impossible'); }
  }

  async function remove(id: number) {
    await fetch(`${base}/champs-metadonnees/${id}`, { method: 'DELETE', headers });
    onChange();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: 20 }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 440, borderRadius: 12, background: 'white', padding: 18, boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Typage des documents (métadonnées)</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
        </div>
        <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fields.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: f.is_builtin ? '#eff6ff' : '#f8fafc', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}>
              <span>{f.libelle} <span style={{ fontSize: 11, color: '#94a3b8' }}>({f.type})</span></span>
              {f.is_builtin
                ? <span style={{ fontSize: 10, color: '#2563eb', fontWeight: 600 }}>Types documentaires attendus</span>
                : <button onClick={() => remove(f.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><Trash2 size={14} /></button>}
            </div>
          ))}
          {fields.length <= 1 && <p style={{ fontSize: 11, color: '#94a3b8' }}>Aucun champ personnalisé défini pour l'instant.</p>}
        </div>
        <form onSubmit={add} style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
          <input value={libelle} onChange={e => setLibelle(e.target.value)} placeholder="Libellé (ex : Type de document)" style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={type} onChange={e => setType(e.target.value as any)} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
              <option value="texte">Texte</option>
              <option value="date">Date</option>
              <option value="liste">Liste</option>
            </select>
            {type === 'liste' && <input value={optionsText} onChange={e => setOptionsText(e.target.value)} placeholder="Valeurs séparées par une virgule" style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />}
          </div>
          {error && <p style={{ fontSize: 11, color: '#dc2626' }}>{error}</p>}
          <button type="submit" disabled={!libelle.trim()} style={{ ...btnBase, alignSelf: 'flex-start', background: '#2563eb', color: 'white', padding: '7px 14px', opacity: !libelle.trim() ? 0.6 : 1 }}>Ajouter le champ</button>
        </form>
      </div>
    </div>
  );
}
