import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Monitor, Server, Package, Cpu, Wifi, HardDrive, User, Clock,
  Search, RefreshCw, AlertTriangle, Shield, Activity, Eye,
  ChevronRight, Globe, Zap, X, Filter, BarChart2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type MainTab = 'postes' | 'hotes' | 'alertes' | 'incidents' | 'vuln' | 'siem';
type DesktopTab = 'infos' | 'hardware' | 'logiciels';

interface Desktop {
  id: string; hostname: string; fqdn: string; os_name: string;
  os_version: string; os_family: string; arch: string;
  agent_version: string; status: string; last_seen_at: string;
  enrolled_at: string; tags: string[];
}

interface Host {
  id?: string; hostname?: string; ip?: string; fqdn?: string;
  type?: string; status?: string; os?: string; last_seen_at?: string;
  mac?: string; [key: string]: any;
}

interface Alert {
  id?: string; title?: string; severity?: string; status?: string;
  hostname?: string; description?: string; created_at?: string;
  updated_at?: string; type?: string; [key: string]: any;
}

interface Incident {
  id?: string; title?: string; status?: string; severity?: string;
  hostname?: string; description?: string; created_at?: string;
  updated_at?: string; [key: string]: any;
}

interface Vuln {
  id?: string; cve_id?: string; title?: string; severity?: string;
  cvss_score?: number; status?: string; hostname?: string;
  description?: string; published_at?: string; [key: string]: any;
}

interface SiemEvent {
  id?: string; event_type?: string; source?: string; hostname?: string;
  message?: string; severity?: string; timestamp?: string; [key: string]: any;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const SEV_CFG: Record<string, { bg: string; color: string; label: string }> = {
  critical: { bg: '#fef2f2', color: '#dc2626', label: 'Critique' },
  high:     { bg: '#fff7ed', color: '#ea580c', label: 'Élevé' },
  medium:   { bg: '#fefce8', color: '#ca8a04', label: 'Moyen' },
  low:      { bg: '#f0fdf4', color: '#16a34a', label: 'Faible' },
  info:     { bg: '#eff6ff', color: '#2563eb', label: 'Info' },
};
const sevCfg = (s?: string) => SEV_CFG[s?.toLowerCase() || ''] || { bg: '#f1f5f9', color: '#64748b', label: s || '—' };

const SevBadge = ({ s }: { s?: string }) => {
  const c = sevCfg(s);
  return <span style={{ background: c.bg, color: c.color, padding: '2px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700 }}>{c.label}</span>;
};

const StatusBadge = ({ status, map }: { status?: string; map?: Record<string, { bg: string; color: string; label: string }> }) => {
  const defaults: Record<string, { bg: string; color: string; label: string }> = {
    online:   { bg: '#dcfce7', color: '#16a34a', label: 'En ligne' },
    offline:  { bg: '#f1f5f9', color: '#94a3b8', label: 'Hors ligne' },
    open:     { bg: '#fef2f2', color: '#dc2626', label: 'Ouvert' },
    closed:   { bg: '#f0fdf4', color: '#16a34a', label: 'Fermé' },
    resolved: { bg: '#f0fdf4', color: '#16a34a', label: 'Résolu' },
    active:   { bg: '#fef2f2', color: '#dc2626', label: 'Actif' },
    fixed:    { bg: '#f0fdf4', color: '#16a34a', label: 'Corrigé' },
    patched:  { bg: '#f0fdf4', color: '#16a34a', label: 'Patché' },
  };
  const cfg = (map || defaults)[status?.toLowerCase() || ''] || { bg: '#f1f5f9', color: '#64748b', label: status || '—' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
};

const fmtDate = (d?: string) => d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDateShort = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <tr>
    <td style={{ padding: '6px 12px', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', fontSize: '0.78rem', borderBottom: '1px solid #f1f5f9', width: 180 }}>{label}</td>
    <td style={{ padding: '6px 12px', color: '#1e293b', fontSize: '0.78rem', borderBottom: '1px solid #f1f5f9', fontFamily: 'monospace', wordBreak: 'break-all' }}>{value ?? '—'}</td>
  </tr>
);

const SectionCard = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#f1f5f9', fontSize: '0.78rem', fontWeight: 700, color: '#334155', borderBottom: '1px solid #e2e8f0' }}>
      {icon}{title}
    </div>
    <div style={{ padding: '4px 0' }}>{children}</div>
  </div>
);

const EmptyState = ({ msg }: { msg: string }) => (
  <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>{msg}</div>
);

const LoadingRow = () => (
  <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>Chargement…</div>
);

// ─── Generic table ────────────────────────────────────────────────────────────
function GenericTable({ cols, rows, emptyMsg }: {
  cols: { key: string; label: string; render?: (row: any) => React.ReactNode; width?: number }[];
  rows: any[];
  emptyMsg: string;
}) {
  if (rows.length === 0) return <EmptyState msg={emptyMsg} />;
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
            {cols.map(c => (
              <th key={c.key} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: c.width }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              {cols.map(c => (
                <td key={c.key} style={{ padding: '8px 12px', color: '#1e293b' }}>
                  {c.render ? c.render(row) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, color, bg, border, active, onClick }: {
  label: string; value: number | string; icon: React.ReactNode;
  color: string; bg: string; border: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: bg, border: `1.5px solid ${active ? color : border}`,
        borderRadius: 10, padding: '10px 14px', cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left', outline: 'none', flex: 1, minWidth: 0,
        boxShadow: active ? `0 0 0 2px ${color}30` : 'none',
        transition: 'box-shadow .15s, border-color .15s',
      }}
    >
      <div style={{ color }}>{icon}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color, opacity: 0.75, marginTop: 2 }}>{label}</div>
      </div>
    </button>
  );
}

// ─── Search bar ───────────────────────────────────────────────────────────────
function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 7, marginBottom: 10 }}>
      <Search size={13} color="#94a3b8" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || 'Rechercher…'}
        style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.78rem', color: '#1e293b', background: 'transparent' }}
      />
      {value && <button onClick={() => onChange('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, lineHeight: 1 }}><X size={12} /></button>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const AdminInventaire: React.FC = () => {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  // ── Main tab ─────────────────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<MainTab>('postes');

  // ── Desktops ─────────────────────────────────────────────────────────────────
  const [desktops, setDesktops]           = useState<Desktop[]>([]);
  const [desktopsLoading, setDesktopsLoading] = useState(false);
  const [desktopsError, setDesktopsError] = useState<string | null>(null);
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [desktopTab, setDesktopTab]       = useState<DesktopTab>('infos');
  const [desktopSearch, setDesktopSearch] = useState('');
  const [hardware, setHardware]           = useState<any>(null);
  const [hwLoading, setHwLoading]         = useState(false);
  const [packages, setPackages]           = useState<any[]>([]);
  const [pkgLoading, setPkgLoading]       = useState(false);
  const [pkgSearch, setPkgSearch]         = useState('');

  // ── Hosts ─────────────────────────────────────────────────────────────────────
  const [hosts, setHosts]           = useState<Host[]>([]);
  const [hostsLoading, setHostsLoading] = useState(false);
  const [hostSearch, setHostSearch] = useState('');
  const [hostTypeFilter, setHostTypeFilter] = useState('all');

  // ── Alerts ────────────────────────────────────────────────────────────────────
  const [alerts, setAlerts]           = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertSearch, setAlertSearch] = useState('');
  const [alertSevFilter, setAlertSevFilter] = useState('all');
  const [alertStatusFilter, setAlertStatusFilter] = useState('all');

  // ── Incidents ────────────────────────────────────────────────────────────────
  const [incidents, setIncidents]     = useState<Incident[]>([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentSearch, setIncidentSearch] = useState('');
  const [incidentStatusFilter, setIncidentStatusFilter] = useState('all');

  // ── Vulns ─────────────────────────────────────────────────────────────────────
  const [vulns, setVulns]             = useState<Vuln[]>([]);
  const [vulnsLoading, setVulnsLoading] = useState(false);
  const [vulnSearch, setVulnSearch]   = useState('');
  const [vulnSevFilter, setVulnSevFilter] = useState('all');
  const [vulnStatusFilter, setVulnStatusFilter] = useState('all');

  // ── SIEM ──────────────────────────────────────────────────────────────────────
  const [siemEvents, setSiemEvents]   = useState<SiemEvent[]>([]);
  const [siemLoading, setSiemLoading] = useState(false);
  const [siemSearch, setSiemSearch]   = useState('');
  const [siemSevFilter, setSiemSevFilter] = useState('all');

  // ─── Fetchers ─────────────────────────────────────────────────────────────────
  const api = useCallback(async (path: string) => {
    const res = await axios.get(`/api/admin/inventaire/${path}`, { headers });
    if (!res.data.success) throw new Error(res.data.message || 'Erreur');
    return res.data.data;
  }, [headers]);

  const fetchDesktops = useCallback(async () => {
    setDesktopsLoading(true); setDesktopsError(null);
    try { setDesktops(await api('desktops') || []); }
    catch (e: any) { setDesktopsError(e.message); }
    finally { setDesktopsLoading(false); }
  }, [api]);

  const fetchHardware = useCallback(async (id: string) => {
    setHwLoading(true); setHardware(null);
    try { setHardware(await api(`desktops/${id}/hardware`)); }
    catch { setHardware(null); }
    finally { setHwLoading(false); }
  }, [api]);

  const fetchPackages = useCallback(async (id: string) => {
    setPkgLoading(true); setPackages([]);
    try { setPackages(await api(`desktops/${id}/packages`) || []); }
    catch { setPackages([]); }
    finally { setPkgLoading(false); }
  }, [api]);

  const fetchHosts = useCallback(async () => {
    setHostsLoading(true);
    try { setHosts(await api('hosts') || []); }
    catch { setHosts([]); }
    finally { setHostsLoading(false); }
  }, [api]);

  const fetchAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try { setAlerts(await api('alerts') || []); }
    catch { setAlerts([]); }
    finally { setAlertsLoading(false); }
  }, [api]);

  const fetchIncidents = useCallback(async () => {
    setIncidentsLoading(true);
    try { setIncidents(await api('incidents') || []); }
    catch { setIncidents([]); }
    finally { setIncidentsLoading(false); }
  }, [api]);

  const fetchVulns = useCallback(async () => {
    setVulnsLoading(true);
    try { setVulns(await api('vuln') || []); }
    catch { setVulns([]); }
    finally { setVulnsLoading(false); }
  }, [api]);

  const fetchSiem = useCallback(async () => {
    setSiemLoading(true);
    try { setSiemEvents(await api('siem') || []); }
    catch { setSiemEvents([]); }
    finally { setSiemLoading(false); }
  }, [api]);

  // Load on tab switch
  useEffect(() => { fetchDesktops(); fetchAlerts(); fetchVulns(); fetchIncidents(); }, []);

  useEffect(() => {
    if (mainTab === 'hotes' && hosts.length === 0) fetchHosts();
    if (mainTab === 'siem' && siemEvents.length === 0) fetchSiem();
  }, [mainTab]);

  // Desktop selection
  const selectDesktop = (id: string) => {
    setSelectedId(id); setDesktopTab('infos');
    setHardware(null); setPackages([]); setPkgSearch('');
    fetchHardware(id); fetchPackages(id);
  };

  // ─── Derived stats ────────────────────────────────────────────────────────────
  const onlineCount    = desktops.filter(d => d.status === 'online').length;
  const critAlerts     = alerts.filter(a => a.severity?.toLowerCase() === 'critical' && a.status?.toLowerCase() !== 'closed' && a.status?.toLowerCase() !== 'resolved').length;
  const openIncidents  = incidents.filter(i => i.status?.toLowerCase() === 'open' || i.status?.toLowerCase() === 'active').length;
  const openVulns      = vulns.filter(v => v.status?.toLowerCase() !== 'fixed' && v.status?.toLowerCase() !== 'patched' && v.status?.toLowerCase() !== 'closed').length;

  // ─── Filtered data ────────────────────────────────────────────────────────────
  const filteredDesktops = useMemo(() => desktops.filter(d =>
    !desktopSearch || d.hostname.toLowerCase().includes(desktopSearch.toLowerCase()) ||
    d.fqdn?.toLowerCase().includes(desktopSearch.toLowerCase()) ||
    d.os_name?.toLowerCase().includes(desktopSearch.toLowerCase())
  ), [desktops, desktopSearch]);

  const hostTypes = useMemo(() => ['all', ...Array.from(new Set(hosts.map(h => h.type || 'unknown')))], [hosts]);
  const filteredHosts = useMemo(() => hosts.filter(h =>
    (hostTypeFilter === 'all' || (h.type || 'unknown') === hostTypeFilter) &&
    (!hostSearch || (h.hostname || '').toLowerCase().includes(hostSearch.toLowerCase()) ||
      (h.ip || '').includes(hostSearch) || (h.fqdn || '').toLowerCase().includes(hostSearch.toLowerCase()))
  ), [hosts, hostSearch, hostTypeFilter]);

  const filteredAlerts = useMemo(() => alerts.filter(a =>
    (alertSevFilter === 'all' || a.severity?.toLowerCase() === alertSevFilter) &&
    (alertStatusFilter === 'all' || a.status?.toLowerCase() === alertStatusFilter) &&
    (!alertSearch || (a.title || '').toLowerCase().includes(alertSearch.toLowerCase()) ||
      (a.hostname || '').toLowerCase().includes(alertSearch.toLowerCase()) ||
      (a.description || '').toLowerCase().includes(alertSearch.toLowerCase()))
  ), [alerts, alertSearch, alertSevFilter, alertStatusFilter]);

  const filteredIncidents = useMemo(() => incidents.filter(i =>
    (incidentStatusFilter === 'all' || i.status?.toLowerCase() === incidentStatusFilter) &&
    (!incidentSearch || (i.title || '').toLowerCase().includes(incidentSearch.toLowerCase()) ||
      (i.hostname || '').toLowerCase().includes(incidentSearch.toLowerCase()))
  ), [incidents, incidentSearch, incidentStatusFilter]);

  const filteredVulns = useMemo(() => vulns.filter(v =>
    (vulnSevFilter === 'all' || v.severity?.toLowerCase() === vulnSevFilter) &&
    (vulnStatusFilter === 'all' || v.status?.toLowerCase() === vulnStatusFilter) &&
    (!vulnSearch || (v.cve_id || '').toLowerCase().includes(vulnSearch.toLowerCase()) ||
      (v.title || '').toLowerCase().includes(vulnSearch.toLowerCase()) ||
      (v.hostname || '').toLowerCase().includes(vulnSearch.toLowerCase()))
  ), [vulns, vulnSearch, vulnSevFilter, vulnStatusFilter]);

  const filteredSiem = useMemo(() => siemEvents.filter(e =>
    (siemSevFilter === 'all' || e.severity?.toLowerCase() === siemSevFilter) &&
    (!siemSearch || (e.event_type || '').toLowerCase().includes(siemSearch.toLowerCase()) ||
      (e.hostname || '').toLowerCase().includes(siemSearch.toLowerCase()) ||
      (e.message || '').toLowerCase().includes(siemSearch.toLowerCase()) ||
      (e.source || '').toLowerCase().includes(siemSearch.toLowerCase()))
  ), [siemEvents, siemSearch, siemSevFilter]);

  const filteredPkgs = useMemo(() => packages.filter(p =>
    !pkgSearch || p.name?.toLowerCase().includes(pkgSearch.toLowerCase()) ||
    p.version?.toLowerCase().includes(pkgSearch.toLowerCase())
  ), [packages, pkgSearch]);

  const selected = desktops.find(d => d.id === selectedId);

  // ─── Refresh current tab ──────────────────────────────────────────────────────
  const refreshTab = () => {
    const fn: Record<MainTab, () => void> = {
      postes: fetchDesktops, hotes: fetchHosts, alertes: fetchAlerts,
      incidents: fetchIncidents, vuln: fetchVulns, siem: fetchSiem,
    };
    fn[mainTab]?.();
  };

  // ─── Filter chips ─────────────────────────────────────────────────────────────
  const FilterChips = ({ values, current, onChange }: { values: string[]; current: string; onChange: (v: string) => void }) => (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
      {values.map(v => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '3px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
          border: current === v ? '2px solid #334155' : '1px solid #e2e8f0',
          background: current === v ? '#334155' : 'white',
          color: current === v ? 'white' : '#475569', cursor: 'pointer',
        }}>
          {v === 'all' ? 'Tous' : v.charAt(0).toUpperCase() + v.slice(1)}
        </button>
      ))}
    </div>
  );

  // ─── Tab bar ──────────────────────────────────────────────────────────────────
  const MAIN_TABS: { key: MainTab; label: string; icon: React.ReactNode; count?: number; warn?: boolean }[] = [
    { key: 'postes',    label: 'Postes',        icon: <Monitor size={14} />,       count: desktops.length },
    { key: 'hotes',     label: 'Hôtes réseau',  icon: <Globe size={14} />,         count: hosts.length },
    { key: 'alertes',   label: 'Alertes',       icon: <AlertTriangle size={14} />, count: alerts.length, warn: critAlerts > 0 },
    { key: 'incidents', label: 'Incidents',     icon: <Zap size={14} />,           count: incidents.length, warn: openIncidents > 0 },
    { key: 'vuln',      label: 'Vulnérabilités',icon: <Shield size={14} />,        count: vulns.length, warn: openVulns > 0 },
    { key: 'siem',      label: 'SIEM',          icon: <Activity size={14} />,      count: siemEvents.length },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, gap: 0 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottom: '1px solid #e8edf3', marginBottom: 16 }}>
        <div style={{ width: 34, height: 34, borderRadius: 7, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <BarChart2 size={16} />
        </div>
        <div>
          <h1 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#0f172a', margin: '0 0 2px' }}>Inventaire IRS</h1>
          <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: 0 }}>
            {desktops.length} poste{desktops.length !== 1 ? 's' : ''} · {hosts.length} hôte{hosts.length !== 1 ? 's' : ''} · {alerts.length} alerte{alerts.length !== 1 ? 's' : ''} · {vulns.length} CVE
          </p>
        </div>
        <button onClick={refreshTab} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
          <RefreshCw size={12} /> Actualiser
        </button>
      </div>

      {/* ── KPI Bar ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <KpiCard label="En ligne" value={onlineCount} icon={<Monitor size={18} />} color="#16a34a" bg="#f0fdf4" border="#bbf7d0"
          active={mainTab === 'postes'} onClick={() => setMainTab('postes')} />
        <KpiCard label="Alertes critiques" value={critAlerts} icon={<AlertTriangle size={18} />} color="#dc2626" bg="#fef2f2" border="#fecaca"
          active={mainTab === 'alertes'} onClick={() => { setMainTab('alertes'); setAlertSevFilter('critical'); }} />
        <KpiCard label="Incidents ouverts" value={openIncidents} icon={<Zap size={18} />} color="#ea580c" bg="#fff7ed" border="#fed7aa"
          active={mainTab === 'incidents'} onClick={() => { setMainTab('incidents'); setIncidentStatusFilter('open'); }} />
        <KpiCard label="CVE non corrigées" value={openVulns} icon={<Shield size={18} />} color="#7c3aed" bg="#f5f3ff" border="#ddd6fe"
          active={mainTab === 'vuln'} onClick={() => { setMainTab('vuln'); setVulnStatusFilter('all'); }} />
      </div>

      {/* ── Tab nav ── */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: 16, gap: 0 }}>
        {MAIN_TABS.map(t => (
          <button key={t.key} onClick={() => setMainTab(t.key)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', border: 'none', background: 'transparent',
            borderBottom: `2.5px solid ${mainTab === t.key ? 'var(--primary-color, #e30613)' : 'transparent'}`,
            color: mainTab === t.key ? 'var(--primary-color, #e30613)' : '#64748b',
            fontWeight: mainTab === t.key ? 700 : 500, fontSize: '0.8rem',
            cursor: 'pointer', marginBottom: -2, transition: 'color .15s',
          }}>
            {t.icon}
            {t.label}
            {(t.count ?? 0) > 0 && (
              <span style={{ background: t.warn ? '#fef2f2' : '#f1f5f9', color: t.warn ? '#dc2626' : '#64748b', borderRadius: 999, padding: '0 6px', fontSize: '0.68rem', fontWeight: 700 }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════ POSTES ══════════════════════ */}
      {mainTab === 'postes' && (
        <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
          {/* Sidebar list */}
          <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            <SearchBar value={desktopSearch} onChange={setDesktopSearch} placeholder="Rechercher un poste…" />
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
              {desktopsLoading && desktops.length === 0 && <LoadingRow />}
              {desktopsError && <div style={{ padding: 12, color: '#dc2626', fontSize: '0.78rem' }}>{desktopsError}</div>}
              {!desktopsLoading && filteredDesktops.length === 0 && !desktopsError && <EmptyState msg="Aucun poste trouvé" />}
              {filteredDesktops.map(d => (
                <div key={d.id} onClick={() => selectDesktop(d.id)} style={{
                  padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                  background: selectedId === d.id ? '#f0fdf4' : '#fff',
                  borderLeft: `3px solid ${d.status === 'online' ? '#16a34a' : 'transparent'}`,
                }}
                  onMouseEnter={e => { if (selectedId !== d.id) e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={e => { if (selectedId !== d.id) e.currentTarget.style.background = '#fff'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                    <Monitor size={13} color={d.status === 'online' ? '#16a34a' : '#94a3b8'} />
                    <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#0f172a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.hostname}</span>
                    <StatusBadge status={d.status} />
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', paddingLeft: 20 }}>{d.os_name} · {d.arch}</div>
                  {d.tags?.length > 0 && (
                    <div style={{ paddingLeft: 20, marginTop: 3, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {d.tags.map(tag => <span key={tag} style={{ background: '#eff6ff', color: '#2563eb', borderRadius: 4, padding: '0 5px', fontSize: '0.65rem', fontWeight: 600 }}>{tag}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center' }}>
              {filteredDesktops.length} / {desktops.length} poste{desktops.length !== 1 ? 's' : ''} · {onlineCount} en ligne
            </div>
          </div>

          {/* Detail panel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {!selected ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.82rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <div style={{ textAlign: 'center' }}>
                  <Monitor size={36} style={{ opacity: 0.2, marginBottom: 8 }} />
                  <div>Sélectionnez un poste</div>
                </div>
              </div>
            ) : (
              <>
                {/* Desktop header */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px 10px 0 0', padding: '12px 16px', borderBottom: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Monitor size={18} color={selected.status === 'online' ? '#16a34a' : '#94a3b8'} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{selected.hostname}</div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{selected.fqdn}</div>
                    </div>
                    <StatusBadge status={selected.status} />
                    {/* Alerte count for this host */}
                    {alerts.filter(a => a.hostname?.toLowerCase() === selected.hostname?.toLowerCase()).length > 0 && (
                      <span style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 6, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 }}>
                        ⚠ {alerts.filter(a => a.hostname?.toLowerCase() === selected.hostname?.toLowerCase()).length} alerte(s)
                      </span>
                    )}
                    {vulns.filter(v => v.hostname?.toLowerCase() === selected.hostname?.toLowerCase() && v.status?.toLowerCase() !== 'fixed').length > 0 && (
                      <span style={{ background: '#f5f3ff', color: '#7c3aed', borderRadius: 6, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 }}>
                        🛡 {vulns.filter(v => v.hostname?.toLowerCase() === selected.hostname?.toLowerCase() && v.status?.toLowerCase() !== 'fixed').length} CVE
                      </span>
                    )}
                  </div>
                </div>

                {/* Desktop sub-tabs */}
                <nav style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fff', paddingLeft: 12 }}>
                  {([
                    { key: 'infos', label: 'Infos', icon: <Server size={12} /> },
                    { key: 'hardware', label: 'Hardware', icon: <Cpu size={12} /> },
                    { key: 'logiciels', label: `Logiciels${packages.length > 0 ? ` (${packages.length})` : ''}`, icon: <Package size={12} /> },
                  ] as const).map(t => (
                    <button key={t.key} onClick={() => setDesktopTab(t.key)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '8px 12px', border: 'none',
                      borderBottom: `2px solid ${desktopTab === t.key ? '#16a34a' : 'transparent'}`,
                      background: 'transparent', color: desktopTab === t.key ? '#16a34a' : '#64748b',
                      fontSize: '0.78rem', fontWeight: desktopTab === t.key ? 700 : 500,
                      cursor: 'pointer', marginBottom: -1,
                    }}>
                      {t.icon}{t.label}
                    </button>
                  ))}
                </nav>

                {/* Content */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: 16, flex: 1, overflowY: 'auto' }}>
                  {desktopTab === 'infos' && (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        <InfoRow label="Hostname" value={selected.hostname} />
                        <InfoRow label="FQDN" value={selected.fqdn} />
                        <InfoRow label="Système" value={`${selected.os_name} ${selected.os_version}`} />
                        <InfoRow label="Architecture" value={selected.arch} />
                        <InfoRow label="Version agent" value={selected.agent_version} />
                        <InfoRow label="Statut" value={<StatusBadge status={selected.status} />} />
                        <InfoRow label="Dernière vue" value={fmtDate(selected.last_seen_at)} />
                        <InfoRow label="Enrôlé le" value={fmtDate(selected.enrolled_at)} />
                        <InfoRow label="Tags" value={selected.tags?.join(', ') || '—'} />
                      </tbody>
                    </table>
                  )}

                  {desktopTab === 'hardware' && (
                    hwLoading ? <LoadingRow /> :
                    !hardware ? <EmptyState msg="Aucune information hardware disponible" /> :
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {hardware.inventory?.cpu && (
                        <SectionCard title="Processeur" icon={<Cpu size={13} />}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                            <InfoRow label="Modèle" value={hardware.inventory.cpu.product} />
                            <InfoRow label="Fréquence" value={hardware.inventory.cpu.max_freq ? `${hardware.inventory.cpu.max_freq} MHz` : null} />
                            <InfoRow label="Cœurs physiques" value={hardware.inventory.cpu.cores} />
                            <InfoRow label="Cœurs logiques" value={hardware.inventory.cpu.logical_cores} />
                          </tbody></table>
                        </SectionCard>
                      )}
                      {hardware.inventory?.memory_slots?.length > 0 && (
                        <SectionCard title="Mémoire" icon={<HardDrive size={13} />}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                            {hardware.inventory.memory_slots.map((s: any, i: number) => (
                              <InfoRow key={i} label={`Slot ${i + 1}`} value={`${s.size_mb ? Math.round(s.size_mb / 1024) + ' Go' : '?'} ${s.type || ''} ${s.speed_mhz ? s.speed_mhz + ' MHz' : ''}`} />
                            ))}
                          </tbody></table>
                        </SectionCard>
                      )}
                      {hardware.inventory?.motherboard && (
                        <SectionCard title="Carte mère" icon={<Server size={13} />}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                            <InfoRow label="Modèle" value={hardware.inventory.motherboard.product} />
                            <InfoRow label="Série" value={hardware.inventory.motherboard.serial} />
                          </tbody></table>
                        </SectionCard>
                      )}
                      {hardware.inventory?.bios && (
                        <SectionCard title="BIOS" icon={<Clock size={13} />}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                            <InfoRow label="Version" value={hardware.inventory.bios.version} />
                            <InfoRow label="Date" value={hardware.inventory.bios.date} />
                          </tbody></table>
                        </SectionCard>
                      )}
                      {hardware.inventory?.disks?.length > 0 && (
                        <SectionCard title="Disques" icon={<HardDrive size={13} />}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                            {hardware.inventory.disks.map((d: any, i: number) => (
                              <InfoRow key={i} label={`Disque ${i + 1}`} value={`${d.product || ''}${d.size_bytes ? ` (${Math.round(d.size_bytes / 1e9)} Go)` : ''} ${d.type ? `· ${d.type}` : ''}`} />
                            ))}
                          </tbody></table>
                        </SectionCard>
                      )}
                      {hardware.inventory?.net_adapters?.length > 0 && (
                        <SectionCard title="Réseau" icon={<Wifi size={13} />}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                            {hardware.inventory.net_adapters.map((n: any, i: number) => (
                              <InfoRow key={i} label={n.name || `Interface ${i + 1}`} value={`${n.product || ''}${n.mac ? ` · ${n.mac}` : ''}${n.ipv4?.length ? ` · ${n.ipv4.join(', ')}` : ''}`} />
                            ))}
                          </tbody></table>
                        </SectionCard>
                      )}
                      {hardware.inventory?.monitors?.length > 0 && (
                        <SectionCard title="Moniteurs" icon={<Eye size={13} />}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                            {hardware.inventory.monitors.map((m: any, i: number) => (
                              <InfoRow key={i} label={`Écran ${i + 1}`} value={`${m.product || ''}${m.resolution ? ` · ${m.resolution}` : ''}`} />
                            ))}
                          </tbody></table>
                        </SectionCard>
                      )}
                      {hardware.inventory?.last_logon && (
                        <SectionCard title="Dernier utilisateur" icon={<User size={13} />}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                            <InfoRow label="Utilisateur" value={hardware.inventory.last_logon.username} />
                            <InfoRow label="Connexion" value={fmtDate(hardware.inventory.last_logon.last_seen)} />
                          </tbody></table>
                        </SectionCard>
                      )}
                      {hardware.collected_at && (
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'right' }}>Collecté le {fmtDate(hardware.collected_at)}</div>
                      )}
                    </div>
                  )}

                  {desktopTab === 'logiciels' && (
                    <>
                      <SearchBar value={pkgSearch} onChange={setPkgSearch} placeholder="Rechercher un logiciel…" />
                      {pkgLoading ? <LoadingRow /> :
                        filteredPkgs.length === 0 ? <EmptyState msg={packages.length === 0 ? 'Aucun logiciel' : 'Aucun résultat'} /> :
                        <GenericTable
                          cols={[
                            { key: 'name', label: 'Logiciel' },
                            { key: 'version', label: 'Version', width: 140 },
                            { key: 'arch', label: 'Arch', width: 80 },
                            { key: 'update_available', label: 'MàJ dispo', width: 100, render: row => (
                              <span style={{ color: row.update_available ? '#dc2626' : '#94a3b8', fontWeight: row.update_available ? 700 : 400 }}>
                                {row.update_available ? '● Oui' : 'Non'}
                              </span>
                            )},
                          ]}
                          rows={filteredPkgs}
                          emptyMsg="Aucun logiciel"
                        />
                      }
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════ HÔTES ══════════════════════ */}
      {mainTab === 'hotes' && (
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200 }}><SearchBar value={hostSearch} onChange={setHostSearch} placeholder="IP, hostname, FQDN…" /></div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <Filter size={12} color="#94a3b8" />
              <FilterChips values={hostTypes} current={hostTypeFilter} onChange={setHostTypeFilter} />
            </div>
          </div>
          {hostsLoading ? <LoadingRow /> : (
            <GenericTable
              cols={[
                { key: 'hostname', label: 'Hostname', render: r => r.hostname || '—' },
                { key: 'ip', label: 'IP', width: 130 },
                { key: 'fqdn', label: 'FQDN' },
                { key: 'type', label: 'Type', width: 110, render: r => r.type || '—' },
                { key: 'os', label: 'OS' },
                { key: 'status', label: 'Statut', width: 100, render: r => <StatusBadge status={r.status} /> },
                { key: 'last_seen_at', label: 'Dernière vue', width: 140, render: r => fmtDateShort(r.last_seen_at) },
              ]}
              rows={filteredHosts}
              emptyMsg="Aucun hôte trouvé"
            />
          )}
          <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#94a3b8' }}>{filteredHosts.length} / {hosts.length} hôte{hosts.length !== 1 ? 's' : ''}</div>
        </div>
      )}

      {/* ══════════════════════ ALERTES ══════════════════════ */}
      {mainTab === 'alertes' && (
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 200 }}><SearchBar value={alertSearch} onChange={setAlertSearch} placeholder="Titre, machine, description…" /></div>
          </div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Sévérité :</span>
              <FilterChips values={['all', 'critical', 'high', 'medium', 'low']} current={alertSevFilter} onChange={setAlertSevFilter} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Statut :</span>
              <FilterChips values={['all', 'open', 'active', 'resolved', 'closed']} current={alertStatusFilter} onChange={setAlertStatusFilter} />
            </div>
          </div>
          {alertsLoading ? <LoadingRow /> : (
            <GenericTable
              cols={[
                { key: 'severity', label: 'Sév.', width: 90, render: r => <SevBadge s={r.severity} /> },
                { key: 'title', label: 'Titre', render: r => <span style={{ fontWeight: 600 }}>{r.title || '—'}</span> },
                { key: 'hostname', label: 'Machine', width: 150 },
                { key: 'type', label: 'Type', width: 110 },
                { key: 'status', label: 'Statut', width: 100, render: r => <StatusBadge status={r.status} /> },
                { key: 'created_at', label: 'Date', width: 130, render: r => fmtDateShort(r.created_at) },
              ]}
              rows={filteredAlerts}
              emptyMsg="Aucune alerte"
            />
          )}
          <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#94a3b8' }}>{filteredAlerts.length} / {alerts.length} alerte{alerts.length !== 1 ? 's' : ''} · {critAlerts} critique{critAlerts !== 1 ? 's' : ''}</div>
        </div>
      )}

      {/* ══════════════════════ INCIDENTS ══════════════════════ */}
      {mainTab === 'incidents' && (
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 200 }}><SearchBar value={incidentSearch} onChange={setIncidentSearch} placeholder="Titre, machine…" /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Statut :</span>
            <FilterChips values={['all', 'open', 'active', 'closed', 'resolved']} current={incidentStatusFilter} onChange={setIncidentStatusFilter} />
          </div>
          {incidentsLoading ? <LoadingRow /> : (
            <GenericTable
              cols={[
                { key: 'severity', label: 'Sév.', width: 90, render: r => <SevBadge s={r.severity} /> },
                { key: 'title', label: 'Titre', render: r => <div>
                  <div style={{ fontWeight: 600 }}>{r.title || '—'}</div>
                  {r.description && <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>{r.description.substring(0, 120)}{r.description.length > 120 ? '…' : ''}</div>}
                </div>},
                { key: 'hostname', label: 'Machine', width: 150 },
                { key: 'status', label: 'Statut', width: 100, render: r => <StatusBadge status={r.status} /> },
                { key: 'created_at', label: 'Ouvert le', width: 130, render: r => fmtDateShort(r.created_at) },
                { key: 'updated_at', label: 'Mis à jour', width: 130, render: r => fmtDateShort(r.updated_at) },
              ]}
              rows={filteredIncidents}
              emptyMsg="Aucun incident"
            />
          )}
          <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#94a3b8' }}>{filteredIncidents.length} / {incidents.length} incident{incidents.length !== 1 ? 's' : ''} · {openIncidents} ouvert{openIncidents !== 1 ? 's' : ''}</div>
        </div>
      )}

      {/* ══════════════════════ VULNÉRABILITÉS ══════════════════════ */}
      {mainTab === 'vuln' && (
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 200 }}><SearchBar value={vulnSearch} onChange={setVulnSearch} placeholder="CVE, titre, machine…" /></div>
          </div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Sévérité :</span>
              <FilterChips values={['all', 'critical', 'high', 'medium', 'low']} current={vulnSevFilter} onChange={setVulnSevFilter} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Statut :</span>
              <FilterChips values={['all', 'open', 'fixed', 'patched']} current={vulnStatusFilter} onChange={setVulnStatusFilter} />
            </div>
          </div>
          {vulnsLoading ? <LoadingRow /> : (
            <GenericTable
              cols={[
                { key: 'severity', label: 'Sév.', width: 90, render: r => <SevBadge s={r.severity} /> },
                { key: 'cve_id', label: 'CVE', width: 140, render: r => r.cve_id ? (
                  <a href={`https://nvd.nist.gov/vuln/detail/${r.cve_id}`} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none', fontFamily: 'monospace' }}>
                    {r.cve_id}
                  </a>
                ) : '—' },
                { key: 'title', label: 'Description', render: r => <div>
                  <div style={{ fontWeight: 600 }}>{r.title || r.description || '—'}</div>
                </div>},
                { key: 'cvss_score', label: 'CVSS', width: 70, render: r => r.cvss_score != null ? (
                  <span style={{ fontWeight: 700, color: r.cvss_score >= 9 ? '#dc2626' : r.cvss_score >= 7 ? '#ea580c' : r.cvss_score >= 4 ? '#ca8a04' : '#16a34a', fontFamily: 'monospace' }}>
                    {r.cvss_score.toFixed(1)}
                  </span>
                ) : '—' },
                { key: 'hostname', label: 'Machine', width: 150 },
                { key: 'status', label: 'Statut', width: 100, render: r => <StatusBadge status={r.status} /> },
                { key: 'published_at', label: 'Publié', width: 110, render: r => fmtDateShort(r.published_at) },
              ]}
              rows={filteredVulns}
              emptyMsg="Aucune vulnérabilité"
            />
          )}
          <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#94a3b8' }}>{filteredVulns.length} / {vulns.length} CVE · {openVulns} non corrigée{openVulns !== 1 ? 's' : ''}</div>
        </div>
      )}

      {/* ══════════════════════ SIEM ══════════════════════ */}
      {mainTab === 'siem' && (
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 200 }}><SearchBar value={siemSearch} onChange={setSiemSearch} placeholder="Type, machine, message, source…" /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Sévérité :</span>
            <FilterChips values={['all', 'critical', 'high', 'medium', 'low', 'info']} current={siemSevFilter} onChange={setSiemSevFilter} />
          </div>
          {siemLoading ? <LoadingRow /> : (
            <GenericTable
              cols={[
                { key: 'timestamp', label: 'Horodatage', width: 140, render: r => <span style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{fmtDate(r.timestamp)}</span> },
                { key: 'severity', label: 'Sév.', width: 80, render: r => <SevBadge s={r.severity} /> },
                { key: 'event_type', label: 'Type', width: 120 },
                { key: 'hostname', label: 'Machine', width: 140 },
                { key: 'source', label: 'Source', width: 120 },
                { key: 'message', label: 'Message', render: r => <span style={{ fontSize: '0.75rem' }}>{r.message || '—'}</span> },
              ]}
              rows={filteredSiem}
              emptyMsg="Aucun événement SIEM"
            />
          )}
          <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#94a3b8' }}>{filteredSiem.length} / {siemEvents.length} événement{siemEvents.length !== 1 ? 's' : ''}</div>
        </div>
      )}
    </div>
  );
};

export default AdminInventaire;
