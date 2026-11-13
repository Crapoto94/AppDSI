import React, { useEffect, useState } from 'react';
import { Newspaper, Save } from 'lucide-react';

interface Banner {
  enabled: boolean; message: string; link_url: string; link_label: string; level: string; scrolling: boolean; height: number; forum_enabled: boolean; forum_locked: boolean; forum_count?: number; until: string;
}

const EMPTY: Banner = { enabled: false, message: '', link_url: '', link_label: '', level: 'info', scrolling: false, height: 56, forum_enabled: false, forum_locked: false, until: '' };

const input: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', boxSizing: 'border-box', fontFamily: 'inherit' };
const label: React.CSSProperties = { fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: 4, display: 'block' };

/** Bandeau d'actualité permanent affiché en haut du magasin d'applications (MagApp). */
export default function NewsBannerAdmin({ token }: { token: string | null }) {
  const [b, setB] = useState<Banner>(EMPTY);
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const r = await fetch('/api/magapp/news-banner?admin=true', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setB({ ...EMPTY, ...(await r.json()) });
    } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    try {
      const r = await fetch('/api/magapp/news-banner', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(b)
      });
      setMsg(r.ok ? 'Bandeau enregistré' : 'Erreur lors de l\'enregistrement');
      if (r.ok) load();
    } catch { setMsg('Erreur réseau'); }
    setTimeout(() => setMsg(''), 3000);
  };

  const newForum = async () => {
    if (!window.confirm('Démarrer un nouveau forum ?\n\nLes messages du forum actuel seront archivés et n\'apparaîtront plus dans le magasin.')) return;
    try {
      const r = await fetch('/api/magapp/forum/new', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      setMsg(r.ok ? 'Nouveau forum démarré' : 'Erreur');
      if (r.ok) load();
    } catch { setMsg('Erreur réseau'); }
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <div className="form-group-v2 full-width" style={{ padding: 15, background: 'white', border: '1px solid #e2e8f0', borderRadius: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Newspaper size={18} color="#0078a4" />
        <span style={{ fontWeight: 700, fontSize: '1rem' }}>Bandeau d'actualité (permanent)</span>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#64748b' }}>
        Message affiché en permanence sous l'en-tête du magasin d'applications, sur toutes les pages.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontWeight: 600 }}>
        <input type="checkbox" checked={b.enabled} onChange={e => setB({ ...b, enabled: e.target.checked })} /> Afficher le bandeau
      </label>
      <div style={{ display: 'grid', gap: 10 }}>
        <div><span style={label}>Message</span><textarea style={{ ...input, minHeight: 70 }} value={b.message} onChange={e => setB({ ...b, message: e.target.value })} placeholder="Ex. Maintenance du SI samedi de 8h à 12h" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><span style={label}>Lien (optionnel)</span><input style={input} value={b.link_url} onChange={e => setB({ ...b, link_url: e.target.value })} placeholder="https://..." /></div>
          <div><span style={label}>Libellé du lien</span><input style={input} value={b.link_label} onChange={e => setB({ ...b, link_label: e.target.value })} placeholder="En savoir plus" /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <span style={label}>Type</span>
            <select style={input} value={b.level} onChange={e => setB({ ...b, level: e.target.value })}>
              <option value="info">Information (bleu)</option>
              <option value="success">Bonne nouvelle (vert)</option>
              <option value="warning">Avertissement (orange)</option>
              <option value="alert">Alerte (rouge)</option>
            </select>
          </div>
          <div><span style={label}>Dernier jour d'affichage (optionnel)</span><input type="date" style={input} value={b.until} onChange={e => setB({ ...b, until: e.target.value })} /></div>
        </div>
        <div>
          <span style={label}>Hauteur du bandeau : {b.height} px (la taille du texte s'adapte)</span>
          <input type="range" min={28} max={150} step={2} value={b.height} onChange={e => setB({ ...b, height: Number(e.target.value) })} style={{ width: '100%' }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
          <input type="checkbox" checked={b.scrolling} onChange={e => setB({ ...b, scrolling: e.target.checked })} /> Texte défilant
        </label>
        <div style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
            <input type="checkbox" checked={b.forum_enabled} onChange={e => setB({ ...b, forum_enabled: e.target.checked })} /> Associer un forum de crise à ce bandeau
          </label>
          <p style={{ margin: '4px 0 8px 24px', fontSize: '0.8rem', color: '#64748b' }}>
            Un bouton « Forum » apparaît sur le bandeau : les agents connectés au magasin peuvent poser des questions et répondre, comme dans un fil Teams. Vous modérez directement depuis le forum (masquer un message).
          </p>
          {b.forum_enabled && (
            <div style={{ marginLeft: 24, display: 'grid', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                <input type="checkbox" checked={b.forum_locked} onChange={e => setB({ ...b, forum_locked: e.target.checked })} /> Lecture seule (plus de nouveaux messages)
              </label>
              <div>
                <button type="button" onClick={newForum} style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                  Démarrer un nouveau forum (archive l'actuel)
                </button>
                {typeof b.forum_count === 'number' && <span style={{ marginLeft: 10, fontSize: '0.8rem', color: '#64748b' }}>{b.forum_count} question(s) dans le forum actuel</span>}
              </div>
            </div>
          )}
        </div>
      </div>
      <button className="primary-btn-v2 full-width" style={{ marginTop: 14 }} onClick={save}><Save size={18} /> Enregistrer le bandeau</button>
      {msg && <div style={{ marginTop: 8, fontSize: '0.85rem', color: '#059669', fontWeight: 600 }}>{msg}</div>}
    </div>
  );
}
