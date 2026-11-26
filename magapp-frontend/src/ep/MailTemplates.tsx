import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Mail, Save, RotateCcw, Loader2, CheckCircle2, AlertCircle, Eye, Braces } from 'lucide-react';
import { useAuth } from './useAuth';
import MiniRichEditor from './MiniRichEditor';
import { COLORS, btnGhost, btnPrimary, card, input } from './ui';

interface Variable { key: string; label: string; example?: string; html?: boolean }
interface Fields { subject: string; title: string; intro: string; body: string; button: string }
interface Tpl { id: string; label: string; to: string; description: string; variables: Variable[]; fields: Fields; defaults: Fields; modified: boolean }

const FIELD_LABELS: Array<[keyof Fields, string, string]> = [
  ['subject', 'Objet du message', 'Ligne d’objet de l’e-mail.'],
  ['title', 'Titre', 'Titre affiché en haut du message.'],
  ['intro', 'Introduction', 'Premier paragraphe (salutation et phrase d’annonce).'],
  ['body', 'Corps du message', 'Contenu principal. Les blocs d’informations sont insérés par des variables de type « bloc ».'],
  ['button', 'Libellé du bouton', 'Texte du bouton qui ouvre MagApp (laisser vide pour ne pas afficher de bouton).'],
];

/** Paramétrage → Modèles d'e-mails : tous les e-mails envoyés par l'application, modifiables (éditeur visuel + variables). */
export default function MailTemplates() {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [list, setList] = useState<Tpl[] | null>(null);
  const [sel, setSel] = useState('');
  const [draft, setDraft] = useState<Fields | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const lastField = useRef<keyof Fields>('body');
  const inputRefs = useRef<Partial<Record<keyof Fields, HTMLInputElement | null>>>({});

  const load = useCallback(async (keep?: string) => {
    try {
      const r = await axios.get('/api/entretiens/mail-templates', { headers });
      const t: Tpl[] = r.data.templates || [];
      setList(t);
      const id = keep || sel || t[0]?.id || '';
      setSel(id);
      const cur = t.find(x => x.id === id);
      setDraft(cur ? { ...cur.fields } : null);
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Chargement impossible.' }); setList([]); }
  }, [headers, sel]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const tpl = list?.find(t => t.id === sel) || null;
  const dirty = !!tpl && !!draft && (Object.keys(draft) as Array<keyof Fields>).some(k => draft[k] !== tpl.fields[k]);

  const choose = (t: Tpl) => { setSel(t.id); setDraft({ ...t.fields }); setPreview(null); setMsg(null); lastField.current = 'body'; };

  const save = async (fields: Fields) => {
    if (!tpl) return;
    setBusy(true); setMsg(null);
    try {
      const r = await axios.put(`/api/entretiens/mail-templates/${tpl.id}`, fields, { headers });
      const t: Tpl[] = r.data.templates || [];
      setList(t);
      const cur = t.find(x => x.id === tpl.id);
      setDraft(cur ? { ...cur.fields } : fields);
      setMsg({ ok: true, text: 'Modèle enregistré : il est utilisé dès le prochain envoi.' });
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Enregistrement impossible.' }); } finally { setBusy(false); }
  };

  const showPreview = async () => {
    if (!tpl || !draft) return;
    setPreviewBusy(true); setMsg(null);
    try { const r = await axios.post(`/api/entretiens/mail-templates/${tpl.id}/preview`, draft, { headers }); setPreview(r.data); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Aperçu impossible.' }); } finally { setPreviewBusy(false); }
  };

  /** Insère {{variable}} là où se trouve le curseur (champ texte ou éditeur visuel). */
  const insertVar = (key: string) => {
    const token = `{{${key}}}`;
    const el = document.activeElement as HTMLElement | null;
    if (el && el.getAttribute && el.getAttribute('role') === 'textbox') { try { document.execCommand('insertText', false, token); } catch { /* ignore */ } return; }
    const f = lastField.current;
    if (!draft) return;
    if (f === 'subject' || f === 'title' || f === 'button') {
      const inp = inputRefs.current[f];
      const v = draft[f];
      const a = inp?.selectionStart ?? v.length, b = inp?.selectionEnd ?? v.length;
      setDraft({ ...draft, [f]: v.slice(0, a) + token + v.slice(b) });
    } else {
      setDraft({ ...draft, [f]: draft[f] + token });
    }
  };

  if (!list) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><Loader2 size={22} className="spin" /></div>;
  const groups = [...new Set(list.map(t => t.to))];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
      <div style={{ ...card, padding: 10 }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13.5, fontWeight: 800, color: COLORS.text, padding: '4px 6px 8px' }}><Mail size={16} color={COLORS.primary} /> E-mails envoyés par l’application</div>
        {groups.map(g => (
          <div key={g} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: .4, color: '#94a3b8', textTransform: 'uppercase', padding: '6px 6px 2px' }}>À : {g}</div>
            {list.filter(t => t.to === g).map(t => (
              <button key={t.id} type="button" onClick={() => choose(t)}
                style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 6, textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 8, padding: '7px 8px', fontSize: 12.5, fontWeight: sel === t.id ? 800 : 600,
                  background: sel === t.id ? '#eef2ff' : 'transparent', color: sel === t.id ? COLORS.primary : '#334155' }}>
                <span style={{ flex: 1 }}>{t.label}</span>
                {t.modified && <span title="Modèle personnalisé" style={{ width: 8, height: 8, borderRadius: 999, background: '#d97706', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        ))}
      </div>

      {tpl && draft ? (
        <div style={{ ...card, padding: 16, display: 'grid', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.text }}>{tpl.label}</div>
            <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 2, lineHeight: 1.5 }}>Destinataire : <strong>{tpl.to}</strong>. {tpl.description}</div>
          </div>

          {FIELD_LABELS.map(([k, label, hint]) => (
            <div key={k}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 3 }}>{label} <span style={{ fontWeight: 500, color: '#94a3b8' }}>— {hint}</span></div>
              {k === 'intro' || k === 'body'
                ? <div onFocusCapture={() => { lastField.current = k; }}><MiniRichEditor value={draft[k]} onChange={v => setDraft(d => (d ? { ...d, [k]: v } : d))} minHeight={k === 'body' ? 150 : 80} /></div>
                : <input ref={el => { inputRefs.current[k] = el; }} style={input} value={draft[k]} onFocus={() => { lastField.current = k; }} onChange={e => setDraft({ ...draft, [k]: e.target.value })} />}
            </div>
          ))}

          <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '10px 12px', background: '#f8fafc' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, fontWeight: 800, color: '#334155', marginBottom: 6 }}><Braces size={14} /> Variables disponibles <span style={{ fontWeight: 500, color: '#94a3b8' }}>(cliquer pour insérer à l’endroit du curseur)</span></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {tpl.variables.map(v => (
                <button key={v.key} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insertVar(v.key)} title={`${v.label}${v.example && !v.html ? ` — exemple : ${v.example}` : ''}`}
                  style={{ border: `1px solid ${v.html ? '#ddd6fe' : '#c7d2fe'}`, background: v.html ? '#f5f3ff' : '#eef2ff', color: v.html ? '#5b21b6' : '#3730a3', borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8, display: 'grid', gap: 2, fontSize: 11.5, color: '#64748b' }}>
              {tpl.variables.map(v => <div key={v.key}><code>{`{{${v.key}}}`}</code> — {v.label}{v.html ? ' (bloc généré par l’application, à insérer tel quel)' : ''}</div>)}
            </div>
          </div>

          {msg && <div style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12.5, fontWeight: 600, color: msg.ok ? COLORS.success : COLORS.danger }}>{msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {msg.text}</div>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={btnPrimary} disabled={busy || !dirty} onClick={() => save(draft)}>{busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Enregistrer</button>
            <button style={btnGhost} disabled={previewBusy} onClick={showPreview}>{previewBusy ? <Loader2 size={14} className="spin" /> : <Eye size={14} />} Aperçu</button>
            <button style={btnGhost} disabled={busy || (!tpl.modified && !dirty)} onClick={() => { if (window.confirm('Rétablir le texte d’origine de ce modèle ?')) save({ ...tpl.defaults }); }}><RotateCcw size={14} /> Rétablir l’original</button>
          </div>

          {preview && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 4 }}>Aperçu (valeurs d’exemple) — objet : <span style={{ fontWeight: 600 }}>{preview.subject}</span></div>
              <iframe title="Aperçu de l’e-mail" srcDoc={preview.html} style={{ width: '100%', height: 460, border: `1px solid ${COLORS.border}`, borderRadius: 10, background: '#fff' }} sandbox="" />
            </div>
          )}
        </div>
      ) : <div style={{ ...card, padding: 24, color: '#64748b' }}>Aucun modèle.</div>}
    </div>
  );
}
