import React, { useEffect, useState, useCallback } from 'react';
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
  Euro, ShieldCheck, ShieldAlert, Clock, Truck, Database, FileText, Users, CalendarCheck2, CalendarDays,
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
type WarrantyStatus = 'active' | 'bientot' | 'expiree' | 'illimitee' | 'inconnue';
interface Row {
  id: number; name: string | null; serial: string | null; otherserial: string | null;
  manufacturer: string | null; model: string | null; type: string | null;
  state: string | null; location: string | null; user: string | null;
  contact: string | null; contact_num: string | null; doc_count: number;
  ad_found: boolean; itemtype_label: string | null; type_key: string | null;
  age_source: 'use_date' | 'buy_date' | 'warranty' | null;
  group: string | null; user_tech: string | null; date_mod: string | null;
  network: string | null; uuid: string | null; supplier: string | null;
  value: number | null; buy_date: string | null; warranty_end: string | null;
  warranty_days: number | null; warranty_status: WarrantyStatus; age_years: number | null;
  os: string | null; os_version: string | null;
}
interface UsagerRow { contact: string; ad_found: boolean; count: number; by_type: Record<string, number> }
interface Count { label: string; count: number }
interface Kpis {
  totalAll: number;
  valeurParc: number;
  byType: { key: string; label: string; count: number; value: number }[];
  ordinateurs: {
    total: number; affectes: number; nonAffectes: number; tauxAffectation: number; valeur: number;
    qualite: { tauxSerie: number; tauxInventaire: number; tauxLieu: number; sansSerie: number; sansInventaire: number; sansLieu: number; sansGarantie: number; doublonsSerie: number };
    garantie: { active: number; bientot: number; expiree: number; illimitee: number; inconnue: number; sousGarantie: number; tauxSousGarantie: number };
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

// Badge de garantie (couleur + libellé) ───────────────────────────────────────
const WARRANTY_META: Record<WarrantyStatus, { label: string; color: string; bg: string }> = {
  active:    { label: 'Sous garantie', color: '#15803d', bg: '#dcfce7' },
  bientot:   { label: 'Expire bientôt', color: '#b45309', bg: '#fef3c7' },
  expiree:   { label: 'Expirée',        color: '#b91c1c', bg: '#fee2e2' },
  illimitee: { label: 'Illimitée',      color: '#1d4ed8', bg: '#dbeafe' },
  inconnue:  { label: 'Inconnue',       color: '#64748b', bg: '#f1f5f9' },
};
const eur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// ─── Helpers ────────────────────────────────────────────────────────────────
const v = (x: any) => (x === null || x === undefined || x === '') ? <span style={{ color: '#cbd5e1' }}>—</span> : x;

const ParcInformatique: React.FC = () => {
  const { token } = useAuth();
  const [source, setSource] = useState<'live' | 'hub'>('hub');
  const api = axios.create({ baseURL: `/api/parc/${source}`, headers: { Authorization: `Bearer ${token}` } });

  const [tab, setTab] = useState<'dashboard' | 'list' | 'usagers'>('dashboard');
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
  const [fWarranty, setFWarranty] = useState('');
  const [fGroup, setFGroup] = useState('');
  const [fAd, setFAd] = useState<'' | '1' | '0'>();
  const [fDocs, setFDocs] = useState(false);

  // Usagers
  const [usagers, setUsagers] = useState<UsagerRow[]>([]);
  const [loadingUsagers, setLoadingUsagers] = useState(false);
  const [usagerErr, setUsagerErr] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [contactItems, setContactItems] = useState<Row[]>([]);
  const [loadingContact, setLoadingContact] = useState(false);
  const [searchUsager, setSearchUsager] = useState('');

  // Détail
  const [detail, setDetail] = useState<any | null>(null);

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
        supplier: fSupplier || undefined, warranty: fWarranty || undefined, group: fGroup || undefined,
        ad: fAd || undefined,
        docs: fDocs ? '1' : undefined,
        refresh: refresh ? 1 : undefined,
      } });
      setRows(r.data.rows); setTotal(r.data.total);
    } catch (e: any) {
      setListErr(e.response?.data?.message || e.message); setRows([]); setTotal(0);
    } finally { setLoadingList(false); }
  }, [type, q, start, limit, affecte, fLocation, fState, fMan, fSupplier, fWarranty, fAd, fDocs, fGroup, token, source]);

  const loadFilters = useCallback(async () => {
    try {
      const r = await api.get(`/${type}/filters`);
      setFilters({ locations: r.data.locations || [], states: r.data.states || [], manufacturers: r.data.manufacturers || [], suppliers: r.data.suppliers || [], groups: r.data.groups || [] });
    } catch { setFilters({ locations: [], states: [], manufacturers: [], suppliers: [], groups: [] }); }
  }, [type, token, source]);

  // Efface les erreurs résiduelles quand on bascule de source (live ↔ hub)
  useEffect(() => { setKpiErr(null); setListErr(null); setUsagerErr(null); }, [source]);
  useEffect(() => { loadKpis(); }, [loadKpis]);
  useEffect(() => { if (tab === 'list') { loadList(); } }, [tab, type, start, affecte, fLocation, fState, fMan, fSupplier, fWarranty, fAd, fDocs, fGroup, source]);
  useEffect(() => { if (tab === 'list') { setStart(0); setFLocation(''); setFState(''); setFMan(''); setFSupplier(''); setFWarranty(''); setFAd(undefined); setFDocs(false); setFGroup(''); loadFilters(); } }, [type, tab, source]);

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

  useEffect(() => { if (tab === 'usagers') loadUsagers(); }, [tab, source]);

  // ─── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <Header />
      <div style={{ maxWidth: 1340, margin: '0 auto', padding: '24px 20px 60px' }}>

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
            <button onClick={() => tab === 'dashboard' ? loadKpis(true) : tab === 'usagers' ? loadUsagers() : loadList(true)}
              style={btn(C.blue)}>
              <RefreshCw size={15} className={loadingKpi || loadingList || loadingUsagers ? 'spin' : ''} /> Actualiser
            </button>
          </div>
        </div>

        {/* Onglets */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 22, borderBottom: `1px solid ${C.border}` }}>
          {[{ k: 'dashboard', l: 'Tableau de bord', i: BarChart3 }, { k: 'list', l: 'Équipements', i: List }, { k: 'usagers', l: 'Usagers', i: Users }].map(t => {
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
                  <StatCard icon={ShieldCheck} label="PC sous garantie" value={kpis.ordinateurs.garantie.sousGarantie}
                    sub={`${kpis.ordinateurs.garantie.tauxSousGarantie}%`} color={C.green} />
                  <StatCard icon={ShieldAlert} label="Garantie expirée" value={kpis.ordinateurs.garantie.expiree} color={C.red} />
                  <StatCard icon={Clock} label="Âge moyen PC"
                    value={kpis.ordinateurs.age.moyen ?? 0} suffix=" ans" color={C.slate} decimals />
                  <StatCard icon={RefreshCw} label="PC à renouveler (>5 ans)" value={kpis.ordinateurs.age.aRenouveler}
                    sub={`${kpis.ordinateurs.age.tauxRenouveler}%`} color={C.amber} />
                </div>

                {/* Garantie + âge */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                  <Panel title="État de garantie des ordinateurs" icon={ShieldCheck}>
                    <PieBlock data={[
                      { label: 'Sous garantie', count: kpis.ordinateurs.garantie.active },
                      { label: 'Expire < 90 j', count: kpis.ordinateurs.garantie.bientot },
                      { label: 'Expirée', count: kpis.ordinateurs.garantie.expiree },
                      { label: 'Illimitée', count: kpis.ordinateurs.garantie.illimitee },
                      { label: 'Inconnue', count: kpis.ordinateurs.garantie.inconnue },
                    ].filter(d => d.count > 0)} colors={['#059669', '#d97706', '#dc2626', '#2563eb', '#94a3b8']} />
                  </Panel>
                  <Panel title="Âge du parc (ordinateurs)" icon={Clock}>
                    <BarBlock data={kpis.ordinateurs.age.tranches} color="#7c3aed" />
                  </Panel>
                </div>

                {/* Anomalies / qualité d'inventaire */}
                <div style={{ marginBottom: 18 }}>
                  <Panel title="Anomalies à traiter" icon={AlertTriangle}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 12 }}>
                      <Anomaly label="Sans n° de série" n={kpis.ordinateurs.qualite.sansSerie} />
                      <Anomaly label="Sans n° d'inventaire" n={kpis.ordinateurs.qualite.sansInventaire} />
                      <Anomaly label="Sans lieu" n={kpis.ordinateurs.qualite.sansLieu} />
                      <Anomaly label="Non affectés" n={kpis.ordinateurs.nonAffectes} />
                      <Anomaly label="Sans info garantie" n={kpis.ordinateurs.qualite.sansGarantie} />
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
              <select value={fWarranty} onChange={e => { setStart(0); setFWarranty(e.target.value); }} style={selStyle}>
                <option value="">Garantie : toutes</option>
                <option value="active">Sous garantie</option>
                <option value="bientot">Expire &lt; 90 j</option>
                <option value="expiree">Expirée</option>
                <option value="inconnue">Inconnue</option>
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
                  const colSpan = isTous ? 14 : 13;
                  const hdrs = isTous
                    ? ['Nom', 'Type', 'Usager', 'N° usager', 'Groupe', 'Lieu', 'Modèle', 'N° série', 'Statut', 'Garantie', 'Âge', 'Docs', '']
                    : ['Nom', 'Usager', 'N° usager', 'Groupe', 'Lieu', 'Modèle', 'N° série', 'Statut', 'Garantie', 'Âge', 'Docs', ''];
                  return (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.86rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'left', color: C.slate }}>
                      {hdrs.map((h, i) =>
                        <th key={i} style={{ padding: '10px 14px', fontWeight: 700, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.02em' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={`${r.itemtype_label}-${r.id}`} onClick={() => openDetail(r.id, r.type_key || undefined)} style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: C.text }}>{v(r.name)}</td>
                        {isTous && <td style={{ padding: '10px 14px' }}>{r.itemtype_label ? <span style={{ background: '#f1f5f9', color: C.slate, padding: '2px 8px', borderRadius: 6, fontSize: '.78rem', fontWeight: 600 }}>{r.itemtype_label}</span> : v(null)}</td>}
                        <td style={{ padding: '10px 14px' }}>
                          {r.contact
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                {r.ad_found && <span title="Trouvé dans l'AD"><ShieldCheck size={13} color="#7c3aed" /></span>}
                                <User size={13} color={C.green} />
                                {r.contact}
                              </span>
                            : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '.82rem', color: C.slate }}>{v(r.contact_num)}</td>
                        <td style={{ padding: '10px 14px', fontSize: '.82rem' }}>{r.group ? <span style={{ background: '#f5f3ff', color: '#7c3aed', padding: '2px 8px', borderRadius: 6, fontSize: '.76rem', fontWeight: 600 }}>{r.group}</span> : v(null)}</td>
                        <td style={{ padding: '10px 14px' }}>{v(r.location)}</td>
                        <td style={{ padding: '10px 14px', color: C.slate }}>{v(r.model)}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '.8rem' }}>{v(r.serial)}</td>
                        <td style={{ padding: '10px 14px' }}>{r.state ? <span style={{ background: '#eff6ff', color: C.blue, padding: '2px 8px', borderRadius: 6, fontSize: '.78rem', fontWeight: 600 }}>{r.state}</span> : v(null)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {r.warranty_end
                            ? <span title={WARRANTY_META[r.warranty_status]?.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'monospace', fontSize: '.8rem', fontWeight: 600, color: WARRANTY_META[r.warranty_status]?.color || C.slate }}>
                                {r.warranty_status === 'expiree' ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}
                                {r.warranty_end}
                              </span>
                            : r.warranty_status === 'illimitee'
                              ? <span style={{ fontSize: '.78rem', color: '#1d4ed8', fontWeight: 600 }}>∞ Illimitée</span>
                              : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {r.age_years != null
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.slate }}>
                                {r.age_source === 'use_date'
                                  ? <span title="Calculé depuis la date de mise en service"><CalendarCheck2 size={13} color={C.green} /></span>
                                  : r.age_source === 'buy_date'
                                  ? <span title="Calculé depuis la date d'achat (mise en service inconnue)"><CalendarDays size={13} color={C.amber} /></span>
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
      </div>

      {/* ─── MODAL DÉTAIL ─── */}
      {detail && (
        <DetailModal detail={detail} token={token} onClose={() => setDetail(null)} />
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 1s linear infinite}`}</style>
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

const WarrantyBadge: React.FC<{ status: WarrantyStatus; end?: string | null }> = ({ status, end }) => {
  const m = WARRANTY_META[status] || WARRANTY_META.inconnue;
  return (
    <span title={end ? `Fin : ${end}` : undefined}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: m.bg, color: m.color, padding: '2px 8px', borderRadius: 6, fontSize: '.74rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {status === 'expiree' ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}{m.label}
    </span>
  );
};

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
  buy_date: "Date d'achat", use_date: 'Date de mise en service', warranty_end: 'Fin de garantie',
  warranty_duration: 'Durée de garantie (mois)', supplier: 'Fournisseur', value: 'Valeur',
  order_number: 'N° de commande', immo_number: "N° d'immobilisation", age_years: 'Âge (ans)',
  date_creation: 'Date de création', date_mod: 'Dernière modification',
};

const DetailModal: React.FC<{ detail: any; token: string | null; onClose: () => void }> = ({ detail, token, onClose }) => {
  const [showAll, setShowAll] = useState(false);
  const s = detail.summary || {};
  const docUrl = (id: number) => `/api/parc/file/document/${id}?token=${token || ''}`;
  const groups = [
    { title: 'Affectation', fields: ['user', 'user_email', 'user_ad_name', 'user_service', 'group', 'user_tech', 'group_tech', 'contact', 'contact_email', 'contact_ad_name', 'contact_service', 'contact_num'] },
    { title: 'Localisation', fields: ['location', 'entity'] },
    { title: 'Identification', fields: ['serial', 'otherserial', 'manufacturer', 'model', 'type', 'state', 'network', 'uuid', 'os', 'os_version', 'autoupdate'] },
    { title: 'Achat & garantie', fields: ['buy_date', 'use_date', 'warranty_end', 'warranty_duration', 'supplier', 'value', 'order_number', 'immo_number', 'age_years'] },
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
              {s.warranty_status && s.warranty_status !== 'inconnue' && <WarrantyBadge status={s.warranty_status} end={s.warranty_end} />}
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
                          <div style={{ fontSize: '.9rem', color: C.text, fontWeight: 600 }}>
                            {f.endsWith('_email')
                              ? <a href={`mailto:${s[f]}`} style={{ color: C.blue }}>{String(s[f])}</a>
                              : fmt(f, s[f])}
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
