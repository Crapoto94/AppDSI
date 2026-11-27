import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Trash2, UserPlus, Users } from 'lucide-react';
import { appAlert, appConfirm } from './AppDialogs';
import { API, authHeaders, jsonHeaders, ETATS, fmtDate, fmtMoney, s, type Rec } from './virementShared';

// Espace de traitement des virements de crédits par la direction des finances : demandes transmises et gestion des accès.

interface Traitant { username: string; display_name: string | null; email: string | null; added_by: string | null; added_at: string }
interface Found { username: string; displayName: string; email: string }
const FILTRES = [
  { key: 'a_traiter', label: 'À traiter', test: (r: Rec) => !r.treatment_status },
  { key: 'en_cours', label: 'En cours', test: (r: Rec) => r.treatment_status === 'en_cours' },
  { key: 'clos', label: 'Faites / refusées', test: (r: Rec) => r.treatment_status === 'fait' || r.treatment_status === 'refuse' },
  { key: 'tout', label: 'Toutes', test: () => true },
];

const Acces: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [list, setList] = useState<Traitant[]>([]);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[]>([]);

  useEffect(() => {
    fetch(`${API}/traitants`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(setList).catch(() => {});
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => {
      fetch(`${API}/traitants/search?q=${encodeURIComponent(q)}`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(setFound).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const apply = async (r: Response) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { appAlert(data.message || 'Erreur'); return; }
    setList(data); setQ(''); setFound([]); onChanged();
  };
  const add = async (u: Found) => apply(await fetch(`${API}/traitants`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ username: u.username, displayName: u.displayName, email: u.email }) }));
  const remove = async (t: Traitant) => {
    if (!(await appConfirm(`Retirer l'accès de ${t.display_name || t.username} à l'espace de traitement ?`, { title: 'Retirer un accès', confirmLabel: 'Retirer', danger: true }))) return;
    apply(await fetch(`${API}/traitants/${encodeURIComponent(t.username)}`, { method: 'DELETE', headers: authHeaders() }));
  };

  return (
    <div style={s.card}>
      <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Users size={16} /> Agents ayant accès à l'espace de traitement</strong>
      <div style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 10px' }}>
        Un administrateur désigne le premier agent ; ensuite, chaque personne de la liste peut en ajouter d'autres.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {list.length === 0 && <span style={{ fontSize: '0.85rem', color: '#d97706' }}>Personne n'est désigné : la transmission dans l'application reste indisponible.</span>}
        {list.map(t => (
          <span key={t.username} title={`${t.email || t.username} — ajouté par ${t.added_by || '?'} le ${fmtDate(t.added_at)}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f1f5f9', borderRadius: 16, padding: '4px 10px', fontSize: '0.82rem' }}>
            {t.display_name || t.username}
            <button title="Retirer" onClick={() => remove(t)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', padding: 0, display: 'flex' }}><Trash2 size={13} /></button>
          </span>
        ))}
      </div>
      <div style={{ maxWidth: 420 }}>
        <label style={s.label}><UserPlus size={13} style={{ verticalAlign: 'text-bottom' }} /> Ajouter un agent</label>
        <input style={s.input} value={q} onChange={e => setQ(e.target.value)} placeholder="Nom, prénom ou adresse e-mail" />
        {found.map(u => (
          <button key={u.username} onClick={() => add(u)}
            style={{ display: 'block', width: '100%', textAlign: 'left', border: '1px solid #e2e8f0', borderTop: 'none', background: '#fff', padding: '6px 10px', cursor: 'pointer', fontSize: '0.84rem', color: '#1e293b' }}>
            {u.displayName} <span style={{ color: '#64748b' }}>— {u.email || u.username}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default function VirementTraitement({ traitant, canManage, version, onOpen, onAccessChanged }: {
  traitant: boolean; canManage: boolean; version: number; onOpen: (id: number) => void; onAccessChanged: () => void;
}) {
  const [rows, setRows] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtre, setFiltre] = useState('a_traiter');

  const load = useCallback(() => {
    if (!traitant) { setRows([]); return; }
    setLoading(true);
    fetch(`${API}/traitement`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [traitant]);
  useEffect(() => { load(); }, [load, version]);

  const shown = rows.filter((FILTRES.find(f => f.key === filtre) || FILTRES[0]).test);

  return (
    <>
      {traitant && (
        <div style={{ ...s.card, overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {FILTRES.map(f => (
              <button key={f.key} onClick={() => setFiltre(f.key)}
                style={{ border: '1px solid #cbd5e1', borderRadius: 16, padding: '4px 12px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', background: filtre === f.key ? '#2563eb' : '#fff', color: filtre === f.key ? '#fff' : '#475569' }}>
                {f.label} ({rows.filter(f.test).length})
              </button>
            ))}
          </div>
          {loading ? 'Chargement…' : shown.length === 0 ? <div style={{ color: '#94a3b8' }}>Aucune demande dans cette liste.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={s.th}>N°</th><th style={s.th}>Transmise le</th><th style={s.th}>Demandeur</th><th style={s.th}>Service</th><th style={s.th}>Section</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Montant</th><th style={s.th}>Motivation</th><th style={s.th}>État</th><th style={s.th}></th>
              </tr></thead>
              <tbody>
                {shown.map(r => {
                  const e = ETATS[r.etat];
                  return (
                    <tr key={r.id}>
                      <td style={s.td}>{r.id}</td>
                      <td style={s.td}>{fmtDate(r.sent_at)}<div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{r.sent_channel === 'espace' ? 'dans l’application' : 'par mail'}</div></td>
                      <td style={s.td}>{r.created_by_name}</td>
                      <td style={s.td}>{r.service}<div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{r.direction}</div></td>
                      <td style={s.td}>{r.section === 'I' ? 'Invest.' : 'Fonct.'} / {r.sens === 'D' ? 'Dép.' : 'Rec.'}</td>
                      <td style={{ ...s.td, ...s.right }}>{fmtMoney(Number(r.montant))}</td>
                      <td style={{ ...s.td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.motivation || ''}>{r.motivation}</td>
                      <td style={s.td}><span style={{ background: e.color, color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{e.label}</span></td>
                      <td style={s.td}><button style={{ ...s.btn, padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => onOpen(r.id)}><Eye size={14} /> Traiter</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
      {canManage && <Acces onChanged={onAccessChanged} />}
    </>
  );
}
