import React, { useState } from 'react';
import axios from 'axios';
import { X, Loader2, CalendarCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { Entretien } from './types';
import { nomComplet } from './types';
import FreeSlots from './FreeSlots';
import { COLORS, Field, btnGhost, btnPrimary, card, input } from './ui';

/** L'évaluateur fixe lui-même le rendez-vous de l'entretien : créneaux libres communs, invitation Outlook et e-mail à l'agent. */
export default function PlanningModal({ entretien, onClose, onSaved }: {
  entretien: Entretien;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const [date, setDate] = useState(entretien.date_entretien || '');
  const [duree, setDuree] = useState(entretien.duree_minutes || 120);
  const [lieu, setLieu] = useState(entretien.lieu || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    if (!date) { setError('Choisissez la date et l’heure de l’entretien.'); return; }
    setSaving(true); setError(null);
    try {
      const r = await axios.put(`/api/entretiens/${entretien.id}/planning`, { date_entretien: date, duree_minutes: Number(duree) || 120, lieu },
        { headers: { Authorization: `Bearer ${token}` } });
      const o = r.data.outlook;
      setResult({
        ok: !o || o.ok !== false,
        text: o && o.ok === false ? `Entretien planifié, mais l’invitation Outlook a échoué : ${o.error}` : 'Entretien planifié : invitation Outlook envoyée et agent prévenu par e-mail.',
      });
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Planification impossible');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...card, width: '100%', maxWidth: 640 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: 'flex', gap: 9, alignItems: 'center', fontWeight: 800, fontSize: 15, color: COLORS.text }}>
            <CalendarCheck size={18} color={COLORS.primary} /> Planifier l’entretien de {nomComplet(entretien)}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', color: '#475569' }}><X size={17} /></button>
        </div>
        <div style={{ padding: '18px 20px 20px' }}>
          {result ? (
            <div>
              <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', borderRadius: 10, padding: '12px 14px', fontSize: 13, background: result.ok ? '#f0fdf4' : '#fffbeb', border: `1px solid ${result.ok ? '#bbf7d0' : '#fde68a'}`, color: result.ok ? '#166534' : '#92400e' }}>
                {result.ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />} <div>{result.text}</div>
              </div>
              <div style={{ marginTop: 16 }}><button style={btnPrimary} onClick={onClose}>Fermer</button></div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
                <Field label="Date et heure" required>
                  <input style={input} type="datetime-local" value={date} onChange={e => setDate(e.target.value)} />
                </Field>
                {date && (new Date(date).getTime() - Date.now()) < 8 * 86400000 && (
                  <div style={{ gridColumn: '1 / -1', background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 11px', fontSize: 12.5 }}>
                    ⚠ Ce rendez-vous est à moins de 8 jours : le délai de prévenance de l’agent est court. Vous pouvez néanmoins le planifier.
                  </div>
                )}
                <Field label="Durée (minutes)">
                  <input style={input} type="number" min={15} step={15} value={duree} onChange={e => setDuree(Number(e.target.value))} />
                </Field>
                <Field label="Lieu / visioconférence">
                  <input style={input} placeholder="Bureau, salle, Teams…" value={lieu} onChange={e => setLieu(e.target.value)} />
                </Field>
              </div>
              <FreeSlots
                participants={[
                  { email: entretien.agent_email || '', name: nomComplet(entretien) },
                  { email: entretien.evaluator_email || '', name: entretien.evaluator_nom || entretien.evaluator_email || '' },
                ]}
                dureeMinutes={Number(duree) || 120}
                value={date}
                onPick={setDate}
              />
              {error && <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, padding: '9px 11px', fontSize: 12.5 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
                <button style={btnGhost} disabled={saving} onClick={onClose}>Annuler</button>
                <button style={btnPrimary} disabled={saving} onClick={save}>
                  {saving ? <Loader2 size={15} /> : <CalendarCheck size={15} />} Planifier et inviter
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
