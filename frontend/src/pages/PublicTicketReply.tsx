import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

function stripHtml(html: string) {
  return html ? html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

export default function PublicTicketReply() {
  const { token } = useParams();
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [showDesc, setShowDesc] = useState(false);

  useEffect(() => {
    if (!token) return;
    axios.get(`/api/public/reply/${token}`)
      .then(r => setInfo(r.data))
      .catch(() => setError('Ce lien est invalide ou a expiré.'));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    try {
      await axios.post(`/api/public/reply/${token}`, { content });
      setSent(true);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur lors de l\'envoi.');
    } finally {
      setSending(false);
    }
  }

  const descText = info?.description ? stripHtml(info.description) : '';

  return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif', padding: 24
    }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 36, width: '100%', maxWidth: 580, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <span style={{ fontSize: 24 }}>🎫</span>
          <div>
            <div style={{ fontSize: 13, color: '#6366f1', fontWeight: 700, letterSpacing: '0.04em' }}>DSI · Support IT</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Réponse au technicien</div>
          </div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 18px', color: '#dc2626', fontSize: 14, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {sent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#15803d', margin: '0 0 8px' }}>Réponse envoyée !</h2>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
              Votre réponse a bien été transmise au technicien. Vous serez recontacté si nécessaire.
            </p>
          </div>
        ) : info ? (
          <>
            {/* Ticket title */}
            <div style={{ background: '#f0f0ff', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Ticket #{info.ticketId}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#18181b' }}>{info.title}</div>
            </div>

            {/* Description (collapsible) */}
            {descText && (
              <div style={{ marginBottom: 16 }}>
                <button onClick={() => setShowDesc(v => !v)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6366f1', fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {showDesc ? '▾' : '▸'} Description de la demande
                </button>
                {showDesc && (
                  <div style={{ marginTop: 8, padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {descText}
                  </div>
                )}
              </div>
            )}

            {/* Last tech question */}
            {info.lastQuestion && (
              <div style={{ marginBottom: 24, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  💬 Message du technicien
                </div>
                <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6, wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}
                  dangerouslySetInnerHTML={{ __html: info.lastQuestion.content }} />
                <div style={{ marginTop: 8, fontSize: 11, color: '#a16207' }}>
                  — {info.lastQuestion.author_name}
                  {info.lastQuestion.date_creation && (
                    <> · {new Date(info.lastQuestion.date_creation).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</>
                  )}
                </div>
              </div>
            )}

            {/* Reply form */}
            <form onSubmit={handleSubmit}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                Votre réponse
              </label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Vous pouvez répondre au technicien..."
                rows={7}
                style={{
                  width: '100%', padding: '12px 14px',
                  border: '1.5px solid #e2e8f0', borderRadius: 10,
                  fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
                  resize: 'vertical', outline: 'none', lineHeight: 1.6,
                  transition: 'border-color 0.15s'
                }}
                onFocus={e => e.target.style.borderColor = '#6366f1'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                required
              />
              <button type="submit" disabled={sending || !content.trim()}
                style={{
                  marginTop: 16, width: '100%', padding: '12px',
                  background: sending || !content.trim() ? '#a5b4fc' : '#6366f1',
                  color: '#fff', border: 'none', borderRadius: 10,
                  fontSize: 15, fontWeight: 700, cursor: sending ? 'default' : 'pointer',
                  transition: 'background 0.15s'
                }}>
                {sending ? 'Envoi...' : '↩ Envoyer ma réponse'}
              </button>
            </form>

            <p style={{ marginTop: 16, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
              Ce lien est personnel et lié à votre adresse email ({info.email}).
            </p>
          </>
        ) : !error ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chargement...</div>
        ) : null}
      </div>
    </div>
  );
}
