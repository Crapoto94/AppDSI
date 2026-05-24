import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import {
  CheckSquare, Clock, AlertTriangle, CheckCircle2,
  FolderKanban, MessageSquare, Users, RotateCcw, Filter,
  ExternalLink, RefreshCw, Inbox, Plus, X, Trash2, Upload,
  RefreshCcw, Zap
} from 'lucide-react';
import AddTaskModal from '../components/AddTaskModal';

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
  note_count: number;
  is_team_task?: boolean;
  team_group_id?: string | null;
  created_by?: string | null;
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

function actionColor(statut: string) {
  if (statut === 'en_cours') return '#1d4ed8';
  if (statut === 'terminé' || statut === 'terminee') return '#16a34a';
  return '#64748b';
}

// ─── Toggle component ─────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? '#16a34a' : '#cbd5e1',
        transition: 'background 0.2s', position: 'relative', flexShrink: 0
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 20 : 3,
        width: 16, height: 16, borderRadius: '50%', background: 'white',
        transition: 'left 0.2s', display: 'block'
      }} />
    </button>
  );
}

const MesTaches: React.FC = () => {
  const { token } = useAuth();

  // ── Tasks ────────────────────────────────────────────────────────────────────
  const [tasks, setTasks]           = useState<Task[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterStatut, setFilterStatut] = useState<string>('pending');
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

  // ── Alert pref ───────────────────────────────────────────────────────────────
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertLoading, setAlertLoading] = useState(false);
  const [testSending, setTestSending]   = useState(false);
  const [testMsg, setTestMsg]           = useState<{ ok: boolean; text: string } | null>(null);

  // ── MS Todo sync ─────────────────────────────────────────────────────────────
  const [todoEnabled, setTodoEnabled]   = useState(false);
  const [todoLoading, setTodoLoading]   = useState(false);
  const [todoRunning, setTodoRunning]   = useState(false);
  const [todoResult, setTodoResult]     = useState<{ ok: boolean; text: string } | null>(null);

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

  const fetchTodoPref = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks/todo-sync', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setTodoEnabled(data.enabled === true);
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { fetchTasks(); fetchAlertPref(); fetchTodoPref(); }, [fetchTasks, fetchAlertPref, fetchTodoPref]);

  // Auto-sync Todo on mount if toggle is enabled
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
    const idx = STATUT_CYCLE.indexOf(task.statut as any) ?? 0;
    const nextStatut = STATUT_CYCLE[(idx + 1) % STATUT_CYCLE.length];
    const key = `${task.source}-${task.id}`;
    setUpdating(key);
    try {
      await fetch(`/api/tasks/${task.source}/${task.id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ statut: nextStatut })
      });
      setTasks(prev => prev.map(t =>
        t.source === task.source && t.id === task.id ? { ...t, statut: nextStatut } : t
      ));
    } finally { setUpdating(null); }
  };

  const updateStatus = async (task: Task, newStatut: string) => {
    const key = `${task.source}-${task.id}`;
    setUpdating(key);
    try {
      await fetch(`/api/tasks/${task.source}/${task.id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ statut: newStatut })
      });
      setTasks(prev => prev.map(t =>
        t.source === task.source && t.id === task.id ? { ...t, statut: newStatut } : t
      ));
    } finally { setUpdating(null); }
  };

  const deleteTask = async (task: Task) => {
    if (task.source !== 'personal') return;
    await fetch(`/api/tasks/personal/${task.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setTasks(prev => prev.filter(t => !(t.source === 'personal' && t.id === task.id)));
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
        if ((data.imported || 0) > 0) fetchTasks(); // refresh if new tasks were imported
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

  // ─── Filter + sort ────────────────────────────────────────────────────────────
  const filtered = tasks.filter(t => {
    if (filterSource !== 'all') {
      const isProjet = filterSource === 'projet' && (t.source === 'projet' || t.source === 'projet_standalone');
      if (!isProjet && t.source !== filterSource) return false;
    }
    if (filterStatut === 'pending' && t.statut === 'terminé') return false;
    if (filterStatut !== 'pending' && filterStatut !== 'all' && t.statut !== filterStatut) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let aVal = '', bVal = '';
    if (sortField === 'echeance') {
      aVal = a.echeance ?? 'z'; bVal = b.echeance ?? 'z';
    } else if (sortField === 'description') {
      aVal = a.description?.toLowerCase() || ''; bVal = b.description?.toLowerCase() || '';
    } else if (sortField === 'source') {
      aVal = a.source_title?.toLowerCase() || ''; bVal = b.source_title?.toLowerCase() || '';
    } else if (sortField === 'statut') {
      aVal = a.statut; bVal = b.statut;
    }
    const cmp = aVal.localeCompare(bVal);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const overdueCount = tasks.filter(t => t.statut !== 'terminé' && (daysUntil(t.echeance) ?? 1) < 0).length;
  const enCoursCount = tasks.filter(t => t.statut === 'en_cours').length;
  const aFaireCount  = tasks.filter(t => t.statut === 'a_faire').length;

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
            {/* Toggle alerte */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>🔔 Alertes 8h</span>
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

        {/* ── Stats ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'En retard',  value: overdueCount, icon: <AlertTriangle size={18} />, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
            { label: 'En cours',   value: enCoursCount, icon: <Clock size={18} />,          color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
            { label: 'À faire',    value: aFaireCount,  icon: <CheckSquare size={18} />,    color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ color: s.color }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: s.color, opacity: 0.8, marginTop: 2 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filtres ──────────────────────────────────────────────────────── */}
        <div style={{ background: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Filter size={13} style={{ color: '#64748b' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Source :</span>
            {sources.map(({ v, l }) => (
              <button key={v} onClick={() => setFilterSource(v)} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: filterSource === v ? '2px solid var(--primary-color)' : '1px solid #e2e8f0', background: filterSource === v ? 'var(--primary-color)' : 'white', color: filterSource === v ? 'white' : '#475569' }}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Statut :</span>
            {[{ v: 'pending', l: 'À traiter' }, { v: 'en_cours', l: 'En cours' }, { v: 'all', l: 'Tous' }].map(({ v, l }) => (
              <button key={v} onClick={() => setFilterStatut(v)} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: filterStatut === v ? '2px solid #334155' : '1px solid #e2e8f0', background: filterStatut === v ? '#334155' : 'white', color: filterStatut === v ? 'white' : '#475569' }}>{l}</button>
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
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', width: 110 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.flatMap(task => {
                  const key = `${task.source}:${task.id}`;
                  const isUpdating = updating === `${task.source}-${task.id}`;
                  const isDone = task.statut === 'terminé';
                  const isOverdue = !isDone && (daysUntil(task.echeance) ?? 1) < 0;
                  const notesKey = key;
                  const notes = notesMap[notesKey] || [];
                  const noteCount = task.note_count || 0;
                  const isExpanded = expandedNotesId === key;

                  const rows = [
                    <tr
                      key={key}
                      style={{
                        borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9',
                        background: isDone ? '#f0fdf4' : isOverdue ? '#fff8f8' : 'white',
                        borderLeft: `4px solid ${isOverdue ? '#ef4444' : isDone ? '#22c55e' : 'transparent'}`,
                      }}
                    >
                      {/* Description */}
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: isDone ? '#94a3b8' : '#1e293b', textDecoration: isDone ? 'line-through' : 'none', maxWidth: 340 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {task.is_team_task && (
                            <span title="Tâche d'équipe" style={{ color: '#2563eb', flexShrink: 0 }}>
                              <Users size={13} />
                            </span>
                          )}
                          {task.description || '—'}
                        </span>
                      </td>

                      {/* Source */}
                      <td style={{ padding: '10px 12px' }}>
                        <SourceChip task={task} />
                      </td>

                      {/* Échéance */}
                      <td style={{ padding: '10px 12px' }}>
                        <EcheanceBadge d={task.echeance} />
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
                          title={`Passer à : ${STATUT_CYCLE[(STATUT_CYCLE.indexOf(task.statut as any) + 1) % STATUT_CYCLE.length]}`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: actionColor(task.statut), padding: 4, verticalAlign: 'middle' }}
                        >
                          <CheckCircle2 size={18} />
                        </button>

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
                                    href={`/api/tasks/${task.source}/${task.id}/notes/${n.id}/file?token=${token}`}
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
                            {/* Input nouvelle note */}
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

      {/* ── Modal Nouvelle tâche (unifié avec support équipe) ────────────── */}
      {showModal && (
        <AddTaskModal
          token={token}
          contextSource="personal"
          onCreated={handleCreated}
          onClose={() => setShowModal(false)}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        textarea:focus, input[type="date"]:focus { border-color: var(--primary-color) !important; }
      `}</style>
    </div>
  );
};

export default MesTaches;
