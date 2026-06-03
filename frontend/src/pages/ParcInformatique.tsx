import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import {
  Monitor, Laptop, Printer, HardDrive, Network, Phone, Search, X,
  RefreshCw, MapPin, User, Tag, Cpu, Activity, BarChart3, List,
  CheckCircle2, AlertTriangle, Layers, ChevronRight, Boxes,
  Euro, ShieldCheck, Clock, Truck, Database, FileText, Users, CalendarCheck2, CalendarDays,
  ArrowLeftRight,
} from 'lucide-react';

// ─── Constantes ─────────────────────────────────────────────────────────────
const TYPES = [
  { key: 'tous',          label: 'Tous',          icon: Boxes },
  { key: 'ordinateurs',   label: 'Ordinateurs',   icon: Laptop },
  { key: 'moniteurs',     label: 'Moniteurs',     icon: Monitor },
  { key: 'peripheriques', label: 'Périphériques', icon: HardDrive },
  { key: 'imprimantes',   label: 'Imprimantes',   icon: Printer },
  { key: 'reseau',        label: 'Réseau',        icon: Network },
  { key: 'telephones',    label: 'Téléphones',    icon: Phone },
];
const TYPE_ICON: Record<string, any> = Object.fromEntries(TYPES.map(t => [t.key, t.icon]));
const COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#65a30d', '#0ea5e9', '#9333ea'];
const C = { blue: '#2563eb', slate: '#64748b', green: '#059669', amber: '#d97706', red: '#dc2626', bg: '#f1f5f9', card: '#fff', border: '#e2e8f0', text: '#0f172a' };

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
    parLieu: Count[];
    parFabricant: Count[];
    parModele: Count[];
    parFournisseur: Count[];
    parOs: Count[];
    ajoutsParAnnee: { annee: string; count: number }[];
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

const ParcInformatique: React.FC = () => {
  const { token } = useAuth();
  const [source, setSource] = useState<'live' | 'hub'>('hub');
  const api = axios.create({ baseURL: `/api/parc/${source}`, headers: { Authorization: `Bearer ${token}` } });

  const [tab, setTab] = useState<'dashboard' | 'list' | 'stock' | 'usagers' | 'geo' | 'deploiements'>('dashboard');
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [kpiErr, setKpiErr] = useState<string | null>(null);
  const [loadingKpi, setLoadingKpi] = useState(false);

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
  const [filters, setFilters] = useState<{ locations: string[]; states: string[]; manufacturers: string[]; suppliers: string[]; groups: string[] }>({ locations: [], states: [], manufacturers: [], suppliers: [], groups: [] });
  const [fLocation, setFLocation] = useState('');
  const [fState, setFState] = useState('');
  const [fMan, setFMan] = useState('');
  const [fSupplier, setFSupplier] = useState('');
  const [fMise, setFMise] = useState('');
  const [fGroup, setFGroup] = useState('');
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
  const [deployLimit] = useState(50);
  const [deployConflictsOpen, setDeployConflictsOpen] = useState(false);
  const [deployConflicts, setDeployConflicts] = useState<any[]>([]);

  // Détail
  const [detail, setDetail] = useState<any | null>(null);

  // Inversion / recherche AD
  const [swapping, setSwapping] = useState<Record<string, boolean>>({});
  const [adModal, setAdModal] = useState<AdModal | null>(null);

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

  // ── Liste ──
  const loadList = useCallback(async (refresh = false) => {
    setLoadingList(true); setListErr(null);
    try {
      const r = await api.get(`/${type}`, { params: {
        q, start, limit, affecte: affecte || undefined,
        location: fLocation || undefined, state: fState || undefined, manufacturer: fMan || undefined,
        supplier: fSupplier || undefined, mise: fMise || undefined, group: fGroup || undefined,
        ad: fAd || undefined, docs: fDocs ? '1' : undefined, stock: fStock ? '1' : '0',
        sort: sortCol, dir: sortDir,
        refresh: refresh ? 1 : undefined,
      } });
      setRows(r.data.rows); setTotal(r.data.total);
    } catch (e: any) {
      setListErr(e.response?.data?.message || e.message); setRows([]); setTotal(0);
    } finally { setLoadingList(false); }
  }, [type, q, start, limit, affecte, fLocation, fState, fMan, fSupplier, fMise, fAd, fDocs, fStock, fGroup, sortCol, sortDir, token, source]);

  const loadFilters = useCallback(async () => {
    try {
      const r = await api.get(`/${type}/filters`);
      setFilters({ locations: r.data.locations || [], states: r.data.states || [], manufacturers: r.data.manufacturers || [], suppliers: r.data.suppliers || [], groups: r.data.groups || [] });
    } catch { setFilters({ locations: [], states: [], manufacturers: [], suppliers: [], groups: [] }); }
  }, [type, token, source]);

  // Efface les erreurs résiduelles quand on bascule de source (live ↔ hub)
  useEffect(() => { setKpiErr(null); setListErr(null); setUsagerErr(null); }, [source]);
  useEffect(() => { loadKpis(); }, [loadKpis]);
  useEffect(() => { if (tab === 'list') { loadList(); } }, [tab, type, start, affecte, fLocation, fState, fMan, fSupplier, fMise, fAd, fDocs, fStock, fGroup, sortCol, sortDir, source]);
  useEffect(() => { if (tab === 'list') { setStart(0); setFLocation(''); setFState(''); setFMan(''); setFSupplier(''); setFMise(''); setFAd(undefined); setFDocs(false); setFStock(false); setFGroup(''); setSortCol('name'); setSortDir('asc'); loadFilters(); } }, [type, tab, source]);

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
      const r = await axios.get('/api/deploiements/', {
        headers: { Authorization: `Bearer ${token}` },
        params: { direction: deployDir || undefined, type_operation: deployType || undefined, annee: deployAnnee || undefined, q: deployQ || undefined, start: deployStart, limit: deployLimit },
      });
      setDeploys(r.data.rows || []); setDeployTotal(r.data.total || 0);
    } catch (e: any) {
      setDeployErr(e.response?.data?.message || e.message); setDeploys([]); setDeployTotal(0);
    } finally { setDeployLoading(false); }
  }, [token, deployDir, deployType, deployAnnee, deployQ, deployStart, deployLimit]);

  const loadDeployKpis = useCallback(async () => {
    try {
      const r = await axios.get('/api/deploiements/kpis', { headers: { Authorization: `Bearer ${token}` } });
      setDeployKpis(r.data);
    } catch { /* silencieux */ }
  }, [token]);

  const loadDeployConflicts = useCallback(async () => {
    try {
      const r = await axios.get('/api/deploiements/matches', { headers: { Authorization: `Bearer ${token}` } });
      setDeployConflicts(r.data || []);
    } catch { setDeployConflicts([]); }
  }, [token]);

  useEffect(() => {
    if (tab === 'deploiements') {
      loadDeploys();
      loadDeployKpis();
    }
  }, [tab, deployDir, deployType, deployAnnee, deployQ, deployStart]);

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
            <button onClick={() => tab === 'dashboard' ? loadKpis(true) : tab === 'stock' ? loadStock() : tab === 'usagers' ? loadUsagers() : tab === 'geo' ? loadGeo() : loadList(true)}
              style={btn(C.blue)}>
              <RefreshCw size={15} className={loadingKpi || loadingList || loadingUsagers ? 'spin' : ''} /> Actualiser
            </button>
          </div>
        </div>

        {/* Onglets */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 22, borderBottom: `1px solid ${C.border}` }}>
          {[{ k: 'dashboard', l: 'Tableau de bord', i: BarChart3 }, { k: 'list', l: 'Équipements', i: List }, { k: 'stock', l: 'Stock', i: Boxes }, { k: 'usagers', l: 'Usagers', i: Users }, { k: 'geo', l: 'Géo', i: MapPin }, { k: 'deploiements', l: 'Déploiements', i: Truck }].map(t => {
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
                </div>

                {/* Affectation + qualité */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
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
                  </Panel>
                  <Panel title="Qualité des données" icon={CheckCircle2}>
                    <QualityBar label="N° de série renseigné" pct={kpis.ordinateurs.qualite.tauxSerie} sub={`${kpis.ordinateurs.qualite.sansSerie} manquants`} />
                    <QualityBar label="N° d'inventaire renseigné" pct={kpis.ordinateurs.qualite.tauxInventaire} sub={`${kpis.ordinateurs.qualite.sansInventaire} manquants`} />
                    <QualityBar label="Lieu renseigné" pct={kpis.ordinateurs.qualite.tauxLieu} sub={`${kpis.ordinateurs.qualite.sansLieu} manquants`} />
                  </Panel>
                </div>

                {/* Indicateurs de gestion */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(165px,1fr))', gap: 14, marginBottom: 18 }}>
                  <StatCard icon={Euro} label="Valeur du parc" value={kpis.valeurParc} color="#0891b2" money />
                  <StatCard icon={CalendarCheck2} label="Mise en service connue" value={kpis.ordinateurs.miseEnService.connue}
                    sub={`${kpis.ordinateurs.miseEnService.tauxConnue}%`} color={C.green} />
                  <StatCard icon={Clock} label="Âge moyen PC"
                    value={kpis.ordinateurs.age.moyen ?? 0} suffix=" ans" color={C.slate} decimals />
                  <StatCard icon={RefreshCw} label="PC à renouveler (>5 ans)" value={kpis.ordinateurs.age.aRenouveler}
                    sub={`${kpis.ordinateurs.age.tauxRenouveler}%`} color={C.amber} />
                </div>

                {/* Anomalies / qualité d'inventaire */}
                <div style={{ marginBottom: 18 }}>
                  <Panel title="Anomalies à traiter" icon={AlertTriangle}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 12 }}>
                      <Anomaly label="Sans n° de série" n={kpis.ordinateurs.qualite.sansSerie} />
                      <Anomaly label="Sans n° d'inventaire" n={kpis.ordinateurs.qualite.sansInventaire} />
                      <Anomaly label="Sans lieu" n={kpis.ordinateurs.qualite.sansLieu} />
                      <Anomaly label="Non affectés" n={kpis.ordinateurs.nonAffectes} />
                      <Anomaly label="Sans date de mise en service" n={kpis.ordinateurs.qualite.sansMiseEnService} />
                      <Anomaly label="Doublons de série" n={kpis.ordinateurs.qualite.doublonsSerie} />
                    </div>
                  </Panel>
                </div>

                {/* Graphiques */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                  <Panel title="Ordinateurs par statut" icon={Activity}>
                    <PieBlock data={kpis.ordinateurs.parStatut} />
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
                  <Panel title="Top fournisseurs" icon={Truck}>
                    <BarBlock data={kpis.ordinateurs.parFournisseur.slice(0, 8)} color="#0891b2" />
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

                {kpis.ordinateurs.ajoutsParAnnee.length > 1 && (
                  <Panel title="Ajouts d'ordinateurs au parc par année" icon={BarChart3}>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={kpis.ordinateurs.ajoutsParAnnee}>
                        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.blue} stopOpacity={0.35} /><stop offset="100%" stopColor={C.blue} stopOpacity={0} />
                        </linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                        <XAxis dataKey="annee" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                        <Tooltip />
                        <Area type="monotone" dataKey="count" name="Ordinateurs" stroke={C.blue} fill="url(#g)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Panel>
                )}
              </>
            )}
          </>
        )}

        {/* ─── ÉQUIPEMENTS ─── */}
        {tab === 'list' && (
          <>
            {/* Sélecteur de type */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
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
            </div>

            {/* Filtres */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1 1 260px' }}>
                <Search size={16} style={{ position: 'absolute', left: 11, top: 11, color: C.slate }} />
                <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setStart(0); loadList(); } }}
                  placeholder="Nom, série, inventaire, utilisateur, usager, n° usager, lieu…"
                  style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: '.9rem', boxSizing: 'border-box' }} />
              </div>
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
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: C.text }}>{v(r.name)}</td>
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
                                    {typeLabel}
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

          const dirs = deployKpis ? (deployKpis.by_direction || []).map((d: any) => d.direction).filter(Boolean) : [];
          const types = deployKpis ? (deployKpis.by_type || []).map((t: any) => t.type_operation).filter(Boolean) : [];
          const annees = deployKpis ? (deployKpis.by_annee || []).map((a: any) => String(a.annee)).filter(Boolean) : [];

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

              {/* Bandeau conflits */}
              {(deployKpis?.nb_conflits ?? 0) > 0 && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: '.88rem', color: '#92400e' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span><b>{deployKpis.nb_conflits} conflit{deployKpis.nb_conflits > 1 ? 's' : ''} de numéro de série</b> détecté{deployKpis.nb_conflits > 1 ? 's' : ''} entre fiches et parc</span>
                    <button onClick={() => { if (!deployConflictsOpen) loadDeployConflicts(); setDeployConflictsOpen(o => !o); }}
                      style={{ background: 'none', border: '1px solid #fed7aa', borderRadius: 7, padding: '3px 12px', color: '#92400e', cursor: 'pointer', fontSize: '.82rem', fontWeight: 700 }}>
                      {deployConflictsOpen ? 'Masquer' : 'Voir les détails'}
                    </button>
                  </div>
                  {deployConflictsOpen && deployConflicts.length > 0 && (
                    <div style={{ marginTop: 10, overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                        <thead>
                          <tr style={{ background: '#fef3c7' }}>
                            {['Date', 'Bénéficiaire', 'N° UC', 'S/N fiche', 'S/N parc'].map(h => (
                              <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {deployConflicts.map((c: any) => (
                            <tr key={c.id} style={{ borderTop: '1px solid #fed7aa' }}>
                              <td style={{ padding: '5px 10px' }}>{fmtD(c.date_deploiement)}</td>
                              <td style={{ padding: '5px 10px' }}>{c.beneficiaire || '—'}</td>
                              <td style={{ padding: '5px 10px', fontWeight: 700 }}>{c.uc_nouveau_num}</td>
                              <td style={{ padding: '5px 10px', fontFamily: 'monospace' }}>{c.uc_nouveau_serie}</td>
                              <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: '#b91c1c' }}>{c.parc_serie}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Filtres */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
                <input value={deployQ} onChange={e => { setDeployQ(e.target.value); setDeployStart(0); }} placeholder="Recherche (bénéficiaire, UC…)"
                  style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: '.88rem', minWidth: 220 }} />
                <select value={deployDir} onChange={e => { setDeployDir(e.target.value); setDeployStart(0); }}
                  style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: '.88rem' }}>
                  <option value="">Toutes directions</option>
                  {dirs.map((d: string) => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={deployType} onChange={e => { setDeployType(e.target.value); setDeployStart(0); }}
                  style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: '.88rem' }}>
                  <option value="">Tous types</option>
                  {types.map((t: string) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={deployAnnee} onChange={e => { setDeployAnnee(e.target.value); setDeployStart(0); }}
                  style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: '.88rem' }}>
                  <option value="">Toutes années</option>
                  {annees.map((a: string) => <option key={a} value={a}>{a}</option>)}
                </select>
                <span style={{ color: C.slate, fontSize: '.82rem', marginLeft: 4 }}>{deployTotal} fiche{deployTotal > 1 ? 's' : ''}</span>
              </div>

              {/* Tableau */}
              {deployLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: C.slate }}>Chargement…</div>
              ) : (
                <div style={{ overflowX: 'auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.84rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: `2px solid ${C.border}` }}>
                        {['Date', 'Bénéficiaire', 'Direction / Service', 'UC fourni', 'Modèle UC', 'UC récupéré', 'Écran(s)', 'Installateur', 'Type', 'Fichier(s)'].map(h => (
                          <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: C.slate, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {deploys.length === 0 ? (
                        <tr><td colSpan={10} style={{ padding: 32, textAlign: 'center', color: C.slate }}>Aucune fiche</td></tr>
                      ) : deploys.map((row: any) => (
                        <tr key={row.id} style={{ borderTop: `1px solid ${C.border}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '.8rem' }}>{fmtD(row.date_deploiement)}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{row.beneficiaire || '—'}</td>
                          <td style={{ padding: '8px 12px', fontSize: '.8rem' }}>
                            {row.direction && <span style={{ fontWeight: 700, color: C.text }}>{row.direction}</span>}
                            {row.service && <span style={{ color: C.slate }}> / {row.service}</span>}
                            {!row.direction && !row.service && '—'}
                          </td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            {row.uc_nouveau_num ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{row.uc_nouveau_num}</span>
                                {matchBadge(row)}
                              </span>
                            ) : '—'}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '.8rem', color: C.slate }}>{row.uc_nouveau_modele || '—'}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '.8rem' }}>{row.uc_recupere_num || '—'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {(row.ecran1_nouveau_num || row.ecran1_nouveau_serie || row.ecran2_nouveau_serie)
                              ? <Monitor size={14} color={C.blue} title="Écran(s) inclus" />
                              : <span style={{ color: '#cbd5e1' }}>—</span>}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '.8rem' }}>{row.installateur || '—'}</td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{typeBadge(row.type_operation)}</td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            {row.fichier && (
                              <a href={`/api/deploiements/file?path=${encodeURIComponent(row.fichier)}`} target="_blank" rel="noreferrer"
                                style={{ color: C.blue, display: 'inline-flex', alignItems: 'center', gap: 4 }} title={row.fichier}>
                                <FileText size={15} />
                              </a>
                            )}
                            {row.fichier_lie && (
                              <a href={`/api/deploiements/file?path=${encodeURIComponent(row.fichier_lie)}`} target="_blank" rel="noreferrer"
                                style={{ color: C.slate, display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6 }} title={row.fichier_lie}>
                                <FileText size={13} />
                              </a>
                            )}
                            {!row.fichier && <span style={{ color: '#cbd5e1' }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {deployTotal > deployLimit && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14 }}>
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
              )}
            </div>
          );
        })()}

      </div>

      {/* ─── MODAL DÉTAIL ─── */}
      {detail && (
        <DetailModal detail={detail} token={token} onClose={() => setDetail(null)} />
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

const Anomaly: React.FC<{ label: string; n: number }> = ({ label, n }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${n > 0 ? '#fed7aa' : C.border}`, background: n > 0 ? '#fff7ed' : '#f8fafc' }}>
    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: n > 0 ? C.amber : C.green, minWidth: 34 }}>{n}</div>
    <div style={{ fontSize: '.78rem', color: C.slate, fontWeight: 600, lineHeight: 1.2 }}>{label}</div>
  </div>
);

const Panel: React.FC<{ title: string; icon: any; children: React.ReactNode }> = ({ title, icon: I, children }) => (
  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontWeight: 800, color: C.text, fontSize: '.95rem' }}>
      <I size={17} color={C.blue} /> {title}
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
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 10, padding: 8, cursor: 'pointer' }}><X size={18} /></button>
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

export default ParcInformatique;
