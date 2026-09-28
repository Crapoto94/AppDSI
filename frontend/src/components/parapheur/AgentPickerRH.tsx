import React, { useState } from 'react';
import { Search, X, UserPlus } from 'lucide-react';
import { useADSearch } from '../../utils/useADSearch';
import AgentPresenceBadge from '../AgentPresenceBadge';

export interface AgentRef {
  id?: number;
  displayName: string;
  email: string;
  service?: string;
  poste?: string;
  matricule?: string;
  /** Signataire extérieur (hors collectivité) : pas de compte AD/RH Studio. */
  external?: boolean;
}

interface Props {
  value: AgentRef[];
  onChange: (v: AgentRef[]) => void;
  token: string | null;
  placeholder?: string;
}

/**
 * Sélection multiple d'agents depuis le référentiel RH Studio.
 * Réutilise useADSearch pointé sur le proxy RH Studio (l'id RefAgent est
 * transporté dans `username`) — même modèle que MultiAgentPicker / StudioAgentSearchInput.
 */
export default function AgentPickerRH({ value, onChange, token, placeholder }: Props) {
  const ad = useADSearch(token, { endpoint: '/api/infra/rh-studio/agents/search' });
  const [input, setInput] = useState('');

  const add = (u: { username: string; displayName: string; email: string; service?: string; poste?: string; matricule?: string }) => {
    const email = (u.email || '').toLowerCase();
    if (!email) return;
    if (value.some(v => v.email.toLowerCase() === email)) {
      ad.clearResults();
      setInput('');
      return;
    }
    onChange([...value, { id: Number(u.username) || undefined, displayName: u.displayName, email: u.email, service: u.service, poste: u.poste, matricule: u.matricule }]);
    ad.clearResults();
    setInput('');
  };

  const remove = (email: string) => onChange(value.filter(v => v.email !== email));

  const query = input || ad.query;
  const results = input ? ad.results : ad.results;

  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {value.map(v => (
            <div key={v.email} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20, padding: '5px 10px 5px 12px', fontSize: 13 }}>
              <AgentPresenceBadge email={v.email} name={v.displayName} size={12} />
              <div style={{ lineHeight: 1.1 }}>
                <div style={{ fontWeight: 700, color: '#1e293b' }}>{v.displayName}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{v.email}</div>
              </div>
              <button type="button" onClick={() => remove(v.email)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 2 }}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={query}
            placeholder={placeholder || 'Rechercher un agent (RH Studio)…'}
            onChange={(e) => { setInput(e.target.value); ad.setQuery(e.target.value); }}
            style={{ width: '100%', padding: '10px 12px 10px 32px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}
          />
        </div>
        {ad.searching && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8' }}>…</span>}
        {results.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 30, top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.1)', maxHeight: 240, overflowY: 'auto', marginTop: 4 }}>
            {results.map(u => (
              <div
                key={u.username}
                onMouseDown={() => add(u)}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <UserPlus size={14} color="#94a3b8" />
                <div>
                  <div style={{ fontWeight: 600, color: '#1e293b' }}>{u.displayName}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.email}{u.service ? ` — ${u.service}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
