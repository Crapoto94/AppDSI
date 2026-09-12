import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { X, CheckCircle2, Users, UserPlus, ChevronDown } from 'lucide-react';
import { useADSearch, type ADUser } from '../utils/useADSearch';

export interface DsiAgent {
    username: string;
    nom: string;
    email?: string;
    service?: string;
}

export interface AiTask {
    id: number;
    description: string;
    assignee: string; // nom libre renvoyé par l'IA
    requester: string;
    deadline: string; // texte libre renvoyé par l'IA (ex. "vendredi prochain")
    assignee_username?: string | null;
    assignee_match_score?: number | null;
}

interface TicketGroup {
    id: number;
    name: string;
    description?: string | null;
    members: string[];
}

interface Row {
    id: number;
    include: boolean;
    description: string;
    requester: string;
    echeance: string; // YYYY-MM-DD ou ''
    aiHint: string; // ce que l'IA a écrit pour l'échéance (indicatif)
    mode: 'person' | 'group';
    personUsername: string;
    personDisplayName: string;
    personEmail: string;
    groupId: number | '';
}

function isIsoDate(s: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test((s || '').trim());
}

function normalizeName(s: string): string {
    return (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Sélectionne la meilleure personne AD pour un nom renvoyé par l'IA :
 * d'abord un match sur le nom de famille (dernier mot significatif), sinon la
 * meilleure similarité Jaccard entre les mots. Ne renvoie une personne que si
 * le rapprochement est suffisamment fiable (>= 0.5), sinon null.
 */
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

/**
 * Ligne d'affectation d'une tâche — même pattern que AddTaskModal (le composant
 * réutilisé partout ailleurs pour créer une tâche) : recherche AD pour une
 * personne, ou affectation à un groupe de techniciens (/ticket). Un
 * sous-composant par ligne est nécessaire pour que chaque recherche AD ait son
 * propre état (useADSearch ne peut pas être appelé dans une boucle).
 *
 * Dès qu'un nom a été proposé par l'IA sans personne déjà rattachée, une
 * recherche AD est lancée automatiquement et la personne est « fixée » si le
 * rapprochement est fiable.
 */
const AssignmentRow: React.FC<{
    row: Row;
    isGuest: boolean;
    groups: TicketGroup[];
    groupsLoading: boolean;
    token: string | null;
    onChange: (patch: Partial<Row>) => void;
}> = ({ row, isGuest, groups, groupsLoading, token, onChange }) => {
    const ad = useADSearch(token);
    const autoPinnedRef = useRef(false);

    useEffect(() => {
        if (row.personUsername || autoPinnedRef.current) return;
        const name = (row.personDisplayName || '').trim();
        if (!name || name.length < 3) return;
        ad.setQuery(name);
    }, [row.personDisplayName, row.personUsername]);

    useEffect(() => {
        if (row.personUsername || autoPinnedRef.current) return;
        if (!ad.results.length) return;
        const best = pickBestAdMatch(ad.results, row.personDisplayName);
        if (best) {
            autoPinnedRef.current = true;
            onChange({ personDisplayName: best.displayName, personUsername: best.username, personEmail: best.email || '', include: true });
            ad.clearResults();
        }
    }, [ad.results, row.personDisplayName, row.personUsername]);

    return (
        <div style={{ ...rowStyle, opacity: row.include ? 1 : 0.55 }}>
            <input
                type="checkbox"
                checked={row.include}
                onChange={e => onChange({ include: e.target.checked })}
                style={{ marginTop: 6 }}
            />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                    style={inputStyle}
                    value={row.description}
                    onChange={e => onChange({ description: e.target.value })}
                    placeholder="Description de la tâche"
                />

                {/* Mode : personne ou groupe /ticket — la bascule n'existe qu'en
                    accès DSI Hub ; en accès direct la personne est le seul choix. */}
                {!isGuest && (
                    <div style={{ display: 'flex', gap: 6 }}>
                        {(['person', 'group'] as const).map(m => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => onChange({ mode: m })}
                                style={{
                                    flex: 1, padding: '5px 8px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                                    border: `1.5px solid ${row.mode === m ? '#2563eb' : '#e2e8f0'}`,
                                    background: row.mode === m ? '#2563eb' : 'white',
                                    color: row.mode === m ? 'white' : '#475569',
                                }}
                            >
                                {m === 'person' ? '👤 Personne' : '👥 Groupe de /ticket'}
                            </button>
                        ))}
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div style={{ position: 'relative' }}>
                        <label style={miniLabel}>Affecter à</label>
                        {row.mode === 'person' ? (
                            row.personUsername ? (
                                <div style={fixedPersonStyle} title="Personne trouvée dans l'AD et sélectionnée">
                                    <CheckCircle2 size={15} style={{ color: '#16a34a', flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, color: '#166534', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {row.personDisplayName}
                                        </div>
                                        <div style={{ fontSize: 10.5, color: '#15803D', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {row.personEmail || row.personUsername} · fixé (AD) ✓
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onChange({ personUsername: '', personEmail: '', personDisplayName: '' })}
                                        style={changeBtnStyle}
                                        title="Retirer cette personne et en choisir une autre"
                                    >
                                        Changer
                                    </button>
                                </div>
                            ) : (
                            <>
                                <input
                                    type="text"
                                    placeholder="Rechercher dans l'AD (sinon texte libre)…"
                                    value={row.personDisplayName}
                                    onChange={e => {
                                        onChange({ personDisplayName: e.target.value, personUsername: '', personEmail: '' });
                                        ad.setQuery(e.target.value);
                                    }}
                                    style={{ ...inputStyle, borderColor: '#e2e8f0' }}
                                />
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
                            )
                        ) : (
                            <div style={{ position: 'relative' }}>
                                <select
                                    value={row.groupId}
                                    onChange={e => onChange({ groupId: e.target.value ? Number(e.target.value) : '' })}
                                    disabled={groupsLoading}
                                    style={{ ...inputStyle, appearance: 'none', paddingRight: 26 }}
                                >
                                    <option value="">— Sélectionnez un groupe de /ticket —</option>
                                    {groups.map(g => (
                                        <option key={g.id} value={g.id}>
                                            {g.name} ({g.members.length} membre{g.members.length > 1 ? 's' : ''})
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={13} style={{ position: 'absolute', right: 8, top: 10, color: '#64748b', pointerEvents: 'none' }} />
                            </div>
                        )}
                    </div>
                    <div>
                        <label style={miniLabel}>Échéance</label>
                        <input
                            type="date"
                            style={inputStyle}
                            value={row.echeance}
                            onChange={e => onChange({ echeance: e.target.value })}
                        />
                    </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                    Demandeur : {row.requester || '—'}{row.aiHint ? ` · échéance IA : "${row.aiHint}"` : ''}
                </div>
            </div>
        </div>
    );
};

interface Props {
    meetingId: number;
    meetingTitle: string;
    tasks: AiTask[];
    agents: DsiAgent[];
    token: string;
    isGuest: boolean;
    onClose: () => void;
    onValidated: () => void;
}

const TaskValidationModal: React.FC<Props> = ({ meetingId, meetingTitle, tasks, agents, token, isGuest, onClose, onValidated }) => {
    const [rows, setRows] = useState<Row[]>(tasks.map(t => {
        const matchedAgent = t.assignee_username ? agents.find(a => a.username === t.assignee_username) : undefined;
        return {
            id: t.id,
            include: !!t.assignee_username,
            description: t.description,
            requester: t.requester || '',
            echeance: isIsoDate(t.deadline) ? t.deadline : '',
            aiHint: t.deadline || '',
            mode: 'person',
            personUsername: t.assignee_username || '',
            personDisplayName: matchedAgent?.nom || t.assignee || '',
            personEmail: matchedAgent?.email || '',
            groupId: '',
        };
    }));
    const [groups, setGroups] = useState<TicketGroup[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);

    useEffect(() => {
        setGroupsLoading(true);
        axios.get('/api/tasks/ticket-groups', { headers: { Authorization: `Bearer ${token}` } })
            .then(res => setGroups(Array.isArray(res.data) ? res.data : []))
            .catch(() => {})
            .finally(() => setGroupsLoading(false));
    }, [token]);

    const updateRow = (id: number, patch: Partial<Row>) => {
        setRows(rows.map(r => r.id === id ? { ...r, ...patch } : r));
    };

    const handleSubmit = async () => {
        const toCreate = rows.filter(r =>
            r.include && r.description.trim() &&
            ((r.mode === 'person' && (r.personUsername || r.personDisplayName.trim())) || (r.mode === 'group' && r.groupId !== ''))
        );
        if (toCreate.length === 0) {
            alert("Sélectionnez au moins une tâche avec un destinataire (personne ou groupe de /ticket).");
            return;
        }
        setSubmitting(true);
        let ok = 0, failed = 0;
        for (const row of toCreate) {
            try {
                const body: Record<string, unknown> = {
                    description: row.description.trim(),
                    echeance: row.echeance || null,
                    context_source: 'transcript',
                    context_id: meetingId,
                    context_title: meetingTitle,
                };
                if (row.mode === 'group') {
                    body.ticket_group_id = Number(row.groupId);
                } else {
                    // Personne fixée dans l'AD, sinon nom en texte libre.
                    body.assignees = [row.personUsername || row.personDisplayName.trim()];
                }
                const created = await axios.post('/api/tasks', body, { headers: { Authorization: `Bearer ${token}` } });
                // Affectation à un groupe -> plusieurs lignes créées (une par
                // membre) : on ne peut rattacher transcript_tasks.app_task_id
                // qu'à une seule ; on prend la première.
                const appTaskId = Array.isArray(created.data) ? created.data[0]?.id : created.data?.id;
                if (appTaskId) {
                    await axios.patch(`/api/transcriptmanager/task/${row.id}/link-app-task`, { app_task_id: appTaskId }, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                }
                ok++;
            } catch (err) {
                console.error(err);
                failed++;
            }
        }
        setSubmitting(false);
        setResult({ ok, failed });
        onValidated();
    };

    return (
        <div style={overlay}>
            <div style={modal}>
                <div style={header}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Proposer les tâches identifiées</h3>
                    <button onClick={onClose} style={closeBtn}><X size={18} /></button>
                </div>
                <div style={{ padding: '0 1.5rem 0.5rem', color: '#64748B', fontSize: '0.85rem' }}>
                    Vérifiez les tâches reconnues par l'IA. Dès qu'un nom est proposé, la personne est recherchée dans l'AD et fixée si le rapprochement est fiable.
                    {isGuest
                        ? " En accès direct, l'affectation se fait uniquement à une personne."
                        : ' Affectez à une personne (recherche AD) ou à un groupe de /ticket — même principe que dans le module Tâches.'}
                </div>
                <div style={body}>
                    {rows.length === 0 && <p style={{ color: '#94A3B8' }}>Aucune tâche à proposer.</p>}
                    {rows.map(row => (
                        <AssignmentRow
                            key={row.id}
                            row={row}
                            isGuest={isGuest}
                            groups={groups}
                            groupsLoading={groupsLoading}
                            token={token}
                            onChange={patch => updateRow(row.id, patch)}
                        />
                    ))}
                </div>
                {result && (
                    <div style={{ padding: '0 1.5rem', fontSize: '0.85rem', color: result.failed ? '#B91C1C' : '#15803D', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={14} /> {result.ok} tâche(s) créée(s){result.failed ? `, ${result.failed} échec(s)` : ''}.
                    </div>
                )}
                <div style={footer}>
                    <button onClick={onClose} style={btnCancel}>Fermer</button>
                    <button onClick={handleSubmit} disabled={submitting} style={btnValidate}>
                        <Users size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                        {submitting ? 'Création…' : 'Valider et créer les tâches'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const overlay: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15, 23, 42, 0.6)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 1100,
};
const modal: React.CSSProperties = {
    background: 'white', borderRadius: 16, width: '90%', maxWidth: 820,
    maxHeight: '85vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden',
};
const header: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '1.25rem 1.5rem 0.5rem',
};
const closeBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' };
const body: React.CSSProperties = { padding: '1rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' };
const rowStyle: React.CSSProperties = {
    display: 'flex', gap: '0.75rem', padding: '0.75rem', border: '1px solid #E2E8F0', borderRadius: 10,
};
const inputStyle: React.CSSProperties = {
    width: '100%', border: '1px solid #E2E8F0', borderRadius: 8, padding: '0.4rem 0.6rem',
    fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
const miniLabel: React.CSSProperties = { fontSize: '0.7rem', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 2 };
const fixedPersonStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    border: '1.5px solid #16a34a', background: '#F0FDF4',
    borderRadius: 8, padding: '0.4rem 0.6rem',
};
const changeBtnStyle: React.CSSProperties = {
    background: 'white', border: '1px solid #86EFAC', color: '#15803D',
    borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
};
const dropdownStyle: React.CSSProperties = {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'white',
    border: '1px solid #bfdbfe', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    maxHeight: 160, overflowY: 'auto', marginTop: 2,
};
const dropdownItemStyle: React.CSSProperties = {
    padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 12,
    display: 'flex', alignItems: 'center', gap: 8,
};
const footer: React.CSSProperties = {
    display: 'flex', justifyContent: 'flex-end', gap: '0.75rem',
    padding: '1rem 1.5rem', borderTop: '1px solid #F1F5F9',
};
const btnCancel: React.CSSProperties = {
    background: '#F1F5F9', color: '#64748B', border: 'none', padding: '0.6rem 1.25rem',
    borderRadius: 8, fontWeight: 600, cursor: 'pointer',
};
const btnValidate: React.CSSProperties = {
    background: '#DC2626', color: 'white', border: 'none', padding: '0.6rem 1.25rem',
    borderRadius: 8, fontWeight: 600, cursor: 'pointer',
};

export default TaskValidationModal;