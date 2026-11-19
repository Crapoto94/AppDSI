import { useEffect, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { HELP_CSS } from './helpStyles';

// Bouton d'aide UNIQUE de tout MagApp (même icône, même gabarit partout) + fenêtre d'aide alimentée par /api/page-help.
// Le chemin de la page est passé en paramètre de requête (?page=) : un « %2F » dans l'URL est décodé par certains proxys.

export function HelpButton({ onClick, title = 'Aide' }: { onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} aria-label={title}
      style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '10px', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
      <HelpCircle size={20} />
    </button>
  );
}

export function HelpModal({ page, title, onClose }: { page: string; title: string; onClose: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/page-help?page=${encodeURIComponent(page)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setHtml(d?.content_html || "<p>Aucune aide disponible pour l'instant.</p>"); })
      .catch(() => { if (alive) setHtml('<p>Aide momentanément indisponible. Réessayez plus tard.</p>'); });
    return () => { alive = false; };
  }, [page]);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', zIndex: 2600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <style>{HELP_CSS}</style>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(860px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <HelpCircle size={20} color="#0078a4" /><strong style={{ flex: 1 }}>{title}</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }} aria-label="Fermer"><X size={20} /></button>
        </div>
        <div className="vc-help" style={{ padding: '14px 20px', overflowY: 'auto', color: '#1e293b' }} dangerouslySetInnerHTML={{ __html: html ?? 'Chargement…' }} />
      </div>
    </div>
  );
}
