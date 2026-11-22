import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Maximize2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from './useAuth';
import { COLORS, card } from './ui';

/** Paramètre d'affichage du module : plein écran, ou « dans MagApp » (fenêtre au-dessus du magasin d'applications, comme à l'origine). */
export default function DisplayPanel() {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => { try { const r = await axios.get('/api/entretiens/settings', { headers }); setOn(!!r.data.fullscreen); } catch { setOn(false); } }, [headers]);
  useEffect(() => { load(); }, [load]);
  const change = async (v: boolean) => {
    setBusy(true); setMsg(null);
    try { await axios.put('/api/entretiens/settings', { fullscreen: v }, { headers }); setOn(v); setMsg({ ok: true, text: 'Enregistré : s’applique à la prochaine ouverture du module.' }); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Enregistrement impossible.' }); } finally { setBusy(false); }
  };
  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 800, color: COLORS.text }}>
        <Maximize2 size={17} color={COLORS.primary} /> Affichage du module
        {busy && <Loader2 size={14} className="spin" />}
      </div>
      <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 10, fontSize: 13, color: '#334155', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!on} disabled={on === null || busy} onChange={e => change(e.target.checked)} style={{ marginTop: 3 }} />
        <span><strong>Afficher le module en plein écran</strong><br />
          <span style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: 1.6 }}>Coché : le module occupe tout l’écran. Décoché (par défaut) : il reste « dans MagApp », en fenêtre au-dessus du magasin d’applications.</span>
        </span>
      </label>
      {msg && <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 8, fontSize: 12.5, fontWeight: 600, color: msg.ok ? COLORS.success : COLORS.danger }}>{msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {msg.text}</div>}
    </div>
  );
}
