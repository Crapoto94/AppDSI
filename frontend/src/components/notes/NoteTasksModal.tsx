import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { X, CheckCircle2, UserPlus, Users } from 'lucide-react';
import { useADSearch, type ADUser } from '../../utils/useADSearch';
import AgentPresenceBadge from '../AgentPresenceBadge';

export interface NoteTaskSuggestion {
  id: number;
  description: string;
  assignee?: string | null;
  requester?: string | null;
  deadline?: string | null;
  status?: string;
  app_task_id?: number | null;
}

interface Row {
  id: number;
  include: boolean;
  description: string;
  requester: string;
  echeance: string;
  aiHint: string;
  personUsername: string;
  personDisplayName: string;
  personEmail: string;
  alreadyAccepted: boolean;
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test((s || '').trim());
}

function normalizeName(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function pickBestAdMatch(results: ADUser[], queryName: string): ADUser | null {
  const q = normalizeName(queryName);
  if (q.length < 3 || results.length === 0) return null;
  const surname = q.split(' ').filter(t => t.length >= 3).pop() || '';
  if (surname) {
    const bySurname = results.find(u => normalizeName(u.displayName).split(' ').includes(surname));
    if (bySurname) return bySurname;
  }
  const qTokens = q.split(' ').filter(t => t.length > 1);
  let best: ADUser | null = null;
  let bestScore = 0;
  for (const u of results) {
    const dTokens = normalizeName(u.displayName).split(' ').filter(t => t.length > 1);
    const common = qTokens.filter(t => dTokens.includes(t)).length;
    const union = new Set([...qTokens, ...dTokens]).size;
    const score = union ? common / union : 0;
    if (score > bestScore) { bestScore = score; best = u; }
  }
  return bestScore >= 0.5 ? best : null;
}

const RowEditor: React.FC<{ row: Row; token: string | null; onChange: (patch: Partial<Row>) => void }> = ({ row, token, onChange }) => {
  const ad = useADSearch(token);
  const pinnedRef = useRef(false);

  useEffect(() => {
    if (row.personUsername || pinnedRef.current) return;
    const name = (row.personDisplayName || '').trim();
    if (name.length >= 3) ad.setQuery(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.personDisplayName]);

  useEffect(() => {
    if (row.personUsername || pinnedRef.current || !ad.results.length) return;
    const best = pickBestAdMatch(ad.results, row.personDisplayName);
    if (best) {
      pinnedRef.current = true;
      onChange({ personDisplayName: best.displayName, personUsername: best.username, personEmail: best.email || '' });
      ad.clearResults();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad.results]);

  return (
    <div style={{ ...rowStyle, opacity: row.include ? 1 : 0.5 }}>
      <input type="checkbox" checked={row.include} disabled={row.alreadyAccepted} onChange={e => onChange({ include: e.target.checked })} style={{ marginTop: 6 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input style={inputStyle} value={row.description} disabled={row.alreadyAccepted} onChange={e => onChange({ description: e.target.value })} placeholder="Description de la tâche" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <label style={miniLabel}>Affecter à</label>
            {row.personUsername ? (
              <div style={fixedPersonStyle}>
                <CheckCircle2 size={15} style={{ color: '#16a34a', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#166534', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {row.personDisplayName} <AgentPresenceBadge email={row.personEmail} name={row.personDisplayName} size={12} />
                  </div>
                  <div style={{ fontSize: 10.5, color: '#15803D', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.personEmail || row.personUsername} · AD ✓</div>
                </div>
                {!row.alreadyAccepted && (
                  <button type="button" onClick={() => onChange({ personUsername: '', personEmail: '', personDisplayName: '' })} style={changeBtnStyle}>Changer</button>
                )}
              </div>
            ) : (
              <>
                <input type="text" placeholder="Rechercher dans l'AD (sinon texte libre)…" value={row.personDisplayName}
                  onChange={e => { onChange({ personDisplayName: e.target.value, personUsername: '', personEmail: '' }); ad.setQuery(e.target.value); }}
                  style={inputStyle} disabled={row.alreadyAccepted} />
                {ad.results.length > 0 && (
                  <div style={dropdownStyle}>
                    {ad.results.map(u => (
                      <div key={u.username} style={dropdownItemStyle}
                        onClick={() => { onChange({ personDisplayName: u.displayName, personUsername: u.username, personEmail: u.email || '' }); ad.clearResults(); }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                        <UserPlus size={12} style={{ color: '#2563eb', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{u.displayName}</div>
                          {u.email && <div style={{ fontSize: 10, color: '#64748b' }}>{u.email}{u.service ? ` · ${u.service}` : ''}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div>
            <label style={miniLabel}>Échéance</label>
            <input type="date" style={inputStyle} value={row.echeance} disabled={row.alreadyAccepted} onChange={e => onChange({ echeance: e.target.value })} />
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
          Demandeur : {row.requester || '—'}{row.aiHint ? ` · échéance IA : "${row.aiHint}"` : ''}
          {row.alreadyAccepted ? ' · ✓ déjà créée' : ''}
        </div>
      </div>
    </div>
  );
};

interface Props {
  noteId: number;
  noteTitle: string;
  suggestions: NoteTaskSuggestion[];
  token: string | null;
  onClose: () => void;
  onDone: () => void;
}

const NoteTasksModal: React.FC<Props> = ({ noteId, noteTitle, suggestions, token, onClose, onDone }) => {
  const proposed = suggestions.filter(s => s.status === 'proposed' || (!s.status && !s.app_task_id));
  const accepted = suggestions.filter(s => s.status === 'accepted' && s.app_task_id);
  const [rows, setRows] = useState<Row[]>(proposed.map(s => ({
    id: s.id,
    include: true,
    description: s.description,
    requester: s.requester || '',
    echeance: isIsoDate(s.deadline || '') ? (s.deadline as string) : '',
    aiHint: s.deadline || '',
    personUsername: '',
    personDisplayName: s.assignee || '',
    personEmail: '',
    alreadyAccepted: false,
  })));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: number; rejected: number } | null>(null);

  const updateRow = (id: number, patch: Partial<Row>) => setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const handleSubmit = async () => {
    setSubmitting(true);
    let ok = 0, failed = 0, rejected = 0;
    for (const row of rows) {
      try {
        if (row.include && row.description.trim()) {
          const created = await axios.post('/api/tasks', {
            description: row.description.trim(),
            echeance: row.echeance || null,
            context_source: 'notes',
            context_id: noteId,
            context_title: noteTitle,
            assignees: [row.personUsername || row.personDisplayName.trim()].filter(Boolean),
          }, { headers: { Authorization: `Bearer ${token}` } });
          const appTaskId = Array.isArray(created.data) ? created.data[0]?.id : created.data?.id;
          await axios.patch(`/api/notes/${noteId}/task-suggestions/${row.id}`,
            { status: 'accepted', app_task_id: appTaskId || null, assignee: row.personDisplayName || null, deadline: row.echeance || row.aiHint || null },
            { headers: { Authorization: `Bearer ${token}` } });
          ok++;
        } else {
          await axios.patch(`/api/notes/${noteId}/task-suggestions/${row.id}`, { status: 'rejected' }, { headers: { Authorization: `Bearer ${token}` } });
          rejected++;
        }
      } catch (err) {
        console.error(err);
        failed++;
      }
    }
    setSubmitting(false);
    setResult({ ok, failed, rejected });
    onDone();
  };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modal}>
        <div style={header}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={17} color="#2563eb" /> Tâches proposées par l'IA
          </h3>
          <button onClick={onClose} style={closeBtn}><X size={18} /></button>
        </div>
        <div style={{ padding: '0 1.5rem 0.5rem', color: '#64748b', fontSize: 12.5 }}>
          Vérifiez les tâches reconnues dans « {noteTitle || 'cette note'} ». Dès qu'un nom est proposé, la personne est recherchée dans l'AD et fixée si le rapprochement est fiable. Les tâches créées seront visibles dans <strong>Mes Tâches</strong>.
        </div>
        <div style={body}>
          {rows.length === 0 && <p style={{ color: '#94a3b8' }}>Aucune nouvelle tâche à proposer.</p>}
          {rows.map(row => <RowEditor key={row.id} row={row} token={token} onChange={patch => updateRow(row.id, patch)} />)}
          {accepted.length > 0 && rows.length === 0 && (
            <div style={{ fontSize: 12.5, color: '#64748b' }}>{accepted.length} tâche(s) déjà créée(s) depuis cette note.</div>
          )}
        </div>
        {result && (
          <div style={{ padding: '0 1.5rem 0.5rem', fontSize: 12.5, color: result.failed ? '#b91c1c' : '#15803d', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={14} /> {result.ok} tâche(s) créée(s){result.rejected ? `, ${result.rejected} ignorée(s)` : ''}{result.failed ? `, ${result.failed} échec(s)` : ''}.
          </div>
        )}
        <div style={footer}>
          <button onClick={onClose} style={btnCancel}>Fermer</button>
          <button onClick={handleSubmit} disabled={submitting || rows.length === 0} style={{ ...btnValidate, opacity: (submitting || rows.length === 0) ? 0.6 : 1 }}>
            <CheckCircle2 size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            {submitting ? 'Création…' : 'Valider et créer les tâches'}
          </button>
        </div>
      </div>
    </div>
  );
};

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4200, padding: 20 };
const modal: React.CSSProperties = { background: 'white', borderRadius: 16, width: '100%', maxWidth: 820, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,.15)', overflow: 'hidden' };
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.5rem 0.4rem' };
const closeBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' };
const body: React.CSSProperties = { padding: '0.8rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 };
const rowStyle: React.CSSProperties = { display: 'flex', gap: 12, padding: 12, border: '1px solid #e2e8f0', borderRadius: 10 };
const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const miniLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2, textTransform: 'uppercase' };
const fixedPersonStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid #16a34a', background: '#f0fdf4', borderRadius: 8, padding: '5px 9px' };
const changeBtnStyle: React.CSSProperties = { background: 'white', border: '1px solid #86efac', color: '#15803d', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 };
const dropdownStyle: React.CSSProperties = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'white', border: '1px solid #bfdbfe', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,.1)', maxHeight: 160, overflowY: 'auto', marginTop: 2 };
const dropdownItemStyle: React.CSSProperties = { padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 };
const footer: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '0.9rem 1.5rem', borderTop: '1px solid #f1f5f9' };
const btnCancel: React.CSSProperties = { background: '#f1f5f9', color: '#64748b', border: 'none', padding: '9px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' };
const btnValidate: React.CSSProperties = { background: '#2563eb', color: 'white', border: 'none', padding: '9px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' };

export default NoteTasksModal;
