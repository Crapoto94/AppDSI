import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Header from '../../components/Header';
import {
  Network, Map as MapIcon, MapPin, Share2, Plus, Trash2,
  Cpu, GitBranch, Tag, Cable, BarChart2, Wifi, Shield, Server, Router, Link2,
} from 'lucide-react';
import NetworkMap from './NetworkMap';
import type { MoveResult } from './NetworkMap';
import NetworkTopology from './NetworkTopology';
import { linkStyle } from './utils';
import type {
  NetworkLink, NetworkAccess, Duct, SiteRef, LinkType, Operator,
  IrfStack, Equipement, Vlan, LiaisonFO, ReseauStats, SwitchLink,
} from './types';

const LINK_TYPES: LinkType[] = ['FIBRE', 'WAN', 'OPERATEUR', 'LASER'];
const OPERATORS:  Operator[]  = ['LINKT', 'MOJI', 'RED', 'OTHER', 'SFR'];

const emptyForm = {
  site_a: '', site_b: '', type: 'FIBRE' as LinkType, operator: '' as '' | Operator,
  capacity: '', carries_data: true, carries_voice: false, is_loop: false, is_redundant: false,
};

type Tab = 'carte' | 'liens-switchs' | 'irf' | 'equipements' | 'vlans' | 'liaisons-fo' | 'stats';

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
  const [switchLinks, setSwitchLinks] = useState<SwitchLink[]>([]);
  const [stats, setStats]           = useState<ReseauStats | null>(null);

  const [tab, setTab]     = useState<Tab>('carte');
  const [view, setView]   = useState<'map' | 'topology'>('map');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [layers, setLayers]       = useState({ links: true, sites: true, coeur: true });
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [detailLink, setDetailLink] = useState<SwitchLink | null>(null);

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

  // ── Filtres liens switchs ───────────────────────────────────────
  const [fSlSearch, setFSlSearch]   = useState('');
  const [fSlScope, setFSlScope]     = useState<'' | 'intra' | 'inter'>('');

  const sites = useMemo(() => {
    const m = new Map<string, SiteRef>();
    sitesArr.forEach(s => m.set(s.site_code, s));
    return m;
  }, [sitesArr]);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, l, a, d, irf, eq, vl, fo, sl, st] = await Promise.all([
        axios.get('/api/network/sites',         { headers }),
        axios.get('/api/network/links',         { headers }),
        axios.get('/api/network/access',        { headers }),
        axios.get('/api/network/ducts',         { headers }),
        axios.get('/api/network/irf-stacks',    { headers }),
        axios.get('/api/network/equipements',   { headers }),
        axios.get('/api/network/vlans',         { headers }),
        axios.get('/api/network/liaisons-fo',   { headers }),
        axios.get('/api/network/switch-links',  { headers }),
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
      setSwitchLinks(sl.data || []);
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

  const intersiteSwitchLinks = useMemo(
    () => switchLinks.filter(l => {
      // Toujours inclure les liens marqués inter-sites
      if (!l.is_intra_site) return true;
      // Pour les liens intra-site avec site_id JSON (IRF stack multi-sites),
      // on les inclut aussi — expandSiteCodes déterminera si les sites diffèrent.
      if ((l.local_site_id && l.local_site_id.startsWith('{')) ||
          (l.remote_site_id && l.remote_site_id.startsWith('{'))) return true;
      return false;
    }),
    [switchLinks]
  );

  // Résout un code de site en code parent si le sous-site (S007B01) n'est pas
  // dans hub.sites avec ses propres coordonnées.
  const siteCode = useCallback((code: string | null | undefined): string | null => {
    if (!code) return null;
    if (sites.has(code)) return code;
    const parent = code.replace(/(B|L|EXT|ESP).*$/, '');
    return parent !== code && sites.has(parent) ? parent : code;
  }, [sites]);

  // Décode un site_id JSON (IRF stack multi-sites → [S001, S064])
  // ou retourne [siteCode(code)] pour un code normal.
  const expandSiteCodes = useCallback((code: string | null | undefined): string[] => {
    if (!code) return [];
    if (code.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(code) as Record<string, string>;
        return [...new Set(Object.values(parsed).map(v => siteCode(v)))].filter(Boolean) as string[];
      } catch { return []; }
    }
    const sc = siteCode(code);
    return sc ? [sc] : [];
  }, [siteCode]);

  // Liens switchs inter-sites individuels (un par entrée, pour la carte).
  // Chaque lien est tracé entre les coordonnées des deux sites.
  // Si un sous-site (S007B01) n'existe pas dans hub.sites, on utilise le parent (S007).
  // Les site_id JSON (IRF stacks multi-sites) sont expansés en plusieurs liens,
  // un par paire de sites distincts entre local et remote.
  const individualSwitchMapLinks = useMemo<NetworkLink[]>(() => {
    return intersiteSwitchLinks.flatMap(l => {
      const aSites = expandSiteCodes(l.local_site_id);
      const bSites = expandSiteCodes(l.remote_site_id);
      const pairs: { a: string; b: string }[] = [];
      for (const a of aSites) {
        for (const b of bSites) {
          if (a !== b) pairs.push({ a, b });
        }
      }
      return pairs.map(p => ({
        id: `sl-${l.id}-${p.a}-${p.b}`,
        site_a: p.a,
        site_b: p.b,
        type: 'FIBRE' as LinkType,
        capacity: null, operator: null,
        carries_data: true, carries_voice: false,
        is_loop: false, is_redundant: false,
        geometry: null,
        notes: `${l.local_hostname || '?'}:${l.local_port || '?'} → ${l.remote_hostname || '?'}:${l.remote_port || '?'}`,
      }));
    });
  }, [intersiteSwitchLinks, sites, expandSiteCodes]);

  // Carte = liens manuels (network_links) + tous les liens switchs inter-sites individuels
  const mapLinks = useMemo(() => [...links, ...individualSwitchMapLinks], [links, individualSwitchMapLinks]);

  // Équipements groupés par site_code
  const equipementsBySite = useMemo(() => {
    const m = new Map<string, typeof equipements>();
    for (const eq of equipements) {
      const sc = eq.site_code || '';
      if (!sc) continue;
      if (!m.has(sc)) m.set(sc, []);
      m.get(sc)!.push(eq);
    }
    return m;
  }, [equipements]);

  // Résout un code_bien (S007B01 → S007) en cherchant d'abord l'entrée exacte,
  // puis en héritant du site parent si le sous-site n'existe pas dans hub.sites.
  const resolveSite = useCallback((code: string): SiteRef | undefined => {
    // JSON multi-site → prendre le premier site résolu
    if (code.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(code) as Record<string, string>;
        const first = Object.values(parsed)[0];
        if (first) return resolveSite(first);
      } catch { return undefined; }
    }
    const direct = sites.get(code);
    if (direct) return direct;
    const parentCode = code.replace(/(B|L|EXT|ESP).*$/, '');
    if (parentCode !== code) {
      const parent = sites.get(parentCode);
      if (parent) return { ...parent, site_code: code, lat_own: null };
    }
    return undefined;
  }, [sites]);

  const hasCoords = (code: string) => { const s = resolveSite(code); return !!s && s.lat != null && s.lng != null; };

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

  // Certains stacks IRF ont un site_id sous forme de chaîne JSON {membre:site} → affichage lisible
  const fmtSite = (s?: string | null): string => {
    if (!s) return '—';
    if (s.trim().startsWith('{')) {
      try {
        const vals = [...new Set(Object.values(JSON.parse(s) as Record<string, string>).map(v => String(v).replace(/^"+|"+$/g, '')))];
        return `Multi : ${vals.join(', ')}`;
      } catch { return s; }
    }
    return s;
  };

  const filteredSwitchLinks = useMemo(() => switchLinks.filter(l => {
    const matchScope = !fSlScope || (fSlScope === 'intra' ? l.is_intra_site : !l.is_intra_site);
    const q = fSlSearch.toLowerCase();
    const matchSearch = !q ||
      (l.local_hostname || '').toLowerCase().includes(q) ||
      (l.remote_hostname || '').toLowerCase().includes(q) ||
      (l.local_ip || '').includes(q) || (l.remote_ip || '').includes(q) ||
      (l.local_site_id || '').toLowerCase().includes(q) || (l.remote_site_id || '').toLowerCase().includes(q);
    return matchScope && matchSearch;
  }), [switchLinks, fSlSearch, fSlScope]);

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
  const resolveEquipLocation = (e: Equipement) => {
    if (e.localisation) return { label: e.localisation, precise: true };
    if (e.site_nom)     return { label: e.site_nom, precise: false };
    if (e.site_code)    return { label: e.site_code, precise: false };
    return { label: '—', precise: false };
  };

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
              <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Infrastructure réseau — switchs &amp; liens synchronisés depuis l'API Infra (live)</p>
            </div>
          </div>
          {stats && (
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                ['Liens', stats.liens_total, '#2563eb'],
                ['Switchs', stats.equipements, '#8b5cf6'],
                ['Sites', stats.sites_connectes, '#16a34a'],
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
            ['liens-switchs', <><Link2 size={14} /> Liens switchs</>,        'liens-switchs'],
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
              {/* ── Liens réseau manuels ── */}
              <div style={card}>
                <h3 style={cardTitle}><MapPin size={16} /> Liens réseau ({links.length})</h3>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span><MapPin size={10} style={{ verticalAlign: 'middle', color: '#2563eb' }} fill="#2563eb" /> Cartographié</span>
                  <span><MapPin size={10} style={{ verticalAlign: 'middle', color: '#94a3b8' }} fill="none" /> Non cartographié</span>
                  <span style={{ color: '#16a34a' }}>⬤ Site géolocalisé</span>
                  <span style={{ color: '#ef4444' }}>⬤ Site non géolocalisé</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {links.map(l => {
                    const st = linkStyle(l);
                    const nomA = sites.get(l.site_a)?.nom || l.site_a;
                    const nomB = sites.get(l.site_b)?.nom || l.site_b;
                    const sel = selectedLinkId === l.id;
                    const coordsA = hasCoords(l.site_a);
                    const coordsB = hasCoords(l.site_b);
                    const hasGeometry = !!l.geometry;
                    const traceable = coordsA && coordsB;
                    return (
                      <div key={l.id}
                        ref={sel ? (el) => { if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80); } : undefined}
                        onClick={() => setSelectedLinkId(sel ? null : l.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                          background: sel ? '#fef2f2' : '#f8fafc',
                          border: `1px solid ${sel ? '#fecaca' : '#eef2f7'}`,
                          opacity: traceable ? 1 : 0.6,
                        }}>
                        <span style={{ width: 12, height: 3, borderRadius: 2, background: sel ? '#dc2626' : st.color, flexShrink: 0 }} />
                        <MapPin size={14}
                          style={{ flexShrink: 0 }}
                          fill={hasGeometry ? '#2563eb' : 'none'}
                          color={hasGeometry ? '#2563eb' : '#94a3b8'}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: sel ? '#b91c1c' : '#1e293b' }} title={`${l.site_a} → ${l.site_b}`}>
                            <span style={{ color: coordsA ? '#16a34a' : '#ef4444' }}>{nomA}</span>
                            {' → '}
                            <span style={{ color: coordsB ? '#16a34a' : '#ef4444' }}>{nomB}</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>
                            {l.type}{l.capacity ? ` · ${l.capacity}` : ''}{l.operator ? ` · ${l.operator}` : ''}
                            {!traceable && <span style={{ color: '#ef4444' }}> · Site(s) non géolocalisé(s)</span>}
                          </div>
                          <div style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>
                            <span style={{ color: coordsA ? '#16a34a' : '#ef4444' }}>⬤</span> {l.site_a}{coordsA ? '' : ' (non géolocalisé)'}
                            {' '}
                            <span style={{ color: coordsB ? '#16a34a' : '#ef4444' }}>⬤</span> {l.site_b}{coordsB ? '' : ' (non géolocalisé)'}
                          </div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); deleteLink(l.id); }} style={iconBtn}><Trash2 size={13} /></button>
                      </div>
                    );
                  })}
                  {links.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Aucun lien réseau.</div>}
                </div>
              </div>

              {/* ── Connexions switch inter-sites (tous les liens individuels) ── */}
              <div style={card}>
                <h3 style={cardTitle}><Server size={16} /> Connexions switch inter-sites ({intersiteSwitchLinks.length})</h3>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ color: '#16a34a' }}>⬤ Site géolocalisé</span>
                  <span style={{ color: '#ef4444' }}>⬤ Site non géolocalisé</span>
                  <span style={{ color: '#64748b' }}>Cliquez pour mettre en évidence sur la carte</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 500, overflowY: 'auto' }}>
                  {intersiteSwitchLinks.map(l => {
                    const linkId = `sl-${l.id}`;
                    const sel = selectedLinkId === linkId;
                    const sa = l.local_site_id || '?';
                    const sb = l.remote_site_id || '?';
                    const refA = resolveSite(sa);
                    const refB = resolveSite(sb);
                    const nomA = refA?.nom || sa;
                    const nomB = refB?.nom || sb;
                    const coordsA = hasCoords(sa);
                    const coordsB = hasCoords(sb);
                    return (
                      <div key={linkId}
                        ref={sel ? (el) => { if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80); } : undefined}
                        onClick={() => setSelectedLinkId(sel ? null : linkId)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                          background: sel ? '#fef2f2' : '#f8fafc',
                          border: `1px solid ${sel ? '#fecaca' : '#eef2f7'}`,
                        }}>
                        <span style={{ width: 10, height: 3, borderRadius: 2, background: sel ? '#dc2626' : '#16a34a', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: sel ? '#b91c1c' : '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ color: coordsA ? '#16a34a' : '#ef4444' }}>{nomA}</span>
                            {' → '}
                            <span style={{ color: coordsB ? '#16a34a' : '#ef4444' }}>{nomB}</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {sa}{coordsA ? '' : ' (?)'} · {l.local_hostname || '?'}:{l.local_port || '?'} → {l.remote_hostname || '?'}:{l.remote_port || '?'}
                          </div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); setDetailLink(l); }}
                          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 6px', fontSize: 10, color: '#64748b', cursor: 'pointer', flexShrink: 0 }}>
                          Détail
                        </button>
                      </div>
                    );
                  })}
                  {intersiteSwitchLinks.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Aucune connexion inter-sites.</div>}
                </div>
              </div>

              {/* ── Sites ── */}
              <div style={card}>
                <h3 style={cardTitle}><MapIcon size={16} /> Sites ({sitesArr.length})</h3>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ color: '#16a34a' }}>⬤ Coordonnées OK ({sitesArr.filter(s => s.lat != null && s.lng != null).length})</span>
                  <span style={{ color: '#ef4444' }}>⬤ Non géolocalisé ({sitesArr.filter(s => s.lat == null || s.lng == null).length})</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, maxHeight: 400, overflowY: 'auto' }}>
                  {sitesArr.map(s => {
                    const hasCoord = s.lat != null && s.lng != null;
                    return (
                      <div key={s.site_code} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6,
                        background: '#f8fafc', border: '1px solid #eef2f7',
                      }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: hasCoord ? '#16a34a' : '#ef4444',
                        }} />
                        <span style={{ fontWeight: 700, color: '#1e293b', fontFamily: 'monospace', fontSize: 11 }}>{s.site_code}</span>
                        <span style={{ color: '#64748b', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.nom}</span>
                        {!hasCoord && <span style={{ fontSize: 10, color: '#ef4444', flexShrink: 0 }}>non géolocalisé</span>}
                      </div>
                    );
                  })}
                  {sitesArr.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Aucun site.</div>}
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
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
                    {([['links','Liens','#16a34a'],['coeur','Cœur','#0f172a'],['sites','Sites','#2563eb']] as const).map(([k,lbl,c]) => (
                      <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: '#475569', fontWeight: 600 }}>
                        <input type="checkbox" checked={layers[k]} onChange={e => setLayers({ ...layers, [k]: e.target.checked })} />
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} /> {lbl}
                      </label>
                    ))}
                    {selectedLinkId && (
                      <button onClick={() => setSelectedLinkId(null)} style={{ border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontWeight: 600 }}>
                        ✕ Désélectionner
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                {view === 'map' ? (
                  <NetworkMap sites={sites} links={mapLinks} layers={layers} drawMode={false} drawnPoints={[]} onMapClick={() => {}}
                    selectedLinkId={selectedLinkId}
                    onSelectLink={setSelectedLinkId}
                    equipementsBySite={equipementsBySite}
                    highlightSites={(() => {
                      const l = selectedLinkId?.startsWith('sl-')
                        ? mapLinks.find(x => x.id.startsWith(selectedLinkId + '-'))
                        : mapLinks.find(x => x.id === selectedLinkId);
                      return l ? [l.site_a, l.site_b] : [];
                    })()}
                    onSiteMoved={(r: MoveResult) => {
                      setSitesArr(prev => prev.map(s =>
                        s.site_code === r.siteCode
                          ? { ...s, lat: r.lat, lng: r.lng, lat_own: r.lat, lng_own: r.lng, geocoded_manually: true }
                          : s
                      ));
                    }}
                  />
                ) : (
                  <NetworkTopology sites={sites} switchLinks={switchLinks} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ TAB LIENS SWITCHS ══════════════════ */}
        {tab === 'liens-switchs' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <input style={{ ...inp, width: 320 }} value={fSlSearch} onChange={e => setFSlSearch(e.target.value)} placeholder="Rechercher (hostname, IP, site)…" />
              <select style={{ ...inp, width: 200 }} value={fSlScope} onChange={e => setFSlScope(e.target.value as '' | 'intra' | 'inter')}>
                <option value="">Tous les liens</option>
                <option value="intra">Intra-site</option>
                <option value="inter">Inter-sites</option>
              </select>
              <div style={{ fontSize: 13, color: '#94a3b8', alignSelf: 'center' }}>{filteredSwitchLinks.length} liens</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['Switch local', 'IP locale', 'Port', 'Switch distant', 'IP distante', 'Port', 'Site', 'Portée'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSwitchLinks.map((l, i) => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 ? '#fafbfc' : 'white' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Server size={13} color="#64748b" /> {l.local_hostname}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {l.local_ip && <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#1d4ed8', background: '#eff6ff', padding: '2px 6px', borderRadius: 4 }}>{l.local_ip}</span>}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12, color: '#374151' }} title={l.local_port_description || ''}>{l.local_port}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Server size={13} color="#64748b" /> {l.remote_hostname}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {l.remote_ip && <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6d28d9', background: '#f5f3ff', padding: '2px 6px', borderRadius: 4 }}>{l.remote_ip}</span>}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12, color: '#374151' }} title={l.remote_port_description || ''}>{l.remote_port}</td>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: '#64748b' }}>
                        {l.local_site_id === l.remote_site_id ? fmtSite(l.local_site_id) : `${fmtSite(l.local_site_id)} → ${fmtSite(l.remote_site_id)}`}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ background: l.is_intra_site ? '#e0e7ff' : '#dcfce7', color: l.is_intra_site ? '#4338ca' : '#15803d', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                          {l.is_intra_site ? 'Intra-site' : 'Inter-sites'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredSwitchLinks.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>Aucun lien — lancez une synchronisation depuis Admin &gt; Infra</td></tr>
                  )}
                </tbody>
              </table>
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
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, display: 'flex', gap: 16 }}>
              <span><MapPin size={10} style={{ verticalAlign: 'middle', color: '#2563eb' }} fill="#2563eb" /> Localisation précise</span>
              <span><MapPin size={10} style={{ verticalAlign: 'middle', color: '#94a3b8' }} fill="none" /> Localisation héritée du site</span>
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
                  {filteredEquipements.map((e, i) => {
                    const loc = resolveEquipLocation(e);
                    return (
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
                      <td style={{ padding: '8px 12px', fontSize: 12 }}>
                        <MapPin size={12}
                          style={{ verticalAlign: 'middle', marginRight: 4 }}
                          fill={loc.precise ? '#2563eb' : 'none'}
                          color={loc.precise ? '#2563eb' : '#94a3b8'}
                        />
                        <span style={{ color: loc.precise ? '#0f172a' : '#64748b', fontWeight: loc.precise ? 600 : 400 }}>
                          {loc.label}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ background: STATUT_COLOR(e.statut) + '20', color: STATUT_COLOR(e.statut), padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{e.statut}</span>
                      </td>
                    </tr>
                    );
                  })}
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
                ['Liens total',     stats.liens_total,     '#0f172a', 'Liens switch-à-switch'],
                ['Intra-site',      stats.liens_intra,     '#6366f1', 'Liens entre switchs d’un même site'],
                ['Inter-sites',     stats.liens_inter,     '#16a34a', 'Liens entre sites différents'],
                ['Switchs',         stats.equipements,     '#8b5cf6', 'Équipements switch'],
                ['Sites connectés', stats.sites_connectes, '#2563eb', 'Sites reliés par un lien'],
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

      {/* ── Modale détail lien switch ── */}
      {detailLink && (() => {
        const l = detailLink;
        const renderField = (label: string, val: string | number | null | undefined) => (
          val != null && val !== '' ? (
            <div style={{ display: 'flex', gap: 8, fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ width: 150, fontWeight: 600, color: '#64748b', flexShrink: 0 }}>{label}</span>
              <span style={{ color: '#0f172a', wordBreak: 'break-all' }}>{String(val)}</span>
            </div>
          ) : null
        );
        const siteAFmt = l.local_site_id?.startsWith('{')
          ? `Multi-sites (${expandSiteCodes(l.local_site_id).join(', ')})`
          : `${l.local_site_id}${resolveSite(l.local_site_id || '')?.nom ? ' — ' + resolveSite(l.local_site_id || '')!.nom : ''}`;
        const siteBFmt = l.remote_site_id?.startsWith('{')
          ? `Multi-sites (${expandSiteCodes(l.remote_site_id).join(', ')})`
          : `${l.remote_site_id}${resolveSite(l.remote_site_id || '')?.nom ? ' — ' + resolveSite(l.remote_site_id || '')!.nom : ''}`;
        return (
          <div onClick={() => setDetailLink(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: 14, maxWidth: 600, width: '90%', maxHeight: '85vh', overflow: 'auto', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Détail du lien switch</h2>
                <button onClick={() => setDetailLink(null)}
                  style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Sites</div>
                <div style={{ fontSize: 13, color: '#0f172a' }}>
                  <span style={{ color: '#16a34a' }}>⬤</span> {siteAFmt}
                </div>
                <div style={{ fontSize: 13, color: '#0f172a' }}>
                  <span style={{ color: '#dc2626' }}>⬤</span> {siteBFmt}
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Équipement local</div>
              {renderField('Hostname', l.local_hostname)}
              {renderField('Alias', l.local_alias)}
              {renderField('IP', l.local_ip)}
              {renderField('Port', l.local_port)}
              {renderField('Description port', l.local_port_description)}
              {renderField('Switch ID', l.local_switch_id)}

              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', margin: '8px 0 4px' }}>Équipement distant</div>
              {renderField('Hostname', l.remote_hostname)}
              {renderField('Alias', l.remote_alias)}
              {renderField('IP', l.remote_ip)}
              {renderField('Port', l.remote_port)}
              {renderField('Description port', l.remote_port_description)}
              {renderField('Switch ID', l.remote_switch_id)}

              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', margin: '8px 0 4px' }}>Informations générales</div>
              {renderField('ID', l.id)}
              {renderField('ID externe', l.ext_id)}
              {renderField('Portée', l.is_intra_site ? 'Intra-site' : 'Inter-sites')}
              {renderField('Synchronisé le', l.synced_at ? new Date(l.synced_at).toLocaleString('fr-FR') : null)}
            </div>
          </div>
        );
      })()}
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
