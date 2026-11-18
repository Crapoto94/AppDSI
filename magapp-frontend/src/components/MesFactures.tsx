import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Search, Share2, Trash2, Receipt, Loader2, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import logoDsiHub from '../assets/DSI.png';

// BETA « Mes factures » : factures SEDIT que l'agent a le droit de voir (droits DROITSER), avec service fait et DGP.
// Un agent peut donner accès à ses factures à un autre agent : le bénéficiaire voit ce que le donneur voit, EN DIRECT
// (si les droits du donneur changent dans SEDIT, ceux du bénéficiaire suivent).

interface Row {
  roo: string; num: string; num_fournisseur: string; libelle: string; date: string; montant: number; tiers: string; service: string; budget: string;
  etat: 'recue' | 'rapprochee' | 'service_fait' | 'mandatee' | 'refusee'; service_fait: boolean; service_fait_date: string | null; rejetee: boolean;
  workflow: string | null; dgp: number | null; dgp_definitif: boolean; via: string[];
}
interface Stats { nb_factures: number; nb_payees: number; nb_non_payees: number; dgp_moyen: number | null; nb_hors_delai: number; nb_prov_hors_delai: number; taux_dans_delai: number | null }
interface ListData { rows: Row[]; total: number; stats: Stats | null; a_traiter: number; year: number; sources: { key: string; label: string }[] }
interface Access { allowed: boolean; canShare: boolean; sources: { key: string; label: string; nb_services: number; inactive: boolean }[]; received: { key: string; name: string }[] }
interface Shares { given: { id: number; shared_username: string; shared_name: string; shared_email: string; created_at: string }[]; received: { id: number; owner_username: string; owner_name: string }[] }
interface AgentHit { username: string; displayName: string; email: string; service: string }

const API = '/api/magapp/mes-factures';
const authHeaders = (): Record<string, string> => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });
const jsonHeaders = (): Record<string, string> => ({ ...authHeaders(), 'Content-Type': 'application/json' });
const fmtMoney = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtDate = (d: string) => (d ? d.split('-').reverse().join('/') : '');

const ETATS: Record<Row['etat'], { label: string; color: string; bg: string }> = {
  recue: { label: 'Reçue', color: '#475569', bg: '#f1f5f9' },
  rapprochee: { label: 'Rapprochée', color: '#0e7490', bg: '#cffafe' },
  service_fait: { label: 'Service fait', color: '#1e40af', bg: '#dbeafe' },
  mandatee: { label: 'Mandatée', color: '#047857', bg: '#d1fae5' },
  refusee: { label: 'Rejetée', color: '#b91c1c', bg: '#fee2e2' },
};

const s: Record<string, React.CSSProperties> = {
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.9rem 1.1rem' },
  input: { padding: '0.45rem 0.7rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.88rem', boxSizing: 'border-box', background: '#fff', color: '#1e293b' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.88rem' },
  th: { textAlign: 'left', padding: '0.5rem', fontSize: '0.72rem', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#fff' },
  td: { padding: '0.5rem', fontSize: '0.84rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' },
};

const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: string; color?: string }> = ({ label, value, sub, color = '#0f172a' }) => (
  <div style={{ ...s.card, flex: '1 1 150px' }}>
    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{value}</div>
    {sub && <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{sub}</div>}
  </div>
);

// ───────── Partage d'accès ─────────
const ShareDialog: React.FC<{ canShare: boolean; onClose: () => void; onChanged: () => void }> = ({ canShare, onClose, onChanged }) => {
  const [shares, setShares] = useState<Shares | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<AgentHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const seq = useRef(0);

  const load = useCallback(() => { fetch(`${API}/shares`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : null)).then(setShares).catch(() => {}); }, []);
  useEffect(load, [load]);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setHits([]); return; }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/agents/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
        const d: AgentHit[] = r.ok ? await r.json() : [];
        if (id === seq.current) setHits(d.filter(a => a.username).slice(0, 8));
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const add = async (a: AgentHit) => {
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${API}/shares`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ username: a.username, displayName: a.displayName, email: a.email }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || 'Erreur');
      setShares(d); setQ(''); setHits([]); onChanged();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async (id: number) => {
    const r = await fetch(`${API}/shares/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (r.ok) { setShares(await r.json()); onChanged(); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', zIndex: 2300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(620px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: '1.2rem 1.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Share2 size={20} color="#0f766e" /><strong style={{ flex: 1, fontSize: '1.05rem' }}>Partager mes factures</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
          L'agent choisi verra <strong>les mêmes factures que vous</strong>. L'accès suit <strong>vos droits SEDIT en direct</strong> : si vos droits changent, les siens changent aussi.
          Il ne peut pas repartager à son tour. Vous pouvez retirer l'accès à tout moment.
        </p>
        {canShare ? (
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
            <input style={{ ...s.input, width: '100%', paddingLeft: 32 }} placeholder="Rechercher un agent (nom, prénom, identifiant)…" value={q} onChange={e => setQ(e.target.value)} disabled={busy} />
            {hits.length > 0 && (
              <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, top: 42, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxHeight: 280, overflowY: 'auto' }}>
                {hits.map(a => (
                  <div key={a.username} onClick={() => add(a)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')} onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                    <strong>{a.displayName}</strong> <span style={{ color: '#64748b' }}>— {a.username}{a.service ? ` · ${a.service}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : <div style={{ ...s.card, background: '#fffbeb', borderColor: '#f59e0b', color: '#78350f', fontSize: '0.85rem', marginBottom: 14 }}>Seul un agent ayant ses propres droits SEDIT peut partager ses factures.</div>}
        {err && <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 8 }}>{err}</div>}

        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 6 }}>Agents ayant accès à mes factures</div>
        {!shares ? <Loader2 size={18} /> : shares.given.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 12 }}>Personne pour le moment.</div> : (
          <div style={{ marginBottom: 14 }}>
            {shares.given.map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.88rem' }}>
                <span style={{ flex: 1 }}><strong>{g.shared_name}</strong> <span style={{ color: '#94a3b8' }}>({g.shared_username})</span></span>
                <button title="Retirer l'accès" onClick={() => remove(g.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}
        {shares && shares.received.length > 0 && (
          <>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 6 }}>Accès que l'on m'a donnés</div>
            {shares.received.map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.88rem' }}>
                <span style={{ flex: 1 }}>Factures de <strong>{g.owner_name}</strong></span>
                <button title="Décliner cet accès" onClick={() => remove(g.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={16} /></button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

// ───────── Composant principal ─────────
export default function MesFactures({ onClose, beta = false }: { onClose: () => void; beta?: boolean }) {
  const thisYear = new Date().getFullYear();
  const [access, setAccess] = useState<Access | null>(null);
  const [year, setYear] = useState(thisYear);
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [sf, setSf] = useState<'' | 'todo' | 'done'>('');
  const [scope, setScope] = useState('all');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const LIMIT = 50;

  const loadAccess = useCallback(() => { fetch(`${API}/access`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : null)).then(setAccess).catch(() => {}); }, []);
  useEffect(loadAccess, [loadAccess]);

  useEffect(() => { const t = setTimeout(() => { setSearchApplied(search); setOffset(0); }, 400); return () => clearTimeout(t); }, [search]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    const qs = new URLSearchParams({ year: String(year), limit: String(LIMIT), offset: String(offset), scope });
    if (searchApplied) qs.set('search', searchApplied);
    if (sf) qs.set('sf', sf);
    fetch(`${API}?${qs}`, { headers: authHeaders() })
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'SEDIT indisponible'); return r.json(); })
      .then(d => { if (alive) setData(d); })
      .catch((e: Error) => { if (alive) { setData(null); setError(e.message); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [year, searchApplied, sf, scope, offset]);

  const total = data?.total || 0;
  const st = data?.stats;
  const dgpColor = (r: Row) => (r.dgp == null ? '#94a3b8' : r.dgp > 30 ? '#dc2626' : r.dgp > 20 ? '#d97706' : '#16a34a');
  const multiSource = (access?.sources.length || 0) > 1;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(4px)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ background: '#f8fafc', width: 'min(1400px, 100%)', height: '94vh', borderRadius: 20, boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <div style={{ width: 40, height: 40, background: '#ccfbf1', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Receipt size={22} color="#0f766e" /></div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#1e293b' }}>Mes factures</h2>
          {beta && <span style={{ background: '#f59e0b', color: '#1e293b', fontSize: '0.6rem', fontWeight: 800, padding: '2px 6px', borderRadius: 6, letterSpacing: '0.05em' }}>BETA</span>}
          <span style={{ flex: 1 }} />
          <button style={{ ...s.btn, background: '#0f766e' }} onClick={() => setShowShare(true)} title="Donner accès à mes factures à un autre agent"><Share2 size={16} /> Partager mes factures</button>
          <img src={logoDsiHub} alt="DSI" style={{ height: 46, marginLeft: 4 }} />
          <button onClick={() => setShowHelp(true)} title="Aide" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: 10, borderRadius: 10, color: '#475569', cursor: 'pointer', display: 'flex' }}><HelpCircle size={20} /></button>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={20} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Résumé DGP du périmètre */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Stat label={`Factures ${year}`} value={st ? st.nb_factures : '—'} sub="dans mon périmètre" />
            <Stat label="DGP moyen (payées)" value={st && st.dgp_moyen != null ? `${st.dgp_moyen} j` : '—'} sub="réception → paiement" color={st && st.dgp_moyen != null && st.dgp_moyen > 30 ? '#dc2626' : '#16a34a'} />
            <Stat label="Payées dans les 30 j" value={st && st.taux_dans_delai != null ? `${st.taux_dans_delai} %` : '—'} sub={st ? `${st.nb_hors_delai} hors délai sur ${st.nb_payees} payées` : ''} color={st && st.taux_dans_delai != null && st.taux_dans_delai < 90 ? '#d97706' : '#16a34a'} />
            <Stat label="En cours de paiement" value={st ? st.nb_non_payees : '—'} sub={st && st.nb_prov_hors_delai ? `dont ${st.nb_prov_hors_delai} déjà > 30 j` : 'DGP provisoire'} color={st && st.nb_prov_hors_delai ? '#d97706' : '#0f172a'} />
            <Stat label="Service fait à traiter" value={data ? data.a_traiter : '—'} sub="non rejetées, SF non validé" color={data && data.a_traiter ? '#d97706' : '#16a34a'} />
          </div>

          {/* Filtres */}
          <div style={{ ...s.card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 220px' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
              <input style={{ ...s.input, width: '100%', paddingLeft: 32 }} placeholder="Rechercher (n°, fournisseur, libellé, tiers)…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select style={s.input} value={year} onChange={e => { setYear(Number(e.target.value)); setOffset(0); }}>
              {[thisYear, thisYear - 1, thisYear - 2].map(y => <option key={y} value={y}>Exercice {y}</option>)}
            </select>
            <select style={s.input} value={sf} onChange={e => { setSf(e.target.value as '' | 'todo' | 'done'); setOffset(0); }}>
              <option value="">Tous les états</option><option value="todo">Service fait à traiter</option><option value="done">Service fait validé</option>
            </select>
            {multiSource && (
              <select style={s.input} value={scope} onChange={e => { setScope(e.target.value); setOffset(0); }}>
                <option value="all">Tout mon périmètre</option>
                {access!.sources.map(src => <option key={src.key} value={src.key}>{src.label}</option>)}
              </select>
            )}
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{loading ? 'Chargement…' : `${total} résultat${total > 1 ? 's' : ''}`}</span>
          </div>

          {access && access.sources.some(x => x.inactive) && (
            <div style={{ ...s.card, background: '#fffbeb', borderColor: '#f59e0b', color: '#78350f', fontSize: '0.84rem' }}>
              Certains accès partagés ne donnent plus aucune facture : le droit SEDIT de la personne qui les a partagés a changé ou son compte n'est plus actif.
            </div>
          )}
          {error && <div style={{ ...s.card, borderColor: '#dc2626', color: '#b91c1c', fontSize: '0.85rem' }}>Impossible de lire vos factures dans SEDIT : {error}</div>}

          {/* Tableau */}
          <div style={{ ...s.card, padding: 0, overflowX: 'auto' }}>
            {loading && !data ? <div style={{ padding: '1.5rem' }}>Chargement…</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                <thead><tr>
                  <th style={s.th}>N° SEDIT</th><th style={s.th}>N° fournisseur</th><th style={s.th}>Libellé</th><th style={s.th}>Reçue le</th><th style={s.th}>Tiers</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Montant TTC</th><th style={s.th}>Service</th><th style={s.th}>DGP</th><th style={s.th}>Service fait</th>{multiSource && <th style={s.th}>Accès</th>}
                </tr></thead>
                <tbody>
                  {(data?.rows || []).map(r => {
                    const e = ETATS[r.etat];
                    return (
                      <tr key={r.roo} style={{ opacity: loading ? 0.5 : 1 }}>
                        <td style={s.td}>{r.num}</td>
                        <td style={s.td}>{r.num_fournisseur}</td>
                        <td style={{ ...s.td, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={r.libelle}>{r.libelle}</td>
                        <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                        <td style={{ ...s.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.tiers}>{r.tiers}</td>
                        <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtMoney(r.montant)}</td>
                        <td style={s.td} title={r.budget}>{r.service}</td>
                        <td style={s.td}>
                          {r.rejetee || r.dgp == null ? <span style={{ color: '#94a3b8' }}>—</span> : (
                            <span title={r.dgp_definitif ? 'DGP définitif : réception → paiement' : 'DGP provisoire : jours écoulés depuis la réception (pas encore payée)'}
                              style={{ border: `1px solid ${dgpColor(r)}`, color: dgpColor(r), borderRadius: 12, padding: '1px 8px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', fontStyle: r.dgp_definitif ? 'normal' : 'italic' }}>
                              {r.dgp} j{r.dgp_definitif ? '' : ' *'}
                            </span>
                          )}
                        </td>
                        <td style={s.td}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                            {r.service_fait && <span title={`Service fait validé dans SEDIT${r.service_fait_date ? ' le ' + new Date(r.service_fait_date).toLocaleDateString('fr-FR') : ''}`} style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 6, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 800 }}>SF</span>}
                            <span style={{ background: e.bg, color: e.color, borderRadius: 6, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{e.label}</span>
                            {r.workflow === 'en_cours' && <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '1px 6px', fontSize: '0.7rem' }}>validation en cours</span>}
                          </div>
                        </td>
                        {multiSource && <td style={{ ...s.td, fontSize: '0.75rem', color: '#64748b' }}>{r.via.join(', ')}</td>}
                      </tr>
                    );
                  })}
                  {data && data.rows.length === 0 && !loading && (
                    <tr><td colSpan={multiSource ? 10 : 9} style={{ ...s.td, textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Aucune facture.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>* DGP provisoire : jours écoulés depuis la réception tant que la facture n'est pas payée. Définitif une fois payée (réception → paiement).</div>

          {total > LIMIT && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
              <button style={{ ...s.btn, background: '#64748b', opacity: offset === 0 ? 0.4 : 1 }} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}><ChevronLeft size={16} /></button>
              <span style={{ fontSize: '0.85rem', color: '#475569' }}>{offset + 1}–{Math.min(offset + LIMIT, total)} sur {total}</span>
              <button style={{ ...s.btn, background: '#64748b', opacity: offset + LIMIT >= total ? 0.4 : 1 }} disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}><ChevronRight size={16} /></button>
            </div>
          )}
        </div>
      </div>
      {showShare && <ShareDialog canShare={!!access?.canShare} onClose={() => setShowShare(false)} onChanged={() => { loadAccess(); setScope('all'); setOffset(0); }} />}
      {showHelp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', zIndex: 2300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowHelp(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(620px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: '1.2rem 1.4rem', fontSize: '0.9rem', lineHeight: 1.55, color: '#334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}><strong style={{ flex: 1, fontSize: '1.05rem' }}>Aide — Mes factures</strong><button onClick={() => setShowHelp(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button></div>
            <p><strong>Quelles factures ?</strong> Celles que vous avez le droit de voir dans SEDIT (budget et service gestionnaire, accès consultation ou modification), plus celles qu'un collègue vous a partagées.</p>
            <p><strong>DGP</strong> : délai global de paiement, en jours. Définitif une fois la facture payée (réception → paiement) ; provisoire (<em>*</em>) tant qu'elle n'est pas payée (jours écoulés depuis la réception). Vert ≤ 20 j, orange ≤ 30 j, rouge au-delà de 30 j.</p>
            <p><strong>Service fait</strong> : pastille <em>SF</em> quand il est validé dans SEDIT ; le filtre « à traiter » liste les factures non rejetées dont le service fait n'est pas validé.</p>
            <p><strong>Partager mes factures</strong> : l'agent choisi voit les mêmes factures que vous, <em>en direct</em> : si vos droits SEDIT changent, les siens aussi. Vous pouvez retirer l'accès à tout moment.</p>
          </div>
        </div>
      )}
    </div>
  );
}
