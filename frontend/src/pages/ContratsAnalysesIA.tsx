import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Header from '../components/Header';
import {
  ArrowLeft, RefreshCw, Search, ChevronUp, ChevronDown, X as CloseIcon,
  Sparkles, Loader2, AlertCircle, FileText, Columns,
} from 'lucide-react';
import { authHeaders, cleanFileName } from './Contrats';

interface AnalyseIaRow {
  id: number;
  contrat_id: number;
  document_id: number | null;
  document_name: string | null;
  fournisseur: string | null;
  date_debut: string | null;
  date_fin: string | null;
  duree_annees: number | null;
  nb_reconductions: number | null;
  reconduction: string | null;
  montant_annuel: number | null;
  gti: string | null;
  gtr: string | null;
  indice_revision: string | null;
  formule_revision: string | null;
  penalites: string | null;
  clause_resiliation: string | null;
  rgpd: string | null;
  resume: string | null;
  points_de_vigilance: string[] | null;
  recommandations: string[] | null;
  notes: string | null;
  score_global: number | null;
  raw_text: string | null;
  json_data: Record<string, unknown> | null;
  ai_model: string | null;
  ai_source: string | null;
  analysed_at: string | null;
  contrat_objet: string;
  svc: string;
  direction: string;
  service: string;
  contrat_statut: string;
  raison_sociale: string;
  type_contrat: string;
  contrat_date_fin: string | null;
  app_nom: string | null;
  [key: string]: unknown;
}

// Colonnes "à la carte" toujours proposées dans le panneau Colonnes, même si aucune ligne ne
// les a (encore) renseignées — correspondent à des colonnes dédiées de la table (comparaison
// rapide, sans dépendre du contenu de json_data).
const SUGGESTED_EXTRA_COLS: { key: string; label: string }[] = [
  { key: 'formule_revision', label: 'Formule de révision' },
  { key: 'penalites', label: 'Pénalités' },
  { key: 'clause_resiliation', label: 'Clause de résiliation' },
  { key: 'rgpd', label: 'RGPD' },
];

// Champs déjà représentés par une colonne dédiée (fixe ou suggérée) — jamais reproposés comme
// "autre champ détecté" dans json_data, même si l'IA les y a aussi mis.
const KNOWN_FIELD_KEYS = new Set([
  'fournisseur', 'date_debut', 'date_fin', 'duree_annees', 'nb_reconductions', 'reconduction',
  'montant_annuel', 'montant_2022', 'gti', 'gtr', 'indice_revision', 'resume',
  'points_de_vigilance', 'recommandations', 'notes', 'score_global', 'score',
  ...SUGGESTED_EXTRA_COLS.map(c => c.key),
]);

const humanizeKey = (key: string) => key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

/** Valeur d'une colonne "à la carte" : colonne dédiée de la table si elle existe (formule_revision,
 * etc.), sinon clé quelconque détectée dans json_data (tout ce que l'IA a extrait du rapport, y
 * compris des points propres à un seul contrat — ex. "garantie", "sous_traitance"...). */
const getExtraCellValue = (row: AnalyseIaRow, key: string): string | null => {
  const direct = row[key];
  const value = direct !== undefined ? direct : row.json_data?.[key];
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.map(String).join(' ; ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

type SortKey = string;

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('fr-FR');
};

const fmtMontant = (n: number | null | undefined) =>
  n == null ? '—' : `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`;

const KNOWN_SORT_KEYS = new Set(['contrat_objet', 'fournisseur', 'score_global', 'date_debut', 'date_fin', 'montant_annuel', 'analysed_at', 'svc']);

const scoreColor = (score: number | null) => score == null
  ? { bg: '#f3f4f6', fg: '#6b7280' }
  : score >= 70 ? { bg: '#dcfce7', fg: '#15803d' }
  : score >= 40 ? { bg: '#fef3c7', fg: '#92400e' }
  : { bg: '#fee2e2', fg: '#991b1b' };

const ContratsAnalysesIA: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AnalyseIaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('analysed_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [detailRow, setDetailRow] = useState<AnalyseIaRow | null>(null);
  const [extraCols, setExtraCols] = useState<string[]>([]);
  const [showColPanel, setShowColPanel] = useState(false);
  const [colSearch, setColSearch] = useState('');
  const colPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showColPanel) return;
    const onClick = (e: MouseEvent) => {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node)) setShowColPanel(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showColPanel]);

  const fetchRows = () => {
    setLoading(true);
    setError('');
    fetch('/api/contrats/analyse-ia/liste', { headers: authHeaders() })
      .then(res => { if (!res.ok) throw new Error(`Erreur ${res.status}`); return res.json(); })
      .then(data => setRows(Array.isArray(data) ? data : []))
      .catch(e => setError(e.message || 'Erreur de chargement'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRows(); }, []);

  const directions = useMemo(
    () => Array.from(new Set(rows.map(r => r.direction).filter(Boolean))).sort(),
    [rows]
  );

  // Toutes les clés vues dans json_data à travers les lignes, en plus des colonnes suggérées —
  // c'est ce qui rend "comparable" n'importe quelle information extraite par l'IA (y compris des
  // points propres à un seul type de contrat), sans avoir à prévoir chaque clé possible à l'avance.
  const dynamicKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows) {
      if (!r.json_data) continue;
      for (const k of Object.keys(r.json_data)) {
        if (!KNOWN_FIELD_KEYS.has(k)) keys.add(k);
      }
    }
    return Array.from(keys).sort();
  }, [rows]);

  const toggleExtraCol = (key: string) => setExtraCols(cols => cols.includes(key) ? cols.filter(c => c !== key) : [...cols, key]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = minScore !== '' ? parseInt(minScore, 10) : null;
    const max = maxScore !== '' ? parseInt(maxScore, 10) : null;
    return rows.filter(r => {
      if (directionFilter && r.direction !== directionFilter) return false;
      if (min != null && (r.score_global == null || r.score_global < min)) return false;
      if (max != null && (r.score_global == null || r.score_global > max)) return false;
      if (!q) return true;
      const haystack = [
        r.contrat_objet, r.svc, r.direction, r.service, r.fournisseur, r.raison_sociale,
        r.resume, r.gti, r.gtr, r.indice_revision, r.app_nom, r.document_name,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search, minScore, maxScore, directionFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      // Colonne "à la carte" (suggérée ou détectée dans json_data) : comparaison texte générique
      // via getExtraCellValue, qui sait lire aussi bien une colonne dédiée qu'une clé de json_data.
      if (!KNOWN_SORT_KEYS.has(sortKey)) {
        const av = String(getExtraCellValue(a, sortKey) ?? '').toLowerCase();
        const bv = String(getExtraCellValue(b, sortKey) ?? '').toLowerCase();
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      }
      let av: string | number = (a[sortKey] ?? '') as string | number;
      let bv: string | number = (b[sortKey] ?? '') as string | number;
      if (sortKey === 'score_global' || sortKey === 'montant_annuel') {
        av = a[sortKey] == null ? -Infinity : Number(a[sortKey]);
        bv = b[sortKey] == null ? -Infinity : Number(b[sortKey]);
        return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
      }
      if (sortKey === 'date_debut' || sortKey === 'date_fin' || sortKey === 'analysed_at') {
        av = av ? new Date(av as string).getTime() : -Infinity;
        bv = bv ? new Date(bv as string).getTime() : -Infinity;
        return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
      }
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'analysed_at' || key === 'score_global' ? 'desc' : 'asc'); }
  };

  const SI: React.FC<{ k: SortKey }> = ({ k }) => sortKey !== k ? null : (
    sortDir === 'asc' ? <ChevronUp size={10} style={{ display: 'inline', marginLeft: 2 }} /> : <ChevronDown size={10} style={{ display: 'inline', marginLeft: 2 }} />
  );

  const th = (label: string, key: SortKey, extra?: React.CSSProperties) => (
    <th
      onClick={() => handleSort(key)}
      style={{ padding: '7px 8px', background: '#1e3a5f', color: '#fff', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', textAlign: 'left', ...extra }}
    >
      {label}<SI k={key} />
    </th>
  );

  const avgScore = useMemo(() => {
    const scores = filtered.map(r => r.score_global).filter((s): s is number => s != null);
    return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  }, [filtered]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc' }}>
      <Header />
      <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0 }}>
        <button onClick={() => navigate('/contrats')} title="Retour à la liste des contrats" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 12 }}>
          <ArrowLeft size={13} /> Contrats
        </button>
        <h1 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={16} color="#4f46e5" /> Analyses IA des contrats
        </h1>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          {filtered.length} / {rows.length} analyse(s){avgScore != null ? ` — score moyen ${avgScore}/100` : ''}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher (contrat, fournisseur, résumé...)"
              style={{ padding: '6px 8px 6px 28px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, width: 240 }}
            />
          </div>
          <select value={directionFilter} onChange={e => setDirectionFilter(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}>
            <option value="">Toutes directions</option>
            {directions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <input type="number" min={0} max={100} value={minScore} onChange={e => setMinScore(e.target.value)} placeholder="Score min" style={{ width: 78, padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
          <input type="number" min={0} max={100} value={maxScore} onChange={e => setMaxScore(e.target.value)} placeholder="Score max" style={{ width: 78, padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />

          <div style={{ position: 'relative' }} ref={colPanelRef}>
            <button
              onClick={() => setShowColPanel(p => !p)}
              title="Ajouter des colonnes de comparaison (tout ce que l'IA a extrait des rapports — formule de révision, RGPD, pénalités...)"
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: 'none', background: showColPanel ? '#eef2ff' : '#f3f4f6', color: showColPanel ? '#4338ca' : '#374151', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              <Columns size={13} /> Colonnes {extraCols.length > 0 ? `(${extraCols.length})` : ''}
            </button>
            {showColPanel && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 200, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', padding: 12, width: 300, maxHeight: 440, display: 'flex', flexDirection: 'column' }}>
                <input
                  value={colSearch}
                  onChange={e => setColSearch(e.target.value)}
                  placeholder={`Filtrer parmi ${SUGGESTED_EXTRA_COLS.length + dynamicKeys.length} champs...`}
                  style={{ padding: '5px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: 12, marginBottom: 8, flexShrink: 0 }}
                />
                <div style={{ overflowY: 'auto' }}>
                  {SUGGESTED_EXTRA_COLS.filter(c => c.label.toLowerCase().includes(colSearch.toLowerCase())).length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#1e3a5f', marginBottom: 6 }}>Colonnes suggérées</div>
                      {SUGGESTED_EXTRA_COLS.filter(c => c.label.toLowerCase().includes(colSearch.toLowerCase())).map(c => (
                        <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
                          <input type="checkbox" checked={extraCols.includes(c.key)} onChange={() => toggleExtraCol(c.key)} style={{ width: 14, height: 14 }} />
                          {c.label}
                        </label>
                      ))}
                    </>
                  )}
                  {(() => {
                    const filteredDynamic = dynamicKeys.filter(k => humanizeKey(k).toLowerCase().includes(colSearch.toLowerCase()));
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1e3a5f', margin: '10px 0 6px' }}>
                          Autres champs détectés dans les analyses ({dynamicKeys.length})
                        </div>
                        {filteredDynamic.length === 0 ? (
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>Aucun{colSearch ? ' résultat' : ' pour l\'instant'}.</div>
                        ) : filteredDynamic.map(k => (
                          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
                            <input type="checkbox" checked={extraCols.includes(k)} onChange={() => toggleExtraCol(k)} style={{ width: 14, height: 14 }} />
                            {humanizeKey(k)}
                          </label>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          <button onClick={fetchRows} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 12 }}>
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Actualiser
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 13, padding: 20 }}>
            <Loader2 size={14} className="animate-spin" /> Chargement des analyses…
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: 13, padding: 20, textAlign: 'center' }}>
            Aucune analyse IA {rows.length > 0 ? 'ne correspond aux filtres' : "n'a encore été enregistrée"}.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {th('Contrat', 'contrat_objet')}
                  {th('SVC', 'svc', { width: 60 })}
                  {th('Fournisseur', 'fournisseur')}
                  {th('Score IA', 'score_global', { width: 80 })}
                  {th('Début', 'date_debut', { width: 90 })}
                  {th('Fin', 'date_fin', { width: 90 })}
                  {th('Montant annuel', 'montant_annuel', { width: 110 })}
                  <th style={{ padding: '7px 8px', background: '#1e3a5f', color: '#fff', fontWeight: 600, fontSize: 11 }}>GTI / GTR</th>
                  <th style={{ padding: '7px 8px', background: '#1e3a5f', color: '#fff', fontWeight: 600, fontSize: 11 }}>Résumé</th>
                  {th('Analysée le', 'analysed_at', { width: 100 })}
                  {extraCols.map(key => {
                    const label = SUGGESTED_EXTRA_COLS.find(c => c.key === key)?.label || humanizeKey(key);
                    return th(label, key, { minWidth: 160 });
                  })}
                  <th style={{ padding: '7px 8px', background: '#1e3a5f', color: '#fff', fontWeight: 600, fontSize: 11, width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const color = scoreColor(r.score_global);
                  return (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: '#1e3a5f', cursor: 'pointer' }} onClick={() => setDetailRow(r)} title={r.document_name ? cleanFileName(r.document_name) : ''}>
                        {r.contrat_objet || `Contrat #${r.contrat_id}`}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{r.svc || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{r.fournisseur || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{ background: color.bg, color: color.fg, borderRadius: 9999, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                          {r.score_global != null ? `${r.score_global}/100` : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fmtDate(r.date_debut)}</td>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fmtDate(r.date_fin)}</td>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fmtMontant(r.montant_annuel)}</td>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{r.gti || '—'} / {r.gtr || '—'}</td>
                      <td style={{ padding: '6px 8px', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#4b5563' }} title={r.resume || ''}>
                        {r.resume || <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fmtDate(r.analysed_at)}</td>
                      {extraCols.map(key => {
                        const v = getExtraCellValue(r, key);
                        return (
                          <td key={key} style={{ padding: '6px 8px', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#4b5563' }} title={v || ''}>
                            {v || <span style={{ color: '#9ca3af' }}>—</span>}
                          </td>
                        );
                      })}
                      <td style={{ padding: '6px 8px' }}>
                        <button onClick={() => setDetailRow(r)} title="Voir l'analyse complète" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4f46e5', display: 'inline-flex' }}>
                          <FileText size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setDetailRow(null)}>
          <div style={{ background: '#fff', borderRadius: 10, width: '90vw', maxWidth: 900, height: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <Sparkles size={15} color="#4f46e5" />
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1e3a5f' }}>{detailRow.contrat_objet || `Contrat #${detailRow.contrat_id}`}</div>
              {detailRow.score_global != null && (
                <span style={{ background: scoreColor(detailRow.score_global).bg, color: scoreColor(detailRow.score_global).fg, borderRadius: 9999, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                  {detailRow.score_global}/100
                </span>
              )}
              <button
                onClick={() => navigate('/contrats')}
                title="Ouvrir la liste des contrats"
                style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 11 }}
              >
                Voir le contrat
              </button>
              <button onClick={() => setDetailRow(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><CloseIcon size={16} /></button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              {detailRow.document_name && (
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>Document source : {cleanFileName(detailRow.document_name)}{detailRow.ai_model ? ` — modèle ${detailRow.ai_model}` : ''}</div>
              )}
              <div className="analyses-ia-md">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{detailRow.raw_text || detailRow.resume || '_Aucun contenu._'}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .animate-spin { animation: analyses-ia-spin 1s linear infinite; }
        @keyframes analyses-ia-spin { to { transform: rotate(360deg); } }
        .analyses-ia-md { font-size: 12.5px; color: #1f2937; line-height: 1.6; }
        .analyses-ia-md p { margin: 0 0 10px; }
        .analyses-ia-md h1, .analyses-ia-md h2, .analyses-ia-md h3 { font-size: 13px; margin: 14px 0 6px; color: #111827; }
        .analyses-ia-md ul, .analyses-ia-md ol { margin: 0 0 10px; padding-left: 20px; }
        .analyses-ia-md table { border-collapse: collapse; width: 100%; margin: 0 0 14px; font-size: 12px; }
        .analyses-ia-md th, .analyses-ia-md td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
        .analyses-ia-md th { background: #f9fafb; font-weight: 700; color: #374151; }
        .analyses-ia-md code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 11.5px; }
      `}</style>
    </div>
  );
};

export default ContratsAnalysesIA;
