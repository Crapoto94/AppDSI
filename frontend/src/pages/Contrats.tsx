import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import Header from '../components/Header';
import {
  Upload, Download, AlertCircle, Loader2, Trash2, Edit2, Check,
  X as CloseIcon, Search, RefreshCw, ChevronUp, ChevronDown, ChevronRight, Plus, FileSpreadsheet,
  RefreshCcw, Archive, FileText, Columns, Filter, Link2, ExternalLink, FileCheck2,
  TrendingUp, TrendingDown, ArrowRight, Bookmark, Save, Paperclip
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
  type_bien: string;
  numero: string;
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
  renouvellement_actuel: number | null;
  dates_verifiees: number | null;
  date_fin_cours?: string | null;
  date_fin_maxi?: string | null;
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
  prevision_2029: number | null;
  commentaires: string;
  statut: string;
  renouvellement_statut: string | null;
  renouvellement_commentaire: string;
  doc_principal_path: string;
  doc_principal_nom: string;
  docs_count?: number;
  imported_at: string;
  gti: string;
  gtr: string;
  penalite: string;
  indice_revision: string;
  formule_revision: string;
  sla_niveaux?: SlaNiveau[];
  numero_facture: string;
  contrat_renouvellement_id: number | null;
  created_at: string;
  commande_sedit: string;
  commande_numero: string;
  commande_type: string;
  commande_libelle: string;
  commande_montant: number | null;
  engagement_code: string;
  engagement_libelle: string;
  lien_annee: number | null;
  liaisons?: ContratLiaison[];
}

interface SlaNiveau {
  categorie: 'GTI' | 'GTR';
  duree_heures: number | null;
  type_service: string;
}

interface ContratLiaison {
  id: number;
  contrat_id: number;
  commande_type: string;
  commande_sedit: string;
  commande_numero: string;
  commande_libelle: string;
  commande_montant: number | null;
  date_commande: string;
  engagement_code: string;
  engagement_libelle: string;
  lien_annee: number | null;
}

interface Document {
  id: number;
  contrat_id: number;
  file_path: string;
  file_name: string;
  nature: string;
  est_principal: number;
  archive: number;
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
  { key: 'date_debut', label: 'Début', w: 82, type: 'date' },
  { key: 'duree_annees', label: 'Durée', w: 52, type: 'number' },
  { key: 'nb_reconductions', label: 'Recond.', w: 55, type: 'number', defaultVisible: false },
  { key: 'date_fin', label: 'Fin', w: 82, type: 'date' },
  { key: 'date_fin_cours', label: 'Fin en cours', w: 82, type: 'date' },
  { key: 'date_fin_maxi', label: 'Fin maxi', w: 82, type: 'date' },
  { key: 'dates_verifiees', label: 'Contrat vérifié', w: 84 },
  { key: 'marche_contrat', label: 'Marché/Contrat', w: 110 },
  { key: 'piece', label: 'Pièce', w: 65, defaultVisible: false },
  { key: 'date_reconduction', label: 'Date recond.', w: 82 },
  { key: 'reconduction', label: 'Reconduction', w: 88 },
  { key: 'montant_2022', label: '2022', w: 82, type: 'number', defaultVisible: false },
  { key: 'montant_2023', label: '2023', w: 82, type: 'number', defaultVisible: false },
  { key: 'montant_2024', label: '2024', w: 82, type: 'number', defaultVisible: false },
  { key: 'montant_2025', label: '2025', w: 82, type: 'number', defaultVisible: false },
  { key: 'montant_2026', label: '2026', w: 82, type: 'number' },
  { key: 'prevision_2026', label: 'Prév.2026', w: 88, type: 'number', defaultVisible: false },
  { key: 'prevision_2027', label: 'Prév.2027', w: 88, type: 'number' },
  { key: 'prevision_2028', label: 'Prév.2028', w: 88, type: 'number', defaultVisible: false },
  { key: 'prevision_2029', label: 'Prév.2029', w: 88, type: 'number', defaultVisible: false },
  { key: 'renouvellement_statut', label: 'Renouvell.', w: 90 },
  { key: 'numero_facture', label: 'N° Facture', w: 110 },
  { key: 'commande_numero', label: 'Commande liée', w: 170 },
  { key: 'commentaires', label: 'Commentaires', w: 170 },
];

const fmt = (n: number | null) =>
  n == null ? '—' : Math.round(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';

// Convention couleur des tendances (dépense en hausse = alerte, en baisse = positif) :
// rouge = ça monte, vert = ça descend, gris = stable.
const TREND_UP_COLOR = '#dc2626';
const TREND_DOWN_COLOR = '#16a34a';
const TREND_STABLE_COLOR = '#9ca3af';

// Tendance du montant 2026 par rapport à 2025 : hausse >15%, baisse <-15%, sinon stable.
const trend2026 = (c: Contrat): { Icon: typeof TrendingUp; color: string; title: string } | null => {
  if (c.montant_2026 == null) return null;
  const prev = c.prevision_2026;
  if (prev == null) return { Icon: ArrowRight, color: TREND_STABLE_COLOR, title: 'Pas de comparaison possible (prévision 2026 non renseignée)' };
  if (prev === 0) {
    return c.montant_2026 > 0
      ? { Icon: TrendingUp, color: TREND_UP_COLOR, title: 'En hausse par rapport à la prévision 2026 (prévision nulle)' }
      : { Icon: ArrowRight, color: TREND_STABLE_COLOR, title: 'Stable par rapport à la prévision 2026' };
  }
  const pct = ((c.montant_2026 - prev) / prev) * 100;
  if (pct > 15) return { Icon: TrendingUp, color: TREND_UP_COLOR, title: `En hausse de ${pct.toFixed(0)}% par rapport à la prévision 2026` };
  if (pct < -15) return { Icon: TrendingDown, color: TREND_DOWN_COLOR, title: `En baisse de ${Math.abs(pct).toFixed(0)}% par rapport à la prévision 2026` };
  return { Icon: ArrowRight, color: TREND_STABLE_COLOR, title: `Stable par rapport à la prévision 2026 (${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%)` };
};

// Même code flèche/couleur, appliqué à une paire de valeurs consécutives (ex: année vs année précédente).
const trendBetween = (curr: number, prev: number): { Icon: typeof TrendingUp; color: string; title: string } => {
  if (prev === 0) {
    return curr > 0
      ? { Icon: TrendingUp, color: TREND_UP_COLOR, title: 'En hausse par rapport à l\'année précédente (base nulle)' }
      : { Icon: ArrowRight, color: TREND_STABLE_COLOR, title: 'Stable par rapport à l\'année précédente' };
  }
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  if (pct > 1) return { Icon: TrendingUp, color: TREND_UP_COLOR, title: `En hausse de ${pct.toFixed(0)}% par rapport à l'année précédente` };
  if (pct < -1) return { Icon: TrendingDown, color: TREND_DOWN_COLOR, title: `En baisse de ${Math.abs(pct).toFixed(0)}% par rapport à l'année précédente` };
  return { Icon: ArrowRight, color: TREND_STABLE_COLOR, title: `Stable par rapport à l'année précédente (${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%)` };
};

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('fr-FR');
};

const toLocalDateStr = (d: string): string => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d.split('T')[0] || d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const DateField = ({ value, onChange, disabled, style }: { value: string | null; onChange: (iso: string | null) => void; disabled?: boolean; style?: React.CSSProperties }) => {
  const iso = value ? toLocalDateStr(value) : '';
  return (
    <input
      type="date"
      key={iso}
      defaultValue={iso}
      disabled={disabled}
      style={style}
      onChange={e => { const v = e.target.value; if (v !== '') onChange(v); }}
      onBlur={e => { if (e.target.value === '' && iso !== '') onChange(null); }}
    />
  );
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

// ── Prévision budgétaire : total par SVC, déroulable par nature ───────────────
// n-1 = montant réalisé N-1, n = montant réalisé de l'année en cours, n+1..n+3 = prévisions.
const PREVISION_YEARS: { key: keyof Contrat; label: string }[] = [
  { key: 'montant_2025', label: '2025 (n-1)' },
  { key: 'montant_2026', label: '2026 (n)' },
  { key: 'prevision_2027', label: '2027 (n+1)' },
  { key: 'prevision_2028', label: '2028 (n+2)' },
  { key: 'prevision_2029', label: '2029 (n+3)' },
];

interface PrevisionLogicielRow { label: string; totals: number[] }
interface PrevisionRow { label: string; totals: number[]; logiciels: PrevisionLogicielRow[] }
interface PrevisionSection { totals: number[]; natures: PrevisionRow[] }
interface PrevisionGroup { svc: string; totals: number[]; investissement: PrevisionSection; fonctionnement: PrevisionSection }

// Tri alphanumérique naturel : BF1, BF2, ..., BF10 (pas BF1, BF10, BF2 en lexicographique).
const naturalCompare = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });

// Nature 2051 = investissement, tout le reste = fonctionnement (mêmes codes couleur que /budget).
const isInvestissement = (c: Contrat) => c.nature?.trim() === '2051';
const SECTION_COLORS = {
  I: { text: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  F: { text: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0' },
};

// Année en cours (n) : on prend le montant réalisé 2026 s'il est renseigné (même à 0),
// sinon on retombe sur la prévision 2026 (cas non renseigné ou "-").
function amountForYear(c: Contrat, key: keyof Contrat): number {
  if (key === 'montant_2026') {
    const m = c.montant_2026 as unknown;
    if (m !== null && m !== undefined && m !== '') return Number(m) || 0;
    return Number(c.prevision_2026) || 0;
  }
  return Number(c[key]) || 0;
}

function buildSection(contrats: Contrat[]): PrevisionSection {
  const byNat = new Map<string, Contrat[]>();
  for (const c of contrats) {
    const nat = c.nature?.trim() || 'Nature non renseignée';
    if (!byNat.has(nat)) byNat.set(nat, []);
    byNat.get(nat)!.push(c);
  }
  const totals = PREVISION_YEARS.map(() => 0);
  const natures = [...byNat.entries()]
    .map(([label, list]) => {
      const natTotals = PREVISION_YEARS.map(() => 0);
      const byLog = new Map<string, number[]>();
      for (const c of list) {
        const log = c.objet?.trim() || 'Logiciel non renseigné';
        if (!byLog.has(log)) byLog.set(log, PREVISION_YEARS.map(() => 0));
        const logTotals = byLog.get(log)!;
        PREVISION_YEARS.forEach((y, i) => { const v = amountForYear(c, y.key); logTotals[i] += v; natTotals[i] += v; });
      }
      const logiciels = [...byLog.entries()]
        .map(([label, t]) => ({ label, totals: t }))
        .sort((a, b) => naturalCompare(a.label, b.label));
      totals.forEach((_, i) => { totals[i] += natTotals[i]; });
      return { label, totals: natTotals, logiciels };
    })
    .sort((a, b) => naturalCompare(a.label, b.label));
  return { totals, natures };
}

function buildPrevisionData(contrats: Contrat[]): PrevisionGroup[] {
  const bySvc = new Map<string, Contrat[]>();
  for (const c of contrats) {
    const svc = c.svc?.trim() || 'SVC non renseigné';
    if (!bySvc.has(svc)) bySvc.set(svc, []);
    bySvc.get(svc)!.push(c);
  }
  const groups: PrevisionGroup[] = [];
  for (const [svc, list] of bySvc.entries()) {
    const investissement = buildSection(list.filter(isInvestissement));
    const fonctionnement = buildSection(list.filter(c => !isInvestissement(c)));
    const totals = PREVISION_YEARS.map((_, i) => investissement.totals[i] + fonctionnement.totals[i]);
    groups.push({ svc, totals, investissement, fonctionnement });
  }
  return groups.sort((a, b) => naturalCompare(a.svc, b.svc));
}

const PrevisionModal: React.FC<{ contrats: Contrat[]; onClose: () => void }> = ({ contrats, onClose }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedNat, setExpandedNat] = useState<Set<string>>(new Set());
  const active = contrats.filter(c => c.statut !== 'archivé');
  const groups = buildPrevisionData(active);
  const grandTotal = PREVISION_YEARS.map(() => 0);
  const grandInvest = PREVISION_YEARS.map(() => 0);
  const grandFonct = PREVISION_YEARS.map(() => 0);
  groups.forEach(g => {
    g.totals.forEach((v, i) => { grandTotal[i] += v; });
    g.investissement.totals.forEach((v, i) => { grandInvest[i] += v; });
    g.fonctionnement.totals.forEach((v, i) => { grandFonct[i] += v; });
  });

  const toggle = (svc: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(svc)) next.delete(svc); else next.add(svc);
    return next;
  });
  const toggleNat = (key: string) => setExpandedNat(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '7px 10px', textAlign: 'right', fontSize: 13 };

  // Chiffres des prévisions : même code flèche/couleur que la colonne 2026(n) du tableau
  // (rouge = ça monte, vert = ça descend), comparé à l'année précédente de la même ligne.
  const renderAmtCells = (totals: number[], style: React.CSSProperties) => totals.map((v, i) => {
    if (i === 0) return <td key={i} style={style}>{fmt(v)}</td>;
    const t = trendBetween(v, totals[i - 1]);
    return (
      <td key={i} style={style}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }} title={t.title}>
          <t.Icon size={11} color={t.color} />
          {fmt(v)}
        </span>
      </td>
    );
  });

  const SectionBadge: React.FC<{ kind: 'I' | 'F' }> = ({ kind }) => {
    const c = SECTION_COLORS[kind];
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: 5, fontWeight: 800, fontSize: 10,
        background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      }}>{kind}</span>
    );
  };

  const renderSectionRows = (svc: string, kind: 'I' | 'F', label: string, section: PrevisionSection) => {
    if (section.natures.length === 0) return null;
    const color = SECTION_COLORS[kind];
    return (
      <React.Fragment key={`${svc}|${kind}`}>
        <tr style={{ background: color.bg }}>
          <td style={{ padding: '6px 10px 6px 34px', fontSize: 12, fontWeight: 700, color: color.text, display: 'flex', alignItems: 'center', gap: 6 }}>
            <SectionBadge kind={kind} /> {label}
          </td>
          {renderAmtCells(section.totals, { ...td, fontSize: 12, fontWeight: 700, color: color.text })}
        </tr>
        {section.natures.map(n => {
          const natKey = `${svc}|${kind}|${n.label}`;
          const natOpen = expandedNat.has(natKey);
          const hasLogiciels = n.logiciels.length > 1 || (n.logiciels.length === 1 && n.logiciels[0].label !== 'Logiciel non renseigné');
          return (
            <React.Fragment key={natKey}>
              <tr
                onClick={() => hasLogiciels && toggleNat(natKey)}
                style={{ background: '#f9fafb', color: '#475569', cursor: hasLogiciels ? 'pointer' : 'default' }}
                onMouseEnter={e => { if (hasLogiciels) e.currentTarget.style.background = '#f1f5f9'; }}
                onMouseLeave={e => { if (hasLogiciels) e.currentTarget.style.background = '#f9fafb'; }}>
                <td style={{ padding: '5px 10px 5px 56px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {hasLogiciels ? (natOpen ? <ChevronDown size={12} color="#9ca3af" /> : <ChevronRight size={12} color="#9ca3af" />) : <span style={{ width: 12 }} />}
                  {n.label}
                </td>
                {renderAmtCells(n.totals, { ...td, fontSize: 12 })}
              </tr>
              {natOpen && hasLogiciels && n.logiciels.map(l => (
                <tr key={`${natKey}|${l.label}`} style={{ background: '#fff', color: '#6b7280' }}>
                  <td style={{ padding: '4px 10px 4px 78px', fontSize: 11.5, fontStyle: 'italic' }}>{l.label}</td>
                  {renderAmtCells(l.totals, { ...td, fontSize: 11.5, fontStyle: 'italic' })}
                </tr>
              ))}
            </React.Fragment>
          );
        })}
      </React.Fragment>
    );
  };

  return (
    <Overlay onClose={onClose} maxWidth={900}>
      <ModalHeader title="Prévision budgétaire par SVC" onClose={onClose} />
      {groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#6b7280', fontSize: 13 }}>Aucun contrat actif.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#475569' }}>SVC</th>
                {PREVISION_YEARS.map(y => <th key={y.key} style={th}>{y.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {groups.map(g => {
                const isOpen = expanded.has(g.svc);
                return (
                  <React.Fragment key={g.svc}>
                    <tr onClick={() => toggle(g.svc)}
                      style={{ cursor: 'pointer', borderTop: '1px solid #e5e7eb', fontWeight: 700 }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6, color: '#1e3a5f' }}>
                        {isOpen ? <ChevronDown size={14} color="#6b7280" /> : <ChevronRight size={14} color="#6b7280" />}
                        {g.svc}
                      </td>
                      {renderAmtCells(g.totals, td)}
                    </tr>
                    {isOpen && renderSectionRows(g.svc, 'I', 'Investissement', g.investissement)}
                    {isOpen && renderSectionRows(g.svc, 'F', 'Fonctionnement', g.fonctionnement)}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #bfdbfe' }}>
                <td style={{ padding: '7px 10px', fontWeight: 700, color: SECTION_COLORS.I.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <SectionBadge kind="I" /> Total Investissement
                </td>
                {renderAmtCells(grandInvest, { ...td, fontWeight: 700, color: SECTION_COLORS.I.text })}
              </tr>
              <tr>
                <td style={{ padding: '7px 10px', fontWeight: 700, color: SECTION_COLORS.F.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <SectionBadge kind="F" /> Total Fonctionnement
                </td>
                {renderAmtCells(grandFonct, { ...td, fontWeight: 700, color: SECTION_COLORS.F.text })}
              </tr>
              <tr style={{ borderTop: '2px solid #1e3a5f' }}>
                <td style={{ padding: '9px 10px', fontWeight: 800, color: '#1e3a5f' }}>Total général</td>
                {renderAmtCells(grandTotal, { ...td, fontWeight: 800, color: '#1e3a5f' })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 11, color: '#9ca3af' }}>
        Basé sur les contrats actifs (hors archivés). 2025/2026 = montants réalisés, 2027-2029 = prévisions.
        Nature 2051 = investissement, le reste = fonctionnement.
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 8 }}>
          <TrendingUp size={11} color={TREND_UP_COLOR} /> hausse
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 8 }}>
          <TrendingDown size={11} color={TREND_DOWN_COLOR} /> baisse
        </span>
        {' '}vs. année précédente.
      </div>
    </Overlay>
  );
};

const authHeaders = () => ({
  'Authorization': `Bearer ${localStorage.getItem('token')}`
});

// Construit une URL de prévisualisation à partir d'un chemin BD ("storage/..." ou "file_contrats/...").
// Encode chaque segment pour supporter les noms de fichiers avec espaces/accents/caractères spéciaux.
const docFileUrl = (filePath: string | null | undefined) => {
  if (!filePath) return '';
  const segments = String(filePath).replace(/\\/g, '/').split('/').filter(Boolean).map(encodeURIComponent);
  return `/api/${segments.join('/')}`;
};

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
  // Engagement 2026 : null = tout · 'engaged' = montant 2026 renseigné (0 inclus) · 'not_engaged' = non renseigné
  const [engagedFilter, setEngagedFilter] = useState<'engaged' | 'not_engaged' | null>(null);
  const [sortKey, setSortKey] = useState<ColKey | 'ech'>('ech');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [colFilters, setColFilters] = useState<Partial<Record<ColKey, string>>>({});
  const [showFilterRow, setShowFilterRow] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(
    new Set(COLS.filter(c => c.defaultVisible !== false).map(c => c.key))
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [savedViews, setSavedViews] = useState<{ id: number; nom: string; columns: ColKey[] }[]>([]);
  const [showViewsPanel, setShowViewsPanel] = useState(false);
  const [viewName, setViewName] = useState('');
  const [activeView, setActiveView] = useState<{ id: number; nom: string } | null>(null);
  const viewsPanelRef = useRef<HTMLDivElement>(null);
  const [showColPanel, setShowColPanel] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newContrat, setNewContrat] = useState<Partial<Contrat>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; skipped: number; errors: number } | null>(null);
  const [showPrevisionModal, setShowPrevisionModal] = useState(false);

  const [docModal, setDocModal] = useState<{ contrat: Contrat; docs: Document[] } | null>(null);
  const [showArchivedDocs, setShowArchivedDocs] = useState(false);
  const [editModalDocs, setEditModalDocs] = useState<Document[]>([]);
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
  const [appsSuggestions, setAppsSuggestions] = useState<Array<{ id: number; name: string }>>([]);
  const [appsSearch, setAppsSearch] = useState('');
  const [showAppsSuggestions, setShowAppsSuggestions] = useState(false);
  const [tiersDetailModal, setTiersDetailModal] = useState<{ code: string; nom: string } | null>(null);
  const [appDetailModal, setAppDetailModal] = useState<any | null>(null);
  const [appDetailLoading, setAppDetailLoading] = useState(false);

  // ── Lien bon de commande Sedit / engagement ─────────────────────────────────
  const [linkModal, setLinkModal] = useState<{ contrat: Contrat } | null>(null);
  const [linkTab, setLinkTab] = useState<'bc' | 'engagement'>('bc');
  const [linkQ, setLinkQ] = useState('');
  const [linkTiers, setLinkTiers] = useState('');
  const [linkMin, setLinkMin] = useState('');
  const [linkMax, setLinkMax] = useState('');
  const [linkYear, setLinkYear] = useState('');
  const [linkResults, setLinkResults] = useState<any[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkEngagementYears, setLinkEngagementYears] = useState<string[]>([]);
  const [linkSelections, setLinkSelections] = useState<any[]>([]);
  const [linkAmount, setLinkAmount] = useState('');
  const [linkSeditUrl, setLinkSeditUrl] = useState('');
  const [linkListModal, setLinkListModal] = useState<{ contrat: Contrat } | null>(null);

  const excelInputRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const editDocFileRef = useRef<HTMLInputElement>(null);
  const colPanelRef = useRef<HTMLDivElement>(null);

  const fetchContrats = async (): Promise<Contrat[] | null> => {
    try {
      const res = await fetch('/api/contrats', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        const enriched = list.map((c: Contrat) => {
          const { finCours, finMax } = computeFinContrat(c);
          return { ...c, date_fin_cours: finCours, date_fin_maxi: finMax };
        });
        setContrats(enriched);
        return enriched;
      } else if (res.status === 403) {
        showMsg('error', 'Session expirée. Veuillez vous reconnecter.');
        setContrats([]);
      } else {
        showMsg('error', 'Impossible de charger les contrats');
        setContrats([]);
      }
    } catch { showMsg('error', 'Impossible de charger les contrats'); setContrats([]); }
    finally { setLoading(false); }
    return null;
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
    (async () => {
      try {
        const res = await fetch('/api/settings/public', { headers: authHeaders() });
        if (res.ok) {
          const s = await res.json();
          setLinkSeditUrl(s.url_sedit_fi || 'https://seditgfprod.ivry.local/SeditGfSMProd');
        }
      } catch { }
      try {
        const res = await fetch('/api/finance/engagements/years', { headers: authHeaders() });
        if (res.ok) {
          const years = await res.json();
          setLinkEngagementYears(Array.isArray(years) ? years.map(String) : []);
        }
      } catch { }
      fetchViews();
    })();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node)) setShowColPanel(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (viewsPanelRef.current && !viewsPanelRef.current.contains(e.target as Node)) setShowViewsPanel(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text }); setTimeout(() => setMessage(null), 4000);
  };

  const contractEndDate = (c: Contrat) => c.date_fin_cours || c.date_fin;

  const expiredCount = contrats.filter(c => c.statut !== 'archivé' && isExpired(contractEndDate(c))).length;
  const soonCount = contrats.filter(c => c.statut !== 'archivé' && isExpiringSoon(contractEndDate(c))).length;
  // Champs texte libre importés d'Excel : on déduplique/compare en normalisant la casse et les
  // espaces (ex: "DSI" / "Dsi " / " DSI") pour éviter que des variantes ne soient traitées comme
  // des valeurs distinctes (filtre qui semble ne chercher que dans une partie des contrats).
  const normText = (s: string | null | undefined) => (s || '').trim().toLowerCase();
  const directions = Array.from(
    new Map(contrats.map(c => c.direction).filter(Boolean).map(d => [normText(d), (d as string).trim()])).values()
  ).sort((a, b) => a.localeCompare(b, 'fr'));
  const types = Array.from(
    new Map(contrats.map(c => c.type_contrat).filter(Boolean).map(t => [normText(t), (t as string).trim()])).values()
  ).sort((a, b) => a.localeCompare(b, 'fr'));
  const activeCols = COLS.filter(c => visibleCols.has(c.key));

  // ─── Filtres & tri ───────────────────────────────────────────────────────────

  const filtered = contrats.filter(c => {
    if (showArchives && c.statut !== 'archivé') return false;
    if (!showArchives && c.statut === 'archivé') return false;
    const q = searchQuery.trim().toLowerCase();
    if (q && ![c.objet, c.raison_sociale, c.direction, c.svc, c.marche_contrat, c.perimetre, c.commentaires].some(f => f?.toLowerCase().includes(q))) return false;
    if (filterDirection && normText(c.direction) !== normText(filterDirection)) return false;
    if (filterType && normText(c.type_contrat) !== normText(filterType)) return false;
    if (alertFilter === 'expired') { if (c.statut === 'archivé' || !isExpired(contractEndDate(c))) return false; }
    else if (alertFilter === 'soon') { if (c.statut === 'archivé' || !isExpiringSoon(contractEndDate(c))) return false; }
    if (engagedFilter === 'engaged' && c.montant_2026 == null) return false;
    if (engagedFilter === 'not_engaged' && c.montant_2026 != null) return false;
    // Filtres par colonne
    for (const [key, fv] of Object.entries(colFilters)) {
      if (!fv) continue;
      const val = String(c[key as ColKey] ?? '').toLowerCase();
      if (!val.includes(fv.toLowerCase())) return false;
    }
    return true;
  });

  const sortColType = COLS.find(c => c.key === sortKey)?.type;
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'ech') {
      const ad = daysUntil(contractEndDate(a));
      const bd = daysUntil(contractEndDate(b));
      const av = ad == null ? Number.MAX_SAFE_INTEGER : ad;
      const bv = bd == null ? Number.MAX_SAFE_INTEGER : bd;
      return sortDir === 'asc' ? av - bv : bv - av;
    }
    let av: string | number = (a[sortKey] ?? '') as string | number;
    let bv: string | number = (b[sortKey] ?? '') as string | number;
    if (['date_debut', 'date_fin', 'imported_at'].includes(sortKey as string)) {
      av = av ? new Date(av as string).getTime() : 0;
      bv = bv ? new Date(bv as string).getTime() : 0;
    } else if (sortColType === 'number') {
      // Les montants viennent de Postgres NUMERIC, sérialisés en chaîne ("1200.5") :
      // sans conversion explicite, un tri par défaut les comparerait alphabétiquement.
      av = av === '' || av == null ? -Infinity : parseFloat(String(av).replace(',', '.'));
      bv = bv === '' || bv == null ? -Infinity : parseFloat(String(bv).replace(',', '.'));
      if (isNaN(av as number)) av = -Infinity;
      if (isNaN(bv as number)) bv = -Infinity;
    } else if (typeof av === 'string') { av = av.toLowerCase(); bv = (bv as string).toLowerCase(); }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key: ColKey | 'ech') => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SI = ({ k }: { k: ColKey | 'ech' }) =>
    sortKey !== k ? null : sortDir === 'asc'
      ? <ChevronUp size={10} style={{ display: 'inline', marginLeft: 2 }} />
      : <ChevronDown size={10} style={{ display: 'inline', marginLeft: 2 }} />;

  // ─── Pagination ──────────────────────────────────────────────────────────────

  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const safePage = Math.min(page, totalPages);
  const paged = pageSize > 0 ? sorted.slice((safePage - 1) * pageSize, safePage * pageSize) : sorted;

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterDirection, filterType, alertFilter, engagedFilter, showArchives, sortKey, sortDir, colFilters, pageSize]);

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

  // ─── Export Excel ────────────────────────────────────────────────────────────

  const handleExportExcel = () => {
    const rows = sorted.map(c => {
      const row: Record<string, string | number> = {};
      COLS.forEach(col => {
        const v = c[col.key];
        if (col.type === 'date') row[col.label] = fmtDate(v as string | null);
        else if (col.type === 'number') row[col.label] = v == null ? '' : Number(v);
        else if (col.key === 'dates_verifiees') row[col.label] = v ? 'Vérifié' : '';
        else row[col.label] = v == null ? '' : String(v);
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contrats');
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `contrats_${date}.xlsx`);
  };

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  const addDuree = (dateStr: string, duree: number, count: number): string | null => {
    if (!dateStr || duree == null || count == null || duree <= 0) return null;
    const d = new Date(toLocalDateStr(dateStr) + 'T00:00:00Z');
    if (isNaN(d.getTime())) return null;
    const totalMonths = Math.round(duree * 12) * count;
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + totalMonths + 1, 0)).getUTCDate();
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + totalMonths, Math.min(d.getUTCDate(), lastDay)));
    if (isNaN(end.getTime())) return null;
    return end.toISOString().split('T')[0];
  };

  const calculateDateFin = (dateDebut: string | null, duree: number | null): string | null => {
    if (!dateDebut || duree == null) return null;
    return addDuree(dateDebut, duree, 1);
  };

  const computeFinContrat = (c: { date_fin?: string | null; duree_annees?: number | null; nb_reconductions?: number | null; renouvellement_actuel?: number | null }) => {
    const fin = c.date_fin ? toLocalDateStr(c.date_fin) : null;
    const duree = c.duree_annees ?? null;
    if (!fin || !duree) return { finCours: null, finMax: null };
    const actuel = Math.max(0, c.renouvellement_actuel ?? 0);
    const max = Math.max(0, c.nb_reconductions ?? 0);
    return {
      finCours: addDuree(fin, duree, actuel),
      finMax: addDuree(fin, duree, max),
    };
  };

  const suggestRenouvellement = (dateFin: string | null, duree: number | null, nbRecond: number | null): number => {
    if (!dateFin || !duree || !nbRecond || duree <= 0) return 0;
    const fin = toLocalDateStr(dateFin);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (today < fin) return 0;
    let k = 1;
    while (k <= nbRecond) {
      const endK = addDuree(fin, duree, k);
      if (!endK || today < endK) return k;
      k++;
    }
    return nbRecond;
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

  const fetchEditModalDocs = async (contratId: number) => {
    try {
      const res = await fetch(`/api/contrats/${contratId}/documents`, { headers: authHeaders() });
      if (res.ok) setEditModalDocs(await res.json());
    } catch { /* ignore */ }
  };

  const uploadFilesToContrat = async (contratId: number, files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;
    setDocUploading(true);
    try {
      for (const file of fileArr) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('nature', '');
        fd.append('est_principal', '0');
        await fetch(`/api/contrats/${contratId}/documents`, { method: 'POST', headers: authHeaders(), body: fd });
      }
      await fetchContrats();
      await fetchEditModalDocs(contratId);
      showMsg('success', `${fileArr.length} document${fileArr.length > 1 ? '(s)' : ''} uploadé${fileArr.length > 1 ? 's' : ''}`);
    } catch {
      showMsg('error', 'Erreur upload');
    } finally {
      setDocUploading(false);
    }
  };

  const openEditModal = (c: Contrat) => {
    setEditModal(c);
    setEditModalData({ ...c });
    setAppsSearch('');
    setCalculatedDateFin(false);
    setShowArchivedDocs(false);
    setEditModalDocs([]);
    if (c.id) fetchEditModalDocs(c.id);
    getLinkedContracts(c);
  };
  const saveModal = async () => {
    if (!editModalData) return;
    try {
      const isNew = !editModal;
      const method = isNew ? 'POST' : 'PUT';
      const url = isNew ? '/api/contrats' : `/api/contrats/${editModal!.id}`;
      const response = await fetch(url, { method, headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(editModalData) });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || data?.message || `Erreur ${response.status}`);
      }
      setEditModal(null); setEditModalData(null); setAppsSearch(''); await fetchContrats();
      showMsg('success', isNew ? 'Contrat créé' : 'Contrat mis à jour');
    } catch (error: any) {
      showMsg('error', error?.message || 'Impossible de sauvegarder');
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
      svc: '', objet: '', raison_sociale: '', tiers: '', app_id: null, type_contrat: '', type_bien: 'logiciel', numero: '', direction: '', service: '',
      perimetre: '', nature: '', fonction: '', budget: '', annee_initiale: null,
      date_debut: null, duree_annees: null, nb_reconductions: null, date_fin: null,
      marche_contrat: '', piece: '', date_reconduction: '', reconduction: '',
      montant_2022: null, montant_2023: null, montant_2024: null, montant_2025: null, montant_2026: null,
      prevision_2026: null, prevision_2027: null, prevision_2028: null, prevision_2029: null, commentaires: '',
      gti: '', gtr: '', penalite: '', indice_revision: '', formule_revision: '', sla_niveaux: [], numero_facture: '',
      renouvellement_actuel: 0, dates_verifiees: 0
    };
    setEditModal(null);
    setEditModalData(emptyContract);
    setCalculatedDateFin(false);
    setLinkedContracts(null);
    setShowArchivedDocs(false);
    setEditModalDocs([]);
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
      renouvellement_actuel: c.renouvellement_actuel ?? 0,
      dates_verifiees: c.dates_verifiees ?? 0,
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
    if (editModal?.id === docModal.contrat.id) await fetchEditModalDocs(docModal.contrat.id);
  };

  const handleDocArchive = async (contratId: number, docId: number, archive: boolean) => {
    await fetch(`/api/contrats/${contratId}/documents/${docId}/archive`, {
      method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ archive })
    });
    if (docModal?.contrat.id === contratId) await openDocModal(docModal.contrat);
    if (editModal?.id === contratId) await fetchEditModalDocs(contratId);
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
          prevision_2029: null,
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

  // ─── Lien bon de commande Sedit / engagement ────────────────────────────────

  const openLinkModal = (c: Contrat) => {
    setLinkModal({ contrat: c });
    setLinkTab((c.liaisons && c.liaisons[c.liaisons.length - 1]?.commande_type === 'engagement') ? 'engagement' : 'bc');
    setLinkQ('');
    setLinkTiers('');
    setLinkMin('');
    setLinkMax('');
    setLinkYear(String(new Date().getFullYear()));
    setLinkResults([]);
    setLinkSelections([]);
    setLinkAmount('');
  };

  const searchLink = async () => {
    if (!linkModal) return;
    setLinkLoading(true);
    setLinkResults([]);
    try {
      const path = linkTab === 'bc' ? '/api/contrats/commandes/search' : '/api/contrats/engagements/search';
      const params = new URLSearchParams();
      if (linkQ.trim()) params.set('q', linkQ.trim());
      if (linkTiers.trim()) params.set('tiers', linkTiers.trim());
      if (linkMin.trim()) params.set('montantMin', linkMin.trim());
      if (linkMax.trim()) params.set('montantMax', linkMax.trim());
      if (linkYear) params.set('year', linkYear);
      params.set('limit', '100');
      const res = await fetch(`${path}?${params}`, { headers: authHeaders() });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.message || `Erreur ${res.status}`);
      }
      const data = await res.json();
      setLinkResults(Array.isArray(data) ? data : []);
    } catch (e: any) { showMsg('error', e?.message || 'Erreur recherche'); }
    finally { setLinkLoading(false); }
  };

  const linkItemKey = (item: any) => {
    const k = linkTab === 'bc' ? (item.numero || item.sedit_id || '') : (item.code || '');
    return `${linkTab}:${k}`;
  };

  const linkItemAmount = (item: any) => {
    const a = linkTab === 'bc'
      ? (item.montant_ttc != null ? item.montant_ttc : item.montant_ht)
      : (item.montant != null ? item.montant : item.solde);
    return a != null && a !== '' ? a : null;
  };

  const toggleLink = (item: any) => {
    setLinkSelections(prev => {
      const key = linkItemKey(item);
      const exists = prev.some(s => linkItemKey(s) === key);
      const next = exists ? prev.filter(s => linkItemKey(s) !== key) : [...prev, { ...item, type: linkTab }];
      const sum = next.reduce((acc, s) => acc + (linkItemAmount(s) || 0), 0);
      setLinkAmount(sum > 0 ? String(Math.round(sum * 100) / 100) : '');
      return next;
    });
  };

  const confirmLink = async () => {
    if (!linkModal || linkSelections.length === 0) return;
    const errors: string[] = [];
    const okKeys = new Set<string>();
    for (const sel of linkSelections) {
      try {
        const payload: Record<string, any> = {
          commande_type: linkTab,
          montant_2026: linkAmount === '' ? null : parseFloat(String(linkAmount).replace(',', '.')),
          tiers_code: sel.tiers_code || sel.code || '',
          tiers_nom: sel.tiers_nom || ''
        };
        if (linkTab === 'bc') {
          payload.commande_sedit = sel.sedit_id || '';
          payload.commande_numero = sel.numero || '';
          payload.commande_libelle = sel.libelle || '';
          payload.commande_montant = sel.montant_ttc != null ? sel.montant_ttc : null;
          payload.date_commande = sel.date_commande || '';
        } else {
          payload.engagement_code = sel.code || '';
          payload.commande_libelle = sel.libelle || '';
          payload.commande_montant = sel.montant != null ? sel.montant : null;
          payload.date_commande = sel.exercice || sel.annee || sel.year || '';
        }
        const res = await fetch(`/api/contrats/${linkModal.contrat.id}/link-commande`, {
          method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const d = await res.json().catch(() => null);
        if (res.ok) {
          okKeys.add(linkItemKey(sel));
        } else {
          errors.push(`${linkTab === 'bc' ? (sel.numero || sel.sedit_id) : sel.code} : ${d?.message || `Erreur ${res.status}`}`);
        }
      } catch (e: any) {
        errors.push(`${linkTab === 'bc' ? (sel.numero || sel.sedit_id) : sel.code} : ${e?.message || 'Erreur'}`);
      }
    }

    const fresh = await fetchContrats();
    if (fresh) {
      const updated = fresh.find(x => x.id === linkModal.contrat.id);
      if (updated) setLinkModal(prev => prev ? { contrat: updated } : prev);
    }

    if (errors.length === 0) {
      setLinkModal(null);
      showMsg('success', linkSelections.length > 1 ? `${linkSelections.length} commandes liées` : (linkTab === 'bc' ? 'Bon de commande lié' : 'Engagement lié'));
    } else {
      setLinkSelections(prev => prev.filter(s => !okKeys.has(linkItemKey(s))));
      showMsg('error', `Lien partiel — ${errors.length} échec(s) : ${errors.join(' ; ')}`);
    }
  };

  const unlinkLiaison = async (liaisonId: number) => {
    if (!linkModal) return;
    try {
      const res = await fetch(`/api/contrats/liaisons/${liaisonId}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error();
      await fetchContrats();
      showMsg('success', 'Lien commande retiré');
    } catch { showMsg('error', 'Erreur retrait du lien'); }
  };

  // Clés des commandes déjà liées au contrat (grisées dans les résultats)
  const alreadyLinkedKeys = new Set<string>();
  if (linkModal) {
    (linkModal.contrat.liaisons || []).forEach(l => {
      if (l.commande_type === 'bc') {
        if (l.commande_numero) alreadyLinkedKeys.add(`bc:${l.commande_numero}`);
        if (l.commande_sedit) alreadyLinkedKeys.add(`bc:${l.commande_sedit}`);
      } else if (l.commande_type === 'engagement') {
        if (l.engagement_code) alreadyLinkedKeys.add(`engagement:${l.engagement_code}`);
      }
    });
  }

  // ─── Colonnes ────────────────────────────────────────────────────────────────

  const toggleCol = (key: ColKey) => {
    setVisibleCols(prev => { const s = new Set(prev); if (s.has(key)) { if (s.size > 1) s.delete(key); } else s.add(key); return s; });
    setActiveView(null);
  };
  const showAllCols = () => { setVisibleCols(new Set(COLS.map(c => c.key))); setActiveView(null); };
  const resetCols = () => { setVisibleCols(new Set(COLS.filter(c => c.defaultVisible !== false).map(c => c.key))); setActiveView(null); };
  const saveColPreferences = () => {
    localStorage.setItem('columnPreferences', JSON.stringify(Array.from(visibleCols)));
    showMsg('success', 'Configuration des colonnes enregistrée');
  };

  // ─── Vues de colonnes partagées ("général") ──────────────────────────────────

  const fetchViews = async () => {
    try {
      const res = await fetch('/api/contrats/views', { headers: authHeaders() });
      if (res.ok) setSavedViews(await res.json());
    } catch { }
  };

  const saveCurrentView = async () => {
    const name = viewName.trim();
    if (!name) { showMsg('error', 'Nom de vue requis'); return; }
    try {
      const res = await fetch('/api/contrats/views', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: name, columns: Array.from(visibleCols) })
      });
      if (res.ok) {
        const view = await res.json();
        showMsg('success', `Vue « ${name} » enregistrée (partagée)`);
        setActiveView({ id: view.id, nom: name });
        setViewName('');
        fetchViews();
      } else {
        const d = await res.json().catch(() => null);
        showMsg('error', d?.message || 'Erreur enregistrement vue');
      }
    } catch { showMsg('error', 'Erreur enregistrement vue'); }
  };

  const loadView = (v: { id: number; nom: string; columns: ColKey[] }) => {
    const valid = v.columns.filter((k): k is ColKey => COLS.some(c => c.key === k));
    setVisibleCols(new Set(valid));
    setActiveView({ id: v.id, nom: v.nom });
    setShowViewsPanel(false);
    showMsg('success', `Vue « ${v.nom} » chargée`);
  };

  const deleteView = async (id: number, nom: string) => {
    if (!window.confirm(`Supprimer la vue partagée « ${nom} » ?`)) return;
    try {
      const res = await fetch(`/api/contrats/views/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (res.ok) {
        setSavedViews(prev => prev.filter(v => v.id !== id));
        if (activeView?.id === id) setActiveView(null);
        showMsg('success', 'Vue supprimée');
      }
    } catch { showMsg('error', 'Erreur suppression vue'); }
  };

  // ─── Helpers UI ──────────────────────────────────────────────────────────────

  const rowBg = (c: Contrat, i: number) => {
    if (c.liaisons && c.liaisons.length > 0) return i % 2 === 0 ? '#f0fdf4' : '#dcfce7';
    if (c.montant_2026 != null && Number(c.montant_2026) === 0) return i % 2 === 0 ? '#f0fdf4' : '#dcfce7';
    if (c.statut === 'archivé') return i % 2 === 0 ? '#f3f4f6' : '#e5e7eb';
    if (isExpired(contractEndDate(c))) return i % 2 === 0 ? '#fff0f0' : '#fde8e8';
    if (isExpiringSoon(contractEndDate(c))) return i % 2 === 0 ? '#fffbeb' : '#fef3c7';
    return i % 2 === 0 ? '#ffffff' : '#f9fafb';
  };

  const daysBadge = (c: Contrat) => {
    if (isNew(c.created_at)) return <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 700 }}>🆕 NEW</span>;
    const d = daysUntil(contractEndDate(c));
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
    const calculated = calculateDateFin(c.date_debut, c.duree_annees);
    return calculated === c.date_fin && c.date_fin !== null;
  };

  const renderCellValue = (c: Contrat, col: ColDef): React.ReactNode => {
    const v = c[col.key];
    switch (col.key) {
      case 'svc': return <b style={{ color: '#374151' }}>{c.svc || '—'}</b>;
      case 'objet': {
        const verifBadge = c.dates_verifiees ? (
          <span title="Dates vérifiées" style={{ background: '#dcfce7', color: '#15803d', borderRadius: 9999, width: 15, height: 15, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0, marginRight: 4 }}>
            V
          </span>
        ) : null;
        return (
          <span title={c.objet} style={{ display: 'flex', alignItems: 'center', maxWidth: col.w - 16, overflow: 'hidden' }}>
            {verifBadge}
            <b style={{ color: '#1e3a5f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.objet || '—'}</b>
          </span>
        );
      }
      case 'type_contrat': return c.type_contrat ? <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '1px 6px', borderRadius: 9999, fontSize: 10, fontWeight: 600 }}>{c.type_contrat}</span> : <span style={{ color: '#9ca3af' }}>—</span>;
      case 'date_debut': return fmtDate(c.date_debut);
      case 'date_fin': return <span style={{ fontStyle: isDateFinCalculated(c) ? 'italic' : 'normal', fontWeight: isDateFinCalculated(c) ? 600 : 400, color: isDateFinCalculated(c) ? '#10b981' : 'inherit' }}>{fmtDate(c.date_fin)}</span>;
      case 'date_fin_cours': return c.date_fin_cours ? fmtDate(c.date_fin_cours) : <span style={{ color: '#9ca3af' }}>—</span>;
      case 'date_fin_maxi': return c.date_fin_maxi ? fmtDate(c.date_fin_maxi) : <span style={{ color: '#9ca3af' }}>—</span>;
      case 'dates_verifiees':
        return c.dates_verifiees ? (
          <span style={{ background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: 9999, fontSize: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Check size={11} /> Contrat vérifié
          </span>
        ) : (
          <span style={{ background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: 9999, fontSize: 10, fontWeight: 600 }}>À vérifier</span>
        );
      case 'reconduction': return c.reconduction ? <span style={{ background: '#f0fdf4', color: '#15803d', padding: '1px 6px', borderRadius: 9999, fontSize: 10, fontWeight: 600 }}>{reconductionLabel(c.reconduction)}</span> : <span style={{ color: '#9ca3af' }}>—</span>;
      case 'montant_2022': return <span style={{ color: '#6b7280' }}>{fmt(c.montant_2022)}</span>;
      case 'montant_2023': return <span style={{ color: '#6b7280' }}>{fmt(c.montant_2023)}</span>;
      case 'montant_2024': return <span style={{ color: '#6b7280' }}>{fmt(c.montant_2024)}</span>;
      case 'montant_2025': return <span style={{ color: '#6b7280' }}>{fmt(c.montant_2025)}</span>;
      case 'montant_2026': {
        const trend = trend2026(c);
        return (
          <span style={{ fontWeight: 600, color: '#1e3a5f', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {fmt(c.montant_2026)}
            {trend && <span title={trend.title} style={{ display: 'inline-flex' }}><trend.Icon size={13} color={trend.color} /></span>}
          </span>
        );
      }
      case 'prevision_2026': return fmt(c.prevision_2026);
      case 'prevision_2027': return fmt(c.prevision_2027);
      case 'prevision_2028': return fmt(c.prevision_2028);
      case 'prevision_2029': return fmt(c.prevision_2029);
      case 'duree_annees': return v != null ? `${v}a` : '—';
      case 'budget': {
        if (!c.budget) return <span style={{ color: '#9ca3af' }}>—</span>;
        const palette: Record<string, [string, string]> = {
          '1': ['#ede9fe', '#6d28d9'], '3': ['#dbeafe', '#1d4ed8'], '8': ['#dcfce7', '#15803d'], 'CYB': ['#fee2e2', '#b91c1c'],
        };
        const [bg, col] = palette[c.budget.toUpperCase()] ?? ['#f3f4f6', '#374151'];
        return <span title={`Budget ${c.budget}`} style={{ background: bg, color: col, padding: '1px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 700 }}>{c.budget}</span>;
      }
      case 'renouvellement_statut':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {renewBadge(c)}
            {c.nb_reconductions ? (
              <span title={`Renouvellement en cours : ${c.renouvellement_actuel ?? 0}/${c.nb_reconductions}`} style={{ background: '#e0e7ff', color: '#4338ca', padding: '1px 6px', borderRadius: 9999, fontSize: 10, fontWeight: 600 }}>R{c.renouvellement_actuel ?? 0}/{c.nb_reconductions}</span>
            ) : null}
          </span>
        );
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
      case 'commande_numero': {
        const liaisons = c.liaisons || [];
        if (liaisons.length === 0) return <span style={{ color: '#9ca3af' }}>—</span>;
        if (liaisons.length === 1) {
          const l = liaisons[0];
          const isBc = l.commande_type === 'bc';
          const numero = isBc ? (l.commande_numero || 'BC') : (l.engagement_code || 'Engt');
          const libelle = isBc ? (l.commande_libelle || '') : (l.engagement_libelle || '');
          const seditOk = isBc && l.commande_sedit && linkSeditUrl;
          return (
            <span
              title={libelle || (isBc ? 'Bon de commande Sedit lié' : 'Engagement budgétaire lié')}
              onClick={() => seditOk
                ? window.open(`${linkSeditUrl}/FicheCommande.html?commandeId=${l.commande_sedit}`, '_blank')
                : setLinkListModal({ contrat: c })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: isBc ? '#dbeafe' : '#f5f3ff', color: isBc ? '#1d4ed8' : '#6d28d9', border: isBc ? '1px solid #93c5fd' : '1px solid #ddd6fe', borderRadius: 9999, padding: '3px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', maxWidth: col.w - 16 }}
            >
              {isBc ? <FileCheck2 size={12} /> : <Link2 size={12} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{numero}</span>
              {seditOk && <ExternalLink size={10} style={{ flexShrink: 0 }} />}
            </span>
          );
        }
        return (
          <button
            onClick={() => setLinkListModal({ contrat: c })}
            title={`Lister les ${liaisons.length} commande${liaisons.length > 1 ? 's' : ''} liée${liaisons.length > 1 ? 's' : ''}`}
            style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
          >
            <Link2 size={11} /> {liaisons.length} commande{liaisons.length > 1 ? 's' : ''}
          </button>
        );
      }
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
        <button
          onClick={() => setEngagedFilter(engagedFilter === null ? 'engaged' : engagedFilter === 'engaged' ? 'not_engaged' : null)}
          title="Filtre sur l'engagement 2026 (montant 2026 renseigné, y compris à 0)"
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 11,
            background: engagedFilter === 'engaged' ? '#dcfce7' : engagedFilter === 'not_engaged' ? '#fee2e2' : '#f3f4f6',
            color: engagedFilter === 'engaged' ? '#16a34a' : engagedFilter === 'not_engaged' ? '#dc2626' : '#374151',
          }}>
          <Check size={12} />
          {engagedFilter === 'engaged' ? 'Engagés 2026' : engagedFilter === 'not_engaged' ? 'Non engagés 2026' : 'Engagement 2026'}
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

        {/* Toggle contrat vérifié */}
        <button onClick={() => toggleCol('dates_verifiees')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: visibleCols.has('dates_verifiees') ? '#dcfce7' : '#f3f4f6', color: visibleCols.has('dates_verifiees') ? '#15803d' : '#374151' }}>
          <Check size={12} /> Contrat vérifié
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

        {/* Vues de colonnes partagées */}
        <div style={{ position: 'relative' }} ref={viewsPanelRef}>
          <button onClick={() => setShowViewsPanel(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: showViewsPanel ? '#fef3c7' : '#f3f4f6', color: showViewsPanel ? '#b45309' : '#374151' }}>
            <Bookmark size={12} /> Vues ({savedViews.length})
          </button>
          {activeView && (
            <span style={{ marginLeft: 4, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fef3c7', color: '#b45309', borderRadius: 9999, padding: '2px 8px', fontSize: 10, fontWeight: 600, verticalAlign: 'middle' }}>
              {activeView.nom}
              <button onClick={() => setActiveView(null)} title="Revenir aux colonnes manuelles" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', padding: 0, display: 'inline-flex' }}><CloseIcon size={10} /></button>
            </span>
          )}
          {showViewsPanel && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', padding: 12, minWidth: 260, maxHeight: 420, overflowY: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1e3a5f', marginBottom: 8 }}>Vues de colonnes (partagées)</div>
              {savedViews.length === 0 ? (
                <div style={{ fontSize: 11, color: '#9ca3af', padding: '4px 0 8px' }}>Aucune vue enregistrée.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {savedViews.map(v => (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={() => loadView(v)} style={{ flex: 1, textAlign: 'left', padding: '5px 8px', borderRadius: 5, border: activeView?.id === v.id ? '1px solid #f59e0b' : '1px solid #e5e7eb', background: activeView?.id === v.id ? '#fffbeb' : '#fff', cursor: 'pointer', fontSize: 12, fontWeight: activeView?.id === v.id ? 600 : 400, color: '#1f2937' }}>
                        {v.nom}
                      </button>
                      <button onClick={() => deleteView(v.id, v.nom)} title="Supprimer la vue" style={{ padding: '3px', borderRadius: 4, border: '1px solid #fee2e2', background: '#fff', cursor: 'pointer', color: '#dc2626', display: 'inline-flex' }}><Trash2 size={11} /></button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                <div style={{ display: 'flex', gap: 5 }}>
                  <input
                    type="text"
                    value={viewName}
                    onChange={e => setViewName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveCurrentView(); }}
                    placeholder="Nom de la vue…"
                    style={{ flex: 1, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }}
                  />
                  <button onClick={saveCurrentView} title="Enregistrer les colonnes actuellement visibles sous ce nom" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 5, border: 'none', background: '#f59e0b', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    <Save size={11} /> Enregistrer
                  </button>
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>Partagée par tous — enregistre les colonnes actuellement visibles.</div>
              </div>
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
        <button onClick={handleExportExcel} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#0d9488', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
          <Download size={12} /> Export Excel
        </button>
        <button onClick={() => setShowPrevisionModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
          <TrendingUp size={12} /> Prévision
        </button>
      </div>

      {showPrevisionModal && (
        <PrevisionModal contrats={contrats} onClose={() => setShowPrevisionModal(false)} />
      )}

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
                  {col?.type === 'date' ? (
                    <DateField value={(newContrat[key] ?? '') as string | null} onChange={v => setNewContrat({ ...newContrat, [key]: v ?? '' })} style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, boxSizing: 'border-box' }} />
                  ) : (
                    <input type="text" value={(newContrat[key] ?? '') as string}
                      onChange={e => setNewContrat({ ...newContrat, [key]: e.target.value })}
                      style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, boxSizing: 'border-box' }} />
                  )}
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
          <div style={{ overflow: 'scroll', flex: 1 }}>
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
                  <th onClick={() => handleSort('ech')} style={{ padding: '7px 8px', background: '#1e3a5f', color: '#fff', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap', width: 60, cursor: 'pointer', userSelect: 'none' }}>Éch.<SI k="ech" /></th>
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
                {paged.map((c, i) => {
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
                          <div style={{ width: 22, flexShrink: 0, display: 'flex' }}>
                            {((c.docs_count ?? 0) > 0 || c.doc_principal_path) && btnAction('Voir les documents', '#f3e8ff', '#7c3aed', <Paperclip size={12} />, () => openDocViewModal(c))}
                          </div>
                          {btnAction('Éditer', '#eff6ff', '#1d4ed8', <Edit2 size={12} />, () => openEditModal(c))}
                          {btnAction(c.liaisons && c.liaisons.length ? 'Gérer les liens commande / engagement' : 'Lier un bon de commande / engagement', '#dcfce7', '#15803d', <Link2 size={12} />, () => openLinkModal(c))}
                          {btnAction('Renouveler', '#fff7ed', '#c2410c', <RefreshCcw size={12} />, () => openRenewModal(c))}
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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '6px 20px 8px', color: '#6b7280', fontSize: 11, flexShrink: 0, flexWrap: 'wrap' }}>
        <select value={String(pageSize)} onChange={e => setPageSize(Number(e.target.value))} title="Lignes par page" style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', fontSize: 11, cursor: 'pointer' }}>
          <option value="20">20 / page</option>
          <option value="50">50 / page</option>
          <option value="100">100 / page</option>
          <option value="0">Tous</option>
        </select>
        <span>{sorted.length === 0 ? 'Aucun contrat' : `${pageSize > 0 ? (safePage - 1) * pageSize + 1 : 1}–${pageSize > 0 ? Math.min(safePage * pageSize, sorted.length) : sorted.length} / ${sorted.length} contrat${sorted.length !== 1 ? 's' : ''}`} · {activeCols.length} colonne{activeCols.length !== 1 ? 's' : ''}</span>
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} style={{ padding: '3px 9px', borderRadius: 4, border: '1px solid #d1d5db', background: safePage <= 1 ? '#f3f4f6' : '#fff', color: safePage <= 1 ? '#9ca3af' : '#374151', cursor: safePage <= 1 ? 'default' : 'pointer', fontSize: 11 }}>← Préc.</button>
        <span>Page <b>{safePage}</b> / {totalPages}</span>
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} style={{ padding: '3px 9px', borderRadius: 4, border: '1px solid #d1d5db', background: safePage >= totalPages ? '#f3f4f6' : '#fff', color: safePage >= totalPages ? '#9ca3af' : '#374151', cursor: safePage >= totalPages ? 'default' : 'pointer', fontSize: 11 }}>Suiv. →</button>
      </div>

      {/* ── Modale : Édition contrat ──────────────────────────────────────────── */}
      {editModalData && (() => {
        const mf = (label: string, field: keyof Contrat, type = 'text') => {
          const raw = editModalData[field] ?? '';
          const val = type === 'date' && typeof raw === 'string' ? (raw ? toLocalDateStr(raw) : '') : String(raw);
          return (
            <div key={field}>
              <label style={{ fontSize: 10, color: '#6b7280', display: 'block', marginBottom: 2 }}>{label}</label>
              {type === 'date' ? (
                <DateField
                  value={typeof raw === 'string' ? (raw || null) : null}
                  onChange={v => setEditModalData(p => p ? { ...p, [field]: v } : p)}
                  style={{ width: '100%', padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }}
                />
              ) : (
                <input
                  type={type}
                  value={val}
                  onChange={e => setEditModalData(p => p ? { ...p, [field]: e.target.value } : p)}
                  style={{ width: '100%', padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }}
                />
              )}
            </div>
          );
        };
        const sectionTitle = (title: string, color = '#1e3a5f') => (
          <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8, marginTop: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>
            {title}
          </div>
        );
        const inputStyle: React.CSSProperties = { width: '100%', padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' };
        const labelStyle: React.CSSProperties = { fontSize: 10, color: '#6b7280', display: 'block', marginBottom: 2 };

        // Valeurs existantes de "Type" normalisées en casse "Xxxxxx", pour la liste déroulante.
        const normalizeCase = (s: string) => {
          const t = s.trim();
          return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '';
        };
        const typeOptions = Array.from(new Set(
          contrats.map(c => c.type_contrat).filter(Boolean).map(t => normalizeCase(t as string))
        )).sort((a, b) => a.localeCompare(b, 'fr'));
        const currentTypeNorm = editModalData.type_contrat ? normalizeCase(editModalData.type_contrat) : '';
        if (currentTypeNorm && !typeOptions.includes(currentTypeNorm)) typeOptions.push(currentTypeNorm);

        // Niveaux de service (GTI / GTR) : liste structurée { durée en heures, type de service }.
        const slaNiveaux = editModalData.sla_niveaux || [];
        const addSla = (categorie: 'GTI' | 'GTR') => {
          setEditModalData(p => p ? { ...p, sla_niveaux: [...(p.sla_niveaux || []), { categorie, duree_heures: null, type_service: '' }] } : p);
        };
        const updateSla = (idx: number, patch: Partial<SlaNiveau>) => {
          setEditModalData(p => {
            if (!p) return p;
            const list = [...(p.sla_niveaux || [])];
            list[idx] = { ...list[idx], ...patch };
            return { ...p, sla_niveaux: list };
          });
        };
        const removeSla = (idx: number) => {
          setEditModalData(p => {
            if (!p) return p;
            const list = [...(p.sla_niveaux || [])];
            list.splice(idx, 1);
            return { ...p, sla_niveaux: list };
          });
        };
        const slaColumn = (categorie: 'GTI' | 'GTR', color: string) => (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color }}>{categorie}</span>
              <button type="button" onClick={() => addSla(categorie)} title={`Ajouter un niveau ${categorie}`}
                style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 5, border: `1px solid ${color}`, background: '#fff', color, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                <Plus size={11} /> Ajouter
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {slaNiveaux.map((n, i) => ({ n, i })).filter(({ n }) => n.categorie === categorie).map(({ n, i }) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: 6, alignItems: 'center' }}>
                  <input
                    type="number" min={0} placeholder="h" value={n.duree_heures ?? ''}
                    onChange={e => updateSla(i, { duree_heures: e.target.value ? parseFloat(e.target.value) : null })}
                    title="Durée en heures"
                    style={{ ...inputStyle, textAlign: 'center' }}
                  />
                  <input
                    type="text" list="sla-type-options" placeholder="Type de service (ex: incident bloquant)"
                    value={n.type_service} onChange={e => updateSla(i, { type_service: e.target.value })}
                    style={inputStyle}
                  />
                  <button type="button" onClick={() => removeSla(i)} title="Supprimer"
                    style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 4, padding: '5px 6px', cursor: 'pointer' }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              {slaNiveaux.filter(n => n.categorie === categorie).length === 0 && (
                <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>Aucun niveau {categorie}.</p>
              )}
            </div>
          </div>
        );

        return (
          <Overlay onClose={() => { setEditModal(null); setEditModalData(null); setAppsSearch(''); }} maxWidth={900}>
            <datalist id="sla-type-options">
              <option value="Incident bloquant" />
              <option value="Incident urgent" />
              <option value="Incident normal" />
              <option value="Anomalie mineure" />
              <option value="Demande" />
            </datalist>
            <ModalHeader title={editModal ? `Éditer — ${editModal.objet || 'contrat'}${isNew(editModal.created_at) ? ' 🆕' : ''}` : 'Nouveau contrat'} onClose={() => { setEditModal(null); setEditModalData(null); setAppsSearch(''); }} />

            {linkedContracts?.previous && (
              <div style={{ marginBottom: 12, padding: 10, background: '#f0fdf4', borderRadius: 6, border: '1px solid #dcfce7' }}>
                <button onClick={() => { setEditModal(linkedContracts.previous); setEditModalData({ ...linkedContracts.previous! }); getLinkedContracts(linkedContracts.previous!); }} style={{ fontSize: 11, color: '#15803d', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                  ← Contrat renouvelé: {linkedContracts.previous.objet}
                </button>
              </div>
            )}

            {sectionTitle('1 — Identification')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <div key="svc">
                <label style={labelStyle}>SVC (service DSI)</label>
                <select
                  value={String(editModalData.svc ?? '')}
                  onChange={e => setEditModalData(p => p ? { ...p, svc: e.target.value } : p)}
                  style={inputStyle}
                >
                  <option value="">— Sélectionner —</option>
                  <option value="BF1">BF1</option>
                  <option value="BF6">BF6</option>
                  <option value="BF8">BF8</option>
                  <option value="BF9">BF9</option>
                </select>
              </div>
              {mf('Nom', 'objet')}
              {mf('Éditeur / Fabricant', 'raison_sociale')}
              <div key="type_bien">
                <label style={labelStyle}>Type de bien</label>
                <select
                  value={String(editModalData.type_bien ?? 'logiciel')}
                  onChange={e => setEditModalData(p => p ? { ...p, type_bien: e.target.value } : p)}
                  style={inputStyle}
                >
                  <option value="logiciel">Logiciel</option>
                  <option value="materiel">Matériel</option>
                </select>
              </div>
              <div key="type_contrat">
                <label style={labelStyle}>Type</label>
                <select
                  value={currentTypeNorm}
                  onChange={e => setEditModalData(p => p ? { ...p, type_contrat: e.target.value } : p)}
                  style={inputStyle}
                >
                  <option value="">— Sélectionner —</option>
                  {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {mf('Périmètre', 'perimetre')}
              <div key="app_id" style={{ position: 'relative' }}>
                <label style={labelStyle}>Application (magasin d'applications)</label>
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
                  style={inputStyle}
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
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>
              Le tiers sera déterminé automatiquement lors de l'association d'une commande.
            </p>

            {sectionTitle('Bénéficiaires')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {mf('Direction', 'direction')}
              {mf('Service', 'service')}
            </div>

            {sectionTitle('2 — Contenu du contrat')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {mf('Numéro', 'numero')}
              {mf('Date de début', 'date_debut', 'date')}
              <div key="date_fin">
                <label style={labelStyle}>Date de fin initiale {calculatedDateFin && <span style={{ fontSize: 9, fontStyle: 'italic', color: '#10b981' }}>(calculée)</span>}</label>
                <DateField
                  value={editModalData.date_fin ?? null}
                  onChange={v => setEditModalData(p => p ? { ...p, date_fin: v } : p)}
                  style={{ ...inputStyle, fontStyle: calculatedDateFin ? 'italic' : 'normal', fontWeight: calculatedDateFin ? 600 : 400, color: calculatedDateFin ? '#10b981' : '#1f2937' }}
                />
              </div>
              {mf('Durée (années)', 'duree_annees', 'number')}
              <div key="nb_reconductions">
                <label style={{ ...labelStyle, color: editModalData.reconduction === 'sans' ? '#d1d5db' : '#6b7280' }}>Nb reconductions</label>
                <input
                  type="number"
                  value={String(editModalData.nb_reconductions ?? '')}
                  onChange={e => setEditModalData(p => p ? { ...p, nb_reconductions: e.target.value ? parseInt(e.target.value) : null } : p)}
                  disabled={editModalData.reconduction === 'sans'}
                  style={{ ...inputStyle, background: editModalData.reconduction === 'sans' ? '#f3f4f6' : '#fff', color: editModalData.reconduction === 'sans' ? '#d1d5db' : '#1f2937', cursor: editModalData.reconduction === 'sans' ? 'not-allowed' : 'text' }}
                />
              </div>
              <div key="reconduction">
                <label style={labelStyle}>Type de reconduction</label>
                <select
                  value={String(editModalData.reconduction ?? '')}
                  onChange={e => {
                    const newRecond = e.target.value;
                    setEditModalData(p => p ? { ...p, reconduction: newRecond, nb_reconductions: newRecond === 'sans' ? 0 : p.nb_reconductions } : p);
                  }}
                  style={inputStyle}
                >
                  <option value="">— Sélectionner —</option>
                  <option value="express">Express</option>
                  <option value="tacite">Tacite</option>
                  <option value="sans">Sans reconduction</option>
                </select>
              </div>
              <div key="renouvellement_actuel">
                <label style={{ ...labelStyle, color: editModalData.reconduction === 'sans' || !editModalData.nb_reconductions ? '#d1d5db' : '#6b7280' }}>Renouvellement en cours</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type="number"
                    min={0}
                    max={editModalData.nb_reconductions ?? 0}
                    value={String(editModalData.renouvellement_actuel ?? 0)}
                    onChange={e => {
                      const v = e.target.value ? parseInt(e.target.value) : 0;
                      setEditModalData(p => p ? { ...p, renouvellement_actuel: Math.max(0, Math.min(v, p.nb_reconductions ?? v)) } : p);
                    }}
                    disabled={editModalData.reconduction === 'sans'}
                    style={{ ...inputStyle, background: editModalData.reconduction === 'sans' ? '#f3f4f6' : '#fff', color: editModalData.reconduction === 'sans' ? '#d1d5db' : '#1f2937', cursor: editModalData.reconduction === 'sans' ? 'not-allowed' : 'text' }}
                  />
                  <button
                    type="button"
                    onClick={() => setEditModalData(p => p ? { ...p, renouvellement_actuel: suggestRenouvellement(p.date_fin ?? null, p.duree_annees ?? null, p.nb_reconductions ?? null) } : p)}
                    title="Suggérer automatiquement selon la date du jour"
                    style={{ flexShrink: 0, padding: '5px 8px', borderRadius: 5, border: '1px solid #d1d5db', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                  >
                    Auto
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                const calculated = calculateDateFin(editModalData.date_debut ?? null, editModalData.duree_annees ?? null);
                if (calculated) {
                  setEditModalData(p => p ? { ...p, date_fin: calculated } : p);
                  setCalculatedDateFin(true);
                  showMsg('success', `Date calculée : ${calculated}`);
                } else {
                  showMsg('error', 'Remplir : Date début + Durée');
                }
              }}
              style={{ marginTop: 8, padding: '5px 12px', borderRadius: 5, border: '1px solid #d1d5db', background: '#f0fdf4', color: '#15803d', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
            >
              📅 Calculer date de fin (période initiale)
            </button>

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 12px', marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>
                Dates de fin du contrat
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 12 }}>
                <div>
                  <label style={{ color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 2 }}>Fin 1re période</label>
                  <div style={{ fontWeight: 600, color: '#1f2937' }}>{fmtDate(editModalData.date_fin ?? null)}</div>
                </div>
                <div>
                  <label style={{ color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 2 }}>Renouvellement actuel</label>
                  <div style={{ fontWeight: 600, color: '#1f2937' }}>
                    {editModalData.renouvellement_actuel ? `${editModalData.renouvellement_actuel}${editModalData.renouvellement_actuel === 1 ? 're' : 'e'} reconduction` : 'Période initiale'}
                  </div>
                </div>
                <div>
                  <label style={{ color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 2 }}>Fin contrat en cours</label>
                  <div style={{ fontWeight: 600, color: '#1d4ed8' }}>{fmtDate(computeFinContrat(editModalData).finCours)}</div>
                </div>
                <div>
                  <label style={{ color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 2 }}>Fin maxi du contrat</label>
                  <div style={{ fontWeight: 600, color: '#b45309' }}>{fmtDate(computeFinContrat(editModalData).finMax)}</div>
                </div>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!editModalData.dates_verifiees} onChange={e => setEditModalData(p => p ? { ...p, dates_verifiees: e.target.checked ? 1 : 0 } : p)} style={{ width: 15, height: 15 }} />
              <span style={{ fontWeight: 600, color: '#1f2937' }}>Contrat vérifié</span>
              <span style={{ color: '#9ca3af', fontSize: 11 }}>— les informations du contrat (dates, montants, niveaux de service...) ont été contrôlées</span>
            </label>

            {/* Niveaux de service */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 10 }}>
                Niveaux de service
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                {slaColumn('GTI', '#b45309')}
                {slaColumn('GTR', '#b45309')}
              </div>
              <div style={{ marginTop: 10 }}>
                {mf('Pénalité', 'penalite')}
              </div>
            </div>

            {sectionTitle('Informations financières')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {mf('Nature', 'nature')}
              {mf('Fonction', 'fonction')}
              {mf('Budget', 'budget')}
              {mf('Année initiale', 'annee_initiale', 'number')}
              {mf('Indice de révision', 'indice_revision')}
              {mf('Formule de révision', 'formule_revision')}
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, marginBottom: 4 }}>Historique</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {mf('2022', 'montant_2022', 'number')}
                {mf('2023', 'montant_2023', 'number')}
                {mf('2024', 'montant_2024', 'number')}
                {mf('2025', 'montant_2025', 'number')}
                {mf('2026', 'montant_2026', 'number')}
              </div>
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, margin: '10px 0 4px' }}>
                Prévision {!editModalData.montant_2026 && '(année en cours + 3 ans)'}{editModalData.montant_2026 && '(3 prochaines années — 2026 déjà connu)'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {!editModalData.montant_2026 && mf('Prév. 2026', 'prevision_2026', 'number')}
                {mf('Prév. 2027', 'prevision_2027', 'number')}
                {mf('Prév. 2028', 'prevision_2028', 'number')}
                {mf('Prév. 2029', 'prevision_2029', 'number')}
              </div>
            </div>

            {sectionTitle('3 — Documents')}
            <div style={{ background: '#faf5ff', borderRadius: 6, padding: 10, border: '1px solid #e9d5ff' }}>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (!editModal?.id) {
                    showMsg('error', 'Enregistrez le contrat d\'abord');
                    return;
                  }
                  if (e.dataTransfer.files) uploadFilesToContrat(editModal.id, e.dataTransfer.files);
                }}
                onClick={() => editModal?.id && editDocFileRef.current?.click()}
                style={{
                  background: dragOver ? '#e0e7ff' : '#f3f4f6',
                  border: `2px dashed ${dragOver ? '#4f46e5' : '#d1d5db'}`,
                  borderRadius: 6,
                  padding: 12,
                  textAlign: 'center',
                  cursor: editModal?.id ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                  opacity: editModal?.id ? 1 : 0.6,
                }}
              >
                <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#1f2937' }}>
                  {docUploading ? '⏳ Upload en cours...' : '📎 Dépose des fichiers ici ou clique (stockés dans la GED)'}
                </p>
              </div>
              <input
                ref={editDocFileRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (editModal?.id && e.target.files) uploadFilesToContrat(editModal.id, e.target.files);
                  if (editDocFileRef.current) editDocFileRef.current.value = '';
                }}
              />
              {!editModal?.id && (
                <p style={{ margin: '8px 0 0', fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>Enregistrez le contrat pour joindre des documents.</p>
              )}

              {editModal?.id && (() => {
                const activeDocs = editModalDocs.filter(d => !d.archive);
                const archivedDocs = editModalDocs.filter(d => !!d.archive);
                const shown = showArchivedDocs ? archivedDocs : activeDocs;
                return (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>
                        {showArchivedDocs ? `Documents archivés (${archivedDocs.length})` : `Documents (${activeDocs.length})`}
                      </span>
                      {archivedDocs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowArchivedDocs(v => !v)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 5, border: '1px solid #d1d5db', background: showArchivedDocs ? '#7c3aed' : '#fff', color: showArchivedDocs ? '#fff' : '#7c3aed', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}
                        >
                          <Archive size={11} /> {showArchivedDocs ? 'Voir les documents actifs' : `Voir les archives (${archivedDocs.length})`}
                        </button>
                      )}
                    </div>
                    {shown.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                        {showArchivedDocs ? 'Aucun document archivé.' : 'Aucun document joint.'}
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {shown.map(doc => (
                          <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', background: '#fff', borderRadius: 5, border: '1px solid #e5e7eb' }}>
                            <FileText size={12} style={{ color: '#6b7280', flexShrink: 0 }} />
                            <button
                              onClick={() => setPdfModal({ path: doc.file_path, name: doc.file_name })}
                              style={{ flexGrow: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: '#1d4ed8', fontWeight: doc.est_principal ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                              {doc.file_name}
                            </button>
                            {doc.nature && <span style={{ fontSize: 9, color: '#6b7280', background: '#f3f4f6', padding: '1px 6px', borderRadius: 9999, flexShrink: 0 }}>{doc.nature}</span>}
                            {doc.est_principal === 1 && <span style={{ fontSize: 9, color: '#15803d', background: '#dcfce7', padding: '1px 6px', borderRadius: 9999, fontWeight: 700, flexShrink: 0 }}>Principal</span>}
                            <button
                              onClick={() => handleDocArchive(editModal.id, doc.id, !doc.archive)}
                              title={doc.archive ? 'Désarchiver' : 'Archiver'}
                              style={{ background: '#f3f4f6', color: '#6b7280', border: 'none', borderRadius: 4, padding: '3px 6px', cursor: 'pointer', flexShrink: 0 }}
                            >
                              <Archive size={11} />
                            </button>
                            <button
                              onClick={async () => {
                                await fetch(`/api/contrats/${editModal.id}/documents/${doc.id}`, { method: 'DELETE', headers: authHeaders() });
                                await fetchEditModalDocs(editModal.id);
                                await fetchContrats();
                              }}
                              title="Supprimer"
                              style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 4, padding: '3px 6px', cursor: 'pointer', flexShrink: 0 }}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
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
              <button onClick={() => { setEditModal(null); setEditModalData(null); setAppsSearch(''); }} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
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
              <DateField value={renewDate || null} onChange={v => setRenewDate(v || '')} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
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

      {/* ── Modale : Visualisation PDF ────────────────────────────────────────── */}
      {pdfModal && (
        <Overlay onClose={() => setPdfModal(null)} maxWidth={900}>
          <ModalHeader title={pdfModal.name} onClose={() => setPdfModal(null)} />
          <iframe
            src={docFileUrl(pdfModal.path)}
            style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 6 }}
            title={pdfModal.name}
          />
        </Overlay>
      )}

      {/* ── Modale : Lien commande / engagement ───────────────────────────────── */}
      {linkModal && (
        <Overlay onClose={() => setLinkModal(null)} maxWidth={860}>
          <ModalHeader title={`Lier commande / engagement — ${linkModal.contrat.objet}`} onClose={() => setLinkModal(null)} />
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button
              onClick={() => { setLinkTab('bc'); setLinkResults([]); setLinkSelections([]); setLinkAmount(''); }}
              style={{ padding: '6px 12px', borderRadius: 6, border: linkTab === 'bc' ? '1px solid #1d4ed8' : '1px solid #d1d5db', background: linkTab === 'bc' ? '#eff6ff' : '#fff', color: linkTab === 'bc' ? '#1d4ed8' : '#374151', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              Bon de commande Sedit
            </button>
            <button
              onClick={() => { setLinkTab('engagement'); setLinkResults([]); setLinkSelections([]); setLinkAmount(''); }}
              style={{ padding: '6px 12px', borderRadius: 6, border: linkTab === 'engagement' ? '1px solid #6d28d9' : '1px solid #d1d5db', background: linkTab === 'engagement' ? '#f5f3ff' : '#fff', color: linkTab === 'engagement' ? '#6d28d9' : '#374151', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              Engagement budgétaire
            </button>
          </div>

          {/* Liens actuels (plusieurs possibles) */}
          {(() => {
            const current = linkModal.contrat.liaisons || [];
            if (current.length === 0) return null;
            return (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#166534', marginBottom: 6 }}>
                  {current.length} lien{current.length > 1 ? 's' : ''} actuel{current.length > 1 ? 's' : ''} :
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {current.map(l => {
                    const isBc = l.commande_type === 'bc';
                    const chipBg = isBc ? '#dbeafe' : '#f5f3ff';
                    const chipFg = isBc ? '#1d4ed8' : '#6d28d9';
                    const chipBd = isBc ? '#93c5fd' : '#ddd6fe';
                    const chipTitle = isBc ? (l.commande_libelle || '') : (l.engagement_libelle || '');
                    const seditHref = isBc && l.commande_sedit && linkSeditUrl
                      ? `${linkSeditUrl}/FicheCommande.html?commandeId=${l.commande_sedit}`
                      : null;
                    return (
                      <span key={l.id} title={chipTitle} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: chipBg, color: chipFg, border: `1px solid ${chipBd}`, borderRadius: 9999, padding: '3px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {isBc ? <FileCheck2 size={12} /> : <Link2 size={12} />}
                        {seditHref
                          ? <a href={seditHref} target="_blank" rel="noopener noreferrer" title="Ouvrir dans Sedit" style={{ color: chipFg, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 3 }}>{isBc ? (l.commande_numero || 'BC') : (l.engagement_code || 'Engt')} <ExternalLink size={10} /></a>
                          : (isBc ? (l.commande_numero || 'BC') : (l.engagement_code || 'Engt'))}
                        <button title="Retirer ce lien" onClick={() => unlinkLiaison(l.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#b91c1c', display: 'inline-flex', padding: 0, marginLeft: 2 }}>
                          <CloseIcon size={11} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Filtres de recherche */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            <input placeholder="Recherche (n°, libellé)" value={linkQ} onChange={e => setLinkQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchLink()} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, flex: '1 1 180px' }} />
            <input placeholder="Tiers" value={linkTiers} onChange={e => setLinkTiers(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchLink()} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, flex: '1 1 140px' }} />
            <input placeholder="Montant min" value={linkMin} onChange={e => setLinkMin(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, width: 100 }} />
            <input placeholder="Montant max" value={linkMax} onChange={e => setLinkMax(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, width: 100 }} />
            <select value={linkYear} onChange={e => setLinkYear(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}>
              <option value="">Année</option>
              {(linkEngagementYears.length ? linkEngagementYears : [String(new Date().getFullYear())]).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={searchLink} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#1d4ed8', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Search size={13} /> Rechercher
            </button>
          </div>

          {/* Résultats */}
          <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 12 }}>
            {linkLoading
              ? <div style={{ padding: 20, textAlign: 'center', color: '#6b7280', fontSize: 13 }}><Loader2 size={18} className="spin" /> Recherche…</div>
              : linkResults.length === 0
                ? <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Aucun résultat — lancez une recherche</div>
                : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: 26 }}>
                          <input
                            type="checkbox"
                            title="Tout sélectionner"
                            checked={(() => {
                              const selectable = linkResults.filter(r => !alreadyLinkedKeys.has(linkItemKey(r)));
                              return selectable.length > 0 && selectable.every(r => linkSelections.some(s => linkItemKey(s) === linkItemKey(r)));
                            })()}
                            onChange={e => {
                              const selectable = linkResults.filter(r => !alreadyLinkedKeys.has(linkItemKey(r)));
                              setLinkSelections(prev => {
                                const next = e.target.checked
                                  ? Array.from(new Map(selectable.map(r => [linkItemKey(r), { ...r, type: linkTab }])).values())
                                  : prev.filter(s => !selectable.some(r => linkItemKey(r) === linkItemKey(s)));
                                const sum = next.reduce((acc, s) => acc + (linkItemAmount(s) || 0), 0);
                                setLinkAmount(sum > 0 ? String(Math.round(sum * 100) / 100) : '');
                                return next;
                              });
                            }}
                          />
                        </th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>N°</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Libellé</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Tiers</th>
                        {linkTab === 'engagement' && <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Année</th>}
                        <th style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkResults.map((r, i) => {
                        const num = linkTab === 'bc' ? (r.numero || r.sedit_id || '') : (r.code || '');
                        const lib = r.libelle || r.objet || '';
                        const montant = linkTab === 'bc' ? (r.montant_ttc != null ? r.montant_ttc : r.montant_ht) : (r.montant != null ? r.montant : r.solde);
                        const key = linkItemKey(r);
                        const selected = linkSelections.some(s => linkItemKey(s) === key);
                        const isLinked = alreadyLinkedKeys.has(key);
                        return (
                          <tr key={i} style={{ background: selected ? '#eff6ff' : i % 2 ? '#f9fafb' : '#fff', opacity: isLinked ? 0.5 : 1 }}>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={selected || isLinked}
                                disabled={isLinked}
                                title={isLinked ? 'Déjà lié à ce contrat' : 'Sélectionner'}
                                onChange={() => !isLinked && toggleLink(r)}
                              />
                            </td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {linkTab === 'bc' && r.sedit_id && linkSeditUrl
                                ? (
                                  <a
                                    href={`${linkSeditUrl}/FicheCommande.html?commandeId=${r.sedit_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={`Ouvrir le bon de commande ${num} dans Sedit`}
                                    style={{ color: '#1d4ed8', textDecoration: 'underline', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                  >
                                    {num} <ExternalLink size={11} />
                                  </a>
                                )
                                : num}
                              {isLinked && <span style={{ marginLeft: 5, color: '#15803d', fontSize: 10, fontWeight: 600 }}>✓ lié</span>}
                            </td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>{lib}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>{r.tiers_nom || r.tiers || ''}</td>
                            {linkTab === 'engagement' && <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>{r.annee || r.year || ''}</td>}
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', whiteSpace: 'nowrap' }}>{montant != null ? Number(montant).toLocaleString('fr-FR') : ''} €</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
            }
          </div>

          {/* Sélection multiple + montant 2026 */}
          {linkSelections.length > 0 && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>
                {linkSelections.length} commande{linkSelections.length > 1 ? 's' : ''} à lier :
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {linkSelections.map(s => {
                  const chipBg = linkTab === 'bc' ? '#dbeafe' : '#f5f3ff';
                  const chipFg = linkTab === 'bc' ? '#1d4ed8' : '#6d28d9';
                  const chipBd = linkTab === 'bc' ? '#93c5fd' : '#ddd6fe';
                  const seditHref = linkTab === 'bc' && s.sedit_id && linkSeditUrl
                    ? `${linkSeditUrl}/FicheCommande.html?commandeId=${s.sedit_id}`
                    : null;
                  return (
                    <span key={linkItemKey(s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: chipBg, color: chipFg, border: `1px solid ${chipBd}`, borderRadius: 9999, padding: '3px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {linkTab === 'bc' ? <FileCheck2 size={12} /> : <Link2 size={12} />}
                      {seditHref
                        ? <a href={seditHref} target="_blank" rel="noopener noreferrer" title="Ouvrir dans Sedit" style={{ color: chipFg, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 3 }}>{linkTab === 'engagement' ? s.code : (s.numero || s.sedit_id)} <ExternalLink size={10} /></a>
                        : (linkTab === 'engagement' ? s.code : (s.numero || s.sedit_id))}
                      <button title="Retirer de la sélection" onClick={() => toggleLink(s)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#b91c1c', display: 'inline-flex', padding: 0, marginLeft: 2 }}>
                        <CloseIcon size={11} />
                      </button>
                    </span>
                  );
                })}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151' }}>
                Montant engagé (année {linkYear || new Date().getFullYear()}) :
                <input value={linkAmount} onChange={e => setLinkAmount(e.target.value)} type="number" step="0.01" min="0" style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, width: 140 }} />
                €
                <span style={{ color: '#6b7280', fontWeight: 400 }}>(somme des commandes sélectionnées, modifiable)</span>
              </label>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setLinkModal(null)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
            <button
              onClick={confirmLink}
              disabled={linkSelections.length === 0}
              style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: linkSelections.length === 0 ? '#9ca3af' : '#15803d', color: '#fff', cursor: linkSelections.length === 0 ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Link2 size={13} /> Valider les liens ({linkSelections.length})
            </button>
          </div>
        </Overlay>
      )}

      {/* ── Modale : Liste des commandes liées ──────────────────────────────────── */}
      {linkListModal && (() => {
        const cur = linkListModal.contrat.liaisons || [];
        const fmtDate = (d: string) => {
          if (!d) return '—';
          const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (m) return `${m[3]}/${m[2]}/${m[1]}`;
          return String(d);
        };
        return (
          <Overlay onClose={() => setLinkListModal(null)} maxWidth={760}>
            <ModalHeader title={`Commandes liées — ${linkListModal.contrat.objet}`} onClose={() => setLinkListModal(null)} />
            {cur.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Aucune commande liée</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Type</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Date</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>N°</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Nom</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Lien Sedit</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {cur.map((l, i) => {
                    const isBc = l.commande_type === 'bc';
                    const badgeBg = isBc ? '#dbeafe' : '#f5f3ff';
                    const badgeFg = isBc ? '#1d4ed8' : '#6d28d9';
                    const badgeBd = isBc ? '#93c5fd' : '#ddd6fe';
                    const seditHref = isBc && l.commande_sedit && linkSeditUrl
                      ? `${linkSeditUrl}/FicheCommande.html?commandeId=${l.commande_sedit}`
                      : null;
                    return (
                      <tr key={l.id} style={{ background: i % 2 ? '#f9fafb' : '#fff' }}>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: badgeBg, color: badgeFg, border: `1px solid ${badgeBd}`, borderRadius: 9999, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {isBc ? <FileCheck2 size={11} /> : <Link2 size={11} />}
                            {isBc ? 'BC Sedit' : 'Engagement'}
                          </span>
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>{fmtDate(l.date_commande)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap', fontWeight: 600 }}>{isBc ? (l.commande_numero || 'BC') : (l.engagement_code || 'Engt')}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', maxWidth: 260 }}>{isBc ? (l.commande_libelle || '') : (l.engagement_libelle || '')}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>
                          {seditHref ? (
                            <a href={seditHref} target="_blank" rel="noopener noreferrer" title="Ouvrir dans Sedit" style={{ color: badgeFg, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              Ouvrir <ExternalLink size={11} />
                            </a>
                          ) : <span style={{ color: '#9ca3af' }}>—</span>}
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', whiteSpace: 'nowrap' }}>{l.commande_montant != null ? Number(l.commande_montant).toLocaleString('fr-FR') : ''} €</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setLinkListModal(null)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Fermer</button>
            </div>
          </Overlay>
        );
      })()}

      {/* ── Modale : Visualisation des Documents avec Navigation ────────────────── */}
      {docViewModal && (
        <Overlay onClose={() => setDocViewModal(null)} maxWidth={1250}>
          <ModalHeader title={`Documents — ${docViewModal.contrat.objet}`} onClose={() => setDocViewModal(null)} />
          <div style={{ display: 'flex', gap: 16, height: '70vh' }}>
            {/* Menu latéral gauche : liste des documents */}
            <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #e5e7eb', paddingRight: 16, overflowY: 'auto' }}>
              <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 600, color: '#374151' }}>Documents du contrat ({docViewModal.docs.length})</p>
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

            {/* Affichage du document */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
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
                src={docFileUrl(docViewModal.docs[docViewModal.currentIndex]?.file_path)}
                style={{ flex: 1, border: 'none', borderRadius: 6, background: '#f9fafb' }}
                title={docViewModal.docs[docViewModal.currentIndex]?.file_name}
              />
            </div>

            {/* Panneau droit : Infos */}
            <div style={{ width: 250, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e5e7eb', paddingLeft: 16, overflowY: 'auto' }}>
              {/* Informations du contrat */}
              <div>
                <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 600, color: '#374151' }}>Informations</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, fontSize: 11 }}>
                  <div>
                    <label style={{ color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>Date début</label>
                    <DateField value={docViewEditData?.date_debut ?? null} onChange={(v) => setDocViewEditData(d => d ? { ...d, date_debut: v } : null)} style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
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
                    <DateField value={docViewEditData?.date_fin ?? null} onChange={(v) => setDocViewEditData(d => d ? { ...d, date_fin: v } : null)} style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                  </div>
                  <div>
                    <label style={{ color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>Renouvellement en cours</label>
                    <input type="number" min={0} max={docViewEditData?.nb_reconductions ?? 0} value={String(docViewEditData?.renouvellement_actuel ?? 0)} onChange={(e) => setDocViewEditData(d => d ? { ...d, renouvellement_actuel: Math.max(0, Math.min(e.target.value ? parseInt(e.target.value) : 0, d.nb_reconductions ?? 0)) } : null)} style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                  </div>
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px', marginTop: 2 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>Dates de fin</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ color: '#6b7280' }}>1re période</span><b>{fmtDate(docViewEditData?.date_fin ?? null)}</b></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ color: '#6b7280' }}>En cours</span><b style={{ color: '#1d4ed8' }}>{fmtDate(computeFinContrat(docViewEditData ?? {}).finCours)}</b></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ color: '#6b7280' }}>Maxi</span><b style={{ color: '#b45309' }}>{fmtDate(computeFinContrat(docViewEditData ?? {}).finMax)}</b></div>
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!docViewEditData?.dates_verifiees} onChange={(e) => setDocViewEditData(d => d ? { ...d, dates_verifiees: e.target.checked ? 1 : 0 } : null)} style={{ width: 14, height: 14 }} />
                    <span style={{ fontWeight: 600, color: '#1f2937' }}>Contrat vérifié</span>
                  </label>
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
        .spin { animation: spin 1s linear infinite; }
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

