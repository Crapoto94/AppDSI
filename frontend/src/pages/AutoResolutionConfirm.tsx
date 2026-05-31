import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

export default function AutoResolutionConfirm() {
  const { token } = useParams<{ token: string }>();
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (token) {
      axios.get(`/api/auto-resolution/keep-alive/${token}`)
        .then(res => {
          setTicket(res.data);
          setLoading(false);
        })
        .catch(err => {
          setError(err.response?.data?.message || 'Lien invalide ou expiré');
          setLoading(false);
        });
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await axios.post(`/api/auto-resolution/keep-alive/${token}`, { comment: comment.trim() });
      setResult(data);
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Une erreur est survenue');
    } finally {
      setSubmitting(false);
    }
  }

  const styles: Record<string, React.CSSProperties> = {
    container: {
      maxWidth: 600, margin: '60px auto', padding: 32,
      background: '#fff', borderRadius: 16,
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      fontFamily: 'system-ui, sans-serif',
    },
    title: { fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 8 },
    subtitle: { fontSize: 14, color: '#64748b', marginBottom: 24 },
    descriptionBox: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 24, fontSize: 14, color: '#475569', whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const },
    label: { display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 },
    textarea: {
      width: '100%', minHeight: 120, padding: 12, border: '1.5px solid #e2e8f0',
      borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const,
      fontFamily: 'inherit', resize: 'vertical' as const,
    },
    btn: {
      padding: '12px 24px', border: 'none', borderRadius: 8, cursor: 'pointer',
      background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: 15,
    },
    btnDisabled: {
      padding: '12px 24px', border: 'none', borderRadius: 8, cursor: 'default',
      background: '#a5b4fc', color: '#fff', fontWeight: 600, fontSize: 15,
    },
    errorBox: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 16, marginBottom: 16, color: '#dc2626', fontSize: 14 },
    successBox: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 20, textAlign: 'center' as const },
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div>Vérification de votre lien...</div>
        </div>
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
          <div style={styles.errorBox}>{error}</div>
        </div>
      </div>
    );
  }

  if (done && result) {
    return (
      <div style={styles.container}>
        <div style={styles.successBox}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', marginBottom: 8 }}>
            Merci pour votre confirmation !
          </div>
          <p style={{ fontSize: 14, color: '#374151', margin: '0 0 8px' }}>
            Votre commentaire a bien été ajouté au ticket <strong>#{result.ticket_id}</strong>.
          </p>
          <p style={{ fontSize: 14, color: '#374151', margin: 0 }}>
            La priorité de votre ticket a été augmentée. Nous traiterons votre demande en priorité.
          </p>
          <div style={{ marginTop: 16, fontSize: 13, color: '#64748b' }}>
            <a href={`/tickets/${result.ticket_id}`} style={{ color: '#6366f1' }}>
              Voir le ticket #{result.ticket_id}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🙋</div>
      <div style={styles.title}>Votre ticket est-il toujours d'actualité ?</div>
      <div style={styles.subtitle}>
        Ticket <strong>#{ticket?.id}</strong> — {ticket?.title}
      </div>

      {ticket?.description && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>Votre demande initiale :</div>
          <div style={styles.descriptionBox}>
            {ticket.description}
          </div>
        </div>
      )}

      {error && <div style={styles.errorBox}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <label style={styles.label}>
          Décrivez votre besoin <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <textarea
          style={styles.textarea}
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Expliquez pourquoi ce ticket est toujours d'actualité..."
          required
        />
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6, marginBottom: 20 }}>
          En soumettant ce formulaire, votre ticket sera remonté en priorité.
        </div>
        <button
          type="submit"
          disabled={submitting || !comment.trim()}
          style={submitting || !comment.trim() ? styles.btnDisabled : styles.btn}
        >
          {submitting ? 'Traitement en cours...' : 'Mon ticket est toujours d\'actualité'}
        </button>
      </form>
    </div>
  );
}
