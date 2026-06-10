import React, { useState, useRef } from 'react';
import { Pencil, Trash2, CheckCircle2, Upload, X } from 'lucide-react';

export interface ProjetTask {
  id: string;
  tache: string;
  responsable?: string;
  responsable_username?: string;
  created_by_username?: string;
  echeance?: string | null;
  statut: string;
  source: string;
  notes?: TaskNote[];
  reunion_id?: number | null;
  reunion_titre?: string | null;
}

export interface TaskNote {
  id?: string | number;
  content?: string;
  filename?: string;
  type?: 'comment' | 'file';
  created_by?: string;
  created_at?: string;
}

export interface TaskTableProps {
  tasks: ProjetTask[];
  currentUsername?: string;
  isChefProjet?: boolean;
  token: string | null;
  projetId: number;
  onReload: () => void;
  onVoirReunion?: (id: number) => void;
  sortField?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (field: string) => void;
}

const STATUT_CYCLE = ['a_faire', 'en_cours', 'terminee', 'refuse'];
const TERMINAL_STATUTS = ['terminee', 'terminé', 'terminée'];

const STATUT_CFG: Record<string, { bg: string; color: string; label: string }> = {
  a_faire:  { bg: '#f1f5f9', color: '#64748b', label: 'À faire' },
  en_cours: { bg: '#dbeafe', color: '#1d4ed8', label: 'En cours' },
  terminee: { bg: '#dcfce7', color: '#16a34a', label: 'Terminée' },
  terminé:  { bg: '#dcfce7', color: '#16a34a', label: 'Terminée' },
  refuse:   { bg: '#fee2e2', color: '#dc2626', label: 'Refusé' },
  en_erreur:{ bg: '#fef3c7', color: '#92400e', label: 'En erreur' },
};

function statusBadge(statut: string) {
  const c = STATUT_CFG[statut] || STATUT_CFG.a_faire;
  return (
    <span style={{ padding: '3px 10px', borderRadius: 10, background: c.bg, color: c.color, fontWeight: 600, fontSize: 11 }}>
      {c.label}
    </span>
  );
}

function actionColor(statut: string): string {
  switch (statut) {
    case 'en_cours': return '#1d4ed8';
    case 'terminee': case 'terminé': return '#16a34a';
    case 'refuse':   return '#dc2626';
    default:         return '#64748b';
  }
}

function daysUntil(echeance?: string | null): number | null {
  if (!echeance) return null;
  const d = new Date(echeance);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - now.getTime()) / 86400000);
}

const STATUT_OPTIONS = [
  { value: 'a_faire',   label: 'À faire' },
  { value: 'en_cours',  label: 'En cours' },
  { value: 'terminee',  label: 'Terminée' },
  { value: 'refuse',    label: 'Refusé' },
  { value: 'en_erreur', label: 'En erreur' },
];

export const TaskTable: React.FC<TaskTableProps> = ({
  tasks, currentUsername, isChefProjet, token, projetId, onReload, onVoirReunion,
  sortField, sortDir, onSort,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ tache: '', responsable: '', echeance: '', statut: 'a_faire' });
  const [expandedNotesId, setExpandedNotesId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [uploadingNote, setUploadingNote] = useState(false);
  const [noteTaskRef, setNoteTaskRef] = useState<ProjetTask | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cu = (currentUsername || '').toLowerCase();

  const canEdit = (t: ProjetTask): boolean => {
    if (isChefProjet) return true;
    if (t.source === 'standalone') {
      return (t.created_by_username || '').toLowerCase() === cu
        || (t.responsable_username || '').toLowerCase() === cu
        || (t.responsable || '').toLowerCase() === cu;
    }
    return false;
  };

  const startEdit = (t: ProjetTask) => {
    setEditingId(t.id);
    setEditForm({ tache: t.tache || '', responsable: t.responsable || '', echeance: (t.echeance || '').slice(0, 10), statut: t.statut || 'a_faire' });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const tache = editForm.tache.trim();
    if (!tache) { alert('Le texte de la tâche est obligatoire'); return; }
    try {
      const r = await fetch(`/api/projets/${projetId}/taches-agregees/${editingId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, tache, echeance: editForm.echeance || null }),
      });
      if (r.ok) { setEditingId(null); onReload(); }
      else { const e = await r.json(); alert(`Erreur : ${e.error}`); }
    } catch { alert('Erreur réseau'); }
  };

  const cycleStatut = async (t: ProjetTask) => {
    const idx = STATUT_CYCLE.indexOf(t.statut || 'a_faire');
    const next = STATUT_CYCLE[(idx + 1) % STATUT_CYCLE.length];
    try {
      const r = await fetch(`/api/projets/${projetId}/taches-agregees/${t.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: next }),
      });
      if (r.ok) onReload();
    } catch {}
  };

  const supprimerTache = async (t: ProjetTask) => {
    if (!window.confirm(`Supprimer la tâche "${t.tache}" ?`)) return;
    try {
      const r = await fetch(`/api/projets/${projetId}/taches-agregees/${t.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) onReload();
      else { const e = await r.json(); alert(`Erreur : ${e.error}`); }
    } catch {}
  };

  const ajouterNote = async (t: ProjetTask) => {
    if (!noteInput.trim()) return;
    try {
      const r = await fetch(`/api/projets/${projetId}/taches-agregees/${t.id}/notes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteInput, type: 'comment' }),
      });
      if (r.ok) { setNoteInput(''); onReload(); }
      else { const e = await r.json(); alert(`Erreur : ${e.error}`); }
    } catch { alert('Erreur réseau'); }
  };

  const triggerFileUpload = (t: ProjetTask) => {
    setNoteTaskRef(t);
    fileInputRef.current?.click();
  };

  const uploadNoteFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !noteTaskRef) return;
    setUploadingNote(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`/api/projets/${projetId}/taches-agregees/${noteTaskRef.id}/notes/file`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (r.ok) onReload();
      else { const e = await r.json(); alert(`Erreur : ${e.error}`); }
    } catch { alert('Erreur réseau'); }
    finally { setUploadingNote(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const supprimerNote = async (t: ProjetTask, ni: number) => {
    if (!window.confirm('Supprimer cette note ?')) return;
    try {
      await fetch(`/api/projets/${projetId}/taches-agregees/${t.id}/notes/${ni}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      onReload();
    } catch {}
  };

  const colTh = (field: string, label: string, w?: number) => {
    const active = sortField === field;
    return (
      <th
        onClick={() => onSort?.(field)}
        style={{
          padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569',
          fontSize: 12, textTransform: 'uppercase' as const, cursor: onSort ? 'pointer' : 'default',
          userSelect: 'none' as const, borderBottom: '2px solid #e2e8f0', background: '#f8fafc',
          ...(w ? { width: w } : {}),
        }}
      >
        {label} {active && (sortDir === 'asc' ? '▲' : '▼')}
      </th>
    );
  };

  if (tasks.length === 0) return null;

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={uploadNoteFile} />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {colTh('tache', 'Tâche')}
            {colTh('responsable', 'Responsable', 160)}
            {colTh('echeance', 'Échéance', 120)}
            {colTh('statut', 'Statut', 110)}
            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', width: 120 }}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.flatMap(t => {
            const rows: React.ReactNode[] = [];
            const isDone = TERMINAL_STATUTS.includes(t.statut);
            const isOverdue = !isDone && (daysUntil(t.echeance) ?? 1) < 0;
            const noteCount = (t.notes || []).length;
            const isExpanded = expandedNotesId === t.id;
            const editable = canEdit(t);

            if (editingId === t.id) {
              rows.push(
                <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', background: '#fff7ed' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <input
                      autoFocus
                      type="text"
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12 }}
                      value={editForm.tache}
                      onChange={e => setEditForm(v => ({ ...v, tache: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                    />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input
                      type="text"
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12 }}
                      value={editForm.responsable}
                      onChange={e => setEditForm(v => ({ ...v, responsable: e.target.value }))}
                    />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input
                      type="date"
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12 }}
                      value={editForm.echeance}
                      onChange={e => setEditForm(v => ({ ...v, echeance: e.target.value }))}
                    />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <select
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12 }}
                      value={editForm.statut}
                      onChange={e => setEditForm(v => ({ ...v, statut: e.target.value }))}
                    >
                      {STATUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button onClick={saveEdit} style={{ padding: '4px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 11, marginRight: 4 }}>OK</button>
                    <button onClick={() => setEditingId(null)} style={{ padding: '4px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 11 }}>Annuler</button>
                  </td>
                </tr>
              );
            } else {
              rows.push(
                <tr
                  key={t.id}
                  style={{
                    borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9',
                    background: t.statut === 'refuse' ? '#fef2f2' : isDone ? '#f0fdf4' : isOverdue ? '#fff8f8' : 'white',
                    borderLeft: `4px solid ${t.statut === 'refuse' ? '#ef4444' : isOverdue ? '#ef4444' : isDone ? '#22c55e' : 'transparent'}`,
                    opacity: isDone ? 0.8 : 1,
                  }}
                >
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: isDone ? '#94a3b8' : '#1e293b', textDecoration: isDone ? 'line-through' : 'none' }}>
                    {t.source === 'reunion' && t.reunion_titre ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14, cursor: 'pointer' }} title={t.reunion_titre} onClick={() => t.reunion_id && onVoirReunion?.(t.reunion_id)}>📅</span>
                        <span>{t.tache}</span>
                      </span>
                    ) : t.tache}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>{t.responsable || '—'}</td>
                  <td style={{ padding: '10px 12px', color: isOverdue ? '#ef4444' : '#64748b', fontWeight: isOverdue ? 600 : 400 }}>
                    {t.echeance ? new Date(t.echeance).toLocaleDateString('fr-FR') : '—'}
                    {isOverdue && <span style={{ marginLeft: 4, fontSize: 10 }}>⚠</span>}
                  </td>
                  <td style={{ padding: '10px 12px' }}>{statusBadge(t.statut || 'a_faire')}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => cycleStatut(t)}
                      title={`Passer à : ${STATUT_CYCLE[(STATUT_CYCLE.indexOf(t.statut || 'a_faire') + 1) % STATUT_CYCLE.length]}`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: actionColor(t.statut), padding: 4, verticalAlign: 'middle' }}
                    >
                      <CheckCircle2 size={18} />
                    </button>
                    <button
                      onClick={() => setExpandedNotesId(expandedNotesId === t.id ? null : t.id)}
                      title={`${noteCount} note(s)`}
                      style={{
                        background: noteCount > 0 ? '#eff6ff' : 'transparent',
                        border: noteCount > 0 ? '1px solid #bfdbfe' : 'none',
                        borderRadius: 4, cursor: 'pointer',
                        color: isExpanded ? '#2563eb' : noteCount > 0 ? '#1d4ed8' : '#94a3b8',
                        padding: '2px 5px', marginLeft: 2,
                        fontWeight: noteCount > 0 ? 700 : 400, fontSize: 11,
                        lineHeight: '18px', verticalAlign: 'middle',
                      }}
                    >
                      💬 {noteCount || '+'}
                    </button>
                    {editable && (
                      <button
                        onClick={() => startEdit(t)}
                        title="Modifier"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', padding: 4, marginLeft: 2, verticalAlign: 'middle' }}
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    {editable && (
                      <button
                        onClick={() => supprimerTache(t)}
                        title="Supprimer"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, marginLeft: 2, verticalAlign: 'middle' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );

              if (isExpanded) {
                rows.push(
                  <tr key={`${t.id}-notes`}>
                    <td colSpan={5} style={{ padding: '4px 12px 8px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {noteCount === 0 && (
                          <div style={{ fontSize: 11, color: '#94a3b8', padding: '4px 0' }}>Aucune note pour l'instant.</div>
                        )}
                        {(t.notes || []).map((n: TaskNote, ni: number) => (
                          <div key={n.id || ni} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 11, borderBottom: ni < noteCount - 1 ? '1px solid #f1f5f9' : 'none' }}>
                            {n.type === 'file' ? (
                              <a
                                href={`/api/projets/${projetId}/taches-agregees/${t.id}/notes/${ni}/file?mode=inline&token=${token}`}
                                target="_blank" rel="noopener noreferrer"
                                style={{ flex: 1, color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                <Upload size={10} /> {n.filename || n.content}
                              </a>
                            ) : (
                              <span style={{ flex: 1, color: '#1e293b' }}>{n.content}</span>
                            )}
                            <span style={{ fontSize: 9, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                              {n.created_by && `${n.created_by} · `}{n.created_at ? new Date(n.created_at).toLocaleDateString('fr-FR') : ''}
                            </span>
                            <button
                              onClick={() => supprimerNote(t, ni)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 1, lineHeight: 1 }}
                              title="Supprimer"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                          <input
                            type="text"
                            placeholder="Note..."
                            style={{ flex: 1, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 11 }}
                            value={noteInput}
                            onChange={e => setNoteInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') ajouterNote(t); }}
                          />
                          <button
                            onClick={() => ajouterNote(t)}
                            style={{ padding: '4px 8px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}
                          >
                            Ajouter
                          </button>
                          <button
                            onClick={() => triggerFileUpload(t)}
                            disabled={uploadingNote}
                            style={{ padding: '4px 8px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}
                          >
                            <Upload size={11} /> {uploadingNote ? '...' : 'Fichier'}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              }
            }

            return rows;
          })}
        </tbody>
      </table>
    </div>
  );
};
