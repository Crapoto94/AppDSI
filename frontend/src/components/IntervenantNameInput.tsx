import { useEffect, useRef, useState } from 'react';

export interface IntervenantSuggestion {
  id: number;
  nom: string;
  prenom?: string | null;
  email?: string | null;
  organisme?: string | null;
  fonction?: string | null;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onPick: (i: IntervenantSuggestion) => void;
  token: string | null;
  placeholder?: string;
  style?: React.CSSProperties;
}

/** Champ « Nom » d'un intervenant externe avec suggestions issues des intervenants déjà saisis
 *  (annuaire hub_rencontres.intervenants_externes). Le choix pré-remplit prénom, email, organisme, fonction. */
export default function IntervenantNameInput({ value, onChange, onPick, token, placeholder, style }: Props) {
  const [results, setResults] = useState<IntervenantSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const skipNext = useRef(false);

  useEffect(() => {
    if (skipNext.current) { skipNext.current = false; return; }
    const q = value.trim();
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/rencontres-reunions/intervenants/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = res.ok ? await res.json() : [];
        setResults(Array.isArray(data) ? data : []);
        setOpen(true);
      } catch { setResults([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [value, token]);

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder={placeholder}
        style={style}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: 280, zIndex: 50, marginTop: 2, border: '1px solid #bbf7d0', borderRadius: 8, background: 'white', boxShadow: '0 6px 18px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto' }}>
          {results.map(r => (
            <div
              key={r.id}
              onMouseDown={e => { e.preventDefault(); skipNext.current = true; setOpen(false); setResults([]); onPick(r); }}
              style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{[r.prenom, r.nom].filter(Boolean).join(' ')}</div>
              <div style={{ color: '#64748b', fontSize: 11 }}>
                {[r.fonction, r.organisme, r.email].filter(Boolean).join(' · ') || 'Aucun détail'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
