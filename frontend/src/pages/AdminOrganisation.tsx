import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Building2, ChevronDown, ChevronRight,
  Layers, FolderOpen, Folder, Network,
  RefreshCw, AlertCircle, Loader2, Users
} from 'lucide-react';

interface Secteur {
  code: string;
  label: string;
}

interface Service {
  code: string;
  label: string;
  secteurs: Secteur[];
}

interface Direction {
  code: string;
  label: string;
  services: Service[];
}

// Palette of colors for directions
const DIR_COLORS = [
  { bg: '#eff6ff', border: '#3b82f6', badge: '#1d4ed8', icon: '#3b82f6' },
  { bg: '#f0fdf4', border: '#22c55e', badge: '#15803d', icon: '#22c55e' },
  { bg: '#fef3c7', border: '#f59e0b', badge: '#b45309', icon: '#f59e0b' },
  { bg: '#fdf4ff', border: '#a855f7', badge: '#7e22ce', icon: '#a855f7' },
  { bg: '#fff1f2', border: '#f43f5e', badge: '#be123c', icon: '#f43f5e' },
  { bg: '#f0fdfa', border: '#14b8a6', badge: '#0f766e', icon: '#14b8a6' },
  { bg: '#fff7ed', border: '#f97316', badge: '#c2410c', icon: '#f97316' },
  { bg: '#f8fafc', border: '#64748b', badge: '#334155', icon: '#64748b' },
];

const AdminOrganisation: React.FC = () => {
  const { token } = useAuth();
  const [data, setData] = useState<Direction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [expandedSvcs, setExpandedSvcs] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadOrganisation();
  }, []);

  const loadOrganisation = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await axios.get('/api/admin/rh/organisation-chart', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
      // Auto-expand all directions
      setExpandedDirs(new Set(res.data.map((d: Direction) => d.code)));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement de l\'organigramme');
    } finally {
      setLoading(false);
    }
  };

  const toggleDir = (code: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const toggleSvc = (key: string) => {
    setExpandedSvcs(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedDirs(new Set(filteredData.map(d => d.code)));
    const allSvcs = new Set<string>();
    filteredData.forEach(d => d.services.forEach(s => allSvcs.add(`${d.code}__${s.code}`)));
    setExpandedSvcs(allSvcs);
  };

  const collapseAll = () => {
    setExpandedDirs(new Set());
    setExpandedSvcs(new Set());
  };

  // Filter data based on search
  const q = searchQuery.toLowerCase().trim();
  const filteredData = q
    ? data.filter(dir => {
        const matchDir = dir.label.toLowerCase().includes(q) || dir.code.toLowerCase().includes(q);
        const matchSvc = dir.services.some(s =>
          s.label.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) ||
          s.secteurs.some(sec => sec.label.toLowerCase().includes(q) || sec.code.toLowerCase().includes(q))
        );
        return matchDir || matchSvc;
      })
    : data;

  // Stats
  const totalDirs = filteredData.length;
  const totalSvcs = filteredData.reduce((acc, d) => acc + d.services.length, 0);
  const totalSects = filteredData.reduce((acc, d) =>
    acc + d.services.reduce((a, s) => a + s.secteurs.length, 0), 0);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80, flexDirection: 'column', gap: 16 }}>
        <Loader2 size={36} style={{ color: '#3b82f6', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#64748b', fontWeight: 600 }}>Chargement de l'organigramme...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #003366, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Network size={24} style={{ color: 'white' }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>Organigramme</h1>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Hiérarchie de la ville — source SIIM</p>
          </div>
        </div>
        <button
          onClick={loadOrganisation}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: '#003366', color: 'white', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          <RefreshCw size={16} /> Créer organisation
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#991b1b' }}>
          <AlertCircle size={18} style={{ color: '#dc2626', flexShrink: 0 }} />
          <span style={{ fontSize: 14 }}>{error}</span>
        </div>
      )}

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Directions', value: totalDirs, icon: Building2, color: '#3b82f6', bg: '#eff6ff' },
          { label: 'Services', value: totalSvcs, icon: Layers, color: '#22c55e', bg: '#f0fdf4' },
          { label: 'Secteurs', value: totalSects, icon: Users, color: '#f97316', bg: '#fff7ed' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={22} style={{ color }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>{value}</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b', fontWeight: 600 }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search + controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type="text"
            placeholder="Rechercher une direction, un service, un secteur..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', paddingLeft: 14, border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <button onClick={expandAll} style={{ padding: '10px 16px', border: '1.5px solid #e2e8f0', borderRadius: 8, background: 'white', color: '#475569', cursor: 'pointer', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
          Tout déplier
        </button>
        <button onClick={collapseAll} style={{ padding: '10px 16px', border: '1.5px solid #e2e8f0', borderRadius: 8, background: 'white', color: '#475569', cursor: 'pointer', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
          Tout replier
        </button>
      </div>

      {/* Org tree */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filteredData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: 14, border: '2px dashed #e2e8f0' }}>
            <Building2 size={40} style={{ color: '#cbd5e1', display: 'block', margin: '0 auto 12px' }} />
            <p style={{ color: '#64748b', fontWeight: 600 }}>Aucune direction trouvée</p>
          </div>
        ) : (
          filteredData.map((dir, didx) => {
            const color = DIR_COLORS[didx % DIR_COLORS.length];
            const isExpanded = expandedDirs.has(dir.code);

            return (
              <div key={dir.code} style={{ background: 'white', borderRadius: 14, border: `1.5px solid ${color.border}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                {/* Direction header */}
                <button
                  onClick={() => toggleDir(dir.code)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', background: color.bg, border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: color.border, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Building2 size={18} style={{ color: 'white' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: '#1e293b' }}>{dir.label}</p>
                    <p style={{ margin: '1px 0 0', fontSize: 12, color: '#64748b' }}>
                      {dir.services.length} service{dir.services.length > 1 ? 's' : ''}
                      {' · '}
                      {dir.services.reduce((a, s) => a + s.secteurs.length, 0)} secteur{dir.services.reduce((a, s) => a + s.secteurs.length, 0) > 1 ? 's' : ''}
                    </p>
                  </div>
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: color.badge, color: 'white' }}>
                    {dir.code}
                  </span>
                  {isExpanded
                    ? <ChevronDown size={18} style={{ color: '#64748b', flexShrink: 0 }} />
                    : <ChevronRight size={18} style={{ color: '#64748b', flexShrink: 0 }} />
                  }
                </button>

                {/* Services */}
                {isExpanded && (
                  <div style={{ padding: '12px 20px 16px', borderTop: `1px solid ${color.border}20` }}>
                    {dir.services.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', fontStyle: 'italic', padding: '8px 12px' }}>Aucun service rattaché</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {dir.services.map(svc => {
                          const svcKey = `${dir.code}__${svc.code}`;
                          const svcExpanded = expandedSvcs.has(svcKey);

                          return (
                            <div key={svc.code} style={{ borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                              {/* Service header */}
                              <button
                                onClick={() => svc.secteurs.length > 0 && toggleSvc(svcKey)}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: '#f8fafc', border: 'none', cursor: svc.secteurs.length > 0 ? 'pointer' : 'default', textAlign: 'left' }}
                              >
                                {svc.secteurs.length > 0
                                  ? (svcExpanded
                                      ? <FolderOpen size={16} style={{ color: color.border, flexShrink: 0 }} />
                                      : <Folder size={16} style={{ color: color.border, flexShrink: 0 }} />)
                                  : <Layers size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />
                                }
                                <span style={{ flex: 1, fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{svc.label}</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', background: '#e2e8f0', padding: '2px 8px', borderRadius: 12 }}>
                                  {svc.code}
                                </span>
                                {svc.secteurs.length > 0 && (
                                  <>
                                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                      {svc.secteurs.length} secteur{svc.secteurs.length > 1 ? 's' : ''}
                                    </span>
                                    {svcExpanded
                                      ? <ChevronDown size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
                                      : <ChevronRight size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
                                    }
                                  </>
                                )}
                              </button>

                              {/* Secteurs */}
                              {svcExpanded && svc.secteurs.length > 0 && (
                                <div style={{ padding: '8px 14px 10px 40px', background: 'white', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {svc.secteurs.map(sec => (
                                    <div key={sec.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color.border, flexShrink: 0 }} />
                                      <span style={{ flex: 1, fontSize: 13, color: '#374151', fontWeight: 600 }}>{sec.label}</span>
                                      <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', background: '#e2e8f0', padding: '2px 8px', borderRadius: 12 }}>
                                        {sec.code}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AdminOrganisation;
