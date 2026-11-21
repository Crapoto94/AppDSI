import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ScanLine, Loader2, CheckCircle2, AlertCircle, Power } from 'lucide-react';
import { useAuth } from './useAuth';
import { COLORS, btnDanger, btnPrimary, card } from './ui';

/** Paramètre « Lecture des entretiens numérisés ». Désactivé par défaut. */
export default function ScanReadingPanel() {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => { try { const r = await axios.get('/api/entretiens/settings', { headers }); setOn(!!r.data.scan_reading); } catch { setOn(false); } }, [headers]);
  useEffect(() => { load(); }, [load]);
  const toggle = async () => {
    setBusy(true); setMsg(null);
    try { await axios.put('/api/entretiens/settings', { scan_reading: !on }, { headers }); setOn(!on); setMsg({ ok: true, text: !on ? 'Lecture activée.' : 'Lecture désactivée.' }); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Enregistrement impossible.' }); } finally { setBusy(false); }
  };
  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 800, color: COLORS.text }}>
          <ScanLine size={17} color={COLORS.primary} /> Lecture des entretiens numérisés
          <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '2px 9px', background: on ? '#dcfce7' : '#f1f5f9', color: on ? '#166534' : '#64748b' }}>{on ? 'Activée' : 'Désactivée'}</span>
          <span style={{ fontSize: 10.5, fontWeight: 800, background: '#ede9fe', color: '#5b21b6', border: '1px solid #ddd6fe', borderRadius: 999, padding: '0 8px' }}>activable</span>
        </div>
        <button style={on ? btnDanger : btnPrimary} disabled={busy || on === null} onClick={toggle}>
          {busy ? <Loader2 size={14} /> : <Power size={14} />} {on ? 'Désactiver' : 'Activer'}
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 8, lineHeight: 1.6 }}>
        <strong>Si elle est activée</strong> : après le téléversement du CREP signé, le contenu et les cases cochées sont lus et proposés au valideur, qui les relit, les corrige et valide.<br />
        <strong>Si elle est désactivée</strong> (par défaut) : le valideur consulte le document téléversé, confirme les 2 signatures, le valide puis clôture l’entretien, sans qu’on lui parle de lecture. Le document est quand même lu en arrière-plan : la <strong>version numérique est visible des seuls administrateurs</strong>, signalée par une pastille dans le Pilotage (avec un filtre pour les sélectionner ou les écarter).
      </div>
      {msg && <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 8, fontSize: 12.5, fontWeight: 600, color: msg.ok ? COLORS.success : COLORS.danger }}>{msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {msg.text}</div>}
    </div>
  );
}
