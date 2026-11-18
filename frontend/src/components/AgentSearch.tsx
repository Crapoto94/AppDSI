import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import AgentPresenceBadge from './AgentPresenceBadge';

/**
 * Sélecteur d'agent partagé (repris du module /tickets : champ de recherche,
 * liste déroulante nom / email · service, badge de présence RH Studio, bouton ✕).
 *
 *  - sans `agents` : recherche dans l'AD (`/api/ad/search`), comme pour le demandeur d'un ticket ;
 *  - avec `agents` : filtrage local d'une liste fournie (ex. agents du calendrier DSI).
 */
export interface AgentOption {
  username: string;
  displayName: string;
  email: string;
  service?: string;
  [extra: string]: any;
}

interface Props {
  onSelect: (agent: AgentOption) => void;
  onClear?: () => void;
  initialName?: string;
  initialEmail?: string;
  placeholder?: string;
  /** Liste locale d'agents à filtrer (désactive la recherche AD). */
  agents?: AgentOption[];
  loading?: boolean;
  /** Masque le badge de présence RH Studio. */
  hidePresence?: boolean;
  /** Champ réduit (cellule de tableau). */
  compact?: boolean;
}

const norm = (v: string) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function AgentSearch({ onSelect, onClear, initialName, initialEmail, placeholder, agents, loading, hidePresence, compact }: Props) {
  const [query, setQuery] = useState(initialName || '');
  const [results, setResults] = useState<AgentOption[]>([]);
  const [selected, setSelected] = useState<{ name: string; email: string } | null>(
    initialName ? { name: initialName, email: initialEmail || '' } : null
  );
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function filterLocal(q: string): AgentOption[] {
    const s = norm(q.trim());
    const list = agents || [];
    return (s ? list.filter(a => norm(`${a.displayName} ${a.username} ${a.email} ${a.service || ''}`).includes(s)) : list).slice(0, 50);
  }

  function search(q: string) {
    if (agents) { setResults(filterLocal(q)); setOpen(true); return; }
    if (q.length < 2) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/ad/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
        setResults(res.data);
        setOpen(true);
      } catch (e) { console.error(e); }
    }, 300);
  }

  function selectUser(u: AgentOption) {
    setSelected({ name: u.displayName, email: u.email });
    setQuery(u.displayName);
    onSelect(u);
    setOpen(false);
  }

  function clearUser() {
    setSelected(null);
    setQuery('');
    setResults([]);
    onClear?.();
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            value={query}
            disabled={loading}
            onChange={e => { setQuery(e.target.value); search(e.target.value); if (selected) clearUser(); }}
            onFocus={() => { if (selected) return; if (agents) { setResults(filterLocal(query)); setOpen(true); } else if (results.length) setOpen(true); }}
            placeholder={loading ? 'Chargement…' : (placeholder || 'Rechercher un agent par nom, email...')}
            style={{
              width: '100%', padding: compact ? '6px 9px' : '10px 14px', border: '1px solid #e2e8f0',
              borderRadius: 8, fontSize: compact ? 12.5 : 14, outline: 'none', boxSizing: 'border-box'
            }}
          />
          {open && results.length > 0 && !selected && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, marginTop: 4,
              maxHeight: 250, overflow: 'auto'
            }}>
              {results.map((u) => (
                <div key={u.username || u.email} onClick={() => selectUser(u)}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{u.displayName}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{u.email}{u.service ? ` · ${u.service}` : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        {selected && !hidePresence && <AgentPresenceBadge email={selected.email} name={selected.name} />}
        {selected && (
          <button type="button" onClick={clearUser} title="Effacer"
            style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#ef4444', whiteSpace: 'nowrap' }}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
