import React, { useCallback, useState } from 'react';
import { initiales } from './types';
import type { StatutMeta } from './types';

export const COLORS = {
  primary: '#4f46e5',
  primaryDark: '#4338ca',
  accent: '#6366f1',
  text: '#1e293b',
  muted: '#64748b',
  border: '#e2e8f0',
  bg: '#f8fafc',
  card: '#ffffff',
  danger: '#b91c1c',
  success: '#16a34a',
  warning: '#b45309',
};

export const card: React.CSSProperties = {
  background: COLORS.card,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 14,
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
};

export const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  fontSize: 13,
  color: COLORS.text,
  background: '#fff',
  outline: 'none',
};

export const textarea: React.CSSProperties = {
  ...input,
  resize: 'vertical',
  lineHeight: 1.5,
  fontFamily: 'inherit',
};

export const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
  padding: '9px 16px', borderRadius: 8, border: 'none',
  background: COLORS.primary, color: '#fff', fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
};

export const btnGhost: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
  padding: '8px 13px', borderRadius: 8,
  border: `1px solid ${COLORS.border}`, background: '#fff',
  color: '#334155', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};

export const btnDanger: React.CSSProperties = {
  ...btnGhost,
  color: COLORS.danger,
  borderColor: '#fecaca',
  background: '#fff5f5',
};

export function Badge({ label, color, bg }: StatutMeta) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      color, background: bg, whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: '#4f46e5',
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: Math.round(size * 0.36), flexShrink: 0,
    }}>{initiales(name)}</div>
  );
}

export function KpiCard({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: string; color: string }) {
  return (
    <div style={{ ...card, padding: '9px 10px', borderLeft: `4px solid ${color}`, minWidth: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{value}</div>
      <div title={label} style={{ fontSize: 11.5, fontWeight: 700, color: '#334155', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      {sub && <div title={sub} style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  );
}

export function ProgressBar({ value, color = COLORS.primary }: { value: number; color?: string }) {
  return (
    <div style={{ height: 7, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', background: color, borderRadius: 999, transition: 'width .3s' }} />
    </div>
  );
}

export function Section({ number, title, description, children }: {
  number: number; title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <section style={{ ...card, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 8, background: '#eef2ff',
          color: COLORS.primary, fontWeight: 800, fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{number}</div>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: COLORS.text }}>{title}</h3>
          {description && <p style={{ margin: '3px 0 0', fontSize: 12.5, color: COLORS.muted, lineHeight: 1.45 }}>{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, children, required }: {
  label: string; hint?: string; children: React.ReactNode; required?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 600, color: '#475569' }}>
      <span>{label}{required && <span style={{ color: COLORS.danger }}> *</span>}</span>
      {children}
      {hint && <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8', lineHeight: 1.4 }}>{hint}</span>}
    </label>
  );
}

export function EmptyState({ icon, title, text, action }: {
  icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode;
}) {
  return (
    <div style={{ ...card, padding: '34px 24px', textAlign: 'center' }}>
      {icon && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: '#94a3b8' }}>{icon}</div>}
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: COLORS.text }}>{title}</h3>
      {text && <p style={{ margin: '8px auto 0', maxWidth: 620, fontSize: 13, color: COLORS.muted, lineHeight: 1.55 }}>{text}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function Th({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{
    textAlign: 'left', padding: '9px 10px', fontSize: 11, fontWeight: 700,
    color: '#64748b', textTransform: 'uppercase', letterSpacing: '.03em',
    borderBottom: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap', ...style,
  }}>{children}</th>;
}

export function Td({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '10px', fontSize: 12.5, color: '#334155', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle', ...style }}>{children}</td>;
}

/**
 * Confirmation dans l'application (remplace window.confirm) :
 *   const [confirm, confirmDialog] = useConfirm();  …  if (!(await confirm('Message ?', { title: '…', confirmLabel: 'Valider' }))) return;
 * et afficher {confirmDialog} dans le rendu du composant.
 */
export function useConfirm() {
  const [state, setState] = useState<{ message: string; title?: string; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback((message: string, opts?: { title?: string; confirmLabel?: string; danger?: boolean }) =>
    new Promise<boolean>(resolve => setState({ message, ...opts, resolve })), []);
  const close = (v: boolean) => { if (state) state.resolve(v); setState(null); };
  const dialog = state ? (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', zIndex: 2400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={e => { if (e.target === e.currentTarget) close(false); }}
      onKeyDown={e => { if (e.key === 'Escape') close(false); }}>
      <div role="dialog" aria-modal="true" style={{ ...card, width: '100%', maxWidth: 480, boxShadow: '0 25px 50px -12px rgba(0,0,0,.35)' }}>
        <div style={{ padding: '16px 20px 6px', fontWeight: 800, fontSize: 15, color: COLORS.text }}>{state.title || 'Confirmation'}</div>
        <div style={{ padding: '6px 20px 16px', fontSize: 13.5, color: '#334155', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{state.message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: `1px solid ${COLORS.border}`, background: '#f8fafc', borderRadius: '0 0 12px 12px' }}>
          <button type="button" style={btnGhost} onClick={() => close(false)}>Annuler</button>
          <button type="button" autoFocus style={{ ...btnPrimary, background: state.danger ? COLORS.danger : COLORS.primary }} onClick={() => close(true)}>{state.confirmLabel || 'Confirmer'}</button>
        </div>
      </div>
    </div>
  ) : null;
  return [confirm, dialog] as const;
}
