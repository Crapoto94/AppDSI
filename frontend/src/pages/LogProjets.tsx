import React, { useEffect, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ScrollText, ArrowLeft } from 'lucide-react';

interface Entry {
  id: number;
  projet_id: number;
  projet_code?: string;
  projet_titre?: string;
  type_entree: string;
  message: string;
  details?: string;
  username?: string;
  username_displayname?: string;
  date_entree: string;
}

const TYPE_COLORS: Record<string, string> = {
  creation: '#16a34a', statut: '#2563eb', transition: '#2563eb', document: '#7c3aed',
  score: '#d97706', commentaire: '#0891b2', reunion: '#db2777', tache: '#0d9488',
  jalon: '#ea580c', modification: '#64748b',
};

export default function LogProjets() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/projets/journal-global', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => setEntries(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const types = [...new Set(entries.map(e => e.type_entree).filter(Boolean))].sort();
  const filtered = entries.filter(e => {
    if (typeFilter && e.type_entree !== typeFilter) return false;
    const s = search.trim().toLowerCase();
    if (s && !(`${e.message} ${e.projet_titre} ${e.username_displayname || e.username}`.toLowerCase().includes(s))) return false;
    return true;
  });

  const fmt = (d: string) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div>
      <Header />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <button onClick={() => navigate('/portefeuille-projets')} style={{ border: '1px solid #e2e8f0', background: 'white', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#475569' }}><ArrowLeft size={16} /></button>
          <ScrollText size={22} color="#2563eb" />
          <h1 style={{ margin: 0, fontSize: 22, color: '#0f172a' }}>Log de projets</h1>
          <span style={{ color: '#94a3b8', fontSize: 14 }}>journaux de tous les projets, triés par date</span>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <input type="text" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: '1 1 240px', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }} />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: 'white', cursor: 'pointer' }}>
            <option value="">Tous les types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>Aucune entrée</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>Date</th>
                  <th style={{ padding: '10px 14px' }}>Projet</th>
                  <th style={{ padding: '10px 14px' }}>Type</th>
                  <th style={{ padding: '10px 14px' }}>Évènement</th>
                  <th style={{ padding: '10px 14px' }}>Auteur</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} onClick={() => navigate(`/projets/${e.projet_id}`)} style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer' }}
                    onMouseEnter={ev => (ev.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={ev => (ev.currentTarget.style.background = 'white')}>
                    <td style={{ padding: '9px 14px', color: '#64748b', whiteSpace: 'nowrap' }}>{fmt(e.date_entree)}</td>
                    <td style={{ padding: '9px 14px', fontWeight: 600, color: '#1e293b' }}>{e.projet_titre || `#${e.projet_id}`}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${TYPE_COLORS[e.type_entree] || '#64748b'}20`, color: TYPE_COLORS[e.type_entree] || '#64748b' }}>{e.type_entree}</span>
                    </td>
                    <td style={{ padding: '9px 14px', color: '#334155' }}>{e.message}</td>
                    <td style={{ padding: '9px 14px', color: '#64748b', whiteSpace: 'nowrap' }}>{e.username_displayname || e.username || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
