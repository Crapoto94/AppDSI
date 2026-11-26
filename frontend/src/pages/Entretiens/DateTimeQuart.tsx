import { useState } from 'react';
import { input } from './ui';

// Heures proposées au quart d'heure, de 7 h à 20 h 45
const TIMES = Array.from({ length: 14 * 4 }, (_, i) => `${String(7 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);

/** Date et heure de rendez-vous (« AAAA-MM-JJTHH:mm »), minutes limitées à 00, 15, 30 et 45. */
export default function DateTimeQuart({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const date = (value || '').slice(0, 10);
  const time = (value || '').slice(11, 16);
  const [pending, setPending] = useState('09:00'); // heure choisie avant la date
  const current = time || pending;
  // un rendez-vous déjà enregistré hors de cette grille reste affiché tel quel
  const options = TIMES.includes(current) ? TIMES : [...TIMES, current].sort();
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input style={{ ...input, flex: 1, minWidth: 0 }} type="date" aria-label="Date" value={date}
        onChange={e => onChange(e.target.value ? `${e.target.value}T${current}` : '')} />
      <select style={{ ...input, width: 'auto' }} aria-label="Heure" value={current}
        onChange={e => { setPending(e.target.value); if (date) onChange(`${date}T${e.target.value}`); }}>
        {options.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  );
}
