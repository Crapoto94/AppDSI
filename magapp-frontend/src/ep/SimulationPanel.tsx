import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { FlaskConical, Trash2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from './useAuth';
import { COLORS, btnGhost, card } from './ui';

/** Mode simulation (administrateurs) : tester sans polluer les données réelles + bouton « Supprimer la base de simulation ». */
export default function SimulationPanel() {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try { const r = await axios.get('/api/entretiens/settings', { headers }); setOn(!!r.data.simulation); } catch { setOn(false); }
  }, [headers]);
  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    const next = !on;
    if (next && !window.confirm('Activer le mode simulation ?\n\nAucun mail ne partira aux agent·e·s hors BETA, et la vue « Demandes de formation » ajoutera des demandes FICTIVES (jamais enregistrées).')) return;
    setBusy(true); setMsg(null);
    try {
      const r = await axios.put('/api/entretiens/simulation', { on: next }, { headers });
      setOn(!!r.data.simulation);
      setMsg({ ok: true, text: next ? 'Mode simulation activé.' : 'Mode simulation désactivé.' });
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Action impossible.' }); } finally { setBusy(false); }
  };

  const supprimer = async () => {
    if (!window.confirm('Supprimer la base de simulation ?\n\nTous les rendez-vous et tous les entretiens professionnels (avec leur contenu : saisies, comptes rendus, scans, signatures en cours) seront effacés.\n\nNe sont PAS touchés : la définition des évaluateur·rice·s, « qui valide qui » et le lien avec l’Active Directory.\n\nCette action est définitive.')) return;
    setBusy(true); setMsg(null);
    try {
      const r = await axios.post('/api/entretiens/simulation/reset', {}, { headers });
      const w = Array.isArray(r.data.warnings) && r.data.warnings.length ? ` (${r.data.warnings.length} avertissement(s) : ${r.data.warnings.slice(0, 2).join(' ; ')})` : '';
      setMsg({ ok: true, text: `Base de simulation supprimée : ${r.data.entretiens} entretien(s) remis à zéro${w}.` });
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Suppression impossible.' }); } finally { setBusy(false); }
  };

  return (
    <div style={{ ...card, padding: 18, marginBottom: 16, borderColor: on ? '#f59e0b' : undefined }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 800, color: COLORS.text }}>
          <FlaskConical size={17} color="#d97706" /> Mode simulation
          {on && <span style={{ fontSize: 11, fontWeight: 800, background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '2px 9px' }}>ACTIF</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btnGhost} disabled={busy || on === null} onClick={toggle}>
            {busy ? <Loader2 size={14} className="spin" /> : <FlaskConical size={14} />} {on ? 'Désactiver la simulation' : 'Activer la simulation'}
          </button>
          {on && (
            <button style={{ ...btnGhost, color: COLORS.danger, borderColor: '#fecaca' }} disabled={busy} onClick={supprimer}>
              <Trash2 size={14} /> Supprimer la base de simulation
            </button>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 8, lineHeight: 1.55 }}>
        Permet de tester l’application sans polluer les données réelles. Réservé aux administrateurs du module.
      </div>
      <table style={{ borderCollapse: 'collapse', marginTop: 10, fontSize: 12, width: '100%', maxWidth: 620 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: COLORS.muted }}>
            <th style={{ padding: '4px 8px' }}>Élément</th><th style={{ padding: '4px 8px' }}>En simulation</th><th style={{ padding: '4px 8px' }}>Effacé par le bouton ?</th>
          </tr>
        </thead>
        <tbody>
          {([
            ['Définition des évaluateur·rice·s', 'Réel', 'Non'],
            ['Qui valide qui', 'Réel', 'Non'],
            ['Lien Active Directory', 'Réel', 'Non'],
            ['Rendez-vous', 'Provisoire', 'Oui'],
            ['Entretiens professionnels et contenu', 'Provisoire', 'Oui'],
          ] as const).map(([a, b, c]) => (
            <tr key={a} style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <td style={{ padding: '4px 8px', fontWeight: 600 }}>{a}</td>
              <td style={{ padding: '4px 8px', color: b === 'Réel' ? '#166534' : '#92400e', fontWeight: 700 }}>{b}</td>
              <td style={{ padding: '4px 8px' }}>{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 10, lineHeight: 1.55 }}>
        Pendant la simulation : aucun mail ne part aux agent·e·s hors BETA, et la vue « Demandes de formation » ajoute des demandes <b>fictives</b> (la moitié des agent·e·s, selon leur métier) qui ne sont jamais enregistrées.
        Le lien Active Directory sert à rattraper les agent·e·s sans e-mail : il est réel et conservé.
      </div>
      {msg && (
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 10, fontSize: 12.5, fontWeight: 600, color: msg.ok ? COLORS.success : COLORS.danger }}>
          {msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {msg.text}
        </div>
      )}
    </div>
  );
}
