import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Bot, Save, RotateCcw, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { useAuth } from './useAuth';
import { COLORS, btnGhost, btnPrimary, card } from './ui';

interface PromptDef { id: string; group: string; label: string; description: string; vars: string[]; text: string; default: string; modified: boolean }

/** Onglet « IA » du paramétrage : tous les prompts de l'IA locale, lisibles et modifiables (avec retour au texte d'origine). */
export default function IaPrompts() {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [list, setList] = useState<PromptDef[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await axios.get('/api/entretiens/prompts', { headers });
      setList(r.data.prompts || []);
      setDraft({});
    } catch (e: any) { setMsg({ id: '', ok: false, text: e?.response?.data?.message || 'Chargement impossible.' }); }
  }, [headers]);
  useEffect(() => { load(); }, [load]);

  const save = async (p: PromptDef, text: string) => {
    setBusy(p.id); setMsg(null);
    try {
      const r = await axios.put(`/api/entretiens/prompts/${encodeURIComponent(p.id)}`, { text }, { headers });
      setList(r.data.prompts || []);
      setDraft(d => { const n = { ...d }; delete n[p.id]; return n; });
      setMsg({ id: p.id, ok: true, text: text === p.default || !text.trim() ? 'Texte d’origine rétabli.' : 'Prompt enregistré : il sera utilisé dès la prochaine analyse.' });
    } catch (e: any) { setMsg({ id: p.id, ok: false, text: e?.response?.data?.message || 'Enregistrement impossible.' }); } finally { setBusy(''); }
  };

  if (!list) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><Loader2 size={22} className="spin" /></div>;
  const groups = [...new Set(list.map(p => p.group))];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: 9, padding: '9px 12px', fontSize: 12.5, marginBottom: 14, lineHeight: 1.55 }}>
        <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>Voici <b>chaque consigne (prompt)</b> envoyée à l’IA locale de la Ville. Vous pouvez les adapter. Les mots entre doubles accolades, comme <code>{'{{lignes}}'}</code>, sont remplacés automatiquement par l’application : <b>ne les supprimez pas</b>. Pour les prompts de lecture des manuscrits, conservez aussi les noms de champs du format JSON. « Rétablir » ramène le texte d’origine.</span>
      </div>
      {groups.map(g => (
        <div key={g} style={{ ...card, marginBottom: 14, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', fontWeight: 800, fontSize: 13.5, color: COLORS.text, borderBottom: `1px solid ${COLORS.border}`, display: 'flex', gap: 8, alignItems: 'center' }}><Bot size={16} color={COLORS.primary} /> {g}</div>
          {list.filter(p => p.group === g).map(p => {
            const isOpen = open.has(p.id);
            const value = draft[p.id] ?? p.text;
            const dirty = value !== p.text;
            return (
              <div key={p.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <div onClick={() => setOpen(o => { const n = new Set(o); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', cursor: 'pointer', background: isOpen ? '#f8fafc' : '#fff' }}>
                  {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <span style={{ fontWeight: 700, fontSize: 13, color: COLORS.text }}>{p.label}</span>
                  {p.modified && <span style={{ fontSize: 10.5, fontWeight: 800, background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '1px 8px' }}>modifié</span>}
                </div>
                {isOpen && (
                  <div style={{ padding: '4px 14px 14px' }}>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 6 }}>{p.description}</div>
                    {p.vars.length > 0 && <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 6 }}>Variables : {p.vars.map(v => <code key={v} style={{ background: '#f1f5f9', borderRadius: 4, padding: '0 5px', marginRight: 5 }}>{`{{${v}}}`}</code>)}</div>}
                    <textarea value={value} onChange={e => setDraft(d => ({ ...d, [p.id]: e.target.value }))} spellCheck={false}
                      style={{ width: '100%', minHeight: 220, boxSizing: 'border-box', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12, lineHeight: 1.5, padding: 10, border: `1px solid ${COLORS.border}`, borderRadius: 8, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button style={btnPrimary} disabled={!dirty || busy === p.id} onClick={() => save(p, value)}>{busy === p.id ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Enregistrer</button>
                      <button style={btnGhost} disabled={busy === p.id || (!p.modified && !dirty)} onClick={() => { if (window.confirm('Rétablir le texte d’origine de ce prompt ?')) save(p, p.default); }}><RotateCcw size={14} /> Rétablir le texte d’origine</button>
                      {msg?.id === p.id && <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12.5, fontWeight: 600, color: msg.ok ? COLORS.success : COLORS.danger }}>{msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {msg.text}</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {msg && !msg.id && <div style={{ color: COLORS.danger, fontSize: 12.5 }}>{msg.text}</div>}
    </div>
  );
}
