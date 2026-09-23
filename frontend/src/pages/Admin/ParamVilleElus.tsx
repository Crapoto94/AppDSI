import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Edit2, Trash2, Upload, X, Save } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Onglet « Élus » de Param Ville (extrait de ParamVille.tsx pour alléger la page).
 * L'édition se fait dans une modale ; chaque élu·e peut cumuler plusieurs délégations
 * (notamment les adjoint·es). Le sexe (M/F) et les délégations sont exposés par l'API
 * `/api/ville/elus`.
 */
export interface Elu {
  id?: number;
  civilite?: string;
  sexe?: string;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  role: string;
  liste?: string;
  delegation?: string;
  delegations?: string[];
}

const ROLES = ['Maire', 'Adjoint', 'Conseiller municipal'];

const emptyForm = (): Elu => ({ civilite: 'M.', sexe: 'M', nom: '', prenom: '', role: 'Conseiller municipal', delegations: [] });

function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(';'), ...rows.map(r => r.map(esc).join(';'))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function ParamVilleElus() {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [elus, setElus] = useState<Elu[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Elu>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/ville/elus', { headers });
      setElus(Array.isArray(res.data) ? res.data.map((e: Elu) => ({ ...e, delegations: Array.isArray(e.delegations) ? e.delegations : [] })) : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [token]);

  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setModalOpen(true); };
  const openEdit = (e: Elu) => {
    setEditingId(e.id ?? null);
    setForm({ ...e, delegations: Array.isArray(e.delegations) && e.delegations.length ? [...e.delegations] : (e.delegation ? e.delegation.split(/\.\s+/).map(s => s.replace(/\.$/, '').trim()).filter(Boolean) : []) });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.nom.trim() || !form.prenom.trim() || !form.role) { alert('Nom, prénom et rôle sont requis'); return; }
    setSaving(true);
    try {
      const payload = { ...form, delegations: (form.delegations || []).map(d => d.trim()).filter(Boolean) };
      if (editingId) await axios.put(`/api/ville/elus/${editingId}`, payload, { headers });
      else await axios.post('/api/ville/elus', payload, { headers });
      setModalOpen(false);
      await load();
    } catch (e: any) { alert('Erreur: ' + (e.response?.data?.message || e.message)); }
    finally { setSaving(false); }
  };

  const remove = async (id?: number) => {
    if (!id || !confirm('Confirmer la suppression ?')) return;
    try { await axios.delete(`/api/ville/elus/${id}`, { headers }); load(); }
    catch (e: any) { alert('Erreur: ' + (e.response?.data?.message || e.message)); }
  };

  const doExport = () => {
    exportToCSV(
      `elus_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Civilité', 'Sexe', 'Prénom', 'Nom', 'Rôle', 'Liste', 'Email', 'Téléphone', 'Délégations'],
      elus.map(e => [e.civilite || '', e.sexe || '', e.prenom, e.nom, e.role, e.liste || '', e.email || '', e.telephone || '', (e.delegations || []).join(' ; ')])
    );
  };

  const doImport = async () => {
    if (!uploadFile) { alert('Sélectionner un fichier'); return; }
    setImporting(true); setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      const res = await axios.post('/api/ville/elus/import', fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data);
      setUploadFile(null);
      load();
    } catch (e: any) { alert('Erreur import: ' + (e.response?.data?.message || e.message)); }
    finally { setImporting(false); }
  };

  const setDelegation = (i: number, value: string) => setForm(f => { const d = [...(f.delegations || [])]; d[i] = value; return { ...f, delegations: d }; });
  const addDelegation = () => setForm(f => ({ ...f, delegations: [...(f.delegations || []), ''] }));
  const removeDelegation = (i: number) => setForm(f => ({ ...f, delegations: (f.delegations || []).filter((_, idx) => idx !== i) }));

  return (
    <>
      {/* Barre d'actions */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="file" accept=".xlsx,.xls" onChange={e => setUploadFile(e.target.files?.[0] || null)} disabled={importing}
          style={{ padding: 7, borderRadius: 6, border: '1px solid #d1d5db', opacity: importing ? 0.5 : 1 }} />
        <button style={{ ...s.btn('primary'), opacity: importing ? 0.6 : 1 }} onClick={doImport} disabled={importing}>
          <Upload size={15} /> {importing ? 'Import en cours…' : 'Importer Excel'}
        </button>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>Écrase toutes les données existantes</span>
        {importResult && <span style={{ fontSize: 13, fontWeight: 600, color: '#16a34a' }}>✓ {importResult.imported} élu(s) importé(s)</span>}
        <button style={s.btn('primary')} onClick={doExport} disabled={elus.length === 0}>
          <Upload size={15} style={{ transform: 'rotate(180deg)' }} /> Export CSV
        </button>
        <button style={s.btn('success')} onClick={openCreate}><Plus size={16} /> Ajouter un élu</button>
      </div>

      <table style={s.table}>
        <thead><tr>
          {['Nom', 'Rôle', 'Délégations', 'Email', 'Téléphone', 'Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}
        </tr></thead>
        <tbody>
          {elus.map(e => (
            <tr key={e.id}>
              <td style={s.td}><strong>{e.civilite ? `${e.civilite} ` : ''}{e.prenom} {e.nom}</strong></td>
              <td style={s.td}><span style={s.badge('#8b5cf6')}>{e.role}</span></td>
              <td style={{ ...s.td, maxWidth: 420 }}>
                {(e.delegations && e.delegations.length > 0)
                  ? <span title={(e.delegations || []).join('\n')}>{(e.delegations || []).join(' · ')}</span>
                  : <span style={{ color: '#cbd5e1' }}>—</span>}
              </td>
              <td style={s.td}><code style={{ fontSize: 12 }}>{e.email || '—'}</code></td>
              <td style={s.td}>{e.telephone || '—'}</td>
              <td style={{ ...s.td, display: 'flex', gap: 6 }}>
                <button style={{ ...s.btn('warning'), padding: '5px 9px' }} onClick={() => openEdit(e)}><Edit2 size={15} /></button>
                <button style={{ ...s.btn('danger'), padding: '5px 9px' }} onClick={() => remove(e.id)}><Trash2 size={15} /></button>
              </td>
            </tr>
          ))}
          {elus.length === 0 && !loading && <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', padding: 30, color: '#9ca3af' }}>Aucun élu</td></tr>}
        </tbody>
      </table>

      {modalOpen && (
        <div onClick={() => setModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 620, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{editingId ? 'Modifier un élu' : 'Ajouter un élu'}</h3>
              <button onClick={() => setModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
            </div>

            <div style={s.grid}>
              <label style={s.field}>Civilité
                <select style={s.input} value={form.civilite || 'M.'} onChange={e => setForm({ ...form, civilite: e.target.value, sexe: e.target.value === 'Mme' ? 'F' : 'M' })}>
                  <option value="M.">M.</option>
                  <option value="Mme">Mme</option>
                </select>
              </label>
              <label style={s.field}>Sexe
                <select style={s.input} value={form.sexe || ''} onChange={e => setForm({ ...form, sexe: e.target.value })}>
                  <option value="">—</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </label>
              <label style={s.field}>Prénom<input style={s.input} value={form.prenom || ''} onChange={e => setForm({ ...form, prenom: e.target.value })} /></label>
              <label style={s.field}>Nom<input style={s.input} value={form.nom || ''} onChange={e => setForm({ ...form, nom: e.target.value })} /></label>
              <label style={s.field}>Email<input style={s.input} type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
              <label style={s.field}>Téléphone<input style={s.input} value={form.telephone || ''} onChange={e => setForm({ ...form, telephone: e.target.value })} /></label>
              <label style={s.field}>Rôle
                <select style={s.input} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label style={s.field}>Liste (politique)<input style={s.input} value={form.liste || ''} onChange={e => setForm({ ...form, liste: e.target.value })} /></label>
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Délégations (plusieurs possibles)</span>
                <button type="button" onClick={addDelegation} style={{ ...s.btn('primary'), padding: '4px 10px', fontSize: 12 }}><Plus size={13} /> Ajouter</button>
              </div>
              {(form.delegations || []).length === 0 && <div style={{ fontSize: 12.5, color: '#94a3b8', fontStyle: 'italic' }}>Aucune délégation.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(form.delegations || []).map((d, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6 }}>
                    <input style={{ ...s.input, flex: 1 }} value={d} onChange={e => setDelegation(i, e.target.value)} placeholder="Ex. Politiques culturelles" />
                    <button type="button" onClick={() => removeDelegation(i)} style={{ ...s.btn('danger'), padding: '0 10px' }}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setModalOpen(false)} style={s.btn('warning')}>Annuler</button>
              <button onClick={save} disabled={saving} style={{ ...s.btn('success'), opacity: saving ? 0.6 : 1 }}>
                <Save size={15} /> {saving ? 'Enregistrement…' : (editingId ? 'Enregistrer' : 'Créer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const s: any = {
  table: { width: '100%', borderCollapse: 'collapse' as const, background: '#fff', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' },
  th: { padding: '10px 12px', textAlign: 'left' as const, fontSize: 12, fontWeight: 700, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase' as const },
  td: { padding: '10px 12px', fontSize: 14, color: '#1f2937', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' as const },
  btn: (variant: 'primary' | 'success' | 'danger' | 'warning' = 'primary'): React.CSSProperties => {
    const colors: Record<string, string> = { primary: '#0ea5e9', success: '#22c55e', danger: '#ef4444', warning: '#f59e0b' };
    return { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', border: 'none', borderRadius: 8, cursor: 'pointer', background: colors[variant], color: '#fff', fontWeight: 600, fontSize: 14 };
  },
  badge: (color: string): React.CSSProperties => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: color + '20', color }),
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  field: { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.03em' },
  input: { display: 'block', width: '100%', boxSizing: 'border-box' as const, marginTop: 6, padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, fontFamily: 'inherit' },
};
