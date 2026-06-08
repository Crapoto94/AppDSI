import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import {
  Server, Search, X, RefreshCw, CheckCircle2,
} from 'lucide-react';

const C = { blue: '#2563eb', slate: '#64748b', green: '#059669', amber: '#d97706', red: '#dc2626', bg: '#f1f5f9', card: '#fff', border: '#e2e8f0', text: '#0f172a' };

const AdView: React.FC = () => {
  const { token } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [sortCol, setSortCol] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ running: boolean; total: number; current: number; step: string; error: string | null } | null>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const limit = 50;

  const loadData = useCallback(async (p?: number, qry?: string, col?: string, dir?: string) => {
    setLoading(true);
    try {
      const pg = p ?? page;
      const r = await axios.get('/api/parc/ad/computers', {
        params: { q: qry ?? q, page: pg, limit, sort: col ?? sortCol, order: dir ?? sortDir },
        headers: { Authorization: `Bearer ${token}` }
      });
      setRows(r.data.rows);
      setTotal(r.data.total);
    } catch (e: any) {
      console.error('Erreur chargement AD computers:', e);
    } finally { setLoading(false); }
  }, [q, page, sortCol, sortDir, token]);

  useEffect(() => { loadData(1); }, []);

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
      setSortDir(d); loadData(page, q, col, d);
    } else {
      setSortCol(col); setSortDir('asc'); loadData(page, q, col, 'asc');
    }
  };

  const sortArrow = (col: string) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const pageCount = Math.ceil(total / limit);

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return d; }
  };

  const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: '.78rem', fontWeight: 700, color: C.slate, borderBottom: `2px solid ${C.border}`, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' as const };

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
        {total > 0 && (
          <span style={{ fontSize: '.82rem', color: C.slate }}>
            {total} ordinateur{total > 1 ? 's' : ''}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <input type="text" value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setPage(1); loadData(1, e.currentTarget.value); } }}
          placeholder="Rechercher…" style={{
            padding: '7px 12px', border: `1px solid ${C.border}`, borderRadius: 8,
            fontSize: '.85rem', outline: 'none', width: 220
          }} />
        <button onClick={() => { setPage(1); loadData(1); }}
          style={{ background: C.slate, border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', color: '#fff' }}>
          <Search size={15} />
        </button>
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

      {/* Tableau */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.slate }}>
          <RefreshCw size={28} className="spin" style={{ marginBottom: 12 }} />
          <div>Chargement…</div>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.slate, fontSize: '.9rem' }}>
          <Server size={40} style={{ marginBottom: 12, opacity: .3 }} />
          <div>Aucun ordinateur importé. Cliquez sur <b>Importer AD</b> pour synchroniser l'Active Directory.</div>
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' as const, borderRadius: 10, border: `1px solid ${C.border}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.83rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={th} onClick={() => toggleSort('name')}>Nom{sortArrow('name')}</th>
                  <th style={{ ...th, cursor: 'default' }}>SAM Account</th>
                  <th style={{ ...th, cursor: 'default' }}>IP</th>
                  <th style={{ ...th, cursor: 'default' }}>OS</th>
                  <th style={th} onClick={() => toggleSort('lastlogon')}>Dernière connexion{sortArrow('lastlogon')}</th>
                  <th style={{ ...th, cursor: 'default' }}>Dernier utilisateur</th>
                  <th style={{ ...th, cursor: 'default' }}>OU</th>
                  <th style={th} onClick={() => toggleSort('enabled')}>État{sortArrow('enabled')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{row.name || row.cn || '—'}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '.79rem' }}>{row.samaccountname || '—'}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '.79rem' }}>{row.ipaddress || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: '.79rem' }}>
                      {row.operatingsystem ? (
                        <span title={row.osversion || ''}>
                          {row.operatingsystem} {row.osversion ? `(${row.osversion})` : ''}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', fontSize: '.79rem', color: C.slate }}>{fmtDate(row.lastlogon)}</td>
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
