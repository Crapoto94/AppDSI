import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Search, ChevronUp, ChevronDown, ChevronRight, Columns, ExternalLink, Link2, AppWindow, Rocket, Eye, CheckCircle, Files } from 'lucide-react';
import ServiceFaitModal from './ServiceFaitModal';
import ServiceFaitProcessusModal from './ServiceFaitProcessusModal';
import FactureDocumentsViewer from './finance/FactureDocumentsViewer';
import MandatementModal from './MandatementModal';

interface MappingColumn {
  name: string;
  display_type: string;
  expression?: string;
  expression_type?: string;
}

interface Operation {
  id: number;
  LIBELLE: string;
  Service: string;
  Section?: string | null;
}

interface ColumnStyle { bold: boolean; color: string; }

interface MappedDataTableProps {
  rubriqueName: string;
  title?: string;
  pageSize?: number;
  fiscalYear?: number | string;
  onOpenColumnSettings?: () => void;
  columnStyles?: Record<string, ColumnStyle>;
  onColumnsReady?: (columns: string[]) => void;
  visibleColumns?: string[];
  sectionFilter?: string;
  // Source des données : 'pg' (copie locale oracle.gf_oracle_*, défaut) ou 'sedit'
  // (interrogation directe de la base Sedit — page « Factures (beta) »).
  dataSource?: 'pg' | 'sedit';
}

const MappedDataTable: React.FC<MappedDataTableProps> = ({ rubriqueName, title: _title, pageSize = 25, fiscalYear, onOpenColumnSettings, columnStyles, onColumnsReady, visibleColumns, sectionFilter, dataSource = 'pg' }) => {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const storageKey = `mdt_cols_${rubriqueName}`;
  const pageStorageKey = `mdt_pagesize_${rubriqueName}`;
  const [columns, setColumns] = useState<MappingColumn[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [defaultSortApplied, setDefaultSortApplied] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(() => {
    try {
      const s = localStorage.getItem(pageStorageKey);
      if (s === 'all') return 'all';
      const n = parseInt(s || '25');
      return [10, 25, 50, 100, 250].includes(n) ? n : 25;
    } catch { return 25; }
  });
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try { const s = localStorage.getItem(storageKey); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [seditIdColumn, setSeditIdColumn] = useState<string | null>(null);
  const [seditUrlPage, setSeditUrlPage] = useState('FicheCommande.html');
  const [seditUrlParam, setSeditUrlParam] = useState('commandeId');
  const [linkIdColumn, setLinkIdColumn] = useState<string | null>(null);
  const [urlSedit, setUrlSedit] = useState('https://seditgfprod.ivry.local/SeditGfSMProd');
  const [operations, setOperations] = useState<Operation[]>([]);
  const [assignModal, setAssignModal] = useState<{ linkId: string; currentOpId: number | null; currentOpLabel: string | null } | null>(null);
  const [opSearch, setOpSearch] = useState('');
  const [opFilter, setOpFilter] = useState<'I' | 'F' | null>(null);
  // Association commande → logiciel métier (magapp.apps)
  const [apps, setApps] = useState<any[]>([]);
  const [appModal, setAppModal] = useState<{ linkId: string; currentAppId: number | null; currentAppLabel: string | null } | null>(null);
  const [appSearch, setAppSearch] = useState('');
  const [childRubriqueId, setChildRubriqueId] = useState<number | null>(null);
  const [childLinkColumn, setChildLinkColumn] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [childrenData, setChildrenData] = useState<Record<string, { columns: MappingColumn[]; rows: any[] }>>({});
  const [loadingChildren, setLoadingChildren] = useState<Record<string, boolean>>({});
  const [childVisibleCols, setChildVisibleCols] = useState<string[]>([]);
  const [pendingFilter, setPendingFilter] = useState(false);
  const [sfModalRow, setSfModalRow] = useState<{ row: any; mode: 'circuit' | 'self' } | null>(null);
  const [sfStatuses, setSfStatuses] = useState<Record<string, any>>({});
  const [commandeStatuses, setCommandeStatuses] = useState<Record<string, any>>({});
  const [sfProcessModal, setSfProcessModal] = useState<{ workflowId: number } | null>(null);
  const [seditDocsViewer, setSeditDocsViewer] = useState<{ numero?: string; numeros?: string[]; baseUrl?: string; title?: string } | null>(null);
  const [mandateNumero, setMandateNumero] = useState<string | null>(null);

  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(visibleCols)); }, [visibleCols, storageKey]);

  useEffect(() => {
    if (visibleColumns) {
      setVisibleCols(visibleColumns);
    }
  }, [visibleColumns]);

  const effectivePageSize = itemsPerPage === 'all' ? 10000 : itemsPerPage;
  const factureColumnName = columns.find(c => c.expression === 'FACTURE_FACTURE')?.name || null;
  // Colonne « Nb lignes » (commandes) : sert à ne proposer le déroulé que s'il y a
  // réellement plusieurs lignes (sinon le bouton n'apporte rien).
  const nbLignesColumnName = (columns.find(c => c.expression === 'COMMANDE_NB_LIGNES_COMMANDE')
    || columns.find(c => /^nb\s*lignes$/i.test(c.name)))?.name || null;

  // Plusieurs effets ci-dessous appellent tous fetchData() au montage (token/rubrique,
  // fiscalYear, page/pageSize, filtres...), en parallèle de la requête triée déclenchée
  // par le tri par défaut une fois les colonnes connues. Sans garde, la réponse d'une
  // requête non triée dispatchée avant peut arriver après la triée et écraser l'état.
  // fetchSeqRef permet de n'appliquer que la réponse de la DERNIÈRE requête émise.
  const fetchSeqRef = useRef(0);

  const fetchData = async (search?: string, offset?: number, sort?: { key: string; direction: 'asc' | 'desc' } | null) => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const params: any = { limit: effectivePageSize, offset: offset || 0 };
      if (search) params.search = search;
      if (fiscalYear) params.fiscal_year = String(fiscalYear);
      if (pendingFilter && rubriqueName === 'Factures') params.pending_filter = '1';
      if (sectionFilter && sectionFilter !== 'all') params.section_filter = sectionFilter;
      const s = sort !== undefined ? sort : sortConfig;
      if (s) {
        params.sort_by = s.key;
        params.sort_dir = s.direction;
      }
      const endpoint = dataSource === 'sedit'
        ? '/api/finance/field-mapping/resolve-sedit/'
        : '/api/finance/field-mapping/resolve/';
      const res = await axios.get(`${endpoint}${encodeURIComponent(rubriqueName)}`, {
        headers,
        params
      });
      if (seq !== fetchSeqRef.current) return; // réponse obsolète, une requête plus récente a déjà été émise
      setColumns(res.data.columns || []);
      setRows(res.data.rows || []);
      setTotal(res.data.total || 0);
      setSeditIdColumn(res.data.sedit_id_column || null);
      setSeditUrlPage(res.data.sedit_url_page || 'FicheCommande.html');
      setSeditUrlParam(res.data.sedit_url_param || 'commandeId');
      setLinkIdColumn(res.data.link_id_column || null);
      setChildRubriqueId(res.data.child_rubrique_id || null);
      setChildLinkColumn(res.data.child_link_column || null);
      setExpandedRows(new Set());
      setChildrenData({});
      setChildVisibleCols([]);
      if (visibleCols.length === 0 && res.data.columns) {
        setVisibleCols(res.data.columns.map((c: MappingColumn) => c.name));
      }
    } catch (err: any) {
      if (seq !== fetchSeqRef.current) return;
      setError(err?.response?.data?.message || 'Erreur de chargement');
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  };

  const onColumnsReadyRef = useRef(onColumnsReady);
  onColumnsReadyRef.current = onColumnsReady;

  useEffect(() => { fetchData(); }, [token, rubriqueName, fiscalYear]);

  useEffect(() => {
    if (columns.length > 0 && onColumnsReadyRef.current) {
      onColumnsReadyRef.current(columns.map(c => c.name));
    }
  }, [columns]);

  const isFirstSearchRun = useRef(true);
  useEffect(() => {
    // Le montage initial est déjà couvert par l'effet [token, rubriqueName, fiscalYear] ci-dessus ;
    // sans ce garde, ce timer se déclenchait aussi au montage avec un fetchData figé sur le
    // sortConfig de l'époque (null), et écrasait ~400ms plus tard le tri par défaut appliqué entre-temps.
    if (isFirstSearchRun.current) { isFirstSearchRun.current = false; return; }
    const timer = setTimeout(() => { setCurrentPage(0); fetchData(searchTerm, 0); }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => { setCurrentPage(0); fetchData(searchTerm, 0); }, [fiscalYear]);
  useEffect(() => { fetchData(searchTerm, currentPage * effectivePageSize); }, [currentPage, effectivePageSize]);
  useEffect(() => {
    if (sortConfig) fetchData(searchTerm, currentPage * effectivePageSize, sortConfig);
  }, [sortConfig?.key, sortConfig?.direction, effectivePageSize]);

  // Tri par défaut de la page Factures : date décroissante, tant que l'utilisateur
  // n'a pas lui-même choisi un tri (ne s'applique qu'une fois par montage).
  useEffect(() => {
    if (rubriqueName !== 'Factures' || defaultSortApplied) return;
    if (sortConfig) { setDefaultSortApplied(true); return; }
    if (columns.length === 0) return;
    const dateCol = columns.find(c => c.expression === 'FACTURE_DATENTREE')
      || columns.find(c => ['date', 'timestamp', 'text_date', 'text_timestamp'].includes(c.display_type));
    if (dateCol) setSortConfig({ key: dateCol.name, direction: 'desc' });
    setDefaultSortApplied(true);
  }, [rubriqueName, columns, sortConfig, defaultSortApplied]);

  useEffect(() => {
    setCurrentPage(0);
    fetchData(searchTerm, 0);
  }, [pendingFilter, sectionFilter]);

  useEffect(() => {
    if (rubriqueName !== 'Factures') return;
    if (rows.length === 0) { setSfStatuses({}); return; }
    const factureCol = columns.find(c => c.expression === 'FACTURE_FACTURE');
    const refs = rows
      .map(r => String(r[factureCol?.name || ''] ?? '').trim())
      .filter(Boolean);
    if (refs.length === 0) return;
    const uniq = Array.from(new Set(refs));
    axios.post('/api/finance/service-fait/statuses', { invoice_refs: uniq }, { headers })
      .then(res => { if (res.data) setSfStatuses(res.data); })
      .catch(() => {});
  }, [rows, columns, rubriqueName]);

  // État de la facture de chaque commande (pastille FAC) — reçue / service fait /
  // mandatée / refusée, calculé côté serveur depuis Sedit.
  useEffect(() => {
    if (rubriqueName !== 'Commandes') return;
    if (rows.length === 0) { setCommandeStatuses({}); return; }
    const col = columns.find(c => c.expression === seditIdColumn);
    const ids = rows.map(r => (col ? String(r[col.name] ?? '').trim() : '')).filter(Boolean);
    if (ids.length === 0) return;
    const uniq = Array.from(new Set(ids));
    axios.post('/api/finance/service-fait/commande-statuses', { commande_ids: uniq }, { headers })
      .then(res => { if (res.data) setCommandeStatuses(res.data); })
      .catch(() => {});
  }, [rows, columns, rubriqueName, seditIdColumn]);

  useEffect(() => {
    axios.get('/api/budget/operations', { headers }).then(res => setOperations(res.data || [])).catch(() => {});
    axios.get('/api/magapp/apps', { headers }).then(res => setApps(Array.isArray(res.data) ? res.data : [])).catch(() => {});
    axios.get('/api/settings', { headers }).then(res => {
      const settings = res.data || [];
      const s = settings.find((s: any) => s.setting_key === 'url_sedit_fi');
      if (s) setUrlSedit(s.setting_value);
    }).catch(() => {});
  }, []);

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev && prev.key === key) {
        return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
      }
      return { key, direction: 'asc' };
    });
  };

  const fetchChildren = async (seditId: string) => {
    if (childrenData[seditId]) return;
    setLoadingChildren(prev => ({ ...prev, [seditId]: true }));
    try {
      const res = await axios.get(`/api/finance/field-mapping/resolve/${encodeURIComponent(rubriqueName)}/children/${encodeURIComponent(seditId)}`, { headers });
      setChildrenData(prev => ({ ...prev, [seditId]: { columns: res.data.columns || [], rows: res.data.rows || [] } }));
    } catch (err) {
      console.error('[MappedDataTable] fetchChildren error:', err);
    } finally {
      setLoadingChildren(prev => ({ ...prev, [seditId]: false }));
    }
  };

  const toggleExpand = (rowIndex: number, seditId: string) => {
    if (expandedRows.has(rowIndex)) {
      setExpandedRows(prev => { const next = new Set(prev); next.delete(rowIndex); return next; });
    } else {
      setExpandedRows(prev => { const next = new Set(prev); next.add(rowIndex); return next; });
      if (seditId) fetchChildren(seditId);
    }
  };

  const formatCell = (value: any, col: MappingColumn) => {
    if (col.name === 'Section') {
      const isF = value === 'F' || value === 'Fonctionnement';
      const isI = value === 'I' || value === 'Investissement';
      if (isF || isI) {
        return (
          <span className={`section-badge ${isF ? 'f' : 'i'}`}>
            {isF ? 'F' : 'I'}
          </span>
        );
      }
      return '';
    }
    // Nature / fonction M57 d'une commande : agrégées côté Sedit sur les lignes
    // d'imputation. Une seule valeur = commune à toutes les lignes (on l'affiche) ;
    // plusieurs = commande multiligne hétérogène (on affiche « Multi » + infobulle).
    if (col.expression === 'nature' || col.expression === 'fonction') {
      const codes = Array.from(new Set(String(value ?? '').split(',').map(s => s.trim()).filter(Boolean)));
      if (codes.length === 0) return '';
      if (codes.length === 1) return codes[0];
      return (
        <span title={codes.join(', ')} style={{ cursor: 'help', fontWeight: 600, color: '#b45309' }}>
          Multi
        </span>
      );
    }
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (col.display_type === 'currency') {
      const num = parseFloat(str);
      if (isNaN(num)) return str;
      return num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20AC';
    }
    if (col.display_type === 'number' || col.display_type === 'integer') {
      const num = parseFloat(str);
      if (isNaN(num)) return str;
      return num.toLocaleString('fr-FR');
    }
    return str;
  };

  const handleAssignOperation = async (operationId: number | null) => {
    if (!assignModal) return;
    try {
      await axios.post('/api/finance/field-mapping/assign-operation', {
        rubrique_name: rubriqueName,
        link_id: assignModal.linkId,
        operation_id: operationId
      }, { headers });
      setAssignModal(null);
      fetchData(searchTerm, currentPage * pageSize);
    } catch (err) {
      alert("Erreur lors de l'affectation");
    }
  };

  const handleAssignApp = async (appId: number | null, linkIdOverride?: string) => {
    const linkId = linkIdOverride ?? appModal?.linkId;
    if (!linkId) return;
    try {
      await axios.post('/api/finance/field-mapping/assign-app', {
        rubrique_name: rubriqueName,
        link_id: linkId,
        app_id: appId
      }, { headers });
      setAppModal(null);
      setAppSearch('');
      fetchData(searchTerm, currentPage * pageSize);
    } catch (err) {
      alert("Erreur lors de l'association du logiciel");
    }
  };

  const showActions = !!seditIdColumn;
  const showSfColumn = showActions && rubriqueName === 'Factures';
  // Colonne « Facture » sur la liste des commandes : pastille FAC (état de la facture).
  const showFactureCol = showActions && rubriqueName === 'Commandes';
  const actionColsCount = (showSfColumn ? 1 : 0) + (showFactureCol ? 1 : 0) + (showActions ? 1 : 0);

  if (loading && rows.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Chargement...</div>;
  }
  if (error && rows.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>{error}</div>;
  }
  if (columns.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
      Aucune configuration de mapping trouvée pour "{rubriqueName}".
      <br />Configurez le mapping dans <a href="/admin/finance" style={{ color: '#3b82f6' }}>Finances &gt; Mapping de Champs</a>.
    </div>;
  }

  const activeCols = columns.filter(c => visibleCols.includes(c.name) || c.name === 'Section'
    || (rubriqueName === 'Commandes' && (c.expression === 'nature' || c.expression === 'fonction')));

  // "À traiter" est filtré côté serveur (SF non fait dans Sedit et non rejetée) pour
  // porter sur l'ensemble des factures, pas seulement la page courante.
  const displayRows = (() => {
    let filtered = rows;

    // Apply section filter
    if (sectionFilter && sectionFilter !== 'all') {
      filtered = filtered.filter(r => {
        const s = r.Section || '';
        return (sectionFilter === 'F' && (s === 'F' || s === 'Fonctionnement')) ||
               (sectionFilter === 'I' && (s === 'I' || s === 'Investissement'));
      });
    }

    return filtered;
  })();

  // Use 'total' from backend which is the filtered result count
  const displayTotal = total;
  const totalPages = itemsPerPage === 'all' ? 1 : Math.ceil(displayTotal / effectivePageSize);

  const handleItemsPerPageChange = (newSize: number | 'all') => {
    setItemsPerPage(newSize);
    localStorage.setItem(pageStorageKey, String(newSize));
    setCurrentPage(0);
  };

  return (
    <div className="mdt-container">
      <div className="mdt-toolbar">
        <div className="mdt-search">
          <Search size={16} />
          <input type="text" placeholder="Rechercher..." value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(0); }} className="mdt-search-input" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {rubriqueName === 'Factures' && (
            <button className="mdt-col-btn" style={pendingFilter ? { background: '#fbbf24', color: '#78350f', borderColor: '#fbbf24' } : {}}
              onClick={() => setPendingFilter(!pendingFilter)}>
              📋 À traiter {pendingFilter && `(${total})`}
            </button>
          )}
          <span className="mdt-count">{total} résultat{total > 1 ? 's' : ''}</span>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', borderLeft: '1px solid #e2e8f0', paddingLeft: '8px' }}>
            <span style={{ fontSize: '13px', color: '#64748b', whiteSpace: 'nowrap' }}>Lignes:</span>
            {[10, 25, 50, 100, 250].map(size => (
              <button
                key={size}
                onClick={() => handleItemsPerPageChange(size)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: itemsPerPage === size ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                  background: itemsPerPage === size ? '#eff6ff' : 'white',
                  color: itemsPerPage === size ? '#1e40af' : '#64748b',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: itemsPerPage === size ? '600' : '400'
                }}
              >
                {size}
              </button>
            ))}
            <button
              onClick={() => handleItemsPerPageChange('all')}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: itemsPerPage === 'all' ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                background: itemsPerPage === 'all' ? '#eff6ff' : 'white',
                color: itemsPerPage === 'all' ? '#1e40af' : '#64748b',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: itemsPerPage === 'all' ? '600' : '400'
              }}
            >
              Toutes
            </button>
          </div>
          {onOpenColumnSettings && (
            <button className="mdt-col-btn" onClick={onOpenColumnSettings} title="Configurer les colonnes">
              <Columns size={16} /> Colonnes
            </button>
          )}
        </div>
      </div>

      <div className="mdt-table-wrap">
        <table className="mdt-table">
          <thead>
            <tr>
              {childRubriqueId && <th className="mdt-th" style={{ width: '32px', minWidth: '32px', padding: '10px 4px' }}></th>}
              {activeCols.map(col => {
                const cs = columnStyles?.[col.name];
                const thStyle: React.CSSProperties = {};
                if (cs?.bold) thStyle.fontWeight = 'bold';
                if (cs?.color && cs.color !== '#000000') thStyle.color = cs.color;
                return (
                <th key={col.name} onClick={() => handleSort(col.name)} className="mdt-th" style={thStyle}>
                  <div className="mdt-th-inner">
                    <span>{col.name}</span>
                    {sortConfig?.key === col.name && (
                      sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                    )}
                  </div>
                </th>
                );
              })}
              {showSfColumn && <th className="mdt-th" style={{ minWidth: '160px' }}>Service Fait</th>}
              {showFactureCol && <th className="mdt-th" style={{ minWidth: '70px' }}>Facture</th>}
              {showActions && <th className="mdt-th" style={{ minWidth: '120px' }}>Sedit</th>}
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr><td colSpan={(childRubriqueId ? 1 : 0) + activeCols.length + actionColsCount} className="mdt-empty">Aucun résultat</td></tr>
            ) : displayRows.map((row, i) => {
              const seditCol = seditIdColumn ? columns.find(c => c.expression === seditIdColumn) : null;
              const seditId = seditCol ? String(row[seditCol.name] || '').trim() : null;
              const childLinkCol = childLinkColumn ? columns.find(c => c.expression === childLinkColumn) : null;
              const childLinkValue = childLinkCol ? String(row[childLinkCol.name] || '').trim() : null;
              const linkCol = linkIdColumn ? columns.find(c => c.expression === linkIdColumn) : null;
              const linkId = linkCol ? row[linkCol.name] : null;
              const isExpanded = expandedRows.has(i);
              const childKey = childLinkValue || seditId || String(i);
              const child = childrenData[childKey];
              const isLoadingChild = loadingChildren[childKey];
              const nbLignes = nbLignesColumnName
                ? parseInt(String(row[nbLignesColumnName] ?? '').replace(/[^\d-]/g, ''), 10)
                : NaN;
              const expandable = !!(childRubriqueId && childLinkValue) && (isNaN(nbLignes) || nbLignes > 1);
              const factureCol = rubriqueName === 'Factures' ? columns.find(c => c.expression === 'FACTURE_FACTURE') : null;
              const factureRef = factureCol ? String(row[factureCol.name] || '').trim() : null;
              const commandeCol = rubriqueName === 'Commandes' ? columns.find(c => c.expression === 'COMMANDE_COMMANDE') : null;
              const commandeNum = commandeCol ? String(row[commandeCol.name] || '').trim() : null;
              let sfInfo: { label: string; color: string; bg: string; workflowId: number | null; tooltip: string; ongoing: boolean; relaunchable: boolean } | null = null;
              const st = rubriqueName === 'Factures' ? (sfStatuses[factureRef || ''] || null) : null;
              if (st && st.status) {
                const decisionDate = st.decision_at || st.updated_at;
                const formattedDecisionDate = decisionDate ? new Date(decisionDate).toLocaleDateString('fr-FR') : '';
                const map: Record<string, { label: string; color: string; bg: string }> = {
                  'en_attente': { label: '⏳ En attente', color: '#92400e', bg: '#fef3c7' },
                  'en_cours': { label: '🔵 En cours', color: '#1e40af', bg: '#dbeafe' },
                  'en_pause': { label: '⏸️ En pause', color: '#9a3412', bg: '#ffedd5' },
                  'valide': { label: formattedDecisionDate ? `✅ SF le ${formattedDecisionDate}` : '✅ Validé', color: '#166534', bg: '#dcfce7' },
                  'valide_avec_reserves': { label: '⚠️ Avec réserves', color: '#92400e', bg: '#fef3c7' },
                  'non_valide': { label: '❌ Non validé', color: '#991b1b', bg: '#fee2e2' },
                  'ne_me_concerne_pas': { label: '🔄 Retourné', color: '#1e40af', bg: '#dbeafe' },
                  'transfere': { label: '➡️ Transféré', color: '#6b21a8', bg: '#f3e8ff' },
                  'en_attente_visa': { label: '🖋️ Visa directeur', color: '#6b21a8', bg: '#f3e8ff' },
                  'annule': { label: '🚫 Annulé', color: '#64748b', bg: '#f1f5f9' },
                  'telecom': { label: '📡 Telecom', color: '#0369a1', bg: '#e0f2fe' },
                };
                const meta = map[st.status] || { label: st.status, color: '#334155', bg: '#f1f5f9' };
                const ongoing = ['en_attente', 'en_cours', 'transfere', 'en_pause', 'en_attente_visa'].includes(st.status);
                // Statuts pour lesquels une nouvelle demande peut être relancée sur la même
                // facture (doit rester synchro avec l'exclusion côté backend, createWorkflow).
                const relaunchable = ['non_valide', 'ne_me_concerne_pas', 'annule'].includes(st.status);
                const tooltip = st.status === 'telecom'
                  ? 'Facture déjà intégrée au module Telecom — pas de service fait à valider ici'
                  : `${st.status}\nVérificateur: ${st.verifier_name || '-'}`;
                sfInfo = { ...meta, workflowId: st.workflowId || null, tooltip, ongoing, relaunchable };
              }
              return (
                <React.Fragment key={i}>
                  <tr className={`mdt-row${isExpanded ? ' mdt-row-expanded' : ''}`}>
                    {childRubriqueId && (
                      <td className="mdt-cell mdt-expand-cell">
                        {expandable && (
                          <button className="mdt-expand-btn" onClick={() => { toggleExpand(i, childKey); }} title="Afficher les lignes">
                            {isLoadingChild ? (
                              <span className="mdt-spinner"></span>
                            ) : isExpanded ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronRight size={14} />
                            )}
                          </button>
                        )}
                      </td>
                    )}
                    {activeCols.map(col => {
                      const cs = columnStyles?.[col.name];
                      const tdStyle: React.CSSProperties = {};
                      if (cs?.bold) tdStyle.fontWeight = 'bold';
                      if (cs?.color && cs.color !== '#000000') tdStyle.color = cs.color;
                      const cellTitle = row[col.name] != null && row[col.name] !== '' ? String(row[col.name]) : undefined;
                      return <td key={col.name} className="mdt-cell" style={tdStyle} title={cellTitle}>{formatCell(row[col.name], col)}</td>;
                    })}
                    {showSfColumn && (
                      <td className="mdt-cell" style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          {st?.sedit_rejete ? (
                            /* Facture refusée dans Sedit : badge rouge de refus (prioritaire). */
                            <span title={`Facture rejetée dans Sedit${st.sedit_rejete_date ? ' le ' + new Date(st.sedit_rejete_date).toLocaleDateString('fr-FR') : ''}`}
                              style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '999px', padding: '2px 7px', fontSize: '10px', fontWeight: 700, lineHeight: '14px' }}>
                              REFUSÉ
                            </span>
                          ) : (
                            <>
                              {/* RA uniquement si le service fait n'est pas encore fait. */}
                              {st?.sedit_rapproche && !st?.sedit_service_fait && (
                                <span title="Facture rapprochée (engagement/bon de commande) dans Sedit"
                                  style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '999px', padding: '2px 7px', fontSize: '10px', fontWeight: 700, lineHeight: '14px' }}>
                                  RA
                                </span>
                              )}
                              {/* Pastille SF : service fait attesté directement dans Sedit (date de SF en infobulle). */}
                              {st?.sedit_service_fait && (
                                <span title={`Service fait validé dans Sedit${st.sedit_service_fait_date ? ' le ' + new Date(st.sedit_service_fait_date).toLocaleDateString('fr-FR') : ''}`}
                                  style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', borderRadius: '999px', padding: '2px 7px', fontSize: '10px', fontWeight: 700, lineHeight: '14px' }}>
                                  SF
                                </span>
                              )}
                              {/* Page beta : facture mandatée → badge cliquable (infos mandatement). */}
                              {dataSource === 'sedit' && st?.sedit_mandate && (
                                <button type="button" title="Voir le mandatement (Sedit)"
                                  onClick={(e) => { e.stopPropagation(); const ref = factureColumnName ? String(row[factureColumnName] ?? '').trim() : ''; if (ref) setMandateNumero(ref); }}
                                  style={{ background: '#ccfbf1', color: '#0f766e', border: '1px solid #99f6e4', borderRadius: '999px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, lineHeight: '14px', cursor: 'pointer' }}>
                                  MANDATÉ
                                </button>
                              )}
                              {/* Workflow AppDSI : masqué dès que Sedit atteste le service fait
                                  (c'est alors la pastille SF compacte qui fait foi). */}
                              {sfInfo && !st?.sedit_service_fait && (
                                <>
                                  {/* En cours : un seul bouton (statut) qui ouvre le processus. */}
                                  {sfInfo.ongoing ? (
                                    sfInfo.workflowId ? (
                                      <button title="Voir le processus de validation" onClick={() => setSfProcessModal({ workflowId: sfInfo!.workflowId! })}
                                        style={{ background: sfInfo.bg, color: sfInfo.color, border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                        <Eye size={12} /> {sfInfo.label}
                                      </button>
                                    ) : (
                                      <span title={sfInfo.tooltip} style={{ background: sfInfo.bg, color: sfInfo.color, border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                        {sfInfo.label}
                                      </span>
                                    )
                                  ) : (
                                    <>
                                      {sfInfo.workflowId ? (
                                        <button title="Voir le processus de validation" onClick={() => setSfProcessModal({ workflowId: sfInfo!.workflowId! })}
                                          style={{ background: sfInfo.bg, color: sfInfo.color, border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                          {sfInfo.label}
                                        </button>
                                      ) : (
                                        <span title={sfInfo.tooltip} style={{ background: sfInfo.bg, color: sfInfo.color, border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                          {sfInfo.label}
                                        </span>
                                      )}
                                      {sfInfo.relaunchable && !st?.sedit_service_fait && (
                                        <button title="Relancer une nouvelle demande de validation"
                                          onClick={() => setSfModalRow({ row, mode: 'circuit' })}
                                          style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                          <Rocket size={12} /> Relancer
                                        </button>
                                      )}
                                    </>
                                  )}
                                </>
                              )}
                              {/* Boutons d'action : seulement si ni SF Sedit ni workflow AppDSI
                                  (sinon la pastille SF compacte suffit, plus de texte « Déjà fait »). */}
                              {!sfInfo && !st?.sedit_service_fait && (
                                <>
                                  <button title="Lancer la validation du service fait (avec un vérificateur)"
                                    onClick={() => setSfModalRow({ row, mode: 'circuit' })}
                                    style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <Rocket size={12} /> Lancer
                                  </button>
                                  <button title="Déclarer moi-même le service fait (sans circuit de validation)"
                                    onClick={() => setSfModalRow({ row, mode: 'self' })}
                                    style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <CheckCircle size={12} /> Faire
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    )}
                    {showFactureCol && (
                      <td className="mdt-cell" style={{ whiteSpace: 'nowrap' }}>
                        {(() => {
                          const fs = seditId ? commandeStatuses[seditId] : null;
                          if (!fs) return null;
                          const MAP: Record<string, { label: string; color: string; bg: string }> = {
                            recue: { label: 'Reçue', color: '#475569', bg: '#f1f5f9' },
                            service_fait: { label: 'Service fait', color: '#1e40af', bg: '#dbeafe' },
                            mandatee: { label: 'Mandatée', color: '#166534', bg: '#dcfce7' },
                            refusee: { label: 'Refusée', color: '#b91c1c', bg: '#fee2e2' },
                          };
                          const meta = MAP[fs.state] || MAP.recue;
                          const n = fs.count || 1;
                          const factures: string[] = Array.isArray(fs.factures) ? fs.factures : [];
                          const clickable = factures.length > 0;
                          return (
                            <button type="button" disabled={!clickable}
                              onClick={clickable ? (e) => {
                                e.stopPropagation();
                                setSeditDocsViewer({
                                  numeros: factures,
                                  title: `Facture${n > 1 ? 's' : ''} Sedit — Commande ${commandeNum || seditId || ''}`.trim(),
                                });
                              } : undefined}
                              title={clickable
                                ? `${n} facture${n > 1 ? 's' : ''} — ${meta.label} (cliquer pour afficher)`
                                : `${n} facture${n > 1 ? 's' : ''} — ${meta.label}`}
                              style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}33`, borderRadius: '999px', padding: '2px 7px', fontSize: '10px', fontWeight: 700, lineHeight: '14px', cursor: clickable ? 'pointer' : 'default' }}>
                              FAC
                            </button>
                          );
                        })()}
                      </td>
                    )}
                    {showActions && (
                      <td className="mdt-cell" style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            {seditId && (
                              <button title="Ouvrir dans Sedit"
                                onClick={() => window.open(`${urlSedit}/${seditUrlPage}?${seditUrlParam}=${seditId}`, '_blank')}
                                style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <ExternalLink size={12} /> Sedit
                              </button>
                            )}
                            {rubriqueName === 'Factures' && factureRef && (
                              <button title="Voir les pièces jointes Sedit (PDF/XML de la facture)"
                                onClick={() => setSeditDocsViewer({ numero: factureRef })}
                                style={{ background: '#7c3aed', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Files size={12} /> Pièces jointes
                              </button>
                            )}
                            {rubriqueName === 'Commandes' && seditId && (
                              <button title="Voir le bon de commande (Sedit)"
                                onClick={() => setSeditDocsViewer({
                                  numero: seditId,
                                  baseUrl: `/api/finance/pj-share/commande/${encodeURIComponent(seditId)}`,
                                  title: `Bon de commande Sedit${commandeNum ? ' — Commande ' + commandeNum : ''}`,
                                })}
                                style={{ background: '#7c3aed', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Files size={12} /> PJ
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            {linkId && row._operation_id ? (
                              <span title={row._operation_label || ''} style={{ fontSize: '11px', color: '#059669', fontWeight: 500, cursor: 'pointer', borderBottom: '1px dashed #059669' }}
                                onClick={() => setAssignModal({ linkId: String(linkId), currentOpId: row._operation_id, currentOpLabel: row._operation_label })}>
                                {(row._operation_label || '').length > 28 ? (row._operation_label || '').substring(0, 26) + '...' : row._operation_label}
                              </span>
                            ) : linkId ? (
                              <button title="Associer à une opération"
                                onClick={() => setAssignModal({ linkId: String(linkId), currentOpId: null, currentOpLabel: null })}
                                style={{ background: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Link2 size={12} /> Associer
                              </button>
                            ) : null}
                            {linkId && row._app_id ? (
                              <span title={row._app_label || ''} style={{ fontSize: '11px', color: '#2563eb', fontWeight: 500, cursor: 'pointer', borderBottom: '1px dashed #2563eb', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                onClick={() => setAppModal({ linkId: String(linkId), currentAppId: row._app_id, currentAppLabel: row._app_label })}>
                                <AppWindow size={12} />{(row._app_label || '').length > 22 ? (row._app_label || '').substring(0, 20) + '...' : row._app_label}
                              </span>
                            ) : linkId ? (
                              <button title="Associer à un logiciel métier"
                                onClick={() => setAppModal({ linkId: String(linkId), currentAppId: null, currentAppLabel: null })}
                                style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <AppWindow size={12} /> APP
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    )}
                  </tr>
                  {isExpanded && child && child.rows.length > 0 && (
                    <tr className="mdt-child-row">
                      <td colSpan={(childRubriqueId ? 1 : 0) + activeCols.length + actionColsCount} style={{ padding: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 8px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                          <div style={{ position: 'relative' }}>
                            <button className="mdt-col-btn" style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                              onClick={() => { const sel = document.getElementById(`child-cols-${childKey}`); if (sel) sel.style.display = sel.style.display === 'none' ? 'block' : 'none'; }}>
                              <Columns size={12} /> Colonnes lignes
                            </button>
                            <div id={`child-cols-${childKey}`} className="mdt-col-dropdown" style={{ display: 'none', right: 0, left: 'auto', minWidth: '150px' }}>
                              {child.columns.map((cc: MappingColumn) => {
                                const cvis = childVisibleCols.length > 0 ? childVisibleCols : child.columns.map((c: MappingColumn) => c.name);
                                return (
                                  <label key={cc.name} className="mdt-col-item">
                                    <input type="checkbox" checked={cvis.includes(cc.name)}
                                      onChange={e => {
                                        const cur = childVisibleCols.length > 0 ? childVisibleCols : child.columns.map((c: MappingColumn) => c.name);
                                        const next = e.target.checked ? [...cur, cc.name] : cur.filter(n => n !== cc.name);
                                        setChildVisibleCols(next);
                                      }} />
                                    <span>{cc.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        <table className="mdt-child-table">
                          <thead>
                            <tr>
                              {(childVisibleCols.length > 0 ? childVisibleCols : child.columns.map((c: MappingColumn) => c.name)).map((cn: string) => {
                                const cc = child.columns.find((c: MappingColumn) => c.name === cn);
                                return cc ? <th key={cc.name} className="mdt-child-th">{cc.name}</th> : null;
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {child.rows.map((cr: any, ci: number) => (
                              <tr key={ci} className="mdt-child-row-item">
                                                                {(childVisibleCols.length > 0 ? childVisibleCols : child.columns.map((c: MappingColumn) => c.name)).map((cn: string) => {
                                  const cc = child.columns.find((c: MappingColumn) => c.name === cn);
                                  return cc ? <td key={cc.name} className="mdt-child-cell" title={cr[cc.name] != null && cr[cc.name] !== '' ? String(cr[cc.name]) : undefined}>{formatCell(cr[cc.name], cc)}</td> : null;
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                  {isExpanded && isLoadingChild && (
                    <tr className="mdt-child-row">
                      <td colSpan={(childRubriqueId ? 1 : 0) + activeCols.length + actionColsCount} className="mdt-cell" style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '0.8rem' }}>
                        Chargement...
                      </td>
                    </tr>
                  )}
                  {isExpanded && child && child.rows.length === 0 && (
                    <tr className="mdt-child-row">
                      <td colSpan={(childRubriqueId ? 1 : 0) + activeCols.length + actionColsCount} className="mdt-cell" style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '0.8rem' }}>
                        Aucune ligne
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mdt-pagination">
          <button className="mdt-page-btn" disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}>Précédent</button>
          <span className="mdt-page-info">Page {currentPage + 1} / {totalPages}</span>
          <button className="mdt-page-btn" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)}>Suivant</button>
        </div>
      )}

      {assignModal && (
        <div className="mdt-modal-overlay" onClick={() => { setAssignModal(null); setOpSearch(''); setOpFilter(null); }}>
          <div className="mdt-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Associer à une opération</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px' }}>
              Commande n° <strong>{assignModal.linkId}</strong>
              {assignModal.currentOpId && <span style={{ marginLeft: '8px' }}>(opération actuelle : {assignModal.currentOpLabel || assignModal.currentOpId})</span>}
            </p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input type="text" placeholder="Rechercher une opération..." value={opSearch}
                onChange={e => setOpSearch(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', outline: 'none' }} />
              <button onClick={() => setOpFilter(opFilter === 'I' ? null : 'I')}
                style={{ padding: '6px 14px', borderRadius: '6px', border: opFilter === 'I' ? '2px solid #3b82f6' : '1px solid #e2e8f0', background: opFilter === 'I' ? '#eff6ff' : 'white', fontWeight: 600, fontSize: '13px', cursor: 'pointer', color: '#1e40af' }}>
                I
              </button>
              <button onClick={() => setOpFilter(opFilter === 'F' ? null : 'F')}
                style={{ padding: '6px 14px', borderRadius: '6px', border: opFilter === 'F' ? '2px solid #10b981' : '1px solid #e2e8f0', background: opFilter === 'F' ? '#ecfdf5' : 'white', fontWeight: 600, fontSize: '13px', cursor: 'pointer', color: '#065f46' }}>
                F
              </button>
            </div>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <div onClick={() => { handleAssignOperation(null); setOpSearch(''); setOpFilter(null); }}
                style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: '6px', background: '#fef2f2', border: '1px solid #fecaca', marginBottom: '4px', fontSize: '13px' }}>
                <strong style={{ color: '#ef4444' }}>Dissocier</strong> — Aucune opération
              </div>
              {operations
                .filter(op => !opFilter || op.Section === opFilter)
                .filter(op => !opSearch || (op.LIBELLE || '').toLowerCase().includes(opSearch.toLowerCase()) || (op.Service || '').toLowerCase().includes(opSearch.toLowerCase()))
                .sort((a,b)=>((a.LIBELLE||'')).localeCompare(b.LIBELLE||''))
                .map(op => (
                <div key={op.id} onClick={() => { handleAssignOperation(op.id); setOpSearch(''); setOpFilter(null); }}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: '6px', background: assignModal.currentOpId === op.id ? '#eff6ff' : 'transparent', border: '1px solid #e5e7eb', marginBottom: '4px', fontSize: '13px' }}>
                  <div style={{ fontWeight: 600 }}>{op.LIBELLE || `Opération #${op.id}`}</div>
                  {op.Service && <div style={{ color: '#64748b', fontSize: '11px' }}>{op.Service}</div>}
                </div>
              ))}
            </div>
            <div style={{ marginTop: '16px', textAlign: 'right' }}>
              <button className="mdt-page-btn" onClick={() => { setAssignModal(null); setOpSearch(''); setOpFilter(null); }}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {appModal && (
        <div className="mdt-modal-overlay" onClick={() => { setAppModal(null); setAppSearch(''); }}>
          <div className="mdt-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Associer à un logiciel métier</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px' }}>
              Commande n° <strong>{appModal.linkId}</strong>
              {appModal.currentAppId && <span style={{ marginLeft: '8px' }}>(logiciel actuel : {appModal.currentAppLabel || appModal.currentAppId})</span>}
            </p>
            <div style={{ marginBottom: '12px' }}>
              <input type="text" placeholder="Rechercher un logiciel..." value={appSearch}
                onChange={e => setAppSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <div onClick={() => handleAssignApp(null)}
                style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: '6px', background: '#fef2f2', border: '1px solid #fecaca', marginBottom: '4px', fontSize: '13px' }}>
                <strong style={{ color: '#ef4444' }}>Dissocier</strong> — Aucun logiciel
              </div>
              {apps
                .filter(a => !appSearch || (a.name || '').toLowerCase().includes(appSearch.toLowerCase()) || (a.category_name || '').toLowerCase().includes(appSearch.toLowerCase()))
                .sort((a, b) => ((a.name || '')).localeCompare(b.name || ''))
                .map(a => (
                <div key={a.id} onClick={() => handleAssignApp(a.id)}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: '6px', background: appModal.currentAppId === a.id ? '#eff6ff' : 'transparent', border: '1px solid #e5e7eb', marginBottom: '4px', fontSize: '13px' }}>
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  {a.category_name && <div style={{ color: '#64748b', fontSize: '11px' }}>{a.category_name}</div>}
                </div>
              ))}
            </div>
            <div style={{ marginTop: '16px', textAlign: 'right' }}>
              <button className="mdt-page-btn" onClick={() => { setAppModal(null); setAppSearch(''); }}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .mdt-container { display: flex; flex-direction: column; gap: 12px; }
        .mdt-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .mdt-search { display: flex; align-items: center; gap: 8px; flex: 1; max-width: 400px; position: relative; }
        .mdt-search > svg:first-child { position: absolute; left: 10px; color: #94a3b8; }
        .mdt-search-input { width: 100%; padding: 8px 12px 8px 36px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.85rem; outline: none; }
        .mdt-search-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }
        .mdt-count { font-size: 0.8rem; color: #64748b; }
        .mdt-col-btn { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid #e2e8f0; border-radius: 6px; background: white; font-size: 0.8rem; color: #475569; cursor: pointer; }
        .mdt-col-btn:hover { background: #f8fafc; }
        .mdt-col-dropdown { position: absolute; top: 100%; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-height: 300px; overflow-y: auto; z-index: 100; min-width: 180px; }
        .mdt-col-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 0.8rem; cursor: pointer; }
        .mdt-col-item input { cursor: pointer; }
        .mdt-table-wrap { overflow-x: auto; }
        .mdt-table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; }
        .mdt-th { padding: 10px 14px; text-align: left; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; color: #64748b; background: #f8fafc; border-bottom: 2px solid #e2e8f0; cursor: pointer; user-select: none; white-space: nowrap; }
        .mdt-th:hover { background: #f1f5f9; }
        .mdt-th-inner { display: flex; align-items: center; gap: 4px; }
        .mdt-row { transition: background 0.15s; }
        .mdt-row:nth-child(even) { background: #fafbfc; }
        .mdt-row:hover { background: #eff6ff; }
        .mdt-row-expanded { background: #f0f9ff !important; }
        .mdt-expand-cell { padding: 8px 4px !important; text-align: center; }
        .mdt-expand-btn { background: none; border: 1px solid #e2e8f0; border-radius: 4px; cursor: pointer; padding: 2px 4px; color: #64748b; display: inline-flex; align-items: center; }
        .mdt-expand-btn:hover { background: #f1f5f9; color: #3b82f6; }
        .mdt-spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: mdt-spin 0.6s linear infinite; }
        @keyframes mdt-spin { to { transform: rotate(360deg); } }
        .mdt-cell { padding: 8px 14px; font-size: 0.85rem; border-bottom: 1px solid #f1f5f9; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mdt-empty { text-align: center; padding: 32px; color: #94a3b8; }
        .mdt-pagination { display: flex; justify-content: center; align-items: center; gap: 16px; padding: 8px 0; }
        .mdt-page-btn { padding: 6px 16px; border: 1px solid #e2e8f0; border-radius: 6px; background: white; color: #475569; cursor: pointer; font-size: 0.85rem; }
        .mdt-page-btn:hover:not(:disabled) { background: #f8fafc; }
        .mdt-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .mdt-page-info { font-size: 0.85rem; color: #64748b; }
        .mdt-child-row { background: #f8fafc; }
        .mdt-child-table { width: 100%; border-collapse: collapse; background: #f8fafc; }
        .mdt-child-th { padding: 6px 14px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: #64748b; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; text-align: left; }
        .mdt-child-th:first-child { padding-left: 48px; }
        .mdt-child-cell { padding: 6px 14px; font-size: 0.82rem; border-bottom: 1px solid #e2e8f0; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mdt-child-cell:first-child { padding-left: 48px; }
        .mdt-child-row-item:nth-child(even) { background: #f1f5f9; }
        .mdt-child-row-item:hover { background: #e2e8f0; }
        .mdt-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .mdt-modal { background: white; border-radius: 12px; padding: 24px; width: 90%; max-height: 80vh; overflow-y: auto; }
      `}</style>

      {sfModalRow && rubriqueName === 'Factures' && (
        <ServiceFaitModal
          row={sfModalRow.row}
          columns={columns}
          mode={sfModalRow.mode}
          onClose={() => setSfModalRow(null)}
          onCreated={() => fetchData(searchTerm, currentPage * effectivePageSize)}
        />
      )}

      {sfProcessModal && (
        <ServiceFaitProcessusModal
          workflowId={sfProcessModal.workflowId}
          onClose={() => setSfProcessModal(null)}
          onChanged={() => fetchData(searchTerm, currentPage * effectivePageSize)}
        />
      )}

      {seditDocsViewer && (
        <FactureDocumentsViewer
          numero={seditDocsViewer.numero}
          numeros={seditDocsViewer.numeros}
          token={token}
          baseUrl={seditDocsViewer.baseUrl}
          title={seditDocsViewer.title}
          onClose={() => setSeditDocsViewer(null)}
        />
      )}

      {mandateNumero && (
        <MandatementModal
          numero={mandateNumero}
          urlSedit={urlSedit}
          onClose={() => setMandateNumero(null)}
        />
      )}
    </div>
  );
};

export default MappedDataTable;