import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { RefreshCw, Search, X } from 'lucide-react';

// Consultation des données de Studio IRS (lecture seule, administrateurs). Rien n'est stocké dans AppDSI.
type Row = Record<string, unknown>;

const TABS: { key: string; label: string; columns?: string[] }[] = [
  { key: 'dashboard/summary', label: 'Synthèse' },
  { key: 'desktops', label: 'Postes Windows', columns: ['hostname', 'display_name', 'os_name', 'os_version', 'status', 'last_seen_at', 'agent_version', 'tags'] },
  { key: 'hosts', label: 'Hôtes', columns: ['hostname', 'display_name', 'os_name', 'os_version', 'status', 'last_seen_at', 'agent_version', 'tags'] },
  { key: 'alerts', label: 'Alertes', columns: ['fired_at', 'severity', 'state', 'hostname', 'rule_name', 'message'] },
  { key: 'incidents', label: 'Incidents', columns: ['created_at', 'severity', 'status', 'title', 'assigned_login'] },
  { key: 'patches', label: 'Logiciels', columns: ['hostname', 'name', 'version', 'update_available', 'new_version'] },
  { key: 'vuln', label: 'Vulnérabilités' },
  { key: 'siem/events', label: 'SIEM', columns: ['occurred_at', 'severity', 'hostname', 'rule_name', 'description', 'users'] },
  { key: 'health-checks', label: 'Checks applicatifs', columns: ['name', 'type', 'target', 'current_status', 'last_checked_at', 'enabled'] },
  { key: 'network-checks', label: 'Checks réseau', columns: ['name', 'type', 'target', 'current_status', 'last_checked_at', 'enabled'] },
];

const LABELS: Record<string, string> = {
  hostname: 'Machine', display_name: 'Nom affiché', fqdn: 'Nom complet', os_family: 'Famille', os_name: 'Système', os_version: 'Version système',
  arch: 'Architecture', status: 'Statut', last_seen_at: 'Vu le', enrolled_at: 'Enrôlé le', agent_version: 'Agent', tags: 'Étiquettes',
  fired_at: 'Déclenchée le', resolved_at: 'Résolue le', acknowledged_at: 'Acquittée le', severity: 'Sévérité', state: 'État', rule_name: 'Règle',
  message: 'Message', value: 'Valeur', created_at: 'Créé le', updated_at: 'Modifié le', closed_at: 'Clos le', title: 'Titre',
  description: 'Description', assigned_login: 'Assigné à', name: 'Nom', version: 'Version', update_available: 'Mise à jour dispo',
  new_version: 'Nouvelle version', installed_at: 'Installé le', occurred_at: 'Date', users: 'Utilisateurs', type: 'Type', target: 'Cible',
  current_status: 'État', last_checked_at: 'Vérifié le', enabled: 'Actif',
};

const MAX_ROWS = 200;
const label = (k: string) => LABELS[k] || k.replace(/_/g, ' ');

function format(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'string') return /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v).toLocaleString('fr-FR') : v;
  if (Array.isArray(v) && v.every(x => typeof x !== 'object')) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Affiche n'importe quelle réponse : tableau pour une liste d'objets, fiche clé / valeur sinon. */
function Tree({ data }: { data: unknown }) {
  if (data === null || typeof data !== 'object') return <>{format(data)}</>;
  if (Array.isArray(data)) {
    if (!data.length) return <>—</>;
    if (typeof data[0] !== 'object') return <>{format(data)}</>;
    return <Table rows={data as Row[]} />;
  }
  return (
    <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
      <tbody>
        {Object.entries(data as Row).map(([k, v]) => (
          <tr key={k}>
            <th style={{ ...th, verticalAlign: 'top' }}>{label(k)}</th>
            <td style={td}><Tree data={v} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Table({ rows, columns, onSelect }: { rows: Row[]; columns?: string[]; onSelect?: (r: Row) => void }) {
  // Colonnes prévues présentes dans les données ; à défaut, tous les champs simples du premier élément.
  const known = (columns || []).filter(c => rows.some(r => c in r));
  const cols = known.length ? known : Object.keys(rows[0] || {}).filter(k => k !== 'id' && !k.endsWith('_id') && (typeof rows[0][k] !== 'object' || rows[0][k] === null));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr>{cols.map(c => <th key={c} style={th}>{label(c)}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, MAX_ROWS).map((r, i) => (
            <tr key={String(r.id ?? i)} onClick={onSelect && (() => onSelect(r))} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
              {cols.map(c => <td key={c} style={td}>{format(r[c])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > MAX_ROWS && <div style={hint}>{MAX_ROWS} premières lignes sur {rows.length} : précisez la recherche.</div>}
    </div>
  );
}

const get = async (url: string) => (await axios.get(`/api/infra/studio-irs/${url}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })).data;
const errorText = (e: unknown) => (axios.isAxiosError(e) && e.response?.data?.message) || 'Lecture impossible.';

export default function StudioIrsBrowser() {
  const [tab, setTab] = useState(TABS[0]);
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Row | null>(null);
  const [detail, setDetail] = useState<{ kind: string; data: unknown; error?: string } | null>(null);
  // Une réponse arrivée après un changement d'onglet ou de ligne est ignorée.
  const loadSeq = useRef(0);
  const detailSeq = useRef(0);

  const load = useCallback(async (key: string) => {
    const seq = ++loadSeq.current;
    setLoading(true); setError(''); setData(null);
    try {
      const d = await get(`browse/${key}`);
      if (seq === loadSeq.current) setData(d);
    } catch (e) {
      if (seq === loadSeq.current) setError(errorText(e));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(tab.key); }, [tab, load]);

  const select = (row: Row | null) => { detailSeq.current++; setSelected(row); setDetail(null); };

  const openDetail = async (kind: string) => {
    const seq = ++detailSeq.current;
    setDetail({ kind, data: null });
    try {
      const d = await get(`desktops/${selected?.id}/${kind}`);
      if (seq === detailSeq.current) setDetail({ kind, data: d });
    } catch (e) {
      if (seq === detailSeq.current) setDetail({ kind, data: null, error: errorText(e) });
    }
  };

  const rows = Array.isArray(data) ? (data as Row[]) : null;
  const q = query.trim().toLowerCase();
  const found = rows?.filter(r => !q || Object.values(r).some(v => format(v).toLowerCase().includes(q)));

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t); setQuery(''); select(null); }}
            style={{ ...btn, ...(t.key === tab.key ? { background: '#0f172a', color: '#fff', border: '1.5px solid #0f172a' } : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {rows && (
            <>
              <Search size={16} color="#94a3b8" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher…" style={inp} />
              <span style={hint}>{found?.length} / {rows.length}</span>
            </>
          )}
          <button onClick={() => load(tab.key)} disabled={loading} style={{ ...btn, marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <RefreshCw size={14} /> Actualiser
          </button>
        </div>
        {tab.key === 'vuln' || tab.key === 'siem/events' ? <div style={{ ...hint, marginBottom: 8 }}>L'API Studio IRS renvoie au plus 500 éléments : la recherche porte sur ceux-là.</div> : null}
        {loading && <div style={hint}>Chargement…</div>}
        {error && <div style={err}>{error}</div>}
        {found && (found.length
          ? <Table rows={found} columns={tab.columns} onSelect={select} />
          : <div style={hint}>Aucun élément.</div>)}
        {!rows && data !== null && <Tree data={data} />}
      </div>

      {selected && (
        <div onClick={() => select(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2100, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 720, maxWidth: '100%', background: '#fff', padding: 20, overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong>{format(selected.display_name || selected.hostname || selected.title || selected.name || selected.rule_name || 'Détail')}</strong>
              <button onClick={() => select(null)} style={btn} aria-label="Fermer"><X size={14} /></button>
            </div>
            {tab.key === 'desktops' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={() => openDetail('packages')} style={btn}>Logiciels installés</button>
                <button onClick={() => openDetail('hardware')} style={btn}>Matériel</button>
              </div>
            )}
            {detail && (
              <div style={{ marginBottom: 18 }}>
                {detail.error ? <div style={err}>{detail.error}</div>
                  : detail.data === null ? <div style={hint}>Chargement…</div>
                    : <Tree data={detail.data} />}
              </div>
            )}
            <Tree data={selected} />
          </div>
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e9eef5', borderRadius: 14, padding: 16 };
const btn: React.CSSProperties = { padding: '7px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#334155', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const inp: React.CSSProperties = { padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', width: 280 };
const th: React.CSSProperties = { textAlign: 'left', padding: '7px 10px', borderBottom: '1px solid #e2e8f0', fontSize: 11, textTransform: 'uppercase', color: '#64748b', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid #f1f5f9', color: '#0f172a', verticalAlign: 'top', maxWidth: 420, overflowWrap: 'anywhere' };
const hint: React.CSSProperties = { fontSize: 12, color: '#94a3b8' };
const err: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontSize: 13 };
