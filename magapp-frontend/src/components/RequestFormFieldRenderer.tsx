import React, { useState } from 'react';
import type { FormFieldDef, ServiceDirectionDef, AgentAnswer } from './requestFormTypes';
import { isFieldVisible } from './requestFormTypes';
import { useADSearch } from '../utils/useADSearch';

const fieldStyles: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: '0.9rem', fontWeight: 600, color: '#334155' },
  required: { color: '#e11d48', marginLeft: 3 },
  desc: { fontSize: '0.8rem', color: '#94a3b8' },
  input: { border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: '0.95rem', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
};

/**
 * Recherche d'agent AD — même mécanisme que la sélection de participants
 * d'une réunion (useADSearch, cf. CreateReunionModal.tsx côté DSI Hub).
 * Utilisé par les champs "agent" et "agent_multi" ; `clearAfterSelect` vide
 * le champ de recherche après une sélection (mode multiple : on enchaîne les
 * recherches) au lieu de garder le nom choisi affiché (mode simple).
 */
function AgentSearchInput({ value, onChange, token, clearAfterSelect }: { value: AgentAnswer | null | undefined; onChange: (v: AgentAnswer | null) => void; token: string | null; clearAfterSelect?: boolean }) {
  const ad = useADSearch(token);
  const [prevDisplayName, setPrevDisplayName] = useState(value?.displayName || '');
  // Resynchronise le champ texte quand la valeur change depuis l'extérieur
  // (ex. réinitialisation du formulaire) — ajustement pendant le rendu plutôt
  // qu'un effet, pour éviter un setState synchrone dans un useEffect. Non
  // applicable en mode multiple (value reste toujours null).
  if (!clearAfterSelect && (value?.displayName || '') !== prevDisplayName) {
    setPrevDisplayName(value?.displayName || '');
    ad.setQuery(value?.displayName || '');
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        style={fieldStyles.input}
        placeholder={clearAfterSelect ? 'Ajouter un agent…' : 'Rechercher un agent…'}
        value={ad.query}
        onChange={(e) => { onChange(null); ad.setQuery(e.target.value); }}
      />
      {ad.searching && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8' }}>…</span>}
      {ad.results.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 2100, top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.15)', maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
          {ad.results.map((u) => (
            <div
              key={u.username}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid #f1f5f9' }}
              onMouseDown={() => {
                onChange({ displayName: u.displayName, email: u.email });
                ad.setQuery(clearAfterSelect ? '' : u.displayName);
                ad.clearResults();
              }}
            >
              <div style={{ fontWeight: 600, color: '#1e293b' }}>{u.displayName}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{u.email}{u.service ? ` — ${u.service}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Une réponse peut être une chaîne/booléen (champs simples) ou un objet
// (agent AD, direction/service) selon f.type — laissé en `any` volontairement,
// le rendu ci-dessous gère chaque type de champ correctement.
interface Props {
  fields: FormFieldDef[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answers: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
  serviceTree: ServiceDirectionDef[];
  columns?: number;
  token?: string | null;
}

export default function RequestFormFieldRenderer({ fields, answers, onChange, serviceTree, columns = 2, token }: Props) {
  const visibleFields = fields.filter((f) => isFieldVisible(f, answers));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 18 }}>
      {visibleFields.map((f) => {
        const value = answers[f.key];
        const gridColumn = f.column_start
          ? `${f.column_start} / span ${f.column_span}`
          : `span ${Math.min(f.column_span, columns)}`;
        return (
          <div key={f.key} style={{ ...fieldStyles.wrapper, gridColumn }}>
            {f.type !== 'description' && (
              <label style={fieldStyles.label}>{f.label}{f.required && <span style={fieldStyles.required}>*</span>}</label>
            )}
            {f.type !== 'description' && f.description && <div style={fieldStyles.desc}>{f.description}</div>}

            {f.type === 'description' && (
              <div>
                {f.label && <div style={{ ...fieldStyles.label, marginBottom: 4 }}>{f.label}</div>}
                <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{f.description}</div>
              </div>
            )}
            {f.type === 'text' && (
              <input style={fieldStyles.input} value={value || ''} onChange={(e) => onChange(f.key, e.target.value)} />
            )}
            {f.type === 'textarea' && (
              <textarea style={{ ...fieldStyles.input, resize: 'vertical' }} rows={3} value={value || ''} onChange={(e) => onChange(f.key, e.target.value)} />
            )}
            {f.type === 'date' && (
              <input type="date" style={fieldStyles.input} value={value || ''} onChange={(e) => onChange(f.key, e.target.value)} />
            )}
            {f.type === 'select' && (
              <select style={fieldStyles.input} value={value || ''} onChange={(e) => onChange(f.key, e.target.value)}>
                <option value="">— choisir —</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            {f.type === 'boolean' && (
              <div style={{ display: 'flex', gap: 8 }}>
                {[{ v: true, label: 'Oui' }, { v: false, label: 'Non' }].map((opt) => (
                  <button
                    key={String(opt.v)}
                    type="button"
                    onClick={() => onChange(f.key, opt.v)}
                    style={{
                      padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                      border: value === opt.v ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      background: value === opt.v ? '#eff6ff' : 'white', color: value === opt.v ? '#1d4ed8' : '#475569',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            {f.type === 'agent' && (
              <AgentSearchInput value={value} onChange={(v) => onChange(f.key, v)} token={token || null} />
            )}
            {f.type === 'agent_multi' && (
              <div>
                {Array.isArray(value) && value.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                    {value.map((agent: AgentAnswer, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>{agent.displayName}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{agent.email}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onChange(f.key, value.filter((_: AgentAnswer, idx: number) => idx !== i))}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.9rem' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <AgentSearchInput
                  value={null}
                  clearAfterSelect
                  token={token || null}
                  onChange={(v) => {
                    if (!v) return;
                    const current: AgentAnswer[] = Array.isArray(value) ? value : [];
                    if (!current.some((a) => a.email === v.email)) onChange(f.key, [...current, v]);
                  }}
                />
              </div>
            )}
            {f.type === 'direction_service' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <select
                  style={fieldStyles.input}
                  value={value?.direction_code || ''}
                  onChange={(e) => {
                    const dir = serviceTree.find((d) => d.code === e.target.value);
                    onChange(f.key, dir ? { direction_code: dir.code, direction_label: dir.label, service_code: '', service_label: '' } : null);
                  }}
                >
                  <option value="">Direction…</option>
                  {serviceTree.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
                </select>
                <select
                  style={fieldStyles.input}
                  disabled={!value?.direction_code}
                  value={value?.service_code || ''}
                  onChange={(e) => {
                    const dir = serviceTree.find((d) => d.code === value?.direction_code);
                    const svc = dir?.services.find((s) => s.code === e.target.value);
                    onChange(f.key, { ...value, service_code: svc?.code || '', service_label: svc?.label || '' });
                  }}
                >
                  <option value="">{value?.direction_code ? 'Service…' : 'Choisir une direction'}</option>
                  {(serviceTree.find((d) => d.code === value?.direction_code)?.services || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                </select>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
