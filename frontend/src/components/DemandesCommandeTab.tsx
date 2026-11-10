import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, Paperclip, Plus, Trash2, FileText, MessageSquare, Edit2, X, Archive, ChevronDown, ChevronRight, Truck, MoreHorizontal } from 'lucide-react';
import DemandeCommentsModal from './DemandeCommentsModal';
import { openAttachmentViewer } from './AttachmentViewer';
import AgentPickerRH, { type AgentRef } from './parapheur/AgentPickerRH';
import AgentPresenceBadge from './AgentPresenceBadge';

interface Piece { id: number; file_path: string; file_name: string; size: number | null; categorie?: string; uploaded_by?: string | null; }
interface Demande {
  id: number;
  designation: string;
  description: string;
  montant: number;
  section?: 'F' | 'I' | null;
  demandeur_username: string;
  demandeur_name?: string | null;
  demandeur_email?: string | null;
  service?: string | null;
  statut: string;
  valide_par: string | null;
  valide_fonction: string | null;
  valide_at: string | null;
  valide_commentaire: string | null;
  created_at: string;
  pieces: Piece[];
  commande_roo: string | null;
  commande_numero: string | null;
  commande_etat?: 'brouillon' | 'en_validation' | 'validee' | 'signee' | 'envoyee' | null;
  commande_envoyee_at?: string | null;
  envoye_manuel?: boolean; // marquée « déjà envoyée » à la main
  commande_libelle: string | null;
  commande_montant: number | null;
  commande_tiers: string | null;
  comment_count?: number;
  modifie_par?: string | null;
  modifie_at?: string | null;
  // Facture(s) Sedit associées à la commande ; `archived` = facture mandatée → commande archivée
  facture_etat?: 'recue' | 'service_fait' | 'mandatee' | 'refusee' | null;
  factures?: string[];
  archived?: boolean;
}
interface SeditCommande {
  ROO: string; NUMERO: string; DATE_COMMANDE: string | null; MONTANT_TTC: number | null;
  LIBELLE: string | null; TIERS_NOM: string | null; SERVICE: string | null;
}
interface Validateur { username: string; fonction: 'directeur' | 'raf'; }
interface Me { can_validate: boolean; fonction: string | null; can_manage: boolean; can_delete: boolean; }

const STATUT_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  devis_pris_en_compte: { label: 'Devis pris en compte', bg: '#fef3c7', fg: '#92400e' },
  validee: { label: 'Validée', bg: '#dcfce7', fg: '#166534' },
};

const s: Record<string, React.CSSProperties> = {
  card: { background: 'var(--card-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: 10, padding: '1rem 1.25rem' },
  input: { width: '100%', padding: '0.45rem 0.65rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.875rem', boxSizing: 'border-box', color: '#111827', background: '#fff' },
  label: { display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#4b5563', marginBottom: 4 },
  // Bouton principal (une seule couleur d'accent) et bouton discret pour les actions secondaires
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.42rem 0.85rem', border: 'none', borderRadius: 6, background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' },
  btnGhost: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.3rem 0.65rem', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontWeight: 500, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' },
  th: { textAlign: 'left', padding: '0.55rem 0.7rem', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#4b5563', background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '0.65rem 0.7rem', fontSize: '0.85rem', color: '#374151', borderBottom: '1px solid #f1f3f5', verticalAlign: 'top' },
  pill: { display: 'inline-block', borderRadius: 999, padding: '2px 9px', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' },
};

const COMMANDE_ETATS: Record<string, { label: string; bg: string; fg: string }> = {
  brouillon: { label: 'Brouillon', bg: '#f3f4f6', fg: '#374151' },
  en_validation: { label: 'En validation', bg: '#fef3c7', fg: '#92400e' },
  validee: { label: 'Validée (bon édité)', bg: '#e0f2fe', fg: '#075985' },
  signee: { label: 'Bon signé', bg: '#dcfce7', fg: '#166534' },
  envoyee: { label: 'Envoyée au fournisseur', bg: '#dbeafe', fg: '#1e40af' },
};

const EtatCommande: React.FC<{ d: Demande }> = ({ d }) => {
  if (d.envoye_manuel && !d.commande_numero) {
    return (
      <span title={d.commande_envoyee_at ? `Marquée envoyée le ${new Date(d.commande_envoyee_at).toLocaleDateString('fr-FR')}` : undefined}
        style={{ ...s.pill, background: COMMANDE_ETATS.envoyee.bg, color: COMMANDE_ETATS.envoyee.fg }}>Envoyée (marquée à la main)</span>
    );
  }
  if (!d.commande_numero) return null;
  const e = d.commande_etat ? COMMANDE_ETATS[d.commande_etat] : null;
  if (!e) return null;
  return (
    <span title={d.commande_envoyee_at ? `Envoyée le ${new Date(d.commande_envoyee_at).toLocaleDateString('fr-FR')}` : undefined}
      style={{ ...s.pill, background: e.bg, color: e.fg }}>{e.label}</span>
  );
};

// Documents ajoutés après l'envoi de la commande au fournisseur (hors devis)
const DOC_CATEGORIES: Record<string, string> = { bon_livraison: 'Bon de livraison', facture: 'Facture', autre: 'Autre document' };
const isDevis = (p: Piece) => (p.categorie || 'devis') === 'devis';

const fmtMoney = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

const DemandesCommandeTab: React.FC = () => {
  const { token, user } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [me, setMe] = useState<Me>({ can_validate: false, fonction: null, can_manage: false, can_delete: false });
  const [validateurs, setValidateurs] = useState<Validateur[]>([]);
  const [form, setForm] = useState({ designation: '', description: '', montant: '', section: '' });
  const [demandeur, setDemandeur] = useState<AgentRef[]>([]);
  const [service, setService] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newVal, setNewVal] = useState<Validateur>({ username: '', fonction: 'directeur' });

  // Fil de commentaires (dès le devis pris en compte) et édition d'une demande
  const [commentsFor, setCommentsFor] = useState<Demande | null>(null);
  const [editFor, setEditFor] = useState<Demande | null>(null);
  const [editForm, setEditForm] = useState({ designation: '', description: '', montant: '', section: '' });
  const [editRemove, setEditRemove] = useState<number[]>([]);
  const [editFiles, setEditFiles] = useState<File[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Le demandeur modifie tant que rien n'est validé ; gestionnaires et validateurs à tout moment.
  const canEditDemande = (d: Demande) => me.can_manage || me.can_validate || (d.demandeur_username === user?.username && d.statut === 'devis_pris_en_compte');

  const openEdit = (d: Demande) => {
    setEditFor(d);
    setEditForm({ designation: d.designation, description: d.description || '', montant: String(d.montant), section: d.section || '' });
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
    fd.append('section', editForm.section);
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

  // Service par défaut : celui de l'agent connecté (modifiable)
  useEffect(() => {
    axios.get('/api/agents/me', { headers }).then(r => { if (r.data?.service) setService(prev => prev || r.data.service); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (demandeur[0]) { fd.append('demandeur_name', demandeur[0].displayName); fd.append('demandeur_email', demandeur[0].email); }
    fd.append('service', service);
    fd.append('section', form.section);
    files.forEach(f => fd.append('files', f));
    setSaving(true);
    try {
      await axios.post('/api/demandes-commande', fd, { headers });
      setForm({ designation: '', description: '', montant: '', section: '' });
      setDemandeur([]);
      setFiles([]);
      setShowForm(false);
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
  const toutesValidees = demandes.filter(d => d.statut === 'validee');
  // Archive : facture associée mandatée dans Sedit. Envoyées : bon envoyé au fournisseur, facture pas encore mandatée.
  const archives = toutesValidees.filter(d => d.archived);
  const envoyees = toutesValidees.filter(d => !d.archived && d.commande_etat === 'envoyee');
  const validees = toutesValidees.filter(d => !d.archived && d.commande_etat !== 'envoyee');
  const [showArchives, setShowArchives] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const sectionTitle = (label: string, count: number, icon?: React.ReactNode) => (
    <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon}{label}
      <span style={{ ...s.pill, background: '#f3f4f6', color: '#4b5563', fontSize: '0.72rem' }}>{count}</span>
    </h3>
  );

  // Documents (bon de livraison, etc.) d'une commande envoyée
  const [docFor, setDocFor] = useState<Demande | null>(null);
  const [docCat, setDocCat] = useState('bon_livraison');
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [docSaving, setDocSaving] = useState(false);
  const [docError, setDocError] = useState('');

  const marquerEnvoyee = async (d: Demande, envoye: boolean) => {
    const msg = envoye
      ? `Marquer « ${d.designation} » comme déjà envoyée au fournisseur ?\nElle passera dans « Commandes envoyées ».`
      : `Annuler le marquage « déjà envoyée » de « ${d.designation} » ?`;
    if (!window.confirm(msg)) return;
    try { await axios.post(`/api/demandes-commande/${d.id}/envoyee`, { envoye }, { headers }); await load(); }
    catch (err: any) { alert(err.response?.data?.message || 'Erreur lors du changement de statut'); }
  };
  const openDocs = (d: Demande) => { setDocFor(d); setDocCat('bon_livraison'); setDocFiles([]); setDocError(''); };
  const uploadDocs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docFor || !docFiles.length) return;
    const fd = new FormData();
    fd.append('categorie', docCat);
    docFiles.forEach(f => fd.append('files', f));
    setDocSaving(true); setDocError('');
    try {
      await axios.post(`/api/demandes-commande/${docFor.id}/documents`, fd, { headers });
      setDocFor(null);
      await load();
    } catch (err: any) {
      setDocError(err.response?.data?.message || "Erreur lors de l'ajout du document");
    } finally { setDocSaving(false); }
  };
  const removeDoc = async (d: Demande, p: Piece) => {
    if (!window.confirm(`Supprimer le document « ${p.file_name} » ?`)) return;
    try { await axios.delete(`/api/demandes-commande/${d.id}/documents/${p.id}`, { headers }); await load(); }
    catch (err: any) { alert(err.response?.data?.message || 'Erreur lors de la suppression'); }
  };
  const canRemoveDoc = (p: Piece) => me.can_manage || me.can_validate || p.uploaded_by === user?.username;

  // Menu « ⋯ » des actions secondaires (une seule action principale visible par ligne)
  const [menuFor, setMenuFor] = useState<number | null>(null);
  // Détails (description, historique de validation…) repliés par défaut, dépliables ligne par ligne
  const [openRows, setOpenRows] = useState<Set<number>>(new Set());
  const toggleRow = (id: number) => setOpenRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const menuItem: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '0.45rem 0.8rem', border: 'none', background: 'none', textAlign: 'left', fontSize: '0.82rem', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' };

  const renderTable = (rows: Demande[], withAction: boolean, withCommande = false, withDocs = false) => {
    const nbCols = 4 + (withCommande ? 1 : 0) + (withDocs ? 1 : 0) + (withAction ? 1 : 0);
    return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={s.th}>Demande</th>
          <th style={{ ...s.th, textAlign: 'right', width: 110 }}>Montant TTC</th>
          <th style={{ ...s.th, width: 150 }}>Statut</th>
          <th style={{ ...s.th, width: 130 }}>Devis / échanges</th>
          {withCommande && <th style={s.th}>Commande Sedit</th>}
          {withDocs && <th style={s.th}>Documents</th>}
          {withAction && <th style={{ ...s.th, width: 120 }}></th>}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td style={{ ...s.td, color: '#9ca3af' }} colSpan={nbCols}>Aucune demande.</td></tr>
        )}
        {rows.map(d => {
          const st = STATUT_LABELS[d.statut] || { label: d.statut, bg: '#f3f4f6', fg: '#374151' };
          const devis = d.pieces.filter(isDevis);
          const canValidate = me.can_validate && d.statut === 'devis_pris_en_compte';
          const items: { key: string; label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[] = [];
          if (canEditDemande(d)) items.push({ key: 'edit', label: 'Modifier', icon: <Edit2 size={14} />, onClick: () => openEdit(d) });
          if ((me.can_manage || me.can_validate) && d.statut === 'validee' && d.commande_etat !== 'envoyee')
            items.push({ key: 'sent', label: 'Marquer « déjà envoyée »', icon: <Truck size={14} />, onClick: () => marquerEnvoyee(d, true) });
          if ((me.can_manage || me.can_validate) && d.envoye_manuel && !d.archived)
            items.push({ key: 'unsent', label: 'Annuler « envoyée »', icon: <X size={14} />, onClick: () => marquerEnvoyee(d, false) });
          if (me.can_delete) items.push({ key: 'del', label: 'Supprimer', icon: <Trash2 size={14} />, onClick: () => remove(d), danger: true });
          const meta = [new Date(d.created_at).toLocaleDateString('fr-FR'), d.demandeur_name || d.demandeur_username, d.service].filter(Boolean);
          return (
            <tr key={d.id}
              onMouseEnter={(ev) => { ev.currentTarget.style.background = '#f9fafb'; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.background = ''; }}>
              <td style={{ ...s.td, minWidth: 320 }}>
                <div
                  role="button"
                  tabIndex={0}
                  title={canEditDemande(d) ? 'Ouvrir la demande' : 'Voir les échanges'}
                  onClick={() => (canEditDemande(d) ? openEdit(d) : setCommentsFor(d))}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') (canEditDemande(d) ? openEdit(d) : setCommentsFor(d)); }}
                  onMouseEnter={(ev) => { ev.currentTarget.style.textDecoration = 'underline'; }}
                  onMouseLeave={(ev) => { ev.currentTarget.style.textDecoration = 'none'; }}
                  style={{ fontWeight: 600, color: '#111827', cursor: 'pointer' }}>{d.designation}</div>
                <div style={{ color: '#9ca3af', fontSize: '0.74rem', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>{meta.join(' · ')}</span>
                  {d.demandeur_email && <AgentPresenceBadge email={d.demandeur_email} name={d.demandeur_name || ''} size={11} />}
                </div>
                {(d.description || d.valide_par || d.modifie_at) && (
                  <button type="button" onClick={() => toggleRow(d.id)}
                    style={{ border: 'none', background: 'none', padding: 0, marginTop: 4, color: '#6b7280', fontSize: '0.75rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    {openRows.has(d.id) ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Détails
                  </button>
                )}
                {openRows.has(d.id) && (
                  <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: '2px solid #e5e7eb', fontSize: '0.8rem', color: '#4b5563', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {d.description && <div style={{ whiteSpace: 'pre-wrap' }}>{d.description}</div>}
                    {d.valide_par && (
                      <div style={{ color: '#6b7280' }}>
                        Validée par {d.valide_par}{d.valide_fonction ? ` (${d.valide_fonction.toUpperCase()})` : ''}
                        {d.valide_at ? ` le ${new Date(d.valide_at).toLocaleDateString('fr-FR')}` : ''}
                        {d.valide_commentaire ? ` — « ${d.valide_commentaire} »` : ''}
                      </div>
                    )}
                    {d.modifie_at && <div style={{ color: '#9ca3af' }}>Modifiée par {d.modifie_par} le {new Date(d.modifie_at).toLocaleDateString('fr-FR')}</div>}
                  </div>
                )}
              </td>
              <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: '#111827' }}>{fmtMoney(d.montant)}</td>
              <td style={s.td}>
                <span style={{ ...s.pill, background: st.bg, color: st.fg }}>{st.label}</span>
              </td>
              <td style={s.td}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {devis.length > 0 && (
                    <button type="button" title={devis.map(p => p.file_name).join(', ')}
                      onClick={() => openAttachmentViewer(devis.map(p => ({ url: `/${p.file_path}`, name: p.file_name })))}
                      style={s.btnGhost}>
                      <FileText size={14} /> {devis.length}
                    </button>
                  )}
                  <button type="button" onClick={() => setCommentsFor(d)} title="Commenter, mentionner (@) et répondre"
                    style={(d.comment_count || 0) > 0 ? { ...s.btnGhost, background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' } : s.btnGhost}>
                    <MessageSquare size={14} />{(d.comment_count || 0) > 0 ? ` ${d.comment_count}` : ''}
                  </button>
                </div>
              </td>
              {withCommande && (
                <td style={s.td}>
                  {d.commande_numero && (
                    <button type="button" title="Afficher le bon de commande"
                      onClick={() => openAttachmentViewer({ url: `/api/demandes-commande/${d.id}/bon-commande`, name: `Bon de commande ${d.commande_numero}.pdf`, mime: 'application/pdf' })}
                      style={{ border: 'none', background: 'none', padding: 0, fontWeight: 600, color: '#1d4ed8', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}>
                      {d.commande_numero}
                    </button>
                  )}
                  <div style={{ marginTop: 4 }}><EtatCommande d={d} /></div>
                  {d.archived && (d.factures || []).length > 0 && (
                    <div style={{ fontSize: '0.72rem', color: '#166534', marginTop: 4, fontWeight: 600 }} title="Facture mandatée dans Sedit">
                      Facture mandatée : {(d.factures || []).join(', ')}
                    </div>
                  )}
                </td>
              )}
              {withDocs && (
                <td style={s.td}>
                  {(() => {
                    // Documents réduits à une pastille courte (« BL 1 », « Facture ») ; le nom complet est en infobulle
                    const docs = d.pieces.filter(p => !isDevis(p));
                    const countByCat: Record<string, number> = {};
                    docs.forEach(p => { const c = p.categorie || 'autre'; countByCat[c] = (countByCat[c] || 0) + 1; });
                    const seen: Record<string, number> = {};
                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: docs.length ? 6 : 0 }}>
                        {docs.map(p => {
                          const c = p.categorie || 'autre';
                          seen[c] = (seen[c] || 0) + 1;
                          const base = c === 'bon_livraison' ? 'BL' : c === 'facture' ? 'Facture' : 'Document';
                          const label = countByCat[c] > 1 ? `${base} ${seen[c]}` : base;
                          return (
                            <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #e5e7eb', borderRadius: 999, padding: '1px 4px 1px 9px', fontSize: '0.75rem', background: '#fff' }}>
                              <button type="button" title={`${DOC_CATEGORIES[c] || 'Document'} : ${p.file_name}`}
                                onClick={() => openAttachmentViewer([{ url: `/${p.file_path}`, name: p.file_name }])}
                                style={{ border: 'none', background: 'none', padding: 0, color: '#1d4ed8', cursor: 'pointer', fontSize: 'inherit', fontWeight: 600 }}>{label}</button>
                              {canRemoveDoc(p) && (
                                <button type="button" title="Supprimer ce document" onClick={() => removeDoc(d, p)}
                                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, display: 'inline-flex' }}><X size={12} /></button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}
                  <button type="button" onClick={() => openDocs(d)} title="Ajouter un bon de livraison ou un autre document" style={s.btnGhost}>
                    <Plus size={13} /> Document
                  </button>
                </td>
              )}
              {withAction && (
                <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', position: 'relative' }}>
                    {canValidate && (
                      <button style={{ ...s.btn, padding: '0.3rem 0.7rem', fontSize: '0.8rem' }} onClick={() => openValidate(d)}>
                        <CheckCircle size={14} /> Valider
                      </button>
                    )}
                    {items.length > 0 && (
                      <>
                        <button type="button" style={{ ...s.btnGhost, padding: '0.3rem 0.4rem' }} title="Autres actions"
                          onClick={() => setMenuFor(menuFor === d.id ? null : d.id)}>
                          <MoreHorizontal size={16} />
                        </button>
                        {menuFor === d.id && (
                          <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuFor(null)} />
                            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.10)', padding: '0.25rem 0', minWidth: 190, textAlign: 'left' }}>
                              {items.map(it => (
                                <button key={it.key} type="button" style={{ ...menuItem, color: it.danger ? '#b91c1c' : '#374151' }}
                                  onClick={() => { setMenuFor(null); it.onClick(); }}>
                                  {it.icon} {it.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </>
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
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#111827' }}>Demandes de commande</h2>
        <button type="button" style={showForm ? s.btnGhost : s.btn} onClick={() => setShowForm(v => !v)}>
          {showForm ? <><X size={14} /> Fermer</> : <><Plus size={14} /> Nouvelle demande</>}
        </button>
      </div>

      {showForm && (
      <form onSubmit={submit} style={s.card}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 600, color: '#111827' }}>Nouvelle demande de commande</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={s.label}>Désignation *</label>
            <input style={s.input} required value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} />
          </div>
          <div>
            <label style={s.label}>Montant (€ TTC) *</label>
            <input style={s.input} required type="number" min="0" step="0.01" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} />
          </div>
          <div>
            <label style={s.label}>Imputation *</label>
            <select style={s.input} required value={form.section} onChange={e => setForm({ ...form, section: e.target.value })}>
              <option value="">— Choisir —</option>
              <option value="F">Fonctionnement</option>
              <option value="I">Investissement</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <label style={s.label}>Demandeur (laisser vide = vous)</label>
            <AgentPickerRH value={demandeur} token={token} onChange={(v) => setDemandeur(v.slice(-1))} placeholder="Rechercher un agent…" />
          </div>
          <div>
            <label style={s.label}>Service</label>
            <input style={s.input} value={service} onChange={e => setService(e.target.value)} />
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
      )}

      <div style={s.card}>
        {sectionTitle('Devis pris en compte', aValider.length)}
        {!me.can_validate && (
          <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>Seuls le directeur ou la RAF peuvent valider une demande.</p>
        )}
        {renderTable(aValider, true)}
      </div>

      {validees.length > 0 && (
        <div style={s.card}>
          {sectionTitle('Demandes validées', validees.length)}
          {renderTable(validees, true, true)}
        </div>
      )}

      {envoyees.length > 0 && (
        <div style={s.card}>
          {sectionTitle('Commandes envoyées', envoyees.length, <Truck size={16} color="#6b7280" />)}
          <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: 0 }}>
            Commandes transmises au fournisseur, en attente de livraison et de facture. Ajoutez ici les bons de livraison et autres documents.
          </p>
          {renderTable(envoyees, true, true, true)}
        </div>
      )}

      {archives.length > 0 && (
        <div style={s.card}>
          <h3 style={{ margin: showArchives ? '0 0 0.75rem' : 0, fontSize: '0.95rem', fontWeight: 600, color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setShowArchives(!showArchives)}>
            {showArchives ? <ChevronDown size={16} /> : <ChevronRight size={16} />} <Archive size={16} color="#6b7280" /> Archives
            <span style={{ ...s.pill, background: '#f3f4f6', color: '#4b5563', fontSize: '0.72rem' }}>{archives.length}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#6b7280' }}>commandes dont la facture est mandatée dans Sedit</span>
          </h3>
          {showArchives && renderTable(archives, false, true, true)}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setEditFor(null)}>
          <form onSubmit={saveEdit} style={{ ...s.card, width: 'min(620px, 94vw)', maxHeight: '88vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Modifier la demande</h3>
            {editFor.statut === 'validee' && (
              <p style={{ color: '#b45309', fontSize: '0.8rem', marginTop: 0 }}>Cette demande est déjà validée : toute modification est tracée dans les commentaires.</p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={s.label}>Désignation *</label>
                <input style={s.input} required value={editForm.designation} onChange={e => setEditForm({ ...editForm, designation: e.target.value })} />
              </div>
              <div>
                <label style={s.label}>Montant (€ TTC) *</label>
                <input style={s.input} required type="number" min="0" step="0.01" value={editForm.montant} onChange={e => setEditForm({ ...editForm, montant: e.target.value })} />
              </div>
            <div>
              <label style={s.label}>Imputation *</label>
              <select style={s.input} required value={editForm.section} onChange={e => setEditForm({ ...editForm, section: e.target.value })}>
                <option value="">— Choisir —</option>
                <option value="F">Fonctionnement</option>
                <option value="I">Investissement</option>
              </select>
            </div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <label style={s.label}>Description</label>
              <textarea style={{ ...s.input, minHeight: 80 }} value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
            </div>
            {canAssociate && (() => {
              const cur = demandes.find(x => x.id === editFor.id) || editFor;
              return (
                <div style={{ marginTop: '1rem', padding: '0.75rem', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <label style={s.label}>Commande Sedit</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{cur.commande_numero || 'Aucune commande associée'}</span>
                    <EtatCommande d={cur} />
                    <button type="button" style={s.btnGhost} onClick={() => openAssoc(cur)}>
                      {cur.commande_numero ? 'Changer la commande' : 'Associer une commande'}
                    </button>
                  </div>
                </div>
              );
            })()}
            <div style={{ marginTop: '1rem' }}>
              <label style={s.label}><Paperclip size={12} /> Devis</label>
              {editFor.pieces.filter(isDevis).map(p => {
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
              <button type="button" style={s.btnGhost} onClick={() => setEditFor(null)}>Annuler</button>
              <button type="submit" style={s.btn} disabled={editSaving}>{editSaving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </form>
        </div>
      )}

      {docFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setDocFor(null)}>
          <form onSubmit={uploadDocs} style={{ ...s.card, width: 'min(520px, 94vw)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Ajouter un document</h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0 }}>
              <b>{docFor.designation}</b>{docFor.commande_numero ? ` — commande ${docFor.commande_numero}` : ''}
            </p>
            <label style={s.label}>Type de document</label>
            <select style={s.input} value={docCat} onChange={e => setDocCat(e.target.value)}>
              {Object.entries(DOC_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <div style={{ marginTop: '1rem' }}>
              <label style={s.label}><Paperclip size={12} /> Fichier(s) *</label>
              <input type="file" multiple required onChange={e => setDocFiles(Array.from(e.target.files || []))} />
            </div>
            {docError && <div style={{ color: '#dc2626', marginTop: '0.75rem' }}>{docError}</div>}
            <div style={{ marginTop: '1rem', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={s.btnGhost} onClick={() => setDocFor(null)}>Annuler</button>
              <button type="submit" style={s.btn} disabled={docSaving || !docFiles.length}>{docSaving ? 'Envoi…' : 'Ajouter'}</button>
            </div>
          </form>
        </div>
      )}

      {validating && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
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
              <button style={s.btnGhost} onClick={() => setValidating(null)}>Annuler</button>
              <button style={s.btn} onClick={confirmValidate}><CheckCircle size={15} /> Confirmer la validation</button>
            </div>
          </div>
        </div>
      )}

      {assocFor && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
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
                      <td style={s.td}><button style={s.btnGhost} onClick={() => associer(c)}>Associer</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: '1rem', textAlign: 'right' }}>
              <button style={s.btnGhost} onClick={() => setAssocFor(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {me.can_manage && (
        <div style={s.card}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 600, color: '#111827' }}>Validateurs autorisés</h3>
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
