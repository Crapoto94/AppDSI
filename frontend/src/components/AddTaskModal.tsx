/**
 * AddTaskModal — Composant réutilisable pour créer une tâche dans tous les modules.
 * Supporte : tâche personnelle, tâche de contexte (projet/réunion/revue),
 * tâche d'équipe par personnes (recherche AD) ou par service.
 */
import React, { useState, useEffect } from 'react';
import { X, Plus, Users, UserPlus, Trash2, ChevronDown, Globe, Lock } from 'lucide-react';
import { useADSearch } from '../utils/useADSearch';
import type { ADUser } from '../utils/useADSearch';

interface Service {
  service_code: string;
  user_count: number;
}

interface AddTaskModalProps {
  token: string | null;
  /** Context of the creating module */
  contextSource?: string;   // 'personal' | 'projet' | 'reunion' | 'revue' | 'rencontre'
  contextId?: number;
  contextTitle?: string;
  /** Default responsable (pre-filled, for non-personal contexts) */
  defaultResponsable?: string;
  /** Called with the created task(s) after successful save */
  onCreated: (tasks: any | any[]) => void;
  onClose: () => void;
  /** Optional title override */
  title?: string;
}

const AddTaskModal: React.FC<AddTaskModalProps> = ({
  token,
  contextSource = 'personal',
  contextId,
  contextTitle,
  defaultResponsable = '',
  onCreated,
  onClose,
  title,
}) => {
  const [description, setDescription] = useState('');
  const [echeance, setEcheance]       = useState('');
  const [priority, setPriority]       = useState('normale');
  const [isPublic, setIsPublic]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // Responsable (single, for non-team non-personal)
  const [responsable, setResponsable]         = useState(defaultResponsable);
  const [responsableUsername, setResponsableUsername] = useState('');
  const ad = useADSearch(token);

  // Team task
  const [isTeam, setIsTeam]         = useState(false);
  const [teamMode, setTeamMode]     = useState<'people' | 'service'>('people');
  const [teamMembers, setTeamMembers] = useState<ADUser[]>([]);
  const teamAd = useADSearch(token);
  const [services, setServices]       = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState('');
  const [servicesLoading, setServicesLoading] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Load services when switching to service mode
  useEffect(() => {
    if (isTeam && teamMode === 'service' && services.length === 0) {
      setServicesLoading(true);
      fetch('/api/tasks/services', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setServices(Array.isArray(d) ? d : []))
        .catch(() => {})
        .finally(() => setServicesLoading(false));
    }
  }, [isTeam, teamMode, token, services.length]);




  const addTeamMember = (user: ADUser) => {
    if (!teamMembers.some(m => m.username === user.username)) {
      setTeamMembers(prev => [...prev, user]);
    }
    teamAd.setQuery('');
    teamAd.clearResults();
  };

  const removeTeamMember = (username: string) => {
    setTeamMembers(prev => prev.filter(m => m.username !== username));
  };

  const handleSubmit = async () => {
    if (!description.trim()) { setError('La description est obligatoire'); return; }
    if (isTeam && teamMode === 'people' && teamMembers.length === 0) {
      setError('Ajoutez au moins un membre pour une tâche d\'équipe'); return;
    }
    if (isTeam && teamMode === 'service' && !selectedService) {
      setError('Sélectionnez un service'); return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, any> = {
        description: description.trim(),
        echeance: echeance || null,
        priority,
        is_public: isPublic,
        context_source: contextSource,
        context_id: contextId || null,
        context_title: contextTitle || null,
        is_team_task: isTeam,
      };

      if (isTeam) {
        if (teamMode === 'people') {
          body.assignees = teamMembers.map(m => m.username);
        } else {
          body.service_code = selectedService;
        }
      } else if (responsableUsername) {
        body.assignees = [responsableUsername];
      } else if (responsable && contextSource !== 'personal') {
        // Fall back to display name search (best effort)
        body.assignees = [responsable];
      }

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erreur inconnue'); return; }
      onCreated(data);
      onClose();
    } catch { setError('Erreur réseau'); }
    finally { setSaving(false); }
  };

  const modalTitle = title || (contextSource === 'personal' ? 'Nouvelle tâche' : 'Ajouter une tâche');

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)', zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'white', borderRadius: 16, padding: '28px 28px 24px', width: '100%', maxWidth: 520, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={18} style={{ color: 'var(--primary-color)' }} />
            {modalTitle}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Description */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Description *
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && e.ctrlKey && handleSubmit()}
              placeholder="Décrivez la tâche à accomplir..."
              rows={2}
              autoFocus
              style={{ width: '100%', borderRadius: 8, border: '1px solid #e2e8f0', padding: '9px 12px', fontSize: 14, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          {/* Echéance */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Échéance <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none' }}>(optionnel)</span>
            </label>
            <input
              type="date"
              value={echeance}
              onChange={e => setEcheance(e.target.value)}
              style={{ width: '100%', borderRadius: 8, border: '1px solid #e2e8f0', padding: '9px 12px', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
            />
          </div>

          {/* Priorité */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Priorité
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['basse', 'normale', 'haute'] as const).map(p => {
                const colors: Record<string, { bg: string; color: string; border: string }> = {
                  basse:  { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
                  normale: { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
                  haute:  { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
                };
                const c = colors[p];
                return (
                  <button key={p} onClick={() => setPriority(p)}
                    style={{
                      flex: 1, padding: '6px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1.5px solid ${priority === p ? c.color : '#e2e8f0'}`,
                      background: priority === p ? c.bg : 'white',
                      color: priority === p ? c.color : '#475569',
                    }}
                  >
                    {p === 'basse' ? '↓ Basse' : p === 'haute' ? '↑ Haute' : '— Normale'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Responsable (single, visible pour tous les contextes) */}
          {!isTeam && (
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {contextSource === 'personal' ? 'Affecter à' : 'Responsable'} <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none' }}>(optionnel — moi par défaut)</span>
              </label>
              <input
                type="text"
                placeholder="Rechercher dans l'AD..."
                value={responsable}
                onChange={e => { setResponsable(e.target.value); setResponsableUsername(''); ad.setQuery(e.target.value); }}
                style={{ width: '100%', borderRadius: 8, border: `1px solid ${responsableUsername ? '#16a34a' : '#e2e8f0'}`, padding: '9px 12px', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
              />
              {ad.searching && <span style={{ position: 'absolute', right: 12, top: '50%', fontSize: 11, color: '#64748b' }}>...</span>}
              {ad.results.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'white', border: '1px solid #bfdbfe', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 160, overflowY: 'auto' }}>
                  {ad.results.map(u => (
                    <div key={u.username} style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}
                      onClick={() => { setResponsable(u.displayName); setResponsableUsername(u.username); ad.clearResults(); }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                      <div style={{ fontWeight: 600 }}>{u.displayName}</div>
                      {u.email && <div style={{ fontSize: 10, color: '#64748b' }}>{u.email}{u.service ? ` · ${u.service}` : ''}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Team task toggle ─────────────────────────────────────────── */}
          <div style={{ background: isTeam ? '#eff6ff' : '#f8fafc', border: `1px solid ${isTeam ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={16} style={{ color: isTeam ? '#2563eb' : '#94a3b8' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isTeam ? '#1d4ed8' : '#475569' }}>Tâche d'équipe</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Assigner à plusieurs personnes ou un service</div>
                </div>
              </div>
              {/* Toggle */}
              <button
                onClick={() => { setIsTeam(!isTeam); setError(null); }}
                style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', background: isTeam ? '#2563eb' : '#cbd5e1', transition: 'background 0.2s', position: 'relative', flexShrink: 0 }}
              >
                <span style={{ position: 'absolute', top: 3, left: isTeam ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', display: 'block' }} />
              </button>
            </div>

            {isTeam && (
              <div style={{ marginTop: 14 }}>
                {/* Mode selector */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {(['people', 'service'] as const).map(mode => (
                    <button key={mode} onClick={() => { setTeamMode(mode); setError(null); }} style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${teamMode === mode ? '#2563eb' : '#e2e8f0'}`, background: teamMode === mode ? '#2563eb' : 'white', color: teamMode === mode ? 'white' : '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {mode === 'people' ? '👤 Par personnes' : '🏢 Par service'}
                    </button>
                  ))}
                </div>

                {teamMode === 'people' && (
                  <div>
                    {/* Team members list */}
                    {teamMembers.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {teamMembers.map(m => (
                          <span key={m.username} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#dbeafe', color: '#1d4ed8', borderRadius: 20, padding: '3px 8px 3px 10px', fontSize: 12, fontWeight: 600 }}>
                            {m.displayName}
                            <button onClick={() => removeTeamMember(m.username)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1d4ed8', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {/* AD search input */}
                    <div style={{ position: 'relative' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="text"
                          placeholder="Ajouter un membre (recherche AD)..."
                          value={teamAd.query}
                          onChange={e => teamAd.setQuery(e.target.value)}
                          style={{ flex: 1, padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, outline: 'none' }}
                        />
                        {teamAd.searching && <span style={{ alignSelf: 'center', fontSize: 11, color: '#64748b' }}>...</span>}
                      </div>
                      {teamAd.results.filter(u => !teamMembers.some(m => m.username === u.username)).length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'white', border: '1px solid #bfdbfe', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 140, overflowY: 'auto' }}>
                          {teamAd.results.filter(u => !teamMembers.some(m => m.username === u.username)).map(u => (
                            <div key={u.username} style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}
                              onClick={() => addTeamMember(u)}
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
                    </div>
                    {teamMembers.length === 0 && (
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, fontStyle: 'italic' }}>Aucun membre ajouté — recherchez dans l'AD ci-dessus</div>
                    )}
                  </div>
                )}

                {teamMode === 'service' && (
                  <div>
                    {servicesLoading ? (
                      <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', padding: 8 }}>Chargement des services...</div>
                    ) : (
                      <div style={{ position: 'relative' }}>
                        <select
                          value={selectedService}
                          onChange={e => setSelectedService(e.target.value)}
                          style={{ width: '100%', padding: '8px 32px 8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, outline: 'none', appearance: 'none', background: 'white', cursor: 'pointer' }}
                        >
                          <option value="">— Sélectionnez un service —</option>
                          {services.map(s => (
                            <option key={s.service_code} value={s.service_code}>
                              {s.service_code} ({s.user_count} utilisateur{Number(s.user_count) > 1 ? 's' : ''})
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }} />
                      </div>
                    )}
                    {selectedService && (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                        ✓ La tâche sera assignée à tous les membres du service « {selectedService} »
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Public / Private toggle ──────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isPublic ? '#f0fdf4' : '#f8fafc', border: `1px solid ${isPublic ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isPublic ? <Globe size={16} style={{ color: '#16a34a' }} /> : <Lock size={16} style={{ color: '#94a3b8' }} />}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: isPublic ? '#16a34a' : '#475569' }}>{isPublic ? 'Tâche publique' : 'Tâche privée'}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{isPublic ? 'Visible par tous les membres de mon service' : 'Visible par moi uniquement'}</div>
              </div>
            </div>
            <button
              onClick={() => setIsPublic(!isPublic)}
              style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', background: isPublic ? '#16a34a' : '#cbd5e1', transition: 'background 0.2s', position: 'relative', flexShrink: 0 }}
            >
              <span style={{ position: 'absolute', top: 3, left: isPublic ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', display: 'block' }} />
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
              ❌ {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#64748b' }}>
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={!description.trim() || saving}
              style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: description.trim() && !saving ? 'var(--primary-color)' : '#e2e8f0', cursor: description.trim() && !saving ? 'pointer' : 'not-allowed', color: description.trim() && !saving ? 'white' : '#94a3b8', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {saving ? 'Enregistrement...' : (
                <>
                  {isTeam ? <Users size={15} /> : <Plus size={15} />}
                  {isTeam ? 'Créer la tâche d\'équipe' : 'Ajouter la tâche'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddTaskModal;
