import { useRef, useState } from 'react';
import { X, Plus, Trash2, RotateCcw } from 'lucide-react';
import { COLORS, btnGhost, btnPrimary, card } from './ui';
import { Editable, Toolbar, useHelpContents, type HelpData } from './helpContent';
import { tutoCatalog, type Step, type TutoRole } from './TutoEp';

const ROLES: Array<[TutoRole, string]> = [['valideur', 'Évaluateur·rice'], ['agent', 'Agent·e'], ['admin', 'Administrateur']];
const input: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: COLORS.text, background: '#fff', width: '100%', boxSizing: 'border-box' };
const label: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 800, color: '#64748b', margin: '10px 0 4px' };

/** Formulaire d'une étape : mêmes zones que l'écran du tutoriel. */
function StepForm({ step, data, onSave, onReset }: { step: Step; data?: HelpData; onSave: (d: HelpData) => Promise<void>; onReset: () => Promise<void> }) {
  const [emoji, setEmoji] = useState(data?.emoji || step.emoji);
  const [quest, setQuest] = useState(data?.quest || step.quest);
  const [title, setTitle] = useState(data?.title || step.title);
  const [quiz, setQuiz] = useState(data ? data.quiz || null : step.quiz || null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const example = useRef<HTMLDivElement>(null);

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true); setMsg(null);
    try { await action(); setMsg({ ok: true, text: done }); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Enregistrement impossible.' }); }
    finally { setBusy(false); }
  };
  const save = () => {
    if (!title.trim()) { setMsg({ ok: false, text: 'Le titre est obligatoire.' }); return; }
    // Sans bonne réponse, l'étape ne pourrait jamais être validée
    if (quiz && (!quiz.question.trim() || quiz.options.some(o => !o.label.trim()) || !quiz.options.some(o => o.ok))) {
      setMsg({ ok: false, text: 'Question : saisissez son texte, chaque réponse, et cochez au moins une bonne réponse.' });
      return;
    }
    const exampleEmpty = !example.current?.textContent?.trim();
    run(() => onSave({ emoji, quest, title, body: body.current?.innerHTML || '', example: exampleEmpty ? '' : example.current?.innerHTML || '', quiz }), 'Étape enregistrée.');
  };
  const setOption = (k: number, patch: Partial<{ label: string; ok: boolean; why: string }>) =>
    setQuiz(q => q && { ...q, options: q.options.map((o, i) => (i === k ? { ...o, ...patch } : o)) });

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 8 }}>
        <div><span style={label}>Icône</span><input style={input} value={emoji} maxLength={4} onChange={e => setEmoji(e.target.value)} aria-label="Icône" /></div>
        <div><span style={label}>Pastille</span><input style={input} value={quest} onChange={e => setQuest(e.target.value)} aria-label="Pastille" /></div>
      </div>
      <span style={label}>Titre</span>
      <input style={{ ...input, fontSize: 18, fontWeight: 900 }} value={title} onChange={e => setTitle(e.target.value)} aria-label="Titre" />

      <div style={{ marginTop: 10 }}><Toolbar /></div>
      <span style={label}>Texte</span>
      <Editable target={body} html={data?.body} label="Texte de l’étape" style={{ fontSize: 14, lineHeight: 1.65, color: '#334155' }}>{step.body}</Editable>
      <span style={label}>Encadré « exemple » (laisser vide pour ne pas en afficher)</span>
      <Editable target={example} html={data?.example ?? (data ? '' : undefined)} label="Exemple"
        style={{ background: '#fffbeb', fontSize: 13, lineHeight: 1.6, color: '#78350f' }}>{step.example}</Editable>

      <span style={label}>Question de vérification</span>
      {!quiz ? (
        <button style={btnGhost} onClick={() => setQuiz({ question: '', options: [{ label: '', ok: true, why: '' }, { label: '', ok: false, why: '' }] })}><Plus size={13} /> Ajouter une question</button>
      ) : (
        <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 12, padding: 12 }}>
          <input style={{ ...input, fontWeight: 800 }} placeholder="Question" value={quiz.question} onChange={e => setQuiz({ ...quiz, question: e.target.value })} aria-label="Question" />
          {quiz.options.map((o, k) => (
            <div key={k} style={{ marginTop: 8, background: '#fff', border: `2px solid ${o.ok ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 9, padding: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11.5, fontWeight: 700, color: '#166534', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={o.ok} onChange={e => setOption(k, { ok: e.target.checked })} /> Bonne
                </label>
                <input style={input} placeholder={`Réponse ${k + 1}`} value={o.label} onChange={e => setOption(k, { label: e.target.value })} aria-label={`Réponse ${k + 1}`} />
                <button style={btnGhost} title="Retirer cette réponse" disabled={quiz.options.length <= 2} onClick={() => setQuiz({ ...quiz, options: quiz.options.filter((_, i) => i !== k) })}><Trash2 size={13} /></button>
              </div>
              <input style={{ ...input, marginTop: 6, fontSize: 12.5 }} placeholder="Explication affichée après le choix" value={o.why} onChange={e => setOption(k, { why: e.target.value })} aria-label={`Explication ${k + 1}`} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button style={btnGhost} onClick={() => setQuiz({ ...quiz, options: [...quiz.options, { label: '', ok: false, why: '' }] })}><Plus size={13} /> Réponse</button>
            <button style={btnGhost} onClick={() => setQuiz(null)}><Trash2 size={13} /> Supprimer la question</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
        <button style={btnPrimary} disabled={busy} onClick={save}>Enregistrer l’étape</button>
        {data && <button style={btnGhost} disabled={busy} onClick={() => { if (window.confirm('Rétablir le texte d’origine de cette étape ?')) run(onReset, 'Texte d’origine rétabli.'); }}><RotateCcw size={13} /> Texte d’origine</button>}
        {msg && <span style={{ fontSize: 12.5, fontWeight: 700, color: msg.ok ? COLORS.success : COLORS.danger }}>{msg.text}</span>}
      </div>
    </div>
  );
}

/** Éditeur du tutoriel pas à pas (administrateurs). */
export default function TutoEditor({ onClose }: { onClose: () => void }) {
  const { contents, loaded, save, reset } = useHelpContents();
  const [role, setRole] = useState<TutoRole>('valideur');
  const [index, setIndex] = useState(0);
  const [version, setVersion] = useState(0); // recharge le formulaire après « Texte d'origine »
  const catalog = tutoCatalog(role);
  const { step } = catalog[Math.min(index, catalog.length - 1)];
  const key = `tuto:${step.id}`;
  const data = contents[key];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', overflowY: 'auto' }}>
      <div style={{ ...card, width: '100%', maxWidth: 1040, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.text }}>Modifier le tutoriel pas à pas</div>
          <button style={btnGhost} onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 12 }}>
          Enregistrez chaque étape avant d’en choisir une autre. Un texte personnalisé ne suit plus les évolutions du texte d’origine. Les captures d’écran sont conservées.
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {ROLES.map(([r, l]) => <button key={r} style={role === r ? btnPrimary : btnGhost} onClick={() => { setRole(r); setIndex(0); }}>{l}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 240px', maxWidth: 300, display: 'grid', gap: 4 }}>
            {catalog.map((x, i) => {
              const c = contents[`tuto:${x.step.id}`];
              const on = x.step.id === step.id;
              return (
                <button key={x.step.id} onClick={() => setIndex(i)} style={{ textAlign: 'left', cursor: 'pointer', borderRadius: 9, padding: '7px 10px', border: `2px solid ${on ? COLORS.primary : '#e2e8f0'}`, background: on ? '#eef2ff' : '#fff' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>{c?.quest || x.step.quest}{x.variant && ` · ${x.variant}`}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.text }}>{c?.emoji || x.step.emoji} {c?.title || x.step.title}</div>
                  {c && <div style={{ fontSize: 10.5, fontWeight: 800, color: '#92400e' }}>Texte personnalisé</div>}
                </button>
              );
            })}
          </div>
          <div style={{ flex: '3 1 480px', minWidth: 0 }}>
            {loaded && <StepForm key={`${key}:${version}`} step={step} data={data}
              onSave={d => save(key, d)}
              onReset={async () => { await reset(key); setVersion(v => v + 1); }} />}
          </div>
        </div>
      </div>
    </div>
  );
}
