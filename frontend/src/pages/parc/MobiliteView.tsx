// ─── Parc Mobilité : téléphones & tablettes ───────────────────────────────────
// Vue dédiée à la mobilité, branchée dans la page « Parc équipements » (onglet
// « Téléphones et tablettes »). Modèle « historique par device » : la liste montre
// le DERNIER état de chaque appareil ; le compteur d'actions ouvre l'historique.
import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts';
import {
  Smartphone, Tablet, Search, X, RefreshCw, History, Boxes, Activity,
  ShieldCheck, Signal, Tag, AlertTriangle, CheckCircle2, ArrowDownLeft,
  PackagePlus, UserCheck, Package,
} from 'lucide-react';
import { EntryModal, AttributeModal, ReturnModal, StockTab } from './MobiliteActions';
import { mobiliteApi, type MobStore, type SerialItem } from './mobiliteApi';

const C = { blue: '#2563eb', slate: '#64748b', green: '#059669', amber: '#d97706', red: '#dc2626', purple: '#7c3aed', cyan: '#0891b2', bg: '#f1f5f9', card: '#fff', border: '#e2e8f0', text: '#0f172a' };
const COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#65a30d', '#0ea5e9', '#9333ea'];

// Couleur par catégorie d'action (dernier état + graphes).
const ACTION_COLOR: Record<string, string> = {
  'Dotation': '#2563eb', 'Mise à disposition': '#0891b2', 'Prêt': '#7c3aed',
  'Retour': '#d97706', 'Vol': '#dc2626', 'Cession': '#64748b', 'Remplacement': '#db2777',
  'Indéterminé': '#94a3b8',
};
const FAMILLE_META: Record<string, { label: string; icon: any; color: string }> = {
  telephone: { label: 'Téléphone', icon: Smartphone, color: '#2563eb' },
  tablette: { label: 'Tablette', icon: Tablet, color: '#7c3aed' },
  sim: { label: 'Carte SIM', icon: Signal, color: '#0891b2' },
  autre: { label: 'Autre', icon: Boxes, color: '#94a3b8' },
};

interface Device {
  device_key: string; imei: string | null; serial: string | null; etiquetage: string | null;
  type_appareil: string | null; famille: string; modele: string | null; numero_ligne: string | null;
  carte_sim: string | null; forfait: string | null; mdm: string | null; ligne_active: string | null;
  last_action: string | null; last_action_norm: string | null; last_statut: string | null;
  last_date: string | null; last_direction: string | null; last_service: string | null;
  last_agent: string | null; dernier_util: string | null; observations: string | null;
  events_count: number; retours_count: number; first_date: string | null; is_actif: boolean;
}
interface Kpis {
  total: number; actifs: number; inactifs: number; telephones: number; tablettes: number; sims: number;
  avec_sim: number; avec_mdm: number; avec_ligne: number; total_retours: number; totalEvents: number;
  parFamille: { key: string; count: number }[]; parDerniereAction: { key: string; count: number }[];
  parStatut: { key: string; count: number }[]; parDirection: { key: string; count: number }[];
  parForfait: { key: string; count: number }[]; actionsParType: { key: string; count: number }[];
  timeline: { mois: string; total: number; dotation: number; mise: number; pret: number; retour: number; vol: number }[];
  topModeles: { key: string; count: number }[];
}
interface FacetVal { value: string; label: string; count: number }

const fmtDate = (s: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
};

export default function MobiliteView({ token }: { token: string }) {
  const api = axios.create({ baseURL: '/api/mobilite', headers: { Authorization: `Bearer ${token}` } });

  const [view, setView] = useState<'dashboard' | 'list' | 'stock'>('dashboard');
  // Cycle de vie (stock / attribution / retour) via le module /stocks
  const [store, setStore] = useState<MobStore | null>(null);
  const [modal, setModal] = useState<null | 'entry' | 'attribute' | 'return'>(null);
  const [preset, setPreset] = useState<SerialItem | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const canOperate = !!store && (store.my_role === 'operator' || store.my_role === 'manager');
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loadingKpi, setLoadingKpi] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [filters, setFilters] = useState<{ familles: FacetVal[]; actions: FacetVal[]; directions: FacetVal[]; statuts: FacetVal[]; forfaits: FacetVal[] }>({ familles: [], actions: [], directions: [], statuts: [], forfaits: [] });

  // Filtres
  const [q, setQ] = useState('');
  const [fFamille, setFFamille] = useState('');
  const [fAction, setFAction] = useState('');
  const [fDirection, setFDirection] = useState('');
  const [fStatut, setFStatut] = useState('');
  const [fForfait, setFForfait] = useState('');
  const [fSim, setFSim] = useState('');
  const [fMdm, setFMdm] = useState('');
  const [fActif, setFActif] = useState('');
  const [sortCol, setSortCol] = useState('last_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [start, setStart] = useState(0);
  const LIMIT = 50;

  // Historique (modal)
  const [hist, setHist] = useState<{ device: Device | null; events: any[]; loading: boolean } | null>(null);

  const loadKpis = useCallback(async () => {
    setLoadingKpi(true);
    try { const r = await api.get('/kpis'); setKpis(r.data); } catch { /* noop */ } finally { setLoadingKpi(false); }
  }, [token]);

  const loadFilters = useCallback(async () => {
    try { const r = await api.get('/filters'); setFilters(r.data); } catch { /* noop */ }
  }, [token]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await api.get('/devices', { params: { q, famille: fFamille, action: fAction, direction: fDirection, statut: fStatut, forfait: fForfait, sim: fSim, mdm: fMdm, actif: fActif, sort: sortCol, dir: sortDir, start, limit: LIMIT } });
      setDevices(r.data.items); setTotal(r.data.total);
    } catch { /* noop */ } finally { setLoadingList(false); }
  }, [q, fFamille, fAction, fDirection, fStatut, fForfait, fSim, fMdm, fActif, sortCol, sortDir, start, token]);

  useEffect(() => { loadKpis(); loadFilters(); mobiliteApi.getStore(token).then(setStore).catch(() => setStore(null)); }, [loadKpis, loadFilters, token]);
  useEffect(() => { if (view === 'list') loadList(); /* eslint-disable-next-line */ }, [view, fFamille, fAction, fDirection, fStatut, fForfait, fSim, fMdm, fActif, sortCol, sortDir, start]);

  // Après une action (entrée/attribution/retour) : rafraîchit KPIs, liste, stock.
  const afterAction = () => { setModal(null); setPreset(null); loadKpis(); if (view === 'list') loadList(); setReloadKey(k => k + 1); };

  const openHistory = async (d: Device) => {
    setHist({ device: d, events: [], loading: true });
    try {
      const r = await api.get(`/devices/${encodeURIComponent(d.device_key)}/events`);
      setHist({ device: r.data.device || d, events: r.data.events, loading: false });
    } catch { setHist({ device: d, events: [], loading: false }); }
  };

  const sort = (col: string) => {
    if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
    setStart(0);
  };

  const resetFilters = () => { setQ(''); setFFamille(''); setFAction(''); setFDirection(''); setFStatut(''); setFForfait(''); setFSim(''); setFMdm(''); setFActif(''); setStart(0); };

  const actBtn = (color: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: 'none', background: color, color: '#fff', fontWeight: 700, fontSize: '.86rem', cursor: 'pointer' });

  // ── Petits composants UI ────────────────────────────────────────────────────
  const Card = ({ icon: I, label, value, color, sub, onClick }: any) => (
    <div onClick={onClick} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color }}>
        <I size={18} /><span style={{ fontSize: '.74rem', fontWeight: 700, color: C.slate, textTransform: 'uppercase', letterSpacing: .3 }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.7rem', fontWeight: 900, color: C.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '.74rem', color: C.slate }}>{sub}</div>}
    </div>
  );
  const Panel = ({ title, icon: I, children }: any) => (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontWeight: 800, color: C.text, fontSize: '.95rem' }}>
        {I && <I size={17} color={C.blue} />}{title}
      </div>
      {children}
    </div>
  );
  const ActionBadge = ({ action, statut }: { action: string | null; statut?: string | null }) => {
    const col = ACTION_COLOR[action || ''] || C.slate;
    return (
      <span title={statut || ''} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, background: `${col}18`, color: col, fontWeight: 700, fontSize: '.76rem', whiteSpace: 'nowrap' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: col }} />{action || '—'}
      </span>
    );
  };
  const selStyle: React.CSSProperties = { padding: '8px 11px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: '.85rem', background: '#fff', color: C.text };
  const Th = ({ children, col }: { children: React.ReactNode; col?: string }) => (
    <th onClick={col ? () => sort(col) : undefined} style={{ textAlign: 'left', padding: '10px 12px', fontSize: '.74rem', fontWeight: 800, color: C.slate, textTransform: 'uppercase', letterSpacing: .3, cursor: col ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none' }}>
      {children}{col && sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div>
      {/* Sous-onglets + actions cycle de vie */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        {([['dashboard', 'Tableau de bord', Activity], ['list', 'Appareils', Smartphone], ['stock', 'Stock', Package]] as const).map(([k, l, I]) => (
          <button key={k} onClick={() => setView(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: `1px solid ${view === k ? C.blue : C.border}`, background: view === k ? C.blue : C.card, color: view === k ? '#fff' : C.slate, fontWeight: 700, fontSize: '.86rem', cursor: 'pointer' }}>
            <I size={15} /> {l}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {canOperate && <>
            <button onClick={() => setModal('entry')} style={actBtn('#0891b2')}><PackagePlus size={15} /> Entrer en stock</button>
            <button onClick={() => { setPreset(null); setModal('attribute'); }} style={actBtn('#2563eb')}><UserCheck size={15} /> Attribuer</button>
            <button onClick={() => { setPreset(null); setModal('return'); }} style={actBtn('#d97706')}><ArrowDownLeft size={15} /> Retour</button>
          </>}
          <button onClick={() => { loadKpis(); if (view === 'list') loadList(); setReloadKey(k => k + 1); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.slate, fontWeight: 700, fontSize: '.86rem', cursor: 'pointer' }}>
            <RefreshCw size={15} className={loadingKpi || loadingList ? 'spin' : ''} /> Actualiser
          </button>
        </div>
      </div>

      {/* ─── STOCK (appareils non attribués) ─── */}
      {view === 'stock' && (
        <StockTab token={token} canOperate={canOperate} reloadKey={reloadKey}
          onAttribute={(s) => { setPreset(s); setModal('attribute'); }} />
      )}

      {/* ─── Modales cycle de vie ─── */}
      {modal === 'entry' && <EntryModal token={token} onClose={() => setModal(null)} onDone={afterAction} />}
      {modal === 'attribute' && <AttributeModal token={token} preset={preset} onClose={() => { setModal(null); setPreset(null); }} onDone={afterAction} />}
      {modal === 'return' && <ReturnModal token={token} preset={preset} onClose={() => { setModal(null); setPreset(null); }} onDone={afterAction} />}

      {/* ─── TABLEAU DE BORD ─── */}
      {view === 'dashboard' && kpis && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 14, marginBottom: 18 }}>
            <Card icon={Boxes} label="Appareils" value={kpis.total} color={C.blue} sub={`${kpis.totalEvents} actions au total`} />
            <Card icon={Smartphone} label="Téléphones" value={kpis.telephones} color="#2563eb" onClick={() => { setFFamille('telephone'); setView('list'); }} />
            <Card icon={Tablet} label="Tablettes" value={kpis.tablettes} color="#7c3aed" onClick={() => { setFFamille('tablette'); setView('list'); }} />
            <Card icon={CheckCircle2} label="En service" value={kpis.actifs} color={C.green} sub={`${Math.round(kpis.actifs / (kpis.total || 1) * 100)}% du parc`} onClick={() => { setFActif('1'); setView('list'); }} />
            <Card icon={ArrowDownLeft} label="Retournés / sortis" value={kpis.inactifs} color={C.amber} sub={`${kpis.total_retours} retours cumulés`} onClick={() => { setFActif('0'); setView('list'); }} />
            <Card icon={Signal} label="Avec ligne / SIM" value={kpis.avec_sim} color={C.cyan} sub={`${kpis.avec_ligne} n° de ligne`} />
            <Card icon={ShieldCheck} label="Sous MDM" value={kpis.avec_mdm} color="#059669" sub={`${Math.round(kpis.avec_mdm / (kpis.total || 1) * 100)}% supervisés`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <Panel title="Répartition par famille" icon={Boxes}>
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie data={kpis.parFamille.map(d => ({ name: FAMILLE_META[d.key]?.label || d.key, value: d.count }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={(e: any) => `${e.name} (${e.value})`}>
                    {kpis.parFamille.map((d, i) => <Cell key={i} fill={FAMILLE_META[d.key]?.color || COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="Dernier état des appareils" icon={Activity}>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={kpis.parDerniereAction.map(d => ({ name: d.key, value: d.count }))} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {kpis.parDerniereAction.map((d, i) => <Cell key={i} fill={ACTION_COLOR[d.key] || COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <div style={{ marginBottom: 16 }}>
            <Panel title="Cadence mensuelle des actions" icon={Activity}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={kpis.timeline}>
                  <defs>
                    {[['dotation', '#2563eb'], ['mise', '#0891b2'], ['pret', '#7c3aed'], ['retour', '#d97706'], ['vol', '#dc2626']].map(([k, c]) => (
                      <linearGradient key={k} id={`g_${k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity={.7} /><stop offset="100%" stopColor={c} stopOpacity={.05} /></linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="dotation" name="Dotation" stackId="1" stroke="#2563eb" fill="url(#g_dotation)" />
                  <Area type="monotone" dataKey="mise" name="Mise à dispo." stackId="1" stroke="#0891b2" fill="url(#g_mise)" />
                  <Area type="monotone" dataKey="pret" name="Prêt" stackId="1" stroke="#7c3aed" fill="url(#g_pret)" />
                  <Area type="monotone" dataKey="retour" name="Retour" stackId="1" stroke="#d97706" fill="url(#g_retour)" />
                  <Area type="monotone" dataKey="vol" name="Vol" stackId="1" stroke="#dc2626" fill="url(#g_vol)" />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <Panel title="Top 15 directions" icon={Tag}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={kpis.parDirection.map(d => ({ name: d.key, value: d.count }))} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill={C.blue} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="Top 10 modèles" icon={Smartphone}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={kpis.topModeles.map(d => ({ name: d.key, value: d.count }))} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill={C.purple} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>
        </>
      )}
      {view === 'dashboard' && !kpis && loadingKpi && <div style={{ padding: 40, textAlign: 'center', color: C.slate }}><RefreshCw className="spin" /> Chargement…</div>}

      {/* ─── LISTE DES APPAREILS ─── */}
      {view === 'list' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px' }}>
              <Search size={16} style={{ position: 'absolute', left: 11, top: 11, color: C.slate }} />
              <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setStart(0); loadList(); } }}
                placeholder="Modèle, IMEI, série, n° de ligne, agent, direction…"
                style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: '.9rem', boxSizing: 'border-box' }} />
            </div>
            <select value={fFamille} onChange={e => { setFFamille(e.target.value); setStart(0); }} style={selStyle}>
              <option value="">Toutes familles</option>
              {filters.familles.map(f => <option key={f.value} value={f.value}>{FAMILLE_META[f.value]?.label || f.value} ({f.count})</option>)}
            </select>
            <select value={fAction} onChange={e => { setFAction(e.target.value); setStart(0); }} style={selStyle}>
              <option value="">Tout dernier état</option>
              {filters.actions.map(f => <option key={f.value} value={f.value}>{f.label} ({f.count})</option>)}
            </select>
            <select value={fDirection} onChange={e => { setFDirection(e.target.value); setStart(0); }} style={selStyle}>
              <option value="">Toutes directions</option>
              {filters.directions.map(f => <option key={f.value} value={f.value}>{f.label} ({f.count})</option>)}
            </select>
            <select value={fStatut} onChange={e => { setFStatut(e.target.value); setStart(0); }} style={selStyle}>
              <option value="">Tous statuts</option>
              {filters.statuts.map(f => <option key={f.value} value={f.value}>{f.label} ({f.count})</option>)}
            </select>
            <select value={fForfait} onChange={e => { setFForfait(e.target.value); setStart(0); }} style={selStyle}>
              <option value="">Tous forfaits</option>
              {filters.forfaits.map(f => <option key={f.value} value={f.value}>{f.label} ({f.count})</option>)}
            </select>
            <select value={fSim} onChange={e => { setFSim(e.target.value); setStart(0); }} style={selStyle}>
              <option value="">SIM : toutes</option><option value="oui">Avec SIM</option><option value="non">Sans SIM</option>
            </select>
            <select value={fMdm} onChange={e => { setFMdm(e.target.value); setStart(0); }} style={selStyle}>
              <option value="">MDM : tous</option><option value="oui">Sous MDM</option><option value="non">Hors MDM</option>
            </select>
            <select value={fActif} onChange={e => { setFActif(e.target.value); setStart(0); }} style={selStyle}>
              <option value="">État : tous</option><option value="1">En service</option><option value="0">Sorti / retourné</option>
            </select>
            <button onClick={resetFilters} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', color: C.slate, fontWeight: 700, fontSize: '.84rem', cursor: 'pointer' }}><X size={14} /> Réinitialiser</button>
          </div>

          <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: '.82rem', color: C.slate, display: 'flex', justifyContent: 'space-between' }}>
              <span><b style={{ color: C.text }}>{total}</b> appareil(s)</span>
              {loadingList && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><RefreshCw size={13} className="spin" /> chargement…</span>}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    <Th col="famille">Type</Th>
                    <Th col="modele">Modèle</Th>
                    <Th col="imei">IMEI / Série</Th>
                    <Th col="numero_ligne">N° ligne</Th>
                    <Th>SIM / MDM</Th>
                    <Th col="last_direction">Direction</Th>
                    <Th col="last_agent">Agent</Th>
                    <Th col="last_action">Dernier état</Th>
                    <Th col="last_date">Date</Th>
                    <Th col="events_count">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map(d => {
                    const FM = FAMILLE_META[d.famille] || FAMILLE_META.autre;
                    const FI = FM.icon;
                    return (
                      <tr key={d.device_key} style={{ borderTop: `1px solid ${C.border}`, opacity: d.is_actif ? 1 : .62 }}>
                        <td style={{ padding: '9px 12px' }}>
                          <span title={d.type_appareil || FM.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: FM.color, fontWeight: 600 }}>
                            <FI size={16} /> {FM.label}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: C.text }}>{d.modele || '—'}</td>
                        <td style={{ padding: '9px 12px', color: C.slate, fontSize: '.78rem', fontFamily: 'monospace' }}>{d.imei || d.serial || d.etiquetage || '—'}</td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{d.numero_ligne || '—'}</td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                          {(d.carte_sim || '').toLowerCase() === 'oui' && <span style={{ marginRight: 6, color: C.cyan }} title="Carte SIM"><Signal size={14} /></span>}
                          {(d.mdm || '').toLowerCase() === 'oui' && <span style={{ color: C.green }} title="Sous MDM"><ShieldCheck size={14} /></span>}
                          {(d.carte_sim || '').toLowerCase() !== 'oui' && (d.mdm || '').toLowerCase() !== 'oui' && '—'}
                        </td>
                        <td style={{ padding: '9px 12px', fontSize: '.8rem' }}>{d.last_direction || '—'}</td>
                        <td style={{ padding: '9px 12px', fontSize: '.8rem' }}>{d.last_agent || d.dernier_util || '—'}</td>
                        <td style={{ padding: '9px 12px' }}><ActionBadge action={d.last_action_norm} statut={d.last_statut} /></td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: C.slate }}>{fmtDate(d.last_date)}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <button onClick={() => openHistory(d)} title="Voir l'historique des actions"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, border: `1px solid ${d.events_count > 1 ? C.blue : C.border}`, background: d.events_count > 1 ? '#eff6ff' : '#fff', color: d.events_count > 1 ? C.blue : C.slate, fontWeight: 800, fontSize: '.8rem', cursor: 'pointer' }}>
                            <History size={13} /> {d.events_count}
                            {d.retours_count > 0 && <span title={`${d.retours_count} retour(s)`} style={{ color: C.amber }}>↩{d.retours_count}</span>}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!loadingList && devices.length === 0 && (
                    <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: C.slate }}>Aucun appareil ne correspond aux filtres.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {total > LIMIT && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, padding: '12px 16px', borderTop: `1px solid ${C.border}` }}>
                <button disabled={start === 0} onClick={() => setStart(Math.max(0, start - LIMIT))} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', cursor: start === 0 ? 'default' : 'pointer', opacity: start === 0 ? .4 : 1 }}>← Précédent</button>
                <span style={{ fontSize: '.82rem', color: C.slate }}>{start + 1}–{Math.min(start + LIMIT, total)} / {total}</span>
                <button disabled={start + LIMIT >= total} onClick={() => setStart(start + LIMIT)} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', cursor: start + LIMIT >= total ? 'default' : 'pointer', opacity: start + LIMIT >= total ? .4 : 1 }}>Suivant →</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── MODAL HISTORIQUE ─── */}
      {hist && (
        <div onClick={() => setHist(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(720px, 96vw)', maxHeight: '88vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.05rem', color: C.text }}>{hist.device?.modele || 'Appareil'} — historique</div>
                <div style={{ fontSize: '.78rem', color: C.slate, fontFamily: 'monospace' }}>{hist.device?.imei || hist.device?.serial || hist.device?.device_key}</div>
              </div>
              <button onClick={() => setHist(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate }}><X size={20} /></button>
            </div>
            <div style={{ padding: 20 }}>
              {hist.loading && <div style={{ textAlign: 'center', color: C.slate, padding: 30 }}><RefreshCw className="spin" /> Chargement…</div>}
              {!hist.loading && hist.events.length > 0 && (
                <div style={{ position: 'relative', paddingLeft: 22 }}>
                  <div style={{ position: 'absolute', left: 6, top: 6, bottom: 6, width: 2, background: C.border }} />
                  {hist.events.map((e: any, i: number) => {
                    const col = ACTION_COLOR[e.action_norm] || C.slate;
                    return (
                      <div key={i} style={{ position: 'relative', marginBottom: 16 }}>
                        <span style={{ position: 'absolute', left: -22, top: 3, width: 12, height: 12, borderRadius: '50%', background: col, border: '2px solid #fff', boxShadow: `0 0 0 2px ${col}` }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <ActionBadge action={e.action_norm} statut={e.statut} />
                          <span style={{ fontSize: '.82rem', color: C.text, fontWeight: 700 }}>{fmtDate(e.date_event)}</span>
                          {e.statut && <span style={{ fontSize: '.74rem', color: C.slate }}>· {e.statut}</span>}
                        </div>
                        <div style={{ fontSize: '.82rem', color: C.slate, marginTop: 4, lineHeight: 1.5 }}>
                          {e.agent && <span><b>{e.agent}</b></span>}
                          {e.direction && <span> · {e.direction}</span>}
                          {e.service && <span> / {e.service}</span>}
                          {e.numero_ligne && <span> · ☎ {e.numero_ligne}</span>}
                          {e.forfait && <span> · {e.forfait}</span>}
                          {e.observations && <div style={{ marginTop: 3, color: C.amber, display: 'flex', alignItems: 'center', gap: 5 }}><AlertTriangle size={13} /> {e.observations}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!hist.loading && hist.events.length === 0 && <div style={{ textAlign: 'center', color: C.slate, padding: 30 }}>Aucun événement.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
