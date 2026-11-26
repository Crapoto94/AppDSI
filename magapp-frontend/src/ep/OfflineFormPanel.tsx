import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { FileDown, Loader2, CheckCircle2, AlertCircle, Power } from 'lucide-react';
import { useAuth } from './useAuth';
import { COLORS, btnDanger, btnPrimary, card } from './ui';

/** Option « PDF formulaire hors ligne ». Désactivée par défaut. */
export default function OfflineFormPanel() {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => { try { const r = await axios.get('/api/entretiens/settings', { headers }); setOn(!!r.data.offline_form); } catch { setOn(false); } }, [headers]);
  useEffect(() => { load(); }, [load]);
  const toggle = async () => {
    setBusy(true); setMsg(null);
    try { await axios.put('/api/entretiens/settings', { offline_form: !on }, { headers }); setOn(!on); setMsg({ ok: true, text: !on ? 'Option activée.' : 'Option désactivée.' }); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Enregistrement impossible.' }); } finally { setBusy(false); }
  };
  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 800, color: COLORS.text }}>
          <FileDown size={17} color={COLORS.primary} /> PDF formulaire hors ligne (3ᵉ mode de saisie)
          <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '2px 9px', background: on ? '#dcfce7' : '#f1f5f9', color: on ? '#166534' : '#64748b' }}>{on ? 'Activée' : 'Désactivée'}</span>
          <span style={{ fontSize: 10.5, fontWeight: 800, background: '#ede9fe', color: '#5b21b6', border: '1px solid #ddd6fe', borderRadius: 999, padding: '0 8px' }}>activable</span>
        </div>
        <button style={on ? btnDanger : btnPrimary} disabled={busy || on === null} onClick={toggle}>
          {busy ? <Loader2 size={14} /> : <Power size={14} />} {on ? 'Désactiver' : 'Activer'}
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 8, lineHeight: 1.6 }}>
        <strong>Si elle est activée</strong> : l’évaluateur·rice peut choisir, pour chaque CREP, le mode <strong>« PDF formulaire hors ligne »</strong>. Il télécharge un PDF à champs (au modèle de l’agent·e), le remplit sans connexion pendant l’entretien, puis l’importe (<strong>1er téléversement</strong> : la saisie est reprise dans l’outil). Après validation, il imprime ; l’agent·e écrit ses 2 cadres à la main et signe, l’évaluateur·rice contresigne, puis le CREP signé est numérisé et téléversé (<strong>2ᵉ téléversement</strong> : lecture des 2 cadres et des signatures, comme pour la saisie dans l’outil).<br />
        <strong>Si elle est désactivée</strong> (par défaut) : seuls les modes « à la main » et « dans l’outil » sont proposés, et l’aide et le tutoriel n’en parlent pas.
      </div>
      {msg && <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 8, fontSize: 12.5, fontWeight: 600, color: msg.ok ? COLORS.success : COLORS.danger }}>{msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {msg.text}</div>}
    </div>
  );
}
