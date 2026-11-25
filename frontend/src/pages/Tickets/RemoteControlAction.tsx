import { useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';

// Action automatique « Prise en main à distance » : liste les postes connus de Studio IRS et ouvre leur
// page de prise en main. La session, le consentement de l'utilisateur et la trace restent dans Studio IRS
// (l'API externe ne permet pas de démarrer une session) : l'agent doit y avoir un compte autorisé.
interface Poste {
  id: string;
  name: string;
  fqdn: string;
  os: string;
  status: string;
  lastSeenAt: string | null;
  url: string;
}

export default function RemoteControlAction() {
  const [open, setOpen] = useState(false);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const show = async () => {
    setOpen(true); setQuery(''); setError(''); setLoading(true);
    try {
      const tk = localStorage.getItem('token');
      const r = await axios.get('/api/tickets/auto-actions/studio-irs/postes', { headers: { Authorization: `Bearer ${tk}` } });
      setPostes(r.data || []);
    } catch (e: unknown) {
      setPostes([]);
      setError((axios.isAxiosError(e) && e.response?.data?.message) || 'Impossible de charger les postes Studio IRS.');
    } finally { setLoading(false); }
  };

  const q = query.trim().toLowerCase();
  const found = postes.filter(p => !q || `${p.name} ${p.fqdn} ${p.os}`.toLowerCase().includes(q));

  return (
    <>
      <button onClick={show}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
        <span style={{ fontSize: 28, lineHeight: 1 }}>🖥️</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Prise en main à distance</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Recherche un poste suivi par Studio IRS et ouvre sa prise en main.</div>
        </div>
      </button>

      {open && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 560, maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ flex: 1, fontWeight: 700, fontSize: 16, color: '#0f172a' }}>🖥️ Prise en main à distance</div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8' }}>✕</button>
            </div>
            <div style={{ padding: '16px 22px', overflowY: 'auto' }}>
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="🔍 Nom du poste…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, marginBottom: 12, outline: 'none' }} />
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                La page s'ouvre dans Studio IRS, avec votre compte. Si une connexion vous est demandée, revenez ensuite cliquer à nouveau sur le poste.
              </div>
              {loading && <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>Chargement…</div>}
              {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>{error}</div>}
              {!loading && !error && found.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>Aucun poste trouvé.</div>}
              {found.slice(0, 100).map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 6 }}>
                  <span title={p.status} style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: p.status === 'online' ? '#22c55e' : '#cbd5e1' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {p.os} · {p.status}{p.lastSeenAt ? ` · vu le ${new Date(p.lastSeenAt).toLocaleString('fr-FR')}` : ''}
                    </div>
                  </div>
                  <a href={p.url} target="_blank" rel="noopener noreferrer"
                    style={{ padding: '6px 12px', borderRadius: 6, background: '#0f172a', color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    Prendre la main
                  </a>
                </div>
              ))}
              {found.length > 100 && <div style={{ fontSize: 12, color: '#94a3b8' }}>100 premiers postes affichés sur {found.length} : précisez la recherche.</div>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
