import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import MobiliteView from './parc/MobiliteView';
import LignesMobilesView from './parc/LignesMobilesView';
import AdView from './parc/AdView';
import EtiquetteView, { printLabelWindow } from './parc/EtiquetteView';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts';
import {
  Monitor, Laptop, Printer, HardDrive, Tablet, Projector, Phone, Search, X,
  RefreshCw, MapPin, User, Tag, Cpu, Activity, BarChart3, List,
  CheckCircle2, AlertTriangle, Layers, ChevronRight, Boxes,
  Euro, ShieldCheck, Clock, Truck, Database, FileText, Users, CalendarCheck2, CalendarDays,
  ArrowLeftRight, Rocket, Package, Timer, TrendingUp, Edit2, Eye, ZoomIn, ZoomOut,
  Download, ExternalLink, Image, Server, Signal,
} from 'lucide-react';

// ─── Constantes ─────────────────────────────────────────────────────────────
const TYPES = [
  { key: 'tous',          label: 'Tous',          icon: Boxes },
  { key: 'ordinateurs',   label: 'Ordinateurs',   icon: Laptop },
  { key: 'moniteurs',     label: 'Moniteurs',     icon: Monitor },
  { key: 'peripheriques', label: 'Périphériques', icon: HardDrive },
  { key: 'imprimantes',   label: 'Imprimantes',   icon: Printer },
  { key: 'telephones',    label: 'Téléphones et tablettes', icon: Phone },
];
const TYPE_ICON: Record<string, any> = { ...Object.fromEntries(TYPES.map(t => [t.key, t.icon])), tablettes: Tablet };
const COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#65a30d', '#0ea5e9', '#9333ea'];
const C = { blue: '#2563eb', slate: '#64748b', green: '#059669', amber: '#d97706', red: '#dc2626', bg: '#f1f5f9', card: '#fff', border: '#e2e8f0', text: '#0f172a' };

// ─── Déploiements : référentiel des directions (intitulés issus de l'organigramme RH) ──
const DIR_INFO: Record<string, string> = {
  DSI:   "Direction des Systèmes d'Information",
  DRH:   'Direction des Ressources Humaines',
  DSALE: 'Direction Scolaire, Accueils de Loisirs et Éducation',
  DCOM:  'Direction de la Communication',
  DAC:   'Direction de la Culture',
  DBC:   'Direction des Bâtiments Communaux',
  DAPF:  'Direction Actions et Prestations aux Familles',
  DSANTE:'Direction de la Santé',
  DEP:   'Direction des Espaces Publics',
  DDU:   'Direction du Développement Urbain',
  DCCAS: "Centre Communal d'Action Sociale (CCAS)",
  DAJCP: 'Direction des Affaires Juridiques et de la Commande Publique',
  DDS:   'Direction des Sports',
  DJEUN: 'Direction de la Jeunesse',
  DSF:   'Direction des Services Financiers',
  DDAC:  'Direction Démocratie et Action Citoyenne',
  DG:    'Direction Générale des Services',
  ELUS:  'Élus et Cabinet',
  CMS:   'Centre Médical de Santé',
};
// Regroupe les variantes (casse, orthographe, libellés longs) vers un code canonique.
const dirCanonical = (raw: string): string => {
  const u = (raw || '').trim().toUpperCase();
  if (!u) return '';
  if (u.includes('SECRET') || u === 'ELUS' || u === 'ELUES' || u === 'ELU') return 'ELUS';
  if (u.includes('GENERALE') || u === 'DG') return 'DG';
  if (u.includes('SPORT')) return 'DDS';
  if (u.includes('DDU')) return 'DDU';
  if (u === 'DOSTIC') return 'DSI'; // DOSTIC a fusionné dans la DSI
  const code = u.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z]/g, '');
  return code || u;
};
const dirLabel = (canon: string): string => DIR_INFO[canon] ? `${canon} — ${DIR_INFO[canon]}` : canon;

// Normalisation d'un nom de bénéficiaire (identique au backend) pour la clé de cache AD.
const normName = (v: string | null | undefined): string =>
  v ? String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() : '';

const EQUIP_OPTIONS: { key: string; label: string; icon: string }[] = [
  { key: 'pc_portable',  label: 'PC portable',          icon: '💻' },
  { key: 'pc_fixe',      label: 'PC fixe',              icon: '🖥' },
  { key: 'ecran',        label: 'Écran',                icon: '🖥' },
  { key: 'imprimante',   label: 'Imprimante / scanner', icon: '🖨' },
  { key: 'peripherique', label: 'Périphérique',         icon: '🖱' },
  { key: 'autre',        label: 'Autre / indéterminé',  icon: '📦' },
];
// Métadonnées d'affichage par code de catégorie (renvoyé par l'API : row.equip_cat)
const EQUIP_CAT_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pc_portable_ecran: { label: 'PC Port. + Écran', color: '#1d4ed8', bg: '#dbeafe', icon: '💻' },
  pc_fixe_ecran:     { label: 'PC Fixe + Écran',  color: '#1d4ed8', bg: '#dbeafe', icon: '🖥' },
  pc_imp:            { label: 'PC + Imprimante',  color: '#1d4ed8', bg: '#dbeafe', icon: '🖥' },
  pc_portable:       { label: 'PC Portable',      color: '#1d4ed8', bg: '#dbeafe', icon: '💻' },
  pc_fixe:           { label: 'PC Fixe',          color: '#1d4ed8', bg: '#dbeafe', icon: '🖥' },
  imprimante:        { label: 'Imprimante',       color: '#b45309', bg: '#fef3c7', icon: '🖨' },
  peripherique:      { label: 'Périphérique',     color: '#059669', bg: '#d1fae5', icon: '🖱' },
  ecran:             { label: 'Écran',            color: '#0891b2', bg: '#e0f2fe', icon: '🖥' },
  autre:             { label: '—',                color: '#94a3b8', bg: 'transparent', icon: '' },
};
// Ordre + couleurs distinctes pour la cadence empilée par catégorie d'équipement
const CADENCE_CATS: { key: string; label: string; color: string }[] = [
  { key: 'pc_portable',       label: 'PC portable',       color: '#2563eb' },
  { key: 'pc_portable_ecran', label: 'PC port. + écran',  color: '#60a5fa' },
  { key: 'pc_fixe',           label: 'PC fixe',           color: '#7c3aed' },
  { key: 'pc_fixe_ecran',     label: 'PC fixe + écran',   color: '#c084fc' },
  { key: 'pc_imp',            label: 'PC + imprimante',   color: '#db2777' },
  { key: 'ecran',             label: 'Écran',             color: '#0891b2' },
  { key: 'imprimante',        label: 'Imprimante',        color: '#d97706' },
  { key: 'peripherique',      label: 'Périphérique',      color: '#059669' },
  { key: 'autre',             label: 'Autre',             color: '#94a3b8' },
];

// ─── Types ──────────────────────────────────────────────────────────────────
interface Row {
  id: number; name: string | null; serial: string | null; otherserial: string | null;
  manufacturer: string | null; model: string | null; type: string | null;
  state: string | null; location: string | null; user: string | null;
  contact: string | null; contact_num: string | null; contact_email: string | null; doc_count: number;
  ad_found: boolean; itemtype_label: string | null; type_key: string | null;
  age_source: 'delivery' | 'buy_date' | null;
  group: string | null; user_tech: string | null; date_mod: string | null;
  network: string | null; uuid: string | null; supplier: string | null;
  value: number | null; buy_date: string | null; delivery_date: string | null; reception_date: string | null; service_date: string | null;
  age_years: number | null;
  os: string | null; os_version: string | null;
  ad_last_seen: string | null; ad_last_user: string | null;
}
interface AdUser { username: string; displayName: string; email: string; service: string }
interface AdModal { row: Row; query: string; results: AdUser[] | null; loading: boolean; selected: AdUser | null; applying: boolean }
interface UsagerRow { contact: string; ad_found: boolean; count: number; by_type: Record<string, number> }
interface Count { label: string; count: number }
interface Kpis {
  totalAll: number;
  valeurParc: number;
  byType: { key: string; label: string; count: number; value: number }[];
  ordinateurs: {
    total: number; affectes: number; nonAffectes: number; tauxAffectation: number; valeur: number;
    qualite: { tauxSerie: number; tauxInventaire: number; tauxLieu: number; sansSerie: number; sansInventaire: number; sansLieu: number; sansMiseEnService: number; doublonsSerie: number };
    miseEnService: { connue: number; inconnue: number; tauxConnue: number };
    age: { moyen: number | null; aRenouveler: number; tauxRenouveler: number; tranches: Count[] };
    parStatut: Count[];
    parGroupe: Count[];
    parLieu: Count[];
    parFabricant: Count[];
    parModele: Count[];
    parFournisseur: Count[];
    parOs: Count[];
    ajoutsParAnnee: { annee: string; count: number }[];
    deploiementsParAnnee?: { annee: string; count: number }[];
    ajoutsParMois?: { mois: string; count: number }[];
    deploiementsParMois?: { mois: string; count: number }[];
  };
  ratios: { moniteursParPc: number; peripheriquesParPc: number };
}

const eur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const fmtDate = (s: string | null | undefined): string | null => {
  if (!s) return null;
  const [y, m, d] = s.substring(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const v = (x: any) => (x === null || x === undefined || x === '') ? <span style={{ color: '#cbd5e1' }}>—</span> : x;

// Pastille « vu dans l'AD » : couleur selon l'ancienneté de la dernière connexion
//  • < 30 j → vert   • 30–90 j → orange   • > 90 j → rouge
const AdSeenDot: React.FC<{ lastSeen: string | null; lastUser: string | null }> = ({ lastSeen, lastUser }) => {
  const notFound = (
    <span title="Introuvable dans l'AD" style={{ display: 'inline-flex', flexShrink: 0 }}>
      <X size={13} color="#dc2626" strokeWidth={3} />
    </span>
  );
  // Non trouvé dans l'AD → croix rouge.
  if (!lastSeen) return notFound;
  const d = new Date(lastSeen);
  if (isNaN(d.getTime())) return notFound;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  const color = days <= 30 ? '#16a34a' : days <= 90 ? '#d97706' : '#dc2626';
  const dateStr = d.toLocaleDateString('fr-FR');
  const tip = `Vu dans l'AD le ${dateStr} (il y a ${days} j)` + (lastUser ? `\nDernier utilisateur : ${lastUser}` : '');
  return (
    <span title={tip} style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: '0 0 0 2px #fff' }} />
  );
};

const ParcInformatique: React.FC = () => {
  const { token } = useAuth();
  const [source, setSource] = useState<'live' | 'hub'>('hub');
  const api = axios.create({ baseURL: `/api/parc/${source}`, headers: { Authorization: `Bearer ${token}` } });

  const [tab, setTab] = useState<'dashboard' | 'list' | 'stock' | 'usagers' | 'geo' | 'deploiements' | 'ad' | 'lignes' | 'etiquette'>('dashboard');
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [kpiErr, setKpiErr] = useState<string | null>(null);
  const [loadingKpi, setLoadingKpi] = useState(false);
  // Modal liste d'ordinateurs concernés (doublons de série / à renouveler)
  const [pcModal, setPcModal] = useState<{ kind: 'dup' | 'renew'; title: string } | null>(null);
  const [pcModalRows, setPcModalRows] = useState<Row[]>([]);
  const [pcModalLoading, setPcModalLoading] = useState(false);

  // Liste
  const [type, setType] = useState('ordinateurs');
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [start, setStart] = useState(0);
  const [limit] = useState(50);
  const [q, setQ] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [listErr, setListErr] = useState<string | null>(null);
  const [affecte, setAffecte] = useState<'' | '1' | '0'>('');
  const [filters, setFilters] = useState<{ locations: string[]; states: string[]; manufacturers: string[]; suppliers: string[]; groups: string[]; types: string[] }>({ locations: [], states: [], manufacturers: [], suppliers: [], groups: [], types: [] });
  const [fLocation, setFLocation] = useState('');
  const [fState, setFState] = useState('');
  const [fMan, setFMan] = useState('');
  const [fSupplier, setFSupplier] = useState('');
  const [fMise, setFMise] = useState('');
  const [fGroup, setFGroup] = useState('');
  const [fType, setFType] = useState('');
  const [fAdSeen, setFAdSeen] = useState(''); // '' | 'fresh' | 'warn' | 'stale' | 'notfound'
  const [fAd, setFAd] = useState<'' | '1' | '0'>();
  const [fDocs, setFDocs] = useState(false);
  const [fStock, setFStock] = useState(false);
  // Tri des colonnes
  const [sortCol, setSortCol] = useState('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Géo
  const [geoRows, setGeoRows] = useState<Row[]>([]);
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [geoExpanded, setGeoExpanded] = useState<Set<string>>(new Set());
  const [geoSelectedLoc, setGeoSelectedLoc] = useState<string | null>(null);
  const [geoSelectedType, setGeoSelectedType] = useState<string | null>(null);

  // Graphique « ajouts vs déployés » : bascule année / mois
  const [pcAddVueMois, setPcAddVueMois] = useState(false);

  // Usagers
  const [usagers, setUsagers] = useState<UsagerRow[]>([]);
  const [loadingUsagers, setLoadingUsagers] = useState(false);
  const [usagerErr, setUsagerErr] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [contactItems, setContactItems] = useState<Row[]>([]);
  const [loadingContact, setLoadingContact] = useState(false);
  const [searchUsager, setSearchUsager] = useState('');

  // Stock
  const [stockGroups, setStockGroups] = useState<any[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockErr, setStockErr] = useState<string | null>(null);
  const [fStockType, setFStockType] = useState('');
  const [fStockMan, setFStockMan] = useState('');
  const [fStockStatut, setFStockStatut] = useState(''); // '' | 'En stock neuf' | 'En stock masterisé' | 'En stock'
  const [stockExpanded, setStockExpanded] = useState<Set<string>>(new Set());
  const [stockTooltip, setStockTooltip] = useState<{ items: any[]; statut: string; total: number; x: number; y: number } | null>(null);
  const tooltipHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Déploiements
  const [deploys, setDeploys] = useState<any[]>([]);
  const [deployTotal, setDeployTotal] = useState(0);
  const [deployKpis, setDeployKpis] = useState<any | null>(null);
  const [deployLoading, setDeployLoading] = useState(false);
  const [deployErr, setDeployErr] = useState<string | null>(null);
  const [deployQ, setDeployQ] = useState('');
  const [deployDir, setDeployDir] = useState('');
  const [deployType, setDeployType] = useState('');
  const [deployAnnee, setDeployAnnee] = useState('');
  const [deployStart, setDeployStart] = useState(0);
  const [deployLimit, setDeployLimit] = useState(50);
  const [deploySort, setDeploySort] = useState('date_deploiement');
  const [deploySortDir, setDeploySortDir] = useState<'asc' | 'desc'>('desc');
  const [deployConflictsOpen, setDeployConflictsOpen] = useState(false);
  const [deployConflicts, setDeployConflicts] = useState<any[]>([]);
  const [deployEquip, setDeployEquip] = useState('');
  const [deployInstall, setDeployInstall] = useState('');
  // Facettes complètes (directions + installateurs) pour filtres et fusion
  const [deployFacets, setDeployFacets] = useState<{ directions: { direction: string; n: number }[]; installateurs: { installateur: string; n: number }[]; types: { type_operation: string; n: number }[] }>({ directions: [], installateurs: [], types: [] });
  // Rapprochement AD des bénéficiaires
  const [adMap, setAdMap] = useState<Record<string, { found: boolean; display_name: string | null; email: string | null; service: string | null }>>({});

  // Onglet AD : ordinateurs de l'Active Directory (hub_parc.ad_computers)
  const [adRows, setAdRows] = useState<any[]>([]);
  const [adTotal, setAdTotal] = useState(0);
  const [adStart, setAdStart] = useState(0);
  const [adLimit] = useState(100);
  const [adQ, setAdQ] = useState('');
  const [adEnabled, setAdEnabled] = useState<'' | 'true' | 'false'>('');
  const [adLoading, setAdLoading] = useState(false);
  const [adErr, setAdErr] = useState<string | null>(null);
  const [adStatsData, setAdStatsData] = useState<any | null>(null);
  const [adImport, setAdImport] = useState<any | null>(null);
  const adPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [adStatus, setAdStatus] = useState<{ total: number; cached: number; remaining: number; matched: number } | null>(null);
  const [adRunning, setAdRunning] = useState(false);
  const [adProgress, setAdProgress] = useState<{ done: number; total: number } | null>(null);
  // Fusion d'installateurs
  const [instOpen, setInstOpen] = useState(false);
  const [instKeep, setInstKeep] = useState<string | null>(null);
  const [instSel, setInstSel] = useState<Set<string>>(new Set());
  const [instMerging, setInstMerging] = useState(false);
  const [instQ, setInstQ] = useState('');
  // Fusion manuelle de 2 fiches : ordre = [garder, compléter+supprimer]
  const [deploySel, setDeploySel] = useState<number[]>([]);
  const [pairMerging, setPairMerging] = useState(false);
  // Renommage d'un installateur
  const [instEdit, setInstEdit] = useState<{ from: string; value: string } | null>(null);
  const [instSaving, setInstSaving] = useState(false);
  // Renommage / fusion des types d'opération
  const [typesOpen, setTypesOpen] = useState(false);
  const [typeEdit, setTypeEdit] = useState<{ from: string | null; value: string } | null>(null);
  const [typeSaving, setTypeSaving] = useState(false);

  // Doublons
  const [doublonOpen, setDoublonOpen] = useState(false);
  const [doublonList, setDoublonList] = useState<Array<{ itemtype: string; type_key: string; tail9: string; items: Row[] }>>([]);
  const [doublonLoading, setDoublonLoading] = useState(false);
  const [doublonMerging, setDoublonMerging] = useState<Set<string>>(new Set());
  const [doublonErr, setDoublonErr] = useState<string | null>(null);
  const [doublonMergingAll, setDoublonMergingAll] = useState(false);

  // Détail
  const [detail, setDetail] = useState<any | null>(null);

  // Inversion / recherche AD
  const [swapping, setSwapping] = useState<Record<string, boolean>>({});
  const [adModal, setAdModal] = useState<AdModal | null>(null);

  // ── Doublons ──
  const openDoublons = useCallback(async () => {
    setDoublonOpen(true); setDoublonLoading(true); setDoublonErr(null); setDoublonList([]);
    try {
      const r = await axios.get('/api/parc/hub/doublons', { headers: { Authorization: `Bearer ${token}` } });
      setDoublonList(r.data.duplicates || []);
    } catch (e: any) { setDoublonErr(e.response?.data?.message || e.message); }
    finally { setDoublonLoading(false); }
  }, [token]);

  // ── KPIs ──
  const loadKpis = useCallback(async (refresh = false) => {
    setLoadingKpi(true); setKpiErr(null);
    try {
      const r = await api.get('/kpis', { params: refresh ? { refresh: 1 } : {} });
      setKpis(r.data);
    } catch (e: any) {
      setKpiErr(e.response?.data?.message || e.message);
    } finally { setLoadingKpi(false); }
  }, [token, source]);

  // Ouvre le modal listant les ordinateurs concernés (doublons série / à renouveler)
  const openPcModal = useCallback(async (kind: 'dup' | 'renew') => {
    setPcModal({ kind, title: kind === 'dup' ? 'Ordinateurs en doublon de n° de série' : 'Ordinateurs à renouveler (> 5 ans)' });
    setPcModalLoading(true); setPcModalRows([]);
    try {
      const r = await api.get('/tous', { params: { all: 1, deleted: '0' } });
      const pcs: Row[] = (r.data.rows || []).filter((x: Row) => x.type_key === 'ordinateurs');
      let out: Row[] = [];
      if (kind === 'renew') {
        out = pcs.filter(x => x.age_years != null && (x.age_years as number) >= 5)
          .sort((a, b) => (b.age_years || 0) - (a.age_years || 0));
      } else {
        const m = new Map<string, number>();
        for (const x of pcs) { const s = (x.serial || '').trim().toLowerCase(); if (s) m.set(s, (m.get(s) || 0) + 1); }
        out = pcs.filter(x => { const s = (x.serial || '').trim().toLowerCase(); return s && (m.get(s) || 0) > 1; })
          .sort((a, b) => (a.serial || '').localeCompare(b.serial || ''));
      }
      setPcModalRows(out);
    } catch { setPcModalRows([]); }
    finally { setPcModalLoading(false); }
  }, [api]);

  // ── Liste ──
  const loadList = useCallback(async (refresh = false) => {
    setLoadingList(true); setListErr(null);
    try {
      const r = await api.get(`/${type}`, { params: {
        q, start, limit, affecte: affecte || undefined,
        location: fLocation || undefined, state: fState || undefined, manufacturer: fMan || undefined,
        supplier: fSupplier || undefined, mise: fMise || undefined, group: fGroup || undefined,
        type_filter: fType || undefined,
        ad_seen: fAdSeen || undefined,
        ad: fAd || undefined, docs: fDocs ? '1' : undefined, stock: fStock ? '1' : '0',
        sort: sortCol, dir: sortDir,
        refresh: refresh ? 1 : undefined,
      } });
      setRows(r.data.rows); setTotal(r.data.total);
    } catch (e: any) {
      setListErr(e.response?.data?.message || e.message); setRows([]); setTotal(0);
    } finally { setLoadingList(false); }
  }, [type, q, start, limit, affecte, fLocation, fState, fMan, fSupplier, fMise, fType, fAdSeen, fAd, fDocs, fStock, fGroup, sortCol, sortDir, token, source]);

  const handleDoublonMerge = useCallback(async (type_key: string, kept_id: number, merged_id: number, groupIdx: number) => {
    const key = `${kept_id}-${merged_id}`;
    setDoublonMerging(prev => new Set([...prev, key]));
    try {
      await axios.post('/api/parc/hub/merge', { type_key, kept_id, merged_id }, { headers: { Authorization: `Bearer ${token}` } });
      setDoublonList(prev => {
        const next = [...prev];
        const g = { ...next[groupIdx], items: next[groupIdx].items.filter(it => it.id !== merged_id) };
        if (g.items.length < 2) next.splice(groupIdx, 1); else next[groupIdx] = g;
        return next;
      });
      loadList();
    } catch (e: any) { alert('Erreur fusion : ' + (e.response?.data?.message || e.message)); }
    finally { setDoublonMerging(prev => { const n = new Set(prev); n.delete(key); return n; }); }
  }, [token, loadList]);

  const handleMergeAll = useCallback(async () => {
    setDoublonMergingAll(true);
    const groups = [...doublonList];
    let errors = 0;
    for (const group of groups) {
      const kept = group.items[0];
      for (const src of group.items.slice(1)) {
        try {
          await axios.post('/api/parc/hub/merge', { type_key: group.type_key, kept_id: kept.id, merged_id: src.id }, { headers: { Authorization: `Bearer ${token}` } });
        } catch { errors++; }
      }
    }
    setDoublonMergingAll(false);
    setDoublonList([]);
    loadList();
    if (errors > 0) alert(`${errors} fusion(s) ont échoué.`);
  }, [doublonList, token, loadList]);

  const loadFilters = useCallback(async () => {
    try {
      const r = await api.get(`/${type}/filters`);
      setFilters({ locations: r.data.locations || [], states: r.data.states || [], manufacturers: r.data.manufacturers || [], suppliers: r.data.suppliers || [], groups: r.data.groups || [], types: r.data.types || [] });
    } catch { setFilters({ locations: [], states: [], manufacturers: [], suppliers: [], groups: [], types: [] }); }
  }, [type, token, source]);

  // Efface les erreurs résiduelles quand on bascule de source (live ↔ hub)
  useEffect(() => { setKpiErr(null); setListErr(null); setUsagerErr(null); }, [source]);
  useEffect(() => { loadKpis(); }, [loadKpis]);
  useEffect(() => { if (tab === 'list') { loadList(); } }, [tab, type, start, affecte, fLocation, fState, fMan, fSupplier, fMise, fType, fAdSeen, fAd, fDocs, fStock, fGroup, sortCol, sortDir, source]);
  useEffect(() => { if (tab === 'list') { setStart(0); setFLocation(''); setFState(''); setFMan(''); setFSupplier(''); setFMise(''); setFGroup(''); setFType(''); setFAdSeen(''); setFAd(undefined); setFDocs(false); setFStock(false); setSortCol('name'); setSortDir('asc'); loadFilters(); } }, [type, tab, source]);

  const loadGeo = useCallback(async () => {
    setLoadingGeo(true); setGeoErr(null);
    try {
      const r = await api.get('/tous', { params: { all: 1, deleted: '0' } });
      setGeoRows(r.data.rows || []);
    } catch (e: any) { setGeoErr(e.response?.data?.message || e.message); setGeoRows([]); }
    finally { setLoadingGeo(false); }
  }, [token, source]);
  useEffect(() => { if (tab === 'geo') loadGeo(); }, [tab, source]);

  const handleSwap = async (r: Row) => {
    const key = `${r.type_key || type}-${r.id}`;
    if (swapping[key]) return;
    setSwapping(s => ({ ...s, [key]: true }));
    try {
      const res = await axios.post(`/api/parc/hub/${r.type_key || type}/${r.id}/swap-contact`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setRows(prev => prev.map(row =>
        row.id === r.id && row.type_key === r.type_key
          ? { ...row, contact: res.data.contact || null, contact_num: res.data.contact_num || null, ad_found: res.data.ad_found ?? row.ad_found, contact_email: res.data.ad_email || null }
          : row
      ));
    } catch (e: any) { alert(`Erreur inversion : ${e.response?.data?.message || e.message}`); }
    finally { setSwapping(s => { const n = { ...s }; delete n[key]; return n; }); }
  };

  const openAdModal = (r: Row) => setAdModal({ row: r, query: r.contact || r.name || '', results: null, loading: false, selected: null, applying: false });

  const doAdSearch = async () => {
    if (!adModal) return;
    setAdModal(m => m ? { ...m, loading: true, results: null, selected: null } : m);
    try {
      const res = await axios.post(`/api/parc/hub/${adModal.row.type_key || type}/${adModal.row.id}/ad-lookup`, { query: adModal.query }, { headers: { Authorization: `Bearer ${token}` } });
      setAdModal(m => m ? { ...m, loading: false, results: res.data.results || [] } : m);
    } catch (e: any) {
      alert(`Erreur AD : ${e.response?.data?.message || e.message}`);
      setAdModal(m => m ? { ...m, loading: false, results: [] } : m);
    }
  };

  const applyAdUser = async () => {
    if (!adModal?.selected) return;
    setAdModal(m => m ? { ...m, applying: true } : m);
    const { row, selected } = adModal;
    try {
      await axios.patch(`/api/parc/hub/${row.type_key || type}/${row.id}/contact`,
        { contact: selected.displayName, email: selected.email, ad_username: selected.username, display_name: selected.displayName, service: selected.service },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRows(prev => prev.map(r =>
        r.id === row.id && r.type_key === row.type_key
          ? { ...r, contact: selected.displayName, ad_found: true, contact_email: selected.email || null }
          : r
      ));
      setAdModal(null);
    } catch (e: any) {
      alert(`Erreur application : ${e.response?.data?.message || e.message}`);
      setAdModal(m => m ? { ...m, applying: false } : m);
    }
  };

  const openDetail = async (id: number, typeKey?: string) => {
    const t = typeKey || type;
    setDetail({ loading: true });
    try {
      const r = await api.get(`/${t}/${id}`);
      setDetail(r.data);
    } catch (e: any) {
      setDetail({ error: e.response?.data?.message || e.message });
    }
  };

  // ── Usagers ──
  const loadUsagers = useCallback(async () => {
    setLoadingUsagers(true); setUsagerErr(null);
    try {
      const r = await api.get('/usagers-equip');
      setUsagers(r.data.usagers || []);
    } catch (e: any) {
      setUsagerErr(e.response?.data?.message || e.message);
    } finally { setLoadingUsagers(false); }
  }, [token, source]);

  const selectContact = async (contact: string) => {
    if (selectedContact === contact) { setSelectedContact(null); setContactItems([]); return; }
    setSelectedContact(contact);
    setLoadingContact(true);
    try {
      const r = await api.get('/tous', { params: { contact, limit: 500 } });
      setContactItems(r.data.rows || []);
    } catch { setContactItems([]); }
    finally { setLoadingContact(false); }
  };

  // ── Stock ──
  const loadStock = useCallback(async () => {
    setLoadingStock(true); setStockErr(null);
    try {
      const r = await axios.get('/api/parc/hub/stock-summary', { headers: { Authorization: `Bearer ${token}` } });
      setStockGroups(r.data.groups || []);
    } catch (e: any) {
      setStockErr(e.response?.data?.message || e.message); setStockGroups([]);
    } finally { setLoadingStock(false); }
  }, [token]);

  useEffect(() => { if (tab === 'usagers') loadUsagers(); }, [tab, source]);
  useEffect(() => { if (tab === 'stock') loadStock(); }, [tab, loadStock]);

  // ── Déploiements ──
  const loadDeploys = useCallback(async () => {
    setDeployLoading(true); setDeployErr(null);
    try {
      // deployDir contient un code canonique : on renvoie toutes ses variantes brutes
      let directions: string | undefined;
      if (deployDir) {
        const vars = deployFacets.directions.filter(d => dirCanonical(d.direction) === deployDir).map(d => d.direction);
        directions = vars.length ? vars.join(',') : deployDir;
      }
      const r = await axios.get('/api/deploiements/', {
        headers: { Authorization: `Bearer ${token}` },
        params: { directions, type_operation: deployType || undefined, annee: deployAnnee || undefined, equip: deployEquip || undefined, installateur: deployInstall || undefined, q: deployQ || undefined, start: deployStart, limit: deployLimit, sort: deploySort, dir: deploySortDir },
      });
      setDeploys(r.data.rows || []); setDeployTotal(r.data.total || 0);
    } catch (e: any) {
      setDeployErr(e.response?.data?.message || e.message); setDeploys([]); setDeployTotal(0);
    } finally { setDeployLoading(false); }
  }, [token, deployDir, deployType, deployAnnee, deployEquip, deployInstall, deployQ, deployStart, deployLimit, deploySort, deploySortDir, deployFacets]);

  const loadDeployFacets = useCallback(async () => {
    try {
      const r = await axios.get('/api/deploiements/facets', { headers: { Authorization: `Bearer ${token}` } });
      setDeployFacets({ directions: r.data.directions || [], installateurs: r.data.installateurs || [], types: r.data.types || [] });
    } catch { /* silencieux */ }
  }, [token]);

  // ── Rapprochement AD ──
  const loadAdMatch = useCallback(async () => {
    try {
      const r = await axios.get('/api/deploiements/ad-match', { headers: { Authorization: `Bearer ${token}` } });
      setAdMap(r.data.map || {});
      setAdStatus({ total: r.data.total, cached: r.data.cached, remaining: r.data.remaining, matched: r.data.matched });
    } catch { /* silencieux */ }
  }, [token]);

  const runAdMatch = useCallback(async (refresh = false) => {
    if (adRunning) return;
    setAdRunning(true);
    try {
      let done = false; let guard = 0; let total = adStatus?.total || 0; let firstRefresh = refresh;
      while (!done && guard < 200) {
        guard++;
        const r = await axios.post('/api/deploiements/ad-match/run', { batch: 30, refresh: firstRefresh }, { headers: { Authorization: `Bearer ${token}` } });
        firstRefresh = false; // le refresh ne doit s'appliquer qu'au 1er lot
        total = r.data.total || total;
        done = r.data.done;
        setAdProgress({ done: Math.max(0, total - (r.data.remaining || 0)), total });
        if (done) break;
      }
      await loadAdMatch();
    } catch (e: any) {
      alert(`Erreur rapprochement AD : ${e.response?.data?.message || e.message}`);
    } finally { setAdRunning(false); setAdProgress(null); }
  }, [token, adRunning, adStatus, loadAdMatch]);

  // ── Fusion d'installateurs ──
  const doMergeInstallateurs = useCallback(async () => {
    if (!instKeep || instSel.size === 0) return;
    setInstMerging(true);
    try {
      await axios.post('/api/deploiements/installateurs/merge',
        { keep: instKeep, merge: [...instSel] },
        { headers: { Authorization: `Bearer ${token}` } });
      setInstOpen(false); setInstKeep(null); setInstSel(new Set());
      await loadDeployFacets();
      loadDeploys();
      loadDeployKpis();
    } catch (e: any) {
      alert(`Erreur fusion : ${e.response?.data?.message || e.message}`);
    } finally { setInstMerging(false); }
  }, [token, instKeep, instSel, loadDeployFacets, loadDeploys]);

  // ── Renommage d'installateur ──
  const doRenameInstallateur = useCallback(async () => {
    if (!instEdit) return;
    const to = instEdit.value.trim();
    if (!to || to === instEdit.from) { setInstEdit(null); return; }
    setInstSaving(true);
    try {
      await axios.post('/api/deploiements/installateurs/rename',
        { from: instEdit.from, to },
        { headers: { Authorization: `Bearer ${token}` } });
      setInstEdit(null);
      await loadDeployFacets();
      loadDeploys();
      loadDeployKpis();
    } catch (e: any) {
      alert(`Erreur renommage : ${e.response?.data?.message || e.message}`);
    } finally { setInstSaving(false); }
  }, [token, instEdit, loadDeployFacets, loadDeploys]);

  // ── Fusion manuelle de 2 fiches ──
  const toggleDeploySel = useCallback((id: number) => {
    setDeploySel(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id]; // garde le 2e choisi + le nouveau
      return [...prev, id];
    });
  }, []);

  const doMergePair = useCallback(async () => {
    if (deploySel.length !== 2) return;
    setPairMerging(true);
    try {
      const r = await axios.post('/api/deploiements/merge',
        { keep_id: deploySel[0], merge_id: deploySel[1] },
        { headers: { Authorization: `Bearer ${token}` } });
      setDeploySel([]);
      loadDeploys();
      loadDeployKpis();
      loadDeployFacets();
      const n = (r.data.filled || []).length;
      // petit retour visuel non bloquant via le compteur (les listes se rechargent)
      console.info(`Fusion : ${n} champ(s) complété(s) sur la fiche conservée.`);
    } catch (e: any) {
      alert(`Erreur fusion : ${e.response?.data?.message || e.message}`);
    } finally { setPairMerging(false); }
  }, [token, deploySel, loadDeploys, loadDeployFacets]);

  // ── Renommage / fusion d'un type d'opération ──
  const doRenameType = useCallback(async () => {
    if (!typeEdit) return;
    const to = typeEdit.value.trim();
    if (!to || to === typeEdit.from) { setTypeEdit(null); return; }
    setTypeSaving(true);
    try {
      await axios.post('/api/deploiements/types/rename',
        { from: typeEdit.from, to },
        { headers: { Authorization: `Bearer ${token}` } });
      setTypeEdit(null);
      await loadDeployFacets();
      loadDeploys();
      loadDeployKpis();
    } catch (e: any) {
      alert(`Erreur renommage : ${e.response?.data?.message || e.message}`);
    } finally { setTypeSaving(false); }
  }, [token, typeEdit, loadDeployFacets, loadDeploys]);

  const loadDeployKpis = useCallback(async () => {
    try {
      const r = await axios.get('/api/deploiements/kpis', {
        headers: { Authorization: `Bearer ${token}` },
        params: { annee: deployAnnee || undefined },
      });
      setDeployKpis(r.data);
    } catch { /* silencieux */ }
  }, [token, deployAnnee]);

  const [deployConflictData, setDeployConflictData] = useState<{ total: number; by_type: Record<string, number>; rows: any[] } | null>(null);
  const [deployConflictFilter, setDeployConflictFilter] = useState<string>('');
  const [deployEditRow, setDeployEditRow] = useState<any | null>(null);
  const [docViewer, setDocViewer] = useState<{ path: string; filename: string; glpiDocId?: number | null } | null>(null);

  const loadDeployConflicts = useCallback(async () => {
    try {
      const r = await axios.get('/api/deploiements/conflicts', { headers: { Authorization: `Bearer ${token}` } });
      setDeployConflictData(r.data);
      setDeployConflicts(r.data?.rows || []);
    } catch { setDeployConflicts([]); }
  }, [token]);

  useEffect(() => {
    if (tab === 'deploiements') {
      loadDeploys();
      loadDeployKpis();
    }
  }, [tab, deployDir, deployType, deployAnnee, deployEquip, deployInstall, deployQ, deployStart, deployLimit, deploySort, deploySortDir]);

  // Facettes + cache AD : chargés une fois à l'entrée de l'onglet
  useEffect(() => {
    if (tab === 'deploiements') { loadDeployFacets(); loadAdMatch(); }
  }, [tab]);

  // ─── Onglet AD (ordinateurs Active Directory) ────────────────────────────────
  const loadAdComputers = useCallback(async () => {
    setAdLoading(true); setAdErr(null);
    try {
      const params: any = { limit: adLimit, offset: adStart };
      if (adQ) params.q = adQ;
      if (adEnabled) params.enabled = adEnabled;
      const r = await axios.get('/api/parc/ad/computers', { params, headers: { Authorization: `Bearer ${token}` } });
      setAdRows(r.data.rows || []);
      setAdTotal(r.data.total || 0);
    } catch (e: any) {
      setAdErr(e?.response?.data?.message || 'Erreur de chargement');
      setAdRows([]); setAdTotal(0);
    } finally { setAdLoading(false); }
  }, [token, adLimit, adStart, adQ, adEnabled]);

  const loadAdStats = useCallback(async () => {
    try {
      const r = await axios.get('/api/parc/ad/stats', { headers: { Authorization: `Bearer ${token}` } });
      setAdStatsData(r.data);
      setAdImport(r.data?.import || null);
    } catch { /* silencieux */ }
  }, [token]);

  const startAdImport = useCallback(async () => {
    setAdErr(null);
    try {
      await axios.post('/api/parc/ad/import', {}, { headers: { Authorization: `Bearer ${token}` } });
      setAdImport({ running: true, count: 0 });
      // Démarre le suivi de progression.
      if (adPollRef.current) clearInterval(adPollRef.current);
      adPollRef.current = setInterval(async () => {
        try {
          const r = await axios.get('/api/parc/ad/import-progress', { headers: { Authorization: `Bearer ${token}` } });
          setAdImport(r.data);
          if (!r.data.running) {
            if (adPollRef.current) { clearInterval(adPollRef.current); adPollRef.current = null; }
            loadAdStats();
            loadAdComputers();
          }
        } catch { /* on continue */ }
      }, 1500);
    } catch (e: any) {
      setAdErr(e?.response?.data?.message || 'Impossible de démarrer l\'import');
    }
  }, [token, loadAdStats, loadAdComputers]);

  useEffect(() => { if (tab === 'ad') loadAdComputers(); }, [tab, adStart, adQ, adEnabled, loadAdComputers]);
  useEffect(() => { if (tab === 'ad') { setAdStart(0); loadAdStats(); } }, [tab]);
  // Nettoyage du timer de progression au démontage.
  useEffect(() => () => { if (adPollRef.current) clearInterval(adPollRef.current); }, []);

  // ─── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <Header />
      <div style={{ maxWidth: 1800, margin: '0 auto', padding: '24px 16px 60px' }}>

        {/* Titre */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Boxes size={26} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: C.text, letterSpacing: '-0.02em' }}>Parc informatique</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.8rem', color: C.slate, marginTop: 2 }}>
                {source === 'live' ? (
                  <>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#dcfce7', color: '#15803d', padding: '2px 9px', borderRadius: 20, fontWeight: 700 }}>
                      <Activity size={12} /> Direct GLPI 10
                    </span>
                    <span>Données en temps réel, sans synchronisation</span>
                  </>
                ) : (
                  <>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#dbeafe', color: '#1d4ed8', padding: '2px 9px', borderRadius: 20, fontWeight: 700 }}>
                      <Database size={12} /> HUB
                    </span>
                    <span>Données synchronisées localement</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Bascule source : Live (API GLPI) / HUB (base synchronisée) */}
            <div style={{ display: 'inline-flex', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: 3, gap: 2 }}>
              {([['live', 'Live', Activity], ['hub', 'HUB', Database]] as const).map(([k, l, I]) => (
                <button key={k} onClick={() => setSource(k)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: '.82rem', background: source === k ? C.blue : 'transparent', color: source === k ? '#fff' : C.slate,
                }}><I size={14} /> {l}</button>
              ))}
            </div>
            <button onClick={() => tab === 'dashboard' ? loadKpis(true) : tab === 'stock' ? loadStock() : tab === 'usagers' ? loadUsagers() : tab === 'geo' ? loadGeo() : tab === 'ad' ? null : loadList(true)}
              style={btn(C.blue)}>
              <RefreshCw size={15} className={loadingKpi || loadingList || loadingUsagers ? 'spin' : ''} /> Actualiser
            </button>
          </div>
        </div>

        {/* Onglets */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 22, borderBottom: `1px solid ${C.border}` }}>
          {[{ k: 'dashboard', l: 'Tableau de bord', i: BarChart3 }, { k: 'list', l: 'Équipements', i: List }, { k: 'stock', l: 'Stock', i: Boxes }, { k: 'usagers', l: 'Usagers', i: Users }, { k: 'geo', l: 'Géo', i: MapPin }, { k: 'deploiements', l: 'Déploiements', i: Truck }, { k: 'lignes', l: 'Lignes mobiles', i: Signal }, { k: 'ad', l: 'AD', i: Server }, { k: 'etiquette', l: 'Étiquette', i: Tag }].map(t => {
            const I = t.i; const active = tab === t.k;
            return (
              <button key={t.k} onClick={() => setTab(t.k as any)} style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px', border: 'none', background: 'none',
                cursor: 'pointer', fontSize: '.92rem', fontWeight: 700, color: active ? C.blue : C.slate,
                borderBottom: active ? `3px solid ${C.blue}` : '3px solid transparent', marginBottom: -1,
              }}><I size={16} /> {t.l}</button>
            );
          })}
        </div>

        {/* ─── TABLEAU DE BORD ─── */}
        {tab === 'dashboard' && (
          <>
            {kpiErr && <ErrBox msg={kpiErr} source={source} />}
            {source === 'hub' && kpis && kpis.totalAll === 0 && !kpiErr && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', padding: '12px 16px', borderRadius: 12, marginBottom: 16, fontSize: '.88rem' }}>
                <Database size={18} /> <span>Aucune donnée synchronisée dans le HUB. Lancez une synchronisation GLPI (admin) ou basculez en mode <b>Live</b>.</span>
              </div>
            )}
            {loadingKpi && !kpis && <Loading label={source === 'live' ? 'Interrogation de GLPI 10…' : 'Lecture du HUB…'} />}
            {kpis && (
              <>
                {/* Cartes par type */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(165px,1fr))', gap: 14, marginBottom: 18 }}>
                  <StatCard big icon={Boxes} label="Total équipements" value={kpis.totalAll} color={C.blue} />
                  {kpis.byType.map((t, i) => {
                    const I = TYPE_ICON[t.key] || Tag;
                    return <StatCard key={t.key} icon={I} label={t.label} value={t.count} color={COLORS[i % COLORS.length]}
                      onClick={() => { setType(t.key); setTab('list'); }} />;
                  })}
                  <StatCard icon={Clock} label="Âge moyen PC" value={kpis.ordinateurs.age.moyen ?? 0} suffix=" ans" color={C.slate} decimals />
                  <StatCard icon={RefreshCw} label="PC à renouveler (>5 ans)" value={kpis.ordinateurs.age.aRenouveler}
                    sub={`${kpis.ordinateurs.age.tauxRenouveler}%`} color={C.amber} onClick={() => openPcModal('renew')} />
                </div>

                {/* Affectation */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 18 }}>
                  <Panel title="Affectation des ordinateurs" icon={User}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                      <Gauge value={kpis.ordinateurs.tauxAffectation} />
                      <div style={{ flex: 1 }}>
                        <KV label="Affectés" value={kpis.ordinateurs.affectes} color={C.green} />
                        <KV label="Non affectés" value={kpis.ordinateurs.nonAffectes} color={C.amber} />
                        <KV label="Total" value={kpis.ordinateurs.total} />
                        <div style={{ marginTop: 10, fontSize: '.78rem', color: C.slate }}>
                          {kpis.ratios.moniteursParPc} écran/PC · {kpis.ratios.peripheriquesParPc} périph./PC
                        </div>
                      </div>
                    </div>
                    {/* Répartition par statut GLPI */}
                    {(() => {
                      const stat = kpis.ordinateurs.parStatut || [];
                      const sumBy = (re: RegExp) => stat.filter(s => re.test((s.label || '').trim())).reduce((a, s) => a + s.count, 0);
                      const exact = (name: string) => stat.filter(s => (s.label || '').trim().toLowerCase() === name).reduce((a, s) => a + s.count, 0);
                      const buckets = [
                        { label: 'Neufs', sub: 'stock neuf + masterisé', n: sumBy(/stock\s*neuf/i) + sumBy(/masteris/i), color: '#059669' },
                        { label: 'Réusage', sub: 'en stock', n: exact('en stock'), color: '#0891b2' },
                        { label: 'En service', sub: '', n: sumBy(/en service/i), color: '#2563eb' },
                        { label: 'En prêt', sub: '', n: sumBy(/pr[êe]t/i), color: '#7c3aed' },
                        { label: 'Attente récup.', sub: '', n: sumBy(/r[ée]cup/i), color: '#d97706' },
                        { label: 'Rebut / cassés', sub: 'cassé, panne, perdu…', n: sumBy(/cass|rebut|panne|\bhs\b|en panne|perdu|vol|vendu/i), color: '#dc2626' },
                      ];
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                          {buckets.map(b => (
                            <div key={b.label} title={b.sub || b.label} style={{ background: '#f8fafc', border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 9, height: 9, borderRadius: 3, background: b.color, flexShrink: 0 }} />
                                <span style={{ fontSize: '1.15rem', fontWeight: 900, color: C.text }}>{b.n}</span>
                              </div>
                              <div style={{ fontSize: '.72rem', fontWeight: 700, color: C.slate, marginTop: 1 }}>{b.label}</div>
                              {b.sub && <div style={{ fontSize: '.64rem', color: '#94a3b8' }}>{b.sub}</div>}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {/* Répartition par groupe */}
                    {(kpis.ordinateurs.parGroupe || []).length > 0 && (
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: '.72rem', fontWeight: 800, color: C.slate, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Par groupe</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {kpis.ordinateurs.parGroupe.map(g => (
                            <span key={g.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f5f3ff', border: '1px solid #ede9fe', borderRadius: 8, padding: '3px 9px', fontSize: '.78rem' }}>
                              <span style={{ color: '#7c3aed', fontWeight: 700 }}>{g.label}</span>
                              <span style={{ background: '#7c3aed', color: '#fff', borderRadius: 10, padding: '0 7px', fontWeight: 800, fontSize: '.72rem' }}>{g.count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </Panel>
                </div>

                {/* Anomalies / qualité d'inventaire */}
                <div style={{ marginBottom: 18 }}>
                  <Panel title="Anomalies à traiter" icon={AlertTriangle}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 12 }}>
                      <Anomaly label="Sans n° de série" n={kpis.ordinateurs.qualite.sansSerie} />
                      <Anomaly label="Sans lieu" n={kpis.ordinateurs.qualite.sansLieu} />
                      <Anomaly label="Non affectés" n={kpis.ordinateurs.nonAffectes} />
                      <Anomaly label="Sans date de mise en service" n={kpis.ordinateurs.qualite.sansMiseEnService} />
                      <Anomaly label="Doublons de série" n={kpis.ordinateurs.qualite.doublonsSerie} onClick={() => openPcModal('dup')} />
                    </div>
                  </Panel>
                </div>

                {/* Graphiques */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                  <Panel title="Ordinateurs par statut" icon={Activity}>
                    <PieBlock data={kpis.ordinateurs.parStatut.map(s => (s.label || '').trim().toLowerCase() === 'en stock' ? { ...s, label: 'En stock réusage' } : s)} />
                  </Panel>
                  <Panel title="Top fabricants" icon={Cpu}>
                    <BarBlock data={kpis.ordinateurs.parFabricant.slice(0, 8)} color="#7c3aed" />
                  </Panel>
                  <Panel title="Top localisations" icon={MapPin}>
                    <BarBlock data={kpis.ordinateurs.parLieu.slice(0, 8)} color="#0891b2" />
                  </Panel>
                  <Panel title="Top modèles" icon={Layers}>
                    <BarBlock data={kpis.ordinateurs.parModele.slice(0, 8)} color="#059669" />
                  </Panel>
                  <Panel title="Systèmes d'exploitation" icon={Cpu}>
                    <BarBlock data={kpis.ordinateurs.parOs.slice(0, 8)} color="#d97706" />
                  </Panel>
                </div>

                {/* Pyramide des âges */}
                {kpis.ordinateurs.age.tranches.some(t => t.count > 0) && (
                  <Panel title="Pyramide des âges — Ordinateurs" icon={Layers}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: '.82rem', color: C.slate }}>
                      {kpis.ordinateurs.age.moyen != null && <span>Âge moyen : <b style={{ color: C.text }}>{kpis.ordinateurs.age.moyen} ans</b></span>}
                      <span style={{ background: '#fee2e2', color: C.red, padding: '1px 8px', borderRadius: 20, fontWeight: 700 }}>
                        {kpis.ordinateurs.age.aRenouveler} à renouveler ({kpis.ordinateurs.age.tauxRenouveler}%)
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={kpis.ordinateurs.age.tranches} layout="vertical" margin={{ left: 8, right: 40, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="label" width={60} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: any) => [v + ' PC', 'Ordinateurs']} />
                        <Bar dataKey="count" radius={[0, 5, 5, 0]} barSize={18} label={{ position: 'right', fontSize: 11, fill: C.slate, formatter: (v: any) => v > 0 ? v : '' }}>
                          {kpis.ordinateurs.age.tranches.map((t) => {
                            const clr = t.label === '< 1 an' ? '#059669' : t.label === '1–3 ans' ? '#10b981' : t.label === '3–5 ans' ? '#f59e0b' : t.label === '5–7 ans' ? '#f97316' : t.label === '> 7 ans' ? '#dc2626' : '#94a3b8';
                            return <Cell key={t.label} fill={clr} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Panel>
                )}

                {kpis.ordinateurs.ajoutsParAnnee.length > 1 && (() => {
                  // Fusion des 2 séries : ajouts au parc vs ordinateurs déployés.
                  // Granularité annuelle par défaut, mensuelle si « Vue mois » est actif.
                  const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
                  let data: { label: string; ajouts: number; deploiements: number }[];
                  if (pcAddVueMois) {
                    const add = (kpis.ordinateurs.ajoutsParMois || []).filter(a => a.mois >= '2020-01');
                    const dep = (kpis.ordinateurs.deploiementsParMois || []).filter(d => d.mois >= '2020-01');
                    const months = Array.from(new Set([...add.map(a => a.mois), ...dep.map(d => d.mois)])).sort();
                    data = months.map(m => {
                      const [y, mm] = m.split('-');
                      return {
                        label: `${MOIS_COURTS[parseInt(mm, 10) - 1]} ${y.slice(2)}`,
                        ajouts: add.find(a => a.mois === m)?.count || 0,
                        deploiements: dep.find(d => d.mois === m)?.count || 0,
                      };
                    });
                  } else {
                    const add = kpis.ordinateurs.ajoutsParAnnee.filter(a => a.annee >= '2020');
                    const dep = (kpis.ordinateurs.deploiementsParAnnee || []).filter(d => d.annee >= '2020');
                    const yrs = Array.from(new Set([...add.map(a => a.annee), ...dep.map(d => d.annee)])).sort();
                    data = yrs.map(y => ({
                      label: y,
                      ajouts: add.find(a => a.annee === y)?.count || 0,
                      deploiements: dep.find(d => d.annee === y)?.count || 0,
                    }));
                  }
                  const toggleBtn = (
                    <button
                      onClick={() => setPcAddVueMois(v => !v)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                        border: `1px solid ${pcAddVueMois ? C.blue : C.border}`, background: pcAddVueMois ? C.blue : C.card,
                        color: pcAddVueMois ? '#fff' : C.text, fontWeight: 700, fontSize: '.78rem',
                      }}
                      title={pcAddVueMois ? 'Repasser en granularité annuelle' : 'Afficher la granularité mensuelle'}
                    >
                      <CalendarDays size={13} /> {pcAddVueMois ? 'Vue année' : 'Vue mois'}
                    </button>
                  );
                  return (
                  <Panel title={`Ordinateurs : ajouts au parc vs déployés, par ${pcAddVueMois ? 'mois' : 'année'}`} icon={BarChart3} right={toggleBtn}>
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={data}>
                        <defs>
                          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={C.blue} stopOpacity={0.35} /><stop offset="100%" stopColor={C.blue} stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gDep" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#059669" stopOpacity={0.3} /><stop offset="100%" stopColor="#059669" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={pcAddVueMois ? 'preserveStartEnd' : 0} minTickGap={pcAddVueMois ? 16 : 5} /><YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '.8rem' }} />
                        <Area type="monotone" dataKey="ajouts" name="Ajoutés au parc" stroke={C.blue} fill="url(#g)" strokeWidth={2} />
                        <Area type="monotone" dataKey="deploiements" name="Déployés" stroke="#059669" fill="url(#gDep)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Panel>
                  );
                })()}
              </>
            )}
          </>
        )}

        {/* ─── ÉQUIPEMENTS ─── */}
        {tab === 'list' && (
          <>
            {/* Sélecteur de type */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
              {TYPES.map(t => {
                const I = t.icon; const active = type === t.key;
                return (
                  <button key={t.key} onClick={() => setType(t.key)} style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${active ? C.blue : C.border}`, background: active ? C.blue : C.card,
                    color: active ? '#fff' : C.text, fontWeight: 700, fontSize: '.85rem',
                  }}><I size={15} /> {t.label}</button>
                );
              })}
              <button onClick={openDoublons} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${C.amber}`, background: '#fffbeb', color: C.amber, fontWeight: 700, fontSize: '.85rem', marginLeft: 'auto' }}>
                <AlertTriangle size={15} /> Doublons
              </button>
            </div>

            {/* Téléphones & tablettes : vue Mobilité dédiée (table hub_parc.mobilite_*) */}
            {type === 'telephones' ? <MobiliteView token={token || ''} /> : (
            <>
            {/* Filtres */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1 1 260px' }}>
                <Search size={16} style={{ position: 'absolute', left: 11, top: 11, color: C.slate }} />
                <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setStart(0); loadList(); } }}
                  placeholder="Nom, série, inventaire, utilisateur, usager, n° usager, lieu…"
                  style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: '.9rem', boxSizing: 'border-box' }} />
              </div>
              {filters.types.length > 0 &&
                <Select value={fType} onChange={v => { setStart(0); setFType(v); }} placeholder="Tous les types" options={filters.types} />}
              {(type === 'ordinateurs' || type === 'tous') &&
                <select value={fAdSeen} onChange={e => { setStart(0); setFAdSeen(e.target.value); }} style={selStyle}>
                  <option value="">AD : tous</option>
                  <option value="fresh">🟢 Vu &lt; 30 j</option>
                  <option value="warn">🟠 Vu 30–90 j</option>
                  <option value="stale">🔴 Vu &gt; 90 j</option>
                  <option value="notfound">✕ Introuvable dans l'AD</option>
                </select>}
              <Select value={fLocation} onChange={setFLocation} placeholder="Tous les lieux" options={filters.locations} />
              <Select value={fState} onChange={setFState} placeholder="Tous les statuts" options={filters.states} />
              <Select value={fMan} onChange={setFMan} placeholder="Tous les fabricants" options={filters.manufacturers} />
              <Select value={fSupplier} onChange={setFSupplier} placeholder="Tous les fournisseurs" options={filters.suppliers} />
              <Select value={fGroup} onChange={setFGroup} placeholder="Tous les groupes" options={filters.groups} />
              <select value={fMise} onChange={e => { setStart(0); setFMise(e.target.value); }} style={selStyle}>
                <option value="">Mise en service : toutes</option>
                <option value="connue">Date connue</option>
                <option value="inconnue">Date inconnue</option>
              </select>
              <select value={affecte} onChange={e => { setStart(0); setAffecte(e.target.value as any); }} style={selStyle}>
                <option value="">Affectation : tous</option>
                <option value="1">Affectés</option>
                <option value="0">Non affectés</option>
              </select>
              <select value={fAd || ''} onChange={e => { setStart(0); setFAd(e.target.value as any || undefined); }} style={selStyle}>
                <option value="">AD : tous</option>
                <option value="1">✓ Dans l'AD</option>
                <option value="0">✗ Pas dans l'AD</option>
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 10, border: `1px solid ${fDocs ? C.blue : C.border}`, background: fDocs ? '#eff6ff' : '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '.85rem', color: fDocs ? C.blue : C.slate, userSelect: 'none' }}>
                <input type="checkbox" checked={fDocs} onChange={e => { setStart(0); setFDocs(e.target.checked); }} style={{ accentColor: C.blue, width: 14, height: 14 }} />
                <FileText size={14} /> Avec documents
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 10, border: `1px solid ${fStock ? C.amber : C.border}`, background: fStock ? '#fffbeb' : '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '.85rem', color: fStock ? C.amber : C.slate, userSelect: 'none' }}>
                <input type="checkbox" checked={fStock} onChange={e => { setStart(0); setFStock(e.target.checked); }} style={{ accentColor: '#d97706', width: 14, height: 14 }} />
                <Boxes size={14} /> Inclure stock
              </label>
              <button onClick={() => { setStart(0); loadList(); }} style={btn(C.blue)}>Rechercher</button>
            </div>

            {listErr && <ErrBox msg={listErr} source={source} />}

            {/* Tableau */}
            <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: '.82rem', color: C.slate, display: 'flex', justifyContent: 'space-between' }}>
                <span><b style={{ color: C.text }}>{total}</b> équipement(s)</span>
                {loadingList && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><RefreshCw size={13} className="spin" /> chargement…</span>}
              </div>
              <div style={{ overflowX: 'auto' }}>
                {(() => {
                  const isTous = type === 'tous';
                  // [label, sortKey | null]
                  type HdrDef = [string, string | null];
                  // Colonne additionnelle, avant « Modèle », selon le type d'équipement :
                  //  • périphériques → Type matériel (ex : scanner)  • ordinateurs/moniteurs → Marque
                  const extraCol: HdrDef | null =
                    type === 'peripheriques' ? ['Type', 'type'] :
                    (type === 'ordinateurs' || type === 'moniteurs') ? ['Marque', 'manufacturer'] : null;
                  const colSpan = (isTous ? 15 : 14) + (extraCol ? 1 : 0);
                  const hdrs: HdrDef[] = isTous
                    ? [['Nom','name'],['Type',null],['Usager','contact'],['N° usager','contact_num'],['Groupe','group'],['Lieu','location'],['Modèle','model'],['N° série','serial'],['Statut','state'],['Réception','reception_date'],['Mise en service','service_date'],['Âge','age_years'],['Docs','doc_count'],[''  ,null]]
                    : [['Nom','name'],['Usager','contact'],['N° usager','contact_num'],['Groupe','group'],['Lieu','location'],...(extraCol ? [extraCol] : []),['Modèle','model'],['N° série','serial'],['Statut','state'],['Réception','reception_date'],['Mise en service','service_date'],['Âge','age_years'],['Docs','doc_count'],['' ,null]];
                  const thSort = (key: string | null) => {
                    if (!key) return;
                    if (sortCol === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
                    else { setSortCol(key); setSortDir('asc'); }
                    setStart(0);
                  };
                  return (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.86rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'left', color: C.slate }}>
                      {hdrs.map(([h, sk]) => (
                        <th key={h || 'arrow'} onClick={() => thSort(sk)}
                          style={{ padding: '10px 14px', fontWeight: 700, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.02em', cursor: sk ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap' }}>
                          {h}
                          {sk && <span style={{ marginLeft: 4, opacity: sortCol === sk ? 1 : 0.3 }}>{sortCol === sk ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={`${r.itemtype_label}-${r.id}`} onClick={() => openDetail(r.id, r.type_key || undefined)} style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: C.text }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {(type === 'ordinateurs' || (isTous && r.type_key === 'ordinateurs')) &&
                              <AdSeenDot lastSeen={r.ad_last_seen} lastUser={r.ad_last_user} />}
                            {v(r.name)}
                          </span>
                        </td>
                        {isTous && <td style={{ padding: '10px 14px' }}>{r.itemtype_label ? <span style={{ background: '#f1f5f9', color: C.slate, padding: '2px 8px', borderRadius: 6, fontSize: '.78rem', fontWeight: 600 }}>{r.itemtype_label}</span> : v(null)}</td>}
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
                            {source === 'hub' && (
                              <button onClick={e => { e.stopPropagation(); handleSwap(r); }} disabled={!!swapping[`${r.type_key || type}-${r.id}`]}
                                title="Inverser Usager ↔ N° usager"
                                style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 5, cursor: 'pointer', padding: '2px 5px', color: C.slate, display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                                {swapping[`${r.type_key || type}-${r.id}`] ? <RefreshCw size={11} className="spin" /> : <ArrowLeftRight size={11} />}
                              </button>
                            )}
                            {r.contact
                              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                  {r.ad_found && <span title="Trouvé dans l'AD"><ShieldCheck size={13} color="#7c3aed" /></span>}
                                  <User size={13} color={C.green} />
                                  {r.contact}
                                </span>
                              : <span style={{ color: '#cbd5e1' }}>—</span>}
                            {source === 'hub' && (
                              <button onClick={e => { e.stopPropagation(); openAdModal(r); }} title="Recherche Active Directory"
                                style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 5, cursor: 'pointer', padding: '2px 5px', color: C.slate, display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                                <Search size={11} />
                              </button>
                            )}
                          </div>
                          {r.contact_email && <div style={{ fontSize: '.72rem', color: C.slate, marginTop: 2, paddingLeft: source === 'hub' ? 26 : 0 }}>{r.contact_email}</div>}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '.82rem', color: C.slate }}>{v(r.contact_num)}</td>
                        <td style={{ padding: '10px 14px', fontSize: '.82rem' }}>{r.group ? <span style={{ background: '#f5f3ff', color: '#7c3aed', padding: '2px 8px', borderRadius: 6, fontSize: '.76rem', fontWeight: 600 }}>{r.group}</span> : v(null)}</td>
                        <td style={{ padding: '10px 14px' }}>{v(r.location)}</td>
                        {extraCol && (
                          <td style={{ padding: '10px 14px', fontSize: '.82rem', color: C.slate }}>
                            {extraCol[1] === 'type'
                              ? (r.type ? <span style={{ background: '#f1f5f9', color: C.slate, padding: '2px 8px', borderRadius: 6, fontSize: '.76rem', fontWeight: 600 }}>{r.type}</span> : v(null))
                              : v(r.manufacturer)}
                          </td>
                        )}
                        <td style={{ padding: '10px 14px', color: C.slate }}>{v(r.model)}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '.8rem' }}>{v(r.serial)}</td>
                        <td style={{ padding: '10px 14px' }}>{r.state ? <span style={{ background: '#eff6ff', color: C.blue, padding: '2px 8px', borderRadius: 6, fontSize: '.78rem', fontWeight: 600 }}>{r.state}</span> : v(null)}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '.8rem', color: C.slate }}>{v(fmtDate(r.reception_date))}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {r.service_date
                            ? <span style={{ fontFamily: 'monospace', fontSize: '.8rem', fontWeight: 600, color: C.slate }}>{fmtDate(r.service_date)}</span>
                            : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {r.age_years != null
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.slate }}>
                                {r.age_source === 'delivery'
                                  ? <span title="Calculé depuis la date de réception"><CalendarCheck2 size={13} color={C.green} /></span>
                                  : r.age_source === 'buy_date'
                                  ? <span title="Calculé depuis la date d'achat"><CalendarDays size={13} color={C.amber} /></span>
                                  : null}
                                {r.age_years} an{r.age_years >= 2 ? 's' : ''}
                              </span>
                            : v(null)}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {r.doc_count > 0
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eff6ff', color: C.blue, padding: '2px 8px', borderRadius: 6, fontSize: '.78rem', fontWeight: 700 }}><FileText size={12} />{r.doc_count}</span>
                            : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}><ChevronRight size={16} color="#cbd5e1" /></td>
                      </tr>
                    ))}
                    {!loadingList && rows.length === 0 && (
                      <tr><td colSpan={colSpan} style={{ padding: 40, textAlign: 'center', color: C.slate }}>Aucun équipement trouvé.</td></tr>
                    )}
                  </tbody>
                </table>
                  );
                })()}
              </div>
              {/* Pagination */}
              {total > limit && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 14, borderTop: `1px solid ${C.border}` }}>
                  <button disabled={start === 0} onClick={() => setStart(Math.max(0, start - limit))} style={btnPage(start === 0)}>‹ Précédent</button>
                  <span style={{ fontSize: '.84rem', color: C.slate }}>{start + 1}–{Math.min(start + limit, total)} sur {total}</span>
                  <button disabled={start + limit >= total} onClick={() => setStart(start + limit)} style={btnPage(start + limit >= total)}>Suivant ›</button>
                </div>
              )}
            </div>
            </>
            )}
          </>
        )}

        {/* ─── STOCK ─── */}
        {tab === 'stock' && (
          <>
            {stockErr && <ErrBox msg={stockErr} source={source} />}
            {loadingStock && <Loading label="Chargement du stock…" />}
            {!loadingStock && !stockErr && (() => {
              const stockTypes = [...new Set(stockGroups.map(g => g.itemtype_label).filter(Boolean))].sort();
              const stockMans  = [...new Set(stockGroups.map(g => g.manufacturer).filter(m => m && m !== '—'))].sort();
              const filtered   = stockGroups
                .filter(g => !fStockType  || g.itemtype_label === fStockType)
                .filter(g => !fStockMan   || g.manufacturer   === fStockMan)
                .filter(g => !fStockStatut || g[fStockStatut] > 0);
              const totalFiltered = filtered.reduce((s, g) => s + g.total, 0);
              // Regroupement par type
              const byType: Record<string, any[]> = {};
              for (const g of filtered) {
                const t = g.itemtype_label || '—';
                if (!byType[t]) byType[t] = [];
                byType[t].push(g);
              }
              const thSt: React.CSSProperties = { padding: '10px 14px', fontWeight: 700, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.02em', textAlign: 'center' as const };
              return (
                <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                  {/* Filtres */}
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <select value={fStockType} onChange={e => setFStockType(e.target.value)} style={selStyle}>
                      <option value="">Tous les types</option>
                      {stockTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select value={fStockMan} onChange={e => setFStockMan(e.target.value)} style={selStyle}>
                      <option value="">Toutes les marques</option>
                      {stockMans.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {/* Filtres par statut */}
                    {[
                      { k: 'En stock neuf',       label: 'Neuf',       color: '#059669', bg: '#f0fdf4' },
                      { k: 'En stock masterisé',  label: 'Masterisé',  color: '#7c3aed', bg: '#f5f3ff' },
                      { k: 'En stock',            label: 'En stock',   color: C.blue,    bg: '#eff6ff' },
                    ].map(s => {
                      const active = fStockStatut === s.k;
                      return (
                        <button key={s.k} onClick={() => setFStockStatut(active ? '' : s.k)}
                          style={{ padding: '6px 12px', borderRadius: 20, border: `2px solid ${active ? s.color : C.border}`, background: active ? s.bg : '#fff', color: active ? s.color : C.slate, fontWeight: 700, fontSize: '.8rem', cursor: 'pointer' }}>
                          {s.label}
                        </button>
                      );
                    })}
                    {(fStockType || fStockMan || fStockStatut) && (
                      <button onClick={() => { setFStockType(''); setFStockMan(''); setFStockStatut(''); }} style={{ ...btn(C.slate), background: '#f1f5f9', color: C.text, padding: '7px 12px' }}>
                        <X size={13} /> Effacer
                      </button>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: '.82rem', color: C.slate }}>
                      <b style={{ color: C.text }}>{totalFiltered}</b> matériel(s) en stock
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.86rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left', color: C.slate }}>
                          <th style={{ padding: '10px 14px', fontWeight: 700, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.02em' }}>Marque</th>
                          <th style={{ padding: '10px 14px', fontWeight: 700, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.02em' }}>Modèle</th>
                          <th style={{ ...thSt, color: '#059669' }}>Neuf</th>
                          <th style={{ ...thSt, color: '#7c3aed' }}>Masterisé</th>
                          <th style={{ ...thSt, color: C.blue }}>En stock</th>
                          <th style={{ padding: '10px 14px', fontWeight: 700, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.02em', textAlign: 'center' }}>Âge moyen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(byType).map(([typeLabel, groups]) => {
                          const open = stockExpanded.has(typeLabel);
                          const typeTotal = (groups as any[]).reduce((s: number, g: any) => s + g.total, 0);
                          const toggle = () => setStockExpanded(prev => {
                            const next = new Set(prev);
                            open ? next.delete(typeLabel) : next.add(typeLabel);
                            return next;
                          });
                          return (
                            <React.Fragment key={typeLabel}>
                              <tr onClick={toggle} style={{ background: '#f1f5f9', cursor: 'pointer', userSelect: 'none' }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#e8eef6')}
                                onMouseLeave={e => (e.currentTarget.style.background = '#f1f5f9')}>
                                <td colSpan={6} style={{ padding: '8px 14px', fontWeight: 800, fontSize: '.78rem', color: C.blue, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    <ChevronRight size={14} style={{ transition: 'transform .18s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }} />
                                    {typeLabel === 'Téléphones'
                                      ? <><Phone size={14} color="#2563eb" /><Tablet size={14} color="#7c3aed" />{typeLabel}</>
                                      : typeLabel}
                                    <span style={{ background: '#eff6ff', color: C.blue, borderRadius: 20, padding: '1px 8px', fontWeight: 700, fontSize: '.76rem', marginLeft: 4 }}>{typeTotal}</span>
                                  </span>
                                </td>
                              </tr>
                              {open && (groups as any[]).map((g: any, i: number) => {
                                const makeCountCell = (statut: string, color: string, bg: string) => {
                                  const count = g[statut] || 0;
                                  const items = (g.items?.[statut] || []) as any[];
                                  const total = count;
                                  if (!count) return <td key={statut} style={{ padding: '10px 14px', textAlign: 'center' }}><span style={{ color: '#cbd5e1' }}>—</span></td>;
                                  return (
                                    <td key={statut} style={{ padding: '10px 14px', textAlign: 'center', position: 'relative' }}>
                                      <span
                                        style={{ background: bg, color, padding: '2px 10px', borderRadius: 20, fontWeight: 700, fontSize: '.82rem', cursor: 'default' }}
                                        onMouseEnter={e => {
                                          if (tooltipHideTimer.current) clearTimeout(tooltipHideTimer.current);
                                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                                          setStockTooltip({ items, statut, total, x: rect.left + rect.width / 2, y: rect.bottom + 4 });
                                        }}
                                        onMouseLeave={() => {
                                          tooltipHideTimer.current = setTimeout(() => setStockTooltip(null), 180);
                                        }}
                                      >{count}</span>
                                    </td>
                                  );
                                };
                                return (
                                  <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                                    <td style={{ padding: '10px 14px', fontWeight: 600, color: C.text }}>{g.manufacturer}</td>
                                    <td style={{ padding: '10px 14px', color: C.slate }}>{g.model}</td>
                                    {makeCountCell('En stock neuf',      '#059669', '#f0fdf4')}
                                    {makeCountCell('En stock masterisé', '#7c3aed', '#f5f3ff')}
                                    {makeCountCell('En stock',           C.blue,    '#eff6ff')}
                                    <td style={{ padding: '10px 14px', textAlign: 'center', color: C.slate, fontSize: '.82rem' }}>{g.age_moyen != null ? `${g.age_moyen} an${g.age_moyen >= 2 ? 's' : ''}` : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                        {filtered.length === 0 && (
                          <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: C.slate }}>Aucun matériel en stock.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ─── USAGERS ─── */}
        {tab === 'usagers' && (
          <>
            {usagerErr && <ErrBox msg={usagerErr} source={source} />}
            {loadingUsagers && !usagers.length && <Loading label="Calcul des usagers…" />}
            {!loadingUsagers && !usagerErr && (
              <div style={{ display: 'grid', gridTemplateColumns: selectedContact ? '1fr 1fr' : '1fr', gap: 18 }}>
                {/* Liste usagers */}
                <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <Search size={14} style={{ position: 'absolute', left: 9, top: 9, color: C.slate }} />
                      <input
                        value={searchUsager}
                        onChange={e => setSearchUsager(e.target.value)}
                        placeholder="Rechercher un usager…"
                        style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: '.85rem', boxSizing: 'border-box' }}
                      />
                      {searchUsager && (
                        <button onClick={() => setSearchUsager('')} style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', cursor: 'pointer', color: C.slate, padding: 0, lineHeight: 1 }}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <span style={{ fontSize: '.82rem', color: C.slate, whiteSpace: 'nowrap' }}>
                      <b style={{ color: C.text }}>{usagers.filter(u => !searchUsager || u.contact.toLowerCase().includes(searchUsager.toLowerCase())).length}</b> / {usagers.length}
                    </span>
                  </div>
                  <div style={{ overflowY: 'auto', maxHeight: '70vh' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.86rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left', color: C.slate }}>
                          {['Usager', 'Équipements', 'Répartition', ''].map((h, i) =>
                            <th key={i} style={{ padding: '9px 14px', fontWeight: 700, fontSize: '.76rem', textTransform: 'uppercase', letterSpacing: '.02em' }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {usagers.filter(u => !searchUsager || u.contact.toLowerCase().includes(searchUsager.toLowerCase())).map(u => (
                          <tr key={u.contact} onClick={() => selectContact(u.contact)}
                            style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer', background: selectedContact === u.contact ? '#eff6ff' : '' }}
                            onMouseEnter={e => { if (selectedContact !== u.contact) e.currentTarget.style.background = '#f8fafc'; }}
                            onMouseLeave={e => { if (selectedContact !== u.contact) e.currentTarget.style.background = ''; }}>
                            <td style={{ padding: '9px 14px', fontWeight: 600, color: C.text }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                {u.ad_found && <span title="Trouvé dans l'AD"><ShieldCheck size={13} color="#7c3aed" /></span>}
                                {u.contact}
                              </span>
                            </td>
                            <td style={{ padding: '9px 14px' }}>
                              <span style={{ background: '#eff6ff', color: C.blue, padding: '2px 10px', borderRadius: 20, fontWeight: 800, fontSize: '.85rem' }}>{u.count}</span>
                            </td>
                            <td style={{ padding: '9px 14px', fontSize: '.78rem', color: C.slate }}>
                              {Object.entries(u.by_type).map(([label, n]) => (
                                <span key={label} style={{ marginRight: 8 }}><b style={{ color: C.text }}>{n}</b> {label}</span>
                              ))}
                            </td>
                            <td style={{ padding: '9px 14px', textAlign: 'right' }}><ChevronRight size={15} color={selectedContact === u.contact ? C.blue : '#cbd5e1'} /></td>
                          </tr>
                        ))}
                        {usagers.length === 0 && (
                          <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: C.slate }}>
                            {searchUsager ? `Aucun usager correspondant à « ${searchUsager} ».` : 'Aucun usager avec équipement dans le parc.'}
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Équipements de l'usager sélectionné */}
                {selectedContact && (
                  <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.blue}`, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: '.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, color: C.text }}>
                        <User size={15} color={C.blue} /> {selectedContact}
                        <span style={{ background: '#eff6ff', color: C.blue, padding: '1px 8px', borderRadius: 20, fontWeight: 800 }}>{contactItems.length}</span>
                      </span>
                      <button onClick={() => { setSelectedContact(null); setContactItems([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate }}><X size={16} /></button>
                    </div>
                    {loadingContact && <Loading label="Chargement…" />}
                    <div style={{ overflowY: 'auto', maxHeight: 'calc(70vh - 46px)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.84rem' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', textAlign: 'left', color: C.slate }}>
                            {['Nom', 'Type', 'Lieu', 'Statut', 'Docs', ''].map((h, i) =>
                              <th key={i} style={{ padding: '8px 12px', fontWeight: 700, fontSize: '.74rem', textTransform: 'uppercase', letterSpacing: '.02em' }}>{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {contactItems.map(r => (
                            <tr key={`${r.type_key}-${r.id}`} onClick={() => openDetail(r.id, r.type_key || 'ordinateurs')}
                              style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: C.text }}>{v(r.name)}</td>
                              <td style={{ padding: '8px 12px' }}>{r.itemtype_label ? <span style={{ background: '#f1f5f9', color: C.slate, padding: '1px 7px', borderRadius: 5, fontSize: '.76rem', fontWeight: 600 }}>{r.itemtype_label}</span> : v(null)}</td>
                              <td style={{ padding: '8px 12px', color: C.slate }}>{v(r.location)}</td>
                              <td style={{ padding: '8px 12px' }}>{r.state ? <span style={{ background: '#eff6ff', color: C.blue, padding: '1px 7px', borderRadius: 5, fontSize: '.76rem', fontWeight: 600 }}>{r.state}</span> : v(null)}</td>
                              <td style={{ padding: '8px 12px' }}>
                                {r.doc_count > 0
                                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#eff6ff', color: C.blue, padding: '1px 7px', borderRadius: 5, fontSize: '.76rem', fontWeight: 700 }}><FileText size={11} />{r.doc_count}</span>
                                  : <span style={{ color: '#cbd5e1' }}>—</span>}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right' }}><ChevronRight size={14} color="#cbd5e1" /></td>
                            </tr>
                          ))}
                          {!loadingContact && contactItems.length === 0 && (
                            <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: C.slate }}>Aucun équipement.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {/* ─── GÉO ─── */}
        {tab === 'geo' && (() => {
          if (loadingGeo && !geoRows.length) return <Loading label="Chargement de la vue géographique…" />;
          if (geoErr) return <ErrBox msg={geoErr} source={source} />;

          // Construction de l'arbre : lieu → sous-groupes par type → items
          const locMap = new Map<string, Row[]>();
          for (const r of geoRows) {
            const loc = r.location || '— Non localisé —';
            if (!locMap.has(loc)) locMap.set(loc, []);
            locMap.get(loc)!.push(r);
          }
          const locs = [...locMap.entries()].sort((a, b) => b[1].length - a[1].length);

          const toggleLoc = (loc: string) => {
            setGeoExpanded(prev => {
              const n = new Set(prev);
              n.has(loc) ? n.delete(loc) : n.add(loc);
              return n;
            });
            setGeoSelectedLoc(prev => prev === loc ? null : loc);
            setGeoSelectedType(null); // sélection du lieu = tous les types
          };
          const selectType = (loc: string, t: string) => {
            setGeoExpanded(prev => new Set(prev).add(loc));
            setGeoSelectedLoc(loc);
            setGeoSelectedType(prev => (geoSelectedLoc === loc && prev === t) ? null : t);
          };

          return (
            <div style={{ display: 'grid', gridTemplateColumns: geoSelectedLoc ? '380px 1fr' : '1fr', gap: 18, alignItems: 'start' }}>
              {/* Arborescence lieux */}
              <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: '.82rem', color: C.slate, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MapPin size={14} color={C.blue} />
                  <b style={{ color: C.text }}>{locs.length}</b> lieu(x) · <b style={{ color: C.text }}>{geoRows.length}</b> équipements
                </div>
                <div style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                  {locs.map(([loc, items]) => {
                    const expanded = geoExpanded.has(loc);
                    const selected = geoSelectedLoc === loc;
                    // Compte par type
                    const byType: Record<string, number> = {};
                    for (const r of items) { const t = r.itemtype_label || 'Autre'; byType[t] = (byType[t] || 0) + 1; }
                    return (
                      <div key={loc}>
                        <div onClick={() => toggleLoc(loc)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`, background: selected ? '#eff6ff' : undefined }}
                          onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#f8fafc'; }}
                          onMouseLeave={e => { if (!selected) e.currentTarget.style.background = ''; }}>
                          <span style={{ fontSize: 13, transition: 'transform .15s', transform: expanded ? 'rotate(90deg)' : '' }}>›</span>
                          <MapPin size={13} color={selected ? C.blue : C.slate} />
                          <span style={{ flex: 1, fontSize: '.88rem', fontWeight: selected ? 700 : 600, color: selected ? C.blue : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc}</span>
                          <span style={{ background: selected ? C.blue : '#f1f5f9', color: selected ? '#fff' : C.slate, padding: '1px 8px', borderRadius: 20, fontSize: '.75rem', fontWeight: 700, flexShrink: 0 }}>{items.length}</span>
                        </div>
                        {expanded && (
                          <div style={{ paddingLeft: 24, background: '#fafbff', borderBottom: `1px solid ${C.border}` }}>
                            {Object.entries(byType).map(([t, n]) => {
                              const typeSelected = selected && geoSelectedType === t;
                              return (
                                <div key={t} onClick={(e) => { e.stopPropagation(); selectType(loc, t); }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 16px', fontSize: '.8rem', cursor: 'pointer', borderBottom: `1px solid #f1f5f9`, background: typeSelected ? '#e0edff' : undefined }}
                                  onMouseEnter={e => { if (!typeSelected) e.currentTarget.style.background = '#f1f5f9'; }}
                                  onMouseLeave={e => { if (!typeSelected) e.currentTarget.style.background = ''; }}>
                                  <span style={{ fontSize: 11, color: typeSelected ? C.blue : '#cbd5e1' }}>•</span>
                                  <span style={{ flex: 1, color: typeSelected ? C.blue : C.slate, fontWeight: typeSelected ? 700 : 400 }}>{t}</span>
                                  <span style={{ fontWeight: 700, color: typeSelected ? C.blue : C.text }}>{n}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Liste des équipements du lieu sélectionné */}
              {geoSelectedLoc && (() => {
                const allItems = locMap.get(geoSelectedLoc) || [];
                const items = geoSelectedType ? allItems.filter(r => (r.itemtype_label || 'Autre') === geoSelectedType) : allItems;
                return (
                  <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.blue}`, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <MapPin size={14} color={C.blue} />
                      <span style={{ fontWeight: 700, color: C.text, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {geoSelectedLoc}
                        {geoSelectedType && <>
                          <ChevronRight size={14} color={C.slate} />
                          <span style={{ background: '#eff6ff', color: C.blue, padding: '1px 8px', borderRadius: 6, fontSize: '.8rem' }}>{geoSelectedType}</span>
                          <button onClick={() => setGeoSelectedType(null)} title="Tous les types" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate, padding: 0, display: 'inline-flex' }}><X size={12} /></button>
                        </>}
                      </span>
                      <span style={{ flex: 1 }} />
                      <span style={{ background: '#eff6ff', color: C.blue, padding: '1px 8px', borderRadius: 20, fontWeight: 700, fontSize: '.8rem' }}>{items.length}</span>
                      <button onClick={() => { setGeoSelectedLoc(null); setGeoSelectedType(null); setGeoExpanded(new Set()); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate }}><X size={15} /></button>
                    </div>
                    <div style={{ maxHeight: '68vh', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.84rem' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', color: C.slate }}>
                            {['Nom','Type','Usager','Statut','Mise en service',''].map((h, i) => (
                              <th key={i} style={{ padding: '8px 12px', fontWeight: 700, fontSize: '.74rem', textTransform: 'uppercase', letterSpacing: '.02em', textAlign: 'left' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {items.map(r => (
                            <tr key={`${r.type_key}-${r.id}`} onClick={() => openDetail(r.id, r.type_key || 'ordinateurs')}
                              style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: C.text }}>{v(r.name)}</td>
                              <td style={{ padding: '8px 12px' }}>{r.itemtype_label ? <span style={{ background: '#f1f5f9', color: C.slate, padding: '1px 7px', borderRadius: 5, fontSize: '.74rem', fontWeight: 600 }}>{r.itemtype_label}</span> : v(null)}</td>
                              <td style={{ padding: '8px 12px', fontSize: '.8rem' }}>
                                {r.contact ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  {r.ad_found && <span title="Dans l'AD"><ShieldCheck size={11} color="#7c3aed" /></span>}
                                  <User size={11} color={C.green} />{r.contact}
                                </span> : v(null)}
                              </td>
                              <td style={{ padding: '8px 12px' }}>{r.state ? <span style={{ background: '#eff6ff', color: C.blue, padding: '1px 7px', borderRadius: 5, fontSize: '.74rem', fontWeight: 600 }}>{r.state}</span> : v(null)}</td>
                              <td style={{ padding: '8px 12px' }}>
                                {r.service_date
                                  ? <span style={{ fontFamily: 'monospace', fontSize: '.76rem', fontWeight: 600, color: C.slate }}>{r.service_date}</span>
                                  : v(null)}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right' }}><ChevronRight size={14} color="#cbd5e1" /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* ─── DÉPLOIEMENTS ─── */}
        {tab === 'deploiements' && (() => {
          const fmtD = (s: string | null) => {
            if (!s) return '—';
            const dt = s.substring(0, 10).split('-');
            return `${dt[2]}/${dt[1]}/${dt[0]}`;
          };
          const matchBadge = (row: any) => {
            if (!row.uc_nouveau_num) return null;
            const mt = row.match_type;
            if (mt === 'full') return <span style={{ background: '#dcfce7', color: '#15803d', padding: '1px 8px', borderRadius: 10, fontSize: '.72rem', fontWeight: 700 }}>✓ Match</span>;
            if (mt === 'name_only') return <span style={{ background: '#fef9c3', color: '#92400e', padding: '1px 8px', borderRadius: 10, fontSize: '.72rem', fontWeight: 700 }}>N° OK / S/N ?</span>;
            if (mt === 'conflict') return <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '1px 8px', borderRadius: 10, fontSize: '.72rem', fontWeight: 700 }}>Conflit S/N</span>;
            return <span style={{ background: '#f1f5f9', color: '#64748b', padding: '1px 8px', borderRadius: 10, fontSize: '.72rem', fontWeight: 700 }}>Non trouvé</span>;
          };
          // Détermine le type d'équipement déployé (affiché en colonne).
          // Source de vérité : la catégorie calculée par l'API (row.equip_cat).
          const equipType = (row: any): { label: string; color: string; bg: string; icon: string } => {
            if (row.equip_cat && EQUIP_CAT_META[row.equip_cat]) return EQUIP_CAT_META[row.equip_cat];
            const mt = (row.materiel_type || '').toUpperCase().trim().replace(/\s+/g, ' ');
            const ucNum = (row.uc_nouveau_num || row.uc_recupere_num || '').toUpperCase();
            const isPortable = /^PO/.test(ucNum);

            // ── Correspondances directes sur materiel_type (source deploy.xlsx) ──
            if (mt) {
              // Écrans seuls
              if (/^(ECRAN|EC\d+|EC$)$/.test(mt)) return { label: 'Écran', color: '#0891b2', bg: '#e0f2fe', icon: 'Monitor' };
              // PC fixes (UC, AIO, iMac)
              if (mt === 'AIO' || mt === 'IMAC') return { label: 'PC Tout-en-un', color: '#7c3aed', bg: '#faf5ff', icon: 'Monitor' };
              if (mt === 'UC') return { label: 'PC Fixe', color: '#1d4ed8', bg: '#dbeafe', icon: 'Monitor' };
              // PC portables
              if (mt === 'PO' || mt === 'MACBOOK') return { label: 'PC Portable', color: '#1d4ed8', bg: '#dbeafe', icon: 'Laptop' };
              // Imprimantes / scanners
              if (mt === 'IMP') return { label: 'Imprimante', color: '#b45309', bg: '#fef3c7', icon: 'Printer' };
              if (mt === 'SCANNER') return { label: 'Scanner', color: '#b45309', bg: '#fef3c7', icon: 'Printer' };
              // Périphériques
              if (mt === 'PERIPH') return { label: 'Périphérique', color: '#059669', bg: '#d1fae5', icon: 'HardDrive' };
              if (mt === 'TABLETTE') return { label: 'Tablette', color: '#7c3aed', bg: '#faf5ff', icon: 'Tablet' };
              if (mt === 'VIDEO PROJECTEUR') return { label: 'Vidéo-proj.', color: '#64748b', bg: '#f1f5f9', icon: 'Projector' };
              // Bundles PC+Écran+Imprimante
              if (mt.includes('IMP') && (mt.includes('UC') || mt.includes('PO')) && mt.includes('EC'))
                return { label: 'PC + Écran + Imp.', color: '#dc2626', bg: '#fef2f2', icon: 'Monitor' };
              // Bundles PC+Écran
              if ((mt.startsWith('UC') || mt.startsWith('AIO')) && mt.includes('EC'))
                return { label: 'PC Fixe + Écran', color: '#1d4ed8', bg: '#dbeafe', icon: 'Monitor' };
              if (mt.startsWith('PO') && mt.includes('EC'))
                return { label: 'PC Port. + Écran', color: '#1d4ed8', bg: '#dbeafe', icon: 'Laptop' };
              // Bundles PC+Imprimante
              if ((mt.startsWith('UC') || mt.startsWith('PO')) && mt.includes('IMP'))
                return { label: 'PC + Imprimante', color: '#1d4ed8', bg: '#dbeafe', icon: 'Monitor' };
            }

            // ── Fallback : inférence depuis les colonnes ──
            const hasUcNew = !!row.uc_nouveau_num;
            const hasEcNew = !!(row.ecran1_nouveau_num || row.ecran1_nouveau_serie || row.ecran2_nouveau_serie);
            const hasUcRec = !!row.uc_recupere_num;
            const hasEcRec = !!(row.ecran1_recupere_num);

            if (hasUcNew && hasEcNew)
              return isPortable
                ? { label: 'PC Port. + Écran', color: '#1d4ed8', bg: '#dbeafe', icon: 'Laptop' }
                : { label: 'PC Fixe + Écran',  color: '#1d4ed8', bg: '#dbeafe', icon: 'Monitor' };
            if (hasUcNew)
              return isPortable
                ? { label: 'PC Portable', color: '#1d4ed8', bg: '#dbeafe', icon: 'Laptop' }
                : { label: 'PC Fixe',     color: '#1d4ed8', bg: '#dbeafe', icon: 'Monitor' };
            if (hasEcNew) return { label: 'Écran', color: '#0891b2', bg: '#e0f2fe', icon: 'Monitor' };

            // Retours : analyser le récupéré
            if (hasUcRec || hasEcRec) {
              const recUcNum = (row.uc_recupere_num || '').toUpperCase();
              const isRecPortable = /^PO/.test(recUcNum);
              if (hasUcRec && hasEcRec)
                return isRecPortable
                  ? { label: 'PC Port. + Écran', color: '#64748b', bg: '#f1f5f9', icon: 'Laptop' }
                  : { label: 'PC Fixe + Écran',  color: '#64748b', bg: '#f1f5f9', icon: 'Monitor' };
              if (hasUcRec)
                return isRecPortable
                  ? { label: 'PC Portable', color: '#64748b', bg: '#f1f5f9', icon: 'Laptop' }
                  : { label: 'PC Fixe',     color: '#64748b', bg: '#f1f5f9', icon: 'Monitor' };
              if (hasEcRec) return { label: 'Écran', color: '#64748b', bg: '#f1f5f9', icon: 'Monitor' };
            }

            // Hints depuis type_operation
            const op = (row.type_operation || '').toLowerCase();
            if (op.includes('imprimante') || op.includes('impr'))
              return { label: 'Imprimante', color: '#b45309', bg: '#fef3c7', icon: 'Printer' };

            return { label: '—', color: '#94a3b8', bg: 'transparent', icon: '' };
          };

          const typeBadge = (op: string | null) => {
            if (!op) return null;
            const map: Record<string, { bg: string; color: string }> = {
              'Remplacement de matériel': { bg: '#eff6ff', color: '#1d4ed8' },
              'Installation nouveau matériel': { bg: '#f0fdf4', color: '#15803d' },
              'Prêt': { bg: '#fef9c3', color: '#92400e' },
              'Remplacement': { bg: '#f5f3ff', color: '#6d28d9' },
            };
            const s = map[op] || { bg: '#f1f5f9', color: '#475569' };
            return <span style={{ background: s.bg, color: s.color, padding: '1px 8px', borderRadius: 10, fontSize: '.72rem', fontWeight: 700 }}>{op}</span>;
          };

          const types = deployKpis ? (deployKpis.by_type || []).map((t: any) => t.type_operation).filter(Boolean) : [];
          const annees = deployKpis ? (deployKpis.by_annee || []).map((a: any) => String(a.annee)).filter(Boolean) : [];

          // Lieu et statut consolidés : UC > Écran > Périph selon le type de ligne
          const rowLieu = (row: any): string | null => row.uc_lieu || row.ec_lieu || row.periph_lieu || null;
          const rowStatutParc = (row: any): string | null => row.parc_statut || row.ec_statut || row.periph_statut || null;

          // Source badge
          const sourceBadge = (src: string | null) => {
            if (!src || src === 'fiches') return <span style={{ background: '#f0fdf4', color: '#15803d', padding: '1px 7px', borderRadius: 8, fontSize: '.72rem', fontWeight: 700 }}>Fiche</span>;
            if (src === 'deploy_excel') return <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '1px 7px', borderRadius: 8, fontSize: '.72rem', fontWeight: 700 }}>Excel</span>;
            return <span style={{ background: '#f1f5f9', color: C.slate, padding: '1px 7px', borderRadius: 8, fontSize: '.72rem', fontWeight: 700 }}>{src}</span>;
          };

          // Nom affiché du périph : extrait le nom du format "Périph: NomModèle (SERIAL)" ou "Périph: null (SERIAL)"
          const periphDisplay = (autre_designation: string | null): { nom: string | null; serial: string | null } => {
            if (!autre_designation) return { nom: null, serial: null };
            const m = autre_designation.match(/^Périph:\s*(.+?)\s*\(([^)]+)\)$/);
            if (!m) return { nom: autre_designation, serial: null };
            const nom = m[1] === 'null' ? null : m[1];
            return { nom, serial: m[2] };
          };

          return (
            <div>
              {deployErr && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: '.88rem' }}>{deployErr}</div>}

              {/* KPIs */}
              {deployKpis && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 20px', minWidth: 140 }}>
                    <div style={{ fontSize: '.75rem', color: C.slate, fontWeight: 600, marginBottom: 4 }}>Total fiches</div>
                    <div style={{ fontSize: '1.7rem', fontWeight: 900, color: C.text }}>{deployKpis.total ?? 0}</div>
                  </div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 20px', minWidth: 200 }}>
                    <div style={{ fontSize: '.75rem', color: C.slate, fontWeight: 600, marginBottom: 6 }}>Rapprochements parc</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 10px', borderRadius: 10, fontSize: '.78rem', fontWeight: 700 }}>
                        {deployKpis.match_stats?.match_full ?? 0} match complet
                      </span>
                      <span style={{ background: '#fef9c3', color: '#92400e', padding: '2px 10px', borderRadius: 10, fontSize: '.78rem', fontWeight: 700 }}>
                        {deployKpis.match_stats?.match_partial ?? 0} partiel
                      </span>
                      <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 10px', borderRadius: 10, fontSize: '.78rem', fontWeight: 700 }}>
                        {deployKpis.match_stats?.no_match ?? 0} non trouvé
                      </span>
                      {(deployKpis.nb_conflits ?? 0) > 0 && (
                        <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 10px', borderRadius: 10, fontSize: '.78rem', fontWeight: 700 }}>
                          {deployKpis.nb_conflits} conflit{deployKpis.nb_conflits > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 20px', minWidth: 200 }}>
                    <div style={{ fontSize: '.75rem', color: C.slate, fontWeight: 600, marginBottom: 6 }}>Par type d'opération</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(deployKpis.by_type || []).slice(0, 4).map((t: any) => (
                        <span key={t.type_operation} style={{ background: '#eff6ff', color: C.blue, padding: '2px 10px', borderRadius: 10, fontSize: '.75rem', fontWeight: 700 }}>
                          {t.type_operation} ({t.n})
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 20px', minWidth: 140 }}>
                    <div style={{ fontSize: '.75rem', color: C.slate, fontWeight: 600, marginBottom: 4 }}>Avec fichier lié</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: C.slate }}>{deployKpis.nb_fichier_lie ?? 0}</div>
                  </div>
                </div>
              )}

              {/* ── Graphiques de déploiement ── */}
              {deployKpis && (() => {
                const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column' };
                const titleSt: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, fontSize: '.82rem', fontWeight: 800, color: C.text, marginBottom: 12 };
                // Cadence : annuelle par défaut, mensuelle (mois par mois) quand une année est sélectionnée
                const cadenceMensuelle = !!deployAnnee;
                const MOIS_LABELS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
                let cadence: any[];
                if (cadenceMensuelle) {
                  // 12 mois pré-initialisés pour un axe continu
                  const moisRows = Array.from({ length: 12 }, (_, i) => ({ periode: MOIS_LABELS[i], mois: i + 1, total: 0 }));
                  for (const r of (deployKpis.by_mois_equip || [])) {
                    const m = parseInt(r.mois, 10);
                    if (m >= 1 && m <= 12) {
                      const o: any = moisRows[m - 1]; o[r.cat] = (o[r.cat] || 0) + r.n; o.total += r.n;
                    }
                  }
                  cadence = moisRows;
                } else {
                  const cadenceMap = new Map<string, any>();
                  for (const r of (deployKpis.by_annee_equip || [])) {
                    const y = String(r.annee);
                    if (!cadenceMap.has(y)) cadenceMap.set(y, { periode: y, total: 0 });
                    const o = cadenceMap.get(y); o[r.cat] = (o[r.cat] || 0) + r.n; o.total += r.n;
                  }
                  cadence = [...cadenceMap.values()].sort((a, b) => a.periode.localeCompare(b.periode));
                }
                const cadenceCats = CADENCE_CATS.filter(c => cadence.some(row => (row[c.key] || 0) > 0));
                const types = (deployKpis.by_type || []).map((t: any) => ({ label: t.type_operation, value: t.n }));
                const dirs = (deployKpis.by_direction || []).slice(0, 8).map((d: any) => ({ label: d.direction, n: d.n }));
                const installs = (deployKpis.by_installateur || []).slice(0, 8).map((i: any) => ({ label: i.installateur, n: i.n }));

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14, marginBottom: 18 }}>
                    {/* Cadence annuelle par type d'équipement (empilé) */}
                    <div style={{ ...card, gridColumn: 'span 2', minWidth: 0 }}>
                      <div style={titleSt}><TrendingUp size={15} color={C.blue} /> {cadenceMensuelle ? `Cadence de déploiement ${deployAnnee} — mois par mois, par type d'équipement` : 'Cadence de déploiement par année — par type d\'équipement'}</div>
                      <ResponsiveContainer width="100%" height={230}>
                        <BarChart data={cadence} margin={{ top: 4, right: 12, bottom: 0, left: -18 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                          <XAxis dataKey="periode" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip
                            formatter={(v: any, n: any) => [`${v} déploiement(s)`, (CADENCE_CATS.find(c => c.key === n) || { label: n }).label]}
                            labelFormatter={(l) => cadenceMensuelle ? `${l} ${deployAnnee}` : `Année ${l}`}
                          />
                          {cadenceCats.map((c, i) => (
                            <Bar key={c.key} dataKey={c.key} stackId="eq" fill={c.color}
                              radius={i === cadenceCats.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} maxBarSize={48} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                      {/* Légende */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 6 }}>
                        {cadenceCats.map(c => (
                          <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.7rem', color: C.slate }}>
                            <span style={{ width: 9, height: 9, borderRadius: 2, background: c.color }} />{c.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Type d'opération (donut) */}
                    <div style={card}>
                      <div style={titleSt}><ArrowLeftRight size={15} color="#7c3aed" /> Par type d'opération</div>
                      <ResponsiveContainer width="100%" height={170}>
                        <PieChart>
                          <Pie data={types} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={62} label={(e: any) => e.value}>
                            {types.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                        {types.map((t: any, i: number) => (
                          <span key={t.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.7rem', color: C.slate }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length] }} />{t.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Top directions */}
                    <div style={card}>
                      <div style={titleSt}><MapPin size={15} color="#0891b2" /> Top directions déployées</div>
                      <ResponsiveContainer width="100%" height={Math.max(150, dirs.length * 26)}>
                        <BarChart data={dirs} layout="vertical" margin={{ left: 8, right: 26, top: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: any) => [`${v} fiche(s)`, '']} />
                          <Bar dataKey="n" fill="#0891b2" radius={[0, 4, 4, 0]} barSize={14} label={{ position: 'right', fontSize: 10, fill: C.slate }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Top installateurs */}
                    {installs.length > 0 && (
                      <div style={card}>
                        <div style={titleSt}><User size={15} color="#d97706" /> Top installateurs</div>
                        <ResponsiveContainer width="100%" height={Math.max(150, installs.length * 26)}>
                          <BarChart data={installs} layout="vertical" margin={{ left: 8, right: 26, top: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                            <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 10 }} />
                            <Tooltip formatter={(v: any) => [`${v} déploiement(s)`, '']} />
                            <Bar dataKey="n" fill="#d97706" radius={[0, 4, 4, 0]} barSize={14} label={{ position: 'right', fontSize: 10, fill: C.slate }} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Bandeau conflits */}
              {/* ── Incohérences déploiements ↔ parc ── */}
              <div style={{ marginBottom: 16 }}>
                <button onClick={() => {
                  if (!deployConflictsOpen) loadDeployConflicts();
                  setDeployConflictsOpen(o => !o);
                }} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '.88rem',
                  border: `1px solid ${deployConflictData && deployConflictData.total > 0 ? '#fca5a5' : C.border}`,
                  background: deployConflictData && deployConflictData.total > 0 ? '#fef2f2' : '#f8fafc',
                  color: deployConflictData && deployConflictData.total > 0 ? '#b91c1c' : C.slate,
                }}>
                  <AlertTriangle size={15} /> Incohérences déploiements ↔ parc
                  {deployConflictData && <span style={{ background: deployConflictData.total > 0 ? '#fca5a5' : '#e2e8f0', color: deployConflictData.total > 0 ? '#b91c1c' : C.slate, borderRadius: 20, padding: '1px 9px', fontWeight: 800, fontSize: '.8rem' }}>{deployConflictData.total}</span>}
                  <span style={{ fontSize: '.8rem', fontWeight: 400 }}>{deployConflictsOpen ? '▲' : '▼'}</span>
                </button>
              </div>
              {deployConflictsOpen && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 20, overflow: 'hidden' }}>
                  {/* Compteurs par type */}
                  {deployConflictData && (
                    <div style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap', alignItems: 'center' }}>
                      {([
                        ['', 'Tous', deployConflictData.total, '#1e293b', '#f1f5f9'],
                        ['absent_glpi', 'Absent du parc GLPI', deployConflictData.by_type?.absent_glpi ?? 0, '#b45309', '#fef3c7'],
                        ['serie_conflit', 'N° de série conflit', deployConflictData.by_type?.serie_conflit ?? 0, '#b91c1c', '#fee2e2'],
                        ['recupere_actif', 'Récupéré mais actif', deployConflictData.by_type?.recupere_actif ?? 0, '#7c3aed', '#faf5ff'],
                      ] as [string, string, number, string, string][]).map(([k, label, n, color, bg]) => (
                        <button key={k} onClick={() => setDeployConflictFilter(k)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: `1px solid ${deployConflictFilter === k ? color : C.border}`, background: deployConflictFilter === k ? bg : '#fff', color: deployConflictFilter === k ? color : C.slate, cursor: 'pointer', fontWeight: 600, fontSize: '.82rem' }}>
                          {label} <b>{n}</b>
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ overflowX: 'auto', maxHeight: 380, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                          {['Type', 'Référence', 'Détail', 'Date', 'Bénéficiaire', 'Direction', 'Service'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', fontWeight: 700, fontSize: '.74rem', textTransform: 'uppercase', color: C.slate, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(deployConflicts.filter((c: any) => !deployConflictFilter || c.type_conflit === deployConflictFilter)).map((c: any, i: number) => {
                          const typeInfo: Record<string, { label: string; color: string; bg: string }> = {
                            absent_glpi:   { label: 'Absent GLPI', color: '#b45309', bg: '#fef9c3' },
                            serie_conflit: { label: 'S/N conflit', color: '#b91c1c', bg: '#fee2e2' },
                            recupere_actif:{ label: 'Récupéré actif', color: '#7c3aed', bg: '#faf5ff' },
                          };
                          const ti = typeInfo[c.type_conflit] || { label: c.type_conflit, color: C.slate, bg: '#f1f5f9' };
                          return (
                            <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                              <td style={{ padding: '7px 12px' }}>
                                <span style={{ background: ti.bg, color: ti.color, padding: '2px 8px', borderRadius: 6, fontSize: '.74rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{ti.label}</span>
                              </td>
                              <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontWeight: 700 }}>{c.reference}</td>
                              <td style={{ padding: '7px 12px', color: C.slate, fontSize: '.8rem', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.detail || '—'}</td>
                              <td style={{ padding: '7px 12px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '.78rem' }}>{fmtD(c.date_deploiement)}</td>
                              <td style={{ padding: '7px 12px' }}>{c.beneficiaire || '—'}</td>
                              <td style={{ padding: '7px 12px', fontWeight: 600 }}>{c.direction || '—'}</td>
                              <td style={{ padding: '7px 12px', color: C.slate }}>{c.service || '—'}</td>
                            </tr>
                          );
                        })}
                        {deployConflicts.filter((c: any) => !deployConflictFilter || c.type_conflit === deployConflictFilter).length === 0 && (
                          <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: C.slate }}>Aucune incohérence{deployConflictFilter ? ' pour ce type' : ''}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Filtres */}
              {(() => {
                // Regroupe les directions (variantes → code canonique) pour une liste explicite
                const dirGroups = (() => {
                  const m = new Map<string, { canon: string; variants: string[]; n: number }>();
                  for (const d of deployFacets.directions) {
                    const canon = dirCanonical(d.direction);
                    if (!canon) continue;
                    if (!m.has(canon)) m.set(canon, { canon, variants: [], n: 0 });
                    const g = m.get(canon)!; g.variants.push(d.direction); g.n += d.n;
                  }
                  return [...m.values()].sort((a, b) => b.n - a.n);
                })();
                const selStyleD: React.CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: '.88rem' };
                return (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
                <input value={deployQ} onChange={e => { setDeployQ(e.target.value); setDeployStart(0); }} placeholder="Recherche (bénéficiaire, UC…)"
                  style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: '.88rem', minWidth: 220 }} />
                <select value={deployDir} onChange={e => { setDeployDir(e.target.value); setDeployStart(0); }} style={selStyleD} title="Direction">
                  <option value="">Toutes directions</option>
                  {dirGroups.map(g => <option key={g.canon} value={g.canon}>{dirLabel(g.canon)} ({g.n})</option>)}
                </select>
                <select value={deployEquip} onChange={e => { setDeployEquip(e.target.value); setDeployStart(0); }} style={selStyleD} title="Type d'équipement">
                  <option value="">Tous équipements</option>
                  {EQUIP_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.icon} {o.label}</option>)}
                </select>
                <select value={deployInstall} onChange={e => { setDeployInstall(e.target.value); setDeployStart(0); }} style={selStyleD} title="Installateur">
                  <option value="">Tous installateurs</option>
                  {deployFacets.installateurs.map(i => <option key={i.installateur} value={i.installateur}>{i.installateur} ({i.n})</option>)}
                </select>
                <select value={deployType} onChange={e => { setDeployType(e.target.value); setDeployStart(0); }} style={selStyleD}>
                  <option value="">Tous types</option>
                  {types.map((t: string) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={deployAnnee} onChange={e => { setDeployAnnee(e.target.value); setDeployStart(0); }} style={selStyleD}>
                  <option value="">Toutes années</option>
                  {annees.map((a: string) => <option key={a} value={a}>{a}</option>)}
                </select>
                <span style={{ color: C.slate, fontSize: '.82rem', marginLeft: 4 }}>{deployTotal} fiche{deployTotal > 1 ? 's' : ''}</span>

                <div style={{ flex: 1 }} />

                {/* Rapprochement AD des bénéficiaires */}
                <button onClick={() => runAdMatch(false)} disabled={adRunning}
                  title="Rechercher tous les bénéficiaires dans l'Active Directory et afficher le nom normalisé"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', cursor: adRunning ? 'default' : 'pointer', fontWeight: 700, fontSize: '.84rem', color: '#7c3aed', opacity: adRunning ? 0.7 : 1 }}>
                  <ShieldCheck size={15} className={adRunning ? 'spin' : ''} />
                  {adRunning
                    ? `Rapprochement AD… ${adProgress ? `${adProgress.done}/${adProgress.total}` : ''}`
                    : 'Rapprocher AD'}
                </button>
                {adStatus && !adRunning && (
                  <span style={{ fontSize: '.78rem', color: C.slate }} title={`${adStatus.cached}/${adStatus.total} bénéficiaires traités`}>
                    <b style={{ color: '#7c3aed' }}>{adStatus.matched}</b> dans l'AD
                    {adStatus.remaining > 0 && <span style={{ color: C.amber }}> · {adStatus.remaining} à traiter</span>}
                  </span>
                )}

                {/* Fusion des graphies d'installateur */}
                <button onClick={() => { setInstOpen(true); setInstKeep(null); setInstSel(new Set()); }}
                  title="Fusionner les variantes d'un même installateur"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '.84rem', color: '#d97706' }}>
                  <Users size={15} /> Fusionner installateurs
                </button>
                <button onClick={() => { setTypesOpen(true); setTypeEdit(null); }}
                  title="Renommer / fusionner les types de déploiement"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '.84rem', color: '#0891b2' }}>
                  <Tag size={15} /> Type de déploiements
                </button>
              </div>
                );
              })()}

              {/* Barre d'action : fusion manuelle de 2 fiches */}
              {deploySel.length > 0 && (() => {
                const sel = deploySel.map(id => deploys.find(d => d.id === id)).filter(Boolean) as any[];
                const lbl = (r: any) => r ? `${fmtD(r.date_deploiement)} · ${r.beneficiaire || '—'}${r.uc_nouveau_num ? ' · ' + r.uc_nouveau_num : ''}` : '—';
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14, padding: '10px 16px', borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <span style={{ fontWeight: 800, color: C.blue, fontSize: '.85rem' }}>Fusion manuelle</span>
                    {deploySel.length < 2 ? (
                      <span style={{ fontSize: '.82rem', color: C.slate }}>Sélectionnez une 2<sup>e</sup> fiche à fusionner dans la 1<sup>re</sup>.</span>
                    ) : (
                      <span style={{ fontSize: '.82rem', color: C.slate }}>
                        On garde <b style={{ color: C.text }}>#{deploySel[0]}</b> ({lbl(sel[0])}), complétée avec <b style={{ color: C.text }}>#{deploySel[1]}</b> ({lbl(sel[1])}) — qui sera supprimée.
                      </span>
                    )}
                    <div style={{ flex: 1 }} />
                    {deploySel.length === 2 && (
                      <button onClick={() => setDeploySel([deploySel[1], deploySel[0]])} title="Inverser : garder l'autre"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '.8rem', color: C.slate }}>
                        <ArrowLeftRight size={13} /> Inverser
                      </button>
                    )}
                    <button onClick={() => setDeploySel([])}
                      style={{ padding: '6px 11px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '.8rem', color: C.slate }}>Annuler</button>
                    <button onClick={doMergePair} disabled={deploySel.length !== 2 || pairMerging}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: deploySel.length === 2 ? C.blue : '#93c5fd', cursor: deploySel.length === 2 && !pairMerging ? 'pointer' : 'default', fontWeight: 800, fontSize: '.82rem', color: '#fff' }}>
                      {pairMerging ? <RefreshCw size={13} className="spin" /> : <ArrowLeftRight size={13} />} Fusionner
                    </button>
                  </div>
                );
              })()}

              {/* Tableau */}
              {deployLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: C.slate }}>Chargement…</div>
              ) : (
                <div style={{ overflowX: 'auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.84rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: `2px solid ${C.border}` }}>
                        <th title="Sélection pour fusion manuelle" style={{ padding: '10px 8px 10px 12px', width: 28 }} />
                          {([
                          ['Date', 'date_deploiement'], ['Src', 'source'], ['Équipement', 'equip_cat'], ['Lieu parc', 'lieu'],
                          ['Bénéficiaire', 'beneficiaire'], ['Direction / Service', 'direction'], ['UC fourni', 'uc_nouveau_num'],
                          ['Modèle UC', 'uc_nouveau_modele'],
                          ['Installateur', 'installateur'], ['Type', 'type_operation'], ['Fichier(s)', null],
                        ] as [string, string | null][]).map(([h, sk]) => {
                          const active = sk && deploySort === sk;
                          return (
                            <th key={h} onClick={() => {
                              if (!sk) return;
                              if (deploySort === sk) setDeploySortDir(d => d === 'asc' ? 'desc' : 'asc');
                              else { setDeploySort(sk); setDeploySortDir('asc'); }
                              setDeployStart(0);
                            }}
                              style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: active ? C.blue : C.slate, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', cursor: sk ? 'pointer' : 'default', userSelect: 'none' }}>
                              {h}
                              {sk && <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3 }}>{active ? (deploySortDir === 'asc' ? '↑' : '↓') : '↕'}</span>}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {deploys.length === 0 ? (
                        <tr><td colSpan={12} style={{ padding: 32, textAlign: 'center', color: C.slate }}>Aucune fiche</td></tr>
                      ) : deploys.map((row: any) => {
                        const selIdx = deploySel.indexOf(row.id);
                        return (
                        <tr key={row.id} style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer', background: selIdx >= 0 ? '#eff6ff' : undefined }}
                          onMouseEnter={e => { if (selIdx < 0) e.currentTarget.style.background = '#f8fafc'; }}
                          onMouseLeave={e => { if (selIdx < 0) e.currentTarget.style.background = ''; }}
                          onClick={() => setDeployEditRow(row)}>
                          <td style={{ padding: '8px 8px 8px 12px', textAlign: 'center' }} onClick={e => { e.stopPropagation(); toggleDeploySel(row.id); }}>
                            <span style={{ position: 'relative', display: 'inline-flex' }}>
                              <input type="checkbox" readOnly checked={selIdx >= 0} title="Sélectionner pour fusion" style={{ accentColor: C.blue, width: 15, height: 15, cursor: 'pointer' }} />
                              {selIdx >= 0 && <span style={{ position: 'absolute', top: -8, right: -10, background: C.blue, color: '#fff', borderRadius: 8, fontSize: '.6rem', fontWeight: 800, padding: '0 4px' }}>{selIdx + 1}</span>}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '.8rem' }}>{fmtD(row.date_deploiement)}</td>
                          <td style={{ padding: '8px 12px' }}>{sourceBadge(row.source)}</td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            {(() => { const e = equipType(row); return e.label !== '—'
                              ? <span style={{ background: e.bg, color: e.color, padding: '2px 9px', borderRadius: 10, fontSize: '.76rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  {(() => {
                                    const ICON_MAP: Record<string, React.ReactNode> = {
                                      Monitor: <Monitor size={14} />,
                                      Laptop: <Laptop size={14} />,
                                      Printer: <Printer size={14} />,
                                      HardDrive: <HardDrive size={14} />,
                                      Tablet: <Tablet size={14} />,
                                      Projector: <Projector size={14} />,
                                    };
                                    return e.icon && ICON_MAP[e.icon]
                                      ? <span style={{ display: 'inline-flex', marginRight: 3 }}>{ICON_MAP[e.icon]}</span>
                                      : null;
                                  })()}{e.label}
                                </span>
                              : <span style={{ color: '#cbd5e1' }}>—</span>; })()}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '.78rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {(() => {
                              const lieu = rowLieu(row);
                              const statut = rowStatutParc(row);
                              // Périph : afficher nom + serial depuis autre_designation
                              if (row.materiel_type === 'PERIPH' && row.autre_designation) {
                                const pd = periphDisplay(row.autre_designation);
                                return (
                                  <div>
                                    <div style={{ fontFamily: 'monospace', fontWeight: 600, color: C.text, fontSize: '.77rem' }}>{pd.serial}</div>
                                    {pd.nom && <div style={{ color: C.slate, fontSize: '.72rem' }}>{pd.nom}</div>}
                                    {lieu && <div style={{ color: C.slate, fontSize: '.72rem', display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={10} />{lieu}</div>}
                                    {statut && <span style={{ background: '#f1f5f9', color: C.slate, borderRadius: 5, padding: '0 5px', fontSize: '.7rem', fontWeight: 600 }}>{statut}</span>}
                                  </div>
                                );
                              }
                              return lieu
                                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: C.slate }}><MapPin size={11} />{lieu}{statut && <span style={{ marginLeft: 4, background: '#f1f5f9', borderRadius: 5, padding: '0 5px', fontSize: '.7rem', fontWeight: 600 }}>{statut}</span>}</span>
                                : <span style={{ color: '#cbd5e1' }}>—</span>;
                            })()}
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                            {(() => {
                              const ad = row.beneficiaire ? adMap[normName(row.beneficiaire)] : null;
                              if (ad && ad.found) {
                                return (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <span title={`Trouvé dans l'AD${ad.email ? ` · ${ad.email}` : ''}${ad.service ? ` · ${ad.service}` : ''}`}>
                                      <ShieldCheck size={13} color="#7c3aed" />
                                    </span>
                                    <span>{ad.display_name || row.beneficiaire}</span>
                                    {ad.display_name && normName(ad.display_name) !== normName(row.beneficiaire) && (
                                      <span style={{ color: '#cbd5e1', fontWeight: 400, fontSize: '.74rem' }} title={`Saisi : ${row.beneficiaire}`}>({row.beneficiaire})</span>
                                    )}
                                  </span>
                                );
                              }
                              return row.beneficiaire || '—';
                            })()}
                            {row.site && <div style={{ color: '#94a3b8', fontSize: '.74rem', marginTop: 2 }}>{row.site}</div>}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '.8rem' }}>
                            {row.direction && <span style={{ fontWeight: 700, color: C.text }}>{row.direction}</span>}
                            {row.service && <span style={{ color: C.slate }}> / {row.service}</span>}
                            {!row.direction && !row.service && '—'}
                          </td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            {row.equip_cat === 'ecran'
                              ? (row.ecran1_nouveau_num || row.ecran1_nouveau_serie
                                  ? <><div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{row.ecran1_nouveau_num || row.ecran1_nouveau_serie}</div>{row.ecran1_recupere_num && <div style={{ color: '#94a3b8', fontSize: '.74rem', fontFamily: 'monospace' }}>← {row.ecran1_recupere_num}</div>}</>
                                  : '—')
                              : (row.uc_nouveau_num || row.uc_recupere_num
                                  ? <><div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{row.uc_nouveau_num || '—'}</div>{row.uc_recupere_num && <div style={{ color: '#94a3b8', fontSize: '.74rem', fontFamily: 'monospace', marginTop: 2 }}>← {row.uc_recupere_num}</div>}{matchBadge(row)}</>
                                  : '—')}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '.8rem', color: C.slate }}>
                            {row.equip_cat === 'ecran'
                              ? (row.ecran1_nouveau_serie && row.ecran1_nouveau_num ? row.ecran1_nouveau_serie : row.uc_nouveau_modele || '—')
                              : (row.uc_nouveau_modele || '—')}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '.8rem' }}>
                            {row.installateur
                              ? (() => {
                                  const parts = row.installateur.split(/[\s]+/).filter(Boolean);
                                  const initials = parts.map((p: string) => p[0].toUpperCase()).slice(0, 3).join('');
                                  const bgColors = ['#2563eb20', '#7c3aed20', '#05966920', '#d9770620', '#0891b220', '#dc262620'];
                                  const ci = parts.reduce((a: number, p: string) => a + p.charCodeAt(0), 0) % bgColors.length;
                                  return <span title={row.installateur} style={{ background: bgColors[ci], color: '#1e293b', fontWeight: 800, fontSize: '.72rem', borderRadius: 8, padding: '2px 10px', display: 'inline-block', letterSpacing: '.04em', cursor: 'default' }}>{initials}</span>;
                                })()
                              : '—'}
                          </td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{typeBadge(row.type_operation)}</td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                            {(() => {
                              // Document GLPI (prioritaire sur le chemin NAS quand disponible)
                              const glpiDocId: number | null = row.glpi_document_id || null;
                              const glpiPreviewUrl  = glpiDocId ? `/api/parc/file/document/${glpiDocId}?token=${token || ''}` : null;
                              const glpiFilename    = glpiDocId ? (row.fichier ? (row.fichier.split(/[/\\]/).pop() || 'document') : `document-${glpiDocId}`) : null;
                              // Fichier NAS (utilisé uniquement si pas de doc GLPI)
                              const nasFile   = !glpiDocId && row.fichier ? row.fichier : null;
                              const nasPreviewPath = nasFile;
                              const hasDoc = !!(glpiDocId || nasFile || row.fichier_lie);
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {glpiDocId ? (<>
                                    {/* Document GLPI — badge distinctif + œil + téléchargement */}
                                    <span title="Document GLPI" style={{ background: '#ede9fe', color: '#7c3aed', borderRadius: 4, padding: '0 4px', fontSize: '.68rem', fontWeight: 700, letterSpacing: '.02em' }}>GLPI</span>
                                    <button onClick={() => setDocViewer({ path: '', filename: glpiFilename || 'document', glpiDocId })}
                                      title={`Prévisualiser : ${glpiFilename}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.blue, display: 'inline-flex', padding: 0 }}>
                                      <Eye size={15} />
                                    </button>
                                    <a href={glpiPreviewUrl!} download={glpiFilename || true} title={`Télécharger : ${glpiFilename}`}
                                      style={{ color: C.blue, display: 'inline-flex', padding: 0 }}>
                                      <Download size={14} />
                                    </a>
                                  </>) : nasFile ? (<>
                                    <button onClick={() => setDocViewer({ path: nasFile, filename: nasFile.split(/[/\\]/).pop() || nasFile })}
                                      title={`Prévisualiser : ${nasFile}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.blue, display: 'inline-flex', padding: 0 }}>
                                      <Eye size={15} />
                                    </button>
                                    <a href={`/api/deploiements/file?path=${encodeURIComponent(nasFile)}&token=${token || ''}`}
                                      download title={`Télécharger : ${nasFile}`}
                                      style={{ color: C.blue, display: 'inline-flex', padding: 0 }}>
                                      <Download size={14} />
                                    </a>
                                  </>) : null}
                                  {row.fichier_lie && (<>
                                    <button onClick={() => setDocViewer({ path: row.fichier_lie, filename: row.fichier_lie.split(/[/\\]/).pop() || row.fichier_lie })}
                                      title={`Prévisualiser lié : ${row.fichier_lie}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate, display: 'inline-flex', padding: 0 }}>
                                      <Eye size={13} />
                                    </button>
                                    <a href={`/api/deploiements/file?path=${encodeURIComponent(row.fichier_lie)}&token=${token || ''}`}
                                      download title={`Télécharger lié : ${row.fichier_lie}`}
                                      style={{ color: C.slate, display: 'inline-flex', padding: 0 }}>
                                      <Download size={12} />
                                    </a>
                                  </>)}
                                  {!hasDoc && <span style={{ color: '#cbd5e1' }}>—</span>}
                                  <button onClick={() => setDeployEditRow(row)} title="Modifier ce déploiement"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate, marginLeft: 2, display: 'inline-flex', padding: 0 }}>
                                    <Edit2 size={13} />
                                  </button>
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination + nombre d'items par page */}
              {deployTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: C.slate }}>
                    Afficher
                    <select value={deployLimit} onChange={e => { setDeployLimit(parseInt(e.target.value, 10)); setDeployStart(0); }}
                      style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 8px', fontSize: '.82rem', fontWeight: 600 }}>
                      {[25, 50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
                      <option value={5000}>Tout</option>
                    </select>
                    par page
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button disabled={deployStart === 0} onClick={() => setDeployStart(Math.max(0, deployStart - deployLimit))}
                      style={{ padding: '6px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, cursor: deployStart === 0 ? 'default' : 'pointer', opacity: deployStart === 0 ? 0.4 : 1, fontSize: '.85rem', fontWeight: 600 }}>
                      ← Préc.
                    </button>
                    <span style={{ lineHeight: '34px', fontSize: '.82rem', color: C.slate }}>
                      {deployStart + 1}–{Math.min(deployStart + deployLimit, deployTotal)} / {deployTotal}
                    </span>
                    <button disabled={deployStart + deployLimit >= deployTotal} onClick={() => setDeployStart(deployStart + deployLimit)}
                      style={{ padding: '6px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, cursor: deployStart + deployLimit >= deployTotal ? 'default' : 'pointer', opacity: deployStart + deployLimit >= deployTotal ? 0.4 : 1, fontSize: '.85rem', fontWeight: 600 }}>
                      Suiv. →
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      </div>

      {/* ─── MODAL ÉDITION DÉPLOIEMENT ─── */}
      {deployEditRow && (
        <DeployEditModal
          row={deployEditRow}
          token={token}
          onClose={() => setDeployEditRow(null)}
          onSaved={(updated) => {
            setDeploys(rows => rows.map(r => r.id === updated.id ? updated : r));
            setDeployEditRow(null);
          }}
        />
      )}

      {/* ─── MODAL FUSION INSTALLATEURS ─── */}
      {instOpen && (
        <div onClick={() => setInstOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(560px,96vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Users size={18} color="#d97706" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, color: C.text }}>Fusionner les installateurs</div>
                <div style={{ fontSize: '.78rem', color: C.slate }}>
                  {instKeep ? <>On conserve <b style={{ color: '#d97706' }}>{instKeep}</b> — cochez les graphies à fusionner dedans.</> : 'Cliquez d\'abord sur l\'installateur à conserver.'}
                </div>
              </div>
              <button onClick={() => setInstOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate }}><X size={18} /></button>
            </div>

            {/* Conservé */}
            {instKeep && (
              <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, background: '#fffbeb', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '.78rem', color: C.slate }}>Conservé :</span>
                <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 10px', borderRadius: 8, fontWeight: 700, fontSize: '.84rem' }}>{instKeep}</span>
                <button onClick={() => { setInstKeep(null); setInstSel(new Set()); }} style={{ marginLeft: 'auto', background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontSize: '.78rem', color: C.slate }}>Changer</button>
              </div>
            )}

            {/* Recherche */}
            <div style={{ padding: '10px 20px 0' }}>
              <input value={instQ} onChange={e => setInstQ(e.target.value)} placeholder="Filtrer…"
                style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 11px', fontSize: '.86rem' }} />
            </div>

            {/* Liste */}
            <div style={{ overflowY: 'auto', padding: '10px 12px', flex: 1 }}>
              {deployFacets.installateurs
                .filter(i => !instQ || i.installateur.toLowerCase().includes(instQ.toLowerCase()))
                .map(i => {
                  const name = i.installateur;
                  const editing = instEdit && instEdit.from === name;
                  const isKeep = instKeep === name;
                  const selected = instSel.has(name);
                  const onClick = () => {
                    if (editing) return;
                    if (!instKeep) { setInstKeep(name); return; }
                    if (isKeep) return;
                    setInstSel(s => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n; });
                  };
                  return (
                    <div key={name} onClick={onClick} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, cursor: editing ? 'default' : isKeep ? 'default' : 'pointer',
                      background: editing ? '#ecfeff' : isKeep ? '#fef3c7' : selected ? '#eff6ff' : 'transparent',
                      border: `1px solid ${editing ? '#a5f3fc' : isKeep ? '#fcd34d' : selected ? '#bfdbfe' : 'transparent'}`, marginBottom: 3,
                    }}>
                      {editing ? (
                        <>
                          <input autoFocus value={instEdit!.value} onChange={e => setInstEdit({ from: name, value: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') doRenameInstallateur(); if (e.key === 'Escape') setInstEdit(null); }}
                            onClick={e => e.stopPropagation()}
                            style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 9px', fontSize: '.86rem' }} />
                          <button onClick={e => { e.stopPropagation(); doRenameInstallateur(); }} disabled={instSaving}
                            style={{ background: '#0891b2', border: 'none', borderRadius: 6, padding: '5px 11px', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: '.8rem', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            {instSaving ? <RefreshCw size={12} className="spin" /> : <CheckCircle2 size={13} />} OK
                          </button>
                          <button onClick={e => { e.stopPropagation(); setInstEdit(null); }} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 9px', cursor: 'pointer', color: C.slate, fontSize: '.8rem' }}>Annuler</button>
                        </>
                      ) : (
                        <>
                          {instKeep && !isKeep && (
                            <input type="checkbox" readOnly checked={selected} style={{ accentColor: C.blue, width: 15, height: 15 }} />
                          )}
                          <span style={{ flex: 1, fontWeight: isKeep ? 800 : 600, color: isKeep ? '#b45309' : C.text, fontSize: '.88rem' }}>
                            {name}{isKeep && ' ✓ conservé'}
                          </span>
                          <span style={{ fontSize: '.76rem', color: C.slate, background: '#f1f5f9', borderRadius: 12, padding: '1px 9px', fontWeight: 700 }}>{i.n}</span>
                          {!instKeep && (
                            <button onClick={e => { e.stopPropagation(); setInstEdit(editing ? null : { from: name, value: name }); }}
                              title="Renommer" style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: C.slate, display: 'inline-flex', alignItems: 'center' }}>
                              <Edit2 size={13} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Pied */}
            <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '.8rem', color: C.slate }}>
                {instKeep && instSel.size > 0 ? `${instSel.size} graphie(s) → «${instKeep}»` : 'Sélection vide'}
              </span>
              <div style={{ flex: 1 }} />
              <button onClick={() => setInstOpen(false)} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 700, fontSize: '.84rem', color: C.slate }}>Annuler</button>
              <button onClick={doMergeInstallateurs} disabled={!instKeep || instSel.size === 0 || instMerging}
                style={{ background: (!instKeep || instSel.size === 0) ? '#fcd9a5' : '#d97706', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: (!instKeep || instSel.size === 0 || instMerging) ? 'default' : 'pointer', fontWeight: 800, fontSize: '.84rem', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {instMerging ? <RefreshCw size={14} className="spin" /> : <Users size={14} />} Fusionner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL LISTE ORDINATEURS (doublons / à renouveler) ─── */}
      {pcModal && (
        <div onClick={() => setPcModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(900px,96vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              {pcModal.kind === 'dup' ? <AlertTriangle size={18} color={C.amber} /> : <RefreshCw size={18} color={C.amber} />}
              <div style={{ flex: 1, fontWeight: 800, color: C.text }}>{pcModal.title} <span style={{ color: C.slate, fontWeight: 600 }}>· {pcModalRows.length}</span></div>
              <button onClick={() => setPcModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate }}><X size={18} /></button>
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              {pcModalLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: C.slate }}><RefreshCw size={16} className="spin" /> Chargement…</div>
              ) : pcModalRows.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: C.slate }}>Aucun ordinateur concerné.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.84rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                      {['Nom', 'N° série', 'Lieu', 'Usager', 'Statut', 'Âge'].map(h => (
                        <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, fontSize: '.74rem', textTransform: 'uppercase', color: C.slate, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pcModalRows.map((r, i) => (
                      <tr key={`${r.id}-${i}`} onClick={() => openDetail(r.id, 'ordinateurs')}
                        style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '8px 14px', fontWeight: 600, color: C.text }}>{v(r.name)}</td>
                        <td style={{ padding: '8px 14px', fontFamily: 'monospace', fontSize: '.8rem', color: pcModal.kind === 'dup' ? C.red : C.slate }}>{v(r.serial)}</td>
                        <td style={{ padding: '8px 14px', color: C.slate }}>{v(r.location)}</td>
                        <td style={{ padding: '8px 14px', color: C.slate }}>{v(r.contact || r.user)}</td>
                        <td style={{ padding: '8px 14px' }}>{r.state ? <span style={{ background: '#eff6ff', color: C.blue, padding: '2px 8px', borderRadius: 6, fontSize: '.76rem', fontWeight: 600 }}>{r.state}</span> : v(null)}</td>
                        <td style={{ padding: '8px 14px', color: C.slate }}>{r.age_years != null ? `${r.age_years} an${r.age_years >= 2 ? 's' : ''}` : v(null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL TYPES DE DÉPLOIEMENT ─── */}
      {typesOpen && (
        <div onClick={() => { setTypesOpen(false); setTypeEdit(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(560px,96vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Tag size={18} color="#0891b2" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, color: C.text }}>Types de déploiement</div>
                <div style={{ fontSize: '.78rem', color: C.slate }}>Renommez un type ; si le nouveau nom existe déjà, les catégories fusionnent.</div>
              </div>
              <button onClick={() => { setTypesOpen(false); setTypeEdit(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate }}><X size={18} /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: '10px 12px', flex: 1 }}>
              {deployFacets.types && deployFacets.types.length > 0 ? deployFacets.types.map(t => {
                const editing = typeEdit && typeEdit.from === t.type_operation;
                const willMerge = editing && deployFacets.types.some(x => x.type_operation !== t.type_operation && x.type_operation === typeEdit!.value.trim());
                return (
                  <div key={t.type_operation} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, marginBottom: 3, background: editing ? '#ecfeff' : 'transparent', border: `1px solid ${editing ? '#a5f3fc' : 'transparent'}` }}>
                    {editing ? (
                      <>
                        <input autoFocus value={typeEdit!.value} onChange={e => setTypeEdit({ from: t.type_operation, value: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') doRenameType(); if (e.key === 'Escape') setTypeEdit(null); }}
                          style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 9px', fontSize: '.86rem' }} />
                        {willMerge && <span title="Fusionnera avec la catégorie existante" style={{ background: '#fef3c7', color: '#b45309', padding: '1px 7px', borderRadius: 6, fontSize: '.7rem', fontWeight: 700 }}>fusion</span>}
                        <button onClick={doRenameType} disabled={typeSaving} style={{ background: '#0891b2', border: 'none', borderRadius: 6, padding: '5px 11px', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: '.8rem', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          {typeSaving ? <RefreshCw size={12} className="spin" /> : <CheckCircle2 size={13} />} OK
                        </button>
                        <button onClick={() => setTypeEdit(null)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 9px', cursor: 'pointer', color: C.slate, fontSize: '.8rem' }}>Annuler</button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontWeight: 600, color: C.text, fontSize: '.88rem' }}>{t.type_operation}</span>
                        <span style={{ fontSize: '.76rem', color: C.slate, background: '#f1f5f9', borderRadius: 12, padding: '1px 9px', fontWeight: 700 }}>{t.n}</span>
                        <button onClick={() => setTypeEdit({ from: t.type_operation, value: t.type_operation })}
                          title="Renommer" style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: C.slate, display: 'inline-flex', alignItems: 'center' }}>
                          <Edit2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                );
              }) : <div style={{ padding: 24, textAlign: 'center', color: C.slate }}>Aucun type</div>}
            </div>
          </div>
        </div>
      )}

      {/* ─── AD (ACTIVE DIRECTORY) ─── */}
      {tab === 'ad' && <AdView />}

      {/* ─── ÉTIQUETTE ─── */}
      {tab === 'etiquette' && <EtiquetteView />}

      {/* ─── VISIONNEUSE DE DOCUMENT ─── */}
      {docViewer && (
        <DocViewer
          filePath={docViewer.path}
          filename={docViewer.filename}
          token={token}
          onClose={() => setDocViewer(null)}
        />
      )}

      {/* ─── MODAL DÉTAIL ─── */}
      {detail && (
        <DetailModal detail={detail} token={token} onClose={() => setDetail(null)} />
      )}

      {/* ─── MODAL DOUBLONS ─── */}
      {doublonOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }} onClick={() => setDoublonOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 8px 48px rgba(0,0,0,.25)', width: '100%', maxWidth: 960, padding: 28 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={20} color={C.amber} /> Doublons équipements
                {!doublonLoading && <span style={{ fontSize: '.82rem', fontWeight: 400, color: C.slate }}>({doublonList.length} groupe{doublonList.length !== 1 ? 's' : ''} détecté{doublonList.length !== 1 ? 's' : ''})</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!doublonLoading && doublonList.length > 0 && (
                  <button onClick={handleMergeAll} disabled={doublonMergingAll}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: doublonMergingAll ? C.border : C.blue, color: doublonMergingAll ? C.slate : '#fff', fontWeight: 700, fontSize: '.85rem', cursor: doublonMergingAll ? 'default' : 'pointer' }}>
                    {doublonMergingAll ? <><RefreshCw size={13} className="spin" /> Fusion en cours…</> : <>Tout fusionner ({doublonList.length})</>}
                  </button>
                )}
                <button onClick={() => setDoublonOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate, padding: 4 }}><X size={20} /></button>
              </div>
            </div>

            {doublonLoading && <div style={{ textAlign: 'center', padding: 48, color: C.slate }}><RefreshCw size={28} className="spin" /> Recherche en cours…</div>}
            {doublonErr && <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: '.85rem' }}>Erreur : {doublonErr}</div>}

            {!doublonLoading && !doublonErr && doublonList.length === 0 && (
              <div style={{ textAlign: 'center', padding: 48, color: C.slate }}>
                <CheckCircle2 size={40} color="#22c55e" style={{ marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
                <div style={{ fontWeight: 600 }}>Aucun doublon détecté</div>
                <div style={{ fontSize: '.8rem', marginTop: 4 }}>Aucun équipement ne partage les 9 derniers caractères de numéro de série</div>
              </div>
            )}

            {!doublonLoading && !doublonErr && doublonList.map((group, gi) => {
              const kept = group.items[0];
              return (
                <div key={gi} style={{ marginBottom: 16, border: '1px solid #fde68a', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', background: '#fef3c7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertTriangle size={14} />
                      Série <code style={{ fontFamily: 'monospace', background: '#fde68a', padding: '1px 6px', borderRadius: 4 }}>…{group.tail9}</code>
                      <span style={{ fontWeight: 400, fontSize: '.8rem', color: '#a16207' }}>— {group.items.length} entrées</span>
                    </span>
                    <span style={{ fontSize: '.75rem', background: '#fde68a', padding: '2px 8px', borderRadius: 4, color: '#92400e', fontWeight: 600 }}>{group.type_key}</span>
                  </div>

                  {group.items.slice(1).map((src) => {
                    const mergeKey = `${kept.id}-${src.id}`;
                    const isMerging = doublonMerging.has(mergeKey);
                    const ks = (kept.serial || '').trim();
                    const ss = (src.serial || '').trim();
                    const willContact = !kept.contact && !!src.contact;
                    const willContactNum = !kept.contact_num && !!src.contact_num;
                    const willSerial = !!(ss && (!ks || ss.length < ks.length));

                    return (
                      <div key={src.id} style={{ padding: '16px 16px 12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: '6px 12px', marginBottom: 14, alignItems: 'center' }}>
                          <div />
                          <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#16a34a', textAlign: 'center', padding: '4px 8px', background: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0' }}>✓ À CONSERVER · ID {kept.id}</div>
                          <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#dc2626', textAlign: 'center', padding: '4px 8px', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>✗ À SUPPRIMER · ID {src.id}</div>
                          {([
                            { label: 'Usager',    kv: kept.contact,     sv: src.contact,     hl: willContact },
                            { label: 'N° usager', kv: kept.contact_num, sv: src.contact_num, hl: willContactNum },
                            { label: 'Groupe',    kv: kept.group,       sv: src.group,       hl: false },
                            { label: 'Lieu',      kv: kept.location,    sv: src.location,    hl: false },
                            { label: 'N° série',  kv: willSerial ? ss : ks, sv: ss || null,  hl: willSerial },
                            { label: 'Statut',    kv: kept.state,       sv: src.state,       hl: false },
                          ] as { label: string; kv: string | null; sv: string | null; hl: boolean }[]).map(({ label, kv, sv, hl }) => (
                            <React.Fragment key={label}>
                              <div style={{ padding: '3px 0', fontSize: '.74rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
                              <div style={{ padding: '3px 8px', fontSize: '.82rem', color: hl ? '#16a34a' : (kv ? '#1e293b' : '#94a3b8'), fontStyle: kv ? 'normal' : 'italic', fontWeight: hl ? 700 : 400, background: hl ? '#dcfce7' : 'transparent', borderRadius: 4 }}>{hl ? `← ${sv}` : (kv || '—')}</div>
                              <div style={{ padding: '3px 8px', fontSize: '.82rem', color: sv ? '#dc2626' : '#94a3b8', fontStyle: sv ? 'normal' : 'italic', textDecoration: 'line-through', opacity: 0.7 }}>{sv || '—'}</div>
                            </React.Fragment>
                          ))}
                        </div>

                        <div style={{ fontSize: '.78rem', color: '#475569', background: '#f8fafc', padding: '8px 12px', borderRadius: 6, marginBottom: 10 }}>
                          <b>Actions :</b>{' '}
                          {willContact && <span style={{ color: '#16a34a' }}>Copie usager « {src.contact} » · </span>}
                          {willContactNum && <span style={{ color: '#16a34a' }}>Copie N° usager « {src.contact_num} » · </span>}
                          {willSerial && <span style={{ color: '#16a34a' }}>Série raccourcie « {ss} » · </span>}
                          Suppression locale de l'entrée dupliquée (ID {src.id})
                        </div>

                        <button onClick={() => handleDoublonMerge(group.type_key, kept.id, src.id, gi)}
                          disabled={isMerging}
                          style={{ width: '100%', padding: '9px 0', borderRadius: 8, border: 'none', background: isMerging ? C.border : C.blue, color: isMerging ? C.slate : '#fff', fontWeight: 700, fontSize: '.88rem', cursor: isMerging ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                          {isMerging ? <><RefreshCw size={14} className="spin" /> Fusion en cours…</> : 'Fusionner — conserver le 1er, supprimer le 2e'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 1s linear infinite}`}</style>

      {/* ── Tooltip stock ───────────────────────────────────────────────────── */}
      {stockTooltip && (() => {
        const sorted = [...stockTooltip.items].sort((a: any, b: any) => {
          if (!!a.serial !== !!b.serial) return a.serial ? -1 : 1;
          return (a.serial || a.name || '').localeCompare(b.serial || b.name || '');
        });
        const maxH = 360;
        const spaceBelow = window.innerHeight - stockTooltip.y;
        const top = spaceBelow > maxH + 20 ? stockTooltip.y : stockTooltip.y - maxH - 36;
        const left = Math.max(170, Math.min(stockTooltip.x, window.innerWidth - 170));
        return (
          <div
            style={{ position: 'fixed', left, top, transform: 'translateX(-50%)', zIndex: 3000, background: '#1e293b', color: '#f1f5f9', borderRadius: 10, padding: '0', fontSize: '.79rem', width: 380, boxShadow: '0 8px 32px rgba(0,0,0,.4)', pointerEvents: 'auto' }}
            onMouseEnter={() => { if (tooltipHideTimer.current) clearTimeout(tooltipHideTimer.current); }}
            onMouseLeave={() => { tooltipHideTimer.current = setTimeout(() => setStockTooltip(null), 80); }}
          >
            <div style={{ fontWeight: 700, color: '#fff', padding: '8px 14px 7px', borderBottom: '1px solid #334155', fontSize: '.8rem' }}>
              {stockTooltip.statut} · {stockTooltip.total} unité{stockTooltip.total > 1 ? 's' : ''}
            </div>
            <div style={{ maxHeight: maxH, overflowY: 'scroll', padding: '4px 0' }}>
              {sorted.map((it: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 14px', borderTop: i > 0 ? '1px solid #1e3050' : 'none', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#e2e8f0', flexShrink: 0, fontSize: '.78rem' }}>{it.serial || '—'}</span>
                  {it.name && <span style={{ color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '.74rem' }}>{it.name}</span>}
                  <span style={{ marginLeft: 'auto', color: '#94a3b8', flexShrink: 0, fontSize: '.74rem' }}>{it.reception_date ? fmtDate(it.reception_date) : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

        {/* ─── Lignes mobiles (forfaits / SIM importés depuis lignes.xlsx) ─── */}
        {tab === 'lignes' && <LignesMobilesView token={token || ''} />}

        {/* ─── AD (ordinateurs Active Directory) ─── */}
        {tab === 'ad' && (
          <div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            {/* Bandeau actions + statistiques */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: 1 }}>
                {[
                  { label: 'Ordinateurs', val: adStatsData?.total ?? '—', color: C.blue },
                  { label: 'Actifs', val: adStatsData?.enabled ?? '—', color: C.green },
                  { label: 'Désactivés', val: adStatsData?.disabled ?? '—', color: C.red },
                ].map(s => (
                  <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', minWidth: 120 }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: '.72rem', fontWeight: 700, color: C.slate, textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.label}</div>
                  </div>
                ))}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', minWidth: 180 }}>
                  <div style={{ fontSize: '.9rem', fontWeight: 700, color: C.text }}>
                    {adStatsData?.last_sync ? new Date(adStatsData.last_sync).toLocaleString('fr-FR') : 'Jamais'}
                  </div>
                  <div style={{ fontSize: '.72rem', fontWeight: 700, color: C.slate, textTransform: 'uppercase', letterSpacing: '.04em' }}>Dernière synchro</div>
                </div>
              </div>
              <button onClick={startAdImport} disabled={adImport?.running}
                style={{ ...btn(C.blue), opacity: adImport?.running ? .6 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <RefreshCw size={15} style={adImport?.running ? { animation: 'spin 1s linear infinite' } : undefined} />
                {adImport?.running ? `Import en cours… (${adImport?.count ?? 0})` : 'Importer depuis l\'AD'}
              </button>
            </div>

            {adImport?.running && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '.85rem' }}>
                Énumération de l'Active Directory en cours… {adImport.count ?? 0} ordinateur(s) traité(s){adImport.total ? ` / ${adImport.total}` : ''}.
              </div>
            )}
            {adImport && !adImport.running && adImport.error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '.85rem' }}>
                Échec de l'import : {adImport.error}
              </div>
            )}

            {/* Filtres */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                <Search size={15} style={{ position: 'absolute', left: 11, top: 10, color: C.slate }} />
                <input type="text" value={adQ} placeholder="Nom, login, DNS, OS, description…"
                  onChange={e => { setAdStart(0); setAdQ(e.target.value); }}
                  style={{ width: '100%', padding: '9px 12px 9px 34px', border: `1px solid ${C.border}`, borderRadius: 9, fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <select value={adEnabled} onChange={e => { setAdStart(0); setAdEnabled(e.target.value as any); }}
                style={{ padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 9, fontSize: '.88rem', outline: 'none' }}>
                <option value="">Tous les états</option>
                <option value="true">Actifs uniquement</option>
                <option value="false">Désactivés uniquement</option>
              </select>
            </div>

            {adErr && <div style={{ color: C.red, marginBottom: 12, fontSize: '.85rem' }}>{adErr}</div>}

            {/* Tableau */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.84rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'left', color: C.slate }}>
                      {['Nom', 'DNS', 'Système', 'Version', 'Dernière connexion', 'OU', 'État', 'Description'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', fontWeight: 700, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {adLoading ? (
                      <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: C.slate }}>Chargement…</td></tr>
                    ) : adRows.length === 0 ? (
                      <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: C.slate }}>
                        Aucun ordinateur. Lancez un import depuis l'AD.
                      </td></tr>
                    ) : adRows.map(r => (
                      <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{v(r.name)}</td>
                        <td style={{ padding: '8px 12px', color: C.slate }}>{v(r.dnshostname)}</td>
                        <td style={{ padding: '8px 12px' }}>{v(r.operatingsystem)}</td>
                        <td style={{ padding: '8px 12px', color: C.slate }}>{v(r.osversion)}</td>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{r.lastlogon ? new Date(r.lastlogon).toLocaleDateString('fr-FR') : v(null)}</td>
                        <td style={{ padding: '8px 12px', color: C.slate }}>{v(r.ou)}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: r.enabled ? '#dcfce7' : '#fee2e2', color: r.enabled ? '#166534' : '#b91c1c' }}>
                            {r.enabled ? 'Actif' : 'Désactivé'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', color: C.slate, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description || ''}>{v(r.description)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {adTotal > adLimit && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: '.8rem', color: C.slate }}>
                    {adStart + 1}–{Math.min(adStart + adLimit, adTotal)} sur {adTotal}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button disabled={adStart === 0} onClick={() => setAdStart(Math.max(0, adStart - adLimit))}
                      style={{ ...btn(C.slate), opacity: adStart === 0 ? .5 : 1 }}>Précédent</button>
                    <button disabled={adStart + adLimit >= adTotal} onClick={() => setAdStart(adStart + adLimit)}
                      style={{ ...btn(C.slate), opacity: adStart + adLimit >= adTotal ? .5 : 1 }}>Suivant</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      {/* ── Modal Recherche AD ──────────────────────────────────────────────── */}
    {adModal && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => !adModal.applying && setAdModal(null)}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 520, maxWidth: '95vw', boxShadow: '0 24px 64px rgba(0,0,0,.25)' }}
          onClick={e => e.stopPropagation()}>
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>Recherche Active Directory</div>
          <div style={{ fontSize: '.82rem', color: C.slate, marginBottom: 16 }}>{adModal.row.name}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input type="text" value={adModal.query} autoFocus
              onChange={e => setAdModal(m => m ? { ...m, query: e.target.value } : m)}
              onKeyDown={e => e.key === 'Enter' && doAdSearch()}
              placeholder="Nom, prénom ou login…"
              style={{ flex: 1, padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 9, fontSize: '.88rem', outline: 'none' }} />
            <button onClick={doAdSearch} disabled={adModal.loading || !adModal.query.trim()} style={btn(C.blue)}>
              {adModal.loading ? <RefreshCw size={14} className="spin" /> : <Search size={14} />}
              {adModal.loading ? 'Recherche…' : 'Chercher'}
            </button>
          </div>
          {adModal.results !== null && (
            adModal.results.length === 0
              ? <div style={{ textAlign: 'center', color: C.slate, padding: '20px 0', fontSize: '.88rem' }}>Aucun résultat</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                  {adModal.results.map(u => {
                    const sel = adModal.selected?.username === u.username;
                    return (
                      <div key={u.username} onClick={() => setAdModal(m => m ? { ...m, selected: sel ? null : u } : m)}
                        style={{ padding: '10px 14px', borderRadius: 10, border: `2px solid ${sel ? C.blue : C.border}`, cursor: 'pointer', background: sel ? '#eff6ff' : '#fff', transition: 'border-color .15s' }}>
                        <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{u.displayName}</div>
                        <div style={{ fontSize: '.78rem', color: C.slate, marginTop: 2 }}>
                          {u.email || "(pas d'e-mail)"}{u.service ? ` · ${u.service}` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button onClick={() => setAdModal(null)} disabled={adModal.applying}
              style={{ ...btn(C.slate), background: '#f1f5f9', color: C.text }}>Annuler</button>
            {adModal.selected && (
              <button onClick={applyAdUser} disabled={adModal.applying} style={btn(C.blue)}>
                {adModal.applying ? <RefreshCw size={14} className="spin" /> : <CheckCircle2 size={14} />}
                {adModal.applying ? 'Application…' : `Appliquer "${adModal.selected.displayName}"`}
              </button>
            )}
          </div>
        </div>
      </div>
    )}
    </div>
  );
};

// ─── Sous-composants ──────────────────────────────────────────────────────────
const btn = (color: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: 'none',
  background: color, color: '#fff', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer',
});
const btnPage = (disabled: boolean): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff',
  color: disabled ? '#cbd5e1' : C.text, cursor: disabled ? 'default' : 'pointer', fontWeight: 600, fontSize: '.84rem',
});
const selStyle: React.CSSProperties = { padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: '.85rem', background: '#fff', color: C.text, maxWidth: 200 };

const Select: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; options: string[] }> = ({ value, onChange, placeholder, options }) => (
  <select value={value} onChange={e => onChange(e.target.value)} style={selStyle}>
    <option value="">{placeholder}</option>
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);

const StatCard: React.FC<{ icon: any; label: string; value: number; color: string; big?: boolean; onClick?: () => void; money?: boolean; suffix?: string; sub?: string; decimals?: boolean }> = ({ icon: I, label, value, color, big, onClick, money, suffix, sub, decimals }) => (
  <div onClick={onClick} style={{
    background: big ? `linear-gradient(135deg,${color},#7c3aed)` : C.card, color: big ? '#fff' : C.text,
    border: big ? 'none' : `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', cursor: onClick ? 'pointer' : 'default',
    transition: 'transform .15s', position: 'relative', overflow: 'hidden',
  }}
    onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = 'translateY(-2px)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = ''; }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <I size={20} color={big ? '#fff' : color} style={{ opacity: big ? 0.9 : 1 }} />
      {sub && <span style={{ fontSize: '.78rem', fontWeight: 800, color: big ? '#fff' : color }}>{sub}</span>}
    </div>
    <div style={{ fontSize: money ? '1.45rem' : '1.9rem', fontWeight: 900, marginTop: 8, letterSpacing: '-0.02em' }}>
      {money ? eur(value) : value.toLocaleString('fr-FR', decimals ? { maximumFractionDigits: 1 } : {})}{suffix || ''}
    </div>
    <div style={{ fontSize: '.8rem', fontWeight: 600, opacity: big ? 0.92 : 0.7, marginTop: 2 }}>{label}</div>
  </div>
);

const Anomaly: React.FC<{ label: string; n: number; onClick?: () => void }> = ({ label, n, onClick }) => (
  <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${n > 0 ? '#fed7aa' : C.border}`, background: n > 0 ? '#fff7ed' : '#f8fafc', cursor: onClick && n > 0 ? 'pointer' : 'default' }}
    onMouseEnter={e => { if (onClick && n > 0) e.currentTarget.style.background = '#ffedd5'; }}
    onMouseLeave={e => { if (onClick && n > 0) e.currentTarget.style.background = '#fff7ed'; }}>
    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: n > 0 ? C.amber : C.green, minWidth: 34 }}>{n}</div>
    <div style={{ fontSize: '.78rem', color: C.slate, fontWeight: 600, lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 4 }}>{label}{onClick && n > 0 && <ChevronRight size={13} color="#cbd5e1" />}</div>
  </div>
);

const Panel: React.FC<{ title: string; icon: any; children: React.ReactNode; right?: React.ReactNode }> = ({ title, icon: I, children, right }) => (
  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontWeight: 800, color: C.text, fontSize: '.95rem' }}>
      <I size={17} color={C.blue} /> <span>{title}</span>
      {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
    </div>
    {children}
  </div>
);

const KV: React.FC<{ label: string; value: number | string; color?: string }> = ({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '.88rem' }}>
    <span style={{ color: C.slate }}>{label}</span>
    <b style={{ color: color || C.text }}>{value}</b>
  </div>
);

const Gauge: React.FC<{ value: number }> = ({ value }) => {
  const r = 46, circ = 2 * Math.PI * r, off = circ - (value / 100) * circ;
  return (
    <div style={{ position: 'relative', width: 120, height: 120 }}>
      <svg width={120} height={120} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={60} cy={60} r={r} fill="none" stroke="#eef2f7" strokeWidth={11} />
        <circle cx={60} cy={60} r={r} fill="none" stroke={C.green} strokeWidth={11} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: C.text }}>{value}%</div>
        <div style={{ fontSize: '.68rem', color: C.slate }}>affectés</div>
      </div>
    </div>
  );
};

const QualityBar: React.FC<{ label: string; pct: number; sub: string }> = ({ label, pct, sub }) => {
  const col = pct >= 90 ? C.green : pct >= 60 ? C.amber : C.red;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.85rem', marginBottom: 4 }}>
        <span style={{ color: C.text, fontWeight: 600 }}>{label}</span>
        <span style={{ color: col, fontWeight: 800 }}>{pct}%</span>
      </div>
      <div style={{ height: 8, background: '#eef2f7', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 5 }} />
      </div>
      <div style={{ fontSize: '.72rem', color: C.slate, marginTop: 3 }}>{sub}</div>
    </div>
  );
};

const PieBlock: React.FC<{ data: { label: string; count: number }[]; colors?: string[] }> = ({ data, colors = COLORS }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <ResponsiveContainer width="50%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
    <div style={{ flex: 1, fontSize: '.82rem' }}>
      {data.slice(0, 6).map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: colors[i % colors.length] }} />
          <span style={{ flex: 1, color: C.slate, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
          <b style={{ color: C.text }}>{d.count}</b>
        </div>
      ))}
    </div>
  </div>
);

const BarBlock: React.FC<{ data: { label: string; count: number }[]; color: string }> = ({ data, color }) => (
  <ResponsiveContainer width="100%" height={Math.max(180, data.length * 30)}>
    <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
      <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11 }} />
      <Tooltip />
      <Bar dataKey="count" fill={color} radius={[0, 5, 5, 0]} barSize={16} />
    </BarChart>
  </ResponsiveContainer>
);

const ErrBox: React.FC<{ msg: string; source?: string }> = ({ msg, source }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px 16px', borderRadius: 12, marginBottom: 16, fontSize: '.88rem' }}>
    <AlertTriangle size={18} />
    <span>{source === 'hub' ? '' : <b>GLPI 10 : </b>}{msg}</span>
  </div>
);

const Loading: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ textAlign: 'center', padding: 60, color: C.slate }}>
    <RefreshCw size={28} className="spin" /><div style={{ marginTop: 12 }}>{label}</div>
  </div>
);

// ─── Modal détail ─────────────────────────────────────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  name: 'Nom', serial: 'N° de série', otherserial: "N° d'inventaire", manufacturer: 'Fabricant',
  model: 'Modèle', type: 'Type', state: 'Statut', location: 'Lieu', entity: 'Entité',
  user: 'Affecté à (utilisateur)', group: 'Affecté à (groupe)', user_tech: 'Responsable technique',
  group_tech: 'Groupe technique', contact: 'Usager', contact_num: 'Usager numéro', comment: 'Commentaire',
  network: 'Réseau', uuid: 'UUID', autoupdate: 'Source de mise à jour',
  os: "Système d'exploitation", os_version: 'Version OS',
  contact_email: 'E-mail usager', contact_ad_name: 'Nom complet (AD)', contact_service: 'Service (AD)',
  user_email: 'E-mail utilisateur', user_ad_name: 'Nom complet (AD)', user_service: 'Service (AD)',
  buy_date: "Date d'achat", use_date: 'Mise en service (GLPI)',
  reception_date: 'Date de réception', service_date: 'Mise en service',
  supplier: 'Fournisseur', value: 'Valeur',
  order_number: 'N° de commande', immo_number: "N° d'immobilisation", age_years: 'Âge (ans)',
  date_creation: 'Date de création', date_mod: 'Dernière modification',
};

const DetailModal: React.FC<{ detail: any; token: string | null; onClose: () => void }> = ({ detail, token, onClose }) => {
  const [showAll, setShowAll] = useState(false);
  const [partiLoading, setPartiLoading] = useState(false);
  const s = detail.summary || {};
  const docUrl = (id: number) => `/api/parc/file/document/${id}?token=${token || ''}`;
  const handleParti = async () => {
    if (partiLoading) return;
    if (!window.confirm("Marquer cet équipement comme [PARTI] ?")) return;
    setPartiLoading(true);
    try {
      await axios.patch(`/api/parc/hub/${detail.type}/${s.id}`, { contact_num: '[PARTI]' }, { headers: { Authorization: `Bearer ${token}` } });
      s.contact_num = '[PARTI]';
    } catch (e: any) {
      alert(e.response?.data?.message || e.message);
    } finally { setPartiLoading(false); }
  };
  const groups = [
    { title: 'Affectation', fields: ['user', 'user_email', 'user_ad_name', 'user_service', 'group', 'user_tech', 'group_tech', 'contact', 'contact_email', 'contact_ad_name', 'contact_service', 'contact_num'] },
    { title: 'Localisation', fields: ['location', 'entity'] },
    { title: 'Identification', fields: ['serial', 'otherserial', 'manufacturer', 'model', 'type', 'state', 'network', 'uuid', 'os', 'os_version', 'autoupdate'] },
    { title: 'Réception, mise en service & achat', fields: ['reception_date', 'service_date', 'buy_date', 'use_date', 'supplier', 'value', 'order_number', 'immo_number', 'age_years'] },
    { title: 'Suivi', fields: ['date_creation', 'date_mod', 'comment'] },
  ];
  const fmt = (f: string, val: any) => {
    if (f === 'value') return eur(val);
    if (f === 'age_years') return `${val} an${val >= 2 ? 's' : ''}`;
    return String(val);
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 760, boxShadow: '0 25px 60px rgba(0,0,0,.3)' }}>
        {/* En-tête */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px', borderBottom: `1px solid ${C.border}`, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', borderRadius: '18px 18px 0 0', color: '#fff' }}>
          <div>
            <div style={{ fontSize: '.75rem', opacity: .85, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{detail.label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, marginTop: 2 }}>{s.name || `#${s.id || ''}`}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
              {s.user && <span style={{ fontSize: '.85rem', opacity: .92, display: 'inline-flex', alignItems: 'center', gap: 5 }}><User size={14} /> {s.user}</span>}
              {s.service_date && <span style={{ fontSize: '.78rem', background: 'rgba(255,255,255,.2)', padding: '2px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}><CalendarCheck2 size={12} /> Mise en service {s.service_date}</span>}
              {s.age_years != null && <span style={{ fontSize: '.78rem', background: 'rgba(255,255,255,.2)', padding: '2px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {s.age_years} an{s.age_years >= 2 ? 's' : ''}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {!detail.loading && !detail.error && s.name && (
              <button
                onClick={() => void printLabelWindow(s.name)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.4)', color: '#fff', borderRadius: 10, padding: '7px 14px', cursor: 'pointer', fontSize: '.82rem', fontWeight: 700, whiteSpace: 'nowrap' }}
              >
                <Printer size={14} /> Étiquette
              </button>
            )}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 10, padding: 8, cursor: 'pointer' }}><X size={18} /></button>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {detail.loading && <Loading label="Chargement de la fiche…" />}
          {detail.error && <ErrBox msg={detail.error} />}
          {!detail.loading && !detail.error && (
            <>
              {groups.map(g => {
                const present = g.fields.filter(f => s[f] !== null && s[f] !== undefined && s[f] !== '');
                if (!present.length) return null;
                return (
                  <div key={g.title} style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: '.72rem', fontWeight: 800, color: C.blue, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>{g.title}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 18px' }}>
                      {present.map(f => (
                        <div key={f} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 5 }}>
                          <div style={{ fontSize: '.72rem', color: C.slate }}>{FIELD_LABELS[f] || f}</div>
                          <div style={{ fontSize: '.9rem', color: C.text, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                            {f.endsWith('_email')
                              ? <a href={`mailto:${s[f]}`} style={{ color: C.blue }}>{String(s[f])}</a>
                              : fmt(f, s[f])}
                            {f === 'contact_num' && detail.source === 'hub' && (
                              <button onClick={handleParti} disabled={partiLoading} style={{
                                padding: '2px 10px', borderRadius: 6, border: `1px solid ${C.red}`, background: '#fef2f2',
                                color: C.red, fontSize: '.72rem', fontWeight: 700, cursor: partiLoading ? 'default' : 'pointer',
                                opacity: partiLoading ? 0.6 : 1, lineHeight: '20px',
                              }}>{partiLoading ? '…' : '[PARTI]'}</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Réseau */}
              {detail.network?.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 800, color: C.blue, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Réseau</div>
                  {detail.network.map((n: any, i: number) => (
                    <div key={i} style={{ fontSize: '.85rem', color: C.text, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <b>{n.name || '—'}</b> · MAC {n.mac || '—'} · IP {n.ip || '—'}
                    </div>
                  ))}
                </div>
              )}

              {/* OS */}
              {detail.os?.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 800, color: C.blue, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Système d'exploitation</div>
                  {detail.os.map((o: any, i: number) => (
                    <div key={i} style={{ fontSize: '.85rem', color: C.text, padding: '2px 0' }}>{[o.name, o.version, o.arch].filter(Boolean).join(' · ') || '—'}</div>
                  ))}
                </div>
              )}

              {/* Documents associés + images */}
              {detail.documents?.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 800, color: C.blue, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Documents associés</div>
                  {/* Vignettes pour les documents image */}
                  {detail.documents.some((d: any) => d.isImage) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                      {detail.documents.filter((d: any) => d.isImage).map((d: any) => (
                        <a key={d.id} href={docUrl(d.id)} target="_blank" rel="noreferrer" title={d.name}>
                          <img src={docUrl(d.id)} alt={d.name}
                            style={{ width: 120, height: 90, objectFit: 'contain', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff' }} />
                        </a>
                      ))}
                    </div>
                  )}
                  {/* Liste téléchargeable de tous les documents */}
                  {detail.documents.map((d: any) => (
                    <a key={d.id} href={docUrl(d.id)} target="_blank" rel="noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', color: C.blue, padding: '5px 0', borderBottom: '1px solid #f1f5f9', textDecoration: 'none' }}>
                      <Layers size={14} /> <span style={{ fontWeight: 600 }}>{d.name}</span>
                      {d.mime && <span style={{ color: C.slate, fontSize: '.74rem' }}>· {d.mime}</span>}
                    </a>
                  ))}
                </div>
              )}

              {/* Tous les champs secondaires */}
              <button onClick={() => setShowAll(!showAll)} style={{ ...btn(C.slate), background: '#f1f5f9', color: C.text, marginTop: 4 }}>
                <Layers size={15} /> {showAll ? 'Masquer' : 'Voir'} tous les champs ({Object.keys(detail.allFields || {}).length})
              </button>
              {showAll && (
                <div style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
                    <tbody>
                      {Object.entries(detail.allFields || {}).map(([k, val]) => (
                        <tr key={k} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 12px', color: C.slate, fontFamily: 'monospace', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{k}</td>
                          <td style={{ padding: '6px 12px', color: C.text, wordBreak: 'break-word' }}>{String(val)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>


      </div>
    </div>

  );
};

// ═══════════════════════════════════════════════════════════════
// MODAL ÉDITION D'UN DÉPLOIEMENT
// ═══════════════════════════════════════════════════════════════
const FIELD_DEFS: { key: string; label: string; type?: string; wide?: boolean }[] = [
  { key: 'date_deploiement', label: 'Date de déploiement', type: 'date' },
  { key: 'beneficiaire',     label: 'Bénéficiaire', wide: true },
  { key: 'direction',        label: 'Direction' },
  { key: 'service',          label: 'Service' },
  { key: 'installateur',     label: 'Installateur' },
  { key: 'type_operation',   label: "Type d'intervention", wide: true },
  { key: 'uc_nouveau_num',   label: 'UC / PC fourni' },
  { key: 'uc_nouveau_serie', label: 'N° série (nouveau)' },
  { key: 'uc_nouveau_modele',label: 'Modèle (nouveau)' },
  { key: 'uc_recupere_num',  label: 'UC récupéré' },
  { key: 'uc_recupere_serie',label: 'N° série (récupéré)' },
  { key: 'ecran1_nouveau_num',label: 'Écran 1 (nouveau)' },
  { key: 'ecran1_nouveau_serie',label: 'S/N Écran 1' },
  { key: 'ecran1_recupere_num',label: 'Écran 1 (récupéré)' },
  { key: 'ecran2_nouveau_serie',label: 'S/N Écran 2' },
  { key: 'materiel_type',    label: 'Type matériel' },
  { key: 'annee_materiel',   label: 'Année matériel', type: 'number' },
  { key: 'neuf_reco',        label: 'Neuf / Reconditionné' },
  { key: 'quantite',         label: 'Quantité', type: 'number' },
  { key: 'fichier',          label: 'Fichier (chemin)', wide: true },
  { key: 'fichier_lie',      label: 'Fichier lié (chemin)', wide: true },
  { key: 'autre_designation',label: 'Remarque / Désignation', wide: true },
];

const DeployEditModal: React.FC<{ row: any; token: string | null; onClose: () => void; onSaved: (r: any) => void }> = ({ row, token, onClose, onSaved }) => {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of FIELD_DEFS) {
      let v = row[f.key] ?? '';
      if (f.type === 'date' && v) {
        try { v = new Date(v).toISOString().slice(0, 10); } catch { v = ''; }
      }
      init[f.key] = String(v === null ? '' : v);
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const r = await axios.patch(`/api/deploiements/${row.id}`, form, { headers: { Authorization: `Bearer ${token}` } });
      onSaved(r.data);
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setSaving(false); }
  };

  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: '.88rem', boxSizing: 'border-box' as const, fontFamily: 'inherit', color: C.text, outline: 'none' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(3px)', zIndex: 1200, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 820, boxShadow: '0 25px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: `1px solid ${C.border}`, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', borderRadius: '18px 18px 0 0' }}>
          <div style={{ color: '#fff' }}>
            <div style={{ fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', opacity: .85 }}>Modifier le déploiement</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: 2 }}>{row.beneficiaire || `Fiche #${row.id}`}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 10, padding: 8, cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ padding: 24 }}>
          {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '.85rem' }}>{err}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 18px' }}>
            {FIELD_DEFS.map(f => (
              <div key={f.key} style={f.wide ? { gridColumn: '1 / -1' } : {}}>
                <label style={{ display: 'block', fontSize: '.72rem', fontWeight: 700, color: C.slate, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>{f.label}</label>
                <input
                  type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                  value={form[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={inp}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Annuler</button>
            <button onClick={save} disabled={saving} style={{ padding: '9px 24px', borderRadius: 10, border: 'none', background: saving ? '#94a3b8' : C.blue, color: '#fff', cursor: saving ? 'default' : 'pointer', fontWeight: 700 }}>
              {saving ? 'Enregistrement…' : '✓ Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// VISIONNEUSE DE DOCUMENT (PDF / Image / DOCX)
// ═══════════════════════════════════════════════════════════════
const DOC_EXTS_IMAGE = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
const DOC_EXTS_PDF   = ['.pdf'];
const DOC_EXTS_DOCX  = ['.docx', '.doc'];

const DocViewer: React.FC<{ filePath: string; filename: string; token: string | null; onClose: () => void }> = ({ filePath, filename, token, onClose }) => {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const previewUrl = `/api/deploiements/preview?path=${encodeURIComponent(filePath)}&token=${token || ''}`;
  const downloadUrl = `/api/deploiements/file?path=${encodeURIComponent(filePath)}&token=${token || ''}`;
  const isImage = DOC_EXTS_IMAGE.includes('.' + ext);
  const isPdf   = DOC_EXTS_PDF.includes('.' + ext);
  const isDocx  = DOC_EXTS_DOCX.includes('.' + ext);
  const canZoom = isImage || isDocx;

  const [zoom, setZoom] = useState(isDocx ? 100 : 100);
  const [docHtml, setDocHtml] = useState<string | null>(null);    // DOCX rendered HTML body
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Fetch DOCX HTML content from backend (mammoth conversion)
  useEffect(() => {
    if (!isDocx) { setLoading(false); return; }
    setLoading(true); setErr(null);
    fetch(previewUrl)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(html => {
        // Extract body content only, keep styles from head
        const headMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const styles = headMatch ? `<style>${headMatch[1]}</style>` : '';
        setDocHtml(styles + (bodyMatch ? bodyMatch[1] : html));
        setLoading(false);
      })
      .catch(e => { setErr(e.message); setLoading(false); });
  }, [previewUrl, isDocx]);

  const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 175, 200, 250, 300];
  const zoomIn  = () => setZoom(z => ZOOM_STEPS.find(s => s > z) ?? 300);
  const zoomOut = () => setZoom(z => [...ZOOM_STEPS].reverse().find(s => s < z) ?? 25);
  const zoomReset = () => setZoom(100);

  // Keyboard: Escape → ferme, +/= → zoom in, - → zoom out, 0 → reset
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (!canZoom) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn(); }
        else if (e.key === '-') { e.preventDefault(); zoomOut(); }
        else if (e.key === '0') { e.preventDefault(); zoomReset(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canZoom, onClose]);

  // Ctrl+molette pour zoomer (DOCX + images)
  useEffect(() => {
    if (!canZoom) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn(); else zoomOut();
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [canZoom]);

  // Print: opens a clean window with the document content and triggers print dialog
  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    if (isDocx && docHtml) {
      w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filename}</title>
        <style>
          @page { margin: 20mm; }
          body { font-family: system-ui, Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #000; max-width: none; }
          table { border-collapse: collapse; width: 100%; }
          td, th { border: 1px solid #888; padding: 5px 8px; }
          img { max-width: 100%; }
          h1,h2,h3,h4 { page-break-after: avoid; }
        </style></head><body>${docHtml}</body></html>`);
      w.document.close();
      w.focus();
      w.print();
      setTimeout(() => w.close(), 500);
    } else if (isPdf) {
      w.location.href = previewUrl;
      w.onload = () => w.print();
    } else if (isImage) {
      w.document.write(`<!DOCTYPE html><html><head><style>body{margin:0;display:flex;justify-content:center}img{max-width:100%}</style></head><body><img src="${previewUrl}"/></body></html>`);
      w.document.close(); w.focus(); w.print();
      setTimeout(() => w.close(), 500);
    }
  };

  // Toolbar button style
  const tbBtn = (active = false): React.CSSProperties => ({
    background: active ? 'rgba(255,255,255,.15)' : 'none',
    border: '1px solid #475569', color: '#cbd5e1', borderRadius: 7,
    padding: '5px 10px', cursor: 'pointer', display: 'inline-flex',
    alignItems: 'center', gap: 5, fontSize: '.8rem', fontWeight: 600,
    whiteSpace: 'nowrap' as const,
  });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(8,15,30,.85)', backdropFilter: 'blur(6px)', zIndex: 1300, display: 'flex', flexDirection: 'column' }}>

      {/* ── Barre d'outils ── */}
      <div onClick={e => e.stopPropagation()}
        style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0f172a', borderBottom: '1px solid #1e293b', padding: '10px 18px', flexShrink: 0, flexWrap: 'wrap' }}>

        {/* Nom de fichier */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f1f5f9', flex: 1, minWidth: 0 }}>
          <FileText size={16} color="#94a3b8" />
          <span style={{ fontWeight: 700, fontSize: '.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>{filename}</span>
          <span style={{ background: '#1e3a5f', color: '#7dd3fc', borderRadius: 5, padding: '1px 8px', fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0 }}>.{ext}</span>
        </div>

        {/* Zoom (DOCX + images) */}
        {canZoom && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#1e293b', borderRadius: 8, padding: '3px 6px' }}>
            <button onClick={zoomOut}  style={tbBtn()} title="Zoom arrière (-)"><ZoomOut size={15} /></button>
            <button onClick={zoomReset} style={{ ...tbBtn(), minWidth: 52, justifyContent: 'center', borderColor: zoom !== 100 ? '#2563eb' : '#475569', color: zoom !== 100 ? '#93c5fd' : '#cbd5e1' }} title="Remettre à 100%">
              {zoom}%
            </button>
            <button onClick={zoomIn}  style={tbBtn()} title="Zoom avant (+)"><ZoomIn size={15} /></button>
          </div>
        )}

        {/* Imprimer */}
        {(isDocx || isPdf || isImage) && (
          <button onClick={handlePrint} style={tbBtn()} title="Imprimer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Imprimer
          </button>
        )}

        {/* Télécharger */}
        <a href={downloadUrl} download={filename} onClick={e => e.stopPropagation()}
          style={{ ...tbBtn(), background: '#1d4ed8', border: '1px solid #2563eb', color: '#fff', textDecoration: 'none' }}>
          <Download size={14} /> Télécharger
        </a>

        {/* Fermer */}
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', borderRadius: 6, display: 'inline-flex' }} title="Fermer">
          <X size={20} />
        </button>
      </div>

      {/* ── Zone de contenu ── */}
      <div onClick={e => e.stopPropagation()} style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: isPdf ? 'stretch' : 'flex-start', padding: isPdf ? 0 : '24px 16px', background: isPdf ? '#525659' : '#1e2533', minHeight: 0 }}>

        {/* Erreur */}
        {err && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: '#94a3b8', marginTop: 60 }}>
            <AlertTriangle size={48} color="#fca5a5" />
            <div style={{ fontSize: '1rem', color: '#f1f5f9' }}>Impossible d'afficher ce fichier</div>
            <div style={{ fontSize: '.82rem', color: '#64748b' }}>{err}</div>
            <a href={downloadUrl} download style={{ color: '#60a5fa', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Download size={14} /> Télécharger à la place</a>
          </div>
        )}

        {/* Chargement DOCX */}
        {!err && isDocx && loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: '#94a3b8', marginTop: 60 }}>
            <RefreshCw size={32} className="spin" />
            <div>Conversion du document…</div>
          </div>
        )}

        {/* DOCX — page blanche avec contenu HTML */}
        {!err && isDocx && !loading && docHtml && (
          <div style={{ width: '100%', maxWidth: 880, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Feuille de papier */}
            <div style={{
              background: '#fff', borderRadius: 4, boxShadow: '0 4px 24px rgba(0,0,0,.4)',
              padding: '48px 56px', minHeight: 400,
              transformOrigin: 'top center',
              transform: `scale(${zoom / 100})`,
              // Compense la perte d'espace vertical causée par le scale
              marginBottom: zoom < 100 ? `${-(100 - zoom) * 5}px` : 0,
            }}>
              <div
                style={{ fontFamily: 'system-ui, Arial, sans-serif', fontSize: '10.5pt', lineHeight: 1.65, color: '#1a1a1a' }}
                dangerouslySetInnerHTML={{ __html: docHtml }}
              />
            </div>
          </div>
        )}

        {/* PDF — plein écran avec contrôles natifs du navigateur */}
        {!err && isPdf && (
          <iframe src={previewUrl} title={filename} onError={() => setErr('Impossible de charger le PDF')}
            style={{ flex: 1, width: '100%', border: 'none' }} />
        )}

        {/* Image */}
        {!err && isImage && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
            <img src={previewUrl} alt={filename} onLoad={() => setLoading(false)} onError={() => setErr('Image introuvable ou inaccessible')}
              style={{ width: `${zoom}%`, maxWidth: 'none', borderRadius: 6, boxShadow: '0 8px 32px rgba(0,0,0,.5)', display: 'block' }} />
          </div>
        )}

        {/* Extension non supportée */}
        {!err && !isDocx && !isPdf && !isImage && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#94a3b8', marginTop: 60 }}>
            <FileText size={56} color="#334155" />
            <div style={{ color: '#f1f5f9', fontWeight: 600 }}>Extension <b>.{ext}</b> non prévisualisable</div>
            <a href={downloadUrl} download style={{ color: '#60a5fa', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Download size={14} /> Télécharger</a>
          </div>
        )}
      </div>

      {/* ── Barre de statut (DOCX) ── */}
      {isDocx && !loading && !err && (
        <div style={{ background: '#0f172a', borderTop: '1px solid #1e293b', padding: '5px 18px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <span style={{ fontSize: '.75rem', color: '#475569' }}>
            Zoom : <b style={{ color: '#94a3b8' }}>{zoom}%</b>
          </span>
          <span style={{ fontSize: '.75rem', color: '#475569' }}>
            Ctrl + molette pour zoomer · Impr. pour imprimer en qualité native
          </span>
        </div>
      )}
    </div>
  );
};

export default ParcInformatique;
