import React, { useState } from 'react';
import axios from 'axios';

interface Props {
  defaultName?: string;
  closingMessage?: string;
  primary?: string;
  secondary?: string;
  onClose: () => void;
}

/**
 * Hors horaires d'ouverture du chat : formulaire de message d'urgence (nom, problème, mobile de rappel),
 * transmis au numéro configuré dans /admin/tickets.
 */
export default function AfterHoursPanel({ defaultName = '', closingMessage, primary = '#6366f1', secondary = '#818cf8', onClose }: Props) {
  const [name, setName] = useState(defaultName);
  const [problem, setProblem] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' };
  const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', margin: '10px 0 3px' };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !problem.trim() || !phone.trim()) { setError('Renseignez votre nom, votre problème et votre mobile.'); return; }
    setSending(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/live/emergency-sms', { name, problem, phone }, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.message || "Envoi impossible, réessayez dans un instant.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, width: 340, background: '#fff', borderRadius: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', overflow: 'hidden', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <div style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})`, padding: '14px 16px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>🚨 Support fermé — Message d'urgence</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', opacity: 0.8, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
        {sent ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 34 }}>✅</div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>Message d'urgence transmis</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>Vous serez rappelé sur le {phone}.</div>
            <button onClick={onClose} style={{ marginTop: 14, padding: '8px 18px', border: 'none', borderRadius: 8, background: primary, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Fermer</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {closingMessage && <div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>{closingMessage}</div>}
            <label style={label}>Votre nom *</label>
            <input style={field} value={name} onChange={e => setName(e.target.value)} maxLength={80} />
            <label style={label}>Votre problème *</label>
            <textarea style={{ ...field, minHeight: 80, resize: 'vertical' }} value={problem} onChange={e => setProblem(e.target.value)} maxLength={400} placeholder="Que se passe-t-il ? Quel service est touché ?" />
            <label style={label}>Votre numéro de mobile *</label>
            <input style={field} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="06 12 34 56 78" />
            {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{error}</div>}
            <button type="submit" disabled={sending} style={{ marginTop: 14, width: '100%', padding: '10px', border: 'none', borderRadius: 10, background: sending ? '#94a3b8' : '#dc2626', color: '#fff', fontWeight: 700, cursor: sending ? 'default' : 'pointer' }}>
              {sending ? 'Envoi…' : "🚨 Envoyer le message d'urgence"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
