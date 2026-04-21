import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import {
  Upload, Search, X, Columns, Eye, Plus, Trash2, Info, Mail, AlertCircle, Ticket
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Rencontre {
  id: number;
  titre: string;
  direction: string;
  service?: string;
  date_reunion: string;
  annee: number;
  type: string;
  description: string;
  cout_ttc: number;
  arbitrage: string;
  responsable_dsi: string;
  ticket_glpi: string;
  lien_reference: string;
  statut: string;
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
  statut_presence: 'present' | 'excuse';
  ad_username?: string;
}

interface ADUser {
  username: string;
  displayName: string;
  email: string;
  service?: string;
  direction?: string;
}

const RencontresBudgetaires: React.FC = () => {
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rencontres, setRencontres] = useState<Rencontre[]>([]);
  const [filteredRencontres, setFilteredRencontres] = useState<Rencontre[]>([]);
  const [loading, setLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);

  // Filtres
  const [selectedDirection, setSelectedDirection] = useState<string>('');
  const [selectedAnnee, setSelectedAnnee] = useState<number | ''>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStatut, setSelectedStatut] = useState<string>('');

  // UI
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [showColumnConfig, setShowColumnConfig] = useState(false);

  // Detail modal
  const [selectedRencontre, setSelectedRencontre] = useState<Rencontre | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
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
  const [selectedReunion, setSelectedReunion] = useState<Reunion | null>(null);
  const [showReunionDetail, setShowReunionDetail] = useState(false);
  const [newReunion, setNewReunion] = useState({ titre: '', date_reunion: '', lieu: '', description: '' });
  const [reunionParticipants, setReunionParticipants] = useState<ReunionParticipant[]>([]);
  const [newParticipant, setNewParticipant] = useState({ nom: '', prenom: '', email: '', service: '', direction: '', type_presence: 'metier' as 'metier' | 'dsi', statut_presence: 'present' as 'present' | 'excuse' });
  const [adQuery, setAdQuery] = useState('');
  const [adResults, setAdResults] = useState<ADUser[]>([]);
  const [adSearching, setAdSearching] = useState(false);
  const [isCreatingReunion, setIsCreatingReunion] = useState(false);
  // Modale demande dans une réunion
  const [showCreateDemandeModal, setShowCreateDemandeModal] = useState(false);
  const [newDemande, setNewDemande] = useState({ titre: '', direction: '', service: '', type: '', description: '' });
  // Pour ajouter un participant à une réunion existante
  const [showAddParticipantDetail, setShowAddParticipantDetail] = useState(false);
  const [detailAdQuery, setDetailAdQuery] = useState('');
  const [detailAdResults, setDetailAdResults] = useState<ADUser[]>([]);
  const [detailAdSearching, setDetailAdSearching] = useState(false);
  const [detailNewParticipant, setDetailNewParticipant] = useState({ nom: '', prenom: '', email: '', service: '', direction: '', type_presence: 'metier' as 'metier' | 'dsi', statut_presence: 'present' as 'present' | 'excuse' });
  const [isAddingDetailParticipant, setIsAddingDetailParticipant] = useState(false);
  const [directions, setDirections] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);

  const annees = [...new Set(rencontres.map(r => r.annee))].filter(a => a).sort((a, b) => b - a);
  const statuts = ['importée', 'planifiée', 'effectuée'];
  const arbitrages = ['OK DSI', 'En attente', 'Refusé', 'À discuter'];
  const types = [...new Set(rencontres.map(r => r.type).filter(t => t))].sort();

  useEffect(() => {
    if (token) {
      fetchRencontres();
      fetchReunions();
      fetchDirectionsServices();
    }
  }, [token]);

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
  }, [rencontres, selectedDirection, selectedAnnee, selectedStatut, searchTerm, sortConfig]);

  const fetchRencontres = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/rencontres-budgetaires', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setRencontres(data || []);
    } catch (error) {
      console.error('Erreur chargement:', error);
      alert('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsImporting(true);
      const res = await fetch('/api/rencontres-budgetaires/import', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const result = await res.json();
      if (res.ok) {
        alert(`Import réussi : ${result.imported} importées${result.errors?.length > 0 ? ', ' + result.errors.length + ' erreurs' : ''}`);
        fetchRencontres();
      } else {
        alert(`Erreur : ${result.error || result.message}`);
      }
    } catch (err) {
      console.error('Import error:', err);
      alert('Erreur lors de l\'import');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
        alert('Supprimée avec succès');
        fetchRencontres();
        if (selectedRencontre?.id === id) setShowDetailModal(false);
      } else {
        alert('Erreur suppression');
      }
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const handleEditClick = () => {
    if (selectedRencontre) {
      setEditedData({ ...selectedRencontre });
      setIsEditMode(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditedData(null);
  };

  const handleEditFieldChange = (field: keyof Rencontre, value: any) => {
    if (editedData) {
      setEditedData({ ...editedData, [field]: value });
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedRencontre || !editedData) return;

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
        alert('Enregistrée avec succès');
        setIsEditMode(false);
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

  const handleOpenGlpiTicket = async (rencontreId: number) => {
    try {
      const res = await fetch(`/api/rencontres-budgetaires/${rencontreId}/glpi-link`, {
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
      alert('Impossible de vérifier le ticket GLPI');
    }
  };

  const handleCreateGlpiTicket = async () => {
    if (!selectedRencontre) return;
    if (selectedRencontre.ticket_glpi) {
      if (!window.confirm(`Un ticket GLPI existe déjà (#${selectedRencontre.ticket_glpi}). Créer quand même un nouveau ticket ?`)) return;
    }
    try {
      setIsCreatingTicket(true);
      const content = [
        `Direction : ${selectedRencontre.direction}`,
        selectedRencontre.service ? `Service : ${selectedRencontre.service}` : '',
        `Date réunion : ${selectedRencontre.date_reunion ? new Date(selectedRencontre.date_reunion).toLocaleDateString('fr-FR') : '-'}`,
        selectedRencontre.type ? `Type : ${selectedRencontre.type}` : '',
        '',
        `Description :`,
        selectedRencontre.description || '',
        '',
        selectedRencontre.commentaires ? `Commentaires :\n${selectedRencontre.commentaires}` : '',
        selectedRencontre.cout_ttc ? `Montant TTC : ${selectedRencontre.cout_ttc.toFixed(2)}€` : '',
        selectedRencontre.arbitrage ? `Arbitrage : ${selectedRencontre.arbitrage}` : '',
        selectedRencontre.responsable_dsi ? `Responsable DSI : ${selectedRencontre.responsable_dsi}` : '',
      ].filter(Boolean).join('\n');

      const res = await fetch('/api/glpi/tickets', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `[Rencontres ${selectedRencontre.annee || new Date(selectedRencontre.date_reunion).getFullYear() || ''}] ${selectedRencontre.titre || selectedRencontre.description?.substring(0, 80) || 'Rencontre budgétaire'}`,
          content,
          type: 2,
          urgency: 3,
          priority: 3,
        })
      });
      const result = await res.json();
      if (!res.ok) { alert(`Erreur GLPI : ${result.message || 'Échec de la création'}`); return; }

      const ticketId = result.ticket?.id || result.ticket;
      if (!ticketId) { alert('Ticket créé mais numéro non récupéré'); return; }

      const updateRes = await fetch(`/api/rencontres-budgetaires/${selectedRencontre.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...selectedRencontre, ticket_glpi: String(ticketId) })
      });
      if (updateRes.ok) {
        const updated = { ...selectedRencontre, ticket_glpi: String(ticketId) };
        setSelectedRencontre(updated);
        setRencontres(prev => prev.map(r => r.id === updated.id ? updated : r));
        alert(`Ticket GLPI #${ticketId} créé avec succès`);
      } else {
        alert(`Ticket GLPI #${ticketId} créé mais erreur lors de la mise à jour en base`);
      }
    } catch (err) {
      console.error('Erreur création ticket GLPI:', err);
      alert('Erreur lors de la création du ticket GLPI');
    } finally {
      setIsCreatingTicket(false);
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
      setDirectionEmails(data || []);
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

  const openEmailsModal = () => {
    fetchDirectionEmails();
    setShowEmailsModal(true);
  };

  // --- Réunions ---

  const fetchDirectionsServices = async () => {
    try {
      const res = await fetch('/api/directions-services', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      setDirections(data.directions || []);
      setServices(data.services || []);
    } catch (e) { console.error('Erreur chargement directions/services:', e); }
  };

  const fetchReunions = async () => {
    try {
      const res = await fetch('/api/rencontres-reunions', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      setReunions(data || []);
    } catch (e) { console.error('Erreur chargement réunions:', e); }
  };

  const openReunionDetail = async (reunion: Reunion) => {
    try {
      const res = await fetch(`/api/rencontres-reunions/${reunion.id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      setSelectedReunion(data);
      setShowReunionDetail(true);
    } catch (e) { console.error(e); }
  };

  const handleCreateReunion = async () => {
    if (!newReunion.titre || !newReunion.date_reunion) {
      alert('Titre et date sont obligatoires');
      return;
    }
    try {
      setIsCreatingReunion(true);
      const res = await fetch('/api/rencontres-reunions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newReunion, participants: reunionParticipants })
      });
      if (res.ok) {
        setShowCreateReunionModal(false);
        setNewReunion({ titre: '', date_reunion: '', lieu: '', description: '' });
        setReunionParticipants([]);
        fetchReunions();
        fetchDirectionsServices();
      } else {
        const err = await res.json();
        alert(`Erreur : ${err.error}`);
      }
    } catch (e) { alert('Erreur création réunion'); }
    finally { setIsCreatingReunion(false); }
  };

  const handleDeleteReunion = async (id: number) => {
    if (!window.confirm('Supprimer cette réunion ?')) return;
    await fetch(`/api/rencontres-reunions/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    setShowReunionDetail(false);
    fetchReunions();
  };

  const handleDeleteParticipant = async (pid: number) => {
    await fetch(`/api/reunion-participants/${pid}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    if (selectedReunion) openReunionDetail(selectedReunion);
  };

  const searchADDetail = async (q: string) => {
    setDetailAdQuery(q);
    if (q.length < 2) { setDetailAdResults([]); return; }
    setDetailAdSearching(true);
    try {
      const res = await fetch(`/api/ad/search?q=${encodeURIComponent(q)}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      setDetailAdResults(Array.isArray(data) ? data : []);
    } catch (e) { setDetailAdResults([]); }
    finally { setDetailAdSearching(false); }
  };

  const addParticipantFromADDetail = async (user: ADUser) => {
    if (!selectedReunion) return;
    try {
      setIsAddingDetailParticipant(true);
      const res = await fetch(`/api/rencontres-reunions/${selectedReunion.id}/participants`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: user.displayName.split(' ').slice(1).join(' ') || user.displayName,
          prenom: user.displayName.split(' ')[0],
          email: user.email,
          service: user.service || '',
          direction: user.direction || '',
          type_presence: 'dsi',
          ad_username: user.username
        })
      });
      if (res.ok) {
        setDetailAdQuery('');
        setDetailAdResults([]);
        fetchDirectionsServices();
        openReunionDetail(selectedReunion);
      } else {
        const err = await res.json();
        alert(`Erreur : ${err.error}`);
      }
    } catch (e) {
      alert('Erreur ajout participant');
    } finally {
      setIsAddingDetailParticipant(false);
    }
  };

  const addParticipantManuelDetail = async () => {
    if (!detailNewParticipant.nom) {
      alert('Le nom est obligatoire');
      return;
    }
    if (!selectedReunion) {
      alert('Aucune réunion sélectionnée');
      return;
    }
    try {
      setIsAddingDetailParticipant(true);
      const res = await fetch(`/api/rencontres-reunions/${selectedReunion.id}/participants`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(detailNewParticipant)
      });
      if (res.ok) {
        alert('Participant ajouté');
        setDetailNewParticipant({ nom: '', prenom: '', email: '', service: '', direction: '', type_presence: 'metier', statut_presence: 'present' });
        setShowAddParticipantDetail(false);
        fetchDirectionsServices();
        openReunionDetail(selectedReunion);
      } else {
        const err = await res.json();
        alert(`Erreur : ${err.error || 'Erreur ajout participant'}`);
      }
    } catch (e) {
      console.error('Erreur ajout participant:', e);
      alert('Erreur lors de l\'ajout du participant');
    } finally {
      setIsAddingDetailParticipant(false);
    }
  };

  const searchAD = async (q: string) => {
    setAdQuery(q);
    if (q.length < 2) { setAdResults([]); return; }
    setAdSearching(true);
    try {
      const res = await fetch(`/api/ad/search?q=${encodeURIComponent(q)}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      setAdResults(Array.isArray(data) ? data : []);
    } catch (e) { setAdResults([]); }
    finally { setAdSearching(false); }
  };

  const addParticipantFromAD = (user: ADUser) => {
    setReunionParticipants(prev => [...prev, {
      id: Date.now(), reunion_id: 0,
      nom: user.displayName.split(' ').slice(1).join(' ') || user.displayName,
      prenom: user.displayName.split(' ')[0],
      email: user.email,
      service: user.service || '',
      direction: user.direction || '',
      type_presence: 'dsi',
      statut_presence: 'present',
      ad_username: user.username
    }]);
    setAdQuery('');
    setAdResults([]);
  };

  const addParticipantManuel = () => {
    if (!newParticipant.nom) return;
    setReunionParticipants(prev => [...prev, { ...newParticipant, id: Date.now(), reunion_id: 0 }]);
    setNewParticipant({ nom: '', prenom: '', email: '', service: '', direction: '', type_presence: 'metier', statut_presence: 'present' });
  };

  // Services suggérés depuis les participants présents/excusés
  const suggestedServices = [...new Set(reunionParticipants.map(p => p.service).filter(Boolean))] as string[];

  const handleCreateDemande = async () => {
    if (!newDemande.titre) {
      alert('Le titre de la demande est obligatoire');
      return;
    }
    if (!newDemande.direction) {
      alert('La direction est obligatoire');
      return;
    }
    if (!selectedReunion) {
      alert('Aucune réunion sélectionnée');
      return;
    }
    try {
      const annee = selectedReunion.annee || new Date(selectedReunion.date_reunion).getFullYear();
      const res = await fetch('/api/rencontres-budgetaires/from-reunion', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newDemande, annee, date_reunion: selectedReunion.date_reunion, reunion_id: selectedReunion.id })
      });
      if (res.ok) {
        alert('Demande créée avec succès');
        setShowCreateDemandeModal(false);
        setNewDemande({ titre: '', direction: '', service: '', type: '', description: '' });
        openReunionDetail(selectedReunion);
      } else {
        const err = await res.json();
        alert(`Erreur : ${err.error || 'Erreur lors de la création'}`);
      }
    } catch (e) {
      console.error('Erreur création demande:', e);
      alert('Erreur lors de la création de la demande');
    }
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

  const getStatutColor = (statut: string) => {
    switch (statut) {
      case 'importée': return '#3b82f6';
      case 'planifiée': return '#f59e0b';
      case 'effectuée': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getArbitrageColor = (arbitrage: string) => {
    if (arbitrage.includes('OK')) return '#10b981';
    if (arbitrage.includes('En attente')) return '#f59e0b';
    if (arbitrage.includes('Refusé')) return '#ef4444';
    return '#6b7280';
  };

  return (
    <div style={styles.container}>
      <Header />

      <main style={styles.mainContent}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          <h2 style={styles.title}>Rencontres Budgétaires</h2>
          <div style={styles.toolbarActions}>
            <button
              style={styles.toolbarBtn}
              onClick={handleImportClick}
              disabled={isImporting}
              title="Importer un fichier Excel"
            >
              <Upload size={18} />
              <span>{isImporting ? 'Import...' : 'Importer'}</span>
            </button>
            <button
              style={{ ...styles.toolbarBtn, backgroundColor: showManageReunions ? '#1d4ed8' : undefined, color: showManageReunions ? 'white' : undefined }}
              onClick={() => setShowManageReunions(v => !v)}
              title="Gérer les réunions"
            >
              <Plus size={18} />
              <span>Réunions{reunions.length > 0 ? ` (${reunions.length})` : ''}</span>
            </button>
            <button
              style={styles.toolbarBtn}
              onClick={openEmailsModal}
              title="Gérer les emails par direction"
            >
              <Mail size={18} />
              <span>Emails</span>
            </button>
            <button
              style={styles.toolbarBtn}
              onClick={() => setShowColumnConfig(!showColumnConfig)}
              title="Paramètres colonnes"
            >
              <Columns size={18} />
            </button>
            <button
              style={{...styles.toolbarBtn, backgroundColor: '#ef4444'}}
              onClick={handleDeleteAll}
              title="Supprimer TOUTES les demandes (Admin only)"
            >
              <AlertCircle size={18} />
              <span>Supprimer tout</span>
            </button>
          </div>
        </div>

        {/* Filtres */}
        <div style={styles.filterBar}>
          <div style={styles.searchBox}>
            <Search size={16} style={{ opacity: 0.5 }} />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          <select
            value={selectedDirection}
            onChange={(e) => setSelectedDirection(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">Toutes directions</option>
            {directions.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select
            value={selectedAnnee}
            onChange={(e) => setSelectedAnnee(e.target.value ? parseInt(e.target.value) : '')}
            style={styles.filterSelect}
          >
            <option value="">Toutes années</option>
            {annees.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <select
            value={selectedStatut}
            onChange={(e) => setSelectedStatut(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">Tous statuts</option>
            <option value="importée">Importée</option>
            <option value="planifiée">Planifiée</option>
            <option value="effectuée">Effectuée</option>
          </select>

          <button
            style={styles.resetBtn}
            onClick={() => {
              setSelectedDirection('');
              setSelectedAnnee('');
              setSelectedStatut('');
              setSearchTerm('');
            }}
          >
            Réinitialiser
          </button>
        </div>

        {/* Tableau */}
        <div style={styles.tableContainer}>
          {loading ? (
            <div style={styles.loading}>Chargement...</div>
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
                  <th style={styles.th}>Arbitrage</th>
                  <th style={styles.th}>Statut</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRencontres.map(r => (
                  <React.Fragment key={r.id}>
                    <tr
                      style={styles.row}
                    >
                      <td style={styles.td}>{r.direction}</td>
                      <td
                        style={{
                          ...styles.td,
                          cursor: 'pointer',
                          color: '#2563eb',
                          textDecoration: 'underline',
                          fontWeight: '500'
                        }}
                        onClick={() => {
                          setSelectedRencontre(r);
                          setShowDetailModal(true);
                        }}
                        title="Cliquer pour voir les détails"
                      >
                        {r.titre.substring(0, 60)}
                      </td>
                      <td style={styles.td}>
                        {r.date_reunion ? new Date(r.date_reunion).toLocaleDateString('fr-FR') : '-'}
                      </td>
                      <td style={styles.td}>{r.cout_ttc?.toFixed(2) || 0}€</td>
                      <td style={{ ...styles.td, color: getArbitrageColor(r.arbitrage) }}>
                        <strong>{r.arbitrage || '-'}</strong>
                      </td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            backgroundColor: getStatutColor(r.statut),
                            color: 'white'
                          }}
                        >
                          {r.statut}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <button
                          style={{ ...styles.iconBtn, marginRight: '8px' }}
                          onClick={() => {
                            setSelectedRencontre(r);
                            setShowDetailModal(true);
                          }}
                          title="Détails"
                        >
                          <Info size={16} />
                        </button>
                        {r.ticket_glpi && (
                          <button
                            style={{ ...styles.iconBtn, marginRight: '8px', background: '#ede9fe', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', color: '#7c3aed', gap: '4px', display: 'inline-flex', alignItems: 'center' }}
                            onClick={() => handleOpenGlpiTicket(r.id)}
                            title={`Ouvrir ticket GLPI #${r.ticket_glpi}`}
                          >
                            <Ticket size={13} />
                            #{r.ticket_glpi}
                          </button>
                        )}
                        <button
                          style={styles.iconBtn}
                          onClick={() => handleDeleteRencontre(r.id)}
                          title="Supprimer"
                        >
                          <Trash2 size={16} color="#ef4444" />
                        </button>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Détail - Complète avec tous les champs */}
        {showDetailModal && selectedRencontre && (
          <div style={styles.modalOverlay} onClick={() => setShowDetailModal(false)}>
            <div style={{...styles.modal, maxWidth: '800px', maxHeight: '90vh'}} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>
                  {isEditMode ? '✏️ Édition' : selectedRencontre.titre}
                </h3>
                <div style={{display: 'flex', gap: '8px'}}>
                  {!isEditMode && (
                    <button
                      style={{...styles.modalCloseBtn, padding: '8px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}
                      onClick={handleEditClick}
                      title="Éditer"
                    >
                      ✏️ Éditer
                    </button>
                  )}
                  <button style={styles.modalCloseBtn} onClick={() => {
                    if (isEditMode) {
                      handleCancelEdit();
                    } else {
                      setShowDetailModal(false);
                    }
                  }}>
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div style={{...styles.modalContent, overflowY: 'auto', maxHeight: 'calc(90vh - 180px)'}}>
                {/* Première section - Informations principales */}
                <div style={styles.modalSection}>
                  <h4 style={styles.sectionTitle}>📋 Informations Principales</h4>
                  <div style={styles.detailGrid2}>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Direction</label>
                      {isEditMode ? (
                        <select
                          style={styles.editInput}
                          value={editedData?.direction || ''}
                          onChange={(e) => handleEditFieldChange('direction', e.target.value)}
                        >
                          <option value="">-- Sélectionner --</option>
                          {directions.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      ) : (
                        <p style={styles.value}>{selectedRencontre.direction}</p>
                      )}
                    </div>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Service</label>
                      {isEditMode ? (
                        <select
                          style={styles.editInput}
                          value={editedData?.service || ''}
                          onChange={(e) => handleEditFieldChange('service', e.target.value)}
                        >
                          <option value="">-- Sélectionner --</option>
                          {services.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <p style={styles.value}>{selectedRencontre.service || '-'}</p>
                      )}
                    </div>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Date</label>
                      {isEditMode ? (
                        <input
                          type="date"
                          style={styles.editInput}
                          value={editedData?.date_reunion ? editedData.date_reunion.split('T')[0] : ''}
                          onChange={(e) => handleEditFieldChange('date_reunion', e.target.value)}
                        />
                      ) : (
                        <p style={styles.value}>
                          {selectedRencontre.date_reunion ? new Date(selectedRencontre.date_reunion).toLocaleDateString('fr-FR') : '-'}
                        </p>
                      )}
                    </div>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Année</label>
                      {isEditMode ? (
                        <input
                          type="number"
                          style={styles.editInput}
                          value={editedData?.annee || ''}
                          onChange={(e) => handleEditFieldChange('annee', parseInt(e.target.value))}
                        />
                      ) : (
                        <p style={styles.value}>{selectedRencontre.annee || '-'}</p>
                      )}
                    </div>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Type</label>
                      {isEditMode ? (
                        <select
                          style={styles.editInput}
                          value={editedData?.type || ''}
                          onChange={(e) => handleEditFieldChange('type', e.target.value)}
                        >
                          <option value="">-- Sélectionner --</option>
                          {types.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                          <option value="Demande">Demande</option>
                          <option value="Investissement">Investissement</option>
                        </select>
                      ) : (
                        <p style={styles.value}>{selectedRencontre.type || '-'}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Deuxième section - Finances */}
                <div style={styles.modalSection}>
                  <h4 style={styles.sectionTitle}>💰 Informations Financières</h4>
                  <div style={styles.detailGrid2}>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Montant TTC</label>
                      {isEditMode ? (
                        <input
                          type="number"
                          step="0.01"
                          style={styles.editInput}
                          value={editedData?.cout_ttc || ''}
                          onChange={(e) => handleEditFieldChange('cout_ttc', parseFloat(e.target.value))}
                        />
                      ) : (
                        <p style={{...styles.value, fontSize: '18px', fontWeight: 'bold', color: '#10b981'}}>
                          {selectedRencontre.cout_ttc?.toFixed(2) || 0}€
                        </p>
                      )}
                    </div>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Arbitrage</label>
                      {isEditMode ? (
                        <select
                          style={styles.editInput}
                          value={editedData?.arbitrage || ''}
                          onChange={(e) => handleEditFieldChange('arbitrage', e.target.value)}
                        >
                          <option value="">-- Sélectionner --</option>
                          {arbitrages.map(a => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </select>
                      ) : (
                        <p style={{
                          ...styles.value,
                          color: getArbitrageColor(selectedRencontre.arbitrage),
                          fontWeight: 'bold',
                          fontSize: '16px'
                        }}>
                          {selectedRencontre.arbitrage || '-'}
                        </p>
                      )}
                    </div>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Statut</label>
                      {isEditMode ? (
                        <select
                          style={styles.editInput}
                          value={editedData?.statut || ''}
                          onChange={(e) => handleEditFieldChange('statut', e.target.value)}
                        >
                          <option value="">-- Sélectionner --</option>
                          {statuts.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{
                          ...styles.badge,
                          backgroundColor: getStatutColor(selectedRencontre.statut),
                          color: 'white',
                          display: 'inline-block'
                        }}>
                          {selectedRencontre.statut}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Troisième section - Description et Commentaires */}
                <div style={styles.modalSection}>
                  <h4 style={styles.sectionTitle}>📝 Description</h4>
                  <div style={{...styles.detailField, marginBottom: '16px'}}>
                    <label style={styles.label}>Détails de la demande</label>
                    {isEditMode ? (
                      <textarea
                        style={{...styles.editInput, minHeight: '100px', fontFamily: 'monospace'}}
                        value={editedData?.description || ''}
                        onChange={(e) => handleEditFieldChange('description', e.target.value)}
                      />
                    ) : (
                      <p style={{...styles.value, whiteSpace: 'pre-wrap', lineHeight: '1.6'}}>
                        {selectedRencontre.description || '-'}
                      </p>
                    )}
                  </div>

                  <div style={styles.detailField}>
                    <label style={styles.label}>Commentaires</label>
                    {isEditMode ? (
                      <textarea
                        style={{...styles.editInput, minHeight: '80px', fontFamily: 'monospace'}}
                        value={editedData?.commentaires || ''}
                        onChange={(e) => handleEditFieldChange('commentaires', e.target.value)}
                      />
                    ) : (
                      <p style={{...styles.value, whiteSpace: 'pre-wrap', lineHeight: '1.6'}}>
                        {selectedRencontre.commentaires || '-'}
                      </p>
                    )}
                  </div>

                  <div style={styles.detailField}>
                    <label style={styles.label}>Suivi</label>
                    {isEditMode ? (
                      <textarea
                        style={{...styles.editInput, minHeight: '80px', fontFamily: 'monospace'}}
                        value={editedData?.suivi || ''}
                        onChange={(e) => handleEditFieldChange('suivi', e.target.value)}
                      />
                    ) : (
                      <p style={{...styles.value, whiteSpace: 'pre-wrap', lineHeight: '1.6'}}>
                        {selectedRencontre.suivi || '-'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Quatrième section - Suivi et Responsabilité */}
                <div style={styles.modalSection}>
                  <h4 style={styles.sectionTitle}>👤 Responsabilité</h4>
                  <div style={styles.detailGrid2}>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Responsable DSI</label>
                      {isEditMode ? (
                        <input
                          type="text"
                          style={styles.editInput}
                          value={editedData?.responsable_dsi || ''}
                          onChange={(e) => handleEditFieldChange('responsable_dsi', e.target.value)}
                          placeholder="ex: IRS, SSD"
                        />
                      ) : (
                        <p style={styles.value}>{selectedRencontre.responsable_dsi || '-'}</p>
                      )}
                    </div>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Ticket GLPI</label>
                      {isEditMode ? (
                        <input
                          type="text"
                          style={styles.editInput}
                          value={editedData?.ticket_glpi || ''}
                          onChange={(e) => handleEditFieldChange('ticket_glpi', e.target.value)}
                          placeholder="ex: 43093"
                        />
                      ) : (
                        <p style={{...styles.value, fontFamily: 'monospace'}}>
                          {selectedRencontre.ticket_glpi || '-'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Cinquième section - Références */}
                {(selectedRencontre.lien_reference || isEditMode) && (
                  <div style={styles.modalSection}>
                    <h4 style={styles.sectionTitle}>🔗 Références</h4>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Lien</label>
                      {isEditMode ? (
                        <input
                          type="text"
                          style={styles.editInput}
                          value={editedData?.lien_reference || ''}
                          onChange={(e) => handleEditFieldChange('lien_reference', e.target.value)}
                          placeholder="ex: https://..."
                        />
                      ) : (
                        <p style={{...styles.value, fontFamily: 'monospace', fontSize: '13px'}}>
                          {selectedRencontre.lien_reference || '-'}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Sixième section - Dates */}
                <div style={styles.modalSection}>
                  <h4 style={styles.sectionTitle}>📅 Dates</h4>
                  <div style={styles.detailGrid2}>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Créée le</label>
                      <p style={{...styles.value, fontSize: '12px', color: '#6b7280'}}>
                        {selectedRencontre.created_at ? new Date(selectedRencontre.created_at).toLocaleDateString('fr-FR') : '-'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div style={styles.modalFooter}>
                {isEditMode ? (
                  <>
                    <button
                      style={{ ...styles.btn, backgroundColor: '#ef4444', color: 'white', border: 'none' }}
                      onClick={handleCancelEdit}
                      disabled={isEditSaving}
                    >
                      ❌ Annuler
                    </button>
                    <button
                      style={{ ...styles.btn, backgroundColor: '#10b981', color: 'white', border: 'none' }}
                      onClick={handleSaveEdit}
                      disabled={isEditSaving}
                    >
                      {isEditSaving ? '💾 Enregistrement...' : '💾 Enregistrer'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      style={{ ...styles.btn, ...styles.btnDanger }}
                      onClick={() => handleDeleteRencontre(selectedRencontre.id)}
                    >
                      🗑️ Supprimer
                    </button>
                    <button
                      style={{
                        ...styles.btn,
                        backgroundColor: isCreatingTicket ? '#94a3b8' : '#7c3aed',
                        color: 'white',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: isCreatingTicket ? 'not-allowed' : 'pointer',
                      }}
                      onClick={selectedRencontre.ticket_glpi ? () => handleOpenGlpiTicket(selectedRencontre.id) : handleCreateGlpiTicket}
                      disabled={isCreatingTicket}
                      title={selectedRencontre.ticket_glpi ? `Ouvrir ticket GLPI #${selectedRencontre.ticket_glpi}` : 'Créer un ticket GLPI'}
                    >
                      <Ticket size={16} />
                      {isCreatingTicket ? 'Création...' : selectedRencontre.ticket_glpi ? `GLPI #${selectedRencontre.ticket_glpi}` : 'Créer ticket GLPI'}
                    </button>
                    <button
                      style={styles.btn}
                      onClick={() => setShowDetailModal(false)}
                    >
                      Fermer
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal Gestion des emails - Nouveau Design */}
        {showEmailsModal && (
          <div style={{...styles.modalOverlay, zIndex: 50}}>
            <div style={{...styles.modalDialog, maxWidth: '750px', background: '#ffffff'}}>
              {/* Header Gradient */}
              <div style={{background: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)', padding: '30px', color: 'white', borderRadius: '12px 12px 0 0', position: 'relative'}}>
                <button
                  onClick={() => setShowEmailsModal(false)}
                  style={{position: 'absolute', top: '15px', right: '15px', background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: 'white', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s'}}
                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.3)'}
                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.2)'}
                >
                  <X size={20} />
                </button>
                <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px'}}>
                  <div style={{width: '48px', height: '48px', background: 'rgba(255,255,255,0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    <Mail size={28} />
                  </div>
                  <div>
                    <h2 style={{margin: 0, fontSize: '24px', fontWeight: '700'}}>Affectation des emails</h2>
                    <p style={{margin: '4px 0 0 0', fontSize: '14px', opacity: 0.9}}>Gérez les adresses email par direction</p>
                  </div>
                </div>
              </div>

              <div style={{padding: '30px', overflowY: 'auto', maxHeight: 'calc(85vh - 280px)'}}>
                {/* Formulaire d'ajout */}
                <div style={{background: '#f8fafc', border: '2px dashed #2563eb', borderRadius: '12px', padding: '24px', marginBottom: '30px'}}>
                  <h3 style={{margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#1e293b'}}>➕ Ajouter un nouvel email</h3>
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr 0.7fr', gap: '12px'}}>
                    <div>
                      <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px'}}>DIRECTION</label>
                      <select
                        style={{width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', cursor: 'pointer'}}
                        value={selectedEmailDirection}
                        onChange={(e) => setSelectedEmailDirection(e.target.value)}
                      >
                        <option value="">Sélectionner...</option>
                        {directions.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px'}}>SERVICE (optionnel)</label>
                      <input
                        type="text"
                        placeholder="ex: Communication"
                        style={{width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px'}}
                        value={selectedEmailService}
                        onChange={(e) => setSelectedEmailService(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px'}}>ADRESSE EMAIL</label>
                      <input
                        type="email"
                        placeholder="exemple@domain.com"
                        style={{width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px'}}
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                      />
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'}}>
                      <button
                        style={{padding: '10px 16px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s'}}
                        onClick={handleAddEmail}
                        disabled={isAddingEmail}
                        onMouseEnter={(e) => !isAddingEmail && ((e.currentTarget as HTMLElement).style.backgroundColor = '#1d4ed8')}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#2563eb')}
                      >
                        {isAddingEmail ? '⏳' : '➕'} Ajouter
                      </button>
                    </div>
                  </div>
                </div>

                {/* Liste des emails */}
                {emailsLoading ? (
                  <div style={{textAlign: 'center', padding: '40px', color: '#94a3b8'}}>
                    <div style={{fontSize: '32px', marginBottom: '12px'}}>⏳</div>
                    <p>Chargement en cours...</p>
                  </div>
                ) : directionEmails.length === 0 ? (
                  <div style={{textAlign: 'center', padding: '40px', color: '#94a3b8'}}>
                    <div style={{fontSize: '48px', marginBottom: '12px', opacity: 0.5}}>📭</div>
                    <p style={{fontSize: '15px', margin: 0}}>Aucun email attribué pour le moment</p>
                    <p style={{fontSize: '13px', margin: '4px 0 0 0', color: '#cbd5e1'}}>Commencez par en ajouter un ci-dessus</p>
                  </div>
                ) : (
                  <div>
                    {directions.map(direction => {
                      const dirEmails = directionEmails.filter(e => e.direction === direction);
                      if (dirEmails.length === 0) return null;
                      return (
                        <div key={direction} style={{marginBottom: '20px'}}>
                          <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px'}}>
                            <div style={{width: '4px', height: '24px', background: '#2563eb', borderRadius: '2px'}}></div>
                            <h4 style={{margin: 0, fontSize: '15px', fontWeight: '700', color: '#1e293b'}}>{direction}</h4>
                            <span style={{background: '#dbeafe', color: '#0c4a6e', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600'}}>{dirEmails.length}</span>
                          </div>
                          <div style={{display: 'grid', gap: '8px'}}>
                            {dirEmails.map(de => (
                              <div
                                key={de.id}
                                style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', transition: 'all 0.2s'}}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLElement).style.background = '#f1f5f9';
                                  (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1';
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLElement).style.background = '#f8fafc';
                                  (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0';
                                }}
                              >
                                <div style={{display: 'flex', alignItems: 'center', gap: '10px', flex: 1}}>
                                  <div style={{width: '32px', height: '32px', background: '#e0e7ff', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                    <Mail size={16} color="#2563eb" />
                                  </div>
                                  <div>
                                    <span style={{fontFamily: 'monospace', color: '#475569', fontSize: '14px'}}>{de.email}</span>
                                    {de.service && <span style={{marginLeft: '8px', background: '#f0fdf4', color: '#16a34a', fontSize: '11px', fontWeight: '600', padding: '2px 7px', borderRadius: '4px'}}>{de.service}</span>}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  style={{background: '#fee2e2', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s'}}
                                  onClick={() => handleDeleteEmail(de.id)}
                                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#fecaca'}
                                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = '#fee2e2'}
                                  title="Supprimer cet email"
                                >
                                  <Trash2 size={13} />
                                  Supprimer
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{padding: '16px 30px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderRadius: '0 0 12px 12px', display: 'flex', justifyContent: 'flex-end'}}>
                <button
                  style={{padding: '10px 24px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s'}}
                  onClick={() => setShowEmailsModal(false)}
                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = '#1d4ed8'}
                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = '#2563eb'}
                >
                  ✓ Fermer
                </button>
              </div>
            </div>
          </div>
        )}

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
                <button onClick={() => { setShowCreateReunionModal(true); setShowManageReunions(false); }} style={{padding: '10px 18px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px'}}>
                  <Plus size={16} /> Créer une réunion
                </button>
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
                        <tr key={r.id} style={{borderBottom: '1px solid #f1f5f9', cursor: 'pointer'}} onClick={() => { openReunionDetail(r); setShowManageReunions(false); }}>
                          <td style={{padding: '10px 12px', fontWeight: '600', color: '#1e293b'}}>{r.titre}</td>
                          <td style={{padding: '10px 12px', color: '#475569'}}>{r.date_reunion ? new Date(r.date_reunion).toLocaleDateString('fr-FR') : '-'}</td>
                          <td style={{padding: '10px 12px', color: '#475569'}}>{r.lieu || '-'}</td>
                          <td style={{padding: '10px 12px'}}>
                            <span style={{padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', background: r.statut === 'effectuée' ? '#dcfce7' : '#fef3c7', color: r.statut === 'effectuée' ? '#16a34a' : '#92400e'}}>{r.statut}</span>
                          </td>
                          <td style={{padding: '10px 12px', textAlign: 'right'}}><Eye size={15} color="#64748b" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modale création réunion */}
        {showCreateReunionModal && (
          <div style={{position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}}>
            <div style={{background: 'white', borderRadius: '16px', width: '100%', maxWidth: '780px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.25)'}}>
              {/* Header */}
              <div style={{padding: '24px 28px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <h2 style={{margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e293b'}}>📅 Nouvelle Réunion Budgétaire</h2>
                <button onClick={() => setShowCreateReunionModal(false)} style={{background: '#f1f5f9', border: 'none', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><X size={16} /></button>
              </div>
              <div style={{flex: 1, overflowY: 'auto', padding: '24px 28px'}}>
                {/* Infos réunion */}
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px'}}>
                  <div style={{gridColumn: '1/-1'}}>
                    <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px'}}>TITRE *</label>
                    <input type="text" placeholder="Ex: Rencontre DIRCOM 2025" style={{width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px'}} value={newReunion.titre} onChange={e => setNewReunion(v => ({...v, titre: e.target.value}))} />
                  </div>
                  <div>
                    <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px'}}>DATE *</label>
                    <input type="date" style={{width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px'}} value={newReunion.date_reunion} onChange={e => setNewReunion(v => ({...v, date_reunion: e.target.value}))} />
                  </div>
                  <div>
                    <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px'}}>LIEU</label>
                    <input type="text" placeholder="Ex: Salle Ivry" style={{width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px'}} value={newReunion.lieu} onChange={e => setNewReunion(v => ({...v, lieu: e.target.value}))} />
                  </div>
                  <div style={{gridColumn: '1/-1'}}>
                    <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px'}}>DESCRIPTION</label>
                    <textarea rows={2} style={{width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', resize: 'vertical'}} value={newReunion.description} onChange={e => setNewReunion(v => ({...v, description: e.target.value}))} />
                  </div>
                </div>

                {/* Participants */}
                <h3 style={{margin: '0 0 14px', fontSize: '14px', fontWeight: '700', color: '#1e293b', borderTop: '1px solid #e2e8f0', paddingTop: '16px'}}>Participants ({reunionParticipants.length})</h3>

                {/* Recherche DSI (AD) */}
                <div style={{background: '#eff6ff', borderRadius: '10px', padding: '14px', marginBottom: '14px'}}>
                  <div style={{fontSize: '12px', fontWeight: '700', color: '#1d4ed8', marginBottom: '8px'}}>🔍 Ajouter un agent DSI (Active Directory)</div>
                  <div style={{position: 'relative'}}>
                    <input type="text" placeholder="Rechercher par nom..." style={{width: '100%', padding: '9px 12px', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '14px'}} value={adQuery} onChange={e => searchAD(e.target.value)} />
                    {adSearching && <span style={{position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#64748b'}}>...</span>}
                  </div>
                  {adResults.length > 0 && (
                    <div style={{marginTop: '8px', border: '1px solid #bfdbfe', borderRadius: '8px', background: 'white', maxHeight: '160px', overflowY: 'auto'}}>
                      {adResults.map(u => (
                        <div key={u.username} style={{padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9'}} onClick={() => addParticipantFromAD(u)}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#eff6ff'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}>
                          <div>
                            <div style={{fontWeight: '600', fontSize: '13px'}}>{u.displayName}</div>
                            <div style={{fontSize: '11px', color: '#64748b'}}>{u.email}{u.service ? ` — ${u.service}` : ''}{u.direction ? ` / ${u.direction}` : ''}</div>
                          </div>
                          <Plus size={14} color="#2563eb" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Ajout manuel (Métiers) */}
                <div style={{background: '#f0fdf4', borderRadius: '10px', padding: '14px', marginBottom: '14px'}}>
                  <div style={{fontSize: '12px', fontWeight: '700', color: '#16a34a', marginBottom: '8px'}}>➕ Ajouter un participant Métier (manuel)</div>
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '8px', alignItems: 'end'}}>
                    <div><label style={{display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px'}}>NOM *</label><input type="text" placeholder="Nom" style={{width: '100%', padding: '8px 10px', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '13px'}} value={newParticipant.nom} onChange={e => setNewParticipant(v => ({...v, nom: e.target.value}))} /></div>
                    <div><label style={{display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px'}}>PRÉNOM</label><input type="text" placeholder="Prénom" style={{width: '100%', padding: '8px 10px', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '13px'}} value={newParticipant.prenom} onChange={e => setNewParticipant(v => ({...v, prenom: e.target.value}))} /></div>
                    <div>
                      <label style={{display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px'}}>DIRECTION</label>
                      <input type="text" placeholder='Direction' list="suggest-dir" style={{width: '100%', padding: '8px 10px', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '13px'}} value={newParticipant.direction} onChange={e => setNewParticipant(v => ({...v, direction: e.target.value}))} />
                      <datalist id="suggest-dir">{directions.map(d => <option key={d} value={d} />)}</datalist>
                    </div>
                    <div>
                      <label style={{display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px'}}>SERVICE</label>
                      <input type="text" placeholder='Service' list="suggest-svc" style={{width: '100%', padding: '8px 10px', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '13px'}} value={newParticipant.service} onChange={e => setNewParticipant(v => ({...v, service: e.target.value}))} />
                      <datalist id="suggest-svc">{services.map(s => <option key={s} value={s} />)}</datalist>
                    </div>
                    <button onClick={addParticipantManuel} style={{padding: '8px 14px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap'}}>+ Ajouter</button>
                  </div>
                </div>

                {/* Liste participants */}
                {reunionParticipants.length > 0 && (() => {
                  const dsi = reunionParticipants.filter(p => p.type_presence === 'dsi');
                  const metiers = reunionParticipants.filter(p => p.type_presence !== 'dsi');
                  return (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                      {dsi.length > 0 && (
                        <div>
                          <h4 style={{margin: '0 0 10px', fontSize: '12px', fontWeight: '700', color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em'}}>👨‍💼 DSI ({dsi.length})</h4>
                          <div style={{border: '1px solid #dbeafe', borderRadius: '8px', overflow: 'hidden', background: '#f0f9ff'}}>
                            {dsi.map((p, i) => (
                              <div key={p.id} style={{display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: i < dsi.length - 1 ? '1px solid #bfdbfe' : 'none'}}>
                                <select value={p.statut_presence} onChange={e => setReunionParticipants(prev => prev.map(x => x.id === p.id ? {...x, statut_presence: e.target.value as 'present' | 'excuse'} : x))} style={{fontSize: '11px', padding: '4px 6px', border: '1px solid #bfdbfe', borderRadius: '4px', background: 'white'}}>
                                  <option value="present">Présent</option>
                                  <option value="excuse">Excusé</option>
                                </select>
                                <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: '2px'}}>
                                  <span style={{fontSize: '13px', fontWeight: '700', color: '#1e293b'}}>{p.prenom ? `${p.prenom} ` : ''}{p.nom}</span>
                                  <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                                    {p.service && <span style={{fontSize: '11px', fontWeight: '500', background: 'rgba(0,0,0,0.05)', padding: '2px 7px', borderRadius: '3px', color: '#475569'}}>{p.service}</span>}
                                  </div>
                                </div>
                                <button onClick={() => setReunionParticipants(prev => prev.filter(x => x.id !== p.id))} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', flexShrink: 0}}><X size={14} /></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {metiers.length > 0 && (
                        <div>
                          <h4 style={{margin: '0 0 10px', fontSize: '12px', fontWeight: '700', color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em'}}>👥 Métiers ({metiers.length})</h4>
                          <div style={{border: '1px solid #bbf7d0', borderRadius: '8px', overflow: 'hidden', background: '#f0fdf4'}}>
                            {metiers.map((p, i) => (
                              <div key={p.id} style={{display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: i < metiers.length - 1 ? '1px solid #86efac' : 'none'}}>
                                <select value={p.statut_presence} onChange={e => setReunionParticipants(prev => prev.map(x => x.id === p.id ? {...x, statut_presence: e.target.value as 'present' | 'excuse'} : x))} style={{fontSize: '11px', padding: '4px 6px', border: '1px solid #86efac', borderRadius: '4px', background: 'white'}}>
                                  <option value="present">Présent</option>
                                  <option value="excuse">Excusé</option>
                                </select>
                                <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: '2px'}}>
                                  <span style={{fontSize: '13px', fontWeight: '700', color: '#1e293b'}}>{p.prenom ? `${p.prenom} ` : ''}{p.nom}</span>
                                  <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                                    {p.service && <span style={{fontSize: '11px', fontWeight: '500', background: 'rgba(0,0,0,0.05)', padding: '2px 7px', borderRadius: '3px', color: '#475569'}}>{p.service}</span>}
                                  </div>
                                </div>
                                <button onClick={() => setReunionParticipants(prev => prev.filter(x => x.id !== p.id))} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', flexShrink: 0}}><X size={14} /></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              {/* Footer */}
              <div style={{padding: '16px 28px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '12px', justifyContent: 'flex-end'}}>
                <button onClick={() => setShowCreateReunionModal(false)} style={{padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#475569'}}>Annuler</button>
                <button onClick={handleCreateReunion} disabled={isCreatingReunion} style={{padding: '10px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700'}}>
                  {isCreatingReunion ? '...' : '✓ Créer la réunion'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modale détail réunion */}
        {showReunionDetail && selectedReunion && (
          <div style={{position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}}>
            <div style={{background: 'white', borderRadius: '16px', width: '100%', maxWidth: '860px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.25)'}}>
              <div style={{padding: '20px 24px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                <div>
                  <h2 style={{margin: '0 0 4px', fontSize: '17px', fontWeight: '800', color: '#1e293b'}}>{selectedReunion.titre}</h2>
                  <p style={{margin: 0, fontSize: '13px', color: '#64748b'}}>{selectedReunion.date_reunion ? new Date(selectedReunion.date_reunion).toLocaleDateString('fr-FR') : ''}{selectedReunion.lieu ? ` — ${selectedReunion.lieu}` : ''}</p>
                </div>
                <div style={{display: 'flex', gap: '8px'}}>
                  <button onClick={() => setShowCreateDemandeModal(true)} style={{padding: '8px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px'}}><Plus size={14} /> Demande</button>
                  <button onClick={() => handleDeleteReunion(selectedReunion.id)} style={{padding: '8px 14px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px'}}><Trash2 size={14} /></button>
                  <button onClick={() => setShowReunionDetail(false)} style={{background: '#f1f5f9', border: 'none', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><X size={16} /></button>
                </div>
              </div>
              <div style={{flex: 1, overflowY: 'auto', padding: '20px 24px'}}>
                {/* Participants */}
                <div style={{marginBottom: '20px'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                    <h4 style={{margin: 0, fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Participants ({selectedReunion.participants?.length || 0})</h4>
                    <button onClick={() => setShowAddParticipantDetail(!showAddParticipantDetail)} style={{padding: '4px 10px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px'}}><Plus size={13} /> Ajouter</button>
                  </div>

                  {showAddParticipantDetail && (
                    <div style={{background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px', marginBottom: '12px'}}>
                      {/* Recherche DSI */}
                      <div style={{marginBottom: '12px'}}>
                        <div style={{fontSize: '11px', fontWeight: '700', color: '#1d4ed8', marginBottom: '6px'}}>🔍 Ajouter agent DSI</div>
                        <div style={{position: 'relative'}}>
                          <input type="text" placeholder="Rechercher par nom..." style={{width: '100%', padding: '8px 10px', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '13px'}} value={detailAdQuery} onChange={e => searchADDetail(e.target.value)} />
                          {detailAdSearching && <span style={{position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#64748b'}}>...</span>}
                        </div>
                        {detailAdResults.length > 0 && (
                          <div style={{marginTop: '6px', border: '1px solid #bfdbfe', borderRadius: '6px', background: 'white', maxHeight: '120px', overflowY: 'auto'}}>
                            {detailAdResults.map(u => (
                              <div key={u.username} style={{padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}} onClick={() => addParticipantFromADDetail(u)} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#eff6ff'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}>
                                <div>
                                  <div style={{fontWeight: '600'}}>{u.displayName}</div>
                                  <div style={{fontSize: '10px', color: '#64748b'}}>{u.email}{u.service ? ` — ${u.service}` : ''}</div>
                                </div>
                                <Plus size={12} color="#2563eb" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Ajout manuel */}
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '6px', fontSize: '12px'}}>
                        <div><input type="text" placeholder="Nom" style={{width: '100%', padding: '6px 8px', border: '1px solid #bbf7d0', borderRadius: '4px', fontSize: '12px'}} value={detailNewParticipant.nom} onChange={e => setDetailNewParticipant(v => ({...v, nom: e.target.value}))} /></div>
                        <div><input type="text" placeholder="Service" style={{width: '100%', padding: '6px 8px', border: '1px solid #bbf7d0', borderRadius: '4px', fontSize: '12px'}} value={detailNewParticipant.service} onChange={e => setDetailNewParticipant(v => ({...v, service: e.target.value}))} /></div>
                        <button onClick={addParticipantManuelDetail} disabled={isAddingDetailParticipant} style={{padding: '6px 10px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '11px', whiteSpace: 'nowrap'}}>+ Ajouter</button>
                      </div>
                    </div>
                  )}

                  {(selectedReunion.participants || []).length === 0 ? <p style={{color: '#94a3b8', fontSize: '13px'}}>Aucun participant</p> : (
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px'}}>
                      {(selectedReunion.participants || []).map(p => (
                        <div key={p.id} style={{display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', background: p.type_presence === 'dsi' ? '#eff6ff' : '#f0fdf4', borderRadius: '20px', border: `1px solid ${p.type_presence === 'dsi' ? '#bfdbfe' : '#bbf7d0'}`, fontSize: '13px'}}>
                          <span style={{fontWeight: '600'}}>{p.prenom ? `${p.prenom} ` : ''}{p.nom}</span>
                          {p.service && <span style={{color: '#64748b', fontSize: '11px'}}>— {p.service}</span>}
                          <button onClick={() => handleDeleteParticipant(p.id)} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0 2px', lineHeight: 1}}><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Demandes */}
                <h4 style={{margin: '0 0 10px', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', borderTop: '1px solid #e2e8f0', paddingTop: '16px'}}>Demandes ({selectedReunion.demandes?.length || 0})</h4>
                {(selectedReunion.demandes || []).length === 0 ? <p style={{color: '#94a3b8', fontSize: '13px'}}>Aucune demande — <span style={{color: '#2563eb', cursor: 'pointer'}} onClick={() => setShowCreateDemandeModal(true)}>en ajouter une</span></p> : (
                  <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '13px'}}>
                    <thead><tr style={{borderBottom: '1px solid #e2e8f0', background: '#f8fafc'}}>
                      <th style={{padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#475569'}}>Demande</th>
                      <th style={{padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#475569'}}>Direction / Service</th>
                      <th style={{padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#475569'}}>Type</th>
                      <th style={{padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#475569'}}>Statut</th>
                    </tr></thead>
                    <tbody>
                      {(selectedReunion.demandes || []).map(d => (
                        <tr key={d.id} style={{borderBottom: '1px solid #f1f5f9'}}>
                          <td style={{padding: '8px 12px', fontWeight: '600', color: '#1e293b'}}>{d.titre}</td>
                          <td style={{padding: '8px 12px', color: '#475569'}}>{d.direction}{d.service ? ` / ${d.service}` : ''}</td>
                          <td style={{padding: '8px 12px', color: '#475569'}}>{d.type || '-'}</td>
                          <td style={{padding: '8px 12px'}}><span style={{padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', background: '#fef3c7', color: '#92400e'}}>{d.statut}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modale création demande dans une réunion */}
        {showCreateDemandeModal && selectedReunion && (
          <div style={{position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}}>
            <div style={{background: 'white', borderRadius: '14px', width: '100%', maxWidth: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.3)'}}>
              <div style={{padding: '20px 24px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <h3 style={{margin: 0, fontSize: '16px', fontWeight: '800', color: '#1e293b'}}>Nouvelle demande — {selectedReunion.titre}</h3>
                <button onClick={() => setShowCreateDemandeModal(false)} style={{background: '#f1f5f9', border: 'none', cursor: 'pointer', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><X size={15} /></button>
              </div>
              <div style={{flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr', gap: '14px'}}>
                <div>
                  <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '5px'}}>TITRE DE LA DEMANDE *</label>
                  <input type="text" style={{width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px'}} value={newDemande.titre} onChange={e => setNewDemande(v => ({...v, titre: e.target.value}))} />
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '5px'}}>DIRECTION *</label>
                  <select style={{width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: 'white'}} value={newDemande.direction} onChange={e => setNewDemande(v => ({...v, direction: e.target.value}))}>
                    <option value="">-- Sélectionner --</option>
                    {[...new Set((selectedReunion?.participants || []).map(p => p.direction).filter(Boolean))].map(d => <option key={d} value={d as string}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '5px'}}>SERVICE (depuis les participants)</label>
                  <select style={{width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: 'white'}} value={newDemande.service} onChange={e => setNewDemande(v => ({...v, service: e.target.value}))}>
                    <option value="">-- Sélectionner --</option>
                    {suggestedServices.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '5px'}}>TYPE</label>
                  <select style={{width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: 'white'}} value={newDemande.type} onChange={e => setNewDemande(v => ({...v, type: e.target.value}))}>
                    <option value="">-- Sélectionner --</option>
                    <option value="Demande">Demande</option>
                    <option value="Investissement">Investissement</option>
                    <option value="Projet">Projet</option>
                  </select>
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '5px'}}>DESCRIPTION</label>
                  <textarea rows={4} style={{width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', resize: 'vertical'}} value={newDemande.description} onChange={e => setNewDemande(v => ({...v, description: e.target.value}))} />
                </div>
              </div>
              <div style={{padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', justifyContent: 'flex-end'}}>
                <button onClick={() => setShowCreateDemandeModal(false)} style={{padding: '9px 18px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#475569'}}>Annuler</button>
                <button onClick={handleCreateDemande} style={{padding: '9px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700'}}>✓ Créer la demande</button>
              </div>
            </div>
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".csv,text/csv"
          style={{ display: 'none' }}
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
    backgroundColor: '#f4f4f4',
  },
  mainContent: {
    padding: '40px 20px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  } as React.CSSProperties,
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    margin: 0,
    color: '#1d1d1b',
  } as React.CSSProperties,
  toolbarActions: {
    display: 'flex',
    gap: '8px',
  } as React.CSSProperties,
  toolbarBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  } as React.CSSProperties,
  filterBar: {
    display: 'flex',
    gap: '12px',
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
    padding: '8px 12px',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    fontSize: '14px',
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
    backgroundColor: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '13px',
    fontWeight: '600',
    color: '#6b7280',
    userSelect: 'none',
  } as React.CSSProperties,
  row: {
    borderBottom: '1px solid #e5e7eb',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  td: {
    padding: '12px 16px',
    fontSize: '14px',
    color: '#1f2937',
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
