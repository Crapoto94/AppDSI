import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

export default function PublicReopenTicket() {
  const { token } = useParams();
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    axios.get(`/api/public/reopen/${token}`)
      .then(r => setInfo(r.data))
      .catch(e => setError(e.response?.data?.message || 'Ce lien est invalide ou a expiré.'));
  }, [token]);

  async function handleReopen(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await axios.post(`/api/public/reopen/${token}`, { reason: reason.trim() });
      setDone(true);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur lors de la réouverture.');
    } finally {
      setSubmitting(false);
    }
  }

  const canReopen = info && info.reopenable && info.withinWindow;

  return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif', padding: 24
    }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 36, width: '100%', maxWidth: 520, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <span style={{ fontSize: 24 }}>↺</span>
          <div>
            <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 700, letterSpacing: '0.04em' }}>DSI · Support IT</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Réouverture de ticket</div>
          </div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 18px', color: '#dc2626', fontSize: 14, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#15803d', margin: '0 0 8px' }}>Ticket réouvert</h2>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
              Votre ticket #{info?.ticketId} a été réouvert et repris en charge par nos équipes.
            </p>
          </div>
        ) : info ? (
          <>
            <div style={{ background: '#fef2f2', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Ticket #{info.ticketId}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#18181b' }}>{info.title}</div>
            </div>

            {!info.reopenable ? (
              <p style={{ fontSize: 14, color: '#64748b', textAlign: 'center' }}>
                Ce ticket n'est plus dans un état permettant la réouverture (il a peut-être déjà été rouvert).
              </p>
            ) : !info.withinWindow ? (
              <p style={{ fontSize: 14, color: '#64748b', textAlign: 'center' }}>
                Le délai de réouverture ({info.windowHours}h après résolution) est dépassé. Merci de créer un nouveau ticket si le problème persiste.
              </p>
            ) : (
              <form onSubmit={handleReopen}>
                <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, marginBottom: 8 }}>
                  Si le problème n'est pas résolu, vous pouvez rouvrir ce ticket. Il sera repris en charge par nos équipes.
                </p>
                {info.hoursRemaining != null && (
                  <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
                    Réouverture possible encore {info.hoursRemaining}h.
                  </p>
                )}
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Pourquoi souhaitez-vous rouvrir ce ticket ?
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Expliquez ce qui ne fonctionne toujours pas..."
                  rows={4}
                  required
                  style={{
                    width: '100%', padding: '12px 14px',
                    border: '1.5px solid #e2e8f0', borderRadius: 10,
                    fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
                    resize: 'vertical', outline: 'none', lineHeight: 1.6,
                  }}
                  onFocus={e => e.target.style.borderColor = '#dc2626'}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                />
                <button type="submit" disabled={submitting || !reason.trim()}
                  style={{
                    marginTop: 14, width: '100%', padding: '12px',
                    background: submitting || !reason.trim() ? '#fca5a5' : '#dc2626',
                    color: '#fff', border: 'none', borderRadius: 10,
                    fontSize: 15, fontWeight: 700, cursor: submitting ? 'default' : 'pointer',
                  }}>
                  {submitting ? 'Réouverture...' : '↺ Rouvrir le ticket'}
                </button>
              </form>
            )}

            <p style={{ marginTop: 20, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
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
