import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { KeyRound, ShieldAlert, Loader2, CheckCircle2, AlertCircle, Trash2, Save } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface Status {
  has_password: boolean; enabled: boolean; expires_at: string; expired: boolean; block_admins: boolean; active: boolean;
  set_by: string; set_at: string; min_length: number;
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e9eef5', borderRadius: 14, padding: 20, boxShadow: '0 1px 3px rgba(15,23,42,.04)' };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 11px', fontSize: 14 };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 9, padding: '10px 16px', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', background: '#4f46e5', color: '#fff' };

/**
 * Accès de secours : mot de passe universel PARAMÉTRABLE (jamais écrit dans le code).
 * Désactivé tant qu'aucun mot de passe n'est défini ; stocké haché ; limité dans le temps ; interdit aux administrateurs par défaut.
 */
const UniversalPassword: React.FC = () => {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const [st, setSt] = useState<Status | null>(null);
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [expires, setExpires] = useState('');
  const [block, setBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (s: Status) => { setSt(s); setExpires(s.expires_at ? s.expires_at.slice(0, 10) : ''); setBlock(s.block_admins); };
  const load = useCallback(async () => {
    try { const r = await axios.get('/api/admin/universal-password', { headers }); apply(r.data); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Chargement impossible.' }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const save = async (extra: Record<string, unknown> = {}) => {
    setBusy(true); setMsg(null);
    try {
      if (pwd && pwd !== pwd2) { setMsg({ ok: false, text: 'Les deux saisies du mot de passe ne correspondent pas.' }); return; }
      const r = await axios.post('/api/admin/universal-password', { password: pwd || undefined, expires_at: expires ? `${expires}T23:59:59` : '', block_admins: block, ...extra }, { headers });
      apply(r.data); setPwd(''); setPwd2('');
      setMsg({ ok: true, text: 'Réglages enregistrés.' });
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Enregistrement impossible.' }); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm('Supprimer le mot de passe universel ? L’accès de secours sera désactivé.')) return;
    setBusy(true); setMsg(null);
    try { const r = await axios.delete('/api/admin/universal-password', { headers }); apply(r.data); setMsg({ ok: true, text: 'Mot de passe universel supprimé : accès de secours désactivé.' }); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Suppression impossible.' }); } finally { setBusy(false); }
  };

  if (!st) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><Loader2 size={22} /></div>;
  const state = st.active ? { t: 'Actif', c: '#b91c1c', bg: '#fee2e2' } : st.has_password && st.enabled && st.expired ? { t: 'Expiré', c: '#92400e', bg: '#fef3c7' } : { t: 'Désactivé', c: '#166534', bg: '#dcfce7' };

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 720 }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <KeyRound size={20} color="#4f46e5" />
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>Accès de secours (mot de passe universel)</div>
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: state.c, background: state.bg, borderRadius: 999, padding: '3px 11px' }}>{state.t}</span>
        </div>
        <div style={{ display: 'flex', gap: 9, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>
          <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>Ce mot de passe permet de se connecter à MagApp et au DSI Hub <strong>sous l’identité de n’importe quel compte</strong>. Réservez-le à la recette ou au dépannage, <strong>désactivez-le dès que possible</strong> et choisissez-en un long et unique. Il est stocké haché ; chaque utilisation est journalisée.</div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 700, color: '#334155' }}>
            {st.has_password ? 'Nouveau mot de passe (laisser vide pour conserver l’actuel)' : 'Mot de passe universel'}
            <input style={input} type="password" autoComplete="new-password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder={`${st.min_length} caractères au minimum`} />
          </label>
          {pwd && (
            <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 700, color: '#334155' }}>Confirmer le mot de passe
              <input style={input} type="password" autoComplete="new-password" value={pwd2} onChange={e => setPwd2(e.target.value)} />
            </label>
          )}
          <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 700, color: '#334155' }}>Valable jusqu’au (facultatif)
            <input style={{ ...input, maxWidth: 220 }} type="date" value={expires} onChange={e => setExpires(e.target.value)} />
            <span style={{ fontWeight: 500, color: '#94a3b8', fontSize: 12 }}>Passée cette date, l’accès de secours se désactive tout seul.</span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: '#334155' }}>
            <input type="checkbox" checked={block} onChange={e => setBlock(e.target.checked)} style={{ marginTop: 3 }} />
            <span><strong>Interdire pour les comptes administrateurs</strong> (recommandé) : le mot de passe universel ne permet pas d’entrer sous un compte admin ou superadmin.</span>
          </label>
        </div>

        {msg && <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 12, fontSize: 13, fontWeight: 600, color: msg.ok ? '#166534' : '#b91c1c' }}>{msg.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {msg.text}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          <button style={btn} disabled={busy} onClick={() => save()}>{busy ? <Loader2 size={14} /> : <Save size={14} />} Enregistrer</button>
          {st.has_password && !st.enabled && <button style={{ ...btn, background: '#b91c1c' }} disabled={busy} onClick={() => save({ enabled: true })}>Activer l’accès de secours</button>}
          {st.has_password && st.enabled && <button style={{ ...btn, background: '#16a34a' }} disabled={busy} onClick={() => save({ enabled: false })}>Désactiver</button>}
          {st.has_password && <button style={{ ...btn, background: '#fff', color: '#b91c1c', border: '1px solid #fecaca' }} disabled={busy} onClick={remove}><Trash2 size={14} /> Supprimer le mot de passe</button>}
        </div>
        {st.has_password && st.set_by && <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>Dernier changement par {st.set_by}{st.set_at ? ` le ${new Date(st.set_at).toLocaleString('fr-FR')}` : ''}.</div>}
      </div>
    </div>
  );
};

export default UniversalPassword;
