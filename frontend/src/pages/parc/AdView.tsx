import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import {
  Server, X, RefreshCw, ChevronDown, ChevronRight, TrendingUp, Eye, Laptop,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const C = { blue: '#2563eb', slate: '#64748b', green: '#059669', amber: '#d97706', red: '#dc2626', bg: '#f1f5f9', card: '#fff', border: '#e2e8f0', text: '#0f172a' };

const FAMILY_COLORS: Record<string, string> = {
  'Windows 11': '#2563eb',
  'Windows 10': '#0891b2',
};
const FAMILY_PALETTE = ['#2563eb', '#0891b2', '#7c3aed', '#d97706', '#059669', '#dc2626', '#64748b'];
const familyColor = (family: string, i: number) => FAMILY_COLORS[family] || FAMILY_PALETTE[i % FAMILY_PALETTE.length];

interface OsVersion { label: string; count: number; sortKey: number }
interface OsFamily { family: string; total: number; isServer: boolean; versions: OsVersion[] }
interface HistoryPoint { date: string; family: string; total: number }
type ViewTarget = { family: string; version?: string } | null;

// ── Sous-tableau "Voir" : postes appartenant à une famille (ou version) d'OS ──
type MachineSortKey = 'name' | 'os_version_label' | 'ipaddress' | 'usager' | 'lastlogonuser' | 'lastlogon' | 'enabled';

const AdOsMachinesModal: React.FC<{ target: { family: string; version?: string }; token: string | null; onClose: () => void; onOpenDevice: (name: string) => void }> = ({ target, token, onClose, onOpenDevice }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<MachineSortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const r = await axios.get('/api/parc/ad/computers-by-os', {
          params: { family: target.family, ...(target.version ? { version: target.version } : {}) },
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!cancelled) setRows(r.data.rows || []);
      } catch (e: any) { if (!cancelled) setError(e.response?.data?.message || e.message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [target.family, target.version, token]);

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return d; }
  };

  const toggleSort = (key: MachineSortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };
  const sortArrow = (key: MachineSortKey) => sortKey !== key ? null : (sortDir === 'asc' ? ' ▲' : ' ▼');

  const sortedRows = [...rows].sort((a, b) => {
    let av: any = a[sortKey]; let bv: any = b[sortKey];
    if (sortKey === 'lastlogon') { av = av ? new Date(av).getTime() : 0; bv = bv ? new Date(bv).getTime() : 0; }
    else if (sortKey === 'enabled') { av = av ? 1 : 0; bv = bv ? 1 : 0; }
    else {
      if (av == null || av === '') return bv == null || bv === '' ? 0 : 1;
      if (bv == null || bv === '') return -1;
      av = String(av).toLowerCase(); bv = String(bv).toLowerCase();
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const sortTh: React.CSSProperties = { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', userSelect: 'none' as const, whiteSpace: 'nowrap' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 1500, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 'calc(var(--header-height, 80px) + 24px) 16px 40px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 820, boxShadow: '0 25px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
          <Laptop size={18} color={C.blue} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '.95rem', color: C.text }}>{target.family}{target.version ? ` — ${target.version}` : ''}</div>
            <div style={{ fontSize: '.78rem', color: C.slate }}>{loading ? 'Chargement…' : `${rows.length} poste${rows.length > 1 ? 's' : ''}`}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate }}><X size={18} /></button>
        </div>
        <div style={{ padding: '12px 20px 20px', maxHeight: '65vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: C.slate }}><RefreshCw size={20} className="spin" /></div>
          ) : error ? (
            <div style={{ color: C.red, fontSize: '.85rem' }}>{error}</div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: C.slate, fontSize: '.85rem' }}>Aucun poste.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: C.slate }}>
                  <th style={sortTh} onClick={() => toggleSort('name')}>Nom{sortArrow('name')}</th>
                  <th style={sortTh} onClick={() => toggleSort('os_version_label')}>Version{sortArrow('os_version_label')}</th>
                  <th style={sortTh} onClick={() => toggleSort('ipaddress')}>IP{sortArrow('ipaddress')}</th>
                  <th style={sortTh} onClick={() => toggleSort('usager')}>Usager (parc){sortArrow('usager')}</th>
                  <th style={sortTh} onClick={() => toggleSort('lastlogonuser')}>Dernier utilisateur AD{sortArrow('lastlogonuser')}</th>
                  <th style={sortTh} onClick={() => toggleSort('lastlogon')}>Dernière connexion{sortArrow('lastlogon')}</th>
                  <th style={sortTh} onClick={() => toggleSort('enabled')}>État{sortArrow('enabled')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, i) => (
                  <tr key={r.id} onClick={() => onOpenDevice(r.name)}
                    style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? '#fff' : '#fafbfc', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafbfc')}>
                    <td style={{ padding: '7px 8px', fontWeight: 600, color: C.blue }}>{r.name || '—'}</td>
                    <td style={{ padding: '7px 8px', color: C.slate }}>{r.os_version_label || '—'}</td>
                    <td style={{ padding: '7px 8px', fontFamily: 'monospace', fontSize: '.78rem' }}>{r.ipaddress || '—'}</td>
                    <td style={{ padding: '7px 8px' }}>{r.usager || '—'}</td>
                    <td style={{ padding: '7px 8px' }}>{r.lastlogonuser || '—'}</td>
                    <td style={{ padding: '7px 8px', color: C.slate }}>{fmtDate(r.lastlogon)}</td>
                    <td style={{ padding: '7px 8px' }}>
                      {r.enabled ? <span style={{ color: '#059669', fontWeight: 700, fontSize: '.75rem' }}>Actif</span> : <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '.75rem' }}>Désactivé</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ marginTop: 10, fontSize: '.72rem', color: C.slate }}>Cliquez sur un poste pour afficher sa fiche complète.</div>
        </div>
      </div>
    </div>
  );
};

// ── Panneau de répartition pour un groupe d'OS (postes de travail ou serveurs) ──
const OsFamilyPanel: React.FC<{ title: string; families: OsFamily[]; onView: (t: ViewTarget) => void }> = ({ title, families, onView }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const total = families.reduce((s, f) => s + f.total, 0);

  const toggle = (family: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(family)) next.delete(family); else next.add(family);
      return next;
    });
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontWeight: 700, fontSize: '.9rem', color: C.text, marginBottom: 10 }}>{title}</div>
      {families.length === 0 ? (
        <div style={{ fontSize: '.82rem', color: C.slate, padding: '8px 0' }}>Aucun poste.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {families.map((f, i) => {
            const pct = total ? Math.round((f.total / total) * 100) : 0;
            const color = familyColor(f.family, i);
            const isOpen = expanded.has(f.family);
            return (
              <div key={f.family}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderRadius: 6 }}>
                  <span onClick={() => toggle(f.family)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, minWidth: 0 }}>
                    {isOpen ? <ChevronDown size={14} color={C.slate} /> : <ChevronRight size={14} color={C.slate} />}
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: '.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.family}</span>
                  </span>
                  <span style={{ fontSize: '.78rem', color: C.slate }}>{pct}%</span>
                  <span style={{ fontSize: '.82rem', fontWeight: 700, minWidth: 30, textAlign: 'right' }}>{f.total}</span>
                  <button onClick={() => onView({ family: f.family })} title="Voir les postes"
                    style={{ display: 'flex', alignItems: 'center', gap: 3, background: '#eff6ff', border: 'none', borderRadius: 6, padding: '3px 7px', cursor: 'pointer', color: C.blue, fontSize: '.72rem', fontWeight: 600 }}>
                    <Eye size={12} /> Voir
                  </button>
                </div>
                <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, marginLeft: 32, marginRight: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                </div>
                {isOpen && (
                  <div style={{ marginLeft: 32, marginTop: 6, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {f.versions.map(v => {
                      const vpct = f.total ? Math.round((v.count / f.total) * 100) : 0;
                      return (
                        <div key={v.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.76rem', color: C.slate }}>
                          <span style={{ minWidth: 90, fontWeight: 600, color: C.text }}>{v.label}</span>
                          <div style={{ flex: 1, height: 4, background: '#f1f5f9', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${vpct}%`, height: '100%', background: color, opacity: 0.55, borderRadius: 2 }} />
                          </div>
                          <span style={{ minWidth: 26, textAlign: 'right' }}>{v.count}</span>
                          <button onClick={() => onView({ family: f.family, version: v.label })} title="Voir les postes"
                            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: C.blue, padding: 2 }}>
                            <Eye size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Bloc "Statistiques OS" : répartition postes/serveurs (drill-down par version) + évolution ──
const AdOsStats: React.FC<{ families: OsFamily[]; history: HistoryPoint[]; token: string | null; onOpenDevice: (name: string) => void }> = ({ families, history, token, onOpenDevice }) => {
  const [viewTarget, setViewTarget] = useState<ViewTarget>(null);

  const workstations = useMemo(() => families.filter(f => !f.isServer), [families]);
  const servers = useMemo(() => families.filter(f => f.isServer), [families]);

  // Pivot de l'historique : une ligne par date, une colonne par famille (pour le LineChart multi-séries).
  const topFamilies = useMemo(() => families.slice(0, 5).map(f => f.family), [families]);
  const evolutionSeries = useMemo(() => {
    const byDate = new Map<string, any>();
    for (const row of history) {
      if (!topFamilies.includes(row.family)) continue;
      if (!byDate.has(row.date)) byDate.set(row.date, { date: row.date });
      byDate.get(row.date)[row.family] = row.total;
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [history, topFamilies]);

  const fmtDateShort = (d: string) => {
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); }
    catch { return d; }
  };

  if (families.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <OsFamilyPanel title="Postes de travail" families={workstations} onView={setViewTarget} />
        <OsFamilyPanel title="Serveurs" families={servers} onView={setViewTarget} />
      </div>

      {/* Évolution des OS (une valeur par jour de synchronisation AD) */}
      {evolutionSeries.length > 1 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontWeight: 700, fontSize: '.9rem', color: C.text, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <TrendingUp size={15} /> Évolution des OS
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolutionSeries} margin={{ left: -12, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={fmtDateShort} tick={{ fontSize: 10, fill: C.slate }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: C.slate }} />
                <Tooltip labelFormatter={(d: any) => fmtDateShort(String(d))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {topFamilies.map((fam, i) => (
                  <Line key={fam} type="monotone" dataKey={fam} stroke={familyColor(fam, i)} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {viewTarget && (
        <AdOsMachinesModal target={viewTarget} token={token} onClose={() => setViewTarget(null)} onOpenDevice={onOpenDevice} />
      )}
    </div>
  );
};

interface ColFilters {
  name: string; sam: string; ip: string; os: string; usager: string; user: string; ou: string;
  enabled: '' | 'true' | 'false';
}
const EMPTY_FILTERS: ColFilters = { name: '', sam: '', ip: '', os: '', usager: '', user: '', ou: '', enabled: '' };

interface AdViewProps {
  // Ouvre la fiche détail complète (parc/hub) d'un poste à partir de son nom AD (ex: "PO22038").
  onOpenDevice?: (name: string) => void;
}

const AdView: React.FC<AdViewProps> = ({ onOpenDevice }) => {
  const { token } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ColFilters>(EMPTY_FILTERS);
  const [sortCol, setSortCol] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ running: boolean; total: number; current: number; step: string; error: string | null } | null>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);

  // Stats globales (cartes + répartition/évolution OS) — chargées une fois, rafraîchies après import.
  const [globalStats, setGlobalStats] = useState<{ total: number; enabled: number; disabled: number; last_sync: string | null } | null>(null);
  const [osFamilies, setOsFamilies] = useState<OsFamily[]>([]);
  const [osHistory, setOsHistory] = useState<HistoryPoint[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  const limit = 50;
  const handleOpenDevice = onOpenDevice || (() => {});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatsLoading(true);
      try {
        const [statsRes, histRes] = await Promise.all([
          axios.get('/api/parc/ad/stats', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('/api/parc/ad/stats/history', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (cancelled) return;
        setGlobalStats({ total: statsRes.data.total, enabled: statsRes.data.enabled, disabled: statsRes.data.disabled, last_sync: statsRes.data.last_sync });
        setOsFamilies(statsRes.data.by_os_family || []);
        setOsHistory(histRes.data || []);
      } catch (e) { console.error('Erreur chargement stats AD:', e); }
      finally { if (!cancelled) setStatsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [token, statsRefreshKey]);

  const loadData = useCallback(async (p?: number, f?: ColFilters, col?: string, dir?: string) => {
    setLoading(true);
    try {
      const pg = p ?? page;
      const flt = f ?? filters;
      const params: Record<string, string | number> = { page: pg, limit, sort: col ?? sortCol, order: dir ?? sortDir };
      if (flt.name) params.f_name = flt.name;
      if (flt.sam) params.f_sam = flt.sam;
      if (flt.ip) params.f_ip = flt.ip;
      if (flt.os) params.f_os = flt.os;
      if (flt.usager) params.f_usager = flt.usager;
      if (flt.user) params.f_user = flt.user;
      if (flt.ou) params.f_ou = flt.ou;
      if (flt.enabled) params.enabled = flt.enabled;
      const r = await axios.get('/api/parc/ad/computers', {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });
      setRows(r.data.rows);
      setTotal(r.data.total);
    } catch (e: any) {
      console.error('Erreur chargement AD computers:', e);
    } finally { setLoading(false); }
  }, [filters, page, sortCol, sortDir, token]);

  useEffect(() => { loadData(1); }, []);

  // Filtres par colonne : rechargement débouncé (400ms) à chaque frappe.
  const isFirstFilterRun = useRef(true);
  useEffect(() => {
    if (isFirstFilterRun.current) { isFirstFilterRun.current = false; return; }
    const t = setTimeout(() => { setPage(1); loadData(1, filters); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const setFilter = (key: keyof ColFilters, value: string) => setFilters(prev => ({ ...prev, [key]: value }));
  const hasActiveFilters = Object.values(filters).some(v => v !== '');
  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const startImport = async () => {
    setImporting(true);
    setProgress({ running: true, total: 0, current: 0, step: 'Démarrage…', error: null });
    try {
      await axios.post('/api/parc/ad/import', {}, { headers: { Authorization: `Bearer ${token}` } });
      progressInterval.current = setInterval(async () => {
        try {
          const p = await axios.get('/api/parc/ad/import-progress', { headers: { Authorization: `Bearer ${token}` } });
          setProgress(p.data);
          if (!p.data.running) {
            if (progressInterval.current) clearInterval(progressInterval.current);
            setImporting(false);
            setPage(1);
            loadData(1);
            setStatsRefreshKey(k => k + 1);
          }
        } catch { }
      }, 1000);
    } catch (e: any) {
      setProgress({ running: false, total: 0, current: 0, step: `Erreur: ${e.response?.data?.error || e.message}`, error: e.message });
      setImporting(false);
    }
  };

  useEffect(() => {
    return () => { if (progressInterval.current) clearInterval(progressInterval.current); };
  }, []);

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      const d = sortDir === 'asc' ? 'desc' : 'asc';
      setSortDir(d); loadData(page, filters, col, d);
    } else {
      setSortCol(col); setSortDir('asc'); loadData(page, filters, col, 'asc');
    }
  };

  const sortArrow = (col: string) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const pageCount = Math.ceil(total / limit);

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return d; }
  };

  const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: '.78rem', fontWeight: 700, color: C.slate, borderBottom: `1px solid ${C.border}`, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' as const };
  const filterInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box' as const, padding: '4px 6px', border: `1px solid ${C.border}`, borderRadius: 5, fontSize: '.75rem', outline: 'none' };
  const filterTh: React.CSSProperties = { padding: '4px 10px 8px', borderBottom: `2px solid ${C.border}`, background: '#f8fafc' };

  return (
    <div>
      {/* Barre d'actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' as const }}>
        <button onClick={startImport} disabled={importing}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px',
            background: importing ? '#94a3b8' : '#2563eb', color: '#fff', border: 'none',
            borderRadius: 9, fontWeight: 700, fontSize: '.88rem', cursor: importing ? 'not-allowed' : 'pointer'
          }}>
          <RefreshCw size={16} className={importing ? 'spin' : ''} />
          {importing ? 'Import en cours…' : 'Importer AD'}
        </button>
        <div style={{ flex: 1 }} />
        {hasActiveFilters && (
          <button onClick={clearFilters}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: '.8rem', color: C.slate }}>
            <X size={13} /> Effacer les filtres
          </button>
        )}
      </div>

      {/* Cartes de synthèse */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: 16 }}>
        {[
          { label: 'Ordinateurs', val: globalStats?.total ?? '—', color: C.blue },
          { label: 'Actifs', val: globalStats?.enabled ?? '—', color: C.green },
          { label: 'Désactivés', val: globalStats?.disabled ?? '—', color: C.red },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', minWidth: 120 }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: C.slate, textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.label}</div>
          </div>
        ))}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', minWidth: 180 }}>
          <div style={{ fontSize: '.9rem', fontWeight: 700, color: C.text }}>
            {globalStats?.last_sync ? new Date(globalStats.last_sync).toLocaleString('fr-FR') : 'Jamais'}
          </div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: C.slate, textTransform: 'uppercase', letterSpacing: '.04em' }}>Dernière synchro</div>
        </div>
      </div>

      {/* Barre de progression */}
      {progress && (progress.running || progress.error) && (
        <div style={{ background: '#f8fafc', border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: '.86rem' }}>
            <span style={{ fontWeight: 700, color: C.text }}>{progress.step}</span>
            {progress.total > 0 && (
              <span style={{ color: C.slate }}>{progress.current} / {progress.total}</span>
            )}
          </div>
          {progress.total > 0 && (
            <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.round((progress.current / progress.total) * 100)}%`,
                height: '100%', background: progress.error ? '#dc2626' : '#2563eb',
                borderRadius: 4, transition: 'width .3s ease'
              }} />
            </div>
          )}
          {progress.running && progress.total === 0 && (
            <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: '30%', height: '100%', background: '#2563eb', borderRadius: 4, animation: 'adProgressAnim 1.5s ease infinite' }} />
            </div>
          )}
          {progress.error && (
            <div style={{ marginTop: 8, fontSize: '.82rem', color: '#dc2626' }}>{progress.error}</div>
          )}
        </div>
      )}

      {/* Statistiques OS : postes de travail / serveurs (drill-down par version) + évolution */}
      {statsLoading ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.slate }}><RefreshCw size={20} className="spin" /></div>
      ) : (
        <AdOsStats families={osFamilies} history={osHistory} token={token} onOpenDevice={handleOpenDevice} />
      )}

      {/* Tableau */}
      {loading && rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.slate }}>
          <RefreshCw size={28} className="spin" style={{ marginBottom: 12 }} />
          <div>Chargement…</div>
        </div>
      ) : total === 0 && !hasActiveFilters ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.slate, fontSize: '.9rem' }}>
          <Server size={40} style={{ marginBottom: 12, opacity: .3 }} />
          <div>Aucun ordinateur importé. Cliquez sur <b>Importer AD</b> pour synchroniser l'Active Directory.</div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 8, fontSize: '.82rem', color: C.slate }}>
            {total} ordinateur{total > 1 ? 's' : ''}{hasActiveFilters ? ' (filtré)' : ''}
          </div>
          <div style={{ overflowX: 'auto' as const, borderRadius: 10, border: `1px solid ${C.border}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.83rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={th} onClick={() => toggleSort('name')}>Nom{sortArrow('name')}</th>
                  <th style={{ ...th, cursor: 'default' }}>SAM Account</th>
                  <th style={{ ...th, cursor: 'default' }}>IP</th>
                  <th style={{ ...th, cursor: 'default' }}>OS</th>
                  <th style={th} onClick={() => toggleSort('lastlogon')}>Dernière connexion{sortArrow('lastlogon')}</th>
                  <th style={{ ...th, cursor: 'default' }}>Usager (parc)</th>
                  <th style={{ ...th, cursor: 'default' }}>Dernier utilisateur AD</th>
                  <th style={{ ...th, cursor: 'default' }}>OU</th>
                  <th style={th} onClick={() => toggleSort('enabled')}>État{sortArrow('enabled')}</th>
                </tr>
                <tr>
                  <th style={filterTh}><input style={filterInput} value={filters.name} onChange={e => setFilter('name', e.target.value)} placeholder="Filtrer…" /></th>
                  <th style={filterTh}><input style={filterInput} value={filters.sam} onChange={e => setFilter('sam', e.target.value)} placeholder="Filtrer…" /></th>
                  <th style={filterTh}><input style={filterInput} value={filters.ip} onChange={e => setFilter('ip', e.target.value)} placeholder="Filtrer…" /></th>
                  <th style={filterTh}><input style={filterInput} value={filters.os} onChange={e => setFilter('os', e.target.value)} placeholder="Filtrer…" /></th>
                  <th style={filterTh} />
                  <th style={filterTh}><input style={filterInput} value={filters.usager} onChange={e => setFilter('usager', e.target.value)} placeholder="Filtrer…" /></th>
                  <th style={filterTh}><input style={filterInput} value={filters.user} onChange={e => setFilter('user', e.target.value)} placeholder="Filtrer…" /></th>
                  <th style={filterTh}><input style={filterInput} value={filters.ou} onChange={e => setFilter('ou', e.target.value)} placeholder="Filtrer…" /></th>
                  <th style={filterTh}>
                    <select style={filterInput} value={filters.enabled} onChange={e => setFilter('enabled', e.target.value as ColFilters['enabled'])}>
                      <option value="">Tous</option>
                      <option value="true">Actif</option>
                      <option value="false">Désactivé</option>
                    </select>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: C.slate }}>Aucun résultat pour ces filtres.</td></tr>
                ) : rows.map((row, i) => (
                  <tr key={row.id} onClick={() => handleOpenDevice(row.name)}
                    style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? '#fff' : '#fafbfc', cursor: onOpenDevice ? 'pointer' : 'default' }}
                    onMouseEnter={e => onOpenDevice && (e.currentTarget.style.background = '#eff6ff')}
                    onMouseLeave={e => onOpenDevice && (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafbfc')}>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: onOpenDevice ? C.blue : C.text }}>{row.name || row.cn || '—'}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '.79rem' }}>{row.samaccountname || '—'}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '.79rem' }}>{row.ipaddress || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: '.79rem' }}>
                      {row.operatingsystem ? (
                        <span title={`${row.operatingsystem} — ${row.osversion || ''}`}>
                          {row.operatingsystem}
                          {row.os_version_label && row.os_version_label !== 'Inconnu' ? (
                            <span style={{ marginLeft: 5, fontSize: '.72rem', fontWeight: 700, color: C.blue, background: '#eff6ff', borderRadius: 4, padding: '1px 5px' }}>
                              {row.os_version_label}
                            </span>
                          ) : null}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', fontSize: '.79rem', color: C.slate }}>{fmtDate(row.lastlogon)}</td>
                    <td style={{ padding: '8px 10px', fontSize: '.79rem' }}>{row.usager || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: '.79rem' }}>{row.lastlogonuser || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: '.75rem', color: C.slate, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.ou || ''}>{row.ou || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {row.enabled ? (
                        <span style={{ color: '#059669', fontWeight: 700, fontSize: '.75rem' }}>Actif</span>
                      ) : (
                        <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '.75rem' }}>Désactivé</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
              <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); loadData(p); }}
                style={{ padding: '6px 12px', border: `1px solid ${C.border}`, borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: '.82rem' }}>‹</button>
              <span style={{ fontSize: '.82rem', color: C.slate }}>Page {page} / {pageCount}</span>
              <button disabled={page >= pageCount} onClick={() => { const p = page + 1; setPage(p); loadData(p); }}
                style={{ padding: '6px 12px', border: `1px solid ${C.border}`, borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: '.82rem' }}>›</button>
            </div>
          )}
        </>
      )}

      <style>{`@keyframes adProgressAnim{0%{width:10%;margin-left:0}50%{width:50%;margin-left:40%}100%{width:10%;margin-left:90%}}`}</style>
    </div>
  );
};

export default AdView;
