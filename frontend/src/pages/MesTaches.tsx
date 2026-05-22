import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import {
  CheckSquare, Square, Clock, AlertTriangle, CheckCircle2,
  FolderKanban, MessageSquare, Users, RotateCcw, Filter,
  ExternalLink, RefreshCw, Inbox
} from 'lucide-react';

interface Task {
  source: 'transcript' | 'projet' | 'projet_standalone' | 'rencontre' | 'revue';
  id: number;
  source_id: number;
  source_title: string;
  description: string;
  echeance: string | null;
  statut: string;
  responsable: string;
  created_at: string;
}

const SOURCE_META: Record<Task['source'], { label: string; icon: React.ReactNode; color: string; bg: string; urlFn: (id: number) => string }> = {
  transcript:        { label: 'Transcript',   icon: <MessageSquare size={12} />,  color: '#7c3aed', bg: '#ede9fe', urlFn: (id) => `/transcriptmanager` },
  projet:            { label: 'Projet',        icon: <FolderKanban size={12} />,   color: '#2563eb', bg: '#dbeafe', urlFn: (id) => `/projets/${id}` },
  projet_standalone: { label: 'Projet',        icon: <FolderKanban size={12} />,   color: '#2563eb', bg: '#dbeafe', urlFn: (id) => `/projets/${id}` },
  rencontre:         { label: 'Réunion',       icon: <Users size={12} />,          color: '#d97706', bg: '#fef3c7', urlFn: (id) => `/rencontres-budgetaires` },
  revue:             { label: 'Revue',         icon: <RotateCcw size={12} />,      color: '#059669', bg: '#d1fae5', urlFn: (id) => `/revue-de-projets` },
};

const STATUT_OPTIONS = [
  { value: 'a_faire',   label: 'À faire',    color: '#6b7280' },
  { value: 'en_cours',  label: 'En cours',   color: '#2563eb' },
  { value: 'terminé',   label: 'Terminé',    color: '#16a34a' },
];

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  const diff = Math.floor((new Date(d).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
  return diff;
}

function EcheanceBadge({ d }: { d: string | null }) {
  const n = daysUntil(d);
  if (n === null) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>;
  const date = new Date(d!).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  if (n < 0)  return <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>⚠ {date} ({n}j)</span>;
  if (n === 0) return <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Aujourd'hui</span>;
  if (n <= 7)  return <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{date} ({n}j)</span>;
  return <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 20, fontSize: 11 }}>{date}</span>;
}

function SourceChip({ task }: { task: Task }) {
  const meta = SOURCE_META[task.source];
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(meta.urlFn(task.source_id))}
      title={`Ouvrir : ${task.source_title}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: meta.bg, color: meta.color,
        border: 'none', borderRadius: 20, padding: '2px 8px',
        fontSize: 11, fontWeight: 600, cursor: 'pointer',
        maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
      }}
    >
      {meta.icon}
      {meta.label} · {task.source_title || '—'}
      <ExternalLink size={10} />
    </button>
  );
}

const MesTaches: React.FC = () => {
  const { token } = useAuth();
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterStatut, setFilterStatut] = useState<string>('pending'); // pending = non terminé
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch { setTasks([]); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const updateStatus = async (task: Task, newStatut: string) => {
    const key = `${task.source}-${task.id}`;
    setUpdating(key);
    try {
      await fetch(`/api/tasks/${task.source}/${task.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: newStatut })
      });
      setTasks(prev => prev.map(t =>
        t.source === task.source && t.id === task.id ? { ...t, statut: newStatut } : t
      ));
    } finally { setUpdating(null); }
  };

  const filtered = tasks.filter(t => {
    if (filterSource !== 'all' && t.source !== filterSource && !(filterSource === 'projet' && t.source === 'projet_standalone')) return false;
    if (filterStatut === 'pending' && t.statut === 'terminé') return false;
    if (filterStatut !== 'pending' && filterStatut !== 'all' && t.statut !== filterStatut) return false;
    return true;
  });

  const overdueCount  = tasks.filter(t => t.statut !== 'terminé' && (daysUntil(t.echeance) ?? 1) < 0).length;
  const pendingCount  = tasks.filter(t => t.statut !== 'terminé').length;
  const doneCount     = tasks.filter(t => t.statut === 'terminé').length;

  const sources = ['all', 'transcript', 'projet', 'rencontre', 'revue'] as const;
  const sourceLabels: Record<string, string> = {
    all: 'Toutes', transcript: 'Transcripts', projet: 'Projets', rencontre: 'Réunions', revue: 'Revues'
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-color)' }}>
      <Header />
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px' }}>

        {/* Titre */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--secondary-color)', margin: 0 }}>
              <CheckSquare size={28} style={{ verticalAlign: 'middle', marginRight: 10, color: 'var(--primary-color)' }} />
              Mes Tâches
            </h1>
            <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: 14 }}>
              Toutes vos tâches assignées, tous modules confondus
            </p>
          </div>
          <button onClick={fetchTasks} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: 'white', border: '1px solid #e2e8f0', borderRadius: 8,
            cursor: 'pointer', color: '#475569', fontSize: 13, fontWeight: 600
          }}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Actualiser
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'En retard',   value: overdueCount,  icon: <AlertTriangle size={20} />, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
            { label: 'À traiter',   value: pendingCount,  icon: <Clock size={20} />,         color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
            { label: 'Terminées',   value: doneCount,     icon: <CheckCircle2 size={20} />,  color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ color: s.color }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: s.color, opacity: 0.8, marginTop: 2 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div style={{ background: 'white', borderRadius: 12, padding: '14px 16px', marginBottom: 20, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Filter size={14} style={{ color: '#64748b' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Source :</span>
            {sources.map(s => (
              <button key={s} onClick={() => setFilterSource(s)} style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: filterSource === s ? '2px solid var(--primary-color)' : '1px solid #e2e8f0',
                background: filterSource === s ? 'var(--primary-color)' : 'white',
                color: filterSource === s ? 'white' : '#475569'
              }}>{sourceLabels[s]}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Statut :</span>
            {[{v:'pending',l:'À traiter'},{v:'en_cours',l:'En cours'},{v:'all',l:'Tous'}].map(({ v, l }) => (
              <button key={v} onClick={() => setFilterStatut(v)} style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: filterStatut === v ? '2px solid #334155' : '1px solid #e2e8f0',
                background: filterStatut === v ? '#334155' : 'white',
                color: filterStatut === v ? 'white' : '#475569'
              }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Liste */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Chargement des tâches...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <Inbox size={48} style={{ marginBottom: 12, opacity: 0.4 }} />
            <div style={{ fontSize: 16, fontWeight: 600 }}>Aucune tâche</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Aucune tâche ne correspond aux filtres sélectionnés.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(task => {
              const key = `${task.source}-${task.id}`;
              const isDone   = task.statut === 'terminé';
              const isUpdating = updating === key;
              const days = daysUntil(task.echeance);
              const isOverdue = days !== null && days < 0 && !isDone;

              return (
                <div key={key} style={{
                  background: 'white',
                  border: `1px solid ${isOverdue ? '#fecaca' : '#f1f5f9'}`,
                  borderLeft: `4px solid ${isOverdue ? '#ef4444' : isDone ? '#22c55e' : '#e2e8f0'}`,
                  borderRadius: 10,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  opacity: isDone ? 0.6 : 1,
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                  {/* Checkbox */}
                  <button
                    onClick={() => updateStatus(task, isDone ? 'a_faire' : 'terminé')}
                    disabled={isUpdating}
                    title={isDone ? 'Marquer non terminée' : 'Marquer terminée'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, marginTop: 2 }}
                  >
                    {isDone
                      ? <CheckSquare size={20} style={{ color: '#22c55e' }} />
                      : <Square size={20} style={{ color: '#cbd5e1' }} />}
                  </button>

                  {/* Contenu */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: isDone ? '#94a3b8' : '#1e293b',
                      textDecoration: isDone ? 'line-through' : 'none',
                      marginBottom: 6
                    }}>
                      {task.description || '—'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <SourceChip task={task} />
                      <EcheanceBadge d={task.echeance} />
                    </div>
                  </div>

                  {/* Statut select */}
                  <select
                    value={task.statut}
                    onChange={e => updateStatus(task, e.target.value)}
                    disabled={isUpdating}
                    style={{
                      fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '3px 10px',
                      border: '1px solid #e2e8f0', cursor: 'pointer', flexShrink: 0,
                      background: task.statut === 'terminé' ? '#f0fdf4' : task.statut === 'en_cours' ? '#eff6ff' : '#f8fafc',
                      color: task.statut === 'terminé' ? '#16a34a' : task.statut === 'en_cours' ? '#2563eb' : '#475569',
                    }}
                  >
                    {STATUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default MesTaches;
