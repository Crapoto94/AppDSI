import React, { useEffect, useState } from 'react';
import { GraduationCap, Trash2, Loader2 } from 'lucide-react';

// « Éduquer l'IA » : consignes reprises à chaque question. Elles aident à comprendre, sans changer droits ni chiffres.

interface Rule { id: number; texte: string; commune: boolean; auteur: string; modifiable: boolean }
interface Data { admin: boolean; regles: Rule[] }

const API = '/api/assistant-finances/regles';
const headers = (): Record<string, string> => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}`, 'Content-Type': 'application/json' });
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' };

const EXEMPLES = [
  'Quand je dis « la com », il s’agit de la direction de la communication.',
  'Si je ne précise pas la section, prends le fonctionnement.',
  '« La consommation » désigne le montant mandaté.',
];

async function call(url: string, init?: RequestInit): Promise<Data> {
  const r = await fetch(url, { ...init, headers: headers() });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || (r.status === 404 ? 'Le serveur n’a pas la dernière version : il doit être redémarré.' : 'Service indisponible.'));
  return d;
}

const AssistantFinancesRules: React.FC<{ lastQuestion?: string }> = ({ lastQuestion }) => {
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState('');
  const [shared, setShared] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { call(API).then(setData).catch(e => setError(e.message)); }, []);

  const run = async (action: () => Promise<Data>) => {
    setBusy(true); setError('');
    try { setData(await action()); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); return false; } finally { setBusy(false); }
  };
  const add = async () => {
    if (await run(() => call(API, { method: 'POST', body: JSON.stringify({ texte: text, commune: shared }) }))) { setText(''); setShared(false); }
  };

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 15, color: '#0f172a' }}><GraduationCap size={19} color="#7c3aed" /> Éduquer l’IA</div>
      <p style={{ fontSize: 13, color: '#475569', margin: '6px 0 12px' }}>
        Donnez une consigne : elle sera reprise à chacune de vos questions. Elle aide l’IA à comprendre ; elle ne change ni vos droits ni les chiffres,
        et ne peut pas ajouter une fonction qui n’existe pas.
      </p>
      <textarea value={text} onChange={e => setText(e.target.value)} maxLength={300} rows={3} aria-label="Nouvelle consigne" placeholder={EXEMPLES[0]}
        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: 10, fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical' }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0 10px' }}>
        {EXEMPLES.map(e => <button type="button" key={e} onClick={() => setText(e)} style={{ ...btn, fontWeight: 500, padding: '3px 9px' }}>{e}</button>)}
        {lastQuestion && <button type="button" onClick={() => setText(`Quand je demande « ${lastQuestion.slice(0, 120)} », il faut `)} style={{ ...btn, padding: '3px 9px', borderColor: '#ddd6fe', color: '#5b21b6' }}>Corriger ma dernière question</button>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={add} disabled={busy || text.trim().length < 8} style={{ ...btn, background: '#7c3aed', borderColor: '#7c3aed', color: '#fff', opacity: busy || text.trim().length < 8 ? 0.5 : 1 }}>
          {busy && <Loader2 size={14} />} Enregistrer la consigne
        </button>
        {data?.admin && (
          <label style={{ fontSize: 12.5, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} /> Pour tous les agents
          </label>
        )}
      </div>
      {error && <div role="alert" style={{ color: '#b91c1c', fontSize: 12.5, marginTop: 8 }}>{error}</div>}

      <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0' }}>
        {data && !data.regles.length && <div style={{ fontSize: 13, color: '#94a3b8', padding: '10px 0' }}>Aucune consigne pour l’instant.</div>}
        {data?.regles.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap', background: r.commune ? '#dcfce7' : '#ede9fe', color: r.commune ? '#166534' : '#5b21b6' }}>{r.commune ? 'Tous' : 'Moi'}</span>
            <span style={{ flex: 1, color: '#1e293b' }}>{r.texte}</span>
            {r.modifiable && <button type="button" onClick={() => run(() => call(`${API}/${r.id}`, { method: 'DELETE' }))} disabled={busy} title="Supprimer la consigne" aria-label="Supprimer la consigne" style={{ ...btn, padding: '3px 7px', color: '#b91c1c' }}><Trash2 size={13} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AssistantFinancesRules;
