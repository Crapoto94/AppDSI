import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import {
  Upload, AlertCircle, Loader2, Trash2, Edit2, Check,
  X as CloseIcon, Search, RefreshCw, ChevronUp, ChevronDown, Plus, FileSpreadsheet,
  Paperclip, Eye, RefreshCcw, Archive, ArchiveRestore, FileText, Columns, Filter
} from 'lucide-react';

interface Contrat {
  id: number;
  svc: string;
  objet: string;
  budget: string;
  raison_sociale: string;
  tiers: string;
  tiers_nom?: string;
  app_id: number | null;
  app_nom?: string;
  type_contrat: string;
  annee_initiale: number | null;
  direction: string;
  service: string;
  perimetre: string;
  nature: string;
  fonction: string;
  date_debut: string | null;
  duree_annees: number | null;
  nb_reconductions: number | null;
  date_fin: string | null;
  marche_contrat: string;
  piece: string;
  date_reconduction: string;
  reconduction: string;
  montant_2022: number | null;
  montant_2023: number | null;
  montant_2024: number | null;
  montant_2025: number | null;
  montant_2026: number | null;
  prevision_2026: number | null;
  prevision_2027: number | null;
  prevision_2028: number | null;
  commentaires: string;
  statut: string;
  renouvellement_statut: string | null;
  renouvellement_commentaire: string;
  doc_principal_path: string;
  doc_principal_nom: string;
  imported_at: string;
  gti: string;
  gtr: string;
  penalite: string;
  indice_revision: string;
  numero_facture: string;
  contrat_renouvellement_id: number | null;
  created_at: string;
}

interface Document {
  id: number;
  contrat_id: number;
  file_path: string;
  file_name: string;
  nature: string;
  est_principal: number;
  uploaded_at: string;
}

type ColKey = keyof Contrat;

interface ColDef {
  key: ColKey;
  label: string;
  w: number;
  type?: string;
  defaultVisible?: boolean;
}

const COLS: ColDef[] = [
  { key: 'svc', label: 'SVC', w: 55 },
  { key: 'objet', label: 'Logiciel', w: 160 },
  { key: 'raison_sociale', label: 'Fournisseur', w: 140 },
  { key: 'tiers', label: 'Tiers', w: 120 },
  { key: 'app_id', label: 'App', w: 120 },
  { key: 'type_contrat', label: 'Type', w: 95 },
  { key: 'budget', label: 'Budget', w: 70, defaultVisible: false },
  { key: 'annee_initiale', label: 'An init.', w: 60, type: 'number', defaultVisible: false },
  { key: 'direction', label: 'Direction', w: 110 },
  { key: 'service', label: 'Service', w: 100, defaultVisible: false },
  { key: 'perimetre', label: 'Périmètre', w: 130, defaultVisible: false },
  { key: 'nature', label: 'Nature', w: 70, defaultVisible: false },
  { key: 'fonction', label: 'Fonction', w: 65, defaultVisible: false },
  { key: 'date_debut', label: 'Début', w: 82, type: 'date', defaultVisible: false },
  { key: 'duree_annees', label: 'Durée', w: 52, type: 'number' },
  { key: 'nb_reconductions', label: 'Recond.', w: 55, type: 'number', defaultVisible: false },
  { key: 'date_fin', label: 'Fin', w: 82, type: 'date' },
  { key: 'marche_contrat', label: 'Marché/Contrat', w: 110 },
  { key: 'piece', label: 'Pièce', w: 65, defaultVisible: false },
  { key: 'date_reconduction', label: 'Date recond.', w: 82, defaultVisible: false },
  { key: 'reconduction', label: 'Reconduction', w: 88 },
  { key: 'montant_2022', label: '2022', w: 82, type: 'number', defaultVisible: false },
  { key: 'montant_2023', label: '2023', w: 82, type: 'number', defaultVisible: false },
  { key: 'montant_2024', label: '2024', w: 82, type: 'number', defaultVisible: false },
  { key: 'montant_2025', label: '2025', w: 82, type: 'number', defaultVisible: false },
  { key: 'montant_2026', label: '2026', w: 82, type: 'number' },
  { key: 'prevision_2026', label: 'Prév.2026', w: 88, type: 'number', defaultVisible: false },
  { key: 'prevision_2027', label: 'Prév.2027', w: 88, type: 'number' },
  { key: 'prevision_2028', label: 'Prév.2028', w: 88, type: 'number', defaultVisible: false },
  { key: 'renouvellement_statut', label: 'Renouvell.', w: 90 },
  { key: 'numero_facture', label: 'N° Facture', w: 110 },
  { key: 'commentaires', label: 'Commentaires', w: 170 },
];

const fmt = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('fr-FR');
};

const daysUntil = (d: string | null) => {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((dt.getTime() - today.getTime()) / 86400000);
};

const isExpired = (d: string | null) => { const n = daysUntil(d); return n !== null && n < 0; };
const isExpiringSoon = (d: string | null) => { const n = daysUntil(d); return n !== null && n >= 0 && n <= 90; };
const isNew = (createdAt: string | null) => {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  const today = new Date();
  const daysSinceCreation = Math.floor((today.getTime() - created.getTime()) / 86400000);
  return daysSinceCreation <= 30 && daysSinceCreation >= 0;
};

const Overlay: React.FC<{ onClose: () => void; children: React.ReactNode; maxWidth?: number }> = ({ onClose, children, maxWidth = 560 }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, padding: 24, minWidth: 420, maxWidth, width: '95%', boxShadow: '0 8px 32px rgba(0,0,0,.2)', maxHeight: '92vh', overflowY: 'auto' }}>
      {children}
    </div>
  </div>
);

const ModalHeader: React.FC<{ title: string; onClose: () => void }> = ({ title, onClose }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 10 }}>
    <h2 style={{ margin: 0, fontSize: 16, color: '#1e3a5f', flexGrow: 1 }}>{title}</h2>
    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><CloseIcon size={18} /></button>
  </div>
);

const authHeaders = () => ({
  'Authorization': `Bearer ${localStorage.getItem('token')}`
});

const Contrats: React.FC = () => {
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [editModal, setEditModal] = useState<Contrat | null>(null);
  const [editModalData, setEditModalData] = useState<Partial<Contrat> | null>(null);
  const [calculatedDateFin, setCalculatedDateFin] = useState(false);
  const [showArchives, setShowArchives] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDirection, setFilterDirection] = useState('');
  const [filterType, setFilterType] = useState('');
  const [alertFilter, setAlertFilter] = useState<'expired' | 'soon' | null>(null);
  const [sortKey, setSortKey] = useState<ColKey>('date_fin');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [colFilters, setColFilters] = useState<Partial<Record<ColKey, string>>>({});
  const [showFilterRow, setShowFilterRow] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(
    new Set(COLS.filter(c => c.defaultVisible !== false).map(c => c.key))
  );
  const [showColPanel, setShowColPanel] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newContrat, setNewContrat] = useState<Partial<Contrat>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; skipped: number; errors: number } | null>(null);

  const [docModal, setDocModal] = useState<{ contrat: Contrat; docs: Document[] } | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [selectedDocFiles, setSelectedDocFiles] = useState<Array<{ file: File; nature: string; principal: boolean }>>([]);
  const [dragOver, setDragOver] = useState(false);
  const [renewModal, setRenewModal] = useState<Contrat | null>(null);
  const [renewStatut, setRenewStatut] = useState('en_cours');
  const [renewComment, setRenewComment] = useState('');
  const [renewDate, setRenewDate] = useState('');
  const [pdfModal, setPdfModal] = useState<{ path: string; name: string } | null>(null);
  const [docViewModal, setDocViewModal] = useState<{ contrat: Contrat; docs: Document[]; currentIndex: number } | null>(null);
  const [docViewEditData, setDocViewEditData] = useState<Partial<Contrat> | null>(null);
  const [linkedContracts, setLinkedContracts] = useState<{ previous: Contrat | null; renewals: Contrat[] } | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<Contrat | null>(null);
  const [tiersSuggestions, setTiersSuggestions] = useState<Array<{ code: string; name: string }>>([]);
  const [tiersSearch, setTiersSearch] = useState('');
  const [showTiersSuggestions, setShowTiersSuggestions] = useState(false);
  const [appsSuggestions, setAppsSuggestions] = useState<Array<{ id: number; name: string }>>([]);
  const [appsSearch, setAppsSearch] = useState('');
  const [showAppsSuggestions, setShowAppsSuggestions] = useState(false);
  const [tiersDetailModal, setTiersDetailModal] = useState<{ code: string; nom: string } | null>(null);
  const [appDetailModal, setAppDetailModal] = useState<any | null>(null);
  const [appDetailLoading, setAppDetailLoading] = useState(false);

  const excelInputRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const colPanelRef = useRef<HTMLDivElement>(null);

  const fetchContrats = async () => {
    try {
      const res = await fetch('/api/contrats', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setContrats(Array.isArray(data) ? data : []);
      } else if (res.status === 403) {
        showMsg('error', 'Session expirée. Veuillez vous reconnecter.');
        setContrats([]);
      } else {
        showMsg('error', 'Impossible de charger les contrats');
        setContrats([]);
      }
    } catch { showMsg('error', 'Impossible de charger les contrats'); setContrats([]); }
    finally { setLoading(false); }
  };

  const searchTiers = async (query: string) => {
    if (query.length < 2) {
      setTiersSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/tiers?search=${encodeURIComponent(query)}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const tiersList = Array.isArray(data) ? data : (data.tiers || []);
        const suggestions = tiersList.slice(0, 10).map((t: any) => ({ code: t.code || t.id, name: t.nom || t.name || t.raison_sociale || '' }));
        setTiersSuggestions(suggestions);
      }
    } catch (err) {
      setTiersSuggestions([]);
    }
  };

  const searchApps = async (query: string) => {
    if (query.length < 2) {
      setAppsSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/magapp/apps`, { headers: authHeaders() });
      if (res.ok) {
        const apps = await res.json();
        const appsList = Array.isArray(apps) ? apps : (apps.apps || []);
        const filtered = appsList.filter((a: any) =>
          (a.name || '').toLowerCase().includes(query.toLowerCase()) ||
          (a.description || '').toLowerCase().includes(query.toLowerCase())
        );
        const suggestions = filtered.slice(0, 10).map((a: any) => ({ id: a.id, name: a.name }));
        setAppsSuggestions(suggestions);
      }
    } catch (err) {
      setAppsSuggestions([]);
    }
  };

  const fetchAppDetails = async (appId: number) => {
    setAppDetailLoading(true);
    try {
      const res = await fetch(`/api/magapp/apps`, { headers: authHeaders() });
      if (res.ok) {
        const apps = await res.json();
        const appsList = Array.isArray(apps) ? apps : (apps.apps || []);
        const app = appsList.find((a: any) => a.id === appId);
        if (app) {
          setAppDetailModal(app);
        } else {
          showMsg('error', 'Application non trouvée');
        }
      } else {
        showMsg('error', 'Erreur lors du chargement de l\'application');
      }
    } catch (err) {
      showMsg('error', 'Erreur lors du chargement de l\'application');
    } finally {
      setAppDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchContrats();
    const saved = localStorage.getItem('columnPreferences');
    if (saved) {
      try {
        const cols = JSON.parse(saved);
        setVisibleCols(new Set(cols));
      } catch { }
    }
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node)) setShowColPanel(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text }); setTimeout(() => setMessage(null), 4000);
  };

  const expiredCount = contrats.filter(c => c.statut !== 'archivé' && isExpired(c.date_fin)).length;
  const soonCount = contrats.filter(c => c.statut !== 'archivé' && isExpiringSoon(c.date_fin)).length;
  const directions = [...new Set(contrats.map(c => c.direction).filter(Boolean))].sort();
  const types = [...new Set(contrats.map(c => c.type_contrat).filter(Boolean))].sort();
  const activeCols = COLS.filter(c => visibleCols.has(c.key));

  // ─── Filtres & tri ───────────────────────────────────────────────────────────

  const filtered = contrats.filter(c => {
    if (showArchives && c.statut !== 'archivé') return false;
    if (!showArchives && c.statut === 'archivé') return false;
    const q = searchQuery.trim().toLowerCase();
    if (q && ![c.objet, c.raison_sociale, c.direction, c.svc, c.marche_contrat, c.perimetre, c.commentaires].some(f => f?.toLowerCase().includes(q))) return false;
    if (filterDirection && c.direction !== filterDirection) return false;
    if (filterType && c.type_contrat !== filterType) return false;
    if (alertFilter === 'expired') { if (c.statut === 'archivé' || !isExpired(c.date_fin)) return false; }
    else if (alertFilter === 'soon') { if (c.statut === 'archivé' || !isExpiringSoon(c.date_fin)) return false; }
    // Filtres par colonne
    for (const [key, fv] of Object.entries(colFilters)) {
      if (!fv) continue;
      const val = String(c[key as ColKey] ?? '').toLowerCase();
      if (!val.includes(fv.toLowerCase())) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av: string | number = (a[sortKey] ?? '') as string | number;
    let bv: string | number = (b[sortKey] ?? '') as string | number;
    if (['date_debut', 'date_fin', 'imported_at'].includes(sortKey as string)) {
      av = av ? new Date(av as string).getTime() : 0;
      bv = bv ? new Date(bv as string).getTime() : 0;
    } else if (typeof av === 'string') { av = av.toLowerCase(); bv = (bv as string).toLowerCase(); }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key: ColKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SI = ({ k }: { k: ColKey }) =>
    sortKey !== k ? null : sortDir === 'asc'
      ? <ChevronUp size={10} style={{ display: 'inline', marginLeft: 2 }} />
      : <ChevronDown size={10} style={{ display: 'inline', marginLeft: 2 }} />;

  // ─── Import Excel ────────────────────────────────────────────────────────────

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true); setImportResult(null);
    const fd = new FormData(); fd.append('file', file);
    try {
      const res = await fetch('/api/contrats/upload-excel', { method: 'POST', headers: authHeaders(), body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setImportResult({ inserted: data.inserted, updated: data.updated, skipped: data.skipped, errors: data.errors });
      showMsg('success', `Import : ${data.inserted} ajoutés, ${data.updated} mis à jour (écrasement)`);
      await fetchContrats();
    } catch (err: unknown) { showMsg('error', err instanceof Error ? err.message : 'Erreur import'); }
    finally { setImporting(false); if (excelInputRef.current) excelInputRef.current.value = ''; }
  };

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  const calculateDateFin = (dateDebut: string | null, duree: number | null, nbRecond: number | null): string | null => {
    if (!dateDebut || duree == null || nbRecond == null) return null;
    try {
      const start = new Date(dateDebut + 'T00:00:00Z');
      if (isNaN(start.getTime())) return null;
      const totalYears = (duree || 0) + (nbRecond || 0);
      const end = new Date(Date.UTC(start.getUTCFullYear() + totalYears, start.getUTCMonth(), start.getUTCDate()));
      if (isNaN(end.getTime())) return null;
      return end.toISOString().split('T')[0];
    } catch (e) { return null; }
  };

  const getLinkedContracts = async (c: Contrat) => {
    try {
      const previousId = c.contrat_renouvellement_id;
      let previousContract = null;

      if (previousId) {
        // Chercher d'abord dans la liste actuelle (contrats actifs)
        previousContract = contrats.find(x => x.id === previousId);

        // Si non trouvé (archivé), faire un appel API
        if (!previousContract) {
          const res = await fetch(`/api/contrats/${previousId}`, { headers: authHeaders() });
          if (res.ok) previousContract = await res.json();
        }
      }

      const renewals = contrats.filter(x => x.contrat_renouvellement_id === c.id);
      setLinkedContracts({ previous: previousContract || null, renewals });
    } catch {
      setLinkedContracts(null);
    }
  };

  const openEditModal = (c: Contrat) => {
    setEditModal(c);
    setEditModalData({ ...c });
    setTiersSearch('');
    setAppsSearch('');
    setCalculatedDateFin(false);
    getLinkedContracts(c);
  };
  const saveModal = async () => {
    console.log('[DEBUG] saveModal appelée, editModalData:', editModalData);
    if (!editModalData) {
      console.log('[DEBUG] editModalData vide, retour');
      return;
    }
    try {
      const isNew = !editModal;
      const method = isNew ? 'POST' : 'PUT';
      const url = isNew ? '/api/contrats' : `/api/contrats/${editModal!.id}`;
      console.log('[DEBUG] Sauvegarde:', { url, method, tiers: editModalData.tiers, app_id: editModalData.app_id });
      const response = await fetch(url, { method, headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(editModalData) });
      console.log('[DEBUG] Réponse:', response.status, response.statusText);
      setEditModal(null); setEditModalData(null); setTiersSearch(''); setAppsSearch(''); await fetchContrats();
      showMsg('success', isNew ? 'Contrat créé' : 'Contrat mis à jour');
    } catch (error) {
      console.log('[DEBUG] Erreur:', error);
      showMsg('error', 'Impossible de sauvegarder');
    }
  };

  const saveDocViewModal = async () => {
    if (!docViewModal || !docViewEditData) return;
    try {
      const response = await fetch(`/api/contrats/${docViewModal.contrat.id}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(docViewEditData)
      });
      if (!response.ok) throw new Error();
      await fetchContrats();
      setDocViewModal(null);
      setDocViewEditData(null);
      showMsg('success', 'Contrat mis à jour');
    } catch {
      showMsg('error', 'Impossible de sauvegarder');
    }
  };

  const openNewContractModal = () => {
    const emptyContract: Partial<Contrat> = {
      svc: '', objet: '', raison_sociale: '', tiers: '', app_id: null, type_contrat: '', direction: '', service: '',
      perimetre: '', nature: '', fonction: '', budget: '', annee_initiale: null,
      date_debut: null, duree_annees: null, nb_reconductions: null, date_fin: null,
      marche_contrat: '', piece: '', date_reconduction: '', reconduction: '',
      montant_2022: null, montant_2023: null, montant_2024: null, montant_2025: null, montant_2026: null,
      prevision_2026: null, prevision_2027: null, prevision_2028: null, commentaires: '',
      gti: '', gtr: '', penalite: '', indice_revision: '', numero_facture: ''
    };
    setEditModal(null);
    setEditModalData(emptyContract);
    setCalculatedDateFin(false);
    setLinkedContracts(null);
  };
  const handleDelete = async (id: number) => {
    try { await fetch(`/api/contrats/${id}`, { method: 'DELETE', headers: authHeaders() }); setDeleteConfirm(null); await fetchContrats(); showMsg('success', 'Contrat supprimé'); }
    catch { showMsg('error', 'Impossible de supprimer'); }
  };
  const handleCreate = async () => {
    try {
      await fetch('/api/contrats', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(newContrat) });
      setShowForm(false); setNewContrat({}); await fetchContrats(); showMsg('success', 'Contrat créé');
    } catch { showMsg('error', 'Impossible de créer'); }
  };

  // ─── Documents ───────────────────────────────────────────────────────────────

  const openDocModal = async (c: Contrat) => {
    const res = await fetch(`/api/contrats/${c.id}/documents`, { headers: authHeaders() });
    setDocModal({ contrat: c, docs: await res.json() });
    setSelectedDocFiles([]);
  };

  const openDocViewModal = async (c: Contrat) => {
    const res = await fetch(`/api/contrats/${c.id}/documents`, { headers: authHeaders() });
    const docs = await res.json();
    if (docs.length === 0) {
      return;
    }
    const principalIndex = docs.findIndex((d: Document) => d.est_principal === 1);
    const startIndex = principalIndex >= 0 ? principalIndex : 0;
    setDocViewModal({ contrat: c, docs, currentIndex: startIndex });
    setDocViewEditData({
      date_debut: c.date_debut,
      duree_annees: c.duree_annees,
      nb_reconductions: c.nb_reconductions,
      reconduction: c.reconduction,
      date_fin: c.date_fin,
      gti: c.gti,
      gtr: c.gtr,
      indice_revision: c.indice_revision,
      montant_2022: c.montant_2022
    });
  };

  const handleDocSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files).map(f => ({ file: f, nature: '', principal: false }));
      setSelectedDocFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleDocDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files) {
      const newFiles = Array.from(files).map(f => ({ file: f, nature: '', principal: false }));
      setSelectedDocFiles(prev => [...prev, ...newFiles]);
    }
  };

  const uploadAllDocs = async () => {
    if (!docModal || selectedDocFiles.length === 0) return;
    setDocUploading(true);
    try {
      for (const item of selectedDocFiles) {
        const fd = new FormData();
        fd.append('file', item.file);
        fd.append('nature', item.nature);
        fd.append('est_principal', item.principal ? '1' : '0');
        const res = await fetch(`/api/contrats/${docModal.contrat.id}/documents`, { method: 'POST', headers: authHeaders(), body: fd });
        if (!res.ok) throw new Error();
      }
      await openDocModal(docModal.contrat);
      await fetchContrats();
      showMsg('success', `${selectedDocFiles.length} document${selectedDocFiles.length > 1 ? 's' : ''} joint${selectedDocFiles.length > 1 ? 's' : ''}`);
    } catch { showMsg('error', 'Erreur upload document'); }
    finally { setDocUploading(false); if (docFileRef.current) docFileRef.current.value = ''; }
  };

  const removeDocFile = (index: number) => {
    setSelectedDocFiles(prev => prev.filter((_, i) => i !== index));
  };

  const updateDocFile = (index: number, nature: string, principal: boolean) => {
    setSelectedDocFiles(prev => prev.map((item, i) => i === index ? { ...item, nature, principal } : item));
  };
  const handleDocDelete = async (docId: number) => {
    if (!docModal) return;
    await fetch(`/api/contrats/${docModal.contrat.id}/documents/${docId}`, { method: 'DELETE', headers: authHeaders() });
    await openDocModal(docModal.contrat); await fetchContrats();
  };

  // ─── Renouvellement ──────────────────────────────────────────────────────────

  const openRenewModal = (c: Contrat) => { setRenewModal(c); setRenewStatut(c.renouvellement_statut || 'en_cours'); setRenewComment(c.renouvellement_commentaire || ''); setRenewDate(''); };

  const saveRenew = async () => {
    if (!renewModal) return;
    try {
      await fetch(`/api/contrats/${renewModal.id}/renouvellement`, { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ renouvellement_statut: renewStatut, renouvellement_commentaire: renewComment, nouvelle_date_fin: renewDate }) });

      if (renewStatut === 'non_renouvelé') {
        await fetch(`/api/contrats/${renewModal.id}/statut`, { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ statut: 'archivé' }) });
        setRenewModal(null);
        await fetchContrats();
        showMsg('success', 'Renouvellement enregistré — contrat archivé');
      } else if (renewStatut === 'renouvelé') {
        // Archiver le contrat original
        await fetch(`/api/contrats/${renewModal.id}/statut`, { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ statut: 'archivé' }) });

        // Créer le nouveau contrat avec les mêmes infos de base
        const newContract: Partial<Contrat> = {
          svc: renewModal.svc,
          objet: renewModal.objet,
          raison_sociale: renewModal.raison_sociale,
          type_contrat: renewModal.type_contrat,
          direction: renewModal.direction,
          service: renewModal.service,
          perimetre: renewModal.perimetre,
          nature: renewModal.nature,
          fonction: renewModal.fonction,
          budget: '',
          annee_initiale: null,
          date_debut: null,
          duree_annees: null,
          nb_reconductions: null,
          date_fin: null,
          marche_contrat: '',
          piece: '',
          date_reconduction: '',
          reconduction: '',
          montant_2022: null,
          montant_2023: null,
          montant_2024: null,
          montant_2025: null,
          montant_2026: null,
          prevision_2026: null,
          prevision_2027: null,
          prevision_2028: null,
          commentaires: '',
          gti: renewModal.gti,
          gtr: renewModal.gtr,
          penalite: renewModal.penalite,
          indice_revision: renewModal.indice_revision,
          numero_facture: '',
          contrat_renouvellement_id: renewModal.id
        };

        const createRes = await fetch('/api/contrats', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(newContract) });
        const createdContract = await createRes.json();

        setRenewModal(null);
        await fetchContrats();

        // Ouvrir la modale d'édition du nouveau contrat
        setEditModal(createdContract);
        setEditModalData(createdContract);
        getLinkedContracts(createdContract);
        setCalculatedDateFin(false);

        showMsg('success', 'Contrat renouvellé — ancien contrat archivé');
      } else {
        setRenewModal(null);
        await fetchContrats();
        showMsg('success', 'Renouvellement enregistré');
      }
    } catch { showMsg('error', 'Erreur renouvellement'); }
  };

  // ─── Archivage ───────────────────────────────────────────────────────────────

  const handleArchive = async (c: Contrat) => {
    const s = c.statut === 'archivé' ? 'actif' : 'archivé';
    try { await fetch(`/api/contrats/${c.id}/statut`, { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ statut: s }) }); setArchiveConfirm(null); await fetchContrats(); showMsg('success', s === 'archivé' ? 'Archivé' : 'Restauré'); }
    catch { showMsg('error', 'Erreur archivage'); }
  };

  // ─── Colonnes ────────────────────────────────────────────────────────────────

  const toggleCol = (key: ColKey) => {
    setVisibleCols(prev => { const s = new Set(prev); if (s.has(key)) { if (s.size > 1) s.delete(key); } else s.add(key); return s; });
  };
  const showAllCols = () => setVisibleCols(new Set(COLS.map(c => c.key)));
  const resetCols = () => setVisibleCols(new Set(COLS.filter(c => c.defaultVisible !== false).map(c => c.key)));
  const saveColPreferences = () => {
    localStorage.setItem('columnPreferences', JSON.stringify(Array.from(visibleCols)));
    showMsg('success', 'Configuration des colonnes enregistrée');
  };

  // ─── Helpers UI ──────────────────────────────────────────────────────────────

  const rowBg = (c: Contrat, i: number) => {
    if (c.statut === 'archivé') return i % 2 === 0 ? '#f3f4f6' : '#e5e7eb';
    if (isExpired(c.date_fin)) return i % 2 === 0 ? '#fff0f0' : '#fde8e8';
    if (isExpiringSoon(c.date_fin)) return i % 2 === 0 ? '#fffbeb' : '#fef3c7';
    return i % 2 === 0 ? '#ffffff' : '#f9fafb';
  };

  const daysBadge = (c: Contrat) => {
    if (isNew(c.created_at)) return <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 700 }}>🆕 NEW</span>;
    const d = daysUntil(c.date_fin);
    if (d === null) return <span style={{ color: '#999' }}>—</span>;
    if (d < 0) return <span style={{ background: '#fee2e2', color: '#dc2626', padding: '1px 6px', borderRadius: 9999, fontSize: 11, fontWeight: 700 }}>{d} j</span>;
    if (d <= 90) return <span style={{ background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: 9999, fontSize: 11, fontWeight: 700 }}>{d} j</span>;
    return <span style={{ color: '#6b7280', fontSize: 12 }}>{d} j</span>;
  };

  const renewBadge = (c: Contrat) => {
    if (!c.renouvellement_statut) return null;
    const map: Record<string, [string, string]> = { en_cours: ['#fef3c7', '#b45309'], renouvelé: ['#dcfce7', '#15803d'], non_renouvelé: ['#fee2e2', '#dc2626'] };
    const labels: Record<string, string> = { en_cours: 'En cours', renouvelé: 'Renouvelé', non_renouvelé: 'Non renouvelé' };
    const [bg, col] = map[c.renouvellement_statut] ?? ['#f3f4f6', '#374151'];
    return <span style={{ background: bg, color: col, padding: '1px 6px', borderRadius: 9999, fontSize: 10, fontWeight: 600 }}>{labels[c.renouvellement_statut] ?? c.renouvellement_statut}</span>;
  };

  const reconductionLabel = (val: string) => {
    const map: Record<string, string> = { express: 'Express', tacite: 'Tacite', sans: 'Sans reconduction' };
    return map[val] || val;
  };

  const isDateFinCalculated = (c: Contrat): boolean => {
    const calculated = calculateDateFin(c.date_debut, c.duree_annees, c.nb_reconductions);
    return calculated === c.date_fin && c.date_fin !== null;
  };

  const renderCellValue = (c: Contrat, col: ColDef): React.ReactNode => {
    const v = c[col.key];
    switch (col.key) {
      case 'svc': return <b style={{ color: '#374151' }}>{c.svc || '—'}</b>;
      case 'objet': return <b title={c.objet} style={{ color: '#1e3a5f', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: (col.w - 16) + 'px' }}>{c.objet || '—'}</b>;
      case 'type_contrat': return c.type_contrat ? <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '1px 6px', borderRadius: 9999, fontSize: 10, fontWeight: 600 }}>{c.type_contrat}</span> : <span style={{ color: '#9ca3af' }}>—</span>;
      case 'date_debut': return fmtDate(c.date_debut);
      case 'date_fin': return <span style={{ fontStyle: isDateFinCalculated(c) ? 'italic' : 'normal', fontWeight: isDateFinCalculated(c) ? 600 : 400, color: isDateFinCalculated(c) ? '#10b981' : 'inherit' }}>{fmtDate(c.date_fin)}</span>;
      case 'reconduction': return c.reconduction ? <span style={{ background: '#f0fdf4', color: '#15803d', padding: '1px 6px', borderRadius: 9999, fontSize: 10, fontWeight: 600 }}>{reconductionLabel(c.reconduction)}</span> : <span style={{ color: '#9ca3af' }}>—</span>;
      case 'montant_2022': return <span style={{ color: '#6b7280' }}>{fmt(c.montant_2022)}</span>;
      case 'montant_2023': return <span style={{ color: '#6b7280' }}>{fmt(c.montant_2023)}</span>;
      case 'montant_2024': return <span style={{ color: '#6b7280' }}>{fmt(c.montant_2024)}</span>;
      case 'montant_2025': return <span style={{ color: '#6b7280' }}>{fmt(c.montant_2025)}</span>;
      case 'montant_2026': return <span style={{ fontWeight: 600, color: '#1e3a5f' }}>{fmt(c.montant_2026)}</span>;
      case 'prevision_2026': return fmt(c.prevision_2026);
      case 'prevision_2027': return fmt(c.prevision_2027);
      case 'prevision_2028': return fmt(c.prevision_2028);
      case 'duree_annees': return v != null ? `${v}a` : '—';
      case 'renouvellement_statut': return renewBadge(c);
      case 'tiers':
        return c.tiers ? (
          <button
            onClick={() => setTiersDetailModal({ code: c.tiers, nom: c.tiers_nom || c.tiers })}
            style={{
              background: '#dbeafe',
              color: '#1e40af',
              border: '1px solid #93c5fd',
              borderRadius: 9999,
              padding: '4px 12px',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
            title={`${c.tiers_nom || c.tiers} (${c.tiers})`}
          >
            {c.tiers_nom || c.tiers}
          </button>
        ) : (
          <span style={{ color: '#9ca3af' }}>—</span>
        );
      case 'app_id':
        return c.app_id ? (
          <button
            onClick={() => fetchAppDetails(c.app_id!)}
            style={{
              background: '#dcfce7',
              color: '#166534',
              border: '1px solid #86efac',
              borderRadius: 9999,
              padding: '4px 12px',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
            title={`${c.app_nom || `App #${c.app_id}`}`}
          >
            {c.app_nom || `App #${c.app_id}`}
          </button>
        ) : (
          <span style={{ color: '#9ca3af' }}>—</span>
        );
      case 'perimetre': case 'commentaires':
        return <span title={String(v ?? '')} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: col.w - 16 }}>{String(v ?? '') || <span style={{ color: '#9ca3af' }}>—</span>}</span>;
      default: return v != null && v !== '' ? String(v) : <span style={{ color: '#9ca3af' }}>—</span>;
    }
  };

  const btnAction = (title: string, bg: string, color: string, icon: React.ReactNode, onClick: () => void, disabled = false) => (
    <button title={title} onClick={onClick} disabled={disabled} style={{ background: disabled ? '#f3f4f6' : bg, color: disabled ? '#9ca3af' : color, border: 'none', borderRadius: 4, padding: '4px 7px', cursor: disabled ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center' }}>
      {icon}
    </button>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Toast */}
      {message && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, background: message.type === 'success' ? '#dcfce7' : '#fee2e2', color: message.type === 'success' ? '#166534' : '#991b1b', border: `1px solid ${message.type === 'success' ? '#86efac' : '#fca5a5'}`, borderRadius: 8, padding: '10px 16px', fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {message.type === 'success' ? <Check size={15} /> : <AlertCircle size={15} />}
          {message.text}
        </div>
      )}

      {/* Barre d'outils */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '8px 20px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <button onClick={() => setAlertFilter(alertFilter === 'expired' ? null : 'expired')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 11, background: alertFilter === 'expired' ? '#fee2e2' : '#f3f4f6', color: alertFilter === 'expired' ? '#dc2626' : '#374151' }}>
          <AlertCircle size={12} /> Expirés {expiredCount > 0 && <span style={{ background: '#dc2626', color: '#fff', borderRadius: 9999, padding: '0 5px', fontSize: 10 }}>{expiredCount}</span>}
        </button>
        <button onClick={() => setAlertFilter(alertFilter === 'soon' ? null : 'soon')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 11, background: alertFilter === 'soon' ? '#fef3c7' : '#f3f4f6', color: alertFilter === 'soon' ? '#b45309' : '#374151' }}>
          <AlertCircle size={12} /> ≤90j {soonCount > 0 && <span style={{ background: '#d97706', color: '#fff', borderRadius: 9999, padding: '0 5px', fontSize: 10 }}>{soonCount}</span>}
        </button>

        <div style={{ position: 'relative', flexGrow: 1, minWidth: 140 }}>
          <Search size={12} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input type="text" placeholder="Rechercher…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '5px 8px 5px 24px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }} />
        </div>

        <select value={filterDirection} onChange={e => setFilterDirection(e.target.value)} style={{ padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11 }}>
          <option value="">Toutes directions</option>
          {directions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11 }}>
          <option value="">Tous types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <button onClick={() => setShowArchives(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: showArchives ? '#374151' : '#f3f4f6', color: showArchives ? '#fff' : '#374151' }}>
          <Archive size={12} /> {showArchives ? 'Affichage : Archives' : 'Voir les archives'}
        </button>

        <button onClick={() => setShowFilterRow(f => !f)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: showFilterRow ? '#eff6ff' : '#f3f4f6', color: showFilterRow ? '#1d4ed8' : '#374151' }}>
          <Filter size={12} /> Filtres
        </button>

        {/* Colonnes */}
        <div style={{ position: 'relative' }} ref={colPanelRef}>
          <button onClick={() => setShowColPanel(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: showColPanel ? '#eff6ff' : '#f3f4f6', color: showColPanel ? '#1d4ed8' : '#374151' }}>
            <Columns size={12} /> Colonnes ({visibleCols.size})
          </button>
          {showColPanel && (
            <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 200, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', padding: 12, minWidth: 240, maxHeight: 400, overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                <button onClick={showAllCols} style={{ flex: 1, minWidth: 70, padding: '4px', fontSize: 11, borderRadius: 4, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer' }}>Tout afficher</button>
                <button onClick={resetCols} style={{ flex: 1, minWidth: 70, padding: '4px', fontSize: 11, borderRadius: 4, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer' }}>Réinitialiser</button>
                <button onClick={saveColPreferences} style={{ flex: 1, minWidth: 70, padding: '4px', fontSize: 11, borderRadius: 4, border: 'none', background: '#dbeafe', color: '#1d4ed8', fontWeight: 600, cursor: 'pointer' }}>Enregistrer</button>
              </div>
              {COLS.map(col => (
                <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)} style={{ width: 14, height: 14 }} />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => { setLoading(true); fetchContrats(); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 11 }}>
          <RefreshCw size={12} /> Actualiser
        </button>
        <button onClick={openNewContractModal} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
          <Plus size={12} /> Nouveau
        </button>
        <button onClick={() => excelInputRef.current?.click()} disabled={importing} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: importing ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600, opacity: importing ? 0.7 : 1 }}>
          {importing ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={12} />} Importer Excel
        </button>
        <input ref={excelInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleExcelImport} />
      </div>

      {/* Résultat import */}
      {importResult && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', margin: '6px 20px 0', borderRadius: 6, padding: '6px 12px', fontSize: 12, color: '#166534', display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0 }}>
          <Check size={13} /><span><b>{importResult.inserted}</b> ajoutés</span><span><b>{importResult.updated}</b> mis à jour (écrasement)</span><span><b>{importResult.skipped}</b> ignorés</span>
          {importResult.errors > 0 && <span style={{ color: '#dc2626' }}><b>{importResult.errors}</b> erreurs</span>}
          <button onClick={() => setImportResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}><CloseIcon size={11} /></button>
        </div>
      )}

      {/* Formulaire nouveau contrat */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, margin: '6px 20px 0', padding: 12, flexShrink: 0 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 13, color: '#1e3a5f' }}>Nouveau contrat</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 7 }}>
            {(['svc', 'objet', 'raison_sociale', 'tiers', 'type_contrat', 'direction', 'service', 'date_debut', 'date_fin', 'marche_contrat', 'reconduction'] as (keyof Contrat)[]).map(key => {
              const col = COLS.find(c => c.key === key);
              return (
                <div key={key}>
                  <label style={{ fontSize: 10, color: '#6b7280', display: 'block', marginBottom: 2 }}>{col?.label ?? key}</label>
                  <input type={col?.type === 'date' ? 'date' : 'text'} value={(newContrat[key] ?? '') as string}
                    onChange={e => setNewContrat({ ...newContrat, [key]: e.target.value })}
                    style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, boxSizing: 'border-box' }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowForm(false); setNewContrat({}); }} style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 11 }}>Annuler</button>
            <button onClick={handleCreate} style={{ padding: '5px 10px', borderRadius: 5, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Créer</button>
          </div>
        </div>
      )}

      {/* Tableau */}
      <div style={{ flex: 1, margin: '6px 20px 10px', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#6b7280', background: '#fff', borderRadius: 8 }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} /><p>Chargement…</p>
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#6b7280', background: '#fff', borderRadius: 8 }}>
            <FileSpreadsheet size={36} style={{ opacity: 0.25, marginBottom: 8 }} />
            <p>Aucun contrat{searchQuery || filterDirection || filterType || alertFilter ? ' correspondant' : ''}.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'scroll', overflowY: 'auto', flex: 1 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, background: '#fff', minWidth: 'max-content', width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                {/* En-têtes colonnes */}
                <tr>
                  {activeCols.map(col => (
                    <th key={col.key} onClick={() => handleSort(col.key)} style={{ padding: '7px 8px', background: '#1e3a5f', color: '#fff', fontWeight: 600, fontSize: 11, textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap', width: col.w, userSelect: 'none' }}>
                      {col.label}<SI k={col.key} />
                    </th>
                  ))}
                  {/* Échéance calculée */}
                  <th style={{ padding: '7px 8px', background: '#1e3a5f', color: '#fff', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap', width: 60 }}>Éch.</th>
                  <th style={{ padding: '7px 8px', background: '#1e3a5f', color: '#fff', fontSize: 11, whiteSpace: 'nowrap', width: 145 }}>Actions</th>
                </tr>
                {/* Ligne filtres */}
                {showFilterRow && (
                  <tr style={{ background: '#f0f4ff' }}>
                    {activeCols.map(col => (
                      <th key={col.key} style={{ padding: '3px 4px', fontWeight: 'normal' }}>
                        <input
                          type="text"
                          value={colFilters[col.key] ?? ''}
                          onChange={e => setColFilters(f => ({ ...f, [col.key]: e.target.value }))}
                          placeholder="Filtrer…"
                          style={{ width: '100%', padding: '2px 5px', border: '1px solid #c7d2fe', borderRadius: 4, fontSize: 10, background: '#fff', boxSizing: 'border-box' }}
                        />
                      </th>
                    ))}
                    <th style={{ padding: '3px 4px' }} />
                    <th style={{ padding: '3px 4px', textAlign: 'center' }}>
                      <button onClick={() => setColFilters({})} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid #c7d2fe', background: '#fff', cursor: 'pointer', color: '#6b7280' }}>Effacer</button>
                    </th>
                  </tr>
                )}
              </thead>
              <tbody>
                {sorted.map((c, i) => {
                  const archived = c.statut === 'archivé';
                  return (
                    <tr key={c.id} style={{ background: rowBg(c, i), opacity: archived ? 0.6 : 1 }}>
                      {activeCols.map(col => (
                        <td key={col.key} style={{ padding: '5px 8px', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap', maxWidth: col.w }}>
                          {renderCellValue(c, col)}
                        </td>
                      ))}
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{daysBadge(c)}</td>
                      {/* Actions */}
                      <td style={{ padding: '4px 6px', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          {btnAction('Éditer', '#eff6ff', '#1d4ed8', <Edit2 size={12} />, () => openEditModal(c))}
                          {btnAction('Joindre un document', '#faf5ff', '#7c3aed', <Paperclip size={12} />, () => openDocModal(c))}
                          {btnAction('Voir les documents', c.doc_principal_path ? '#f0fdf4' : '#f3f4f6', c.doc_principal_path ? '#15803d' : '#9ca3af', <Eye size={12} />, () => openDocViewModal(c), false)}
                          {btnAction('Renouveler', '#fff7ed', '#c2410c', <RefreshCcw size={12} />, () => openRenewModal(c))}
                          {archived
                            ? btnAction('Restaurer', '#f0fdf4', '#15803d', <ArchiveRestore size={12} />, () => handleArchive(c))
                            : btnAction('Archiver', '#f3f4f6', '#6b7280', <Archive size={12} />, () => setArchiveConfirm(c))
                          }
                          {deleteConfirm === c.id
                            ? <><button onClick={() => handleDelete(c.id)} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 6px', cursor: 'pointer', fontSize: 10 }}>Oui</button><button onClick={() => setDeleteConfirm(null)} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 4, padding: '4px 6px', cursor: 'pointer', fontSize: 10 }}>Non</button></>
                            : btnAction('Supprimer', '#fee2e2', '#dc2626', <Trash2 size={12} />, () => setDeleteConfirm(c.id))
                          }
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: '4px 20px 8px', color: '#9ca3af', fontSize: 11, flexShrink: 0 }}>
        {sorted.length} contrat{sorted.length !== 1 ? 's' : ''} affichés sur {contrats.length} · {activeCols.length} colonne{activeCols.length !== 1 ? 's' : ''} visible{activeCols.length !== 1 ? 's' : ''}
      </div>

      {/* ── Modale : Édition contrat ──────────────────────────────────────────── */}
      {editModalData && (() => {
        const mf = (label: string, field: keyof Contrat, type = 'text') => (
          <div key={field}>
            <label style={{ fontSize: 10, color: '#6b7280', display: 'block', marginBottom: 2 }}>{label}</label>
            <input
              type={type}
              value={String(editModalData[field] ?? '')}
              onChange={e => setEditModalData(p => p ? { ...p, [field]: e.target.value } : p)}
              style={{ width: '100%', padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }}
            />
          </div>
        );
        const sectionTitle = (title: string) => (
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1e3a5f', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8, marginTop: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>
            {title}
          </div>
        );
        return (
          <Overlay onClose={() => { setEditModal(null); setEditModalData(null); setTiersSearch(''); setAppsSearch(''); }} maxWidth={860}>
            <ModalHeader title={editModal ? `Éditer — ${editModal.objet || 'contrat'}${isNew(editModal.created_at) ? ' 🆕' : ''}` : 'Nouveau contrat'} onClose={() => { setEditModal(null); setEditModalData(null); setTiersSearch(''); setAppsSearch(''); }} />

            {linkedContracts?.previous && (
              <div style={{ marginBottom: 12, padding: 10, background: '#f0fdf4', borderRadius: 6, border: '1px solid #dcfce7' }}>
                <button onClick={() => { setEditModal(linkedContracts.previous); setEditModalData({ ...linkedContracts.previous! }); getLinkedContracts(linkedContracts.previous!); }} style={{ fontSize: 11, color: '#15803d', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                  ← Contrat renouvelé: {linkedContracts.previous.objet}
                </button>
              </div>
            )}

            {editModal && (
              <div style={{ background: '#faf5ff', borderRadius: 6, padding: 10, border: '1px solid #e9d5ff', marginBottom: 12 }}>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    if (!editModal.id) {
                      showMsg('error', 'Enregistrez le contrat d\'abord');
                      return;
                    }
                    const files = e.dataTransfer.files;
                    if (files) {
                      setDocUploading(true);
                      (async () => {
                        try {
                          for (const file of Array.from(files)) {
                            const fd = new FormData();
                            fd.append('file', file);
                            fd.append('nature', '');
                            fd.append('est_principal', '0');
                            await fetch(`/api/contrats/${editModal.id}/documents`, { method: 'POST', headers: authHeaders(), body: fd });
                          }
                          await fetchContrats();
                          showMsg('success', `${files.length} document${files.length > 1 ? '(s)' : ''} uploadé${files.length > 1 ? 's' : ''}`);
                        } catch {
                          showMsg('error', 'Erreur upload');
                        } finally {
                          setDocUploading(false);
                        }
                      })();
                    }
                  }}
                  onClick={() => editModal.id && docFileRef.current?.click()}
                  style={{
                    background: dragOver ? '#e0e7ff' : '#f3f4f6',
                    border: `2px dashed ${dragOver ? '#4f46e5' : '#d1d5db'}`,
                    borderRadius: 6,
                    padding: 12,
                    textAlign: 'center',
                    cursor: editModal.id ? 'pointer' : 'not-allowed',
                    marginBottom: 0,
                    transition: 'all 0.2s',
                    opacity: editModal.id ? 1 : 0.6,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: '#1f2937' }}>
                    {docUploading ? '⏳ Upload en cours...' : '📎 Dépose ou clique'}
                  </p>
                </div>
              </div>
            )}

            {sectionTitle('Identification')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <div key="svc">
                <label style={{ fontSize: 10, color: '#6b7280', display: 'block', marginBottom: 2 }}>SVC</label>
                <select
                  value={String(editModalData.svc ?? '')}
                  onChange={e => setEditModalData(p => p ? { ...p, svc: e.target.value } : p)}
                  style={{ width: '100%', padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }}
                >
                  <option value="">— Sélectionner —</option>
                  <option value="BF1">BF1</option>
                  <option value="BF6">BF6</option>
                  <option value="BF8">BF8</option>
                  <option value="BF9">BF9</option>
                </select>
              </div>
              {mf('Logiciel / Objet', 'objet')}
              {mf('Fournisseur', 'raison_sociale')}
              <div key="tiers" style={{ position: 'relative' }}>
                <label style={{ fontSize: 10, color: '#6b7280', display: 'block', marginBottom: 2 }}>Tiers</label>
                <input
                  type="text"
                  placeholder="Rechercher un tiers..."
                  value={tiersSearch}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTiersSearch(val);
                    searchTiers(val);
                    setShowTiersSuggestions(true);
                  }}
                  onFocus={() => setShowTiersSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowTiersSuggestions(false), 200)}
                  style={{ width: '100%', padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }}
                />
                {showTiersSuggestions && tiersSuggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderTop: 'none', borderRadius: '0 0 5px 5px', maxHeight: '200px', overflowY: 'auto', zIndex: 10 }}>
                    {tiersSuggestions.map((t) => (
                      <div
                        key={t.code}
                        onClick={() => {
                          setEditModalData(p => p ? { ...p, tiers: t.code } : p);
                          setTiersSearch(t.name);
                          setShowTiersSuggestions(false);
                        }}
                        style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', fontSize: 11, color: '#374151' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                      >
                        <div style={{ fontWeight: 600 }}>{t.code}</div>
                        <div style={{ fontSize: 10, color: '#6b7280' }}>{t.name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div key="app_id" style={{ position: 'relative' }}>
                <label style={{ fontSize: 10, color: '#6b7280', display: 'block', marginBottom: 2 }}>Application</label>
                <input
                  type="text"
                  placeholder="Rechercher une application..."
                  value={appsSearch}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAppsSearch(val);
                    searchApps(val);
                    setShowAppsSuggestions(true);
                  }}
                  onFocus={() => setShowAppsSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowAppsSuggestions(false), 200)}
                  style={{ width: '100%', padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }}
                />
                {showAppsSuggestions && appsSuggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderTop: 'none', borderRadius: '0 0 5px 5px', maxHeight: '200px', overflowY: 'auto', zIndex: 10 }}>
                    {appsSuggestions.map((a) => (
                      <div
                        key={a.id}
                        onClick={() => {
                          setEditModalData(p => p ? { ...p, app_id: a.id } : p);
                          setAppsSearch(a.name);
                          setShowAppsSuggestions(false);
                        }}
                        style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', fontSize: 11, color: '#374151' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                      >
                        <div style={{ fontWeight: 600 }}>{a.name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {mf('Type', 'type_contrat')}
              {mf('Marché / Contrat', 'marche_contrat')}
              {mf('Pièce', 'piece')}
            </div>

            {sectionTitle('Organisation')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {mf('Direction', 'direction')}
              {mf('Service', 'service')}
              {mf('Périmètre', 'perimetre')}
              {mf('Nature', 'nature')}
              {mf('Fonction', 'fonction')}
              {mf('Budget', 'budget')}
              {mf('Année initiale', 'annee_initiale', 'number')}
            </div>

            {sectionTitle('Dates & durée')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {mf('Date de début', 'date_debut', 'date')}
              <div key="date_fin">
                <label style={{ fontSize: 10, color: '#6b7280', display: 'block', marginBottom: 2 }}>Date de fin {calculatedDateFin && <span style={{ fontSize: 9, fontStyle: 'italic', color: '#10b981' }}>(calculée)</span>}</label>
                <input
                  type="date"
                  value={String(editModalData.date_fin ?? '')}
                  onChange={e => setEditModalData(p => p ? { ...p, date_fin: e.target.value } : p)}
                  style={{ width: '100%', padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, boxSizing: 'border-box', fontStyle: calculatedDateFin ? 'italic' : 'normal', fontWeight: calculatedDateFin ? 600 : 400, color: calculatedDateFin ? '#10b981' : '#1f2937' }}
                />
              </div>
              {mf('Durée (années)', 'duree_annees', 'number')}
              <div key="nb_reconductions">
                <label style={{ fontSize: 10, color: editModalData.reconduction === 'sans' ? '#d1d5db' : '#6b7280', display: 'block', marginBottom: 2 }}>Nb reconductions</label>
                <input
                  type="number"
                  value={String(editModalData.nb_reconductions ?? '')}
                  onChange={e => setEditModalData(p => p ? { ...p, nb_reconductions: e.target.value ? parseInt(e.target.value) : null } : p)}
                  disabled={editModalData.reconduction === 'sans'}
                  style={{ width: '100%', padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, boxSizing: 'border-box', background: editModalData.reconduction === 'sans' ? '#f3f4f6' : '#fff', color: editModalData.reconduction === 'sans' ? '#d1d5db' : '#1f2937', cursor: editModalData.reconduction === 'sans' ? 'not-allowed' : 'text' }}
                />
              </div>
              {mf('Date de reconduction', 'date_reconduction')}
              <div key="reconduction">
                <label style={{ fontSize: 10, color: '#6b7280', display: 'block', marginBottom: 2 }}>Type de reconduction</label>
                <select
                  value={String(editModalData.reconduction ?? '')}
                  onChange={e => {
                    const newRecond = e.target.value;
                    setEditModalData(p => p ? { ...p, reconduction: newRecond, nb_reconductions: newRecond === 'sans' ? 0 : p.nb_reconductions } : p);
                  }}
                  style={{ width: '100%', padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }}
                >
                  <option value="">— Sélectionner —</option>
                  <option value="express">Express</option>
                  <option value="tacite">Tacite</option>
                  <option value="sans">Sans reconduction</option>
                </select>
              </div>
            </div>
            <button
              onClick={() => {
                console.log('Avant calcul:', { debut: editModalData.date_debut, duree: editModalData.duree_annees, recond: editModalData.nb_reconductions });
                const calculated = calculateDateFin(editModalData.date_debut ?? null, editModalData.duree_annees ?? null, editModalData.nb_reconductions ?? null);
                console.log('Résultat calcul:', calculated);
                if (calculated) {
                  setEditModalData(p => p ? { ...p, date_fin: calculated } : p);
                  setCalculatedDateFin(true);
                  showMsg('success', `Date calculée : ${calculated}`);
                } else {
                  showMsg('error', 'Remplir : Date début + Durée + Nb reconductions');
                }
              }}
              style={{ marginTop: 8, padding: '5px 12px', borderRadius: 5, border: '1px solid #d1d5db', background: '#f0fdf4', color: '#15803d', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
            >
              📅 Calculer date de fin
            </button>

            {sectionTitle('Montants')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {mf('2022', 'montant_2022', 'number')}
              {mf('2023', 'montant_2023', 'number')}
              {mf('2024', 'montant_2024', 'number')}
              {mf('2025', 'montant_2025', 'number')}
              {mf('2026', 'montant_2026', 'number')}
              {mf('Prév. 2026', 'prevision_2026', 'number')}
              {mf('Prév. 2027', 'prevision_2027', 'number')}
              {mf('Prév. 2028', 'prevision_2028', 'number')}
            </div>

            {/* Zone spéciale Niveaux de service */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 10 }}>
                Niveaux de service
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {mf('GTI', 'gti')}
                {mf('GTR', 'gtr')}
                {mf('Pénalité', 'penalite')}
                {mf('Indice de révision', 'indice_revision')}
              </div>
            </div>

            {sectionTitle('Facturation')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {mf('N° Facture', 'numero_facture')}
            </div>

            {sectionTitle('Commentaires')}
            <div>
              <textarea
                value={String(editModalData.commentaires ?? '')}
                onChange={e => setEditModalData(p => p ? { ...p, commentaires: e.target.value } : p)}
                rows={3}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>

            {linkedContracts && linkedContracts.renewals.length > 0 && (
              <>
                {sectionTitle('Renouvellements suivants')}
                {linkedContracts.renewals.length > 0 && (
                  <div style={{ marginBottom: 12, padding: 12, background: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe' }}>
                    <p style={{ margin: '0 0 8px', fontSize: 11, color: '#6b7280', fontWeight: 600 }}>Renouvellements</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {linkedContracts.renewals.map(renewal => (
                        <button key={renewal.id} onClick={() => { setEditModal(renewal); setEditModalData({ ...renewal }); getLinkedContracts(renewal); }} style={{ fontSize: 12, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600, padding: 0, textAlign: 'left' }}>
                          {renewal.date_debut ? `À partir du ${new Date(renewal.date_debut).toLocaleDateString('fr-FR')}` : 'Renouvellement'}
                          {renewal.renouvellement_statut && ` (${renewal.renouvellement_statut === 'renouvelé' ? '✓ Renouvelé' : renewal.renouvellement_statut === 'non_renouvelé' ? '✗ Non renouvelé' : 'En cours'})`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => { setEditModal(null); setEditModalData(null); setTiersSearch(''); setAppsSearch(''); }} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={saveModal} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#1e3a5f', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <Check size={13} style={{ display: 'inline', marginRight: 5 }} />Enregistrer
              </button>
            </div>
          </Overlay>
        );
      })()}

      {/* ── Modale : Documents ─────────────────────────────────────────────────── */}
      {docModal && (
        <Overlay onClose={() => setDocModal(null)}>
          <ModalHeader title={`Documents — ${docModal.contrat.objet}`} onClose={() => setDocModal(null)} />
          {docModal.docs.length === 0
            ? <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 16px' }}>Aucun document joint.</p>
            : <div style={{ marginBottom: 16 }}>
              {docModal.docs.map(doc => (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <FileText size={13} style={{ color: '#6b7280', flexShrink: 0 }} />
                  <div style={{ flexGrow: 1, minWidth: 0 }}>
                    <button onClick={() => setPdfModal({ path: doc.file_path, name: doc.file_name })} style={{ fontSize: 13, color: '#1d4ed8', textDecoration: 'none', fontWeight: doc.est_principal ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{doc.file_name}</button>
                    {doc.nature && <span style={{ marginLeft: 6, fontSize: 10, color: '#6b7280', background: '#f3f4f6', padding: '1px 6px', borderRadius: 9999 }}>{doc.nature}</span>}
                    {doc.est_principal === 1 && <span style={{ marginLeft: 4, fontSize: 10, color: '#15803d', background: '#dcfce7', padding: '1px 6px', borderRadius: 9999, fontWeight: 700 }}>Principal</span>}
                  </div>
                  <button onClick={() => handleDocDelete(doc.id)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 4, padding: '3px 6px', cursor: 'pointer' }}><Trash2 size={11} /></button>
                </div>
              ))}
            </div>
          }
          <div style={{ background: '#f9fafb', borderRadius: 8, padding: 14, border: '1px solid #e5e7eb' }}>
            <p style={{ margin: '0 0 10px', fontWeight: 600, fontSize: 13 }}>Joindre des documents</p>

            {/* Zone drag-and-drop */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDocDrop}
              onClick={() => docFileRef.current?.click()}
              style={{
                background: dragOver ? '#e0e7ff' : '#f3f4f6',
                border: `2px dashed ${dragOver ? '#4f46e5' : '#d1d5db'}`,
                borderRadius: 8,
                padding: 20,
                textAlign: 'center',
                cursor: 'pointer',
                marginBottom: 12,
                transition: 'all 0.2s',
              }}
            >
              <Upload size={24} style={{ margin: '0 auto 8px', color: '#6b7280' }} />
              <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: '#1f2937' }}>Glisse des fichiers ici</p>
              <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>ou clique pour parcourir</p>
            </div>

            {/* Liste des fichiers sélectionnés */}
            {selectedDocFiles.length > 0 && (
              <div style={{ marginBottom: 12, maxHeight: 300, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, padding: 10 }}>
                {selectedDocFiles.map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, padding: '8px', borderBottom: idx < selectedDocFiles.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 500 }}>{item.file.name}</div>
                    <input
                      type="text"
                      placeholder="Nature"
                      value={item.nature}
                      onChange={e => updateDocFile(idx, e.target.value, item.principal)}
                      style={{ padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, minWidth: 100, boxSizing: 'border-box' }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={item.principal} onChange={e => updateDocFile(idx, item.nature, e.target.checked)} style={{ width: 14, height: 14 }} />
                      Principal
                    </label>
                    <button onClick={() => removeDocFile(idx)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 4, padding: '3px 6px', cursor: 'pointer' }}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => docFileRef.current?.click()} disabled={docUploading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, border: 'none', background: '#7c3aed', color: '#fff', cursor: docUploading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
                <Upload size={13} /> Ajouter fichiers
              </button>
              <button onClick={uploadAllDocs} disabled={selectedDocFiles.length === 0 || docUploading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, border: 'none', background: selectedDocFiles.length > 0 ? '#16a34a' : '#d1d5db', color: '#fff', cursor: selectedDocFiles.length > 0 && !docUploading ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>
                {docUploading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />} Ajouter tous ({selectedDocFiles.length})
              </button>
            </div>

            <input ref={docFileRef} type="file" style={{ display: 'none' }} onChange={handleDocSelect} multiple />
          </div>
        </Overlay>
      )}

      {/* ── Modale : Renouvellement ───────────────────────────────────────────── */}
      {renewModal && (
        <Overlay onClose={() => setRenewModal(null)}>
          <ModalHeader title={`Renouveler — ${renewModal.objet}`} onClose={() => setRenewModal(null)} />
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Statut</label>
              <select value={renewStatut} onChange={e => setRenewStatut(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                <option value="en_cours">En cours de renouvellement</option>
                <option value="renouvelé">Renouvelé</option>
                <option value="non_renouvelé">Non renouvelé</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Nouvelle date de fin</label>
              <input type="date" value={renewDate} onChange={e => setRenewDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Commentaire</label>
              <textarea value={renewComment} onChange={e => setRenewComment(e.target.value)} rows={3} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setRenewModal(null)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={saveRenew} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#c2410c', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Enregistrer</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ── Modale : Archivage ────────────────────────────────────────────────── */}
      {archiveConfirm && (
        <Overlay onClose={() => setArchiveConfirm(null)}>
          <ModalHeader title="Archiver le contrat" onClose={() => setArchiveConfirm(null)} />
          <p style={{ fontSize: 14, color: '#374151', margin: '0 0 20px' }}>Archiver <b>{archiveConfirm.objet}</b> ({archiveConfirm.raison_sociale}) ? Il sera masqué de la liste principale.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setArchiveConfirm(null)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
            <button onClick={() => handleArchive(archiveConfirm)} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#374151', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <Archive size={13} style={{ display: 'inline', marginRight: 5 }} />Archiver
            </button>
          </div>
        </Overlay>
      )}

      {/* ── Modale : Visualisation PDF ────────────────────────────────────────── */}
      {pdfModal && (
        <Overlay onClose={() => setPdfModal(null)} maxWidth={900}>
          <ModalHeader title={pdfModal.name} onClose={() => setPdfModal(null)} />
          <iframe
            src={`/api/${pdfModal.path}`}
            style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 6 }}
            title={pdfModal.name}
          />
        </Overlay>
      )}

      {/* ── Modale : Visualisation des Documents avec Navigation ────────────────── */}
      {docViewModal && (
        <Overlay onClose={() => setDocViewModal(null)} maxWidth={1000}>
          <ModalHeader title={`Documents — ${docViewModal.contrat.objet}`} onClose={() => setDocViewModal(null)} />
          <div style={{ display: 'flex', gap: 16, height: '70vh' }}>
            {/* Affichage du document */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #e5e7eb' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1f2937' }}>
                    {docViewModal.docs[docViewModal.currentIndex]?.file_name}
                  </h4>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6b7280' }}>
                    Document {docViewModal.currentIndex + 1} sur {docViewModal.docs.length}
                    {docViewModal.docs[docViewModal.currentIndex]?.est_principal === 1 && (
                      <span style={{ marginLeft: 8, color: '#15803d', fontWeight: 700 }}>• Principal</span>
                    )}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setDocViewModal(v => v ? { ...v, currentIndex: Math.max(0, v.currentIndex - 1) } : null)}
                    disabled={docViewModal.currentIndex === 0}
                    style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: docViewModal.currentIndex === 0 ? '#f3f4f6' : '#eff6ff', color: docViewModal.currentIndex === 0 ? '#9ca3af' : '#1d4ed8', cursor: docViewModal.currentIndex === 0 ? 'default' : 'pointer', fontSize: 11, fontWeight: 600 }}
                  >
                    ← Précédent
                  </button>
                  <button
                    onClick={() => setDocViewModal(v => v ? { ...v, currentIndex: Math.min(v.docs.length - 1, v.currentIndex + 1) } : null)}
                    disabled={docViewModal.currentIndex === docViewModal.docs.length - 1}
                    style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: docViewModal.currentIndex === docViewModal.docs.length - 1 ? '#f3f4f6' : '#eff6ff', color: docViewModal.currentIndex === docViewModal.docs.length - 1 ? '#9ca3af' : '#1d4ed8', cursor: docViewModal.currentIndex === docViewModal.docs.length - 1 ? 'default' : 'pointer', fontSize: 11, fontWeight: 600 }}
                  >
                    Suivant →
                  </button>
                </div>
              </div>
              <iframe
                src={`/api/${docViewModal.docs[docViewModal.currentIndex]?.file_path}`}
                style={{ flex: 1, border: 'none', borderRadius: 6, background: '#f9fafb' }}
                title={docViewModal.docs[docViewModal.currentIndex]?.file_name}
              />
            </div>

            {/* Panneau droit : Documents et Infos */}
            <div style={{ width: 250, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e5e7eb', paddingLeft: 16, overflowY: 'auto' }}>
              {/* Liste des documents */}
              <div style={{ marginBottom: 20 }}>
                <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 600, color: '#374151' }}>Documents du contrat</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {docViewModal.docs.map((doc, idx) => (
                    <button
                      key={doc.id}
                      onClick={() => setDocViewModal(v => v ? { ...v, currentIndex: idx } : null)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 4,
                        border: idx === docViewModal.currentIndex ? '1px solid #1d4ed8' : '1px solid #e5e7eb',
                        background: idx === docViewModal.currentIndex ? '#eff6ff' : '#fff',
                        color: '#1f2937',
                        cursor: 'pointer',
                        fontSize: 11,
                        textAlign: 'left',
                        fontWeight: idx === docViewModal.currentIndex ? 600 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        transition: 'all 0.2s'
                      }}
                      title={doc.file_name}
                    >
                      <FileText size={11} style={{ flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {doc.file_name}
                        {doc.est_principal === 1 && ' ⭐'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Informations du contrat */}
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 600, color: '#374151' }}>Informations</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, fontSize: 11 }}>
                  <div>
                    <label style={{ color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>Date début</label>
                    <input type="date" value={docViewEditData?.date_debut?.split('T')[0] || ''} onChange={(e) => setDocViewEditData(d => d ? { ...d, date_debut: e.target.value } : null)} style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                  </div>
                  <div>
                    <label style={{ color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>Durée (années)</label>
                    <input type="number" value={docViewEditData?.duree_annees ?? ''} onChange={(e) => setDocViewEditData(d => d ? { ...d, duree_annees: e.target.value ? parseInt(e.target.value) : null } : null)} style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                  </div>
                  <div>
                    <label style={{ color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>Reconductions</label>
                    <input type="number" value={docViewEditData?.nb_reconductions ?? ''} onChange={(e) => setDocViewEditData(d => d ? { ...d, nb_reconductions: e.target.value ? parseInt(e.target.value) : null } : null)} style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                  </div>
                  <div>
                    <label style={{ color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>Type reconduction</label>
                    <select value={docViewEditData?.reconduction || ''} onChange={(e) => setDocViewEditData(d => d ? { ...d, reconduction: e.target.value } : null)} style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }}>
                      <option value="">—</option>
                      <option value="express">Express</option>
                      <option value="tacite">Tacite</option>
                      <option value="sans">Sans</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>Date fin</label>
                    <input type="date" value={docViewEditData?.date_fin?.split('T')[0] || ''} onChange={(e) => setDocViewEditData(d => d ? { ...d, date_fin: e.target.value } : null)} style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                  </div>
                  <div>
                    <label style={{ color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>GTI</label>
                    <input type="text" value={docViewEditData?.gti || ''} onChange={(e) => setDocViewEditData(d => d ? { ...d, gti: e.target.value } : null)} style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                  </div>
                  <div>
                    <label style={{ color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>GTR</label>
                    <input type="text" value={docViewEditData?.gtr || ''} onChange={(e) => setDocViewEditData(d => d ? { ...d, gtr: e.target.value } : null)} style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                  </div>
                  <div>
                    <label style={{ color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>Indice révision</label>
                    <input type="text" value={docViewEditData?.indice_revision || ''} onChange={(e) => setDocViewEditData(d => d ? { ...d, indice_revision: e.target.value } : null)} style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                  </div>
                  <div>
                    <label style={{ color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>Montant initial</label>
                    <input type="number" value={docViewEditData?.montant_2022 ?? ''} onChange={(e) => setDocViewEditData(d => d ? { ...d, montant_2022: e.target.value ? parseFloat(e.target.value) : null } : null)} style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                  </div>
                </div>
                <button onClick={saveDocViewModal} style={{ width: '100%', padding: '6px 12px', marginTop: 12, borderRadius: 4, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Enregistrer</button>
              </div>
            </div>
          </div>
        </Overlay>
      )}

      {tiersDetailModal && (
        <Overlay onClose={() => setTiersDetailModal(null)}>
          <ModalHeader title={`Détails du Tiers`} onClose={() => setTiersDetailModal(null)} />
          <div style={{ padding: '20px', maxWidth: 600 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20 }}>
              <div>
                <label style={{ color: '#6b7280', fontWeight: 600, fontSize: 12 }}>Code</label>
                <p style={{ margin: '8px 0 0', fontSize: 16, fontWeight: 700, color: '#1f2937' }}>{tiersDetailModal.code}</p>
              </div>
              <div>
                <label style={{ color: '#6b7280', fontWeight: 600, fontSize: 12 }}>Nom</label>
                <p style={{ margin: '8px 0 0', fontSize: 16, fontWeight: 700, color: '#1f2937' }}>{tiersDetailModal.nom}</p>
              </div>
            </div>
            <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
              <button onClick={() => setTiersDetailModal(null)} style={{ flex: 1, padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer', fontWeight: 600 }}>Fermer</button>
            </div>
          </div>
        </Overlay>
      )}

      {appDetailModal && (
        <Overlay onClose={() => setAppDetailModal(null)} maxWidth={700}>
          <ModalHeader title={`Application`} onClose={() => setAppDetailModal(null)} />
          {appDetailLoading ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ color: '#6b7280' }}>Chargement...</p>
            </div>
          ) : (
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
                {appDetailModal.icon && (
                  <img src={appDetailModal.icon} alt={appDetailModal.name} style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }} />
                )}
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#1f2937' }}>{appDetailModal.name}</h2>
                  <p style={{ margin: '8px 0 0', fontSize: 14, color: '#6b7280' }}>{appDetailModal.description}</p>
                  {appDetailModal.url && (
                    <a href={appDetailModal.url} target="_blank" rel="noopener noreferrer" style={{ marginTop: 12, display: 'inline-block', color: '#1d4ed8', textDecoration: 'none', fontWeight: 500, fontSize: 12 }}>
                      Accéder à l'application →
                    </a>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24, padding: '16px', background: '#f9fafb', borderRadius: 8 }}>
                <div>
                  <label style={{ color: '#6b7280', fontWeight: 600, fontSize: 12 }}>ID</label>
                  <p style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{appDetailModal.id}</p>
                </div>
                <div>
                  <label style={{ color: '#6b7280', fontWeight: 600, fontSize: 12 }}>Catégorie</label>
                  <p style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{appDetailModal.category_id || '—'}</p>
                </div>
                {appDetailModal.app_type && (
                  <div>
                    <label style={{ color: '#6b7280', fontWeight: 600, fontSize: 12 }}>Type</label>
                    <p style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{appDetailModal.app_type}</p>
                  </div>
                )}
                {appDetailModal.present_magapp && (
                  <div>
                    <label style={{ color: '#6b7280', fontWeight: 600, fontSize: 12 }}>Présent dans MagApp</label>
                    <p style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 600, color: appDetailModal.present_magapp === 'oui' ? '#15803d' : '#dc2626' }}>{appDetailModal.present_magapp === 'oui' ? '✓ Oui' : '✗ Non'}</p>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
                {appDetailModal.url && (
                  <a href={appDetailModal.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: '10px 16px', borderRadius: 6, border: 'none', background: '#1d4ed8', color: '#fff', cursor: 'pointer', fontWeight: 600, textAlign: 'center', textDecoration: 'none' }}>
                    Ouvrir l'application
                  </a>
                )}
                <button onClick={() => setAppDetailModal(null)} style={{ flex: 1, padding: '10px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer', fontWeight: 600 }}>Fermer</button>
              </div>
            </div>
          )}
        </Overlay>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { height: 8px; width: 8px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #64748b; }
      `}</style>
      </div>
    </div>
  );
};

export default Contrats;

