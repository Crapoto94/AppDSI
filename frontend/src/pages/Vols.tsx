import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import {
  ShieldAlert, Plus, X, Search, Trash2, Edit3, Paperclip, Upload, Download,
  MessageSquare, Send, Loader2, ArrowLeft
} from 'lucide-react';

interface Theft {
  id: number;
  type_incident: string;
  designation: string;
  numero_inventaire: string;
  parc_type_key: string;
  parc_glpi_id: number | null;
  agent_nom: string;
  agent_service: string;
  beneficiaire_nom: string;
  beneficiaire_service: string;
  valeur_achat: number | null;
  date_achat: string | null;
  age_annees: number | null;
  date_vol: string | null;
  lieu: string;
  circonstances: string;
  statut: string;
  created_by: string;
  created_at: string;
}

interface TheftDoc {
  id: number;
  theft_id: number;
  file_path: string;
  file_name: string;
  nature: string;
  uploaded_by: string;
  uploaded_at: string;
}

interface TheftComment {
  id: number;
  theft_id: number;
  comment: string;
  author: string;
  created_at: string;
}

interface ParcHit {
  id: number | string;
  name: string;
  otherserial: string;
  serial: string;
  contact: string;
  group: string;
  age_years: number | null;
  value: number | null;
}

const STATUTS: { value: string; label: string; color: string }[] = [
  { value: 'declare', label: 'Déclaré', color: '#64748b' },
  { value: 'plainte_deposee', label: 'Plainte déposée', color: '#2563eb' },
  { value: 'en_cours', label: 'En cours', color: '#d97706' },
  { value: 'rembourse', label: 'Remboursé', color: '#16a34a' },
  { value: 'classe_sans_suite', label: 'Classé sans suite', color: '#94a3b8' },
  { value: 'clos', label: 'Clos', color: '#334155' },
];

const NATURES = ['Déclaration de vol', 'Déclaration de perte', 'Récépissé de plainte', 'Autre'];

const TYPES_INCIDENT = [
  { value: 'vol', label: 'Vol' },
  { value: 'perte', label: 'Perte' },
];

const PARC_TYPES = [
  { value: 'ordinateurs', label: 'Ordinateurs' },
  { value: 'moniteurs', label: 'Moniteurs' },
  { value: 'peripheriques', label: 'Périphériques' },
  { value: 'imprimantes', label: 'Imprimantes' },
  { value: 'telephones_tablettes', label: 'Téléphones / Tablettes' },
];

const emptyForm = {
  type_incident: 'vol',
  designation: '', numero_inventaire: '', parc_type_key: '', parc_glpi_id: null as number | null,
  agent_nom: '', agent_service: '', beneficiaire_nom: '', beneficiaire_service: '', valeur_achat: '', date_achat: '',
  age_annees: '', date_vol: '', lieu: '', circonstances: '', statut: 'declare'
};

function typeIncidentInfo(v: string) {
  return TYPES_INCIDENT.find(t => t.value === v) || TYPES_INCIDENT[0];
}

function statutInfo(v: string) {
  return STATUTS.find(s => s.value === v) || STATUTS[0];
}

function fmtMoney(v: number | null) {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

const Vols: React.FC = () => {
  const { token, user } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [thefts, setThefts] = useState<Theft[]>([]);
  const [loading, setLoading] = useState(true);
  const [statutFilter, setStatutFilter] = useState('');
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const [parcType, setParcType] = useState('ordinateurs');
  const [parcQuery, setParcQuery] = useState('');
  const [parcResults, setParcResults] = useState<ParcHit[]>([]);
  const [parcSearching, setParcSearching] = useState(false);

  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Theft | null>(null);
  const [docs, setDocs] = useState<TheftDoc[]>([]);
  const [comments, setComments] = useState<TheftComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [docNature, setDocNature] = useState(NATURES[0]);
  const [uploading, setUploading] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const fetchThefts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/vols', { headers });
      setThefts(res.data || []);
    } catch (e) {
      console.error('Erreur chargement dossiers', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchThefts(); }, [fetchThefts]);

  const fetchDetail = useCallback(async (id: number) => {
    try {
      const res = await axios.get(`/api/vols/${id}`, { headers });
      setDetail(res.data);
      setDocs(res.data.documents || []);
      setComments(res.data.comments || []);
    } catch (e) {
      console.error('Erreur chargement dossier', e);
    }
  }, [token]);

  useEffect(() => {
    if (detailId != null) fetchDetail(detailId);
  }, [detailId, fetchDetail]);

  const openCreate = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setParcResults([]);
    setParcQuery('');
    setShowForm(true);
  };

  const openEdit = (t: Theft) => {
    setForm({
      type_incident: t.type_incident || 'vol',
      designation: t.designation || '',
      numero_inventaire: t.numero_inventaire || '',
      parc_type_key: t.parc_type_key || '',
      parc_glpi_id: t.parc_glpi_id,
      agent_nom: t.agent_nom || '',
      agent_service: t.agent_service || '',
      beneficiaire_nom: t.beneficiaire_nom || '',
      beneficiaire_service: t.beneficiaire_service || '',
      valeur_achat: t.valeur_achat != null ? String(t.valeur_achat) : '',
      date_achat: t.date_achat ? t.date_achat.slice(0, 10) : '',
      age_annees: t.age_annees != null ? String(t.age_annees) : '',
      date_vol: t.date_vol ? t.date_vol.slice(0, 10) : '',
      lieu: t.lieu || '',
      circonstances: t.circonstances || '',
      statut: t.statut || 'declare'
    });
    setEditingId(t.id);
    setParcResults([]);
    setParcQuery('');
    setShowForm(true);
  };

  const searchParc = async () => {
    if (!parcQuery.trim()) return;
    setParcSearching(true);
    try {
      if (parcType === 'telephones_tablettes') {
        const res = await axios.get('/api/mobilite/devices', { params: { q: parcQuery, cycle: 'tous', limit: 10 }, headers });
        const items = res.data?.items || [];
        setParcResults(items.map((d: any) => ({
          id: d.device_key,
          name: d.modele || d.type_appareil || '(appareil mobile)',
          otherserial: d.etiquetage || '',
          serial: d.imei || d.serial || '',
          contact: d.last_agent || d.dernier_util || '',
          group: d.last_service || '',
          age_years: null,
          value: null,
        })));
      } else {
        const res = await axios.get(`/api/parc/hub/${parcType}`, { params: { q: parcQuery, limit: 10 }, headers });
        const rows = res.data?.rows || res.data?.items || res.data || [];
        setParcResults(Array.isArray(rows) ? rows : []);
      }
    } catch (e) {
      console.error('Erreur recherche parc', e);
      setParcResults([]);
    } finally {
      setParcSearching(false);
    }
  };

  const applyParcHit = (hit: ParcHit) => {
    setForm(f => ({
      ...f,
      designation: hit.name || f.designation,
      numero_inventaire: hit.otherserial || hit.serial || f.numero_inventaire,
      parc_type_key: parcType,
      parc_glpi_id: (parcType !== 'telephones_tablettes' && typeof hit.id === 'number') ? hit.id : null,
      beneficiaire_nom: hit.contact || f.beneficiaire_nom,
      beneficiaire_service: hit.group || f.beneficiaire_service,
      valeur_achat: hit.value != null ? String(hit.value) : f.valeur_achat,
      age_annees: hit.age_years != null ? String(hit.age_years) : f.age_annees,
    }));
    setParcResults([]);
  };

  const submitForm = async () => {
    if (!form.designation.trim()) { alert('La désignation du matériel est requise'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await axios.put(`/api/vols/${editingId}`, form, { headers });
      } else {
        await axios.post('/api/vols', form, { headers });
      }
      setShowForm(false);
      fetchThefts();
      if (detailId === editingId) fetchDetail(editingId);
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const deleteTheft = async (id: number) => {
    if (!window.confirm('Supprimer définitivement ce dossier de vol/perte ?')) return;
    try {
      await axios.delete(`/api/vols/${id}`, { headers });
      if (detailId === id) setDetailId(null);
      fetchThefts();
    } catch (e) {
      alert('Erreur lors de la suppression');
    }
  };

  const uploadDoc = async (file: File) => {
    if (!detailId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('nature', docNature);
      await axios.post(`/api/vols/${detailId}/documents`, fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      fetchDetail(detailId);
    } catch (e) {
      alert('Erreur lors de l\'upload');
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (docId: number) => {
    if (!detailId) return;
    if (!window.confirm('Supprimer ce document ?')) return;
    try {
      await axios.delete(`/api/vols/${detailId}/documents/${docId}`, { headers });
      fetchDetail(detailId);
    } catch (e) {
      alert('Erreur lors de la suppression du document');
    }
  };

  const submitComment = async () => {
    if (!detailId || !newComment.trim()) return;
    try {
      await axios.post(`/api/vols/${detailId}/comments`, { comment: newComment.trim() }, { headers });
      setNewComment('');
      fetchDetail(detailId);
    } catch (e) {
      alert('Erreur lors de l\'ajout du commentaire');
    }
  };

  const filtered = thefts.filter(t => {
    if (statutFilter && t.statut !== statutFilter) return false;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      return (t.designation || '').toLowerCase().includes(s)
        || (t.numero_inventaire || '').toLowerCase().includes(s)
        || (t.agent_nom || '').toLowerCase().includes(s)
        || (t.beneficiaire_nom || '').toLowerCase().includes(s)
        || (t.beneficiaire_service || '').toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-color, #f8fafc)' }}>
      <Header />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 12, padding: 10, display: 'flex' }}>
              <ShieldAlert size={26} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Vols et Pertes de Matériel</h1>
              <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Suivi des matériels volés ou perdus, des démarches et des documents associés</p>
            </div>
          </div>
          <button onClick={openCreate} style={btnPrimary}>
            <Plus size={16} /> Nouveau dossier
          </button>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher (désignation, n° inventaire, bénéficiaire, service...)"
              style={{ ...inputStyle, paddingLeft: 34, width: '100%' }}
            />
          </div>
          <select value={statutFilter} onChange={e => setStatutFilter(e.target.value)} style={{ ...inputStyle, width: 220 }}>
            <option value="">Tous les statuts</option>
            {STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}><Loader2 className="spin" size={20} /> Chargement...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Aucun dossier de vol ou de perte enregistré.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Type', 'Désignation', 'N° inventaire', 'Agent concerné', 'Bénéficiaire', 'Service', 'Valeur', 'Âge', 'Date', 'Statut', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#475569', fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const st = statutInfo(t.statut);
                  const ti = typeIncidentInfo(t.type_incident);
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => setDetailId(t.id)}>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ background: ti.value === 'vol' ? '#fef2f2' : '#f1f5f9', color: ti.value === 'vol' ? '#dc2626' : '#475569', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{ti.label}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>{t.designation}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#475569' }}>{t.numero_inventaire || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{t.agent_nom || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{t.beneficiaire_nom || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{t.beneficiaire_service || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{fmtMoney(t.valeur_achat)}</td>
                      <td style={{ padding: '10px 14px' }}>{t.age_annees != null ? `${t.age_annees} an(s)` : '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{t.date_vol ? new Date(t.date_vol).toLocaleDateString('fr-FR') : '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ background: `${st.color}1a`, color: st.color, padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{st.label}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(t)} style={iconBtn} title="Modifier"><Edit3 size={15} /></button>
                        {isAdmin && <button onClick={() => deleteTheft(t.id)} style={{ ...iconBtn, color: '#dc2626' }} title="Supprimer"><Trash2 size={15} /></button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {showForm && (
        <div style={overlayStyle} onClick={() => setShowForm(false)}>
          <div style={{ ...modalStyle, maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{editingId ? 'Modifier le dossier' : 'Nouveau dossier de vol / perte'}</h2>
              <button onClick={() => setShowForm(false)} style={iconBtn}><X size={18} /></button>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Rechercher le matériel dans le parc (optionnel)</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={parcType} onChange={e => setParcType(e.target.value)} style={{ ...inputStyle, width: 160 }}>
                    {PARC_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <input value={parcQuery} onChange={e => setParcQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchParc()}
                    placeholder="Nom, n° série ou n° inventaire" style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={searchParc} disabled={parcSearching} style={btnSecondary}>
                    {parcSearching ? <Loader2 size={15} className="spin" /> : <Search size={15} />}
                  </button>
                </div>
                {parcResults.length > 0 && (
                  <div style={{ marginTop: 8, maxHeight: 180, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, background: 'white' }}>
                    {parcResults.map(r => (
                      <div key={r.id} onClick={() => applyParcHit(r)}
                        style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 13 }}>
                        <strong>{r.name || '(sans nom)'}</strong> — {r.otherserial || r.serial || 's/n ?'}
                        {r.contact ? ` · ${r.contact}` : ''}{r.age_years != null ? ` · ${r.age_years} an(s)` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Field label="Type d'incident *">
                <div style={{ display: 'flex', gap: 10 }}>
                  {TYPES_INCIDENT.map(t => (
                    <label key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: `1px solid ${form.type_incident === t.value ? '#2563eb' : '#e2e8f0'}`, borderRadius: 8, cursor: 'pointer', background: form.type_incident === t.value ? '#eff6ff' : 'white', fontWeight: 600, color: form.type_incident === t.value ? '#2563eb' : '#334155' }}>
                      <input type="radio" name="type_incident" value={t.value} checked={form.type_incident === t.value}
                        onChange={() => setForm({ ...form, type_incident: t.value })} style={{ margin: 0 }} />
                      {t.label}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Désignation du matériel *">
                <input value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} style={inputStyle} />
              </Field>
              <div style={rowStyle}>
                <Field label="N° d'inventaire">
                  <input value={form.numero_inventaire} onChange={e => setForm({ ...form, numero_inventaire: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Âge estimé (années)">
                  <input type="number" step="0.1" value={form.age_annees} onChange={e => setForm({ ...form, age_annees: e.target.value })} style={inputStyle} />
                </Field>
              </div>
              <div style={rowStyle}>
                <Field label="Agent concerné (déclarant / présent)">
                  <input value={form.agent_nom} onChange={e => setForm({ ...form, agent_nom: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Service de l'agent">
                  <input value={form.agent_service} onChange={e => setForm({ ...form, agent_service: e.target.value })} style={inputStyle} />
                </Field>
              </div>
              <div style={rowStyle}>
                <Field label="Bénéficiaire du matériel (à qui il a été délivré)">
                  <input value={form.beneficiaire_nom} onChange={e => setForm({ ...form, beneficiaire_nom: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Service du bénéficiaire">
                  <input value={form.beneficiaire_service} onChange={e => setForm({ ...form, beneficiaire_service: e.target.value })} style={inputStyle} />
                </Field>
              </div>
              <div style={rowStyle}>
                <Field label="Valeur d'achat (€)">
                  <input type="number" step="0.01" value={form.valeur_achat} onChange={e => setForm({ ...form, valeur_achat: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Date d'achat">
                  <input type="date" value={form.date_achat} onChange={e => setForm({ ...form, date_achat: e.target.value })} style={inputStyle} />
                </Field>
              </div>
              <div style={rowStyle}>
                <Field label="Date du vol / de la perte">
                  <input type="date" value={form.date_vol} onChange={e => setForm({ ...form, date_vol: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Lieu">
                  <input value={form.lieu} onChange={e => setForm({ ...form, lieu: e.target.value })} style={inputStyle} />
                </Field>
              </div>
              <Field label="Circonstances">
                <textarea value={form.circonstances} onChange={e => setForm({ ...form, circonstances: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </Field>
              <Field label="Statut">
                <select value={form.statut} onChange={e => setForm({ ...form, statut: e.target.value })} style={inputStyle}>
                  {STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={btnSecondary}>Annuler</button>
              <button onClick={submitForm} disabled={saving} style={btnPrimary}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}

      {detailId != null && detail && (
        <div style={overlayStyle} onClick={() => setDetailId(null)}>
          <div style={{ ...modalStyle, maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <button onClick={() => setDetailId(null)} style={iconBtn}><ArrowLeft size={18} /></button>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, flex: 1 }}>{detail.designation}</h2>
              <span style={{ background: typeIncidentInfo(detail.type_incident).value === 'vol' ? '#fef2f2' : '#f1f5f9', color: typeIncidentInfo(detail.type_incident).value === 'vol' ? '#dc2626' : '#475569', padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                {typeIncidentInfo(detail.type_incident).label}
              </span>
              <span style={{ background: `${statutInfo(detail.statut).color}1a`, color: statutInfo(detail.statut).color, padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                {statutInfo(detail.statut).label}
              </span>
              <button onClick={() => openEdit(detail)} style={iconBtn}><Edit3 size={16} /></button>
              <button onClick={() => setDetailId(null)} style={iconBtn}><X size={18} /></button>
            </div>

            <div style={{ padding: 20, maxHeight: '75vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 14 }}>
                <InfoItem label="N° d'inventaire" value={detail.numero_inventaire || '—'} />
                <InfoItem label="Âge estimé" value={detail.age_annees != null ? `${detail.age_annees} an(s)` : '—'} />
                <InfoItem label="Agent concerné" value={detail.agent_nom || '—'} />
                <InfoItem label="Service de l'agent" value={detail.agent_service || '—'} />
                <InfoItem label="Bénéficiaire du matériel" value={detail.beneficiaire_nom || '—'} />
                <InfoItem label="Service du bénéficiaire" value={detail.beneficiaire_service || '—'} />
                <InfoItem label="Valeur d'achat" value={fmtMoney(detail.valeur_achat)} />
                <InfoItem label="Date d'achat" value={detail.date_achat ? new Date(detail.date_achat).toLocaleDateString('fr-FR') : '—'} />
                <InfoItem label={`Date du ${typeIncidentInfo(detail.type_incident).label.toLowerCase()}`} value={detail.date_vol ? new Date(detail.date_vol).toLocaleDateString('fr-FR') : '—'} />
                <InfoItem label="Lieu" value={detail.lieu || '—'} />
              </div>
              {detail.circonstances && (
                <div>
                  <div style={sectionLabel}>Circonstances</div>
                  <div style={{ whiteSpace: 'pre-wrap', color: '#334155', fontSize: 14 }}>{detail.circonstances}</div>
                </div>
              )}

              <div>
                <div style={sectionLabel}><Paperclip size={13} /> Documents</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <select value={docNature} onChange={e => setDocNature(e.target.value)} style={{ ...inputStyle, width: 220 }}>
                    {NATURES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <label style={{ ...btnSecondary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Upload size={14} /> {uploading ? 'Envoi...' : 'Ajouter un document'}
                    <input type="file" hidden disabled={uploading} onChange={e => { if (e.target.files?.[0]) uploadDoc(e.target.files[0]); e.target.value = ''; }} />
                  </label>
                </div>
                {docs.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>Aucun document associé.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {docs.map(d => (
                      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <Paperclip size={14} color="#64748b" />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{d.file_name}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.nature}{d.uploaded_by ? ` · ${d.uploaded_by}` : ''} · {new Date(d.uploaded_at).toLocaleDateString('fr-FR')}</div>
                        </div>
                        <a href={`/api/vols/${detailId}/documents/${d.id}?token=${token || ''}`} target="_blank" rel="noreferrer" style={iconBtn}><Download size={15} /></a>
                        <button onClick={() => deleteDoc(d.id)} style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div style={sectionLabel}><MessageSquare size={13} /> Suivi des actions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                  {comments.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: 13 }}>Aucune action enregistrée pour l'instant.</div>
                  ) : comments.map(c => (
                    <div key={c.id} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 3 }}>
                        <strong>{c.author || 'Utilisateur'}</strong> · {new Date(c.created_at).toLocaleString('fr-FR')}
                      </div>
                      <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{c.comment}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitComment()}
                    placeholder="Ajouter une action réalisée..." style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={submitComment} style={btnPrimary}><Send size={14} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .spin { animation: vols-spin 1s linear infinite; }
        @keyframes vols-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ flex: 1 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>{label}</label>
    {children}
  </div>
);

const InfoItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
    <div style={{ color: '#0f172a' }}>{value}</div>
  </div>
);

const rowStyle: React.CSSProperties = { display: 'flex', gap: 14 };

const sectionLabel: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 };

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, width: '100%', boxSizing: 'border-box'
};

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: '#2563eb', color: 'white', border: 'none',
  borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer'
};

const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', color: '#334155', border: '1px solid #e2e8f0',
  borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 14, cursor: 'pointer'
};

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none',
  color: '#64748b', cursor: 'pointer', padding: 6, borderRadius: 6
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', zIndex: 1000, padding: 20
};

const modalStyle: React.CSSProperties = {
  background: 'white', borderRadius: 14, width: '100%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
  display: 'flex', flexDirection: 'column'
};

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid #e2e8f0'
};

export default Vols;
