import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import {
  CheckSquare, Clock, AlertTriangle, CheckCircle2,
  FolderKanban, MessageSquare, Users, RotateCcw, Filter,
  ExternalLink, RefreshCw, Inbox, Plus, X, Trash2, Upload,
  RefreshCcw, Zap, XCircle, Send, BarChart2, ChevronDown, ChevronUp, Star, Pencil, Globe, Lock,
} from 'lucide-react';
import AddTaskModal from '../components/AddTaskModal';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface TaskNote {
  id: number;
  source: string;
  task_id: string;
  content: string | null;
  type: 'comment' | 'file';
  filename: string | null;
  filepath: string | null;
  created_by: string;
  created_at: string;
}

interface Task {
  source: 'personal' | 'transcript' | 'projet' | 'projet_standalone' | 'rencontre' | 'revue' | 'reunion' | 'todo' | 'ticket';
  id: number;
  source_id: number | null;
  source_title: string;
  description: string;
  echeance: string | null;
  statut: string;
  responsable: string;
  created_at: string;
  updated_at: string | null;
  note_count: number;
  is_team_task?: boolean;
  team_group_id?: string | null;
  created_by?: string | null;
  refus_raison?: string | null;
  is_favorite?: boolean;
  priority?: string;
  is_public?: boolean;
}

interface AssignedAssignee {
  username: string;
  name: string;
  statut: string;
  refus_raison?: string | null;
}

interface AssignedTask {
  id: number;
  responsable: string;
  description: string;
  echeance: string | null;
  statut: string;
  created_at: string;
  updated_at: string | null;
  source: string;
  source_title: string;
  refus_raison?: string | null;
  is_team_task?: boolean;
  team_group_id?: string | null;
  priority?: string;
  is_public?: boolean;
  assignee_count?: number;
  assignees?: AssignedAssignee[];
}

interface KpiPoint {
  date: string;
  creees: number;
  terminees: number;
}

const SOURCE_META: Record<Task['source'], {
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  urlFn: (id: number | null) => string | null;
}> = {
  personal:          { label: 'Personnel',    icon: <CheckSquare size={12} />, color: '#475569', bg: '#f1f5f9', urlFn: () => null },
  transcript:        { label: 'Transcript',   icon: <MessageSquare size={12} />, color: '#7c3aed', bg: '#ede9fe', urlFn: () => '/transcriptmanager' },
  projet:            { label: 'Projet',       icon: <FolderKanban size={12} />, color: '#2563eb', bg: '#dbeafe', urlFn: (id) => id ? `/projets/${id}` : null },
  projet_standalone: { label: 'Projet',       icon: <FolderKanban size={12} />, color: '#2563eb', bg: '#dbeafe', urlFn: (id) => id ? `/projets/${id}` : null },
  rencontre:         { label: 'Réunion BUD',  icon: <Users size={12} />,        color: '#d97706', bg: '#fef3c7', urlFn: () => '/rencontres-budgetaires' },
  revue:             { label: 'Revue',        icon: <RotateCcw size={12} />,    color: '#059669', bg: '#d1fae5', urlFn: () => '/revue-de-projets' },
  reunion:           { label: 'Réunion',      icon: <Users size={12} />,        color: '#0891b2', bg: '#cffafe', urlFn: () => '/mes-reunions' },
  todo:              { label: 'Microsoft Todo', icon: <Inbox size={12} />,      color: '#2563eb', bg: '#eff6ff', urlFn: () => null },
  ticket:            { label: 'Ticket',        icon: <Inbox size={12} />,       color: '#6366f1', bg: '#eef2ff',  urlFn: (id) => id ? `/tickets/${id}` : null },
};

const STATUT_CYCLE = ['a_faire', 'en_cours', 'terminé'] as const;
const TERMINAL_STATUTS = ['terminé', 'terminee', 'refuse'];

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.floor((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
}

function EcheanceBadge({ d }: { d: string | null }) {
  const n = daysUntil(d);
  if (n === null) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>;
  const date = new Date(d!).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  if (n < 0)  return <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>⚠ {date}</span>;
  if (n === 0) return <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Aujourd'hui</span>;
  if (n <= 7)  return <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{date} ({n}j)</span>;
  return <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 20, fontSize: 11 }}>{date}</span>;
}

function SourceChip({ task }: { task: Task }) {
  const navigate = useNavigate();
  const meta = SOURCE_META[task.source] ?? SOURCE_META['personal'];
  const url = meta.urlFn(task.source_id);
  return (
    <button
      onClick={() => url && navigate(url)}
      title={url ? `Ouvrir : ${task.source_title}` : task.source_title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: meta.bg, color: meta.color,
        border: 'none', borderRadius: 20, padding: '2px 8px',
        fontSize: 11, fontWeight: 600, cursor: url ? 'pointer' : 'default',
        maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
      }}
    >
      {meta.icon}
      {meta.label}{task.source !== 'personal' ? ` · ${task.source_title || '—'}` : ''}
      {url && <ExternalLink size={10} />}
    </button>
  );
}

function statusBadge(statut: string) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    a_faire:  { bg: '#f1f5f9', color: '#64748b', label: 'À faire' },
    en_cours: { bg: '#dbeafe', color: '#1d4ed8', label: 'En cours' },
    terminé:  { bg: '#dcfce7', color: '#16a34a', label: 'Terminé' },
    terminee: { bg: '#dcfce7', color: '#16a34a', label: 'Terminé' },
    refuse:   { bg: '#fee2e2', color: '#dc2626', label: 'Refusé' },
  };
  const c = cfg[statut] || cfg.a_faire;
  return (
    <span style={{ padding: '3px 10px', borderRadius: 10, background: c.bg, color: c.color, fontWeight: 600, fontSize: 11 }}>
      {c.label}
    </span>
  );
}

const PRIORITY_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  basse:   { bg: '#f0fdf4', color: '#16a34a', label: '↓ Basse' },
  normale: { bg: '#f8fafc', color: '#64748b', label: '— Normale' },
  haute:   { bg: '#fef2f2', color: '#dc2626', label: '↑ Haute' },
};

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority || priority === 'normale') return null;
  const c = PRIORITY_COLORS[priority] || PRIORITY_COLORS.normale;
  return (
    <span style={{ padding: '1px 7px', borderRadius: 6, background: c.bg, color: c.color, fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  );
}

function actionColor(statut: string) {
  if (statut === 'en_cours') return '#1d4ed8';
  if (statut === 'terminé' || statut === 'terminee') return '#16a34a';
  return '#64748b';
}

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span style={{ background: '#ef4444', color: 'white', borderRadius: 10, padding: '0 5px', fontSize: 10, fontWeight: 700, lineHeight: '16px', minWidth: 16, display: 'inline-block', textAlign: 'center', marginLeft: 3 }}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', background: checked ? '#16a34a' : '#cbd5e1', transition: 'background 0.2s', position: 'relative', flexShrink: 0 }}
    >
      <span style={{ position: 'absolute', top: 3, left: checked ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', display: 'block' }} />
    </button>
  );
}

// ─── Confirmation modal ───────────────────────────────────────────────────────
function ConfirmationModal({ title, message, confirmText = 'Confirmer', cancelText = 'Annuler', onConfirm, onClose, isDangerous = false }: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onClose: () => void;
  isDangerous?: boolean;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', zIndex: 9300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <h3 style={{ margin: '0 0 6px', color: isDangerous ? '#dc2626' : '#1e293b', fontSize: 16, fontWeight: 800 }}>
          {isDangerous && <XCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />}
          {title}
        </h3>
        <p style={{ margin: '6px 0 20px', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', border: '1px solid #e2e8f0', borderRadius: 8, background: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#64748b' }}>
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 8, background: isDangerous ? '#dc2626' : '#2563eb', cursor: 'pointer', color: 'white', fontWeight: 700, fontSize: 13 }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Refuse modal ─────────────────────────────────────────────────────────────
function RefuseModal({ task, onConfirm, onClose }: {
  task: Task;
  onConfirm: (raison: string) => void;
  onClose: () => void;
}) {
  const [raison, setRaison] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', zIndex: 9300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <h3 style={{ margin: '0 0 6px', color: '#dc2626', fontSize: 16, fontWeight: 800 }}>
          <XCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Refuser la tâche
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: '#475569' }}>
          <strong>"{task.description}"</strong>
        </p>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>
          Motif du refus
        </label>
        <textarea
          value={raison}
          onChange={e => setRaison(e.target.value)}
          placeholder="Expliquez pourquoi vous refusez cette tâche..."
          autoFocus
          rows={3}
          style={{ width: '100%', borderRadius: 8, border: '1px solid #e2e8f0', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', border: '1px solid #e2e8f0', borderRadius: 8, background: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#64748b' }}>
            Annuler
          </button>
          <button
            onClick={() => raison.trim() && onConfirm(raison.trim())}
            disabled={!raison.trim()}
            style={{ flex: 2, padding: '9px', border: 'none', borderRadius: 8, background: raison.trim() ? '#dc2626' : '#e2e8f0', cursor: raison.trim() ? 'pointer' : 'not-allowed', color: raison.trim() ? 'white' : '#94a3b8', fontWeight: 700, fontSize: 13 }}
          >
            Confirmer le refus
          </button>
        </div>
      </div>
    </div>
  );
}

const MesTaches: React.FC = () => {
  const { token, user } = useAuth();
  const currentUsername = user?.username || '';

  // ── Tasks ────────────────────────────────────────────────────────────────────
  const [tasks, setTasks]           = useState<Task[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterStatut, setFilterStatut] = useState<string>('pending');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [updating, setUpdating]     = useState<string | null>(null);

  // ── Sort ─────────────────────────────────────────────────────────────────────
  const [sortField, setSortField]   = useState<string>('echeance');
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('asc');

  // ── Notes ────────────────────────────────────────────────────────────────────
  const [expandedNotesId, setExpandedNotesId] = useState<string | null>(null);
  const [notesMap, setNotesMap]     = useState<Record<string, TaskNote[]>>({});
  const [noteInput, setNoteInput]   = useState('');
  const [uploadingNote, setUploadingNote] = useState(false);
  const [noteTaskRef, setNoteTaskRef] = useState<Task | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Add task modal ───────────────────────────────────────────────────────────
  const [showModal, setShowModal]   = useState(false);

  // ── Refuse modal ─────────────────────────────────────────────────────────────
  const [refuseTask, setRefuseTask] = useState<Task | null>(null);

  // ── Confirmation modal ────────────────────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void; isDangerous?: boolean } | null>(null);

  // ── Alert pref (daily recap) ────────────────────────────────────────────
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertLoading, setAlertLoading] = useState(false);
  const [testSending, setTestSending]   = useState(false);
  const [testMsg, setTestMsg]           = useState<{ ok: boolean; text: string } | null>(null);
  // ── Assign alert (immediate on assignment) ──────────────────────────────
  const [assignAlertEnabled, setAssignAlertEnabled] = useState(false);
  const [assignAlertLoading, setAssignAlertLoading] = useState(false);

  // ── MS Todo sync ─────────────────────────────────────────────────────────────
  const [todoEnabled, setTodoEnabled]   = useState(false);
  const [todoLoading, setTodoLoading]   = useState(false);
  const [todoRunning, setTodoRunning]   = useState(false);
  const [todoResult, setTodoResult]     = useState<{ ok: boolean; text: string } | null>(null);

  // ── Assigned by me ───────────────────────────────────────────────────────────
  const [showAssigned, setShowAssigned]   = useState(false);
  const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
  const [assignedLoading, setAssignedLoading] = useState(false);

  // ── KPI history chart ─────────────────────────────────────────────────────────
  const [showChart, setShowChart]       = useState(false);
  const [kpiHistory, setKpiHistory]     = useState<KpiPoint[]>([]);
  const [kpiLoading, setKpiLoading]     = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ─── Fetchers ─────────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch { setTasks([]); }
    finally { setLoading(false); }
  }, [token]);

  const fetchAlertPref = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks/alert-pref', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setAlertEnabled(data.enabled === true);
    } catch { /* ignore */ }
  }, [token]);

  const fetchAssignAlertPref = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks/assign-alert-pref', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setAssignAlertEnabled(data.enabled === true);
    } catch { /* ignore */ }
  }, [token]);

  const fetchTodoPref = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks/todo-sync', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setTodoEnabled(data.enabled === true);
    } catch { /* ignore */ }
  }, [token]);

  const fetchAssigned = async () => {
    setAssignedLoading(true);
    try {
      const res = await fetch('/api/tasks/assigned-by-me', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setAssignedTasks(Array.isArray(data) ? data : []);
    } catch { setAssignedTasks([]); }
    finally { setAssignedLoading(false); }
  };

  // ── Édition d'une tâche que j'ai créée (perso ou affectée) ───────────────────
  const [editData, setEditData] = useState<{ id: number; description: string; echeance: string; priority: string; is_public: boolean; isTeam: boolean } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const saveEdit = async () => {
    if (!editData) return;
    if (!editData.description.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/tasks/edit/${editData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ description: editData.description.trim(), echeance: editData.echeance || null, priority: editData.priority, is_public: editData.is_public }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || 'Erreur lors de la modification'); }
      else { setEditData(null); fetchTasks(); if (showAssigned) fetchAssigned(); }
    } catch { alert('Erreur réseau'); }
    finally { setSavingEdit(false); }
  };

  // ── Changement rapide de l'échéance (uniquement sur les tâches que j'ai créées) ──
  const [editEcheanceId, setEditEcheanceId] = useState<number | null>(null);

  const saveEcheance = async (id: number, value: string) => {
    setEditEcheanceId(null);
    try {
      const res = await fetch(`/api/tasks/edit/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ echeance: value || null }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || "Erreur lors de la modification de l'échéance"); }
      else { fetchTasks(); if (showAssigned) fetchAssigned(); }
    } catch { alert('Erreur réseau'); }
  };

  // Rendu d'une cellule échéance : éditable en un clic si je suis le créateur.
  // Fonction (et non composant) pour éviter tout remount du champ pendant l'édition.
  const renderEcheance = (id: number, echeance: string | null, canEdit: boolean) => {
    if (canEdit && editEcheanceId === id) {
      return (
        <input
          type="date" autoFocus
          defaultValue={(echeance || '').slice(0, 10)}
          onChange={e => saveEcheance(id, e.target.value)}
          onBlur={() => setEditEcheanceId(null)}
          onKeyDown={e => { if (e.key === 'Escape') setEditEcheanceId(null); }}
          style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, outline: 'none' }}
        />
      );
    }
    if (canEdit) {
      return (
        <span onClick={() => setEditEcheanceId(id)} title="Cliquer pour modifier l'échéance"
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <EcheanceBadge d={echeance} />
          <Pencil size={11} style={{ color: '#94a3b8' }} />
        </span>
      );
    }
    return <EcheanceBadge d={echeance} />;
  };

  const fetchKpiHistory = async () => {
    setKpiLoading(true);
    try {
      const res = await fetch('/api/tasks/kpi-history', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setKpiHistory(Array.isArray(data) ? data : []);
    } catch { setKpiHistory([]); }
    finally { setKpiLoading(false); }
  };

  useEffect(() => { fetchTasks(); fetchAlertPref(); fetchAssignAlertPref(); fetchTodoPref(); }, [fetchTasks, fetchAlertPref, fetchAssignAlertPref, fetchTodoPref]);

  const syncedOnMount = useRef(false);
  useEffect(() => {
    if (todoEnabled && !syncedOnMount.current) {
      syncedOnMount.current = true;
      runTodoSync();
    }
  }, [todoEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Notes loading ────────────────────────────────────────────────────────────
  const loadNotes = async (task: Task) => {
    const key = `${task.source}:${task.id}`;
    try {
      const res = await fetch(`/api/tasks/${task.source}/${task.id}/notes`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setNotesMap(prev => ({ ...prev, [key]: Array.isArray(data) ? data : [] }));
    } catch { /* ignore */ }
  };

  const toggleNotes = (task: Task) => {
    const key = `${task.source}:${task.id}`;
    if (expandedNotesId === key) {
      setExpandedNotesId(null);
    } else {
      setExpandedNotesId(key);
      loadNotes(task);
    }
  };

  // ─── Status ───────────────────────────────────────────────────────────────────
  const cycleStatus = async (task: Task) => {
    if (TERMINAL_STATUTS.includes(task.statut)) {
      // From terminal → a_faire (reopen)
      await updateStatus(task, 'a_faire');
      return;
    }
    const idx = STATUT_CYCLE.indexOf(task.statut as any) ?? 0;
    const nextStatut = STATUT_CYCLE[(idx + 1) % STATUT_CYCLE.length];
    await updateStatus(task, nextStatut);
  };

  const updateStatus = async (task: Task, newStatut: string, refus_raison?: string) => {
    const key = `${task.source}-${task.id}`;
    setUpdating(key);
    try {
      const res = await fetch(`/api/tasks/${task.source}/${task.id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ statut: newStatut, ...(refus_raison ? { refus_raison } : {}) })
      });
      if (!res.ok) {
        let msg = 'Échec de la mise à jour de la tâche';
        try { const data = await res.json(); if (data?.error) msg = data.error; } catch { /* ignore */ }
        setConfirmModal({
          title: 'Erreur',
          message: msg,
          onConfirm: () => setConfirmModal(null),
        });
        return;
      }
      setTasks(prev => prev.map(t =>
        t.source === task.source && t.id === task.id
          ? { ...t, statut: newStatut, refus_raison: refus_raison || null, updated_at: new Date().toISOString() }
          : t
      ));
    } finally { setUpdating(null); }
  };

  const handleRefuse = async (task: Task, raison: string) => {
    setRefuseTask(null);
    await updateStatus(task, 'refuse', raison);
  };

  const deleteTask = async (task: Task) => {
    if (task.source !== 'personal' && task.source !== 'ticket') return;
    setConfirmModal({
      title: 'Supprimer la tâche',
      message: `Êtes-vous sûr de vouloir supprimer la tâche "${task.description}" ? Cette action est irréversible.`,
      isDangerous: true,
      onConfirm: async () => {
        try {
          await fetch(`/api/tasks/personal/${task.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
          setTasks(prev => prev.filter(t => !(t.source === task.source && t.id === task.id)));
        } catch (err) {
          console.error('Erreur suppression:', err);
        }
        setConfirmModal(null);
      }
    });
  };

  const deleteAssignedTask = async (taskId: number) => {
    setConfirmModal({
      title: 'Supprimer la tâche affectée',
      message: 'Êtes-vous sûr de vouloir supprimer cette tâche affectée ? Cette action est irréversible.',
      isDangerous: true,
      onConfirm: async () => {
        try {
          await fetch(`/api/tasks/personal/${taskId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
          setAssignedTasks(prev => prev.filter(t => t.id !== taskId));
        } catch (err) {
          console.error('Erreur suppression:', err);
        }
        setConfirmModal(null);
      }
    });
  };

  const toggleFavorite = async (task: Task) => {
    if (task.source !== 'personal') return;
    try {
      const res = await fetch(`/api/tasks/personal/${task.id}/favorite`, {
        method: 'PATCH',
        headers: authHeaders
      });
      if (res.ok) {
        const { is_favorite } = await res.json();
        setTasks(prev => prev.map(t =>
          (t.source === task.source && t.id === task.id) ? { ...t, is_favorite } : t
        ));
      }
    } catch (e) { console.error('Erreur favori:', e); }
  };

  const togglePublic = async (task: Task) => {
    if (task.source !== 'personal') return;
    const nextPublic = !task.is_public;
    try {
      const res = await fetch(`/api/tasks/edit/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_public: nextPublic }),
      });
      if (res.ok) {
        setTasks(prev => prev.map(t =>
          (t.source === task.source && t.id === task.id) ? { ...t, is_public: nextPublic } : t
        ));
      }
    } catch (e) { console.error('Erreur toggle public:', e); }
  };

  const handleCreated = (created: any) => {
    const toAdd = Array.isArray(created) ? created : [created];
    setTasks(prev => [
      ...toAdd.map((t: any) => ({ ...t, source: (t.context_source || 'personal') as Task['source'], note_count: 0 })),
      ...prev
    ]);
  };

  // ─── Alert ────────────────────────────────────────────────────────────────────
  const toggleAlert = async () => {
    setAlertLoading(true);
    const next = !alertEnabled;
    try {
      await fetch('/api/tasks/alert-pref', { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ enabled: next }) });
      setAlertEnabled(next);
    } finally { setAlertLoading(false); }
  };

  const toggleAssignAlert = async () => {
    setAssignAlertLoading(true);
    const next = !assignAlertEnabled;
    try {
      await fetch('/api/tasks/assign-alert-pref', { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ enabled: next }) });
      setAssignAlertEnabled(next);
    } finally { setAssignAlertLoading(false); }
  };

  const sendTest = async () => {
    setTestSending(true); setTestMsg(null);
    try {
      const res = await fetch('/api/tasks/alert-test', { method: 'POST', headers: authHeaders });
      const data = await res.json();
      setTestMsg(res.ok ? { ok: true, text: `Email de test envoyé à ${data.to}` } : { ok: false, text: data.error || 'Erreur inconnue' });
    } catch { setTestMsg({ ok: false, text: 'Erreur réseau' }); }
    finally { setTestSending(false); }
  };

  // ─── Todo sync ────────────────────────────────────────────────────────────────
  const toggleTodo = async () => {
    setTodoLoading(true);
    const next = !todoEnabled;
    try {
      await fetch('/api/tasks/todo-sync', { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ enabled: next }) });
      setTodoEnabled(next);
      if (!next) setTodoResult(null);
    } finally { setTodoLoading(false); }
  };

  const runTodoSync = async () => {
    setTodoRunning(true); setTodoResult(null);
    try {
      const res = await fetch('/api/tasks/todo-sync/run', { method: 'POST', headers: authHeaders });
      const data = await res.json();
      if (res.ok) {
        const parts = [];
        if ((data.pushed || 0) > 0) parts.push(`${data.pushed} créée(s) dans Todo`);
        if ((data.updated || 0) > 0) parts.push(`${data.updated} mise(s) à jour`);
        if ((data.imported || 0) > 0) parts.push(`${data.imported} importée(s) depuis Todo`);
        if (parts.length === 0) parts.push('Tout est à jour');
        setTodoResult({ ok: true, text: parts.join(' · ') });
        if ((data.imported || 0) > 0) fetchTasks();
      }
      else setTodoResult({ ok: false, text: data.detail || data.error || 'Erreur inconnue' });
    } catch { setTodoResult({ ok: false, text: 'Erreur réseau' }); }
    finally { setTodoRunning(false); }
  };

  // ─── Notes CRUD ───────────────────────────────────────────────────────────────
  const ajouterNote = async (task: Task) => {
    if (!noteInput.trim()) return;
    const key = `${task.source}:${task.id}`;
    try {
      const res = await fetch(`/api/tasks/${task.source}/${task.id}/notes`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ content: noteInput })
      });
      if (res.ok) {
        setNoteInput('');
        await loadNotes(task);
        setTasks(prev => prev.map(t =>
          t.source === task.source && t.id === task.id ? { ...t, note_count: (t.note_count || 0) + 1 } : t
        ));
      }
    } catch { /* ignore */ }
  };

  const triggerFileUpload = (task: Task) => {
    setNoteTaskRef(task);
    fileInputRef.current?.click();
  };

  const uploadNoteFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !noteTaskRef) return;
    setUploadingNote(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/tasks/${noteTaskRef.source}/${noteTaskRef.id}/notes/file`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        await loadNotes(noteTaskRef);
        setTasks(prev => prev.map(t =>
          noteTaskRef && t.source === noteTaskRef.source && t.id === noteTaskRef.id
            ? { ...t, note_count: (t.note_count || 0) + 1 } : t
        ));
      }
    } catch { /* ignore */ }
    finally { setUploadingNote(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const supprimerNote = async (task: Task, noteId: number) => {
    if (!window.confirm('Supprimer cette note ?')) return;
    try {
      const res = await fetch(`/api/tasks/${task.source}/${task.id}/notes/${noteId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        await loadNotes(task);
        setTasks(prev => prev.map(t =>
          t.source === task.source && t.id === task.id ? { ...t, note_count: Math.max(0, (t.note_count || 1) - 1) } : t
        ));
      }
    } catch { /* ignore */ }
  };

  // ─── Sort ─────────────────────────────────────────────────────────────────────
  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sortIndicator = (field: string) =>
    sortField !== field ? null : <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>;

  // ─── KPIs ─────────────────────────────────────────────────────────────────────
  const today = new Date().toDateString();
  const overdueCount  = useMemo(() => tasks.filter(t => !TERMINAL_STATUTS.includes(t.statut) && (daysUntil(t.echeance) ?? 1) < 0).length, [tasks]);
  const enCoursCount  = useMemo(() => tasks.filter(t => t.statut === 'en_cours').length, [tasks]);
  const aFaireCount   = useMemo(() => tasks.filter(t => t.statut === 'a_faire').length, [tasks]);
  const doneToday     = useMemo(() => tasks.filter(t =>
    t.statut === 'terminé' && t.updated_at && new Date(t.updated_at).toDateString() === today
  ).length, [tasks, today]);

  // ─── Source counts (for badges) ───────────────────────────────────────────────
  const pendingTasks = useMemo(() => tasks.filter(t => !TERMINAL_STATUTS.includes(t.statut)), [tasks]);
  const sourceCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of pendingTasks) {
      const src = (t.source === 'projet' || t.source === 'projet_standalone') ? 'projet' : t.source;
      m[src] = (m[src] || 0) + 1;
      m['all'] = (m['all'] || 0) + 1;
    }
    return m;
  }, [pendingTasks]);

  // ─── Statut counts (for filter badges) ────────────────────────────────────────
  const pendingCount   = useMemo(() => tasks.filter(t => t.statut === 'a_faire' || t.statut === 'en_cours').length, [tasks]);
  const enCoursOnly    = enCoursCount;
  const terminedCount  = useMemo(() => tasks.filter(t => TERMINAL_STATUTS.includes(t.statut)).length, [tasks]);

  // ─── Filter + sort ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => tasks.filter(t => {
    if (filterSource !== 'all') {
      const isProjet = filterSource === 'projet' && (t.source === 'projet' || t.source === 'projet_standalone');
      if (!isProjet && t.source !== filterSource) return false;
    }
    if (filterStatut === 'pending' && TERMINAL_STATUTS.includes(t.statut)) return false;
    if (filterStatut === 'en_cours' && t.statut !== 'en_cours') return false;
    if (filterStatut === 'terminé' && !TERMINAL_STATUTS.includes(t.statut)) return false;
    if (filterPriority !== 'all' && (t.priority || 'normale') !== filterPriority) return false;
    return true;
  }), [tasks, filterSource, filterStatut, filterPriority]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let aVal = '', bVal = '';
    if (sortField === 'echeance') {
      aVal = a.echeance ?? 'z'; bVal = b.echeance ?? 'z';
    } else if (sortField === 'description') {
      aVal = a.description?.toLowerCase() || ''; bVal = b.description?.toLowerCase() || '';
    } else if (sortField === 'source') {
      aVal = a.source_title?.toLowerCase() || ''; bVal = b.source_title?.toLowerCase() || '';
    } else if (sortField === 'statut') {
      aVal = a.statut; bVal = b.statut;
    } else if (sortField === 'priority') {
      const order: Record<string, string> = { haute: '0', normale: '1', basse: '2' };
      aVal = order[a.priority || 'normale']; bVal = order[b.priority || 'normale'];
    }
    const cmp = aVal.localeCompare(bVal);
    return sortDir === 'asc' ? cmp : -cmp;
  }), [filtered, sortField, sortDir]);

  const sources = [
    { v: 'all', l: 'Toutes' }, { v: 'personal', l: 'Personnelles' },
    { v: 'transcript', l: 'Transcripts' }, { v: 'projet', l: 'Projets' },
    { v: 'reunion', l: 'Réunions' }, { v: 'rencontre', l: 'Réunions BUD' }, { v: 'revue', l: 'Revues' }, { v: 'ticket', l: 'Tickets' },
  ];

  const colTh = (field: string, label: string, align?: string, width?: string | number) => (
    <th
      onClick={() => handleSort(field)}
      style={{
        padding: '10px 12px', textAlign: (align as any) || 'left',
        fontWeight: 700, color: '#475569', fontSize: 12,
        textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none',
        borderBottom: '2px solid #e2e8f0', background: '#f8fafc',
        width: width || undefined
      }}
    >
      {label} {sortIndicator(field)}
    </th>
  );

  const kpiCards = [
    { label: 'En retard',          value: overdueCount, icon: <AlertTriangle size={18} />, color: '#dc2626', bg: '#fef2f2', border: '#fecaca', filter: 'pending' },
    { label: 'En cours',           value: enCoursCount, icon: <Clock size={18} />,          color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', filter: 'en_cours' },
    { label: 'À faire',            value: aFaireCount,  icon: <CheckSquare size={18} />,    color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', filter: 'pending' },
    { label: 'Terminées aujourd\'hui', value: doneToday, icon: <CheckCircle2 size={18} />, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', filter: 'terminé' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-color)' }}>
      <Header />
      <main style={{ maxWidth: 1140, margin: '0 auto', padding: '40px 20px' }}>

        {/* ── Titre + boutons ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--secondary-color)', margin: 0 }}>
              <CheckSquare size={26} style={{ verticalAlign: 'middle', marginRight: 10, color: 'var(--primary-color)' }} />
              Mes Tâches
            </h1>
            <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 13 }}>Toutes vos tâches assignées, tous modules confondus</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Toggle M'avertir */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'default' }}
              title="Recevoir un email à chaque tâche qui m'est affectée (sauf tâches personnelles)">
              <span style={{ fontSize: 12, color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>🔔 M'avertir</span>
              <Toggle checked={assignAlertEnabled} onChange={() => toggleAssignAlert()} disabled={assignAlertLoading} />
            </div>

            {/* Toggle Rappel 8h */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'default' }}
              title="Recevoir un récapitulatif de toutes mes tâches chaque matin à 8h">
              <span style={{ fontSize: 12, color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>📋 Rappel 8h</span>
              <Toggle checked={alertEnabled} onChange={() => toggleAlert()} disabled={alertLoading} />
              {alertEnabled && (
                <button onClick={sendTest} disabled={testSending} style={{ padding: '2px 8px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  {testSending ? '...' : 'Tester'}
                </button>
              )}
            </div>

            {/* Toggle MS Todo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>
                <Zap size={12} style={{ verticalAlign: 'middle', marginRight: 3, color: '#2563eb' }} />
                MS Todo
              </span>
              <Toggle checked={todoEnabled} onChange={() => toggleTodo()} disabled={todoLoading} />
              {todoEnabled && (
                <button onClick={runTodoSync} disabled={todoRunning} style={{ padding: '2px 8px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <RefreshCcw size={10} /> {todoRunning ? '...' : 'Sync'}
                </button>
              )}
            </div>

            {/* Mes tâches affectées */}
            <button
              onClick={() => { setShowAssigned(v => { if (!v) fetchAssigned(); return !v; }); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: showAssigned ? '#f0fdf4' : 'white', border: `1px solid ${showAssigned ? '#86efac' : '#e2e8f0'}`, borderRadius: 8, cursor: 'pointer', color: showAssigned ? '#16a34a' : '#475569', fontSize: 13, fontWeight: 600 }}
            >
              <Send size={13} /> Tâches affectées
            </button>

            {/* Historique KPI */}
            <button
              onClick={() => { setShowChart(v => { if (!v) fetchKpiHistory(); return !v; }); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: showChart ? '#eff6ff' : 'white', border: `1px solid ${showChart ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: 8, cursor: 'pointer', color: showChart ? '#2563eb' : '#475569', fontSize: 13, fontWeight: 600 }}
            >
              <BarChart2 size={13} /> Historique
            </button>

            <button onClick={fetchTasks} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', color: '#475569', fontSize: 13, fontWeight: 600 }}>
              <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              Actualiser
            </button>
            <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'var(--primary-color)', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'white', fontSize: 13, fontWeight: 700, boxShadow: '0 2px 8px rgba(227,6,19,0.25)' }}>
              <Plus size={15} /> Nouvelle tâche
            </button>
          </div>
        </div>

        {/* ── Feedback banners ──────────────────────────────────────────────── */}
        {testMsg && (
          <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, background: testMsg.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${testMsg.ok ? '#bbf7d0' : '#fecaca'}`, color: testMsg.ok ? '#16a34a' : '#dc2626', fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{testMsg.ok ? '✅' : '❌'} {testMsg.text}</span>
            <button onClick={() => setTestMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700, fontSize: 16 }}>×</button>
          </div>
        )}
        {todoResult && (
          <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, background: todoResult.ok ? '#eff6ff' : '#fef2f2', border: `1px solid ${todoResult.ok ? '#bfdbfe' : '#fecaca'}`, color: todoResult.ok ? '#1d4ed8' : '#dc2626', fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{todoResult.ok ? '🔄' : '❌'} {todoResult.text}</span>
            <button onClick={() => setTodoResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700, fontSize: 16 }}>×</button>
          </div>
        )}

        {/* ── KPI Cards (cliquables = filtres) ─────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {kpiCards.map(s => (
            <button
              key={s.label}
              onClick={() => setFilterStatut(s.filter)}
              style={{
                background: s.bg, border: `1px solid ${filterStatut === s.filter ? s.color : s.border}`,
                borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
                cursor: 'pointer', textAlign: 'left', outline: 'none',
                boxShadow: filterStatut === s.filter ? `0 0 0 2px ${s.color}40` : 'none',
                transition: 'box-shadow 0.15s, border-color 0.15s',
              }}
            >
              <div style={{ color: s.color }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: s.color, opacity: 0.8, marginTop: 2 }}>{s.label}</div>
              </div>
            </button>
          ))}
        </div>

        {/* ── Historique KPI (graphe) ───────────────────────────────────────── */}
        {showChart && (
          <div style={{ background: 'white', borderRadius: 10, padding: '16px 20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                <BarChart2 size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Activité des 30 derniers jours
              </h3>
              <button onClick={() => setShowChart(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
            </div>
            {kpiLoading ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#64748b', fontSize: 13 }}>Chargement...</div>
            ) : kpiHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 13 }}>Aucune donnée sur les 30 derniers jours</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={kpiHistory} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip formatter={(v, n) => [v, n === 'creees' ? 'Créées' : 'Terminées']}
                    labelFormatter={d => new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })} />
                  <Legend formatter={v => v === 'creees' ? 'Créées' : 'Terminées'} iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="creees" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="terminees" stroke="#16a34a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* ── Tâches affectées ─────────────────────────────────────────────── */}
        {showAssigned && (
          <div style={{ background: 'white', borderRadius: 10, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                <Send size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Tâches que j'ai affectées
              </h3>
              <button onClick={() => setShowAssigned(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
            </div>
            {assignedLoading ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#64748b', fontSize: 13 }}>Chargement...</div>
            ) : assignedTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 13 }}>Aucune tâche affectée à d'autres utilisateurs</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>Tâche</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', width: 120 }}>Assignée à</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', width: 110 }}>Échéance</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', width: 100 }}>Statut</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', width: 50 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedTasks.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', color: '#1e293b', fontWeight: 500 }}>
                        {t.description}
                        {t.refus_raison && (
                          <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>❌ Refus : {t.refus_raison}</div>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#475569', fontSize: 12 }}>
                        {(t.assignee_count ?? 1) > 1 ? (
                          <div>
                            <span style={{ display: 'inline-block', background: '#eef2ff', color: '#4f46e5', borderRadius: 6, padding: '1px 7px', fontWeight: 700, fontSize: 11, marginBottom: 3 }}>
                              👥 Équipe · {t.assignee_count}
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {(t.assignees || []).map(a => (
                                <span key={a.username} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: ['terminé', 'terminee'].includes(a.statut) ? '#22c55e' : a.statut === 'en_cours' ? '#f59e0b' : a.statut === 'refuse' ? '#ef4444' : '#cbd5e1' }} />
                                  {a.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : t.responsable}
                      </td>
                      <td style={{ padding: '8px 12px' }}>{renderEcheance(t.id, t.echeance, true)}</td>
                      <td style={{ padding: '8px 12px' }}>{statusBadge(t.statut)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => setEditData({ id: t.id, description: t.description, echeance: (t.echeance || '').slice(0, 10), priority: t.priority || 'normale', is_public: !!t.is_public, isTeam: !!t.is_team_task })}
                          title="Modifier"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', padding: 4, verticalAlign: 'middle' }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => deleteAssignedTask(t.id)}
                          title="Supprimer"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, verticalAlign: 'middle' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Filtres ──────────────────────────────────────────────────────── */}
        <div style={{ background: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Filter size={13} style={{ color: '#64748b' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Source :</span>
            {sources.map(({ v, l }) => {
              const cnt = sourceCounts[v] || 0;
              return (
                <button key={v} onClick={() => setFilterSource(v)} style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: filterSource === v ? '2px solid var(--primary-color)' : '1px solid #e2e8f0', background: filterSource === v ? 'var(--primary-color)' : 'white', color: filterSource === v ? 'white' : '#475569' }}>
                  {l}
                  {cnt > 0 && (
                    <span style={{ background: filterSource === v ? 'rgba(255,255,255,0.3)' : '#ef4444', color: 'white', borderRadius: 8, padding: '0 4px', fontSize: 9, fontWeight: 700, lineHeight: '14px', marginLeft: 4 }}>
                      {cnt}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Statut :</span>
            {[
              { v: 'pending', l: 'À traiter', cnt: pendingCount },
              { v: 'en_cours', l: 'En cours', cnt: enCoursOnly },
              { v: 'terminé', l: 'Terminés', cnt: terminedCount },
            ].map(({ v, l, cnt }) => (
              <button key={v} onClick={() => setFilterStatut(v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: filterStatut === v ? '2px solid #334155' : '1px solid #e2e8f0', background: filterStatut === v ? '#334155' : 'white', color: filterStatut === v ? 'white' : '#475569' }}>
                {l}
                {cnt > 0 && (
                  <span style={{ background: filterStatut === v ? 'rgba(255,255,255,0.25)' : '#94a3b8', color: 'white', borderRadius: 8, padding: '0 4px', fontSize: 9, fontWeight: 700, lineHeight: '14px' }}>
                    {cnt}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Priorité :</span>
            {[
              { v: 'all', l: 'Toutes' },
              { v: 'haute', l: '↑ Haute', cnt: tasks.filter(t => t.priority === 'haute').length },
              { v: 'normale', l: '— Normale', cnt: tasks.filter(t => !t.priority || t.priority === 'normale').length },
              { v: 'basse', l: '↓ Basse', cnt: tasks.filter(t => t.priority === 'basse').length },
            ].map(({ v, l, cnt = 0 }) => (
              <button key={v} onClick={() => setFilterPriority(v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: filterPriority === v ? '2px solid #334155' : '1px solid #e2e8f0', background: filterPriority === v ? '#334155' : 'white', color: filterPriority === v ? 'white' : '#475569' }}>
                {l}
                {cnt > 0 && (
                  <span style={{ background: filterPriority === v ? 'rgba(255,255,255,0.25)' : '#94a3b8', color: 'white', borderRadius: 8, padding: '0 4px', fontSize: 9, fontWeight: 700, lineHeight: '14px' }}>
                    {cnt}
                  </span>
                )}
              </button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>{sorted.length} tâche{sorted.length !== 1 ? 's' : ''}</span>
        </div>

        {/* ── Table ────────────────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Chargement des tâches...</div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', background: 'white', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <Inbox size={44} style={{ marginBottom: 12, opacity: 0.35 }} />
            <div style={{ fontSize: 15, fontWeight: 600 }}>Aucune tâche</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Aucune tâche ne correspond aux filtres sélectionnés.</div>
          </div>
        ) : (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {colTh('description', 'Tâche')}
                  {colTh('source', 'Source', 'left', 170)}
                  {colTh('echeance', 'Échéance', 'left', 120)}
                  {colTh('statut', 'Statut', 'left', 110)}
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', width: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.flatMap(task => {
                  const key = `${task.source}:${task.id}`;
                  const isUpdating = updating === `${task.source}-${task.id}`;
                  const isDone = TERMINAL_STATUTS.includes(task.statut);
                  const isRefused = task.statut === 'refuse';
                  const isOverdue = !isDone && (daysUntil(task.echeance) ?? 1) < 0;
                  const notes = notesMap[key] || [];
                  const noteCount = task.note_count || 0;
                  const isExpanded = expandedNotesId === key;
                  const affectedBy = task.created_by && task.created_by.toLowerCase() !== currentUsername.toLowerCase()
                    ? task.created_by : null;
                  const canRefuse = !isDone && (task.source === 'personal' || task.source === 'ticket');

                  const rows = [
                    <tr
                      key={key}
                      style={{
                        borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9',
                        background: isRefused ? '#fef9f9' : isDone ? '#f0fdf4' : isOverdue ? '#fff8f8' : 'white',
                        borderLeft: `4px solid ${isRefused ? '#ef4444' : isOverdue ? '#ef4444' : isDone ? '#22c55e' : 'transparent'}`,
                        opacity: isDone ? 0.8 : 1,
                      }}
                    >
                      {/* Description */}
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: isDone ? '#94a3b8' : '#1e293b', textDecoration: isDone ? 'line-through' : 'none', maxWidth: 340 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexDirection: 'column' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <button onClick={() => toggleFavorite(task)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: task.is_favorite ? '#fbbf24' : '#d1d5db' }}>
                              <Star size={14} fill={task.is_favorite ? '#fbbf24' : 'none'} />
                            </button>
                            {task.is_team_task && (
                              <span title="Tâche d'équipe" style={{ color: '#2563eb', flexShrink: 0 }}>
                                <Users size={13} />
                              </span>
                            )}
                            {task.is_public && (
                              <span title="Tâche publique" style={{ color: '#16a34a', flexShrink: 0 }}>
                                <Globe size={13} />
                              </span>
                            )}
                            <PriorityBadge priority={task.priority} />
                            {task.description || '—'}
                          </span>
                          {affectedBy && (
                            <span style={{ fontSize: 10, color: '#6366f1', background: '#eef2ff', borderRadius: 6, padding: '1px 6px', fontWeight: 600, textDecoration: 'none' }}>
                              ↖ Affectée par {affectedBy}
                            </span>
                          )}
                          {isRefused && task.refus_raison && (
                            <span style={{ fontSize: 10, color: '#dc2626', background: '#fef2f2', borderRadius: 6, padding: '1px 6px', fontWeight: 600, textDecoration: 'none' }}>
                              ❌ {task.refus_raison}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Source */}
                      <td style={{ padding: '10px 12px' }}>
                        <SourceChip task={task} />
                      </td>

                      {/* Échéance (modifiable en un clic si je suis le créateur) */}
                      <td style={{ padding: '10px 12px' }}>
                        {renderEcheance(
                          task.id,
                          task.echeance,
                          !!task.created_by && task.created_by.toLowerCase() === currentUsername.toLowerCase()
                        )}
                      </td>

                      {/* Statut */}
                      <td style={{ padding: '10px 12px' }}>
                        {statusBadge(task.statut)}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {/* Cycle statut */}
                        <button
                          onClick={() => !isUpdating && cycleStatus(task)}
                          disabled={isUpdating}
                          title={isDone ? 'Réouvrir' : `Passer à : ${STATUT_CYCLE[(STATUT_CYCLE.indexOf(task.statut as any) + 1) % STATUT_CYCLE.length] || 'terminé'}`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: actionColor(task.statut), padding: 4, verticalAlign: 'middle' }}
                        >
                          <CheckCircle2 size={18} />
                        </button>

                        {/* Refuser (uniquement pour tâches personal/ticket non terminées) */}
                        {canRefuse && (
                          <button
                            onClick={() => setRefuseTask(task)}
                            disabled={isUpdating}
                            title="Refuser cette tâche"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, verticalAlign: 'middle', opacity: 0.7 }}
                          >
                            <XCircle size={16} />
                          </button>
                        )}

                        {/* Notes */}
                        <button
                          onClick={() => toggleNotes(task)}
                          title={`${noteCount} note(s)`}
                          style={{
                            background: noteCount > 0 ? '#eff6ff' : 'transparent',
                            border: noteCount > 0 ? '1px solid #bfdbfe' : 'none',
                            borderRadius: 4, cursor: 'pointer',
                            color: isExpanded ? '#2563eb' : noteCount > 0 ? '#1d4ed8' : '#94a3b8',
                            padding: '2px 5px', marginLeft: 2,
                            fontWeight: noteCount > 0 ? 700 : 400, fontSize: 11,
                            lineHeight: '18px', verticalAlign: 'middle'
                          }}
                        >
                          💬 {noteCount || '+'}
                        </button>

                        {/* Public/Privé (tâches que j'ai créées) */}
                        {task.source === 'personal' && task.created_by && task.created_by.toLowerCase() === currentUsername.toLowerCase() && (
                          <button
                            onClick={() => togglePublic(task)}
                            title={task.is_public ? 'Rendre privée' : 'Rendre publique'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: task.is_public ? '#16a34a' : '#94a3b8', padding: 4, marginLeft: 2, verticalAlign: 'middle' }}
                          >
                            {task.is_public ? <Globe size={14} /> : <Lock size={14} />}
                          </button>
                        )}

                        {/* Modifier (tâches que j'ai créées) */}
                        {task.created_by && task.created_by.toLowerCase() === currentUsername.toLowerCase() && (
                          <button
                            onClick={() => setEditData({ id: task.id, description: task.description, echeance: (task.echeance || '').slice(0, 10), priority: task.priority || 'normale', is_public: !!task.is_public, isTeam: !!task.is_team_task })}
                            title="Modifier"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', padding: 4, marginLeft: 2, verticalAlign: 'middle' }}
                          >
                            <Pencil size={14} />
                          </button>
                        )}

                        {/* Supprimer (personnel uniquement) */}
                        {task.source === 'personal' && (
                          <button
                            onClick={() => deleteTask(task)}
                            title="Supprimer"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, marginLeft: 2, verticalAlign: 'middle' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ];

                  // Notes row
                  if (isExpanded) {
                    rows.push(
                      <tr key={`${key}-notes`}>
                        <td colSpan={5} style={{ padding: '4px 12px 8px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {notes.length === 0 && (
                              <div style={{ fontSize: 11, color: '#94a3b8', padding: '4px 0' }}>Aucune note pour l'instant.</div>
                            )}
                            {notes.map((n, ni) => (
                              <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 11, borderBottom: ni < notes.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                {n.type === 'file' ? (
                                  <a
                                    href={`/api/tasks/${task.source}/${task.id}/notes/${n.id}/file?mode=inline&token=${token}`}
                                    target="_blank" rel="noopener noreferrer"
                                    style={{ flex: 1, color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                                  >
                                    <Upload size={10} /> {n.filename || n.content}
                                  </a>
                                ) : (
                                  <span style={{ flex: 1, color: '#1e293b' }}>{n.content}</span>
                                )}
                                <span style={{ fontSize: 9, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                  {n.created_by} · {n.created_at ? new Date(n.created_at).toLocaleDateString('fr-FR') : ''}
                                </span>
                                <button onClick={() => supprimerNote(task, n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 1, lineHeight: 1 }} title="Supprimer">
                                  <X size={10} />
                                </button>
                              </div>
                            ))}
                            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                              <input
                                type="text"
                                placeholder="Ajouter une note..."
                                style={{ flex: 1, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 11 }}
                                value={noteInput}
                                onChange={e => setNoteInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') ajouterNote(task); }}
                              />
                              <button onClick={() => ajouterNote(task)} style={{ padding: '4px 8px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>
                                Ajouter
                              </button>
                              <button onClick={() => triggerFileUpload(task)} disabled={uploadingNote} style={{ padding: '4px 8px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Upload size={10} /> {uploadingNote ? '...' : 'Fichier'}
                              </button>
                            </div>
                          </div>
                          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={uploadNoteFile} />
                        </td>
                      </tr>
                    );
                  }

                  return rows;
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ── Modal Nouvelle tâche ─────────────────────────────────────────── */}
      {showModal && (
        <AddTaskModal
          token={token}
          contextSource="personal"
          onCreated={handleCreated}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* ── Modal Confirmation ───────────────────────────────────────────── */}
      {confirmModal && (
        <ConfirmationModal
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
          isDangerous={confirmModal.isDangerous}
        />
      )}

      {/* ── Modal Refus ──────────────────────────────────────────────────── */}
      {refuseTask && (
        <RefuseModal
          task={refuseTask}
          onConfirm={raison => handleRefuse(refuseTask, raison)}
          onClose={() => setRefuseTask(null)}
        />
      )}

      {editData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => !savingEdit && setEditData(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 480, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Pencil size={16} /> Modifier la tâche
            </h3>
            {editData.isTeam && (
              <div style={{ background: '#eef2ff', color: '#4338ca', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
                👥 Tâche d'équipe : la modification s'appliquera à tous les destinataires.
              </div>
            )}
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Description</label>
            <textarea
              value={editData.description}
              onChange={e => setEditData(d => d && { ...d, description: e.target.value })}
              rows={4}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 16 }}
            />
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Échéance</label>
            <input type="date" value={editData.echeance}
              onChange={e => setEditData(d => d && { ...d, echeance: e.target.value })}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
            />
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Priorité</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {(['basse', 'normale', 'haute'] as const).map(p => {
                const colors: Record<string, { bg: string; color: string; border: string }> = {
                  basse:  { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
                  normale: { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
                  haute:  { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
                };
                const c = colors[p];
                return (
                  <button key={p} onClick={() => setEditData(d => d && { ...d, priority: p })}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${editData.priority === p ? c.color : '#e2e8f0'}`, background: editData.priority === p ? c.bg : 'white', color: editData.priority === p ? c.color : '#475569' }}
                  >
                    {p === 'basse' ? '↓ Basse' : p === 'haute' ? '↑ Haute' : '— Normale'}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: editData.is_public ? '#f0fdf4' : '#f8fafc', border: `1px solid ${editData.is_public ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 8, padding: '8px 12px', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {editData.is_public ? <Globe size={14} style={{ color: '#16a34a' }} /> : <Lock size={14} style={{ color: '#94a3b8' }} />}
                <span style={{ fontSize: 13, fontWeight: 600, color: editData.is_public ? '#16a34a' : '#475569' }}>
                  {editData.is_public ? 'Publique' : 'Privée'}
                </span>
              </div>
              <button
                onClick={() => setEditData(d => d && { ...d, is_public: !d.is_public })}
                style={{ width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: editData.is_public ? '#16a34a' : '#cbd5e1', transition: 'background 0.2s', position: 'relative', flexShrink: 0 }}
              >
                <span style={{ position: 'absolute', top: 2, left: editData.is_public ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', display: 'block' }} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditData(null)} disabled={savingEdit}
                style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14, color: '#475569' }}>
                Annuler
              </button>
              <button onClick={saveEdit} disabled={savingEdit || !editData.description.trim()}
                style={{ padding: '10px 20px', border: 'none', borderRadius: 8, background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, opacity: (savingEdit || !editData.description.trim()) ? 0.6 : 1 }}>
                {savingEdit ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        textarea:focus, input[type="date"]:focus { border-color: var(--primary-color) !important; }
      `}</style>
    </div>
  );
};

export default MesTaches;
