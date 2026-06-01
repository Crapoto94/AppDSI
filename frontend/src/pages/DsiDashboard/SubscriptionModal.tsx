import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { X, Mail, Send, Loader2 } from 'lucide-react';

interface Props {
  dashboardId: number;
  dashboardName: string;
  onClose: () => void;
}

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export default function SubscriptionModal({ dashboardId, dashboardName, onClose }: Props) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    frequency: 'weekly', send_hour: 7, send_day: 1, emails: '', enabled: true,
  });

  useEffect(() => {
    axios.get(`/api/dsi-dashboard/${dashboardId}/subscription`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => {
      if (r.data) setForm({
        frequency: r.data.frequency || 'weekly',
        send_hour: r.data.send_hour ?? 7,
        send_day: r.data.send_day ?? 1,
        emails: r.data.emails || '',
        enabled: r.data.enabled ?? true,
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [dashboardId, token]);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`/api/dsi-dashboard/${dashboardId}/subscription`, form, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSuccess('Abonnement enregistré !');
      setTimeout(() => setSuccess(''), 2500);
    } finally { setSaving(false); }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const r = await axios.post(`/api/dsi-dashboard/${dashboardId}/send-now`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSuccess(r.data.message || 'Envoyé !');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setSuccess('Erreur : ' + (e.response?.data?.message || e.message));
      setTimeout(() => setSuccess(''), 3000);
    } finally { setSending(false); }
  };

  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  const selectStyle: React.CSSProperties = { ...inputStyle, background: 'white' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.45)' }}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: 16, width: 500, maxWidth: '95vw', boxShadow: '0 24px 48px rgba(0,0,0,.2)', overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', color: 'white', padding: '20px 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              <Mail size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
              Abonnement mail
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, opacity: .7 }}>{dashboardName}</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'rgba(255,255,255,.15)', cursor: 'pointer', color: 'white', borderRadius: 6, padding: '4px 6px', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Loader2 size={24} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Enabled toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: form.enabled ? '#f0fdf4' : '#f8fafc', borderRadius: 10, border: `1px solid ${form.enabled ? '#bbf7d0' : '#e2e8f0'}` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Abonnement actif</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Recevoir le rapport automatiquement</div>
              </div>
              <button onClick={() => set('enabled', !form.enabled)} style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
                background: form.enabled ? '#22c55e' : '#cbd5e1', transition: 'background .2s',
              }}>
                <span style={{ position: 'absolute', top: 3, left: form.enabled ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
              </button>
            </div>

            {/* Frequency */}
            <div>
              <label style={labelStyle}>Fréquence</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['daily','weekly','monthly'].map(f => (
                  <button key={f} onClick={() => set('frequency', f)} style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, border: `2px solid ${form.frequency === f ? '#3b82f6' : '#e2e8f0'}`,
                    background: form.frequency === f ? '#eff6ff' : 'white', color: form.frequency === f ? '#1d4ed8' : '#64748b',
                    cursor: 'pointer', fontSize: 13, fontWeight: form.frequency === f ? 600 : 400,
                  }}>
                    {{ daily: 'Quotidien', weekly: 'Hebdomadaire', monthly: 'Mensuel' }[f]}
                  </button>
                ))}
              </div>
            </div>

            {/* Hour + Day */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Heure d'envoi</label>
                <select value={form.send_hour} onChange={e => set('send_hour', parseInt(e.target.value))} style={selectStyle}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}h00</option>
                  ))}
                </select>
              </div>
              {form.frequency === 'weekly' && (
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Jour d'envoi</label>
                  <select value={form.send_day} onChange={e => set('send_day', parseInt(e.target.value))} style={selectStyle}>
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Emails */}
            <div>
              <label style={labelStyle}>Destinataires</label>
              <textarea
                value={form.emails} onChange={e => set('emails', e.target.value)}
                placeholder="email1@domaine.fr, email2@domaine.fr"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Séparez les adresses par des virgules</div>
            </div>

            {success && (
              <div style={{ padding: '10px 14px', background: success.startsWith('Erreur') ? '#fef2f2' : '#f0fdf4', borderRadius: 8, color: success.startsWith('Erreur') ? '#dc2626' : '#15803d', fontSize: 13, fontWeight: 500 }}>
                {success}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
              <button onClick={sendNow} disabled={sending || !form.emails} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8,
                border: '1px solid #e2e8f0', background: 'white', color: '#374151', cursor: sending || !form.emails ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 500, opacity: !form.emails ? .5 : 1,
              }}>
                {sending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                Envoyer maintenant
              </button>
              <button onClick={save} disabled={saving} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8,
                border: 'none', background: '#1e293b', color: 'white', cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600,
              }}>
                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                Enregistrer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
