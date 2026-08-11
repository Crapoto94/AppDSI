import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { X, KeyRound, Loader2, Trash2, Copy, Check, Plus } from 'lucide-react';

interface KioskToken {
  id: number;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface Props {
  slideshowName: string;
  onClose: () => void;
}

export default function KioskTokensModal({ slideshowName, onClose }: Props) {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const [tokens, setTokens] = useState<KioskToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => {
    setLoading(true);
    axios.get('/api/dsi-dashboard/kiosk-tokens', { headers })
      .then(r => setTokens(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const buildUrl = (rawToken: string) => {
    const params = new URLSearchParams();
    if (slideshowName) params.set('slideshow', slideshowName);
    params.set('kiosk', '1');
    params.set('device_token', rawToken);
    return `${window.location.origin}/dsi-dashboard?${params.toString()}`;
  };

  const createToken = async () => {
    if (!label.trim()) return;
    setCreating(true);
    setNewUrl(null);
    try {
      const r = await axios.post('/api/dsi-dashboard/kiosk-tokens', { label: label.trim() }, { headers });
      setNewUrl(buildUrl(r.data.token));
      setLabel('');
      load();
    } catch (e: any) {
      alert(`Erreur : ${e.response?.data?.message || e.message}`);
    } finally { setCreating(false); }
  };

  const revoke = async (id: number) => {
    if (!confirm('Révoquer ce jeton ? Le poste qui l\'utilise perdra l\'accès immédiatement.')) return;
    await axios.delete(`/api/dsi-dashboard/kiosk-tokens/${id}`, { headers });
    load();
  };

  const copyUrl = () => {
    if (!newUrl) return;
    navigator.clipboard.writeText(newUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputStyle: React.CSSProperties = { flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.45)' }}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: 16, width: 560, maxWidth: '95vw', maxHeight: '85vh', boxShadow: '0 24px 48px rgba(0,0,0,.2)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', color: 'white', padding: '20px 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              <KeyRound size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
              Jetons kiosque
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, opacity: .7 }}>Affichage automatisé sans connexion, en lecture seule</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'rgba(255,255,255,.15)', cursor: 'pointer', color: 'white', borderRadius: 6, padding: '4px 6px', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
            Un jeton kiosque donne un accès <strong>lecture seule</strong> au tableau de bord (aucune écriture possible où que ce soit dans l'application) et peut être révoqué à tout moment. Utilisez l'URL générée dans le raccourci de lancement du navigateur en mode kiosque sur le poste concerné.
          </div>

          {/* Création */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={label} onChange={e => setLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createToken(); }}
              placeholder="Nom du poste (ex : Écran accueil DSI)" style={inputStyle} />
            <button onClick={createToken} disabled={creating || !label.trim()} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
              border: 'none', background: '#3b82f6', color: 'white', cursor: creating || !label.trim() ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600, opacity: !label.trim() ? .6 : 1, whiteSpace: 'nowrap',
            }}>
              {creating ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
              Créer
            </button>
          </div>

          {newUrl && (
            <div style={{ padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d', marginBottom: 6 }}>
                URL du poste — copiez-la maintenant, elle ne sera plus affichée :
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input readOnly value={newUrl} style={{ ...inputStyle, background: 'white', fontSize: 11, fontFamily: 'monospace' }} onFocus={e => e.target.select()} />
                <button onClick={copyUrl} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
                  border: 'none', background: copied ? '#22c55e' : '#1e293b', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copié' : 'Copier'}
                </button>
              </div>
            </div>
          )}

          {/* Liste */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Jetons existants</div>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                <Loader2 size={20} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : tokens.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8', padding: '12px 0' }}>Aucun jeton créé pour le moment.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tokens.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                    background: t.revoked_at ? '#fef2f2' : 'white',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: t.revoked_at ? '#991b1b' : '#1e293b' }}>
                        {t.label} {t.revoked_at && <span style={{ fontSize: 11, fontWeight: 400 }}>(révoqué)</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        Créé le {new Date(t.created_at).toLocaleDateString('fr-FR')}
                        {t.last_used_at ? ` · Dernière utilisation le ${new Date(t.last_used_at).toLocaleString('fr-FR')}` : ' · Jamais utilisé'}
                      </div>
                    </div>
                    {!t.revoked_at && (
                      <button onClick={() => revoke(t.id)} title="Révoquer" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#cbd5e1', display: 'flex', padding: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
