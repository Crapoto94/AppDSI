import React, { useState } from 'react';
import axios from 'axios';

interface Props {
  groupId: number;
  groupName: string;
  members: any[];
  onClose: () => void;
  onCreated: (problemId: number) => void;
}

export default function ProblemModal({ groupId, groupName, members, onClose, onCreated }: Props) {
  const [title, setTitle] = useState(`Problème : ${groupName}`);
  const [content, setContent] = useState('');
  const [resolutionMethod, setResolutionMethod] = useState('');
  const [knowledgeArticle, setKnowledgeArticle] = useState('');
  const [priority, setPriority] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    if (!resolutionMethod.trim()) {
      setError('La méthode de résolution est requise pour un ticket Problème.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/tickets/groups/${groupId}/transform-to-problem`, {
        title: title.trim(),
        content,
        resolution_method: resolutionMethod,
        knowledge_article: knowledgeArticle,
        priority,
      }, { headers: { Authorization: `Bearer ${token}` } });
      onCreated(res.data.problem_ticket_id);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur lors de la création du problème');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 28, width: 580, maxHeight: '90vh',
        overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 24 }}>⚠️</span>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#7c3aed' }}>Transformer en Problème</h3>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              Crée un ticket maître de type Problème lié aux {members.length} tickets du groupe
            </p>
          </div>
        </div>

        {/* Tickets associés */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>TICKETS DU GROUPE</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {members.map((m: any) => (
              <span key={m.ticket_id} style={{
                padding: '3px 10px', borderRadius: 20, background: '#ede9fe',
                color: '#7c3aed', fontSize: 12, fontWeight: 600
              }}>#{m.ticket_id}</span>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {/* Titre */}
          <div>
            <label style={labelStyle}>Titre du problème *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              style={inputStyle} />
          </div>

          {/* Priorité */}
          <div>
            <label style={labelStyle}>Priorité</label>
            <select value={priority} onChange={e => setPriority(Number(e.target.value))} style={inputStyle}>
              <option value={2}>Basse</option>
              <option value={3}>Normale</option>
              <option value={4}>Haute</option>
              <option value={5}>Très haute</option>
            </select>
          </div>

          {/* Méthode de résolution — OBLIGATOIRE */}
          <div>
            <label style={{ ...labelStyle, color: '#7c3aed' }}>
              Méthode de résolution <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 6px' }}>
              Décrivez la stratégie d'arbitrage pour résoudre ce problème.
            </p>
            <textarea
              value={resolutionMethod}
              onChange={e => setResolutionMethod(e.target.value)}
              rows={4}
              placeholder="Ex: Identifier la cause racine → Tester le correctif en environnement de validation → Déploiement en production..."
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description complémentaire</label>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              rows={3}
              placeholder="Contexte, observations, impact..."
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Article de connaissance */}
          <div>
            <label style={labelStyle}>Article de connaissance <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optionnel)</span></label>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 6px' }}>
              Documentation interne, procédures ou liens utiles à la résolution.
            </p>
            <textarea
              value={knowledgeArticle}
              onChange={e => setKnowledgeArticle(e.target.value)}
              rows={3}
              placeholder="Documentation, liens Wiki, procédures..."
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 16, color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
          <button onClick={onClose}
            style={{ padding: '10px 22px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }}>
            Annuler
          </button>
          <button onClick={create} disabled={loading}
            style={{
              padding: '10px 24px', border: 'none', borderRadius: 8, cursor: loading ? 'default' : 'pointer',
              background: '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 14, opacity: loading ? 0.7 : 1
            }}>
            {loading ? 'Création...' : '⚠️ Créer le Problème'}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0',
  borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none', background: '#fff'
};
