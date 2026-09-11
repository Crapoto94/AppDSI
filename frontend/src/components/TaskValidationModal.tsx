import React, { useState } from 'react';
import axios from 'axios';
import { X, CheckCircle2, AlertTriangle } from 'lucide-react';

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

interface Row {
    id: number;
    include: boolean;
    description: string;
    requester: string;
    assignee_username: string;
    echeance: string; // YYYY-MM-DD ou ''
    aiHint: string; // ce que l'IA a écrit pour l'échéance (indicatif)
    matched: boolean;
}

function isIsoDate(s: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test((s || '').trim());
}

interface Props {
    meetingId: number;
    meetingTitle: string;
    tasks: AiTask[];
    agents: DsiAgent[];
    token: string;
    onClose: () => void;
    onValidated: () => void;
}

const TaskValidationModal: React.FC<Props> = ({ meetingId, meetingTitle, tasks, agents, token, onClose, onValidated }) => {
    const [rows, setRows] = useState<Row[]>(tasks.map(t => ({
        id: t.id,
        include: !!t.assignee_username,
        description: t.description,
        requester: t.requester || '',
        assignee_username: t.assignee_username || '',
        echeance: isIsoDate(t.deadline) ? t.deadline : '',
        aiHint: t.deadline || '',
        matched: !!t.assignee_username,
    })));
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);

    const updateRow = (id: number, patch: Partial<Row>) => {
        setRows(rows.map(r => r.id === id ? { ...r, ...patch } : r));
    };

    const handleSubmit = async () => {
        const toCreate = rows.filter(r => r.include && r.assignee_username && r.description.trim());
        if (toCreate.length === 0) {
            alert("Sélectionnez au moins une tâche avec un destinataire.");
            return;
        }
        setSubmitting(true);
        let ok = 0, failed = 0;
        for (const row of toCreate) {
            try {
                const created = await axios.post('/api/tasks', {
                    description: row.description.trim(),
                    echeance: row.echeance || null,
                    context_source: 'transcript',
                    context_id: meetingId,
                    context_title: meetingTitle,
                    assignees: [row.assignee_username],
                }, { headers: { Authorization: `Bearer ${token}` } });
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
                    Vérifiez les tâches reconnues par l'IA et leur destinataire (rapproché des agents DSI) avant de les créer dans l'application. Vous pouvez modifier le texte, réassigner ou décocher une tâche.
                </div>
                <div style={body}>
                    {rows.length === 0 && <p style={{ color: '#94A3B8' }}>Aucune tâche à proposer.</p>}
                    {rows.map(row => (
                        <div key={row.id} style={{ ...rowStyle, opacity: row.include ? 1 : 0.55 }}>
                            <input
                                type="checkbox"
                                checked={row.include}
                                onChange={e => updateRow(row.id, { include: e.target.checked })}
                                style={{ marginTop: 6 }}
                            />
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <input
                                    style={inputStyle}
                                    value={row.description}
                                    onChange={e => updateRow(row.id, { description: e.target.value })}
                                    placeholder="Description de la tâche"
                                />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                    <div>
                                        <label style={miniLabel}>
                                            Destinataire
                                            {!row.matched && row.assignee_username === '' && (
                                                <span style={{ color: '#D97706', marginLeft: 4 }} title="Aucune correspondance automatique trouvée">
                                                    <AlertTriangle size={11} style={{ verticalAlign: -1 }} />
                                                </span>
                                            )}
                                        </label>
                                        <select
                                            style={inputStyle}
                                            value={row.assignee_username}
                                            onChange={e => updateRow(row.id, { assignee_username: e.target.value })}
                                        >
                                            <option value="">-- Non assigné --</option>
                                            {agents.map(a => (
                                                <option key={a.username} value={a.username}>{a.nom}{a.service ? ` (${a.service})` : ''}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={miniLabel}>Échéance</label>
                                        <input
                                            type="date"
                                            style={inputStyle}
                                            value={row.echeance}
                                            onChange={e => updateRow(row.id, { echeance: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label style={miniLabel}>Demandeur / indication IA</label>
                                        <div style={{ fontSize: '0.75rem', color: '#94A3B8', paddingTop: 6 }}>
                                            {row.requester || '—'}{row.aiHint ? ` · échéance IA: "${row.aiHint}"` : ''}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
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
    fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit',
};
const miniLabel: React.CSSProperties = { fontSize: '0.7rem', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 2 };
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
