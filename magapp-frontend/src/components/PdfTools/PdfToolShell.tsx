import React from 'react';
import { X } from 'lucide-react';

interface PdfToolShellProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  onClose: () => void;
  maxWidth?: number;
  children: React.ReactNode;
}

/** Coquille de modale commune à tous les outils PDF (même style que les autres modales de l'app). */
export default function PdfToolShell({ icon, iconBg, title, description, onClose, maxWidth = 720, children }: PdfToolShellProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: 'white', maxWidth: `${maxWidth}px`, width: '100%', borderRadius: '24px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '20px', right: '20px', background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
          <div style={{ width: 52, height: 52, minWidth: 52, borderRadius: '14px', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#1e293b' }}>{title}</h2>
            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '2px 0 0' }}>{description}</p>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}

export const btnPrimary: React.CSSProperties = {
  padding: '10px 18px', background: '#0078a4', color: 'white', border: 'none', borderRadius: '10px',
  fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
};

export const btnSecondary: React.CSSProperties = {
  padding: '10px 18px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px',
  fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
};

export const btnDisabled: React.CSSProperties = { ...btnPrimary, background: '#93c5cf', cursor: 'not-allowed' };

export const errorBox: React.CSSProperties = {
  background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '10px',
  padding: '10px 14px', fontSize: '0.85rem', marginTop: '12px',
};

export const dropzone: React.CSSProperties = {
  border: '2px dashed #cbd5e1', borderRadius: '14px', padding: '28px', textAlign: 'center',
  color: '#64748b', cursor: 'pointer', background: '#f8fafc',
};
