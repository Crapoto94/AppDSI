import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Search, ChevronUp, ChevronDown, ChevronRight, Columns, ExternalLink, Link2 } from 'lucide-react';

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
}

const MappedDataTable: React.FC<MappedDataTableProps> = ({ rubriqueName, title: _title, pageSize = 100, fiscalYear, onOpenColumnSettings, columnStyles, onColumnsReady, visibleColumns }) => {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const storageKey = `mdt_cols_${rubriqueName}`;
  const [columns, setColumns] = useState<MappingColumn[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
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
  const [childRubriqueId, setChildRubriqueId] = useState<number | null>(null);
  const [childLinkColumn, setChildLinkColumn] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [childrenData, setChildrenData] = useState<Record<string, { columns: MappingColumn[]; rows: any[] }>>({});
  const [loadingChildren, setLoadingChildren] = useState<Record<string, boolean>>({});
  const [childVisibleCols, setChildVisibleCols] = useState<string[]>([]);
  const [pendingFilter, setPendingFilter] = useState(false);

  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(visibleCols)); }, [visibleCols, storageKey]);

  useEffect(() => {
    if (visibleColumns) {
      setVisibleCols(visibleColumns);
    }
  }, [visibleColumns]);

  const fetchData = async (search?: string, offset?: number, sort?: { key: string; direction: 'asc' | 'desc' } | null) => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { limit: pageSize, offset: offset || 0 };
      if (search) params.search = search;
      if (fiscalYear) params.fiscal_year = String(fiscalYear);
      const s = sort !== undefined ? sort : sortConfig;
      if (s) {
        params.sort_by = s.key;
        params.sort_dir = s.direction;
      }
      const res = await axios.get(`/api/finance/field-mapping/resolve/${encodeURIComponent(rubriqueName)}`, {
        headers,
        params
      });
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
      setError(err?.response?.data?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
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

  useEffect(() => {
    const timer = setTimeout(() => { fetchData(searchTerm, currentPage * pageSize); }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => { setCurrentPage(0); fetchData(searchTerm, 0); }, [fiscalYear]);
  useEffect(() => { fetchData(searchTerm, currentPage * pageSize); }, [currentPage]);
  useEffect(() => {
    if (sortConfig) fetchData(searchTerm, currentPage * pageSize, sortConfig);
  }, [sortConfig?.key, sortConfig?.direction]);

  useEffect(() => {
    axios.get('/api/budget/operations', { headers }).then(res => setOperations(res.data || [])).catch(() => {});
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

  const totalPages = Math.ceil(total / pageSize);
  const showActions = !!seditIdColumn;

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

  const activeCols = columns.filter(c => visibleCols.includes(c.name));

  const etatCol = columns.find(c => c.name === 'Etat' || c.expression === 'FACETAT_LIBELLE');
  const displayRows = pendingFilter && etatCol
    ? rows.filter(r => String(r[etatCol.name] || '').trim() === 'XXXXX')
    : rows;

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
              📋 À traiter {pendingFilter && `(${displayRows.length})`}
            </button>
          )}
          <span className="mdt-count">{pendingFilter ? displayRows.length : total} résultat{total > 1 ? 's' : ''}</span>
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
              {showActions && <th className="mdt-th" style={{ minWidth: '120px' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr><td colSpan={(childRubriqueId ? 1 : 0) + activeCols.length + (showActions ? 1 : 0)} className="mdt-empty">Aucun résultat</td></tr>
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
              const expandable = !!(childRubriqueId && childLinkValue);
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
                      return <td key={col.name} className="mdt-cell" style={tdStyle}>{formatCell(row[col.name], col)}</td>;
                    })}
                    {showActions && (
                      <td className="mdt-cell" style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {seditId && (
                              <button title="Ouvrir dans Sedit"
                                onClick={() => window.open(`${urlSedit}/${seditUrlPage}?${seditUrlParam}=${seditId}`, '_blank')}
                                style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <ExternalLink size={12} /> Sedit
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
                          </div>
                        </div>
                      </td>
                    )}
                  </tr>
                  {isExpanded && child && child.rows.length > 0 && (
                    <tr className="mdt-child-row">
                      <td colSpan={(childRubriqueId ? 1 : 0) + activeCols.length + (showActions ? 1 : 0)} style={{ padding: 0 }}>
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
                                  return cc ? <td key={cc.name} className="mdt-child-cell">{formatCell(cr[cc.name], cc)}</td> : null;
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
                      <td colSpan={(childRubriqueId ? 1 : 0) + activeCols.length + (showActions ? 1 : 0)} className="mdt-cell" style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '0.8rem' }}>
                        Chargement...
                      </td>
                    </tr>
                  )}
                  {isExpanded && child && child.rows.length === 0 && (
                    <tr className="mdt-child-row">
                      <td colSpan={(childRubriqueId ? 1 : 0) + activeCols.length + (showActions ? 1 : 0)} className="mdt-cell" style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '0.8rem' }}>
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
    </div>
  );
};

export default MappedDataTable;