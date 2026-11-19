import { useEffect, useState } from 'react';

/**
 * Boîtes de dialogue dans l'application (remplacent window.confirm / alert / prompt, jamais de fenêtre du navigateur).
 * `<AppDialogHost />` est monté une fois (main.tsx) ; ailleurs : `await appConfirm('…')`, `appAlert('…')`, `await appPrompt('…')`.
 */
type Opts = { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; placeholder?: string; defaultValue?: string };
type Req =
  | ({ kind: 'confirm'; message: string; resolve: (v: boolean) => void } & Opts)
  | ({ kind: 'alert'; message: string; resolve: () => void } & Opts)
  | ({ kind: 'prompt'; message: string; resolve: (v: string | null) => void } & Opts);

let push: ((r: Req) => void) | null = null;
const queue: Req[] = [];
const send = (r: Req) => { if (push) push(r); else queue.push(r); };

export const appConfirm = (message: string, opts?: Opts) => new Promise<boolean>(resolve => send({ kind: 'confirm', message, resolve, ...opts }));
export const appAlert = (message: string, opts?: Opts) => new Promise<void>(resolve => send({ kind: 'alert', message, resolve, ...opts }));
export const appPrompt = (message: string, opts?: Opts) => new Promise<string | null>(resolve => send({ kind: 'prompt', message, resolve, ...opts }));

export default function AppDialogHost() {
  const [list, setList] = useState<Req[]>([]);
  const [text, setText] = useState('');
  useEffect(() => {
    push = (r) => setList(l => [...l, r]);
    if (queue.length) { const q = queue.splice(0); setList(l => [...l, ...q]); }
    return () => { push = null; };
  }, []);
  const cur = list[0];
  useEffect(() => { if (cur && cur.kind === 'prompt') setText(cur.defaultValue || ''); }, [cur]);
  if (!cur) return null;

  const done = (ok: boolean) => {
    if (cur.kind === 'confirm') cur.resolve(ok);
    else if (cur.kind === 'alert') cur.resolve();
    else cur.resolve(ok ? text : null);
    setList(l => l.slice(1));
  };
  const title = cur.title || (cur.kind === 'alert' ? (/erreur|impossible|échou|échec|refus|non support/i.test(cur.message) ? 'Attention' : 'Information') : cur.kind === 'prompt' ? 'Saisie' : 'Confirmation');
  const danger = !!cur.danger;
  const btn: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={e => { if (e.target === e.currentTarget && cur.kind !== 'alert') done(false); }}
      onKeyDown={e => { if (e.key === 'Escape') done(false); if (e.key === 'Enter' && cur.kind !== 'prompt') done(true); }}>
      <div role="dialog" aria-modal="true" style={{ background: '#fff', color: '#1e293b', width: '100%', maxWidth: 460, borderRadius: 14, boxShadow: '0 25px 50px -12px rgba(0,0,0,.4)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px 4px', fontWeight: 800, fontSize: 15 }}>{title}</div>
        <div style={{ padding: '6px 20px 16px', fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-line', color: '#334155' }}>{cur.message}</div>
        {cur.kind === 'prompt' && (
          <div style={{ padding: '0 20px 16px' }}>
            <input autoFocus value={text} placeholder={cur.placeholder} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') done(true); }}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5 }} />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          {cur.kind !== 'alert' && <button type="button" style={{ ...btn, border: '1px solid #cbd5e1', background: '#fff', color: '#334155' }} onClick={() => done(false)}>{cur.cancelLabel || 'Annuler'}</button>}
          <button type="button" autoFocus={cur.kind !== 'prompt'} style={{ ...btn, border: 'none', background: danger ? '#dc2626' : '#4f46e5', color: '#fff' }} onClick={() => done(true)}>{cur.confirmLabel || (cur.kind === 'alert' ? 'OK' : 'Confirmer')}</button>
        </div>
      </div>
    </div>
  );
}
