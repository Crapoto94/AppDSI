import React, { useState } from 'react';
import axios from 'axios';
import { CalendarSearch, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from './useAuth';
import { COLORS, btnPrimary } from './ui';

interface Slot { start: string; end: string; label: string; available?: number; total?: number; unavailable?: string[] }

const HORIZONS: Array<[number, string]> = [[30, '1 mois'], [61, '2 mois'], [91, '3 mois'], [183, '6 mois'], [365, '1 an']];
const horizonLabel = (j: number) => ({ 30: 'les 30 prochains jours', 61: 'les 2 prochains mois', 91: 'les 3 prochains mois', 183: 'les 6 prochains mois', 365: 'l’année à venir' } as Record<number, string>)[j] || `les ${j} prochains jours`;

/**
 * Prochains créneaux libres communs à l'agent et à l'évaluateur
 * (même moteur et même présentation que la création d'une réunion).
 */
export default function FreeSlots({ participants, dureeMinutes, value, onPick }: {
  participants: Array<{ email: string; name: string }>;
  dureeMinutes: number;
  value: string;
  onPick: (start: string) => void;
}) {
  const { token } = useAuth();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const [afterHours, setAfterHours] = useState(false);
  const [strict, setStrict] = useState(true);
  const [horizon, setHorizon] = useState(30);

  const withEmail = participants.filter(p => p.email && p.email.includes('@'));
  const missing = participants.length < 2 || withEmail.length < participants.length;

  const fetchSlots = async (o: { afterHours?: boolean; strict?: boolean; horizon?: number; append?: boolean } = {}) => {
    const ah = o.afterHours ?? afterHours, st = o.strict ?? strict, hz = o.horizon ?? horizon, append = !!o.append;
    setLoading(true); setError(''); setOpened(true);
    if (!append) setNoMore(false);
    const apres = append && slots.length ? slots.reduce((m, x) => (x.start > m ? x.start : m), slots[0].start) : undefined;
    try {
      const r = await axios.post('/api/entretiens/free-slots', {
        participants: withEmail, duree_minutes: dureeMinutes, after_hours: ah, strict: st, horizon_jours: hz, apres,
      }, { headers: { Authorization: `Bearer ${token}` } });
      const found: Slot[] = r.data.slots || [];
      if (append) {
        if (found.length === 0) setNoMore(true); else setSlots(prev => [...prev, ...found]);
      } else {
        setSlots(found);
        if (found.length === 0) setError(st ? `Aucun créneau où les deux personnes sont libres sur ${horizonLabel(hz)}.` : `Aucun créneau commun trouvé sur ${horizonLabel(hz)}.`);
      }
    } catch (e: any) {
      setError(e.response?.data?.message || e.response?.data?.error || 'Erreur lors de la recherche des créneaux.');
      if (!append) setSlots([]);
    } finally { setLoading(false); }
  };

  const chk: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#475569', fontWeight: 600, cursor: 'pointer' };
  const h = Math.floor(dureeMinutes / 60);
  const m = dureeMinutes % 60;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" style={btnPrimary} disabled={loading || missing} onClick={() => fetchSlots()}>
          {loading ? <Loader2 size={15} /> : <CalendarSearch size={15} />} {loading ? 'Recherche…' : 'Prochains créneaux libres'}
        </button>
        <label style={chk}>
          <input type="checkbox" checked={afterHours} onChange={e => { setAfterHours(e.target.checked); if (opened) fetchSlots({ afterHours: e.target.checked }); }} /> Hors heures ouvrées (8h–19h)
        </label>
        <label style={chk} title="Ne propose que des créneaux où l'agent·e et l'évaluateur sont tous deux libres">
          <input type="checkbox" checked={strict} onChange={e => { setStrict(e.target.checked); if (opened) fetchSlots({ strict: e.target.checked }); }} /> Les deux libres uniquement
        </label>
        <label style={chk}>Sur
          <select value={horizon} onChange={e => { const v = Number(e.target.value); setHorizon(v); if (opened) fetchSlots({ horizon: v }); }}
            style={{ padding: '5px 7px', border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12.5, background: '#fff' }}>
            {HORIZONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      {missing && <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>Choisissez l’agent·e et l’évaluateur (avec adresse e-mail) pour rechercher leurs créneaux communs.</div>}
      {!missing && !opened && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
          Cherche les 5 prochains créneaux de {h}h{m ? String(m).padStart(2, '0') : ''} libres pour l’agent et l’évaluateur ({afterHours ? '8h–19h' : '8h30–12h / 13h30–17h30, ven. 17h'}, lun–ven).
        </div>
      )}
      {error && <div style={{ marginTop: 10, fontSize: 12.5, color: COLORS.danger }}>{error}</div>}

      {slots.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {slots.map((s, i) => {
            const total = s.total ?? 0, avail = s.available ?? 0;
            const allFree = total > 0 && avail === total;
            const selected = value === s.start;
            return (
              <button key={i} type="button" onClick={() => onPick(s.start)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 12px',
                  background: selected ? '#eef2ff' : '#fff',
                  border: `1px solid ${selected ? COLORS.primary : (allFree ? COLORS.border : '#fde68a')}`,
                  borderRadius: 8, cursor: 'pointer', fontSize: 13, textAlign: 'left',
                }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                  <span style={{ fontWeight: 600, color: COLORS.text, textTransform: 'capitalize' }}>{s.label}</span>
                  {total > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: allFree ? COLORS.success : COLORS.warning }}>
                      {allFree
                        ? <>👥 {avail}/{total} disponibles</>
                        : <><AlertTriangle size={12} /> {avail}/{total} disponibles{s.unavailable?.length ? ` — indisponible(s) : ${s.unavailable.join(', ')}` : ''}</>}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.primary, whiteSpace: 'nowrap' }}>{selected ? 'Sélectionné ✓' : 'Choisir'}</span>
              </button>
            );
          })}
          {noMore ? (
            <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 6 }}>Plus aucun créneau sur {horizonLabel(horizon)} — élargissez la période pour aller plus loin.</div>
          ) : (
            <button type="button" disabled={loading} onClick={() => fetchSlots({ append: true })}
              style={{ padding: '8px 12px', background: '#fff', color: COLORS.primary, border: '1px dashed #a5b4fc', borderRadius: 8, cursor: loading ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13 }}>
              {loading ? 'Recherche…' : '+ 5 créneaux suivants'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
