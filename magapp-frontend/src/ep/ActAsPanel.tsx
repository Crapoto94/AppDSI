import { useEffect, useState } from 'react';
import axios from 'axios';
import { Eye, X } from 'lucide-react';
import { COLORS, btnGhost, card, input } from './ui';
import { getActAs, startActAs, stopActAs } from './actAs';

/** Bandeau permanent tant qu'on affiche le module « en tant que » quelqu'un. */
export function ActAsBanner() {
  const current = getActAs();
  if (!current) return null;
  return (
    <div role="status" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', padding: '8px 16px', background: '#fef3c7', borderBottom: '1px solid #fde68a', color: '#92400e', fontSize: 13, fontWeight: 700 }}>
      <Eye size={15} /> Vous affichez les entretiens en tant que {current.nom} : vos actions sont faites avec ses droits.
      <button style={{ ...btnGhost, padding: '3px 10px', fontSize: 12, background: '#fff' }} onClick={stopActAs}>Revenir à mon compte</button>
    </div>
  );
}

/** Choix de la personne (administrateurs). */
export default function ActAsDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<Array<{ login: string; nom: string; detail?: string }>>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (q.trim().length < 2) { setUsers([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await axios.get('/api/entretiens/act-as/search', { params: { q }, headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } });
        if (alive) { setUsers(r.data.users || []); setError(''); }
      } catch (e: any) { if (alive) { setUsers([]); setError(e?.response?.data?.message || 'Recherche impossible.'); } }
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  const pick = (login: string) => startActAs(login).catch((e: any) => setError(e?.response?.data?.message || 'Impossible d’afficher en tant que cette personne.'));
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 2100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 12px' }}>
      <div role="dialog" aria-label="Afficher en tant que" onClick={e => e.stopPropagation()} style={{ ...card, background: '#fff', width: '100%', maxWidth: 480, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: COLORS.text }}>Afficher en tant que…</div>
          <button aria-label="Fermer" onClick={onClose} style={{ border: 'none', background: '#f1f5f9', width: 30, height: 30, borderRadius: 8, cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: COLORS.muted, lineHeight: 1.5 }}>
          Vous verrez le module avec exactement les droits de la personne, y compris ses entretiens. C’est journalisé ; la signature de l’agent reste impossible.
        </p>
        <input autoFocus style={input} placeholder="Nom, identifiant ou e-mail (2 lettres min.)" value={q} onChange={e => setQ(e.target.value)} />
        {error && <div style={{ marginTop: 8, fontSize: 12.5, color: '#b91c1c' }}>{error}</div>}
        <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 8 }}>
          {users.map(u => (
            <button key={u.login} onClick={() => pick(u.login)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 8px', border: 'none', borderBottom: `1px solid ${COLORS.border}`, background: 'none', cursor: 'pointer', fontSize: 12.5 }}>
              <b>{u.nom}</b> <span style={{ color: COLORS.muted }}>· {u.login}{u.detail ? ` · ${u.detail}` : ''}</span>
            </button>
          ))}
          {q.trim().length >= 2 && !users.length && !error && <div style={{ fontSize: 12.5, color: COLORS.muted, padding: 6 }}>Aucune personne trouvée.</div>}
        </div>
      </div>
    </div>
  );
}
