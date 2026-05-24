import React, { useState } from 'react';
import axios from 'axios';

interface Props {
  ticketId: number;
  ticketTitle: string;
  onClose: () => void;
  onCreated: (description?: string) => void;
}

export default function CreateTaskModal({ ticketId, ticketTitle, onClose, onCreated }: Props) {
  const [description, setDescription] = useState('');
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [adResults, setAdResults] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [echeance, setEcheance] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  let debounceTimer: NodeJS.Timeout;

  function searchAD(q: string) {
    if (q.length < 2) { setAdResults([]); return; }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/ad/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setAdResults(res.data);
      } catch (e) { console.error(e); }
    }, 300);
  }

  async function handleSubmit() {
    if (!description.trim()) { setError('Description requise'); return; }
    if (!selectedUser) { setError('Veuillez sélectionner un assigné'); return; }
    setSubmitting(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/tasks', {
        description: description.trim(),
        echeance: echeance || null,
        context_source: 'ticket',
        context_id: ticketId,
        context_title: ticketTitle,
        assignees: [selectedUser.username]
      }, { headers: { Authorization: `Bearer ${token}` } });
      onCreated(description.trim());
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error || e.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 24, width: 500, maxHeight: '90vh', overflow: 'auto'
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📋</span> Nouvelle tâche
        </h3>

        {error && (
          <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Assigné *</label>
          <div style={{ position: 'relative' }}>
            <input
              value={assigneeQuery}
              onChange={e => { setAssigneeQuery(e.target.value); searchAD(e.target.value); setSelectedUser(null); }}
              placeholder="Rechercher un utilisateur dans l'annuaire..."
              style={{
                width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0',
                borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box'
              }}
            />
            {selectedUser && (
              <div style={{
                marginTop: 6, padding: '6px 12px', background: '#eef2ff', borderRadius: 6,
                fontSize: 13, display: 'flex', alignItems: 'center', gap: 8
              }}>
                <span style={{ fontWeight: 600 }}>{selectedUser.displayName}</span>
                <span style={{ color: '#64748b' }}>{selectedUser.email}</span>
                <button onClick={() => { setSelectedUser(null); setAssigneeQuery(''); }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14 }}>
                  ✕
                </button>
              </div>
            )}
            {!selectedUser && adResults.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, marginTop: 4,
                maxHeight: 200, overflow: 'auto'
              }}>
                {adResults.map((u: any) => (
                  <div key={u.username} onClick={() => { setSelectedUser(u); setAdResults([]); setAssigneeQuery(u.displayName); }}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{u.displayName}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{u.email} · {u.username}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Description *</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Décrire la tâche à réaliser..."
            rows={4}
            style={{
              width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0',
              borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none',
              resize: 'vertical', boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Échéance (optionnelle)</label>
          <input type="date" value={echeance} onChange={e => setEcheance(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0',
              borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{
          padding: '8px 12px', background: '#f8fafc', borderRadius: 8, marginBottom: 20,
          fontSize: 12, color: '#64748b'
        }}>
          Cette tâche sera liée au ticket <strong>#{ticketId}</strong> : {ticketTitle}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14, color: '#475569' }}>
            Annuler
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            style={{
              padding: '10px 20px', border: 'none', borderRadius: 8,
              background: '#6366f1', color: '#fff', cursor: 'pointer',
              fontWeight: 600, fontSize: 14, opacity: submitting ? 0.6 : 1
            }}>
            {submitting ? 'Création...' : 'Créer la tâche'}
          </button>
        </div>
      </div>
    </div>
  );
}
