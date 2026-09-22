import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Plus, Search, ExternalLink, Github, Edit2, Trash2, X, Gauge } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface AppMeta {
  id: number;
  nom: string;
  agent: string;
  dossier: string | null;
  nature: string | null;
  version: string | null;
  repo_github: string | null;
  ports_docker: string | null;
  etat: string | null;
  complexite: number | null;
  techno_stack: string | null;
  lien_prod: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface AppFull extends AppMeta {
  objectif: string | null;
  modules_fonctions: string | null;
  base_donnees: string | null;
  dependances_integrations: string | null;
  ia_embarquee: string | null;
  variables_env: string | null;
  justification_complexite: string | null;
  swagger_doc: string | null;
}

const EMPTY_FORM: Partial<AppFull> = {
  nom: '', agent: '', dossier: '', nature: '', version: '', repo_github: '', ports_docker: '',
  objectif: '', modules_fonctions: '', techno_stack: '', base_donnees: '',
  dependances_integrations: '', ia_embarquee: '', variables_env: '', complexite: undefined,
  justification_complexite: '', swagger_doc: '', etat: '', lien_prod: ''
};

function etatColor(etat: string | null) {
  const e = (etat || '').toLowerCase();
  if (e.includes('prod')) return { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' };
  if (e.includes('legacy') || e.includes('recette')) return { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };
  if (e.includes('confirmer')) return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' };
  if (e.includes('dev') || e.includes('test')) return { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' };
  return { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };
}

function complexiteColor(c: number | null) {
  if (c === null || c === undefined) return '#cbd5e1';
  if (c <= 2) return '#22c55e';
  if (c <= 4) return '#84cc16';
  if (c <= 6) return '#eab308';
  if (c <= 8) return '#f97316';
  return '#ef4444';
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
}

const FIELD_LABELS: { key: keyof AppFull; label: string; textarea?: boolean }[] = [
  { key: 'objectif', label: "Objectif / ce que fait l'application", textarea: true },
  { key: 'modules_fonctions', label: 'Modules & fonctions clés', textarea: true },
  { key: 'techno_stack', label: 'Techno / stack', textarea: true },
  { key: 'base_donnees', label: 'Base de données', textarea: true },
  { key: 'dependances_integrations', label: 'Dépendances / intégrations externes', textarea: true },
  { key: 'ia_embarquee', label: 'IA embarquée', textarea: true },
  { key: 'variables_env', label: "Variables d'env / clés API (noms)", textarea: true },
  { key: 'justification_complexite', label: 'Justification complexité', textarea: true },
  { key: 'swagger_doc', label: 'Swagger & documentation (liens)', textarea: true },
];

const ApplicationsCatalog: React.FC = () => {
  const { token, user } = useAuth();
  const [apps, setApps] = useState<AppMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<AppFull | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<AppFull>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => { fetchApps(); }, [token]);

  const fetchApps = async () => {
    setLoading(true);
    try {
      const res = await axios.get<AppMeta[]>('/api/applications-catalog', authHeaders);
      setApps(res.data);
    } catch (error) {
      console.error('Error fetching applications catalog:', error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(a =>
      a.nom.toLowerCase().includes(q) ||
      a.agent.toLowerCase().includes(q) ||
      (a.techno_stack || '').toLowerCase().includes(q) ||
      (a.etat || '').toLowerCase().includes(q)
    );
  }, [apps, search]);

  const canEdit = (item: { created_by: string }) =>
    !!user && (user.username === item.created_by || ['admin', 'superadmin'].includes(user.role));

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await axios.get<AppFull>(`/api/applications-catalog/${id}`, authHeaders);
      setDetail(res.data);
    } catch (error) {
      console.error('Error fetching application detail:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, agent: user?.username === 'MaChevalier' ? 'Marc Chevalier' : '' });
    setShowForm(true);
  };

  const openEdit = (item: AppFull) => {
    setEditingId(item.id);
    setForm(item);
    setShowForm(true);
    setDetail(null);
  };

  const handleSave = async () => {
    if (!form.nom || !form.agent) {
      alert("Le nom de l'application et l'agent sont requis");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await axios.put(`/api/applications-catalog/${editingId}`, form, authHeaders);
      } else {
        await axios.post('/api/applications-catalog', form, authHeaders);
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      await fetchApps();
    } catch (error: any) {
      console.error('Error saving application:', error);
      alert(error?.response?.data?.error || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, nom: string) => {
    if (!window.confirm(`Supprimer l'application "${nom}" du catalogue ?`)) return;
    try {
      await axios.delete(`/api/applications-catalog/${id}`, authHeaders);
      setDetail(null);
      await fetchApps();
    } catch (error: any) {
      console.error('Error deleting application:', error);
      alert(error?.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '220px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
            background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', flex: 1, maxWidth: '360px'
          }}>
            <Search size={16} color="#94a3b8" />
            <input
              type="text"
              placeholder="Rechercher (nom, agent, techno, état)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.9rem' }}
            />
          </div>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{filtered.length} application{filtered.length > 1 ? 's' : ''}</span>
        </div>
        <button
          onClick={openCreate}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
            background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px',
            cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem'
          }}
        >
          <Plus size={16} />
          Ajouter mon application
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>Chargement...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px', background: 'white', borderRadius: '12px' }}>
          Aucune application ne correspond.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {filtered.map(app => {
            const ec = etatColor(app.etat);
            return (
              <div
                key={app.id}
                onClick={() => openDetail(app.id)}
                style={{
                  background: 'white', borderRadius: '12px', padding: '18px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)', cursor: 'pointer',
                  borderTop: '4px solid #2563eb', display: 'flex', flexDirection: 'column', gap: '10px',
                  transition: 'transform 0.15s, box-shadow 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '8px' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: 0, flex: 1 }}>{app.nom}</h3>
                  {app.etat && (
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px', borderRadius: '99px',
                      background: ec.bg, color: ec.text, border: `1px solid ${ec.border}`, whiteSpace: 'nowrap'
                    }}>
                      {app.etat}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '50%', background: '#e0e7ff', color: '#3730a3',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0
                  }}>
                    {initials(app.agent)}
                  </div>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{app.agent}</span>
                </div>

                {app.techno_stack && (
                  <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {app.techno_stack}
                  </p>
                )}

                {app.complexite !== null && app.complexite !== undefined && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Gauge size={13} color={complexiteColor(app.complexite)} />
                    <div style={{ display: 'flex', gap: '2px', flex: 1 }}>
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} style={{
                          height: '5px', flex: 1, borderRadius: '2px',
                          background: i < app.complexite! ? complexiteColor(app.complexite) : '#f1f5f9'
                        }} />
                      ))}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{app.complexite}/10</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }} onClick={e => e.stopPropagation()}>
                  {app.repo_github && (
                    <a href={app.repo_github} target="_blank" rel="noopener noreferrer" title="Dépôt Git"
                      style={{ display: 'flex', alignItems: 'center', color: '#64748b' }}>
                      <Github size={16} />
                    </a>
                  )}
                  {app.lien_prod && (
                    <a href={app.lien_prod} target="_blank" rel="noopener noreferrer" title="Ouvrir l'application"
                      style={{ display: 'flex', alignItems: 'center', color: '#64748b' }}>
                      <ExternalLink size={16} />
                    </a>
                  )}
                  {canEdit(app) && (
                    <button onClick={() => handleDelete(app.id, app.nom)} title="Supprimer"
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal détail */}
      {(detail || detailLoading) && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '20px'
        }} onClick={() => setDetail(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'white', borderRadius: '16px', width: '100%', maxWidth: '720px', maxHeight: '88vh',
            display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>{detail?.nom || 'Chargement...'}</h2>
                {detail && <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 0' }}>{detail.agent}{detail.dossier ? ` · dossier: ${detail.dossier}` : ''}</p>}
              </div>
              <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={22} />
              </button>
            </div>
            <div style={{ padding: '20px 24px', overflow: 'auto', flex: 1 }}>
              {detailLoading || !detail ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '30px' }}>Chargement...</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    {detail.etat && <span style={{ ...pillStyle, ...etatColorStyle(detail.etat) }}>{detail.etat}</span>}
                    {detail.version && <span style={pillStyle}>v. {detail.version}</span>}
                    {detail.complexite !== null && <span style={pillStyle}>Complexité {detail.complexite}/10</span>}
                    {detail.nature && <span style={pillStyle}>{detail.nature}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '16px', fontSize: '0.85rem' }}>
                    {detail.repo_github && <a href={detail.repo_github} target="_blank" rel="noopener noreferrer" style={linkStyle}><Github size={14} /> Dépôt</a>}
                    {detail.lien_prod && <a href={detail.lien_prod} target="_blank" rel="noopener noreferrer" style={linkStyle}><ExternalLink size={14} /> Application</a>}
                    {detail.ports_docker && <span style={{ color: '#64748b' }}>Ports : {detail.ports_docker}</span>}
                  </div>
                  {FIELD_LABELS.map(({ key, label }) => detail[key] ? (
                    <div key={key} style={{ marginBottom: '14px' }}>
                      <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', margin: '0 0 4px', letterSpacing: '0.03em' }}>{label}</h4>
                      <p style={{ fontSize: '0.9rem', color: '#334155', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{String(detail[key])}</p>
                    </div>
                  ) : null)}
                </>
              )}
            </div>
            {detail && canEdit(detail) && (
              <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => handleDelete(detail.id, detail.nom)} style={{ ...btnStyle, background: '#fee2e2', color: '#991b1b' }}>
                  <Trash2 size={14} /> Supprimer
                </button>
                <button onClick={() => openEdit(detail)} style={{ ...btnStyle, background: '#2563eb', color: 'white' }}>
                  <Edit2 size={14} /> Éditer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal formulaire création/édition */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2100, padding: '20px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', width: '100%', maxWidth: '760px', maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                {editingId ? "Éditer l'application" : 'Ajouter mon application'}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={22} />
              </button>
            </div>
            <div style={{ padding: '20px 24px', overflow: 'auto', flex: 1 }}>
              <FieldGrid>
                <TextField label="Nom de l'application *" value={form.nom} onChange={v => setForm({ ...form, nom: v })} />
                <TextField label="Agent (propriétaire) *" value={form.agent} onChange={v => setForm({ ...form, agent: v })} />
                <TextField label="Dossier (nom local)" value={form.dossier} onChange={v => setForm({ ...form, dossier: v })} />
                <TextField label="Nature" value={form.nature} onChange={v => setForm({ ...form, nature: v })} />
                <TextField label="Version" value={form.version} onChange={v => setForm({ ...form, version: v })} />
                <TextField label="État (dev / prod / test)" value={form.etat} onChange={v => setForm({ ...form, etat: v })} />
                <TextField label="Dépôt GitHub (URL)" value={form.repo_github} onChange={v => setForm({ ...form, repo_github: v })} />
                <TextField label="Lien de prod (URL)" value={form.lien_prod} onChange={v => setForm({ ...form, lien_prod: v })} />
                <TextField label="Ports Docker (host:container)" value={form.ports_docker} onChange={v => setForm({ ...form, ports_docker: v })} />
                <TextField
                  label="Complexité (1-10)" type="number" min={1} max={10}
                  value={form.complexite !== undefined && form.complexite !== null ? String(form.complexite) : ''}
                  onChange={v => setForm({ ...form, complexite: v ? parseInt(v, 10) : undefined })}
                />
              </FieldGrid>

              {FIELD_LABELS.map(({ key, label }) => (
                <div key={key} style={{ marginTop: '14px' }}>
                  <label style={labelStyle}>{label}</label>
                  <textarea
                    value={(form[key] as string) || ''}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ ...btnStyle, background: 'white', color: '#64748b', border: '1px solid #e2e8f0' }}>
                Annuler
              </button>
              <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, background: saving ? '#cbd5e1' : '#2563eb', color: 'white' }}>
                {saving ? 'Enregistrement...' : (editingId ? 'Mettre à jour' : 'Créer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const pillStyle: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px', borderRadius: '99px',
  background: '#f1f5f9', color: '#475569'
};
const linkStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '5px', color: '#2563eb', textDecoration: 'none', fontWeight: 600 };
const btnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', border: 'none',
  borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem'
};
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '5px' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '0.88rem', boxSizing: 'border-box' };

function etatColorStyle(etat: string) {
  const c = etatColor(etat);
  return { background: c.bg, color: c.text, border: `1px solid ${c.border}` };
}

const FieldGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>{children}</div>
);

const TextField: React.FC<{ label: string; value?: string; type?: string; min?: number; max?: number; onChange: (v: string) => void }> =
  ({ label, value, type = 'text', min, max, onChange }) => (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type={type} min={min} max={max} value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle} />
    </div>
  );

export default ApplicationsCatalog;
