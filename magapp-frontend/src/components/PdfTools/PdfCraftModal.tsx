import { useRef, useState } from 'react';
import { X, ArrowLeft, Sparkles } from 'lucide-react';
import PdfAiAssistant from './PdfAiAssistant';

interface PdfCraftModalProps {
  /** Ferme l'éditeur (retour à l'écran précédent). */
  onClose: () => void;
  /** Retour direct au magasin d'applications (ferme aussi les modales parentes). Par défaut : onClose. */
  onHome?: () => void;
  /** Nom de l'agent connecté, utilisé comme auteur des nouveaux commentaires. */
  author?: string;
}

/**
 * Masque le bandeau « Rejoindre la communauté » de PdfCraft (dessiné dans le canvas, donc
 * inaccessible en CSS) en cliquant sa croix via l'API de contrôle (?control, même origine).
 * Repère le bouton juste avant le lien Discord situé dans le corps de la page (pas la barre de titre).
 */
function dismissCommunityBanner(frame: HTMLIFrameElement | null, author?: string) {
  let tries = 0;
  let authorSet = !author;
  const timer = window.setInterval(async () => {
    tries += 1;
    if (tries > 60) { window.clearInterval(timer); return; }
    try {
      const api = (frame?.contentWindow as any)?.pdfcraft;
      if (!api || typeof api.request !== 'function') return;
      // Nom porté par les nouveaux commentaires = agent connecté à MagApp.
      if (!authorSet) {
        await api.request('ui.set', { key: 'author', value: author });
        authorSet = true;
      }
      const insp = await api.uiInspect({});
      const widgets: any[] = insp?.widgets || [];
      const isBannerDiscord = (w: any) => w.role === 'Button' && /discord\.gg/.test(w.description || '') && w.rect && w.rect[1] > 100;
      const idx = widgets.findIndex(isBannerDiscord);
      if (idx < 0) { if (tries > 8) window.clearInterval(timer); return; }
      for (let i = idx - 1; i >= 0; i--) {
        if (widgets[i].role === 'Button') {
          await api.request('ui.click', { id: widgets[i].id });
          break;
        }
      }
      window.clearInterval(timer);
    } catch { /* l'éditeur reste utilisable avec le bandeau */ }
  }, 500);
}

/**
 * « Modifier un PDF » : PdfCraft (éditeur PDF open-source, WebAssembly) hébergé en statique
 * dans /pdfcraft/ (public/pdfcraft). Tout s'exécute dans le navigateur : aucun fichier n'est envoyé au serveur.
 */
export default function PdfCraftModal({ onClose, onHome, author }: PdfCraftModalProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [showAi, setShowAi] = useState(false);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', zIndex: 2100, display: 'flex' }}>
      <div style={{ background: 'white', width: '100%', height: '100%', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              onClick={onHome ?? onClose}
              title="Revenir au magasin d'applications"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: '#475569', fontSize: '0.85rem', fontWeight: 600 }}
            >
              <ArrowLeft size={16} />
              Retour au magasin d'applications
            </button>
            <strong style={{ color: '#1e293b', fontSize: '0.95rem' }}>Modifier un PDF</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setShowAi((v) => !v)}
              title="Résumer, interroger ou traduire un PDF avec l'API IA de la Ville"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: showAi ? '#ede9fe' : 'white', border: '1px solid #c4b5fd', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: '#6d28d9', fontSize: '0.85rem', fontWeight: 700 }}
            >
              <Sparkles size={16} />
              Mon assistant IA
            </button>
            <button
              onClick={onClose}
              title="Fermer"
              style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        {showAi && <PdfAiAssistant onClose={() => setShowAi(false)} />}
        <iframe
          ref={frameRef}
          title="Modifier un PDF (PdfCraft)"
          src="/pdfcraft/index.html?control"
          onLoad={() => dismissCommunityBanner(frameRef.current, author)}
          allow="clipboard-read; clipboard-write; fullscreen"
          style={{ flex: 1, width: '100%', border: 'none' }}
        />
      </div>
    </div>
  );
}
