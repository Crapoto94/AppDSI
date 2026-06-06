import React, { useState, useEffect } from 'react';
import { Key, Plus, X, AlertTriangle, CheckCircle, Loader2, RefreshCw, Copy, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface ApiKey {
  id: number;
  name: string;
  key_prefix: string;
  scope: string;
  expires_at: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
}

// Modules exposables via clé API (correspond aux tuiles / modules du hub).
// Le périmètre est stocké pour chaque clé ; l'enforcement est actif sur les
// modules dont les routes utilisent requireApiScope (tickets, tasks, ville…).
const MODULES: { value: string; label: string }[] = [
  { value: 'tickets', label: 'Tickets' },
  { value: 'tasks', label: 'Tâches' },
  { value: 'ville', label: 'Paramétrage Ville (élus, écoles, sites, organisation)' },
  { value: 'projets', label: 'Projets' },
  { value: 'magapp', label: 'MagApp' },
  { value: 'consommables', label: 'Consommables' },
  { value: 'contrats', label: 'Contrats' },
  { value: 'copieurs', label: 'Copieurs' },
  { value: 'certificates', label: 'Certificats' },
  { value: 'parc', label: 'Parc informatique' },
  { value: 'reseau', label: 'Réseau' },
  { value: 'infra', label: 'Infrastructure' },
  { value: 'stocks', label: 'Stocks' },
  { value: 'telecom', label: 'Télécom' },
  { value: 'lignes_mobiles', label: 'Lignes mobiles' },
  { value: 'mobilite', label: 'Mobilité' },
  { value: 'rh', label: 'RH' },
  { value: 'finance', label: 'Finance' },
  { value: 'rencontres', label: 'Rencontres budgétaires' },
  { value: 'deploiements', label: 'Déploiements' },
  { value: 'glpi', label: 'GLPI' },
  { value: 'documents', label: 'Documents / GED' },
];

export default function ApiKeysAdmin() {
  const { token } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScope, setNewScope] = useState('*');
  const [newExpiry, setNewExpiry] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPrefix, setShowPrefix] = useState<Record<number, boolean>>({});

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/api-keys', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setKeys(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { if (token) fetchKeys(); }, [token]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    setCreatedKey(null);
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          scope: newScope,
          expires_at: newExpiry ? new Date(newExpiry).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setCreatedKey(data.api_key);
      setNewName('');
      setNewScope('*');
      setNewExpiry('');
      setShowCreate(true);
      await fetchKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
    setCreating(false);
  };

  const toggleActive = async (id: number, active: boolean) => {
    try {
      await fetch(`/api/admin/api-keys/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: active }),
      });
      await fetchKeys();
    } catch { /* ignore */ }
  };

  const deleteKey = async (id: number) => {
    if (!confirm('Révoquer définitivement cette clé ?')) return;
    try {
      await fetch(`/api/admin/api-keys/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage('Clé révoquée');
      setTimeout(() => setMessage(''), 4000);
      await fetchKeys();
    } catch { /* ignore */ }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setMessage('Copié !');
    setTimeout(() => setMessage(''), 3000);
  };

  const scopeLabel = (s: string) => s === '*' ? 'Tous les modules' : (MODULES.find(m => m.value === s)?.label || s);

  return (
    <div className="api-page" style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Hero */}
      <div className="api-hero" style={{
        display: 'flex', alignItems: 'center', gap: 18,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: '#fff', padding: '24px 28px', borderRadius: 16,
        boxShadow: '0 10px 30px rgba(15,23,42,0.25)',
      }}>
        <div style={{
          width: 56, height: 56, flexShrink: 0, borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(59,130,246,0.2)', color: '#93c5fd',
        }}>
          <Key size={28} />
        </div>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Clés API</h1>
          <p style={{ margin: 0, fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.5, maxWidth: 640 }}>
            Gérez les clés d'accès pour les intégrations externes (CI/CD, scripts, automates).
            Chaque clé peut être restreinte à un module spécifique et dotée d'une date d'expiration.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={fetchKeys}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.1)',
              color: '#fff', border: '1px solid rgba(255,255,255,0.15)', padding: '9px 16px',
              borderRadius: 9, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
            }}
          >
            <RefreshCw size={16} className={loading ? 'api-spin' : ''} />
            Actualiser
          </button>
          <button
            onClick={() => { setShowCreate(true); setCreatedKey(null); setNewName(''); setNewScope('*'); setNewExpiry(''); setError(''); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, background: '#3b82f6',
              color: '#fff', border: 'none', padding: '9px 16px',
              borderRadius: 9, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
            }}
          >
            <Plus size={16} />
            Nouvelle clé
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, background: '#f0fdf4',
          border: '1px solid #bbf7d0', color: '#166534', padding: '13px 18px',
          borderRadius: 11, fontSize: '0.86rem', fontWeight: 600,
        }}>
          <CheckCircle size={18} />
          <span>{message}</span>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div
          onClick={() => !createdKey && setShowCreate(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520,
            display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Key size={20} color="#3b82f6" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1e293b' }}>
                  {createdKey ? 'Clé créée' : 'Nouvelle clé API'}
                </h3>
              </div>
              {!createdKey && (
                <button onClick={() => setShowCreate(false)} style={{
                  display: 'flex', border: 'none', background: '#f1f5f9', color: '#64748b',
                  borderRadius: 8, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}>
                  <X size={18} />
                </button>
              )}
            </div>

            {createdKey ? (
              <div style={{ padding: 22 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, background: '#fffbeb',
                  border: '1px solid #fde68a', color: '#92400e', padding: '13px 18px',
                  borderRadius: 11, fontSize: '0.85rem', marginBottom: 16,
                }}>
                  <AlertTriangle size={18} />
                  <span><strong>Conservez cette clé précieusement.</strong> Elle ne sera plus jamais affichée.</span>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc',
                  border: '1.5px solid #e2e8f0', borderRadius: 9, padding: '12px 14px',
                  fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem', wordBreak: 'break-all',
                }}>
                  <code style={{ flex: 1, color: '#1e293b' }}>{createdKey}</code>
                  <button onClick={() => copyKey(createdKey)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: '#3b82f6',
                    color: '#fff', border: 'none', padding: '7px 12px', borderRadius: 7,
                    fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                    <Copy size={14} />
                    Copier
                  </button>
                </div>
                <button
                  onClick={() => { setShowCreate(false); setCreatedKey(null); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    border: 'none', background: '#1e293b', color: '#fff', padding: '10px 16px',
                    borderRadius: 9, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                    marginTop: 16, width: '100%',
                  }}
                >
                  Fermer
                </button>
              </div>
            ) : (
              <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {error && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2',
                    border: '1px solid #fecaca', color: '#dc2626', padding: '10px 14px',
                    borderRadius: 9, fontSize: '0.82rem', fontWeight: 600,
                  }}>
                    <AlertTriangle size={15} />
                    <span>{error}</span>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>Nom *</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: CI/CD Pipeline, Script backup..."
                    style={{
                      padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9,
                      fontSize: '0.85rem', color: '#1e293b', outline: 'none', width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>Module (scope)</label>
                  <select
                    value={newScope}
                    onChange={(e) => setNewScope(e.target.value)}
                    style={{
                      padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9,
                      fontSize: '0.85rem', color: '#1e293b', outline: 'none', width: '100%',
                      boxSizing: 'border-box', background: '#fff',
                    }}
                  >
                    <option value="*">Tous les modules</option>
                    {MODULES.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    Le périmètre restreint la clé aux endpoints du module choisi.
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>Expiration (optionnelle)</label>
                  <input
                    type="date"
                    value={newExpiry}
                    onChange={(e) => setNewExpiry(e.target.value)}
                    style={{
                      padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9,
                      fontSize: '0.85rem', color: '#1e293b', outline: 'none', width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    border: 'none', background: '#3b82f6', color: '#fff', padding: '10px 16px',
                    borderRadius: 9, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                    marginTop: 4, opacity: creating || !newName.trim() ? 0.6 : 1,
                  }}
                >
                  {creating ? <Loader2 size={16} className="api-spin" /> : <Key size={16} />}
                  {creating ? 'Création…' : 'Créer la clé'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: '#94a3b8' }}>
          <Loader2 size={24} className="api-spin" />
        </div>
      ) : keys.length === 0 ? (
        <div style={{
          background: '#fff', border: '1.5px dashed #e2e8f0', borderRadius: 14,
          padding: 50, textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem',
        }}>
          <Key size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ margin: 0, fontWeight: 600 }}>Aucune clé API</p>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>Créez votre première clé pour intégrer des services externes.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {keys.map((key) => {
            const expired = key.expires_at && new Date(key.expires_at) < new Date();
            return (
              <div key={key.id} style={{
                display: 'flex', alignItems: 'center', gap: 14, background: '#fff',
                border: `1px solid ${key.is_active ? '#e2e8f0' : '#fecaca'}`,
                borderRadius: 12, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                opacity: key.is_active ? 1 : 0.55,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: key.is_active ? '#eff6ff' : '#fef2f2',
                  color: key.is_active ? '#3b82f6' : '#dc2626',
                }}>
                  <Key size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>{key.name}</strong>
                    <span style={{
                      background: key.is_active ? '#dcfce7' : '#fef2f2',
                      color: key.is_active ? '#16a34a' : '#dc2626',
                      fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px',
                      borderRadius: 999, whiteSpace: 'nowrap',
                    }}>
                      {key.is_active ? 'Actif' : 'Désactivé'}
                    </span>
                    {expired && (
                      <span style={{
                        background: '#fef2f2', color: '#dc2626', fontSize: '0.7rem',
                        fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                      }}>
                        Expirée
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.78rem', color: '#64748b' }}>
                    <span style={{ fontFamily: 'ui-monospace, monospace', background: '#f1f5f9', padding: '1px 6px', borderRadius: 5 }}>
                      {showPrefix[key.id] ? key.key_prefix + '…' : key.key_prefix.slice(0, 8) + '••••'}
                    </span>
                    <button
                      onClick={() => setShowPrefix(p => ({ ...p, [key.id]: !p[key.id] }))}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex' }}
                      title="Afficher/masquer le préfixe"
                    >
                      {showPrefix[key.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <span>Scope: <strong>{scopeLabel(key.scope)}</strong></span>
                    {key.expires_at && (
                      <span>Expire le: <strong>{new Date(key.expires_at).toLocaleDateString('fr-FR')}</strong></span>
                    )}
                    <span>Créée par: <strong>{key.created_by}</strong></span>
                    {key.last_used_at && (
                      <span>Dernier usage: <strong>{new Date(key.last_used_at).toLocaleDateString('fr-FR')}</strong></span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    fontSize: '0.75rem', fontWeight: 600, color: '#64748b',
                  }}>
                    <input
                      type="checkbox"
                      checked={key.is_active}
                      onChange={(e) => toggleActive(key.id, e.target.checked)}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    Actif
                  </label>
                  <button
                    onClick={() => deleteKey(key.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, border: 'none',
                      background: '#fef2f2', color: '#dc2626', padding: '6px 10px',
                      borderRadius: 7, fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer',
                    }}
                  >
                    <X size={13} />
                    Révoquer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .api-spin { animation: api-spin 1s linear infinite; }
        @keyframes api-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
