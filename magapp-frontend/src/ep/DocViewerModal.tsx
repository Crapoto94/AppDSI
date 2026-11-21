import { useCallback, useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { COLORS, btnGhost } from './ui';

export interface ViewerItem { kind: 'image' | 'pdf'; url: string; name: string }

/** Visionneuse intégrée : affiche tout de suite les pages (images ou PDF) sans rien télécharger ni reconstruire. */
export default function DocViewerModal({ title, items, loading, error, onClose }: { title: string; items: ViewerItem[]; loading?: boolean; error?: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.8)', zIndex: 3200, display: 'flex', flexDirection: 'column', padding: 12 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#fff', borderRadius: '10px 10px 0 0' }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: COLORS.text, flex: 1 }}>{title}</div>
        <button style={btnGhost} onClick={onClose}><X size={14} /> Fermer</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', background: '#e2e8f0', borderRadius: '0 0 10px 10px', padding: 12 }}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}><Loader2 size={22} className="spin" /> Ouverture du document…</div>}
        {error && <div style={{ textAlign: 'center', padding: 40, color: COLORS.danger }}>{error}</div>}
        <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
          {items.map((it, i) => it.kind === 'pdf'
            ? <iframe key={i} src={it.url} title={it.name} style={{ width: 'min(1000px, 100%)', height: '85vh', border: 'none', background: '#fff', borderRadius: 6 }} />
            : <img key={i} src={it.url} alt={it.name} style={{ maxWidth: 'min(1000px, 100%)', background: '#fff', borderRadius: 6, boxShadow: '0 2px 10px rgba(0,0,0,.25)' }} />)}
        </div>
      </div>
    </div>
  );
}

/** Visionneuse à la demande : `open(titre, () => Promise<Blob>)` ouvre aussitôt la visionneuse (avec un indicateur) puis affiche le document. */
export function useDocViewer() {
  const [v, setV] = useState<{ title: string; items: ViewerItem[]; loading?: boolean; error?: string } | null>(null);
  const close = useCallback(() => { setV(cur => { cur?.items.forEach(i => URL.revokeObjectURL(i.url)); return null; }); }, []);
  const open = useCallback(async (title: string, fetchBlob: () => Promise<Blob>) => {
    setV({ title, items: [], loading: true });
    try {
      const b = await fetchBlob();
      setV({ title, items: [{ kind: 'pdf', url: URL.createObjectURL(new Blob([b], { type: 'application/pdf' })), name: title }] });
    } catch (e: any) { setV({ title, items: [], error: e?.response?.data?.message || 'Document indisponible.' }); }
  }, []);
  const element = v ? <DocViewerModal title={v.title} items={v.items} loading={v.loading} error={v.error} onClose={close} /> : null;
  return [open, element] as const;
}
