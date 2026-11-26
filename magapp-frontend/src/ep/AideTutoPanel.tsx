import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BookOpen, Sparkles, Loader2, AlertCircle, Power, PenLine } from 'lucide-react';
import { useAuth } from './useAuth';
import { COLORS, btnDanger, btnGhost, btnPrimary, card } from './ui';

type Key = 'help_enabled' | 'tuto_enabled';
const OPTIONS: Array<{ key: Key; label: string; icon: typeof BookOpen }> = [
  { key: 'help_enabled', label: 'Aide pas à pas', icon: BookOpen },
  { key: 'tuto_enabled', label: 'Tutoriel interactif', icon: Sparkles },
];

/** Interrupteurs « Aide » et « Tuto » du module. Activés par défaut. */
export default function AideTutoPanel({ onChanged, onEditAide, onEditTuto }: { onChanged?: () => void; onEditAide?: () => void; onEditTuto?: () => void }) {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [flags, setFlags] = useState<Record<Key, boolean> | null>(null);
  const [busy, setBusy] = useState<Key | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const r = await axios.get('/api/entretiens/settings', { headers });
      setFlags({ help_enabled: r.data.help_enabled !== false, tuto_enabled: r.data.tuto_enabled !== false });
    } catch { setError('Lecture du réglage impossible.'); }
  }, [headers]);
  useEffect(() => { load(); }, [load]);
  const toggle = async (key: Key) => {
    if (!flags) return;
    setBusy(key); setError('');
    try {
      await axios.put('/api/entretiens/settings', { [key]: !flags[key] }, { headers });
      setFlags({ ...flags, [key]: !flags[key] });
      onChanged?.(); // le bouton « Aide » de l'en-tête suit aussitôt
    } catch (e: any) { setError(e?.response?.data?.message || 'Enregistrement impossible.'); } finally { setBusy(null); }
  };
  const effet = !flags ? '' : flags.help_enabled && flags.tuto_enabled ? 'Le bouton « Aide » ouvre l’aide pas à pas, d’où le tutoriel peut être revu. Le tutoriel s’ouvre à la première connexion.'
    : flags.help_enabled ? 'Le bouton « Aide » ouvre l’aide pas à pas. Le tutoriel n’est plus proposé.'
      : flags.tuto_enabled ? 'Le bouton « Aide » ouvre directement le tutoriel, qui s’ouvre aussi à la première connexion.'
        : 'Le bouton « Aide » est masqué et le tutoriel n’est plus proposé.';
  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.text, marginBottom: 10 }}>Aide et tutoriel</div>
      {OPTIONS.map(({ key, label, icon: Icon }) => {
        const on = !!flags?.[key];
        return (
          <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, fontWeight: 700, color: COLORS.text }}>
              <Icon size={17} color={COLORS.primary} /> {label}
              {flags && <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '2px 9px', background: on ? '#dcfce7' : '#f1f5f9', color: on ? '#166534' : '#64748b' }}>{on ? 'Activé' : 'Désactivé'}</span>}
            </div>
            <button style={on ? btnDanger : btnPrimary} disabled={busy !== null || !flags} onClick={() => toggle(key)} aria-pressed={on}>
              {busy === key ? <Loader2 size={14} /> : <Power size={14} />} {on ? 'Désactiver' : 'Activer'}
            </button>
          </div>
        );
      })}
      <div style={{ fontSize: 12.5, color: COLORS.muted, lineHeight: 1.6 }}>{effet}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {onEditAide && <button style={btnGhost} onClick={onEditAide}><PenLine size={14} /> Modifier les textes de l’aide</button>}
        {onEditTuto && <button style={btnGhost} onClick={onEditTuto}><PenLine size={14} /> Modifier le tutoriel pas à pas</button>}
      </div>
      {error && <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 8, fontSize: 12.5, fontWeight: 600, color: COLORS.danger }}><AlertCircle size={14} /> {error}</div>}
    </div>
  );
}
