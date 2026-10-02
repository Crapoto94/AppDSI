import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Search, Save, Users, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Tile {
  id: number;
  title: string;
  is_public?: number | boolean;
  is_module?: number | boolean;
}

interface UserRow {
  id: number;
  username: string;
  role: string;
  is_approved: number;
  authorized: boolean;
}

const roleLabel: Record<string, string> = {
  superadmin: 'Super-admin',
  admin: 'Admin',
  user: 'Agent',
  magapp: 'MagApp',
  readonly: 'Lecture',
};

/**
 * Vue « Autorisations par tuile » : sélection d'une tuile, puis ajout/retrait
 * des agents autorisés (l'inverse de la vue par agent déjà existante).
 */
const TilesAuthorizationPanel: React.FC = () => {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios
      .get('/api/tiles-all')
      .then((r) => setTiles(Array.isArray(r.data) ? r.data : []))
      .catch((e) => {
        console.error('Error fetching tiles:', e);
        setError('Impossible de charger les tuiles.');
      });
  }, []);

  useEffect(() => {
    if (selectedTileId == null) return;
    setLoading(true);
    setDirty(false);
    setSearch('');
    axios
      .get(`/api/tiles/${selectedTileId}/users`, { headers })
      .then((r) => {
        const rows: UserRow[] = r.data;
        setUsers(rows);
        setSelected(new Set(rows.filter((u) => u.authorized).map((u) => u.id)));
      })
      .catch((e) => {
        console.error('Error fetching tile users:', e);
        setError('Impossible de charger les autorisations de cette tuile.');
      })
      .finally(() => setLoading(false));
  }, [selectedTileId, headers]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    if (selectedTileId == null) return;
    setSaving(true);
    try {
      await axios.put(`/api/tiles/${selectedTileId}/users`, { users: [...selected] }, { headers });
      setDirty(false);
    } catch (e) {
      console.error('Error saving tile users:', e);
      alert("Erreur lors de l'enregistrement des autorisations");
    } finally {
      setSaving(false);
    }
  };

  const currentTile = tiles.find((t) => t.id === selectedTileId);
  const isPublic = currentTile?.is_public === 1 || currentTile?.is_public === true;

  const filtered = users.filter((u) => u.username.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={18} color="#2563eb" />
            Autorisations par tuile
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '4px 0 0' }}>
            Choisissez une tuile, puis ajoutez ou retirez les agents autorisés à y accéder.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={selectedTileId ?? ''}
            onChange={(e) => setSelectedTileId(e.target.value ? Number(e.target.value) : null)}
            style={{ padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: '0.95rem', fontWeight: 600, color: '#1e293b', background: 'white', minWidth: 240, cursor: 'pointer' }}
          >
            <option value="">— Choisir une tuile —</option>
            {tiles.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {(t.is_public === 1 || t.is_public === true) ? ' (publique)' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={save}
            disabled={!dirty || saving || selectedTileId == null}
            className="btn btn-primary"
            style={{ opacity: !dirty || saving || selectedTileId == null ? 0.5 : 1, cursor: !dirty || saving || selectedTileId == null ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Save size={16} />
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#991b1b', fontSize: '0.9rem', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {selectedTileId == null ? (
        <p style={{ fontSize: '0.9rem', color: '#cbd5e1', fontStyle: 'italic' }}>Sélectionnez une tuile pour gérer ses autorisations.</p>
      ) : (
        <>
          {isPublic && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', color: '#1e40af', fontSize: '0.88rem', marginBottom: 12 }}>
              Tuile <strong>publique</strong> : accessible à tous les utilisateurs identifiés sans autorisation individuelle. Les cases ci-dessous restent sans effet tant que la tuile est publique.
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: 'white' }}>
              <Search size={16} color="#94a3b8" />
              <input
                type="text"
                placeholder="Rechercher un agent…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.95rem', fontFamily: 'inherit' }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                  <X size={16} />
                </button>
              )}
            </div>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
              {selected.size} autorisé{selected.size > 1 ? 's' : ''}
            </span>
            <button
              onClick={() => {
                setSelected(new Set(filtered.map((u) => u.id)));
                setDirty(true);
              }}
              style={{ padding: '6px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#334155' }}
            >
              Tout cocher
            </button>
            <button
              onClick={() => {
                setSelected(new Set());
                setDirty(true);
              }}
              style={{ padding: '6px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#334155' }}
            >
              Tout décocher
            </button>
          </div>

          {loading ? (
            <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Chargement…</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
              {filtered.map((u) => {
                const checked = selected.has(u.id);
                return (
                  <label
                    key={u.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      border: `2px solid ${checked ? '#bfdbfe' : '#e2e8f0'}`,
                      background: checked ? '#eff6ff' : '#f8fafc',
                      borderRadius: 12,
                      cursor: 'pointer',
                      transition: 'all .15s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(u.id)}
                      style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.username}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        {roleLabel[u.role] || u.role}
                        {!u.is_approved ? ' · non approuvé' : ''}
                      </div>
                    </div>
                  </label>
                );
              })}
              {filtered.length === 0 && (
                <p style={{ fontSize: '0.85rem', color: '#cbd5e1', fontStyle: 'italic' }}>Aucun agent ne correspond.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TilesAuthorizationPanel;
