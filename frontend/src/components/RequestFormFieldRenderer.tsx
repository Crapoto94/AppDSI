import React, { useState, useEffect } from 'react';
import type { FormFieldDef, ServiceDirectionDef, AgentAnswer, StudioAgentAnswer, FutursAgentAnswer } from './requestFormTypes';
import { isFieldVisible } from './requestFormTypes';
import { useADSearch } from '../utils/useADSearch';

const fieldStyles: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: '#334155' },
  required: { color: '#e11d48', marginLeft: 3 },
  desc: { fontSize: 12, color: '#94a3b8' },
  input: { border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 10px', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
};

/**
 * Recherche d'agent AD — même mécanisme que la sélection de participants
 * d'une réunion (useADSearch, cf. CreateReunionModal.tsx). Utilisé par les
 * champs "agent" et "agent_multi" ; `clearAfterSelect` vide le champ de
 * recherche après une sélection (mode multiple : on enchaîne les
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
        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
          {ad.results.map((u) => (
            <div
              key={u.username}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
              onMouseDown={() => {
                onChange({ displayName: u.displayName, email: u.email });
                ad.setQuery(clearAfterSelect ? '' : u.displayName);
                ad.clearResults();
              }}
            >
              <div style={{ fontWeight: 600, color: '#1e293b' }}>{u.displayName}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.email}{u.service ? ` — ${u.service}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Recherche d'agent dans le référentiel RH Studio (pas l'AD) — utilisée par
 * le formulaire spécial "Arrivée d'agent" (agent arrivé + N+1/manager, tous
 * deux doivent résoudre à un agent RH Studio existant). Réutilise useADSearch
 * pointé sur le proxy /api/infra/rh-studio/agents/search, dont la réponse est
 * façonnée côté serveur pour respecter la forme ADUser ; l'id numérique
 * RefAgent (nécessaire pour agent_id/manager_id côté RH Studio) est
 * transporté dans `username` (reconverti en nombre ici).
 */
function StudioAgentSearchInput({ value, onChange, token }: { value: StudioAgentAnswer | null | undefined; onChange: (v: StudioAgentAnswer | null) => void; token: string | null }) {
  const ad = useADSearch(token, { endpoint: '/api/infra/rh-studio/agents/search' });
  const [prevDisplayName, setPrevDisplayName] = useState(value?.displayName || '');
  if ((value?.displayName || '') !== prevDisplayName) {
    setPrevDisplayName(value?.displayName || '');
    ad.setQuery(value?.displayName || '');
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        style={fieldStyles.input}
        placeholder="Rechercher un agent (RH Studio)…"
        value={ad.query}
        onChange={(e) => { onChange(null); ad.setQuery(e.target.value); }}
      />
      {ad.searching && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8' }}>…</span>}
      {ad.results.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
          {ad.results.map((u) => (
            <div
              key={u.username}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
              onMouseDown={() => {
                onChange({ id: Number(u.username), displayName: u.displayName, email: u.email, service: u.service });
                ad.setQuery(u.displayName);
                ad.clearResults();
              }}
            >
              <div style={{ fontWeight: 600, color: '#1e293b' }}>{u.displayName}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.email}{u.service ? ` — ${u.service}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface FutursAgent { id: number; nom: string; prenom: string; date_premiere_arrivee: string | null; }

/**
 * Champ spécial du formulaire "Arrivée d'agent" (étape "pas encore arrivé") :
 * propose la liste des agents dont l'arrivée est prévue prochainement côté
 * RH Studio (déjà connus, pas encore onboardés), ou "aucun d'entre eux" qui
 * révèle une saisie manuelle nom/prénom (RH Studio créera alors l'agent avec
 * nom_temp/prenom_temp en attendant sa fiche RH complète).
 */
function FutursAgentPicker({ value, onChange, token, disabled }: { value: FutursAgentAnswer | null | undefined; onChange: (v: FutursAgentAnswer | null) => void; token: string | null; disabled?: boolean }) {
  const [agents, setAgents] = useState<FutursAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const manualMode = value?.mode === 'manual' || (!value && agents.length === 0 && !loading);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/infra/rh-studio/futurs-agents', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setAgents(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setError('Impossible de contacter RH Studio'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  if (loading) return <div style={{ fontSize: 13, color: '#94a3b8' }}>Chargement des futurs arrivants…</div>;
  if (error) return <div style={{ fontSize: 13, color: '#dc2626' }}>{error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {agents.map((a) => {
        const selected = value?.mode === 'existing' && value.agent_id === a.id;
        return (
          <button
            key={a.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ mode: 'existing', agent_id: a.id, nom: a.nom, prenom: a.prenom, date_arrivee_prevue: a.date_premiere_arrivee })}
            style={{
              textAlign: 'left', padding: '10px 14px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
              border: selected ? '2px solid #6366f1' : '1px solid #cbd5e1',
              background: selected ? '#eef2ff' : 'white',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{a.prenom} {a.nom}</div>
            {a.date_premiere_arrivee && (
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Arrivée prévue le {new Date(a.date_premiere_arrivee).toLocaleDateString('fr-FR')}</div>
            )}
          </button>
        );
      })}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange({ mode: 'manual', nom: '', prenom: '' })}
        style={{
          textAlign: 'left', padding: '10px 14px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
          border: manualMode ? '2px solid #6366f1' : '1px dashed #cbd5e1',
          background: manualMode ? '#eef2ff' : 'white', color: '#475569', fontSize: 13, fontWeight: 600,
        }}
      >
        Aucun de la liste / autre agent
      </button>
      {manualMode && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={fieldStyles.input}
            placeholder="Nom"
            disabled={disabled}
            value={value?.mode === 'manual' ? value.nom : ''}
            onChange={(e) => onChange({ mode: 'manual', nom: e.target.value, prenom: value?.mode === 'manual' ? value.prenom : '' })}
          />
          <input
            style={fieldStyles.input}
            placeholder="Prénom"
            disabled={disabled}
            value={value?.mode === 'manual' ? value.prenom : ''}
            onChange={(e) => onChange({ mode: 'manual', nom: value?.mode === 'manual' ? value.nom : '', prenom: e.target.value })}
          />
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
  disabled?: boolean;
}

export default function RequestFormFieldRenderer({ fields, answers, onChange, serviceTree, columns = 2, token, disabled }: Props) {
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
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{f.description}</div>
              </div>
            )}
            {f.type === 'text' && (
              <input style={fieldStyles.input} value={value || ''} disabled={disabled} onChange={(e) => onChange(f.key, e.target.value)} />
            )}
            {f.type === 'textarea' && (
              <textarea style={{ ...fieldStyles.input, resize: 'vertical' }} rows={3} value={value || ''} disabled={disabled} onChange={(e) => onChange(f.key, e.target.value)} />
            )}
            {f.type === 'date' && (
              <input type="date" style={fieldStyles.input} value={value || ''} disabled={disabled} onChange={(e) => onChange(f.key, e.target.value)} />
            )}
            {f.type === 'select' && (
              <select style={fieldStyles.input} value={value || ''} disabled={disabled} onChange={(e) => onChange(f.key, e.target.value)}>
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
                    disabled={disabled}
                    onClick={() => onChange(f.key, opt.v)}
                    style={{
                      padding: '8px 18px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', fontSize: 13, fontWeight: 600,
                      border: value === opt.v ? '2px solid #6366f1' : '1px solid #cbd5e1',
                      background: value === opt.v ? '#eef2ff' : 'white', color: value === opt.v ? '#4338ca' : '#475569',
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
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{agent.displayName}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{agent.email}</div>
                        </div>
                        {!disabled && (
                          <button
                            type="button"
                            onClick={() => onChange(f.key, value.filter((_: AgentAnswer, idx: number) => idx !== i))}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {!disabled && (
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
                )}
              </div>
            )}
            {f.type === 'studio_agent' && (
              <StudioAgentSearchInput value={value} onChange={(v) => onChange(f.key, v)} token={token || null} />
            )}
            {f.type === 'studio_futurs_agent_picker' && (
              <FutursAgentPicker value={value} onChange={(v) => onChange(f.key, v)} token={token || null} disabled={disabled} />
            )}
            {f.type === 'direction_service' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <select
                  style={fieldStyles.input}
                  disabled={disabled}
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
                  disabled={disabled || !value?.direction_code}
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
