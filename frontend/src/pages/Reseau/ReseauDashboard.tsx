import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Header from '../../components/Header';
import {
  Network, Map as MapIcon, Share2, Plus, Trash2,
  Cpu, GitBranch, Tag, Cable, BarChart2, Wifi, Shield, Server, Router,
} from 'lucide-react';
import NetworkMap from './NetworkMap';
import type { MoveResult } from './NetworkMap';
import NetworkTopology from './NetworkTopology';
import { linkStyle } from './utils';
import type {
  NetworkLink, NetworkAccess, Duct, SiteRef, LinkType, Operator,
  IrfStack, Equipement, Vlan, LiaisonFO, ReseauStats,
} from './types';

const LINK_TYPES: LinkType[] = ['FIBRE', 'WAN', 'OPERATEUR', 'LASER'];
const OPERATORS:  Operator[]  = ['LINKT', 'MOJI', 'RED', 'OTHER', 'SFR'];

const emptyForm = {
  site_a: '', site_b: '', type: 'FIBRE' as LinkType, operator: '' as '' | Operator,
  capacity: '', carries_data: true, carries_voice: false, is_loop: false, is_redundant: false,
};

type Tab = 'carte' | 'irf' | 'equipements' | 'vlans' | 'liaisons-fo' | 'stats';

export default function ReseauDashboard() {
  const token = localStorage.getItem('token');
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  // ── Données existantes ──────────────────────────────────────────
  const [sitesArr, setSitesArr] = useState<SiteRef[]>([]);
  const [links, setLinks]       = useState<NetworkLink[]>([]);
  const [access, setAccess]     = useState<NetworkAccess[]>([]);
  const [ducts, setDucts]       = useState<Duct[]>([]);
  // ── Nouvelles données DIP ───────────────────────────────────────
  const [irfStacks, setIrfStacks]   = useState<IrfStack[]>([]);
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [vlans, setVlans]           = useState<Vlan[]>([]);
  const [liaisonsFO, setLiaisonsFO] = useState<LiaisonFO[]>([]);
  const [stats, setStats]           = useState<ReseauStats | null>(null);

  const [tab, setTab]     = useState<Tab>('carte');
  const [view, setView]   = useState<'map' | 'topology'>('map');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  // ── Filtres carte ───────────────────────────────────────────────
  const [fType, setFType]         = useState<'' | LinkType>('');
  const [fOperator, setFOperator] = useState<'' | Operator>('');
  const [fLoop, setFLoop]         = useState(false);
  const [fRedundant, setFRedundant] = useState(false);
  const [layers, setLayers]       = useState({ fibre: true, wan: true, operator: true, ducts: true, sites: true });

  // ── Création lien ───────────────────────────────────────────────
  const [form, setForm]           = useState({ ...emptyForm });
  const [drawMode, setDrawMode]   = useState(false);
  const [drawnPoints, setDrawnPoints] = useState<[number, number][]>([]);
  const [saving, setSaving]       = useState(false);

  // ── Filtres équipements ─────────────────────────────────────────
  const [fEquipBoucle, setFEquipBoucle] = useState('');
  const [fEquipSearch, setFEquipSearch] = useState('');

  // ── Filtres VLANs ───────────────────────────────────────────────
  const [fVlanSearch, setFVlanSearch] = useState('');
  const [fVlanUsage, setFVlanUsage]   = useState('');

  const sites = useMemo(() => {
    const m = new Map<string, SiteRef>();
    sitesArr.forEach(s => m.set(s.site_code, s));
    return m;
  }, [sitesArr]);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, l, a, d, irf, eq, vl, fo, st] = await Promise.all([
        axios.get('/api/network/sites',         { headers }),
        axios.get('/api/network/links',         { headers }),
        axios.get('/api/network/access',        { headers }),
        axios.get('/api/network/ducts',         { headers }),
        axios.get('/api/network/irf-stacks',    { headers }),
        axios.get('/api/network/equipements',   { headers }),
        axios.get('/api/network/vlans',         { headers }),
        axios.get('/api/network/liaisons-fo',   { headers }),
        axios.get('/api/network/stats',         { headers }),
      ]);
      setSitesArr(s.data    || []);
      setLinks(l.data       || []);
      setAccess(a.data      || []);
      setDucts(d.data       || []);
      setIrfStacks(irf.data || []);
      setEquipements(eq.data || []);
      setVlans(vl.data      || []);
      setLiaisonsFO(fo.data || []);
      setStats(st.data);
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.message;
      setError(msg || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line

  useEffect(() => {
    if (!drawMode) return;
    const a = sites.get(form.site_a);
    setDrawnPoints(a && a.lat != null && a.lng != null ? [[a.lat, a.lng]] : []);
  }, [form.site_a, drawMode, sites]);

  const filteredLinks = useMemo(() => links.filter(l =>
    (!fType || l.type === fType) &&
    (!fOperator || l.operator === fOperator) &&
    (!fLoop || l.is_loop) &&
    (!fRedundant || l.is_redundant)
  ), [links, fType, fOperator, fLoop, fRedundant]);

  function onMapClick(lat: number, lng: number) {
    if (drawMode) setDrawnPoints(prev => [...prev, [lat, lng]]);
  }

  async function createLink(e: React.FormEvent) {
    e.preventDefault();
    if (!form.site_a || !form.site_b) { alert('Sélectionnez les deux sites.'); return; }
    if (form.site_a === form.site_b) { alert('Les deux sites doivent être différents.'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        site_a: form.site_a, site_b: form.site_b, type: form.type,
        operator: form.operator || null, capacity: form.capacity || null,
        carries_data: form.carries_data, carries_voice: form.carries_voice,
        is_loop: form.is_loop, is_redundant: form.is_redundant,
      };
      if (drawMode && drawnPoints.length >= 2) {
        payload.geometry = { type: 'LineString', coordinates: drawnPoints.map(([la, ln]) => [ln, la]) };
      }
      const res = await axios.post('/api/network/links', payload, { headers });
      setLinks(prev => [...prev, res.data]);
      setForm({ ...emptyForm }); setDrawMode(false); setDrawnPoints([]);
    } catch (e: unknown) {
      alert((e as any)?.response?.data?.message || 'Erreur lors de la création du lien');
    } finally { setSaving(false); }
  }

  async function deleteLink(id: string) {
    if (!confirm('Supprimer ce lien ?')) return;
    try {
      await axios.delete(`/api/network/links/${id}`, { headers });
      setLinks(prev => prev.filter(l => l.id !== id));
    } catch { alert('Erreur lors de la suppression'); }
  }

  // ── Données filtrées ────────────────────────────────────────────
  const filteredEquipements = useMemo(() => equipements.filter(e => {
    const matchBoucle = !fEquipBoucle || e.boucle === fEquipBoucle;
    const q = fEquipSearch.toLowerCase();
    const matchSearch = !q || e.nom.toLowerCase().includes(q) ||
      (e.ip_management || '').includes(q) || (e.site_nom || '').toLowerCase().includes(q) ||
      (e.modele || '').toLowerCase().includes(q);
    return matchBoucle && matchSearch;
  }), [equipements, fEquipBoucle, fEquipSearch]);

  const filteredVlans = useMemo(() => vlans.filter(v => {
    const q = fVlanSearch.toLowerCase();
    const matchUsage = !fVlanUsage || v.usage === fVlanUsage;
    const matchSearch = !q || v.nom.toLowerCase().includes(q) ||
      (v.description || '').toLowerCase().includes(q) || String(v.vlan_id).includes(q) ||
      (v.adresse_ip || '').includes(q);
    return matchUsage && matchSearch;
  }), [vlans, fVlanSearch, fVlanUsage]);

  const vlanUsages = useMemo(() => [...new Set(vlans.map(v => v.usage).filter(Boolean))], [vlans]);
  const boucles = ['COEUR', 'NORD', 'SUD', 'PRA'];

  // ── Couleurs et icônes ──────────────────────────────────────────
  const BOUCLE_COLOR: Record<string, string> = {
    COEUR: '#0f172a', NORD: '#2563eb', SUD: '#16a34a', PRA: '#7c3aed',
  };
  const EQUIP_ICON = (type: string) => {
    if (type === 'FIREWALL') return <Shield size={14} color="#ef4444" />;
    if (type === 'ROUTEUR')  return <Router size={14} color="#f59e0b" />;
    if (type === 'SWITCH_L3') return <Cpu size={14} color="#8b5cf6" />;
    return <Server size={14} color="#64748b" />;
  };
  const VLAN_USAGE_COLOR: Record<string, string> = {
    UTILISATEURS: '#3b82f6', INFRASTRUCTURE: '#8b5cf6', SECURITE: '#ef4444',
    INTERNET: '#f59e0b', ECOLES: '#22c55e', VOIP: '#06b6d4',
  };
  const STATUT_COLOR = (s: string) => s === 'PROD' ? '#22c55e' : s === 'BACKUP' ? '#f59e0b' : '#ef4444';

  if (loading) return (
    <>
      <Header />
      <div style={{ display: 'flex', height: 'calc(100vh - 80px)', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 15 }}>
        Chargement de l'infrastructure réseau…
      </div>
    </>
  );

  return (
    <>
      <Header />
      <div style={{ padding: '16px 24px', fontFamily: 'Arial, sans-serif' }}>
        {/* ── En-tête ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Network size={26} color="#2563eb" />
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Réseau Ville d'Ivry</h1>
              <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Infrastructure réseau — données DIP 2021 · Cœur HP5940 · Boucles IRF HP5500HI</p>
            </div>
          </div>
          {stats && (
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                ['Liens FO', stats.liens_fo, '#2563eb'],
                ['Équipements', stats.equipements, '#8b5cf6'],
                ['VLANs', stats.vlans_actifs, '#16a34a'],
              ].map(([lbl, val, color]) => (
                <div key={lbl as string} style={{ textAlign: 'center', padding: '8px 14px', background: 'white', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: color as string }}>{val}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{lbl}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <div style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>{error}</div>}

        {/* ── Onglets ── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #f1f5f9', paddingBottom: 2 }}>
          {([
            ['carte',      <><MapIcon size={14} /> Carte & Topologie</>,    'carte'],
            ['irf',        <><GitBranch size={14} /> IRF Stacks</>,          'irf'],
            ['equipements',<><Cpu size={14} /> Équipements</>,               'equipements'],
            ['vlans',      <><Tag size={14} /> VLANs</>,                     'vlans'],
            ['liaisons-fo',<><Cable size={14} /> Liaisons FO</>,             'liaisons-fo'],
            ['stats',      <><BarChart2 size={14} /> Stats</>,               'stats'],
          ] as [Tab, React.ReactNode, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              border: 'none', borderBottom: tab === id ? '2px solid #2563eb' : '2px solid transparent',
              background: 'transparent', color: tab === id ? '#2563eb' : '#64748b',
              fontWeight: tab === id ? 700 : 500, fontSize: 13, cursor: 'pointer', marginBottom: -2,
            }}>{label}</button>
          ))}
        </div>

        {/* ══════════════════ TAB CARTE ══════════════════ */}
        {tab === 'carte' && (
          <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, height: 'calc(100vh - 250px)' }}>
            {/* panneau gauche */}
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <form onSubmit={createLink} style={card}>
                <h3 style={cardTitle}><Plus size={16} /> Créer un lien</h3>
                <label style={lbl}>Site A</label>
                <input list="sites-dl" style={inp} value={form.site_a} onChange={e => setForm({ ...form, site_a: e.target.value.trim().toUpperCase() })} placeholder="ex: S001B01" />
                <label style={lbl}>Site B</label>
                <input list="sites-dl" style={inp} value={form.site_b} onChange={e => setForm({ ...form, site_b: e.target.value.trim().toUpperCase() })} placeholder="ex: S007B01" />
                <datalist id="sites-dl">{sitesArr.map(s => <option key={s.site_code} value={s.site_code}>{s.nom}</option>)}</datalist>
                <label style={lbl}>Type</label>
                <select style={inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as LinkType })}>
                  {LINK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {form.type === 'OPERATEUR' && (
                  <><label style={lbl}>Opérateur</label>
                  <select style={inp} value={form.operator} onChange={e => setForm({ ...form, operator: e.target.value as Operator })}>
                    <option value="">—</option>{OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select></>
                )}
                <label style={lbl}>Capacité</label>
                <input style={inp} value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} placeholder="ex: 10G, 100M" />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '8px 0' }}>
                  {[['carries_data','Data'],['carries_voice','Voix'],['is_loop','Boucle'],['is_redundant','Redondant']].map(([k,l]) => (
                    <label key={k} style={chk}><input type="checkbox" checked={(form as any)[k]} onChange={e => setForm({ ...form, [k]: e.target.checked })} /> {l}</label>
                  ))}
                </div>
                <label style={chk}>
                  <input type="checkbox" checked={drawMode} onChange={e => { setDrawMode(e.target.checked); if (!e.target.checked) setDrawnPoints([]); }} />
                  Tracé manuel {drawMode && <span style={{ color: '#0ea5e9' }}>({drawnPoints.length} pt)</span>}
                </label>
                <button type="submit" disabled={saving} style={{ ...btnPrimary, marginTop: 10 }}>{saving ? '…' : 'Créer le lien'}</button>
              </form>
              <div style={card}>
                <h3 style={cardTitle}>Filtres</h3>
                <label style={lbl}>Type</label>
                <select style={inp} value={fType} onChange={e => setFType(e.target.value as any)}>
                  <option value="">Tous</option>{LINK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <label style={lbl}>Opérateur</label>
                <select style={inp} value={fOperator} onChange={e => setFOperator(e.target.value as any)}>
                  <option value="">Tous</option>{OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
                  <label style={chk}><input type="checkbox" checked={fLoop} onChange={e => setFLoop(e.target.checked)} /> Boucle</label>
                  <label style={chk}><input type="checkbox" checked={fRedundant} onChange={e => setFRedundant(e.target.checked)} /> Redondant</label>
                </div>
              </div>
              <div style={card}>
                <h3 style={cardTitle}>Liens ({filteredLinks.length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {filteredLinks.map(l => {
                    const st = linkStyle(l);
                    return (
                      <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #eef2f7' }}>
                        <span style={{ width: 12, height: 3, borderRadius: 2, background: st.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{l.site_a} → {l.site_b}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>
                            {l.type}{l.operator ? ` · ${l.operator}` : ''}{l.capacity ? ` · ${l.capacity}` : ''}
                            {l.fo_pairs ? ` · ${l.fo_pairs}` : ''}{l.is_loop ? ' · boucle' : ''}
                          </div>
                        </div>
                        <button onClick={() => deleteLink(l.id)} style={iconBtn}><Trash2 size={13} /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {/* panneau carte */}
            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f1f5f9', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setView('map')} style={view === 'map' ? tabActive : tabBtn}><MapIcon size={14} /> Carte</button>
                  <button onClick={() => setView('topology')} style={view === 'topology' ? tabActive : tabBtn}><Share2 size={14} /> Topologie</button>
                </div>
                {view === 'map' && (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
                    {([['fibre','Fibre','#16a34a'],['wan','WAN','#3b82f6'],['operator','Opérateurs','#f97316'],['ducts','Fourreaux','#92400e'],['sites','Sites','#2563eb']] as const).map(([k,lbl,c]) => (
                      <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: '#475569', fontWeight: 600 }}>
                        <input type="checkbox" checked={layers[k]} onChange={e => setLayers({ ...layers, [k]: e.target.checked })} />
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} /> {lbl}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                {view === 'map' ? (
                  <NetworkMap sites={sites} links={links} ducts={ducts} layers={layers} drawMode={drawMode} drawnPoints={drawnPoints} onMapClick={onMapClick} highlightSites={[form.site_a, form.site_b].filter(Boolean)}
                    onSiteMoved={(r: MoveResult) => {
                      setSitesArr(prev => prev.map(s =>
                        s.site_code === r.siteCode
                          ? { ...s, lat: r.lat, lng: r.lng, lat_own: r.lat, lng_own: r.lng, geocoded_manually: true }
                          : s
                      ));
                    }}
                  />
                ) : (
                  <NetworkTopology sites={sites} links={links} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ TAB IRF ══════════════════ */}
        {tab === 'irf' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
              {irfStacks.map(stack => (
                <div key={stack.id} style={{ ...card, borderTop: `4px solid ${BOUCLE_COLOR[stack.nom] || '#64748b'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                        <GitBranch size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {stack.nom}
                      </h3>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>{stack.description}</p>
                    </div>
                    <span style={{ background: stack.actif ? '#dcfce7' : '#fee2e2', color: stack.actif ? '#15803d' : '#dc2626', fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                      {stack.actif ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, fontSize: 12 }}>
                    {stack.ip_management && <div><span style={{ color: '#94a3b8' }}>IP :</span> <strong style={{ fontFamily: 'monospace', color: '#1d4ed8' }}>{stack.ip_management}</strong></div>}
                    {stack.irf_domain && <div><span style={{ color: '#94a3b8' }}>Domaine IRF :</span> <strong>{stack.irf_domain}</strong></div>}
                    {stack.type_equipement && <div><span style={{ color: '#94a3b8' }}>Modèle :</span> {stack.type_equipement}</div>}
                    {stack.firmware && <div><span style={{ color: '#94a3b8' }}>Firmware :</span> <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{stack.firmware}</span></div>}
                    {stack.vlan_management && <div><span style={{ color: '#94a3b8' }}>VLAN mgmt :</span> {stack.vlan_management}</div>}
                  </div>
                  {stack.membres && stack.membres.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>Membres ({stack.membres.length})</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {stack.membres.map(m => (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f8fafc', borderRadius: 8 }}>
                            <span style={{ width: 22, height: 22, borderRadius: '50%', background: BOUCLE_COLOR[m.boucle || ''] || '#e2e8f0', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{m.irf_membre_num}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{m.nom}</div>
                              <div style={{ fontSize: 11, color: '#64748b' }}>{m.site_nom || m.site_code} {m.localisation ? `· ${m.localisation}` : ''}</div>
                            </div>
                            {m.ip_management && <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#3b82f6', background: '#eff6ff', padding: '1px 5px', borderRadius: 4 }}>{m.ip_management}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════ TAB ÉQUIPEMENTS ══════════════════ */}
        {tab === 'equipements' && (
          <div>
            {/* Filtres */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <input style={{ ...inp, width: 280 }} value={fEquipSearch} onChange={e => setFEquipSearch(e.target.value)} placeholder="Rechercher (nom, IP, site, modèle)…" />
              <select style={{ ...inp, width: 160 }} value={fEquipBoucle} onChange={e => setFEquipBoucle(e.target.value)}>
                <option value="">Toutes les boucles</option>
                {boucles.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <div style={{ fontSize: 13, color: '#94a3b8', alignSelf: 'center' }}>{filteredEquipements.length} équipements</div>
            </div>
            {/* Tableau */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['Nom','Site','Boucle','Type','Modèle / Ref','IP Management','IRF','Localisation','Statut'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEquipements.map((e, i) => (
                    <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 ? '#fafbfc' : 'white' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {EQUIP_ICON(e.type)} {e.nom}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#374151' }}><div style={{ fontSize: 11, color: '#94a3b8' }}>{e.site_code}</div>{e.site_nom}</td>
                      <td style={{ padding: '8px 12px' }}>
                        {e.boucle && <span style={{ background: (BOUCLE_COLOR[e.boucle] || '#64748b') + '20', color: BOUCLE_COLOR[e.boucle] || '#64748b', padding: '2px 8px', borderRadius: 10, fontWeight: 600, fontSize: 11 }}>{e.boucle}</span>}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#374151', fontSize: 12 }}>{e.type.replace('_', ' ')}</td>
                      <td style={{ padding: '8px 12px', color: '#64748b', fontSize: 12 }}>{[e.modele, e.reference].filter(Boolean).join(' / ')}</td>
                      <td style={{ padding: '8px 12px' }}>
                        {e.ip_management && <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#1d4ed8', background: '#eff6ff', padding: '2px 6px', borderRadius: 4 }}>{e.ip_management}</span>}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: '#374151' }}>
                        {e.irf_stack_id ? <span>Stack #{e.irf_stack_id} — M{e.irf_membre_num}</span> : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: '#64748b' }}>{e.localisation}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ background: STATUT_COLOR(e.statut) + '20', color: STATUT_COLOR(e.statut), padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{e.statut}</span>
                      </td>
                    </tr>
                  ))}
                  {filteredEquipements.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>Aucun équipement</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════ TAB VLANs ══════════════════ */}
        {tab === 'vlans' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <input style={{ ...inp, width: 280 }} value={fVlanSearch} onChange={e => setFVlanSearch(e.target.value)} placeholder="Rechercher (ID, nom, adresse IP)…" />
              <select style={{ ...inp, width: 180 }} value={fVlanUsage} onChange={e => setFVlanUsage(e.target.value)}>
                <option value="">Tous les usages</option>
                {vlanUsages.map(u => <option key={u as string} value={u as string}>{u}</option>)}
              </select>
              <div style={{ fontSize: 13, color: '#94a3b8', alignSelf: 'center' }}>{filteredVlans.length} VLANs</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['ID','Nom','Description','Adresse IP','Sous-réseau 2','Passerelle','DHCP Relay','Usage'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredVlans.map((v, i) => (
                    <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 ? '#fafbfc' : 'white' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontWeight: 800, fontSize: 15, color: '#1e293b' }}>{v.vlan_id}</span>
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>{v.nom}</td>
                      <td style={{ padding: '8px 12px', color: '#64748b', fontSize: 12 }}>{v.description}</td>
                      <td style={{ padding: '8px 12px' }}>
                        {v.adresse_ip && <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#1d4ed8', background: '#eff6ff', padding: '2px 6px', borderRadius: 4 }}>{v.adresse_ip}</span>}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {v.adresse_ip2 && <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6d28d9', background: '#f5f3ff', padding: '2px 6px', borderRadius: 4 }}>{v.adresse_ip2}</span>}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {v.passerelle && <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#065f46', background: '#d1fae5', padding: '2px 6px', borderRadius: 4 }}>{v.passerelle}</span>}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: '#374151' }}>{v.dhcp_relay || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        {v.usage && <span style={{ background: (VLAN_USAGE_COLOR[v.usage] || '#64748b') + '20', color: VLAN_USAGE_COLOR[v.usage] || '#64748b', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{v.usage}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════ TAB LIAISONS FO ══════════════════ */}
        {tab === 'liaisons-fo' && (
          <div>
            {(['COEUR','NORD','SUD'] as const).map(boucle => {
              const items = liaisonsFO.filter(l => l.boucle === boucle);
              if (!items.length) return null;
              return (
                <div key={boucle} style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: BOUCLE_COLOR[boucle], margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Cable size={16} /> Boucle {boucle} ({items.length} liaisons)
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map(l => (
                      <div key={l.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', borderLeft: `4px solid ${BOUCLE_COLOR[boucle]}` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{l.libelle || `${l.site_a} ↔ ${l.site_b}`}</div>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                            <strong>{l.site_a_nom || l.site_a}</strong> ↔ <strong>{l.site_b_nom || l.site_b}</strong>
                            {l.paires ? <> · Paires : <span style={{ fontFamily: 'monospace', color: '#7c3aed', background: '#f5f3ff', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>{l.paires}</span></> : ''}
                            {l.boite_jonction ? <> · Via : <em>{l.boite_jonction}</em></> : ''}
                            {l.capacite ? <> · <span style={{ fontWeight: 600, color: '#2563eb' }}>{l.capacite}</span></> : ''}
                          </div>
                          {l.notes && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontStyle: 'italic' }}>{l.notes}</div>}
                        </div>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: l.statut === 'ACTIF' ? '#dcfce7' : '#fef9c3', color: l.statut === 'ACTIF' ? '#15803d' : '#92400e', fontWeight: 600, flexShrink: 0 }}>{l.statut}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════════════ TAB STATS ══════════════════ */}
        {tab === 'stats' && stats && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              {[
                ['Liens total',    stats.liens_total,    '#0f172a', 'Tous les liens réseau'],
                ['Liens FO',       stats.liens_fo,       '#2563eb', 'Liaisons fibre optique'],
                ['Liens WAN',      stats.liens_wan,      '#f97316', 'Liens opérateurs/WAN'],
                ['Équipements',    stats.equipements,    '#8b5cf6', 'Switches, routeurs, firewalls'],
                ['VLANs actifs',   stats.vlans_actifs,   '#16a34a', 'VLANs configurés'],
              ].map(([label, value, color, desc]) => (
                <div key={label as string} style={{ ...card, borderTop: `3px solid ${color}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: color as string, lineHeight: 1.1 }}>{value}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginTop: 4 }}>{label}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{desc}</div>
                </div>
              ))}
            </div>

            {/* VLANs par usage */}
            <div style={card}>
              <h3 style={cardTitle}>VLANs par usage</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(
                  vlans.reduce((acc, v) => {
                    const u = v.usage || 'Autre';
                    acc[u] = (acc[u] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).sort((a, b) => b[1] - a[1]).map(([usage, count]) => (
                  <div key={usage} style={{ padding: '8px 14px', background: (VLAN_USAGE_COLOR[usage] || '#64748b') + '15', borderRadius: 10, border: `1px solid ${(VLAN_USAGE_COLOR[usage] || '#64748b')}30` }}>
                    <span style={{ fontWeight: 700, color: VLAN_USAGE_COLOR[usage] || '#64748b', fontSize: 18 }}>{count}</span>
                    <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>{usage}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Accès WAN résumé */}
            <div style={card}>
              <h3 style={cardTitle}><Wifi size={16} /> Accès WAN / Opérateurs ({access.length})</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 6 }}>
                {access.map(a => (
                  <div key={a.id} style={{ padding: '6px 10px', background: '#f8fafc', borderRadius: 8, fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#2563eb', background: '#eff6ff', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>{a.site_code}</span>
                    <div>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{a.type} {a.operator ? `· ${a.operator}` : ''} {a.bandwidth ? `· ${a.bandwidth}` : ''}</div>
                      {a.comment && <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.comment}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fourreaux */}
            <div style={card}>
              <h3 style={cardTitle}><Cable size={16} /> Fourreaux FO</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ducts.map(d => (
                  <div key={d.id} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</span>
                      <span style={{ fontSize: 12, color: d.status === 'LIBRE' ? '#16a34a' : '#f97316', fontWeight: 600 }}>{d.status}</span>
                    </div>
                    <div style={{ background: '#e2e8f0', borderRadius: 4, height: 8 }}>
                      <div style={{ background: d.status === 'LIBRE' ? '#16a34a' : '#3b82f6', borderRadius: 4, height: 8, width: `${((d.used_capacity || 0) / (d.capacity || 1)) * 100}%` }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{d.used_capacity}/{d.capacity} paires utilisées</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e9eef5', borderRadius: 14, padding: 16, boxShadow: '0 1px 3px rgba(15,23,42,.04)' };
const cardTitle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '0 0 12px' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', margin: '8px 0 4px' };
const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', outline: 'none', background: '#f8fafc' };
const chk: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { width: '100%', padding: 11, border: 'none', borderRadius: 10, background: 'linear-gradient(135deg, #2563eb, #4f46e5)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: 4, borderRadius: 6 };
const tabBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const tabActive: React.CSSProperties = { ...tabBtn, background: 'linear-gradient(135deg, #2563eb, #4f46e5)', color: '#fff', border: 'none' };
