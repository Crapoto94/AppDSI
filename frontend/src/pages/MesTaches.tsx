import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import {
  CheckSquare, Square, Clock, AlertTriangle, CheckCircle2,
  FolderKanban, MessageSquare, Users, RotateCcw, Filter,
  ExternalLink, RefreshCw, Inbox, Plus, X, Trash2
} from 'lucide-react';

interface Task {
  source: 'personal' | 'transcript' | 'projet' | 'projet_standalone' | 'rencontre' | 'revue';
  id: number;
  source_id: number | null;
  source_title: string;
  description: string;
  echeance: string | null;
  statut: string;
  responsable: string;
  created_at: string;
}

const SOURCE_META: Record<Task['source'], { label: string; icon: React.ReactNode; color: string; bg: string; urlFn: (id: number | null) => string | null }> = {
  personal:          { label: 'Personnel',    icon: <CheckSquare size={12} />, color: '#475569', bg: '#f1f5f9', urlFn: () => null },
  transcript:        { label: 'Transcript',   icon: <MessageSquare size={12} />, color: '#7c3aed', bg: '#ede9fe', urlFn: (id) => `/transcriptmanager` },
  projet:            { label: 'Projet',       icon: <FolderKanban size={12} />, color: '#2563eb', bg: '#dbeafe', urlFn: (id) => id ? `/projets/${id}` : null },
  projet_standalone: { label: 'Projet',       icon: <FolderKanban size={12} />, color: '#2563eb', bg: '#dbeafe', urlFn: (id) => id ? `/projets/${id}` : null },
  rencontre:         { label: 'Réunion',      icon: <Users size={12} />,        color: '#d97706', bg: '#fef3c7', urlFn: () => `/rencontres-budgetaires` },
  revue:             { label: 'Revue',        icon: <RotateCcw size={12} />,    color: '#059669', bg: '#d1fae5', urlFn: () => `/revue-de-projets` },
};

const STATUT_OPTIONS = [
  { value: 'a_faire',  label: 'À faire'  },
  { value: 'en_cours', label: 'En cours' },
  { value: 'terminé',  label: 'Terminé'  },
];

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.floor((new Date(d).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
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
  const navigate = useNavigate();
  const meta = SOURCE_META[task.source];
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
        maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
      }}
    >
      {meta.icon}
      {meta.label}{task.source !== 'personal' ? ` · ${task.source_title || '—'}` : ''}
      {url && <ExternalLink size={10} />}
    </button>
  );
}

const MesTaches: React.FC = () => {
  const { token } = useAuth();
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterStatut, setFilterStatut] = useState<string>('pending');
  const [updating, setUpdating]   = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newDesc, setNewDesc]     = useState('');
  const [newDate, setNewDate]     = useState('');
  const [saving, setSaving]       = useState(false);

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

  const deleteTask = async (task: Task) => {
    if (task.source !== 'personal') return;
    await fetch(`/api/tasks/personal/${task.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    setTasks(prev => prev.filter(t => !(t.source === 'personal' && t.id === task.id)));
  };

  const handleCreate = async () => {
    if (!newDesc.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: newDesc.trim(), echeance: newDate || null })
      });
      const created = await res.json();
      setTasks(prev => [{ ...created, source: 'personal' as const }, ...prev]);
      setShowModal(false);
      setNewDesc('');
      setNewDate('');
    } finally { setSaving(false); }
  };

  const filtered = tasks.filter(t => {
    if (filterSource !== 'all' && t.source !== filterSource &&
        !(filterSource === 'projet' && t.source === 'projet_standalone')) return false;
    if (filterStatut === 'pending' && t.statut === 'terminé') return false;
    if (filterStatut !== 'pending' && filterStatut !== 'all' && t.statut !== filterStatut) return false;
    return true;
  });

  const overdueCount = tasks.filter(t => t.statut !== 'terminé' && (daysUntil(t.echeance) ?? 1) < 0).length;
  const pendingCount = tasks.filter(t => t.statut !== 'terminé').length;
  const doneCount    = tasks.filter(t => t.statut === 'terminé').length;

  const sources: { v: string; l: string }[] = [
    { v: 'all', l: 'Toutes' }, { v: 'personal', l: 'Personnelles' },
    { v: 'transcript', l: 'Transcripts' }, { v: 'projet', l: 'Projets' },
    { v: 'rencontre', l: 'Réunions' }, { v: 'revue', l: 'Revues' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-color)' }}>
      <Header />
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px' }}>

        {/* Titre + bouton Ajouter */}
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
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={fetchTasks} disabled={loading} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              background: 'white', border: '1px solid #e2e8f0', borderRadius: 8,
              cursor: 'pointer', color: '#475569', fontSize: 13, fontWeight: 600
            }}>
              <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              Actualiser
            </button>
            <button onClick={() => setShowModal(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px',
              background: 'var(--primary-color)', border: 'none', borderRadius: 8,
              cursor: 'pointer', color: 'white', fontSize: 13, fontWeight: 700,
              boxShadow: '0 2px 8px rgba(227,6,19,0.25)'
            }}>
              <Plus size={16} /> Ajouter une tâche
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'En retard',  value: overdueCount, icon: <AlertTriangle size={20} />, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
            { label: 'À traiter',  value: pendingCount, icon: <Clock size={20} />,          color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
            { label: 'Terminées',  value: doneCount,    icon: <CheckCircle2 size={20} />,   color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
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
        <div style={{ background: 'white', borderRadius: 12, padding: '14px 16px', marginBottom: 20, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Filter size={14} style={{ color: '#64748b' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Source :</span>
            {sources.map(({ v, l }) => (
              <button key={v} onClick={() => setFilterSource(v)} style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: filterSource === v ? '2px solid var(--primary-color)' : '1px solid #e2e8f0',
                background: filterSource === v ? 'var(--primary-color)' : 'white',
                color: filterSource === v ? 'white' : '#475569'
              }}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Statut :</span>
            {[{ v: 'pending', l: 'À traiter' }, { v: 'en_cours', l: 'En cours' }, { v: 'all', l: 'Tous' }].map(({ v, l }) => (
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
              const isDone = task.statut === 'terminé';
              const isUpdating = updating === key;
              const isOverdue = !isDone && (daysUntil(task.echeance) ?? 1) < 0;

              return (
                <div key={key} style={{
                  background: 'white',
                  border: `1px solid ${isOverdue ? '#fecaca' : '#f1f5f9'}`,
                  borderLeft: `4px solid ${isOverdue ? '#ef4444' : isDone ? '#22c55e' : '#e2e8f0'}`,
                  borderRadius: 10, padding: '14px 16px',
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  opacity: isDone ? 0.6 : 1, transition: 'all 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                  {/* Checkbox */}
                  <button onClick={() => updateStatus(task, isDone ? 'a_faire' : 'terminé')}
                    disabled={isUpdating}
                    title={isDone ? 'Marquer non terminée' : 'Marquer terminée'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, marginTop: 2 }}>
                    {isDone
                      ? <CheckSquare size={20} style={{ color: '#22c55e' }} />
                      : <Square size={20} style={{ color: '#cbd5e1' }} />}
                  </button>

                  {/* Contenu */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 600,
                      color: isDone ? '#94a3b8' : '#1e293b',
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

                  {/* Statut */}
                  <select value={task.statut} onChange={e => updateStatus(task, e.target.value)}
                    disabled={isUpdating}
                    style={{
                      fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '3px 10px',
                      border: '1px solid #e2e8f0', cursor: 'pointer', flexShrink: 0,
                      background: task.statut === 'terminé' ? '#f0fdf4' : task.statut === 'en_cours' ? '#eff6ff' : '#f8fafc',
                      color: task.statut === 'terminé' ? '#16a34a' : task.statut === 'en_cours' ? '#2563eb' : '#475569',
                    }}>
                    {STATUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>

                  {/* Supprimer (tâches personnelles uniquement) */}
                  {task.source === 'personal' && (
                    <button onClick={() => deleteTask(task)}
                      title="Supprimer"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#cbd5e1', flexShrink: 0, marginTop: 2 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal — Ajouter une tâche */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)', zIndex: 9000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{
            background: 'white', borderRadius: 16,
            padding: '32px 28px', width: '100%', maxWidth: 460,
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1e293b' }}>
                <Plus size={18} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--primary-color)' }} />
                Nouvelle tâche
              </h2>
              <button onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                  Description *
                </label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && e.ctrlKey && handleCreate()}
                  placeholder="Décrivez la tâche à faire..."
                  rows={3}
                  autoFocus
                  style={{
                    width: '100%', borderRadius: 8, border: '1px solid #e2e8f0',
                    padding: '10px 12px', fontSize: 14, resize: 'vertical',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                  Échéance <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optionnel)</span>
                </label>
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  style={{
                    width: '100%', borderRadius: 8, border: '1px solid #e2e8f0',
                    padding: '9px 12px', fontSize: 14, boxSizing: 'border-box',
                    outline: 'none', fontFamily: 'inherit'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={() => setShowModal(false)} style={{
                  flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #e2e8f0',
                  background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#64748b'
                }}>
                  Annuler
                </button>
                <button onClick={handleCreate} disabled={!newDesc.trim() || saving} style={{
                  flex: 2, padding: '10px', borderRadius: 8, border: 'none',
                  background: newDesc.trim() ? 'var(--primary-color)' : '#e2e8f0',
                  cursor: newDesc.trim() ? 'pointer' : 'not-allowed',
                  color: newDesc.trim() ? 'white' : '#94a3b8',
                  fontSize: 14, fontWeight: 700
                }}>
                  {saving ? 'Enregistrement...' : 'Ajouter la tâche'}
                </button>
              </div>
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
