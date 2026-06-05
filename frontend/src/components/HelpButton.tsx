// ─── Bouton d'aide contextuel (« ? ») ─────────────────────────────────────────
// Présent sur toutes les pages authentifiées. N'apparaît que si une aide a été
// définie pour la page courante dans /admin/hub > Aide (table hub.page_help).
// Cherche d'abord le chemin exact, puis le préfixe de 1er niveau (ex : /tickets/123 → /tickets).
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import { HelpCircle, X } from 'lucide-react';

interface Help { page_path: string; content_html?: string; }

export default function HelpButton() {
  const { pathname } = useLocation();
  const [help, setHelp] = useState<Help | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setHelp(null);
    setOpen(false);
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const candidates = [pathname];
    const firstSeg = '/' + (pathname.split('/').filter(Boolean)[0] || '');
    if (firstSeg !== pathname && firstSeg !== '/') candidates.push(firstSeg);

    let cancelled = false;
    (async () => {
      for (const p of candidates) {
        try {
          const r = await axios.get(`/api/page-help/${encodeURIComponent(p)}`, { headers });
          if (!cancelled && r.data && r.data.content_html) { setHelp(r.data); return; }
        } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
  }, [pathname]);

  if (!help) return null;

  return (
    <>
      {/* Bouton flottant */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Aide sur cette page"
        style={{
          position: 'fixed', right: 22, bottom: 22, zIndex: 1400,
          width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #2563eb, #4f46e5)', color: '#fff',
          boxShadow: '0 10px 24px -8px rgba(37,99,235,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <HelpCircle size={24} />
      </button>

      {/* Panneau latéral */}
      {open && (
        <>
          <div onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1401 }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(560px, 92vw)', zIndex: 1402,
            background: '#fff', boxShadow: '-8px 0 30px -10px rgba(15,23,42,0.3)',
            display: 'flex', flexDirection: 'column', animation: 'helpSlide .22s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#0f172a', fontSize: 16 }}>
                <HelpCircle size={18} color="#2563eb" /> Aide
              </span>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
            </div>
            <div className="help-content" style={{ padding: '18px 22px', overflow: 'auto', fontSize: 14, color: '#1e293b', lineHeight: 1.65 }}
              dangerouslySetInnerHTML={{ __html: help.content_html || '' }} />
          </div>
          <style>{`
            @keyframes helpSlide { from { transform: translateX(20px); opacity: .6; } to { transform: translateX(0); opacity: 1; } }
            .help-content h1 { font-size: 1.3rem; margin: 0 0 10px; }
            .help-content h2 { font-size: 1.1rem; margin: 18px 0 8px; border-bottom: 1px solid #eef2f7; padding-bottom: 4px; }
            .help-content h3 { font-size: 1rem; margin: 14px 0 6px; }
            .help-content table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px; }
            .help-content th, .help-content td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
            .help-content th { background: #f8fafc; }
            .help-content code { background: #f1f5f9; color: #be123c; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
            .help-content ul { padding-left: 20px; }
            .help-content a { color: #2563eb; }
          `}</style>
        </>
      )}
    </>
  );
}
