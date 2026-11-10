import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import {
  Search, X, Eye, Plus, Trash2, Mail, Ticket
} from 'lucide-react';
import { useADSearch } from '../utils/useADSearch';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import CreateReunionModal from '../components/CreateReunionModal';
import ReunionDetailModal from '../components/ReunionDetailModal';
import AgentPresenceBadge from '../components/AgentPresenceBadge';

// Affichage uniforme des directions : espaces nettoyés, tout en majuscules
const normDir = (d?: string | null) => (d ? d.trim().replace(/\s+/g, ' ').toUpperCase() : (d as any));
// Affichage : « DIRECTION DE LA COMMUNICATION » → « Direction de la communication » (première lettre en majuscule)
const fmtNom = (v?: string | null): string => {
  const t = String(v ?? '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '';
};

const withDir = <T extends { direction?: string }>(r: T): T => (r && r.direction ? { ...r, direction: normDir(r.direction) } : r);

interface Rencontre {
  id: number;
  titre: string;
  direction: string;
  service?: string;
  date_reunion: string;
  annee: number;
  type: string;
  description: string;
  cout_ttc: number | string;
  charge_cp?: string | null;
  cp_presenti?: string | null;
  projet_id?: number | null;
  user_ref_username?: string | null;
  user_ref_name?: string | null;
  user_ref_email?: string | null;
  arbitrage: string;
  responsable_dsi: string;
  ticket_glpi: string;
  lien_reference: string;
  statut: string;
  annee_validation?: number | null;
  commentaires: string;
  suivi?: string;
  created_at: string;
  participants?: any[];
}

interface DirectionEmail {
  id: number;
  direction: string;
  service?: string;
  email: string;
  created_at: string;
}

interface Reunion {
  id: number;
  titre: string;
  date_reunion: string;
  annee: number;
  lieu?: string;
  description?: string;
  statut: string;
  created_by?: string;
  participants?: ReunionParticipant[];
  demandes?: Rencontre[];
}

interface ReunionParticipant {
  id: number;
  reunion_id: number;
  nom: string;
  prenom?: string;
  email?: string;
  service?: string;
  direction?: string;
  type_presence: 'metier' | 'dsi';
  statut_presence: 'present' | 'excuse' | 'info';
  ad_username?: string;
}

// Découpe le suivi en entrées (« [date - user] ancien → nouveau : texte ») ;
// chaque entrée s'affiche sur 2 lignes : l'en-tête puis le texte du suivi.
const parseSuivi = (suivi?: string | null): { header: string; text: string }[] =>
  String(suivi || '').split(/\n(?=\[\d{2}\/\d{2}\/\d{4})/).map(e => e.trim()).filter(Boolean).map(e => {
    const m = e.match(/^(\[[^\]]+\]\s*(?:[^\n:]*→[^\n:]*)?)(?::\s*|\s+)?([\s\S]*)$/);
    return m ? { header: m[1].trim(), text: m[2].trim() } : { header: '', text: e };
  });

// Montant : vide/null = non renseigné ; 0 = gratuit
const formatCout = (v: number | string | null | undefined, compact = false): string => {
  if (v === null || v === undefined || String(v).trim() === '') return '-';
  const n = Number(v);
  if (Number.isNaN(n)) return '-';
  if (n === 0) return 'Gratuit';
  return compact ? `${n.toFixed(2)}€` : `${n.toFixed(2)} €`;
};

// Contenu du ticket DSIHUB créé depuis une demande : un élément par ligne, libellés en gras (HTML)
const escHtml = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ligneHtml = (label: string, value: unknown) => `<strong>${label} :</strong> ${escHtml(value).replace(/\n/g, '<br>')}`;
const buildTicketContentHtml = (r: Rencontre): string => {
  const bloc1 = [
    ligneHtml('Direction', r.direction),
    r.service ? ligneHtml('Service', r.service) : '',
    ligneHtml('Date réunion', r.date_reunion ? new Date(r.date_reunion).toLocaleDateString('fr-FR') : '-'),
  ].filter(Boolean).join('<br>');
  const bloc2 = [
    r.type ? ligneHtml('Type', r.type) : '',
    r.description ? ligneHtml('Description', r.description) : '',
    r.suivi ? ligneHtml('Suivi', r.suivi) : '',
    formatCout(r.cout_ttc) !== '-' ? ligneHtml('Montant TTC', formatCout(r.cout_ttc, true)) : '',
    r.responsable_dsi ? ligneHtml('Responsable DSI', r.responsable_dsi) : '',
  ].filter(Boolean).join('<br>');
  return `<p>${bloc1}</p><p>${bloc2}</p>`;
};
// Type de ticket DSIHUB : 1 = incident, 2 = demande
const ticketTypeCode = (type?: string | null): number => (String(type || '').toLowerCase().includes('incident') ? 1 : 2);

// Charge pour le chef de projet (CP)
const CHARGES_CP = [
  { value: 'faible', label: 'Faible (1 à 3 j)', short: 'Faible', color: '#16a34a', bg: '#dcfce7' },
  { value: 'moyenne', label: 'Moyenne (4 à 10 j)', short: 'Moyenne', color: '#b45309', bg: '#fef3c7' },
  { value: 'forte', label: 'Forte (+ de 10 j)', short: 'Forte', color: '#b91c1c', bg: '#fee2e2' },
];

const RencontresBudgetaires: React.FC = () => {
  const { token, user } = useAuth();
  const [searchParams] = useSearchParams();

  const [rencontres, setRencontres] = useState<Rencontre[]>([]);
  const [filteredRencontres, setFilteredRencontres] = useState<Rencontre[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtres
  const [selectedDirection, setSelectedDirection] = useState<string>('');
  const [selectedAnnee, setSelectedAnnee] = useState<number | ''>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStatut, setSelectedStatut] = useState<string>('');
  const [selectedTicket, setSelectedTicket] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedCp, setSelectedCp] = useState<string>('');

  // UI
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  // Detail modal
  const [selectedRencontre, setSelectedRencontre] = useState<Rencontre | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editedData, setEditedData] = useState<Partial<Rencontre> | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);

  // Direction emails modal
  const [showEmailsModal, setShowEmailsModal] = useState(false);
  const [directionEmails, setDirectionEmails] = useState<DirectionEmail[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [selectedEmailDirection, setSelectedEmailDirection] = useState<string>('');
  const [selectedEmailService, setSelectedEmailService] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [isAddingEmail, setIsAddingEmail] = useState(false);

  // Réunions
  const [reunions, setReunions] = useState<Reunion[]>([]);
  const [showManageReunions, setShowManageReunions] = useState(false);
  const [showCreateReunionModal, setShowCreateReunionModal] = useState(false);
  const [detailReunionId, setDetailReunionId] = useState<number | null>(null);
  const [directions, setDirections] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [dirServicesMap, setDirServicesMap] = useState<Record<string, string[]>>({});
  const emailAd = useADSearch(token);
  const [handledInitialReunionId, setHandledInitialReunionId] = useState(false);

  const annees = [...new Set(rencontres.map(r => r.annee))].filter(a => a).sort((a, b) => b - a);

  // Directions proposées dans le filtre : uniquement celles liées à l'année sélectionnée
  // À l'arrivée : filtre par défaut sur la dernière année qui contient des demandes (une seule fois)
  const anneeParDefautAppliquee = useRef(false);
  useEffect(() => {
    if (anneeParDefautAppliquee.current || rencontres.length === 0) return;
    anneeParDefautAppliquee.current = true;
    const annees = rencontres.map(r => Number(r.annee)).filter(a => Number.isFinite(a) && a > 0);
    if (annees.length) setSelectedAnnee(Math.max(...annees));
  }, [rencontres]);

  const directionsFiltrees = selectedAnnee
    ? [...new Set(rencontres.filter(r => r.annee === selectedAnnee).map(r => r.direction))]
        .filter((d): d is string => !!d)
        .sort((a, b) => a.localeCompare(b))
    : directions;

  useEffect(() => {
    if (selectedDirection && !directionsFiltrees.includes(selectedDirection)) setSelectedDirection('');
  }, [selectedAnnee, rencontres]); // eslint-disable-line react-hooks/exhaustive-deps
  const statuts = ['demandée', 'planifiée', 'effectuée', 'A arbitrer', 'Validé', 'Refusé', 'terminé'];
  const anneesValidation = [new Date().getFullYear(), new Date().getFullYear() + 1];
  const types = ['incident', 'demande', 'projet', 'autre'];

  // Recherche AD de l'utilisateur de référence (demandeur des tickets créés depuis la demande)
  const adRef = useADSearch(token);
  // Assignation rapide depuis la liste : recherche AD seule, enregistrement immédiat
  const adRow = useADSearch(token);
  const [assignRowId, setAssignRowId] = useState<number | null>(null);
  const closeAssign = () => { setAssignRowId(null); adRow.setQuery(''); adRow.clearResults(); };
  const assignUserRef = async (r: Rencontre, u: { username: string; displayName: string; email: string }) => {
    try {
      const updated = { ...r, user_ref_username: u.username, user_ref_name: u.displayName, user_ref_email: u.email };
      const res = await fetch(`/api/rencontres-budgetaires/${r.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); alert(`Erreur : ${err.error || "Échec de l'assignation"}`); return; }
      const saved = await res.json().catch(() => ({}));
      setRencontres(prev => prev.map(x => x.id === r.id ? updated : x));
    } catch { alert("Erreur lors de l'assignation"); }
    finally { closeAssign(); }
  };

  // Projets : « + Projet » crée un projet simple (mini-projet) lié à la demande, éventuellement sous un projet maître
  type ProjetLite = { id: number; code?: string | null; titre: string; statut?: string | null };
  const [projets, setProjets] = useState<ProjetLite[]>([]);
  const [projetTarget, setProjetTarget] = useState<Rencontre | null>(null);
  const [projetForm, setProjetForm] = useState({ titre: '', description: '', cp: '', sousProjet: false, parentId: '' });
  const [maitres, setMaitres] = useState<ProjetLite[]>([]);
  const [creatingProjet, setCreatingProjet] = useState(false);
  const [projetMode, setProjetMode] = useState<'create' | 'link'>('create');
  const [projetSearch, setProjetSearch] = useState('');
  const [projetLinkId, setProjetLinkId] = useState<number | null>(null);
  const fetchProjets = () => {
    if (!token) return;
    fetch('/api/rencontres-budgetaires/projets', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => setProjets(Array.isArray(d) ? d : []))
      .catch(() => setProjets([]));
  };
  useEffect(() => { fetchProjets(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const projetOf = (id?: number | null) => (id ? projets.find(p => p.id === id) : undefined);
  const openProjetModal = (r: Rencontre) => {
    setProjetTarget(r);
    setProjetMode('create'); setProjetSearch(''); setProjetLinkId(null);
    setProjetForm({ titre: r.titre || '', description: r.description || '', cp: r.cp_presenti || '', sousProjet: false, parentId: '' });
    setMaitres([]);
  };
  // Projets « maîtres » du chef de projet choisi
  useEffect(() => {
    if (!projetTarget || !projetForm.cp) { setMaitres([]); return; }
    fetch(`/api/rencontres-budgetaires/projets-maitres?cp=${encodeURIComponent(projetForm.cp)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => setMaitres(Array.isArray(d) ? d : []))
      .catch(() => setMaitres([]));
  }, [projetTarget, projetForm.cp]); // eslint-disable-line react-hooks/exhaustive-deps
  const creerProjet = async () => {
    if (!projetTarget) return;
    if (!projetForm.titre.trim()) { alert('Le titre du projet est obligatoire'); return; }
    if (projetForm.sousProjet && !projetForm.parentId) { alert('Choisissez le projet maître'); return; }
    setCreatingProjet(true);
    try {
      const res = await fetch(`/api/rencontres-budgetaires/${projetTarget.id}/projet/create`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titre: projetForm.titre.trim(),
          description: projetForm.description,
          chef_projet_username: projetForm.cp || null,
          projet_parent_id: projetForm.sousProjet ? Number(projetForm.parentId) : null,
        })
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { alert(`Erreur : ${out.error || 'Création du projet impossible'}`); return; }
      setRencontres(prev => prev.map(x => x.id === projetTarget.id ? { ...x, projet_id: out.id, cp_presenti: projetForm.cp || x.cp_presenti } : x));
      fetchProjets();
      setProjetTarget(null);
    } catch { alert('Erreur lors de la création du projet'); }
    finally { setCreatingProjet(false); }
  };
  const associerProjet = async () => {
    if (!projetTarget || !projetLinkId) { alert('Choisissez un projet'); return; }
    setCreatingProjet(true);
    try {
      const res = await fetch(`/api/rencontres-budgetaires/${projetTarget.id}/projet`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projet_id: projetLinkId })
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { alert(`Erreur : ${out.error || 'Association impossible'}`); return; }
      setRencontres(prev => prev.map(x => x.id === projetTarget.id ? { ...x, projet_id: projetLinkId } : x));
      setProjetTarget(null);
    } catch { alert('Erreur lors de l\'association du projet'); }
    finally { setCreatingProjet(false); }
  };
  const delierProjet = async (r: Rencontre) => {
    if (!window.confirm('Délier cette demande de son projet ? (le projet n\'est pas supprimé)')) return;
    const res = await fetch(`/api/rencontres-budgetaires/${r.id}/projet`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projet_id: null })
    });
    if (res.ok) setRencontres(prev => prev.map(x => x.id === r.id ? { ...x, projet_id: null } : x));
    else alert('Échec du déliement du projet');
  };

  // Chefs de projet du module Projets (pour le « CP pressenti »)
  const [chefsProjets, setChefsProjets] = useState<{ username: string; display_name: string }[]>([]);
  const cpName = (username?: string | null) =>
    username ? (chefsProjets.find(c => c.username.toLowerCase() === username.toLowerCase())?.display_name || username) : '';
  useEffect(() => {
    if (!token) return;
    fetch('/api/rencontres-budgetaires/chefs-projets', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => setChefsProjets(Array.isArray(d) ? d : []))
      .catch(() => setChefsProjets([]));
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchRencontres();
      fetchReunions();
      fetchDirectionsServices();
    }
  }, [token]);

  useEffect(() => {
    const reunionId = searchParams.get('reunionId');
    if (!handledInitialReunionId && reunionId && reunions.length > 0) {
      const reunion = reunions.find(r => r.id === Number(reunionId));
      if (reunion) {
        openReunionDetail(reunion);
        setHandledInitialReunionId(true);
      }
    }
  }, [reunions, searchParams, handledInitialReunionId]);

  useEffect(() => {
    let filtered = rencontres;

    if (selectedDirection) {
      filtered = filtered.filter(r => r.direction === selectedDirection);
    }
    if (selectedAnnee) {
      filtered = filtered.filter(r => r.annee === selectedAnnee);
    }
    if (selectedStatut) {
      filtered = filtered.filter(r => r.statut === selectedStatut);
    }
    if (selectedCp) {
      filtered = filtered.filter(r => selectedCp === '__none__' ? !r.cp_presenti : (r.cp_presenti || '').toLowerCase() === selectedCp.toLowerCase());
    }
    if (selectedType) {
      filtered = filtered.filter(r => (r.type || '').toLowerCase() === selectedType.toLowerCase());
    }
    if (selectedTicket) {
      filtered = filtered.filter(r => {
        const aTicket = !!String(r.ticket_glpi || '').trim();
        return selectedTicket === 'avec' ? aTicket : !aTicket;
      });
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.titre.toLowerCase().includes(term) ||
        r.direction.toLowerCase().includes(term)
      );
    }

    // Apply sorting
    if (sortConfig) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortConfig.key as keyof Rencontre];
        const bVal = b[sortConfig.key as keyof Rencontre];
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredRencontres(filtered);
  }, [rencontres, selectedDirection, selectedAnnee, selectedStatut, selectedTicket, selectedType, selectedCp, searchTerm, sortConfig]);

  const fetchRencontres = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/rencontres-budgetaires', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setRencontres(Array.isArray(data) ? data.map(withDir) : []);
    } catch (error) {
      console.error('Erreur chargement:', error);
      alert('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRencontre = async (id: number) => {
    if (!window.confirm('Êtes-vous sûr ?')) return;

    try {
      const res = await fetch(`/api/rencontres-budgetaires/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchRencontres();
        if (selectedRencontre?.id === id) setShowDetailModal(false);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Erreur suppression : ${err.message || err.error || res.status}`);
      }
    } catch (err) {
      console.error('Error:', err);
    }
  };

  // Ouvre directement la fiche d'édition (plus de fiche intermédiaire en lecture)
  const openEdit = (r: Rencontre) => {
    setSelectedRencontre(r);
    setEditedData({ ...r });
    setShowDetailModal(true);
  };

  const closeEdit = () => {
    setShowDetailModal(false);
    setEditedData(null);
  };

  const handleEditFieldChange = (field: keyof Rencontre, value: any) => {
    if (editedData) {
      setEditedData({ ...editedData, [field]: value });
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedRencontre || !editedData) return;
    if (editedData.statut === 'Validé' && !editedData.annee_validation) { alert("Veuillez saisir l'année de validation"); return; }

    try {
      setIsEditSaving(true);
      const res = await fetch(`/api/rencontres-budgetaires/${selectedRencontre.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editedData)
      });

      if (res.ok) {
        const saved = await res.json().catch(() => ({}));
        setShowDetailModal(false);
        setEditedData(null);
        fetchRencontres();
        setSelectedRencontre(editedData as Rencontre);
      } else {
        const error = await res.json();
        alert(`Erreur : ${error.error || 'Erreur lors de la sauvegarde'}`);
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setIsEditSaving(false);
    }
  };

  const handleOpenTicket = async (rencontreId: number) => {
    try {
      const res = await fetch(`/api/rencontres-budgetaires/${rencontreId}/ticket-link`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.exists) {
        alert(`${data.message}`);
        setRencontres(prev => prev.map(r => r.id === rencontreId ? { ...r, ticket_glpi: '' } : r));
        if (selectedRencontre?.id === rencontreId) setSelectedRencontre(prev => prev ? { ...prev, ticket_glpi: '' } : null);
        return;
      }
      window.open(data.url, '_blank');
    } catch {
      alert('Impossible de vérifier le ticket');
    }
  };

  const handleCreateTicket = async (rencontre?: Rencontre) => {
    const target = rencontre || selectedRencontre;
    if (!target) return;
    if (target.ticket_glpi) {
      if (!window.confirm(`Un ticket existe déjà (#${target.ticket_glpi}). Créer quand même un nouveau ticket ?`)) return;
    }
    try {
      setIsCreatingTicket(true);
      const content = buildTicketContentHtml(target);

      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `[Rencontres ${target.annee || new Date(target.date_reunion).getFullYear() || ''}] ${target.titre || target.description?.substring(0, 80) || 'Rencontre budgétaire'}`,
          content,
          ...(target.user_ref_email ? { requester_name: target.user_ref_name || target.user_ref_email, requester_email: target.user_ref_email } : {}),
          type: ticketTypeCode(target.type), // 1 = incident, 2 = demande
          urgency: 3,
          priority: 3,
        })
      });
      const result = await res.json();
      if (!res.ok) { alert(`Erreur : ${result.message || 'Échec de la création'}`); return; }

      const ticketId = result.id;
      if (!ticketId) { alert('Ticket créé mais numéro non récupéré'); return; }

      const updateRes = await fetch(`/api/rencontres-budgetaires/${target.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, ticket_glpi: String(ticketId) })
      });
      if (updateRes.ok) {
        const updated = { ...target, ticket_glpi: String(ticketId) };
        setSelectedRencontre(prev => (prev && prev.id === updated.id ? updated : prev));
        setRencontres(prev => prev.map(r => r.id === updated.id ? updated : r));
      } else {
        alert(`Ticket DSIHUB #${ticketId} créé mais erreur lors de la mise à jour en base`);
      }
    } catch (err) {
      console.error('Erreur création ticket:', err);
      alert('Erreur lors de la création du ticket');
    } finally {
      setIsCreatingTicket(false);
    }
  };

  const [statutTarget, setStatutTarget] = useState<Rencontre | null>(null);
  const [statutNew, setStatutNew] = useState('');
  const [statutComment, setStatutComment] = useState('');
  const [statutSaving, setStatutSaving] = useState(false);
  const [statutAnnee, setStatutAnnee] = useState<number | ''>('');

  const saveStatut = async () => {
    if (!statutTarget) return;
    if (statutNew === 'Validé' && !statutAnnee) { alert("Veuillez saisir l'année de validation"); return; }
    setStatutSaving(true);
    try {
      let suivi = statutTarget.suivi || '';
      if (statutComment.trim()) {
        const ligne = `[${new Date().toLocaleDateString('fr-FR')} - ${user?.username || ''}] ${statutTarget.statut || '-'} → ${statutNew} : ${statutComment.trim()}`;
        suivi = suivi ? `${suivi}
${ligne}` : ligne;
      }
      const updated = { ...statutTarget, statut: statutNew, suivi, annee_validation: statutNew === 'Validé' ? Number(statutAnnee) : null };
      const res = await fetch(`/api/rencontres-budgetaires/${statutTarget.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (!res.ok) { alert('Erreur lors du changement de statut'); return; }
      setRencontres(prev => prev.map(r => r.id === updated.id ? updated : r));
      setStatutTarget(null);
    } catch (e) {
      console.error('Erreur changement statut:', e);
      alert('Erreur lors du changement de statut');
    } finally {
      setStatutSaving(false);
    }
  };

  const handleSort = (key: string) => {
    setSortConfig(current => ({
      key,
      direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Fonctions pour gérer les emails des directions
  const fetchDirectionEmails = async () => {
    try {
      setEmailsLoading(true);
      const response = await fetch('/api/direction-emails', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setDirectionEmails(Array.isArray(data) ? data.map(withDir) : []);
    } catch (error) {
      console.error('Erreur chargement emails:', error);
      alert('Erreur lors du chargement des emails');
    } finally {
      setEmailsLoading(false);
    }
  };

  const handleAddEmail = async () => {
    if (!selectedEmailDirection || !newEmail) {
      alert('Direction et email sont obligatoires');
      return;
    }

    try {
      setIsAddingEmail(true);
      const res = await fetch('/api/direction-emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          direction: selectedEmailDirection,
          service: selectedEmailService || null,
          email: newEmail
        })
      });

      if (res.ok) {
        alert('Email ajouté avec succès');
        setNewEmail('');
        fetchDirectionEmails();
      } else {
        const error = await res.json();
        alert(`Erreur : ${error.error}`);
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Erreur lors de l\'ajout de l\'email');
    } finally {
      setIsAddingEmail(false);
    }
  };

  const handleDeleteEmail = async (id: number) => {
    if (!window.confirm('Supprimer cet email ?')) return;

    try {
      const res = await fetch(`/api/direction-emails/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        alert('Email supprimé');
        fetchDirectionEmails();
      } else {
        alert('Erreur suppression');
      }
    } catch (err) {
      console.error('Error:', err);
    }
  };

  // --- Réunions ---

  const fetchDirectionsServices = async () => {
    try {
      const res = await fetch('/api/directions-services', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      setDirections(data.directions || []);
      setServices(data.services || []);
      setDirServicesMap(data.dirServicesMap || {});
    } catch (e) { console.error('Erreur chargement directions/services:', e); }
  };

  const fetchReunions = async () => {
    try {
      const res = await fetch('/api/rencontres-reunions?source=rencontres_budgetaires', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      setReunions(Array.isArray(data) ? data.map((re: any) => ({ ...re, participants: re.participants?.map(withDir), demandes: re.demandes?.map(withDir) })) : []);
    } catch (e) { console.error('Erreur chargement réunions:', e); }
  };

  const openReunionDetail = (reunion: Reunion) => {
    setDetailReunionId(reunion.id);
  };

  const handleDeleteReunion = async (id: number) => {
    if (!window.confirm('Supprimer cette réunion ?')) return;
    await fetch(`/api/rencontres-reunions/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    fetchReunions();
  };

  const generateReunionsFromDemandes = async () => {
    try {
      const res = await fetch('/api/rencontres-reunions/generate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        if (data.reunions_created === 0) {
          alert('Aucune demande non associée trouvée. Toutes les demandes sont déjà attachées à une réunion.');
        } else {
          alert(`${data.reunions_created} réunion(s) générée(s) avec succès!\n${(data.details || []).map((d: any) => `- ${d.direction}: ${d.demandes_associees} demande(s)`).join('\n')}`);
        }
        fetchReunions();
        fetchRencontres();
      } else {
        alert(`Erreur: ${data.error || data.message}`);
      }
    } catch (e) {
      console.error('Erreur génération réunions:', e);
      alert('Erreur lors de la génération des réunions');
    }
  };

  const handleDeleteAllReunions = async () => {
    if (!window.confirm('⚠️ Êtes-vous sûr de vouloir supprimer TOUTES les réunions ?\n\nLes participants, pièces jointes et associations seront également supprimés. Cette action est irréversible !')) return;
    try {
      const res = await fetch('/api/rencontres-reunions', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        alert(`✅ ${data.deleted} réunion(s) supprimée(s)`);
        fetchReunions();
        fetchRencontres();
      } else {
        const err = await res.json();
        alert(`Erreur : ${err.error}`);
      }
    } catch (e) {
      alert('Erreur lors de la suppression');
    }
  };

  const selectADUserForEmail = (user: { username: string; displayName: string; email: string }) => {
    setNewEmail(user.email);
    emailAd.setQuery('');
    emailAd.clearResults();
  };

  const handleDeleteAll = async () => {
    // Confirmation unique
    if (!window.confirm('⚠️ Êtes-vous sûr de vouloir supprimer TOUTES les demandes?\n\nCette action est irréversible!')) {
      return;
    }

    try {
      const res = await fetch('/api/rencontres-budgetaires/delete-all', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          confirm: 'DELETE_ALL_RENCONTRES'
        })
      });

      if (res.ok) {
        const result = await res.json();
        alert(`✅ ${result.deleted} demandes supprimées`);
        fetchRencontres();
      } else {
        const error = await res.json();
        alert(`Erreur : ${error.error}`);
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Erreur lors de la suppression');
    }
  };

  const STATUT_STYLE: Record<string, { bg: string; fg: string }> = {
    'demandée': { bg: '#ede9fe', fg: '#5b21b6' },
    'planifiée': { bg: '#fef3c7', fg: '#92400e' },
    'effectuée': { bg: '#d1fae5', fg: '#065f46' },
    'A arbitrer': { bg: '#e0f2fe', fg: '#075985' },
    'Validé': { bg: '#dcfce7', fg: '#166534' },
    'Refusé': { bg: '#fee2e2', fg: '#991b1b' },
    'terminé': { bg: '#ccfbf1', fg: '#115e59' },
  };
  const statutStyle = (statut: string | null | undefined) => STATUT_STYLE[statut || ''] || { bg: '#f3f4f6', fg: '#374151' };

  const getStatutColor = (statut: string | null | undefined) => {
    switch (statut) {
      case 'demandée': return '#8b5cf6';
      case 'planifiée': return '#f59e0b';
      case 'effectuée': return '#10b981';
      case 'A arbitrer': return '#0ea5e9';
      case 'Validé': return '#15803d';
      case 'Refusé': return '#dc2626';
      case 'terminé': return '#0f766e';
      default: return '#6b7280';
    }
  };


  // Styles sobres partagés
  const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 9px', border: '1px solid #e5e7eb', borderRadius: '999px', fontSize: '12px', color: '#374151', background: 'white', cursor: 'pointer', whiteSpace: 'nowrap' };
  const linkBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'white', border: '1px solid #d1d5db', borderRadius: '6px', padding: '2px 8px', fontSize: '12px', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' };

  return (
    <div style={styles.container}>
      <Header />

      <main style={styles.mainContent}>
        {/* Barre d'outils */}
        <div style={styles.toolbar}>
          <h2 style={styles.title}>Rencontres budgétaires</h2>
          <div style={styles.toolbarActions}>
            <button style={{ ...styles.toolbarBtn, background: '#2563eb', borderColor: '#2563eb', color: 'white' }} onClick={() => setShowManageReunions(v => !v)} title="Gérer les réunions">
              <Plus size={16} />
              <span>Réunions{reunions.length > 0 ? ` (${reunions.length})` : ''}</span>
            </button>
            <button style={{ ...styles.toolbarBtn, color: '#b91c1c', borderColor: '#fecaca' }} onClick={handleDeleteAll} title="Supprimer toutes les demandes (admin)">
              <Trash2 size={16} />
              <span>Supprimer tout</span>
            </button>
          </div>
        </div>

        {/* Filtres */}
        <div style={styles.filterBar}>
          <div style={styles.searchBox}>
            <Search size={15} style={{ opacity: 0.45 }} />
            <input type="text" placeholder="Rechercher…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={styles.searchInput} />
          </div>

          <select value={selectedDirection} onChange={(e) => setSelectedDirection(e.target.value)} style={styles.filterSelect}>
            <option value="">Toutes directions</option>
            {directionsFiltrees.map(d => (<option key={d} value={d}>{fmtNom(d)}</option>))}
          </select>

          <select value={selectedAnnee} onChange={(e) => setSelectedAnnee(e.target.value ? parseInt(e.target.value) : '')} style={styles.filterSelect}>
            <option value="">Toutes années</option>
            {annees.map(a => (<option key={a} value={a}>{a}</option>))}
          </select>

          <select value={selectedStatut} onChange={(e) => setSelectedStatut(e.target.value)} style={styles.filterSelect}>
            <option value="">Tous statuts</option>
            {statuts.map(st => (<option key={st} value={st}>{st.charAt(0).toUpperCase() + st.slice(1)}</option>))}
          </select>

          <select value={selectedTicket} onChange={(e) => setSelectedTicket(e.target.value)} style={styles.filterSelect}>
            <option value="">Avec / sans ticket</option>
            <option value="avec">Avec ticket</option>
            <option value="sans">Sans ticket</option>
          </select>

          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} style={styles.filterSelect}>
            <option value="">Tous types</option>
            {[...new Set([...types, ...rencontres.map(r => (r.type || '').toLowerCase()).filter(Boolean)])].map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>

          <select value={selectedCp} onChange={(e) => setSelectedCp(e.target.value)} style={styles.filterSelect}>
            <option value="">Tous chefs de projet</option>
            <option value="__none__">Sans CP pressenti</option>
            {chefsProjets.map(c => <option key={c.username} value={c.username}>{c.display_name}</option>)}
          </select>

          <button
            style={styles.resetBtn}
            onClick={() => {
              setSelectedDirection(''); setSelectedAnnee(''); setSelectedStatut(''); setSelectedTicket('');
              setSelectedType(''); setSelectedCp(''); setSearchTerm('');
            }}
          >
            Réinitialiser
          </button>
        </div>

        {/* Tableau */}
        <div style={styles.tableContainer}>
          {loading ? (
            <div style={styles.loading}>Chargement…</div>
          ) : filteredRencontres.length === 0 ? (
            <div style={styles.empty}>Aucune donnée</div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.headerRow}>
                  <th style={{ ...styles.th, cursor: 'pointer' }} onClick={() => handleSort('direction')}>
                    Direction {sortConfig?.key === 'direction' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ ...styles.th, cursor: 'pointer' }} onClick={() => handleSort('titre')}>
                    Titre {sortConfig?.key === 'titre' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ ...styles.th, cursor: 'pointer' }} onClick={() => handleSort('date_reunion')}>
                    Date {sortConfig?.key === 'date_reunion' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={styles.th}>Montant TTC</th>
                  <th style={styles.th}>Chef de projet</th>
                  <th style={styles.th}>Demandeur</th>
                  <th style={styles.th}>Suivi</th>
                  <th style={styles.th}>Statut</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {filteredRencontres.map(r => (
                  <tr
                    key={r.id}
                    style={styles.row}
                    onMouseEnter={(ev) => { ev.currentTarget.style.background = '#f5f8ff'; }}
                    onMouseLeave={(ev) => { ev.currentTarget.style.background = ''; }}
                  >
                    <td style={{ ...styles.td, minWidth: '150px' }}>
                      <div style={{ color: '#111827', fontWeight: 600 }}>{fmtNom(r.direction)}</div>
                      {r.service && <div style={{ fontStyle: 'italic', fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{fmtNom(r.service)}</div>}
                    </td>
                    <td
                      style={{ ...styles.td, cursor: 'pointer', color: '#1d4ed8', fontWeight: 600, fontSize: '14px', minWidth: '260px' }}
                      onClick={() => openEdit(r)}
                      onMouseEnter={(ev) => { ev.currentTarget.style.textDecoration = 'underline'; }}
                      onMouseLeave={(ev) => { ev.currentTarget.style.textDecoration = 'none'; }}
                      title={[
                        r.titre,
                        `Direction : ${fmtNom(r.direction) || '-'}${r.service ? ` / ${fmtNom(r.service)}` : ''}`,
                        `Type : ${r.type || '-'}`,
                        r.description ? `\nDescription : ${r.description.length > 400 ? r.description.slice(0, 400) + '…' : r.description}` : '',
                        '\n(Cliquer pour modifier)'
                      ].filter(Boolean).join('\n')}
                    >
                      {r.titre}
                      {r.type && <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 400, color: '#9ca3af' }}>{r.type}</span>}
                    </td>
                    <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                      {r.date_reunion ? new Date(r.date_reunion).toLocaleDateString('fr-FR') : '-'}
                    </td>
                    <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{formatCout(r.cout_ttc, true)}</td>
                    <td style={styles.td}>
                      <div>{cpName(r.cp_presenti) || '-'}</div>
                      {(() => {
                        const c = CHARGES_CP.find(x => x.value === r.charge_cp);
                        return c ? <span style={{ display: 'inline-block', marginTop: '3px', padding: '1px 7px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: c.bg, color: c.color }} title={c.label}>Charge {c.short.toLowerCase()}</span> : null;
                      })()}
                    </td>
                    <td style={styles.td}>
                      {r.user_ref_name || r.user_ref_email ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} title="Cliquer pour modifier" onClick={() => openEdit(r)}>
                          {r.user_ref_name || r.user_ref_email}
                          <AgentPresenceBadge email={r.user_ref_email || ''} name={r.user_ref_name || ''} size={11} />
                        </span>
                      ) : assignRowId === r.id ? (
                        <div style={{ position: 'relative', minWidth: '220px' }}>
                          <input
                            autoFocus
                            style={{ width: '100%', padding: '4px 8px', border: '1px solid #9ca3af', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                            placeholder="Rechercher un agent (AD)…"
                            value={adRow.query}
                            onChange={(ev) => adRow.setQuery(ev.target.value)}
                            onKeyDown={(ev) => { if (ev.key === 'Escape') closeAssign(); }}
                            onBlur={() => setTimeout(closeAssign, 200)}
                          />
                          {adRow.results.length > 0 && (
                            <div style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, background: 'white', border: '1px solid #d1d5db', borderRadius: '6px', maxHeight: '220px', overflowY: 'auto', boxShadow: '0 8px 20px rgba(0,0,0,0.10)' }}>
                              {adRow.results.map(u => (
                                <div key={`${u.username}-${u.email}`}
                                  style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f3f5', fontSize: '12px' }}
                                  onMouseDown={(ev) => { ev.preventDefault(); assignUserRef(r, u); }}>
                                  <strong>{u.displayName}</strong> <span style={{ color: '#6b7280' }}>{u.email}{u.service ? ` · ${u.service}` : ''}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <button style={linkBtn} title="Assigner un demandeur" onClick={() => { adRow.setQuery(''); adRow.clearResults(); setAssignRowId(r.id); }}>+ Demandeur</button>
                      )}
                    </td>
                    <td style={{ ...styles.td, maxWidth: '320px', wordBreak: 'break-word' }} title={r.suivi || ''}>
                      {parseSuivi(r.suivi).length === 0 ? <span style={{ color: '#9ca3af' }}>-</span> : parseSuivi(r.suivi).map((s, i) => (
                        <div key={i} style={{ marginBottom: '4px' }}>
                          {s.header && <div style={{ fontSize: '11px', color: '#6b7280' }}>{s.header}</div>}
                          {s.text && <div style={{ whiteSpace: 'pre-wrap' }}>{s.text}</div>}
                        </div>
                      ))}
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{ ...chip, background: statutStyle(r.statut).bg, color: statutStyle(r.statut).fg, borderColor: statutStyle(r.statut).bg, fontWeight: 600 }}
                        onClick={() => { setStatutTarget(r); setStatutNew(r.statut || statuts[0]); setStatutAnnee(r.annee_validation || new Date().getFullYear()); setStatutComment(''); }}
                        title="Cliquer pour changer le statut"
                      >
                        {r.statut}{r.statut === 'Validé' && r.annee_validation ? ` ${r.annee_validation}` : ''}
                      </span>
                      {statutTarget?.id === r.id && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={() => setStatutTarget(null)}>
                          <div style={{ background: 'white', borderRadius: '10px', padding: '20px', width: '420px', maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600 }}>Changer le statut</h3>
                            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#6b7280' }}>{r.titre.substring(0, 80)}</p>
                            <select value={statutNew} onChange={(e) => setStatutNew(e.target.value)} style={{ ...styles.filterSelect, width: '100%', maxWidth: 'none', marginBottom: '10px' }}>
                              {statuts.map(st => <option key={st} value={st}>{st}</option>)}
                            </select>
                            {statutNew === 'Validé' && (
                              <select value={statutAnnee} onChange={(e) => setStatutAnnee(e.target.value ? parseInt(e.target.value) : '')} style={{ ...styles.filterSelect, width: '100%', maxWidth: 'none', marginBottom: '10px' }}>
                                <option value="">-- Année de validation (obligatoire) --</option>
                                {anneesValidation.map(a => <option key={a} value={a}>{a}{a === anneesValidation[0] ? ' (année en cours)' : ' (année +1)'}</option>)}
                              </select>
                            )}
                            <textarea
                              value={statutComment}
                              onChange={(e) => setStatutComment(e.target.value)}
                              placeholder="Suivi (facultatif)"
                              rows={3}
                              style={{ width: '100%', boxSizing: 'border-box', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontFamily: 'inherit', fontSize: '13px' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                              <button onClick={() => setStatutTarget(null)} style={{ padding: '7px 14px', border: '1px solid #d1d5db', background: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Annuler</button>
                              <button onClick={saveStatut} disabled={statutSaving} style={{ padding: '7px 14px', border: 'none', background: '#2563eb', color: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>{statutSaving ? 'Enregistrement…' : 'Valider'}</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                    <td style={{ ...styles.td, minWidth: '110px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-start' }}>
                        {r.ticket_glpi ? (
                          <button style={{ ...linkBtn, background: '#ede9fe', borderColor: '#c4b5fd', color: '#5b21b6', fontWeight: 600 }} onClick={() => handleOpenTicket(r.id)} title={`Ouvrir le ticket DSIHUB #${r.ticket_glpi}`}>
                            <Ticket size={12} />#{r.ticket_glpi}
                          </button>
                        ) : !r.projet_id ? (
                          <button
                            style={{ ...linkBtn, opacity: isCreatingTicket ? 0.5 : 1 }}
                            disabled={isCreatingTicket}
                            onClick={() => { if (window.confirm(`Créer un ticket DSIHUB pour « ${r.titre.substring(0, 80)} » ?`)) handleCreateTicket(r); }}
                            title="Créer un ticket DSIHUB à partir de cette demande"
                          >+ Ticket</button>
                        ) : null}
                        {r.projet_id ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <button
                              style={{ ...linkBtn, background: '#cffafe', borderColor: '#67e8f9', color: '#155e75', fontWeight: 600, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}
                              onClick={() => window.open(`/projets/${r.projet_id}`, '_blank')}
                              title={`Ouvrir le projet : ${projetOf(r.projet_id)?.titre || '#' + r.projet_id}`}
                            >{projetOf(r.projet_id)?.code || `Projet #${r.projet_id}`}</button>
                            <button style={{ ...styles.iconBtn, fontSize: '13px', color: '#9ca3af' }} onClick={() => delierProjet(r)} title="Délier du projet">×</button>
                          </span>
                        ) : !r.ticket_glpi ? (
                          <button style={linkBtn} onClick={() => openProjetModal(r)} title="Créer un projet simple lié à cette demande">+ Projet</button>
                        ) : null}
                        <button style={{ ...styles.iconBtn, color: '#9ca3af', padding: '2px' }} onClick={() => handleDeleteRencontre(r.id)} title="Supprimer"
                          onMouseEnter={(ev) => { ev.currentTarget.style.color = '#b91c1c'; }} onMouseLeave={(ev) => { ev.currentTarget.style.color = '#9ca3af'; }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal : créer un projet simple lié à la demande */}
        {projetTarget && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={() => setProjetTarget(null)}>
            <div style={{ background: 'white', borderRadius: '12px', padding: '20px', width: '560px', maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 10px' }}>Projet</h3>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', fontSize: '14px' }}>
                <label style={{ cursor: 'pointer' }}><input type="radio" checked={projetMode === 'create'} onChange={() => setProjetMode('create')} /> Créer un projet</label>
                <label style={{ cursor: 'pointer' }}><input type="radio" checked={projetMode === 'link'} onChange={() => setProjetMode('link')} /> Associer à un projet existant</label>
              </div>

              {projetMode === 'link' ? (
                <>
                  <input style={{ ...styles.editInput, marginBottom: '8px' }} placeholder="Rechercher un projet (code, titre, chef de projet)…" value={projetSearch} onChange={(e) => setProjetSearch(e.target.value)} />
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                    {(() => {
                      const q = projetSearch.trim().toLowerCase();
                      const list = (projets as any[]).filter(p => !q || `${p.code || ''} ${p.titre || ''} ${p.chef_projet_display_name || ''} ${p.chef_projet_username || ''}`.toLowerCase().includes(q));
                      if (list.length === 0) return <div style={{ padding: '12px', fontSize: '13px', color: '#94a3b8' }}>Aucun projet.</div>;
                      return list.map(p => (
                        <div key={p.id} onClick={() => setProjetLinkId(p.id)}
                          style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #f1f5f9', background: projetLinkId === p.id ? '#dbeafe' : 'white' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{p.code ? `${p.code} · ` : ''}{p.titre}</div>
                          {(p.chef_projet_display_name || p.chef_projet_username) && <div style={{ fontSize: '11px', color: '#64748b' }}>CdP : {p.chef_projet_display_name || p.chef_projet_username}</div>}
                        </div>
                      ));
                    })()}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
                    <button style={styles.resetBtn} onClick={() => setProjetTarget(null)}>Annuler</button>
                    <button style={{ ...styles.resetBtn, background: '#2563eb', color: 'white', border: 'none', opacity: creatingProjet || !projetLinkId ? 0.6 : 1 }} disabled={creatingProjet || !projetLinkId} onClick={associerProjet}>
                      Associer
                    </button>
                  </div>
                </>
              ) : (<>
              <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>Mini-projet (sans planning Gantt, étapes de workflow ni comités), lié à cette demande.</p>

              <label style={styles.label}>Titre *</label>
              <input style={{ ...styles.editInput, marginBottom: '10px' }} value={projetForm.titre} onChange={(e) => setProjetForm(f => ({ ...f, titre: e.target.value }))} />

              <label style={styles.label}>Description</label>
              <textarea style={{ ...styles.editInput, minHeight: '70px', fontFamily: 'inherit', marginBottom: '10px' }} value={projetForm.description} onChange={(e) => setProjetForm(f => ({ ...f, description: e.target.value }))} />

              <label style={styles.label}>Chef de projet</label>
              <select style={{ ...styles.editInput, marginBottom: '10px' }} value={projetForm.cp} onChange={(e) => setProjetForm(f => ({ ...f, cp: e.target.value, parentId: '' }))}>
                <option value="">-- Non défini --</option>
                {projetForm.cp && !chefsProjets.some(c => c.username.toLowerCase() === projetForm.cp.toLowerCase()) && <option value={projetForm.cp}>{projetForm.cp}</option>}
                {chefsProjets.map(c => <option key={c.username} value={c.username}>{c.display_name}</option>)}
              </select>

              <label style={styles.label}>Est-ce un sous-projet ?</label>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', fontSize: '14px' }}>
                <label style={{ cursor: 'pointer' }}><input type="radio" checked={!projetForm.sousProjet} onChange={() => setProjetForm(f => ({ ...f, sousProjet: false, parentId: '' }))} /> Non, projet autonome</label>
                <label style={{ cursor: 'pointer' }}><input type="radio" checked={projetForm.sousProjet} onChange={() => setProjetForm(f => ({ ...f, sousProjet: true }))} /> Oui, sous-projet de…</label>
              </div>
              {projetForm.sousProjet && (
                !projetForm.cp ? (
                  <p style={{ fontSize: '13px', color: '#b45309', margin: '0 0 10px' }}>Choisissez d'abord un chef de projet pour afficher ses projets maîtres.</p>
                ) : maitres.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#b45309', margin: '0 0 10px' }}>Ce chef de projet n'a aucun projet maître.</p>
                ) : (
                  <select style={{ ...styles.editInput, marginBottom: '10px' }} value={projetForm.parentId} onChange={(e) => setProjetForm(f => ({ ...f, parentId: e.target.value }))}>
                    <option value="">-- Choisir le projet maître --</option>
                    {maitres.map(m => <option key={m.id} value={m.id}>{m.code ? `${m.code} · ` : ''}{m.titre}</option>)}
                  </select>
                )
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
                <button style={styles.resetBtn} onClick={() => setProjetTarget(null)}>Annuler</button>
                <button style={{ ...styles.resetBtn, background: '#2563eb', color: 'white', border: 'none', opacity: creatingProjet ? 0.6 : 1 }} disabled={creatingProjet} onClick={creerProjet}>
                  {creatingProjet ? 'Création...' : 'Créer le projet'}
                </button>
              </div>
              </>)}
            </div>
          </div>
        )}

        {/* Fiche d'édition (ouverture directe, plus de fiche en lecture) */}
        {showDetailModal && selectedRencontre && editedData && (() => {
          const e = editedData;
          const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', color: '#111827', background: 'white', fontFamily: 'inherit' };
          const lab: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 500, color: '#4b5563', marginBottom: '4px' };
          const sect: React.CSSProperties = { fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#2563eb', margin: '0 0 10px' };
          const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px 16px', marginBottom: '12px' };
          const full: React.CSSProperties = { gridColumn: '1 / -1' };
          const block: React.CSSProperties = { padding: '16px 0', borderTop: '1px solid #f1f3f5' };
          const set = (k: keyof Rencontre, v: any) => handleEditFieldChange(k, v);
          const servicesDeLaDirection = (dir?: string | null): string[] => {
            const list = dirServicesMap[normDir(dir || '')] || [];
            return [...new Set([...list, ...(e.service ? [e.service] : [])])].sort((a, b) => a.localeCompare(b, 'fr'));
          };
          return (
            <div style={{ ...styles.modalOverlay, background: 'rgba(17,24,39,0.45)' }} onClick={closeEdit}>
              <div style={{ background: 'white', borderRadius: '10px', width: 'min(760px, 94vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.18)' }} onClick={(ev) => ev.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px', borderBottom: '1px solid #e5e7eb', background: '#f8fafc', borderRadius: '10px 10px 0 0' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#111827' }}>Modifier la demande</h3>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                      {[fmtNom(selectedRencontre.direction), selectedRencontre.created_at ? `créée le ${new Date(selectedRencontre.created_at).toLocaleDateString('fr-FR')}` : ''].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '2px' }} onClick={closeEdit} title="Fermer"><X size={20} /></button>
                </div>

                <div style={{ padding: '4px 20px', overflowY: 'auto' }}>
                  <div style={{ padding: '16px 0' }}>
                    <p style={sect}>Demande</p>
                    <div style={grid2}>
                      <div style={full}><label style={lab}>Titre</label><input style={input} value={e.titre || ''} onChange={(ev) => set('titre', ev.target.value)} /></div>
                      <div style={full}><label style={lab}>Description</label><textarea style={{ ...input, minHeight: '84px', resize: 'vertical' }} value={e.description || ''} onChange={(ev) => set('description', ev.target.value)} /></div>
                      <div>
                        <label style={lab}>Type</label>
                        <select style={input} value={e.type || ''} onChange={(ev) => set('type', ev.target.value)}>
                          <option value="">-- Sélectionner --</option>
                          {[...new Set([...types, ...(e.type ? [e.type] : [])])].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lab}>Date</label>
                        <input type="date" style={input} value={e.date_reunion ? e.date_reunion.split('T')[0] : ''} onChange={(ev) => set('date_reunion', ev.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div style={block}>
                    <p style={sect}>Rattachement</p>
                    <div style={grid2}>
                      <div>
                        <label style={lab}>Direction</label>
                        <select style={input} value={e.direction || ''} onChange={(ev) => {
                          const v = ev.target.value;
                          const autorises = dirServicesMap[normDir(v)] || [];
                          setEditedData(prev => prev ? { ...prev, direction: v, service: prev.service && autorises.includes(prev.service) ? prev.service : '' } : prev);
                        }}>
                          <option value="">-- Sélectionner --</option>
                          {[...new Set([...directions, ...(e.direction ? [e.direction] : [])])].map(d => <option key={d} value={d}>{fmtNom(d)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lab}>Service</label>
                        <select style={input} value={e.service || ''} onChange={(ev) => set('service', ev.target.value)}>
                          <option value="">-- Aucun --</option>
                          {servicesDeLaDirection(e.direction).map(sv => <option key={sv} value={sv}>{fmtNom(sv)}</option>)}
                        </select>
                      </div>
                      <div style={{ ...full, position: 'relative' }}>
                        <label style={lab}>Demandeur (annuaire AD)</label>
                        {(e.user_ref_name || e.user_ref_email) ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#f9fafb', fontSize: '13px' }}>
                            <span style={{ flex: 1 }}>{e.user_ref_name || e.user_ref_email}{e.user_ref_email && e.user_ref_name ? <span style={{ color: '#6b7280' }}> · {e.user_ref_email}</span> : null}</span>
                            <button type="button" title="Retirer" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: '#6b7280' }}
                              onClick={() => setEditedData(prev => prev ? { ...prev, user_ref_username: null, user_ref_name: null, user_ref_email: null } : prev)}>×</button>
                          </div>
                        ) : (
                          <>
                            <input style={input} placeholder="Rechercher un agent (nom, prénom, login)…" value={adRef.query} onChange={(ev) => adRef.setQuery(ev.target.value)} />
                            {adRef.searching && <span style={{ position: 'absolute', right: '10px', top: '30px', fontSize: '12px', color: '#6b7280' }}>…</span>}
                            {adRef.results.length > 0 && (
                              <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, background: 'white', border: '1px solid #d1d5db', borderRadius: '6px', maxHeight: '220px', overflowY: 'auto', boxShadow: '0 8px 20px rgba(0,0,0,0.10)' }}>
                                {adRef.results.map(u => (
                                  <div key={`${u.username}-${u.email}`} style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f3f5', fontSize: '13px' }}
                                    onClick={() => {
                                      setEditedData(prev => prev ? { ...prev, user_ref_username: u.username, user_ref_name: u.displayName, user_ref_email: u.email } : prev);
                                      adRef.setQuery(''); adRef.clearResults();
                                    }}>
                                    <strong>{u.displayName}</strong> <span style={{ color: '#6b7280' }}>{u.email}{u.service ? ` · ${u.service}` : ''}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={block}>
                    <p style={sect}>Pilotage</p>
                    <div style={grid2}>
                      <div>
                        <label style={lab}>Statut</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <select style={{ ...input, flex: 1 }} value={e.statut || ''} onChange={(ev) => {
                            set('statut', ev.target.value);
                            if (ev.target.value === 'Validé' && !e.annee_validation) set('annee_validation', new Date().getFullYear());
                          }}>
                            <option value="">-- Sélectionner --</option>
                            {statuts.map(st => <option key={st} value={st}>{st}</option>)}
                          </select>
                          {e.statut === 'Validé' && (
                            <select style={{ ...input, width: '96px' }} value={e.annee_validation || ''} onChange={(ev) => set('annee_validation', ev.target.value ? parseInt(ev.target.value) : null)}>
                              <option value="">Année</option>
                              {anneesValidation.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                          )}
                        </div>
                      </div>
                      <div>
                        <label style={lab}>Montant TTC (0 = gratuit)</label>
                        <input type="number" step="0.01" style={input} value={e.cout_ttc ?? ''} onChange={(ev) => set('cout_ttc', ev.target.value === '' ? null : parseFloat(ev.target.value))} />
                      </div>
                      <div>
                        <label style={lab}>Chef de projet pressenti</label>
                        <select style={input} value={e.cp_presenti || ''} onChange={(ev) => set('cp_presenti', ev.target.value || null)}>
                          <option value="">-- Non défini --</option>
                          {e.cp_presenti && !chefsProjets.some(c => c.username.toLowerCase() === String(e.cp_presenti).toLowerCase()) && <option value={e.cp_presenti}>{e.cp_presenti}</option>}
                          {chefsProjets.map(c => <option key={c.username} value={c.username}>{c.display_name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lab}>Charge CP</label>
                        <select style={input} value={e.charge_cp || ''} onChange={(ev) => set('charge_cp', ev.target.value || null)}>
                          <option value="">-- Non renseignée --</option>
                          {CHARGES_CP.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lab}>Responsable DSI</label>
                        <input style={input} placeholder="ex : IRS, SSD" value={e.responsable_dsi || ''} onChange={(ev) => set('responsable_dsi', ev.target.value)} />
                      </div>
                      <div>
                        <label style={lab}>Lien</label>
                        <input style={input} placeholder="https://…" value={e.lien_reference || ''} onChange={(ev) => set('lien_reference', ev.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div style={{ ...block, paddingBottom: '20px' }}>
                    <p style={sect}>Suivi</p>
                    <textarea style={{ ...input, minHeight: '110px', resize: 'vertical' }} value={e.suivi || ''} onChange={(ev) => set('suivi', ev.target.value)} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '12px 20px', borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      style={{ ...linkBtn, padding: '7px 12px', fontSize: '13px', color: '#b91c1c', borderColor: '#fecaca' }}
                      onClick={() => handleDeleteRencontre(selectedRencontre.id)}
                    >Supprimer</button>
                    {!selectedRencontre.projet_id && (
                      <button
                        style={{ ...linkBtn, padding: '7px 12px', fontSize: '13px', opacity: isCreatingTicket ? 0.5 : 1, ...(selectedRencontre.ticket_glpi ? { background: '#ede9fe', borderColor: '#c4b5fd', color: '#5b21b6', fontWeight: 600 } : {}) }}
                        disabled={isCreatingTicket}
                        onClick={selectedRencontre.ticket_glpi ? () => handleOpenTicket(selectedRencontre.id) : () => handleCreateTicket()}
                        title={selectedRencontre.ticket_glpi ? `Ouvrir le ticket DSIHUB #${selectedRencontre.ticket_glpi}` : 'Créer un ticket DSIHUB'}
                      >
                        <Ticket size={14} />
                        {isCreatingTicket ? 'Création…' : selectedRencontre.ticket_glpi ? `Ticket #${selectedRencontre.ticket_glpi}` : 'Créer un ticket'}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={{ ...linkBtn, padding: '7px 14px', fontSize: '13px' }} onClick={closeEdit}>Annuler</button>
                    <button
                      style={{ padding: '7px 16px', border: 'none', background: '#2563eb', color: 'white', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: isEditSaving ? 'default' : 'pointer', opacity: isEditSaving ? 0.7 : 1 }}
                      onClick={handleSaveEdit}
                      disabled={isEditSaving}
                    >{isEditSaving ? 'Enregistrement…' : 'Enregistrer'}</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Modal Gestion des emails */}
        {showEmailsModal && (() => {
          // Toutes les directions connues (participants réunions + demandes)
          const allDirs = [...new Set([...directions, ...directionEmails.map(e => e.direction)])].sort();
          // Services disponibles selon la direction sélectionnée
          const availableServices = selectedEmailDirection ? (dirServicesMap[selectedEmailDirection] || []) : [];
          return (
          <div style={styles.modalOverlay} onClick={() => setShowEmailsModal(false)}>
            <div style={{background: 'white', borderRadius: '12px', width: '90%', maxWidth: '760px', maxHeight: '87vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'}} onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div style={{padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                  <Mail size={20} color="#2563eb" />
                  <h2 style={{margin: 0, fontSize: '18px', fontWeight: '700', color: '#1f2937'}}>Emails par direction</h2>
                  <span style={{background: '#dbeafe', color: '#1d4ed8', fontSize: '12px', fontWeight: '600', padding: '2px 8px', borderRadius: '12px'}}>{directionEmails.length} email{directionEmails.length > 1 ? 's' : ''}</span>
                  {allDirs.filter(d => !directionEmails.some(e => e.direction === d)).length > 0 && (
                    <span style={{background: '#fee2e2', color: '#dc2626', fontSize: '12px', fontWeight: '600', padding: '2px 8px', borderRadius: '12px'}}>
                      {allDirs.filter(d => !directionEmails.some(e => e.direction === d)).length} sans email
                    </span>
                  )}
                </div>
                <button onClick={() => setShowEmailsModal(false)} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '4px'}}>
                  <X size={20} />
                </button>
              </div>

              {/* Formulaire d'ajout */}
              <div style={{padding: '16px 24px', borderBottom: '1px solid #e5e7eb', background: 'white'}}>
                <p style={{margin: '0 0 10px 0', fontSize: '13px', fontWeight: '600', color: '#374151'}}>Ajouter un email</p>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px'}}>
                  <div>
                    <label style={{display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px'}}>DIRECTION *</label>
                    <select
                      style={{width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', background: 'white'}}
                      value={selectedEmailDirection}
                      onChange={(e) => { setSelectedEmailDirection(e.target.value); setSelectedEmailService(''); }}
                    >
                      <option value="">Sélectionner...</option>
                      {allDirs.map(d => {
                        const hasEmail = directionEmails.some(e => e.direction === d);
                        return <option key={d} value={d} style={{fontWeight: hasEmail ? 'normal' : 'bold'}}>{hasEmail ? d : `⚠ ${d}`}</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label style={{display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px'}}>SERVICE</label>
                    {availableServices.length > 0 ? (
                      <select
                        style={{width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', background: 'white'}}
                        value={selectedEmailService}
                        onChange={(e) => setSelectedEmailService(e.target.value)}
                      >
                        <option value="">Tous les services</option>
                        {availableServices.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="Optionnel"
                        style={{width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px'}}
                        value={selectedEmailService}
                        onChange={(e) => setSelectedEmailService(e.target.value)}
                      />
                    )}
                  </div>
                </div>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '8px', alignItems: 'end'}}>
                  <div style={{position: 'relative'}}>
                    <label style={{display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px'}}>RECHERCHE AD</label>
                    <input
                      type="text"
                      placeholder="Nom prénom..."
                      style={{width: '100%', padding: '8px 10px', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '13px', background: '#eff6ff'}}
                      value={emailAd.query}
                      onChange={(e) => emailAd.setQuery(e.target.value)}
                    />
                    {emailAd.searching && <span style={{position: 'absolute', right: '8px', top: '30px', fontSize: '11px', color: '#6b7280'}}>...</span>}
                    {emailAd.results.length > 0 && (
                      <div style={{position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #bfdbfe', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: '180px', overflowY: 'auto'}}>
                        {emailAd.results.map(u => (
                          <div key={u.username} onClick={() => selectADUserForEmail(u)}
                            style={{padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '13px'}}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#eff6ff'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                          >
                            <div style={{fontWeight: '600', color: '#1e293b'}}>{u.displayName}</div>
                            <div style={{color: '#64748b', fontSize: '12px'}}>{u.email || 'Pas d\'email AD'}{u.service ? ` — ${u.service}` : ''}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px'}}>EMAIL *</label>
                    <input
                      type="email"
                      placeholder="prenom.nom@domaine.fr"
                      style={{width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px'}}
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
                    />
                  </div>
                  <button
                    onClick={handleAddEmail}
                    disabled={isAddingEmail || !selectedEmailDirection || !newEmail}
                    style={{padding: '8px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', opacity: (!selectedEmailDirection || !newEmail) ? 0.5 : 1, whiteSpace: 'nowrap'}}
                  >
                    {isAddingEmail ? '...' : '+ Ajouter'}
                  </button>
                </div>
              </div>

              {/* Liste — toutes les directions, celles sans email en gras avec message */}
              <div style={{overflowY: 'auto', flex: 1, padding: '16px 24px'}}>
                {emailsLoading ? (
                  <div style={{textAlign: 'center', padding: '40px', color: '#9ca3af'}}>Chargement...</div>
                ) : allDirs.length === 0 ? (
                  <div style={{textAlign: 'center', padding: '40px', color: '#9ca3af'}}>
                    <Mail size={40} style={{opacity: 0.3, marginBottom: '12px'}} />
                    <p style={{margin: 0}}>Aucune direction connue</p>
                    <p style={{fontSize: '12px', margin: '4px 0 0 0'}}>Les directions apparaîtront quand des réunions ou demandes seront créées</p>
                  </div>
                ) : (
                  allDirs.map(dir => {
                    const emails = directionEmails.filter(e => e.direction === dir);
                    const hasEmail = emails.length > 0;
                    return (
                      <div key={dir} style={{marginBottom: '16px'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px'}}>
                          <div style={{width: '3px', height: '18px', background: hasEmail ? '#2563eb' : '#ef4444', borderRadius: '2px'}} />
                          <span style={{fontWeight: hasEmail ? '600' : '800', fontSize: '14px', color: hasEmail ? '#1f2937' : '#dc2626'}}>{dir}</span>
                          {hasEmail ? (
                            <span style={{background: '#eff6ff', color: '#2563eb', fontSize: '11px', fontWeight: '600', padding: '1px 6px', borderRadius: '10px'}}>{emails.length}</span>
                          ) : (
                            <span style={{background: '#fee2e2', color: '#dc2626', fontSize: '11px', fontWeight: '600', padding: '1px 6px', borderRadius: '10px'}}>Aucun email</span>
                          )}
                        </div>
                        {hasEmail ? (
                          <div style={{display: 'flex', flexDirection: 'column', gap: '5px', paddingLeft: '11px'}}>
                            {emails.map(de => (
                              <div key={de.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px'}}>
                                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                  <Mail size={13} color="#6b7280" />
                                  <span style={{fontSize: '13px', color: '#374151'}}>{de.email}</span>
                                  <AgentPresenceBadge email={de.email} size={11} />
                                  {de.service && (
                                    <span style={{background: '#ecfdf5', color: '#059669', fontSize: '11px', fontWeight: '600', padding: '1px 6px', borderRadius: '4px'}}>{de.service}</span>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleDeleteEmail(de.id)}
                                  style={{background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', display: 'flex', alignItems: 'center'}}
                                  title="Supprimer"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{paddingLeft: '11px'}}>
                            <button
                              onClick={() => setSelectedEmailDirection(dir)}
                              style={{fontSize: '12px', color: '#2563eb', background: 'none', border: '1px dashed #93c5fd', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer'}}
                            >
                              + Ajouter un email pour cette direction
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div style={{padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', background: '#f9fafb'}}>
                <button
                  onClick={() => setShowEmailsModal(false)}
                  style={{padding: '8px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer'}}
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
          );
        })()}

        {/* Modale Gérer les Réunions */}
        {showManageReunions && (
          <div style={{background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px', overflow: 'hidden'}}>
            <div style={{padding: '16px 20px', background: '#eff6ff', borderBottom: '1px solid #dbeafe', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <h3 style={{margin: 0, fontSize: '15px', fontWeight: '700', color: '#1d4ed8'}}>📅 Réunions ({reunions.length})</h3>
            </div>
            {reunions.length === 0 ? (
              <div style={{padding: '30px', textAlign: 'center', color: '#94a3b8'}}>Aucune réunion créée</div>
            ) : (
              <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '14px'}}>
                <thead>
                  <tr style={{borderBottom: '1px solid #e2e8f0', background: '#f8fafc'}}>
                    <th style={{padding: '10px 16px', textAlign: 'left', fontWeight: '600', color: '#475569'}}>Titre</th>
                    <th style={{padding: '10px 16px', textAlign: 'left', fontWeight: '600', color: '#475569'}}>Date</th>
                    <th style={{padding: '10px 16px', textAlign: 'left', fontWeight: '600', color: '#475569'}}>Lieu</th>
                    <th style={{padding: '10px 16px', textAlign: 'left', fontWeight: '600', color: '#475569'}}>Statut</th>
                    <th style={{padding: '10px 16px'}}></th>
                  </tr>
                </thead>
                <tbody>
                  {reunions.map(r => (
                    <tr key={r.id} style={{borderBottom: '1px solid #f1f5f9', cursor: 'pointer'}} onClick={() => openReunionDetail(r)}>
                      <td style={{padding: '10px 16px', fontWeight: '600', color: '#1e293b'}}>{r.titre}</td>
                      <td style={{padding: '10px 16px', color: '#475569'}}>{r.date_reunion ? new Date(r.date_reunion).toLocaleDateString('fr-FR') : '-'}</td>
                      <td style={{padding: '10px 16px', color: '#475569'}}>{r.lieu || '-'}</td>
                      <td style={{padding: '10px 16px'}}>
                        <span style={{padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', background: r.statut === 'effectuée' ? '#dcfce7' : '#fef3c7', color: r.statut === 'effectuée' ? '#16a34a' : '#92400e'}}>{r.statut}</span>
                      </td>
                      <td style={{padding: '10px 16px', textAlign: 'right'}}>
                        <Eye size={15} color="#64748b" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Modale gestion réunions */}
        {showManageReunions && (
          <div style={{position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}}>
            <div style={{background: 'white', borderRadius: '16px', width: '100%', maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.25)'}}>
              <div style={{padding: '20px 24px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <h2 style={{margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e293b'}}>📅 Gérer les Réunions</h2>
                <button onClick={() => setShowManageReunions(false)} style={{background: '#f1f5f9', border: 'none', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><X size={16} /></button>
              </div>
              <div style={{flex: 1, overflowY: 'auto', padding: '20px 24px'}}>
                <div style={{display: 'flex', gap: '10px', marginBottom: '20px'}}>
                  <button onClick={() => { setShowCreateReunionModal(true); setShowManageReunions(false); }} style={{padding: '10px 18px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flex: 1}}>
                    <Plus size={16} /> Créer une réunion
                  </button>
                  <button onClick={generateReunionsFromDemandes} style={{padding: '10px 18px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'}}>
                    ⚡ Générer réunions
                  </button>
                  {user?.role === 'admin' && (
                    <button onClick={handleDeleteAllReunions} style={{padding: '10px 18px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'}}>
                      <Trash2 size={15} /> Tout supprimer
                    </button>
                  )}
                </div>
                {reunions.length === 0 ? (
                  <div style={{textAlign: 'center', padding: '30px', color: '#94a3b8'}}>Aucune réunion créée</div>
                ) : (
                  <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '14px'}}>
                    <thead>
                      <tr style={{borderBottom: '1px solid #e2e8f0', background: '#f8fafc'}}>
                        <th style={{padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#475569'}}>Titre</th>
                        <th style={{padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#475569'}}>Date</th>
                        <th style={{padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#475569'}}>Lieu</th>
                        <th style={{padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#475569'}}>Statut</th>
                        <th style={{padding: '10px 12px'}}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {reunions.map(r => (
                        <tr key={r.id} style={{borderBottom: '1px solid #f1f5f9'}} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                          <td style={{padding: '10px 12px', fontWeight: '600', color: '#1e293b', cursor: 'pointer'}} onClick={() => { openReunionDetail(r); setShowManageReunions(false); }}>{r.titre}</td>
                          <td style={{padding: '10px 12px', color: '#475569', cursor: 'pointer'}} onClick={() => { openReunionDetail(r); setShowManageReunions(false); }}>{r.date_reunion ? new Date(r.date_reunion).toLocaleDateString('fr-FR') : '-'}</td>
                          <td style={{padding: '10px 12px', color: '#475569', cursor: 'pointer'}} onClick={() => { openReunionDetail(r); setShowManageReunions(false); }}>{r.lieu || '-'}</td>
                          <td style={{padding: '10px 12px', cursor: 'pointer'}} onClick={() => { openReunionDetail(r); setShowManageReunions(false); }}>
                            <span style={{padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', background: r.statut === 'effectuée' ? '#dcfce7' : '#fef3c7', color: r.statut === 'effectuée' ? '#16a34a' : '#92400e'}}>{r.statut}</span>
                          </td>
                          <td style={{padding: '10px 12px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center'}}>
                            <button onClick={() => { openReunionDetail(r); setShowManageReunions(false); }} style={{background: 'none', border: 'none', cursor: 'pointer', padding: '4px'}} title="Voir les détails"><Eye size={16} color="#64748b" /></button>
                            {user?.role === 'admin' && (
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteReunion(r.id); }} style={{background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#ef4444'}} title="Supprimer la réunion"><Trash2 size={16} /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        <CreateReunionModal
          isOpen={showCreateReunionModal}
          onClose={() => setShowCreateReunionModal(false)}
          onCreated={(created) => {
            setShowCreateReunionModal(false);
            fetchReunions();
            fetchDirectionsServices();
            openReunionDetail(created);
          }}
          token={token}
          directions={directions}
          services={services}
        />

        <ReunionDetailModal
          isOpen={detailReunionId !== null}
          reunionId={detailReunionId}
          token={token}
          userRole={user?.role}
          currentUsername={user?.username}
          onClose={() => setDetailReunionId(null)}
          onUpdated={() => fetchReunions()}
          onDemandeCreated={() => { fetchRencontres(); fetchReunions(); }}
          onDeleted={() => { fetchReunions(); setDetailReunionId(null); }}
        />

      </main>

      <style>{`
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f7f7f8',
  },
  mainContent: {
    padding: '24px 12px',
    maxWidth: '1600px',
    margin: '0 auto',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  } as React.CSSProperties,
  title: {
    fontSize: '22px',
    fontWeight: '600',
    margin: 0,
    color: '#111827',
  } as React.CSSProperties,
  toolbarActions: {
    display: 'flex',
    gap: '8px',
  } as React.CSSProperties,
  toolbarBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 12px',
    backgroundColor: 'white',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
  } as React.CSSProperties,
  filterBar: {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px',
    flexWrap: 'wrap',
    alignItems: 'center',
  } as React.CSSProperties,
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    flex: '1',
    minWidth: '200px',
  } as React.CSSProperties,
  searchInput: {
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    width: '100%',
  } as React.CSSProperties,
  filterSelect: {
    padding: '6px 8px',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    fontSize: '13px',
    maxWidth: '190px',
    cursor: 'pointer',
  } as React.CSSProperties,
  resetBtn: {
    padding: '8px 12px',
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  tableContainer: {
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    overflow: 'auto',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  } as React.CSSProperties,
  headerRow: {
    backgroundColor: '#f3f4f6',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  th: {
    padding: '8px 10px',
    textAlign: 'left',
    verticalAlign: 'bottom',
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: '#4b5563',
    userSelect: 'none',
  } as React.CSSProperties,
  row: {
    borderBottom: '1px solid #f1f3f5',
    transition: 'background-color 0.15s',
  } as React.CSSProperties,
  td: {
    padding: '8px 10px',
    fontSize: '13px',
    verticalAlign: 'top',
    color: '#374151',
  } as React.CSSProperties,
  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
  } as React.CSSProperties,
  iconBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'inline-flex',
    alignItems: 'center',
  } as React.CSSProperties,
  loading: {
    padding: '40px',
    textAlign: 'center',
    color: '#6b7280',
  } as React.CSSProperties,
  empty: {
    padding: '40px',
    textAlign: 'center',
    color: '#6b7280',
  } as React.CSSProperties,
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  } as React.CSSProperties,
  modal: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '90vh',
    overflow: 'auto',
  } as React.CSSProperties,
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  modalTitle: {
    fontSize: '20px',
    fontWeight: '600',
    margin: 0,
  } as React.CSSProperties,
  modalCloseBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0',
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  modalContent: {
    padding: '20px',
  } as React.CSSProperties,
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '20px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: '4px',
  } as React.CSSProperties,
  value: {
    fontSize: '14px',
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  modalFooter: {
    display: 'flex',
    gap: '12px',
    padding: '20px',
    borderTop: '1px solid #e5e7eb',
    justifyContent: 'flex-end',
  } as React.CSSProperties,
  btn: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  } as React.CSSProperties,
  btnDanger: {
    backgroundColor: '#fecaca',
    color: '#991b1b',
    border: 'none',
  } as React.CSSProperties,
  modalSection: {
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  detailGrid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
  } as React.CSSProperties,
  detailField: {
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  editInput: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    fontFamily: 'inherit',
    backgroundColor: '#ffffff',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  modalDialog: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(15,23,42,0.5)',
    zIndex: 3000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  } as React.CSSProperties,
};

export default RencontresBudgetaires;
