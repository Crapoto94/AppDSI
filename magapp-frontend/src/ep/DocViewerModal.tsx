import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { COLORS, btnGhost } from './ui';

export interface ViewerItem { kind: 'image' | 'pdf'; url: string; name: string }

/** Visionneuse intégrée : affiche tout de suite les pages (images ou PDF) sans rien télécharger ni reconstruire. */
export default function DocViewerModal({ title, items, loading, error, onClose, tabs, activeTab = 0, onTab }: { title: string; items: ViewerItem[]; loading?: boolean; error?: string; onClose: () => void; tabs?: string[]; activeTab?: number; onTab?: (i: number) => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.8)', zIndex: 3200, display: 'flex', flexDirection: 'column', padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#fff', borderRadius: '10px 10px 0 0' }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: COLORS.text, flex: 1 }}>{title}</div>
        {tabs && (
          <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: 9, padding: 3, gap: 2 }}>
            {tabs.map((t, i) => (
              <button key={t} type="button" onClick={() => onTab?.(i)}
                style={{ border: 'none', cursor: 'pointer', borderRadius: 7, padding: '6px 12px', fontSize: 12.5, fontWeight: 700,
                  background: i === activeTab ? '#fff' : 'transparent', color: i === activeTab ? COLORS.primary : '#64748b', boxShadow: i === activeTab ? '0 1px 3px rgba(15,23,42,.15)' : 'none' }}>{t}</button>
            ))}
          </div>
        )}
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

export interface ViewerView { label: string; fetch: () => Promise<Blob> }

/**
 * Visionneuse à la demande.
 * `open(titre, () => Promise<Blob>)` : un seul document.
 * `openViews(titre, vues, actif)` : plusieurs documents au choix (ex. CREP numérisé / CREP reconstruit) via des onglets.
 */
export function useDocViewer() {
  const [v, setV] = useState<{ title: string; views: ViewerView[]; active: number; urls: Record<number, string>; loading?: boolean; error?: string } | null>(null);
  const ref = useRef(v);
  ref.current = v;
  const close = useCallback(() => { Object.values(ref.current?.urls || {}).forEach(u => URL.revokeObjectURL(u)); setV(null); }, []);
  const load = useCallback(async (views: ViewerView[], idx: number, base: { title: string; urls: Record<number, string> }) => {
    if (base.urls[idx]) { setV({ title: base.title, views, active: idx, urls: base.urls }); return; }
    setV({ title: base.title, views, active: idx, urls: base.urls, loading: true });
    try {
      const b = await views[idx].fetch();
      const urls = { ...base.urls, [idx]: URL.createObjectURL(new Blob([b], { type: 'application/pdf' })) };
      setV({ title: base.title, views, active: idx, urls });
    } catch (e: any) { setV({ title: base.title, views, active: idx, urls: base.urls, error: e?.response?.data?.message || 'Document indisponible.' }); }
  }, []);
  const openViews = useCallback((title: string, views: ViewerView[], active = 0) => load(views, active, { title, urls: {} }), [load]);
  const open = useCallback((title: string, fetchBlob: () => Promise<Blob>) => openViews(title, [{ label: title, fetch: fetchBlob }]), [openViews]);
  const element = v ? (
    <DocViewerModal title={v.title} loading={v.loading} error={v.error} onClose={close}
      items={v.urls[v.active] ? [{ kind: 'pdf', url: v.urls[v.active], name: v.views[v.active].label }] : []}
      tabs={v.views.length > 1 ? v.views.map(x => x.label) : undefined} activeTab={v.active}
      onTab={i => load(v.views, i, { title: v.title, urls: v.urls })} />
  ) : null;
  return [open, element, openViews] as const;
}
