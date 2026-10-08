import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, Paperclip, Plus, Trash2, FileText, MessageSquare, Edit2, X } from 'lucide-react';
import DemandeCommentsModal from './DemandeCommentsModal';

interface Piece { id: number; file_path: string; file_name: string; size: number | null; }
interface Demande {
  id: number;
  designation: string;
  description: string;
  montant: number;
  demandeur_username: string;
  statut: string;
  valide_par: string | null;
  valide_fonction: string | null;
  valide_at: string | null;
  valide_commentaire: string | null;
  created_at: string;
  pieces: Piece[];
  commande_roo: string | null;
  commande_numero: string | null;
  commande_libelle: string | null;
  commande_montant: number | null;
  commande_tiers: string | null;
  comment_count?: number;
  modifie_par?: string | null;
  modifie_at?: string | null;
}
interface SeditCommande {
  ROO: string; NUMERO: string; DATE_COMMANDE: string | null; MONTANT_TTC: number | null;
  LIBELLE: string | null; TIERS_NOM: string | null; SERVICE: string | null;
}
interface Validateur { username: string; fonction: 'directeur' | 'raf'; }
interface Me { can_validate: boolean; fonction: string | null; can_manage: boolean; can_delete: boolean; }

const STATUT_LABELS: Record<string, { label: string; color: string }> = {
  devis_pris_en_compte: { label: 'Devis pris en compte', color: '#d97706' },
  validee: { label: 'Validée', color: '#16a34a' },
};

const s: Record<string, React.CSSProperties> = {
  card: { background: 'var(--card-bg, #fff)', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem' },
  input: { width: '100%', padding: '0.5rem 0.7rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.9rem', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: 4 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' },
  th: { textAlign: 'left', padding: '0.6rem', fontSize: '0.75rem', color: '#64748b', borderBottom: '1px solid #e2e8f0' },
  td: { padding: '0.6rem', fontSize: '0.88rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' },
};

const fmtMoney = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

const DemandesCommandeTab: React.FC = () => {
  const { token, user } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [me, setMe] = useState<Me>({ can_validate: false, fonction: null, can_manage: false, can_delete: false });
  const [validateurs, setValidateurs] = useState<Validateur[]>([]);
  const [form, setForm] = useState({ designation: '', description: '', montant: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newVal, setNewVal] = useState<Validateur>({ username: '', fonction: 'directeur' });

  // Fil de commentaires (dès le devis pris en compte) et édition d'une demande
  const [commentsFor, setCommentsFor] = useState<Demande | null>(null);
  const [editFor, setEditFor] = useState<Demande | null>(null);
  const [editForm, setEditForm] = useState({ designation: '', description: '', montant: '' });
  const [editRemove, setEditRemove] = useState<number[]>([]);
  const [editFiles, setEditFiles] = useState<File[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Le demandeur modifie tant que rien n'est validé ; gestionnaires et validateurs à tout moment.
  const canEditDemande = (d: Demande) => me.can_manage || me.can_validate || (d.demandeur_username === user?.username && d.statut === 'devis_pris_en_compte');

  const openEdit = (d: Demande) => {
    setEditFor(d);
    setEditForm({ designation: d.designation, description: d.description || '', montant: String(d.montant) });
    setEditRemove([]);
    setEditFiles([]);
    setEditError('');
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFor) return;
    setEditError('');
    const fd = new FormData();
    fd.append('designation', editForm.designation);
    fd.append('description', editForm.description);
    fd.append('montant', editForm.montant);
    fd.append('remove_piece_ids', JSON.stringify(editRemove));
    editFiles.forEach(f => fd.append('files', f));
    setEditSaving(true);
    try {
      await axios.put(`/api/demandes-commande/${editFor.id}`, fd, { headers });
      setEditFor(null);
      await load();
    } catch (err: any) {
      setEditError(err.response?.data?.message || 'Erreur lors de la modification');
    } finally {
      setEditSaving(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const [d, m, v] = await Promise.all([
        axios.get<Demande[]>('/api/demandes-commande', { headers }),
        axios.get<Me>('/api/demandes-commande/me', { headers }),
        axios.get<Validateur[]>('/api/demandes-commande/validateurs', { headers }),
      ]);
      setDemandes(d.data);
      setMe(m.data);
      setValidateurs(v.data);
    } catch (e) {
      console.error('Erreur chargement demandes de commande', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Lien d'une notification de mention : ouvre directement le fil de la demande
  const [deepLinked, setDeepLinked] = useState(false);
  useEffect(() => {
    if (deepLinked || demandes.length === 0) return;
    const id = parseInt(new URLSearchParams(window.location.search).get('demande') || '', 10);
    if (id) {
      const d = demandes.find(x => x.id === id);
      if (d) setCommentsFor(d);
    }
    setDeepLinked(true);
  }, [demandes, deepLinked]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!files.length) { setError('Joignez au moins un devis.'); return; }
    const fd = new FormData();
    fd.append('designation', form.designation);
    fd.append('description', form.description);
    fd.append('montant', form.montant);
    files.forEach(f => fd.append('files', f));
    setSaving(true);
    try {
      await axios.post('/api/demandes-commande', fd, { headers });
      setForm({ designation: '', description: '', montant: '' });
      setFiles([]);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de l’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const [validating, setValidating] = useState<Demande | null>(null);
  const [commentaire, setCommentaire] = useState('');

  const openValidate = (d: Demande) => { setValidating(d); setCommentaire(''); };

  const confirmValidate = async () => {
    if (!validating) return;
    try {
      await axios.post(`/api/demandes-commande/${validating.id}/validate`, { commentaire }, { headers });
      setValidating(null);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de la validation');
    }
  };

  const remove = async (d: Demande) => {
    if (!window.confirm(`Supprimer définitivement la demande « ${d.designation} » et ses devis ?`)) return;
    try {
      await axios.delete(`/api/demandes-commande/${d.id}`, { headers });
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de la suppression');
    }
  };

  const addValidateur = async () => {
    if (!newVal.username.trim()) return;
    await axios.post('/api/demandes-commande/validateurs', newVal, { headers });
    setNewVal({ ...newVal, username: '' });
    load();
  };

  const removeValidateur = async (username: string) => {
    await axios.delete(`/api/demandes-commande/validateurs/${encodeURIComponent(username)}`, { headers });
    load();
  };

  // Association d'une commande Sedit à une demande validée
  const canAssociate = me.can_validate || me.can_manage;
  const [assocFor, setAssocFor] = useState<Demande | null>(null);
  const [commandes, setCommandes] = useState<SeditCommande[]>([]);
  const [cmdSearch, setCmdSearch] = useState('');
  const [cmdLoading, setCmdLoading] = useState(false);
  const [cmdError, setCmdError] = useState('');

  const loadCommandes = async (search: string) => {
    setCmdLoading(true);
    setCmdError('');
    try {
      const r = await axios.get<SeditCommande[]>('/api/demandes-commande/sedit-commandes', { headers, params: { search } });
      setCommandes(r.data);
    } catch (err: any) {
      setCmdError(err.response?.data?.message || 'Erreur de lecture des commandes Sedit');
    } finally {
      setCmdLoading(false);
    }
  };

  const openAssoc = (d: Demande) => {
    setAssocFor(d);
    setCmdSearch('');
    setCommandes([]);
    loadCommandes('');
  };

  const associer = async (c: SeditCommande) => {
    if (!assocFor) return;
    try {
      await axios.post(`/api/demandes-commande/${assocFor.id}/commande`, { roo: c.ROO }, { headers });
      setAssocFor(null);
      await load();
    } catch (err: any) {
      setCmdError(err.response?.data?.message || 'Erreur lors de l’association');
    }
  };

  const aValider = demandes.filter(d => d.statut === 'devis_pris_en_compte');
  const validees = demandes.filter(d => d.statut === 'validee');

  const renderTable = (rows: Demande[], withAction: boolean, withCommande = false) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={s.th}>Date</th>
          <th style={s.th}>Demandeur</th>
          <th style={s.th}>Désignation</th>
          <th style={s.th}>Montant TTC</th>
          <th style={s.th}>Devis</th>
          <th style={s.th}>Statut</th>
          <th style={s.th}>Échanges</th>
          {withCommande && <th style={s.th}>Commande Sedit</th>}
          {withAction && <th style={s.th}></th>}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td style={{ ...s.td, color: '#94a3b8' }} colSpan={7 + (withAction ? 1 : 0) + (withCommande ? 1 : 0)}>Aucune demande.</td></tr>
        )}
        {rows.map(d => {
          const st = STATUT_LABELS[d.statut] || { label: d.statut, color: '#64748b' };
          return (
            <tr key={d.id}>
              <td style={s.td}>{new Date(d.created_at).toLocaleDateString('fr-FR')}</td>
              <td style={s.td}>{d.demandeur_username}</td>
              <td style={s.td}>
                <div style={{ fontWeight: 600 }}>{d.designation}</div>
                {d.description && <div style={{ color: '#64748b', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{d.description}</div>}
                {d.modifie_at && <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>modifiée par {d.modifie_par} le {new Date(d.modifie_at).toLocaleDateString('fr-FR')}</div>}
              </td>
              <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{fmtMoney(d.montant)}</td>
              <td style={s.td}>
                {d.pieces.map(p => (
                  <div key={p.id}>
                    <a href={`/${p.file_path}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <FileText size={13} /> {p.file_name}
                    </a>
                  </div>
                ))}
              </td>
              <td style={s.td}>
                <span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span>
                {d.valide_par && (
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    par {d.valide_par}{d.valide_fonction ? ` (${d.valide_fonction.toUpperCase()})` : ''}
                    {d.valide_at ? ` le ${new Date(d.valide_at).toLocaleDateString('fr-FR')}` : ''}
                  </div>
                )}
                {d.valide_commentaire && (
                  <div style={{ fontSize: '0.78rem', color: '#475569', fontStyle: 'italic', whiteSpace: 'pre-wrap', marginTop: 2 }}>« {d.valide_commentaire} »</div>
                )}
              </td>
              <td style={s.td}>
                <button type="button" onClick={() => setCommentsFor(d)} title="Commenter, mentionner (@) et répondre"
                  style={{ ...s.btn, background: (d.comment_count || 0) > 0 ? '#0ea5e9' : '#64748b', padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}>
                  <MessageSquare size={14} /> {(d.comment_count || 0) > 0 ? d.comment_count : 'Commenter'}
                </button>
              </td>
              {withCommande && (
                <td style={s.td}>
                  {d.commande_numero && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontWeight: 600 }}>{d.commande_numero}</div>
                      <div style={{ color: '#64748b', fontSize: '0.78rem' }}>
                        {d.commande_libelle}{d.commande_tiers ? ` — ${d.commande_tiers}` : ''}
                        {d.commande_montant != null ? ` — ${fmtMoney(Number(d.commande_montant))}` : ''}
                      </div>
                    </div>
                  )}
                  {canAssociate && (
                    <button style={{ ...s.btn, padding: '0.35rem 0.7rem', fontSize: '0.8rem' }} onClick={() => openAssoc(d)}>
                      {d.commande_numero ? 'Changer la commande' : 'Associer une commande'}
                    </button>
                  )}
                </td>
              )}
              {withAction && (
                <td style={s.td}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {canEditDemande(d) && (
                      <button style={{ ...s.btn, background: '#475569' }} onClick={() => openEdit(d)} title="Modifier la demande">
                        <Edit2 size={15} /> Modifier
                      </button>
                    )}
                    {me.can_validate && d.statut === 'devis_pris_en_compte' && (
                      <button style={{ ...s.btn, background: '#16a34a' }} onClick={() => openValidate(d)}>
                        <CheckCircle size={15} /> Valider
                      </button>
                    )}
                    {me.can_delete && (
                      <button style={{ ...s.btn, background: '#dc2626' }} onClick={() => remove(d)} title="Supprimer la demande">
                        <Trash2 size={15} /> Supprimer
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <form onSubmit={submit} style={s.card}>
        <h3 style={{ marginTop: 0 }}>Nouvelle demande de commande</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
          <div>
            <label style={s.label}>Désignation *</label>
            <input style={s.input} required value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} />
          </div>
          <div>
            <label style={s.label}>Montant (€ TTC) *</label>
            <input style={s.input} required type="number" min="0" step="0.01" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} />
          </div>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <label style={s.label}>Description</label>
          <textarea style={{ ...s.input, minHeight: 80 }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </div>
        <div style={{ marginTop: '1rem' }}>
          <label style={s.label}><Paperclip size={12} /> Devis (une ou plusieurs pièces) *</label>
          <input type="file" multiple onChange={e => setFiles(Array.from(e.target.files || []))} />
          {files.length > 0 && <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>{files.map(f => f.name).join(', ')}</div>}
        </div>
        {error && <div style={{ color: '#dc2626', marginTop: '0.75rem' }}>{error}</div>}
        <div style={{ marginTop: '1rem' }}>
          <button type="submit" style={s.btn} disabled={saving}><Plus size={15} /> {saving ? 'Envoi…' : 'Envoyer la demande'}</button>
        </div>
      </form>

      <div style={s.card}>
        <h3 style={{ marginTop: 0 }}>Devis pris en compte ({aValider.length})</h3>
        {!me.can_validate && (
          <p style={{ color: '#64748b', fontSize: '0.8rem' }}>Seuls le directeur ou la RAF peuvent valider une demande.</p>
        )}
        {renderTable(aValider, true)}
      </div>

      {validees.length > 0 && (
        <div style={s.card}>
          <h3 style={{ marginTop: 0 }}>Demandes validées ({validees.length})</h3>
          {renderTable(validees, true, true)}
        </div>
      )}

      {commentsFor && (
        <DemandeCommentsModal
          demandeId={commentsFor.id}
          designation={commentsFor.designation}
          canManage={me.can_manage}
          onClose={() => setCommentsFor(null)}
          onChanged={load}
        />
      )}

      {editFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setEditFor(null)}>
          <form onSubmit={saveEdit} style={{ ...s.card, width: 'min(620px, 94vw)', maxHeight: '88vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Modifier la demande</h3>
            {editFor.statut === 'validee' && (
              <p style={{ color: '#b45309', fontSize: '0.8rem', marginTop: 0 }}>Cette demande est déjà validée : toute modification est tracée dans les commentaires.</p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
              <div>
                <label style={s.label}>Désignation *</label>
                <input style={s.input} required value={editForm.designation} onChange={e => setEditForm({ ...editForm, designation: e.target.value })} />
              </div>
              <div>
                <label style={s.label}>Montant (€ TTC) *</label>
                <input style={s.input} required type="number" min="0" step="0.01" value={editForm.montant} onChange={e => setEditForm({ ...editForm, montant: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <label style={s.label}>Description</label>
              <textarea style={{ ...s.input, minHeight: 80 }} value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
            </div>
            <div style={{ marginTop: '1rem' }}>
              <label style={s.label}><Paperclip size={12} /> Devis</label>
              {editFor.pieces.map(p => {
                const removed = editRemove.includes(p.id);
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', opacity: removed ? 0.45 : 1 }}>
                    <FileText size={13} /> <span style={{ textDecoration: removed ? 'line-through' : 'none' }}>{p.file_name}</span>
                    <button type="button" title={removed ? 'Conserver' : 'Retirer ce devis'} onClick={() => setEditRemove(removed ? editRemove.filter(i => i !== p.id) : [...editRemove, p.id])}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: removed ? '#16a34a' : '#dc2626' }}>
                      {removed ? 'annuler' : <X size={14} />}
                    </button>
                  </div>
                );
              })}
              <div style={{ marginTop: 6 }}>
                <label style={{ ...s.label, fontWeight: 500 }}>Ajouter des devis</label>
                <input type="file" multiple onChange={e => setEditFiles(Array.from(e.target.files || []))} />
              </div>
            </div>
            {editError && <div style={{ color: '#dc2626', marginTop: '0.75rem' }}>{editError}</div>}
            <div style={{ marginTop: '1rem', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={{ ...s.btn, background: '#64748b' }} onClick={() => setEditFor(null)}>Annuler</button>
              <button type="submit" style={s.btn} disabled={editSaving}>{editSaving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </form>
        </div>
      )}

      {validating && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setValidating(null)}
        >
          <div style={{ ...s.card, width: 'min(520px, 94vw)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Valider la demande</h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0 }}>
              <b>{validating.designation}</b> — {fmtMoney(validating.montant)} TTC
            </p>
            <label style={s.label}>Commentaire (facultatif)</label>
            <textarea style={{ ...s.input, minHeight: 90 }} autoFocus value={commentaire} onChange={e => setCommentaire(e.target.value)} />
            <div style={{ marginTop: '1rem', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={{ ...s.btn, background: '#64748b' }} onClick={() => setValidating(null)}>Annuler</button>
              <button style={{ ...s.btn, background: '#16a34a' }} onClick={confirmValidate}><CheckCircle size={15} /> Confirmer la validation</button>
            </div>
          </div>
        </div>
      )}

      {assocFor && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setAssocFor(null)}
        >
          <div style={{ ...s.card, width: 'min(960px, 94vw)', maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Associer une commande Sedit</h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0 }}>
              Demande : <b>{assocFor.designation}</b> ({fmtMoney(assocFor.montant)}) — les 20 dernières commandes de la DSI dans Sedit (services BF*) ; utilisez la recherche pour en retrouver une plus ancienne.
            </p>
            <form onSubmit={e => { e.preventDefault(); loadCommandes(cmdSearch.trim()); }} style={{ display: 'flex', gap: 8, marginBottom: '0.75rem' }}>
              <input style={s.input} placeholder="N° de commande ou libellé…" value={cmdSearch} onChange={e => setCmdSearch(e.target.value)} />
              <button type="submit" style={s.btn}>Rechercher</button>
            </form>
            {cmdError && <div style={{ color: '#dc2626', marginBottom: 8 }}>{cmdError}</div>}
            {cmdLoading ? <div style={{ color: '#64748b' }}>Chargement…</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={s.th}>N°</th><th style={s.th}>Date</th><th style={s.th}>Libellé</th>
                    <th style={s.th}>Tiers</th><th style={s.th}>Service</th><th style={s.th}>Montant TTC</th><th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {commandes.length === 0 && <tr><td style={{ ...s.td, color: '#94a3b8' }} colSpan={7}>Aucune commande.</td></tr>}
                  {commandes.map(c => (
                    <tr key={c.ROO}>
                      <td style={{ ...s.td, fontWeight: 600 }}>{c.NUMERO}</td>
                      <td style={s.td}>{c.DATE_COMMANDE}</td>
                      <td style={s.td}>{c.LIBELLE}</td>
                      <td style={s.td}>{(c.TIERS_NOM || '').trim()}</td>
                      <td style={s.td}>{c.SERVICE}</td>
                      <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{c.MONTANT_TTC != null ? fmtMoney(c.MONTANT_TTC) : ''}</td>
                      <td style={s.td}><button style={{ ...s.btn, padding: '0.35rem 0.7rem', fontSize: '0.8rem' }} onClick={() => associer(c)}>Associer</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: '1rem', textAlign: 'right' }}>
              <button style={{ ...s.btn, background: '#64748b' }} onClick={() => setAssocFor(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {me.can_manage && (
        <div style={s.card}>
          <h3 style={{ marginTop: 0 }}>Validateurs autorisés</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <input style={{ ...s.input, width: 220 }} placeholder="Identifiant (username)" value={newVal.username} onChange={e => setNewVal({ ...newVal, username: e.target.value })} />
            <select style={{ ...s.input, width: 140 }} value={newVal.fonction} onChange={e => setNewVal({ ...newVal, fonction: e.target.value as 'directeur' | 'raf' })}>
              <option value="directeur">Directeur</option>
              <option value="raf">RAF</option>
            </select>
            <button type="button" style={s.btn} onClick={addValidateur}><Plus size={15} /> Ajouter</button>
          </div>
          {validateurs.map(v => (
            <div key={v.username} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0.25rem 0' }}>
              <span style={{ fontWeight: 600 }}>{v.username}</span>
              <span style={{ color: '#64748b' }}>{v.fonction.toUpperCase()}</span>
              <button type="button" onClick={() => removeValidateur(v.username)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={14} /></button>
            </div>
          ))}
          {validateurs.length === 0 && <div style={{ color: '#94a3b8' }}>Aucun validateur désigné : personne ne peut encore valider.</div>}
        </div>
      )}
    </div>
  );
};

export default DemandesCommandeTab;
