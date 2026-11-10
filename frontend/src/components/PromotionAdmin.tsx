import React, { useEffect, useState } from 'react';
import { Megaphone, Save, Upload } from 'lucide-react';

interface Promo {
  enabled: boolean; url: string; badge: string; title: string; text: string; cta: string; until: string; logo_url: string;
}

const EMPTY: Promo = { enabled: false, url: '', badge: '', title: '', text: '', cta: 'Découvrir', until: '', logo_url: '' };

const input: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', boxSizing: 'border-box', fontFamily: 'inherit' };
const label: React.CSSProperties = { fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: 4, display: 'block' };

/** Application mise en avant : bannière en tête du magasin d'applications (MagApp). */
export default function PromotionAdmin({ token }: { token: string | null }) {
  const [p, setP] = useState<Promo>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [removeLogo, setRemoveLogo] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const r = await fetch('/api/magapp/promotion?admin=true', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setP({ ...EMPTY, ...(await r.json()) });
    } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const fd = new FormData();
    fd.append('enabled', String(p.enabled));
    (['url', 'badge', 'title', 'text', 'cta', 'until'] as const).forEach(k => fd.append(k, p[k] || ''));
    if (file) fd.append('logo', file);
    if (removeLogo && !file) fd.append('remove_logo', 'true');
    try {
      const r = await fetch('/api/magapp/promotion', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      setMsg(r.ok ? 'Promotion enregistrée' : 'Erreur lors de l\'enregistrement');
      if (r.ok) { setFile(null); setPreview(''); setRemoveLogo(false); load(); }
    } catch { setMsg('Erreur réseau'); }
    setTimeout(() => setMsg(''), 3000);
  };

  const shownLogo = removeLogo ? '' : (preview || p.logo_url);

  return (
    <div className="form-group-v2 full-width" style={{ padding: 15, background: 'white', border: '1px solid #e2e8f0', borderRadius: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Megaphone size={18} color="#7e22ce" />
        <span style={{ fontWeight: 700, fontSize: '1rem' }}>Application mise en avant (bannière du magasin)</span>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#64748b' }}>
        Affichée tout en haut du magasin, avant les autres applications. Pour une opération ponctuelle (ex. Calendrier Cyber).
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontWeight: 600 }}>
        <input type="checkbox" checked={p.enabled} onChange={e => setP({ ...p, enabled: e.target.checked })} /> Afficher la bannière
      </label>
      <div style={{ display: 'grid', gap: 10 }}>
        <div><span style={label}>Titre</span><input style={input} value={p.title} onChange={e => setP({ ...p, title: e.target.value })} /></div>
        <div><span style={label}>Sur-titre (badge)</span><input style={input} value={p.badge} onChange={e => setP({ ...p, badge: e.target.value })} placeholder="ÉDITION NOVEMBRE 2026" /></div>
        <div><span style={label}>Texte descriptif</span><textarea style={{ ...input, minHeight: 90 }} value={p.text} onChange={e => setP({ ...p, text: e.target.value })} /></div>
        <div><span style={label}>Adresse (URL) de l'application</span><input style={input} value={p.url} onChange={e => setP({ ...p, url: e.target.value })} placeholder="https://..." /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><span style={label}>Texte du bouton</span><input style={input} value={p.cta} onChange={e => setP({ ...p, cta: e.target.value })} /></div>
          <div><span style={label}>Dernier jour d'affichage (optionnel)</span><input type="date" style={input} value={p.until} onChange={e => setP({ ...p, until: e.target.value })} /></div>
        </div>
        <div>
          <span style={label}>Logo</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {shownLogo && <img src={shownLogo} alt="" style={{ width: 64, height: 64, objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: 12, padding: 4 }} />}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #cbd5e1', borderRadius: 10, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
              <Upload size={16} /> Choisir une image
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                const f = e.target.files?.[0] || null;
                setFile(f); setRemoveLogo(false);
                setPreview(f ? URL.createObjectURL(f) : '');
              }} />
            </label>
            {shownLogo && <button type="button" onClick={() => { setFile(null); setPreview(''); setRemoveLogo(true); }} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' }}>Retirer</button>}
          </div>
        </div>
      </div>
      <button className="primary-btn-v2 full-width" style={{ marginTop: 14 }} onClick={save}><Save size={18} /> Enregistrer la promotion</button>
      {msg && <div style={{ marginTop: 8, fontSize: '0.85rem', color: '#059669', fontWeight: 600 }}>{msg}</div>}
    </div>
  );
}
