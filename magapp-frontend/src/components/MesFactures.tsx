import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Search, Share2, Trash2, Receipt, Loader2, ChevronLeft, ChevronRight, HelpCircle, Send, CheckCircle2, Upload, Paperclip, Hourglass, Ban } from 'lucide-react';
import logoDsiHub from '../assets/DSI.png';
import { HELP_CSS } from './helpStyles';
import DgpWeeklyChart from './DgpWeeklyChart';

// BETA « Mes factures » : factures SEDIT que l'agent a le droit de voir (droits DROITSER), avec service fait et DGP.
// Un agent peut donner accès à ses factures à un autre agent : le bénéficiaire voit ce que le donneur voit, EN DIRECT
// (si les droits du donneur changent dans SEDIT, ceux du bénéficiaire suivent).

interface Row {
  roo: string; num: string; num_fournisseur: string; libelle: string; date: string; montant: number; tiers: string; service: string; budget: string;
  etat: 'recue' | 'rapprochee' | 'service_fait' | 'mandatee' | 'refusee'; service_fait: boolean; service_fait_date: string | null; rejetee: boolean;
  workflow: string | null; dgp: number | null; dgp_definitif: boolean; dgp_rejete: boolean; via: string[]; can_sf: boolean;
  circuit: { status: string; verificateur: string; depuis: string; demandeur: string; can_cancel: boolean } | null;
}
interface Mandat { type: string; objet: string; bord: number | string | null; piece: number | string | null; date_emission: string | null; date_transmission: string | null; date_paiement: string | null; montant: number | null; rejete: boolean }
interface Tendance { recent: number | null; precedent: number | null; nb_recent: number; nb_precedent: number; delta: number | null; semaines: { semaine: string; moyenne: number; nb: number }[] }
interface Stats { tendance?: Tendance; nb_factures: number; nb_payees: number; nb_non_payees: number; dgp_moyen: number | null; nb_hors_delai: number; nb_prov_hors_delai: number; taux_dans_delai: number | null }
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

const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: string; color?: string; extra?: React.ReactNode; onClick?: () => void }> = ({ label, value, sub, color = '#0f172a', extra, onClick }) => (
  <div onClick={onClick} role={onClick ? 'button' : undefined} style={{ ...s.card, flex: '1 1 150px', cursor: onClick ? 'pointer' : undefined, borderColor: onClick ? '#bfdbfe' : undefined }}>
    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{value}</div>
    {sub && <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{sub}</div>}
    {extra}
  </div>
);


// Tendance du DGP moyen : flèche + écart (30 derniers jours vs 30 jours précédents) et mini-courbe hebdomadaire
const DgpTrend: React.FC<{ t?: Tendance }> = ({ t }) => {
  if (!t) return null;
  if (t.delta == null) {
    // Comparaison impossible : l'une des deux périodes de 30 jours n'a aucune facture payée — on indique laquelle
    const msg = t.recent == null && t.precedent == null ? 'Aucune facture payée sur les 60 derniers jours'
      : t.recent == null ? `Aucun paiement sur les 30 derniers jours (précédents : ${t.precedent} j)`
      : `${t.recent} j sur les 30 derniers jours — pas de paiement sur les 30 précédents`;
    return <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4 }}>{msg}</div>;
  }
  const better = t.delta < 0, same = t.delta === 0;
  const color = same ? '#64748b' : better ? '#16a34a' : '#dc2626';
  const arrow = same ? '→' : better ? '↘' : '↗';
  return (
    <div title={`30 derniers jours : ${t.recent} j (${t.nb_recent} factures payées) — 30 jours précédents : ${t.precedent} j (${t.nb_precedent}). Cliquez pour afficher la courbe hebdomadaire.`} style={{ marginTop: 4, cursor: 'help' }}>
      <div style={{ fontSize: '0.74rem', fontWeight: 700, color }}>{arrow} {t.delta > 0 ? '+' : ''}{String(t.delta).replace('.', ',')} j <span style={{ fontWeight: 400, color: '#94a3b8' }}>vs 30 j précédents</span></div>
    </div>
  );
};

// Infobulle de mandatement : chargée au survol de la pastille « Mandatée » (puis mise en cache)
const MandatTip: React.FC<{ num: string; children: React.ReactNode }> = ({ num, children }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Mandat[] | null>(null);
  const [err, setErr] = useState('');
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const show = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: Math.min(r.left, window.innerWidth - 360), y: r.bottom + 6 });
    setOpen(true);
    if (data || err) return;
    fetch(`${API}/${encodeURIComponent(num)}/mandatement`, { headers: authHeaders() })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.message || 'Erreur'); return d; })
      .then(d => setData(d.mandats || [])).catch((e: Error) => setErr(e.message));
  };
  return (
    <span onMouseEnter={show} onMouseLeave={() => setOpen(false)} style={{ display: 'inline-flex' }}>
      {children}
      {open && (
        <div style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 3000, width: 340, background: '#0f172a', color: '#e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: '0.78rem', lineHeight: 1.5, boxShadow: '0 10px 30px rgba(0,0,0,.35)', pointerEvents: 'none' }}>
          <div style={{ fontWeight: 800, marginBottom: 4, color: '#6ee7b7' }}>Mandatement — {num}</div>
          {err ? <div style={{ color: '#fca5a5' }}>{err}</div> : !data ? <div>Chargement…</div> : data.length === 0 ? <div>Aucun mandat trouvé dans SEDIT.</div> : data.map((m, i) => (
            <div key={i} style={{ marginTop: i ? 8 : 0, paddingTop: i ? 8 : 0, borderTop: i ? '1px solid #334155' : 'none' }}>
              <div><strong>{m.type || 'Mandat'}</strong>{m.rejete && <span style={{ color: '#fca5a5' }}> — rejeté</span>}</div>
              {m.objet && <div style={{ color: '#cbd5e1' }}>{m.objet}</div>}
              <div>Pièce n° <strong>{m.piece ?? '—'}</strong> · Bordereau n° <strong>{m.bord ?? '—'}</strong></div>
              <div>Émis le {m.date_emission ? fmtDate(m.date_emission) : '—'} · Transmis le {m.date_transmission ? fmtDate(m.date_transmission) : '—'}</div>
              <div>{m.date_paiement ? <>Payé le <strong>{fmtDate(m.date_paiement)}</strong></> : <span style={{ color: '#fcd34d' }}>Pas encore payé</span>}{m.montant != null ? <> · <strong>{fmtMoney(m.montant)}</strong></> : null}</div>
            </div>
          ))}
        </div>
      )}
    </span>
  );
};

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
          <div style={{ marginBottom: 14 }}>
            <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
            <input style={{ ...s.input, width: '100%', paddingLeft: 32 }} placeholder="Rechercher un agent (nom, prénom, identifiant)…" value={q} onChange={e => setQ(e.target.value)} disabled={busy} /></div>
            {hits.length > 0 && (
              <div style={{ marginTop: 6, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, maxHeight: 240, overflowY: 'auto' }}>
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


// ───────── Service fait : lancer une validation (vérificateur) ou le déclarer soi-même ─────────
const ServiceFaitDialog: React.FC<{ row: Row; mode: 'circuit' | 'self'; onClose: () => void; onDone: () => void }> = ({ row, mode, onClose, onDone }) => {
  const isSelf = mode === 'self';
  const today = new Date();
  const [date, setDate] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<AgentHit[]>([]);
  const [verifier, setVerifier] = useState<AgentHit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (isSelf || verifier || query.length < 2) { setHits([]); return; }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      try {
        // Recherche limitée aux agents de MA direction (contrôlée aussi côté serveur)
        const r = await fetch(`${API}/verifiers?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
        const d: AgentHit[] = r.ok ? await r.json() : [];
        if (id === seq.current) setHits(d);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [q, isSelf, verifier]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isSelf && !comment.trim() && files.length === 0) { setError("Renseignez un commentaire ou joignez au moins une pièce justificative (l'un des deux suffit)."); return; }
    if (!isSelf && !verifier) { setError('Choisissez un vérificateur.'); return; }
    setBusy(true);
    try {
      let r: Response;
      if (isSelf) {
        const fd = new FormData();
        fd.append('comment', comment); fd.append('service_fait_date', date);
        files.forEach(f => fd.append('files', f));
        r = await fetch(`${API}/${encodeURIComponent(row.num)}/service-fait/self`, { method: 'POST', headers: authHeaders(), body: fd });
      } else {
        r = await fetch(`${API}/${encodeURIComponent(row.num)}/service-fait`, {
          method: 'POST', headers: jsonHeaders(),
          body: JSON.stringify({ verifier_username: verifier!.username, verifier_email: verifier!.email, verifier_name: verifier!.displayName }),
        });
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || 'Erreur');
      onDone(); onClose();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const lbl: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 };
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', background: '#fff', color: '#1e293b' };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>{isSelf ? 'Service fait — déclaration directe' : 'Validation du service fait'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', marginBottom: 6 }}>Facture</div>
          <div><strong>{row.num}</strong> · {row.tiers} · <strong>{fmtMoney(row.montant)}</strong></div>
          <div style={{ color: '#475569', marginTop: 4 }}>{row.libelle}</div>
        </div>
        {error && <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <form onSubmit={submit}>
          {isSelf && <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 12px', color: '#1e40af', fontSize: 13, marginBottom: 14 }}>
            Aucun circuit de validation : vous déclarez vous-même que le service fait est réalisé. Renseignez un commentaire ou joignez une pièce justificative (l'un des deux suffit).</div>}
          {isSelf ? (
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Date de service fait</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Reportée dans SEDIT (date de réalisation du service fait).</div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
              La <strong>date de service fait</strong> sera saisie par le vérificateur au moment de sa décision.
            </div>
          )}
          {!isSelf && (
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Vérificateur <span style={{ color: '#dc2626' }}>*</span></label>
              {verifier ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...inp }}>
                  <span style={{ flex: 1 }}><strong>{verifier.displayName}</strong> <span style={{ color: '#64748b' }}>— {verifier.email}</span></span>
                  <button type="button" onClick={() => { setVerifier(null); setQ(''); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={16} /></button>
                </div>
              ) : (
                <>
                  <input style={inp} placeholder="Rechercher un agent de votre direction (nom, prénom)…" value={q} onChange={e => setQ(e.target.value)} />
                  {q.trim().length >= 2 && hits.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Aucun agent de votre direction trouvé.</div>}
                  {hits.length > 0 && (
                    <div style={{ marginTop: 6, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, maxHeight: 220, overflowY: 'auto' }}>
                      {hits.map(a => (
                        <div key={a.username} onClick={() => { setVerifier(a); setHits([]); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')} onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                          <strong>{a.displayName}</strong> <span style={{ color: '#64748b' }}>— {a.email}{a.service ? ` · ${a.service}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {verifier && <div style={{ marginTop: 8, fontSize: 12, color: '#64748b', background: '#eff6ff', padding: '8px 12px', borderRadius: 8 }}>Un e-mail sera envoyé à <strong>{verifier.email}</strong> avec un lien de validation ; les pièces jointes de la facture dans SEDIT lui seront mises à disposition.</div>}
            </div>
          )}
          {isSelf && (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Commentaire <span style={{ fontWeight: 400, color: '#94a3b8' }}>— ou joignez une pièce ci-dessous</span></label>
                <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} placeholder="Précisez le service fait (prestation réalisée, date, référence…)" style={{ ...inp, resize: 'vertical' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Pièce(s) justificative(s)</label>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, border: '1.5px dashed #cbd5e1', borderRadius: 8, background: '#f8fafc', color: '#475569', fontSize: 13, cursor: 'pointer' }}>
                  <Upload size={16} /> Choisir un ou plusieurs fichiers
                  <input type="file" multiple style={{ display: 'none' }} onChange={e => setFiles(Array.from(e.target.files || []))} />
                </label>
                {files.length > 0 && <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>{files.map((f, i) => <li key={i} style={{ fontSize: 12, color: '#475569', display: 'flex', gap: 6, alignItems: 'center' }}><Paperclip size={12} /> {f.name}</li>)}</ul>}
              </div>
            </>
          )}
          <button type="submit" disabled={busy} style={{ width: '100%', padding: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: busy ? '#a5b4fc' : (isSelf ? '#16a34a' : '#6366f1'), color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Enregistrement…' : isSelf ? <><CheckCircle2 size={16} /> Valider le service fait</> : <><Send size={16} /> Lancer la validation</>}
          </button>
        </form>
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
  const [helpHtml, setHelpHtml] = useState<string | null>(null);
  const openHelp = async () => {
    setShowHelp(true);
    if (helpHtml !== null) return;
    try {
      const r = await fetch(`/api/page-help/${encodeURIComponent('/magapp/mes-factures')}`);
      const d = r.ok ? await r.json() : null;
      setHelpHtml(d?.content_html || "<p>Aucune aide disponible pour l'instant.</p>");
    } catch { setHelpHtml('<p>Aide momentanément indisponible.</p>'); }
  };
  const [showChart, setShowChart] = useState(false);
  const [sfDialog, setSfDialog] = useState<{ row: Row; mode: 'circuit' | 'self' } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
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
  }, [year, searchApplied, sf, scope, offset, reloadKey]);

  const cancelCircuit = async (r: Row) => {
    const motif = window.prompt(`Annuler le circuit de service fait de la facture ${r.num} ?\nMotif (optionnel) :`, '');
    if (motif === null) return;
    const res = await fetch(`${API}/${encodeURIComponent(r.num)}/service-fait/cancel`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ comment: motif }) });
    if (res.ok) setReloadKey(k => k + 1);
    else window.alert((await res.json().catch(() => ({}))).message || "Annulation impossible");
  };

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
          <button onClick={openHelp} title="Aide" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: 10, borderRadius: 10, color: '#475569', cursor: 'pointer', display: 'flex' }}><HelpCircle size={20} /></button>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={20} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Résumé DGP du périmètre */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Stat label={`Factures ${year}`} value={st ? st.nb_factures : '—'} sub="dans mon périmètre" />
            <Stat label="DGP moyen (payées) 📈" value={st && st.dgp_moyen != null ? `${st.dgp_moyen} j` : '—'} sub="réception → paiement" color={st && st.dgp_moyen != null && st.dgp_moyen > 30 ? '#dc2626' : '#16a34a'} extra={<DgpTrend t={st?.tendance} />} onClick={() => setShowChart(true)} />
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
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1060 }}>
                <thead><tr>
                  <th style={s.th}>N° SEDIT</th><th style={s.th}>N° fournisseur</th><th style={s.th}>Libellé</th><th style={s.th}>Reçue le</th><th style={s.th}>Tiers</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Montant TTC</th><th style={s.th}>Service</th><th style={s.th}>DGP</th><th style={s.th}>Service fait</th><th style={s.th}>Action</th>{multiSource && <th style={s.th}>Accès</th>}
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
                          {r.dgp == null ? <span style={{ color: '#94a3b8' }}>—</span> : (
                            <span title={r.dgp_rejete ? 'Facture rejetée : DGP arrêté à la date de rejet (réception → rejet)' : r.dgp_definitif ? 'DGP définitif : réception → paiement' : 'DGP provisoire : jours écoulés depuis la réception (pas encore payée)'}
                              style={{ border: `1px solid ${dgpColor(r)}`, color: dgpColor(r), borderRadius: 12, padding: '1px 8px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', fontStyle: r.dgp_definitif ? 'normal' : 'italic' }}>
                              {r.dgp} j{r.dgp_definitif ? '' : ' *'}{r.dgp_rejete ? ' ✕' : ''}
                            </span>
                          )}
                        </td>
                        <td style={s.td}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                            {r.service_fait && <span title={`Service fait validé dans SEDIT${r.service_fait_date ? ' le ' + new Date(r.service_fait_date).toLocaleDateString('fr-FR') : ''}`} style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 6, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 800 }}>SF</span>}
                            {r.etat === 'mandatee' ? (
                              <MandatTip num={r.num}><span style={{ background: e.bg, color: e.color, borderRadius: 6, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'help', outline: `1px solid ${e.color}` }}>{e.label}</span></MandatTip>
                            ) : <span style={{ background: e.bg, color: e.color, borderRadius: 6, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{e.label}</span>}
                            {r.circuit && (
                              <span title={`Service fait en cours de circuit — en attente de ${r.circuit.verificateur || 'validation'}${r.circuit.depuis ? ' (lancé le ' + new Date(r.circuit.depuis).toLocaleDateString('fr-FR') + ')' : ''}${r.circuit.status === 'en_pause' ? ' — en pause' : ''}`}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 6, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 700, cursor: 'help' }}>
                                <Hourglass size={12} /> En circuit{r.circuit.verificateur ? ` · ${r.circuit.verificateur}` : ''}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                          {r.circuit && r.circuit.can_cancel && (
                            <button title="Annuler le circuit de service fait en cours" onClick={() => cancelCircuit(r)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #dc2626', background: '#fef2f2', color: '#b91c1c', borderRadius: 6, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}><Ban size={12} /> Annuler le circuit</button>
                          )}
                          {r.can_sf && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button title="Lancer la validation du service fait (avec un vérificateur)" onClick={() => setSfDialog({ row: r, mode: 'circuit' })}
                                style={{ border: '1px solid #6366f1', background: '#eef2ff', color: '#3730a3', borderRadius: 6, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>Lancer SF</button>
                              <button title="Déclarer moi-même le service fait (sans circuit de validation)" onClick={() => setSfDialog({ row: r, mode: 'self' })}
                                style={{ border: '1px solid #16a34a', background: '#f0fdf4', color: '#166534', borderRadius: 6, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>Faire SF</button>
                            </div>
                          )}
                        </td>
                        {multiSource && <td style={{ ...s.td, fontSize: '0.75rem', color: '#64748b' }}>{r.via.join(', ')}</td>}
                      </tr>
                    );
                  })}
                  {data && data.rows.length === 0 && !loading && (
                    <tr><td colSpan={multiSource ? 11 : 10} style={{ ...s.td, textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Aucune facture.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>* DGP provisoire : jours écoulés depuis la réception tant que la facture n'est pas payée. Définitif une fois payée (réception → paiement). ✕ = facture rejetée : DGP arrêté à la date de rejet.</div>

          {total > LIMIT && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
              <button style={{ ...s.btn, background: '#64748b', opacity: offset === 0 ? 0.4 : 1 }} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}><ChevronLeft size={16} /></button>
              <span style={{ fontSize: '0.85rem', color: '#475569' }}>{offset + 1}–{Math.min(offset + LIMIT, total)} sur {total}</span>
              <button style={{ ...s.btn, background: '#64748b', opacity: offset + LIMIT >= total ? 0.4 : 1 }} disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}><ChevronRight size={16} /></button>
            </div>
          )}
        </div>
      </div>
      {sfDialog && <ServiceFaitDialog row={sfDialog.row} mode={sfDialog.mode} onClose={() => setSfDialog(null)} onDone={() => setReloadKey(k => k + 1)} />}
      {showChart && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', zIndex: 2300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowChart(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(1100px, 100%)', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 10px 0' }}><button onClick={() => setShowChart(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button></div>
            <DgpWeeklyChart year={year} scope={scope} />
          </div>
        </div>
      )}
      {showShare && <ShareDialog canShare={!!access?.canShare} onClose={() => setShowShare(false)} onChanged={() => { loadAccess(); setScope('all'); setOffset(0); }} />}
      {showHelp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', zIndex: 2300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowHelp(false)}>
          <style>{HELP_CSS}</style>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(860px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderBottom: '1px solid #e2e8f0' }}>
              <HelpCircle size={20} color="#0078a4" /><strong style={{ flex: 1 }}>Aide — Mes factures</strong>
              <button onClick={() => setShowHelp(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div className="vc-help" style={{ padding: '14px 20px', overflowY: 'auto', color: '#1e293b' }} dangerouslySetInnerHTML={{ __html: helpHtml ?? 'Chargement…' }} />
          </div>
        </div>
      )}
    </div>
  );
}
