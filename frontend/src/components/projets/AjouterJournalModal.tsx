import React, { useState, useEffect, useMemo } from 'react';
import { X, BookOpen } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface Projet {
  id: number;
  titre: string;
  code: string | null;
  chef_projet_username?: string;
  chef_projet_display_name?: string;
  commanditaire_username?: string;
  user_est_intervenant?: boolean;
}

interface AjouterJournalModalProps {
  token: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function AjouterJournalModal({ token, onClose, onCreated }: AjouterJournalModalProps) {
  const { user } = useAuth();
  const [projets, setProjets] = useState<Projet[]>([]);
  const [selectedProjetId, setSelectedProjetId] = useState<number | ''>('');
  const [dateEntry, setDateEntry] = useState(new Date().toISOString().split('T')[0]);
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/projets/mes-projets', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setProjets(Array.isArray(d) ? d : []))
      .catch(() => setError('Erreur lors du chargement des projets'))
      .finally(() => setLoading(false));
  }, [token]);

  const username = user?.username?.toLowerCase() || '';

  const grouped = useMemo(() => {
    const mesProjets: Projet[] = [];
    const projetsRole: Projet[] = [];
    for (const p of projets) {
      const isMine = p.commanditaire_username?.toLowerCase() === username ||
                     p.chef_projet_username?.toLowerCase() === username;
      if (isMine) {
        mesProjets.push(p);
      } else if (p.user_est_intervenant) {
        projetsRole.push(p);
      }
    }

    const groupByChef = (list: Projet[]): Record<string, Projet[]> => {
      const grouped: Record<string, Projet[]> = {};
      for (const p of list) {
        const key = p.chef_projet_display_name || p.chef_projet_username || '__none__';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(p);
      }
      return grouped;
    };

    return {
      mesProjets: groupByChef(mesProjets),
      projetsRole: groupByChef(projetsRole),
    };
  }, [projets, username]);

  const sortedKeys = (group: Record<string, Projet[]>) =>
    Object.keys(group).sort((a, b) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      return a.localeCompare(b);
    });

  const renderOptions = () => {
    const opts: React.ReactNode[] = [];

    const mesKeys = sortedKeys(grouped.mesProjets);
    const roleKeys = sortedKeys(grouped.projetsRole);

    if (mesKeys.length > 0) {
      opts.push(
        <optgroup key="mes" label="👤 Mes projets">
          {mesKeys.flatMap(key => {
            const chefLabel = key === '__none__' ? 'Non assigné' : key;
            return [
              <option key={`${key}_header`} disabled style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                ─ {chefLabel} ─
              </option>,
              ...grouped.mesProjets[key].map(p => (
                <option key={p.id} value={p.id}>
                  {p.code ? `[${p.code}] ` : ''}{p.titre}
                </option>
              ))
            ];
          })}
        </optgroup>
      );
    }

    if (roleKeys.length > 0) {
      opts.push(
        <optgroup key="role" label="📋 Projets où j'ai un rôle">
          {roleKeys.flatMap(key => {
            const chefLabel = key === '__none__' ? 'Non assigné' : key;
            return [
              <option key={`${key}_header`} disabled style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                ─ {chefLabel} ─
              </option>,
              ...grouped.projetsRole[key].map(p => (
                <option key={p.id} value={p.id}>
                  {p.code ? `[${p.code}] ` : ''}{p.titre}
                </option>
              ))
            ];
          })}
        </optgroup>
      );
    }

    return opts;
  };

  const handleSubmit = async () => {
    if (!selectedProjetId) { setError('Sélectionnez un projet'); return; }
    if (!message.trim()) { setError('Le message est obligatoire'); return; }
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('type_entree', 'evenement');
      formData.append('message', message.trim());
      formData.append('date_entree', dateEntry);
      if (file) formData.append('file', file);

      const res = await fetch(`/api/projets/${selectedProjetId}/journal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Erreur lors de l\'ajout');
        return;
      }
      onCreated();
      onClose();
    } catch {
      setError('Erreur réseau');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)', zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'white', borderRadius: 16, padding: '28px 28px 24px', width: '100%', maxWidth: 520, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={18} style={{ color: 'var(--primary-color)' }} />
            Ajouter au journal de projet
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#64748b', fontSize: 14 }}>Chargement des projets...</div>
          ) : (
            <>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Projet *
                </label>
                <select
                  value={selectedProjetId}
                  onChange={e => setSelectedProjetId(e.target.value ? Number(e.target.value) : '')}
                  style={{ width: '100%', borderRadius: 8, border: '1px solid #e2e8f0', padding: '9px 12px', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', background: 'white' }}
                >
                  <option value="">— Sélectionnez un projet —</option>
                  {renderOptions()}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Date
                </label>
                <input
                  type="date"
                  value={dateEntry}
                  onChange={e => setDateEntry(e.target.value)}
                  style={{ width: '100%', borderRadius: 8, border: '1px solid #e2e8f0', padding: '9px 12px', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Événement *
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Décrivez l'événement..."
                  rows={3}
                  autoFocus
                  style={{ width: '100%', borderRadius: 8, border: '1px solid #e2e8f0', padding: '9px 12px', fontSize: 14, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Document <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none' }}>(optionnel)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#475569' }}>
                  <input
                    type="file"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                    style={{ display: 'none' }}
                  />
                  {file ? file.name : '📎 Choisir un fichier'}
                  {file && (
                    <button onClick={e => { e.preventDefault(); setFile(null); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 13, padding: 0 }}>
                      ✕ Retirer
                    </button>
                  )}
                </label>
              </div>
            </>
          )}

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
              ❌ {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#64748b' }}>
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={!selectedProjetId || !message.trim() || saving || loading}
              style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: selectedProjetId && message.trim() && !saving && !loading ? 'var(--primary-color)' : '#e2e8f0', cursor: selectedProjetId && message.trim() && !saving && !loading ? 'pointer' : 'not-allowed', color: selectedProjetId && message.trim() && !saving && !loading ? 'white' : '#94a3b8', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {saving ? 'Ajout...' : (
                <>
                  <BookOpen size={15} />
                  Ajouter au journal
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
