import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { Printer, Plus, Edit3, Archive, MapPin, List, Trash2, Download, Search, X, Building2, School, ArrowUpDown, ArrowUp, ArrowDown, Filter, Move, History, Gauge, ChevronDown, ChevronRight, Euro, BarChart2 } from 'lucide-react';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Copieur {
  id: number;
  direction: string;
  service: string;
  secteur: string;
  adresse: string;
  numero_serie: string;
  modele: string;
  modele_papercut: string;
  couleur: string;
  date_acquisition: string;
  nom_reseau: string;
  ip: string;
  present: string;
  nb_pages: number;
  mainteneur: string;
  divers: string;
  source: string;
  archive: boolean;
  latitude: number;
  longitude: number;
  ping_status: string;
  last_seen_active: string;
  papercut_matched: boolean;
  papercut_last_import: string;
  kpax_status: string;
  kpax_last_collecte: string;
  last_visit_date?: string;
  created_at: string;
}

interface CopieurForm {
  direction: string;
  service: string;
  secteur: string;
  adresse: string;
  numero_serie: string;
  modele: string;
  modele_papercut: string;
  couleur: string;
  date_acquisition: string;
  nom_reseau: string;
  ip: string;
  present: string;
  nb_pages: string;
  mainteneur: string;
  divers: string;
  source: string;
  archive: boolean;
  latitude: string;
  longitude: string;
}

interface CompteurTarif {
  id: number;
  code_id: number;
  tarif: string;
  date_debut: string;
  date_fin: string | null;
  created_at: string;
  created_by: string | null;
}

interface CompteurCode {
  id: number;
  mainteneur: string;
  code: string;
  libelle: string;
  format: string;
  couleur: boolean;
  description: string;
  created_at: string;
  tarifs: CompteurTarif[] | null;
  tarif_actuel: string | null;
  tarif_actuel_id: number | null;
}

interface CopieurReleve {
  id: number;
  copieur_id: number;
  code_id: number;
  date_releve: string;
  valeur: number;
  created_by: string | null;
  created_at: string;
  code: string;
  libelle: string;
  format: string;
  couleur: boolean;
  valeur_precedente: number | null;
}

const emptyForm: CopieurForm = {
  direction: '', service: '', secteur: '', adresse: '', numero_serie: '',
  modele: '', modele_papercut: '', couleur: '', date_acquisition: '',
  nom_reseau: '', ip: '', present: '', nb_pages: '', mainteneur: '',
  divers: '', source: 'ville', archive: false, latitude: '', longitude: ''
};

const Copieurs: React.FC = () => {
  const { token } = useAuth();
  const [copieurs, setCopieurs] = useState<Copieur[]>([]);
  const [filtered, setFiltered] = useState<Copieur[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filterMode, setFilterMode] = useState<'actifs' | 'archives' | 'tous'>('actifs');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'ville' | 'ecoles'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CopieurForm>(emptyForm);
  const [importResult, setImportResult] = useState<string>('');
  const [geocoding, setGeocoding] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [importingPapercut, setImportingPapercut] = useState(false);
  const papercutInputRef = useRef<HTMLInputElement>(null);
  const [importingKpax, setImportingKpax] = useState(false);
  const kpaxInputRef = useRef<HTMLInputElement>(null);
  const [kpaxAlertFilter, setKpaxAlertFilter] = useState(false);
  const [pingProgress, setPingProgress] = useState<{ current: number; total: number } | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<string>('direction');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [showColFilter, setShowColFilter] = useState<string | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTarget, setMoveTarget] = useState<Copieur | null>(null);
  const [moveForm, setMoveForm] = useState({ source: 'ville', direction: '', service: '', adresse: '', ip: '' });
  const [moves, setMoves] = useState<any[]>([]);
  const [showMoves, setShowMoves] = useState<Record<number, boolean>>({});
  const [interventions, setInterventions] = useState<Record<number, any[]>>({});
  const [showInterventions, setShowInterventions] = useState<Record<number, boolean>>({});
  const [showIntervModal, setShowIntervModal] = useState(false);
  const [intervTarget, setIntervTarget] = useState<Copieur | null>(null);
  const [intervForm, setIntervForm] = useState({ date_intervention: '', mainteneur: '', technicien: '', description: '' });
  const [ivryBoundary, setIvryBoundary] = useState<any>(null);
  const [interventionCounts, setInterventionCounts] = useState<Record<number, number>>({});
  const [importingEmails, setImportingEmails] = useState(false);
  const [showAllInterventions, setShowAllInterventions] = useState(false);
  const [allInterventions, setAllInterventions] = useState<any[]>([]);
  const [loadingAllInterventions, setLoadingAllInterventions] = useState(false);
  const [allIntervSearch, setAllIntervSearch] = useState('');
  const [allIntervSource, setAllIntervSource] = useState<'all' | 'email' | 'manuel'>('all');
  const [showCopieurInterv, setShowCopieurInterv] = useState(false);
  const [copieurIntervTarget, setCopieurIntervTarget] = useState<Copieur | null>(null);
  const [copieurIntervList, setCopieurIntervList] = useState<any[]>([]);
  const [loadingCopieurInterv, setLoadingCopieurInterv] = useState(false);
  const [copieurIntervSearch, setCopieurIntervSearch] = useState('');
  const [selectedInterv, setSelectedInterv] = useState<any | null>(null);
  const [emailPreviewHtml, setEmailPreviewHtml] = useState<string | null>(null);
  const [emailPreviewLoading, setEmailPreviewLoading] = useState(false);

  const [showVisitesModal, setShowVisitesModal] = useState(false);
  const [visitesTarget, setVisitesTarget] = useState<Copieur | null>(null);
  const [visites, setVisites] = useState<any[]>([]);
  const [loadingVisites, setLoadingVisites] = useState(false);
  const [visiteForm, setVisiteForm] = useState({ date_visite: '', annotation: '' });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [submittingVisite, setSubmittingVisite] = useState(false);
  const [activeLightbox, setActiveLightbox] = useState<string | null>(null);

  // ── Admin codes compteur (par marque) ──────────────────────────────────────
  const [showCodesAdmin, setShowCodesAdmin] = useState(false);
  const [codesAdmin, setCodesAdmin] = useState<CompteurCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [mainteneursList, setMainteneursList] = useState<string[]>([]);
  const [selectedMainteneur, setSelectedMainteneur] = useState<string>('');
  const [expandedCodeId, setExpandedCodeId] = useState<number | null>(null);
  const [showCodeForm, setShowCodeForm] = useState(false);
  const [editingCode, setEditingCode] = useState<CompteurCode | null>(null);
  const [codeForm, setCodeForm] = useState({ mainteneur: '', code: '', libelle: '', format: '', couleur: false, description: '' });
  const [savingCode, setSavingCode] = useState(false);
  const [tarifForms, setTarifForms] = useState<Record<number, { tarif: string; date_debut: string; date_fin: string }>>({});
  const [savingTarif, setSavingTarif] = useState<Record<number, boolean>>({});

  // ── Relevés trimestriels par copieur ───────────────────────────────────────
  const [showRelevesModal, setShowRelevesModal] = useState(false);
  const [relevesTarget, setRelevesTarget] = useState<Copieur | null>(null);
  const [copieurReleves, setCopieurReleves] = useState<CopieurReleve[]>([]);
  const [codesForMainteneur, setCodesForMainteneur] = useState<CompteurCode[]>([]);
  const [loadingReleves, setLoadingReleves] = useState(false);
  const [releveDate, setReleveDate] = useState('');
  const [releveValues, setReleveValues] = useState<Record<number, string>>({});
  const [savingReleve, setSavingReleve] = useState(false);

  useEffect(() => {
    axios.get('/api/copieurs/boundary').then(r => setIvryBoundary(r.data)).catch(() => {});
  }, []);

  const api = axios.create({ baseURL: '/api/copieurs', headers: { Authorization: `Bearer ${token}` } });

  const fetchCopieurs = useCallback(async () => {
    try {
      const res = await api.get(`/?filter=${filterMode}`);
      setCopieurs(res.data);
      api.get('/intervention-counts').then(r => setInterventionCounts(r.data)).catch(() => {});
    } catch (e) {
      console.error('Erreur chargement copieurs', e);
    } finally {
      setLoading(false);
    }
  }, [token, filterMode]);

  useEffect(() => { fetchCopieurs(); }, [fetchCopieurs]);

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
  };

  const sortIcon = (col: string) => {
    if (sortBy !== col) return <ArrowUpDown size={12} style={{ opacity: 0.3 }} />;
    return sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  const sorted = useCallback((list: Copieur[]) => {
    const sortedList = [...list].sort((a, b) => {
      const aVal = sortBy === 'interventions' ? (interventionCounts[a.id] ?? 0) : ((a as any)[sortBy] ?? '');
      const bVal = sortBy === 'interventions' ? (interventionCounts[b.id] ?? 0) : ((b as any)[sortBy] ?? '');
      const cmp = String(aVal).localeCompare(String(bVal), 'fr', { numeric: true });
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return sortedList;
  }, [sortBy, sortOrder, interventionCounts]);

  useEffect(() => {
    let result = copieurs;
    if (sourceFilter !== 'all') {
      result = result.filter(c => c.source === sourceFilter);
    }
    if (kpaxAlertFilter) {
      result = result.filter(isKpaxAlert);
    }
    Object.entries(colFilters).forEach(([col, val]) => {
      if (val) result = result.filter(c => String((c as any)[col] ?? '') === val);
    });
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.direction?.toLowerCase().includes(q) ||
        c.service?.toLowerCase().includes(q) ||
        c.adresse?.toLowerCase().includes(q) ||
        c.numero_serie?.toLowerCase().includes(q) ||
        c.modele?.toLowerCase().includes(q) ||
        c.ip?.toLowerCase().includes(q) ||
        c.nom_reseau?.toLowerCase().includes(q)
      );
    }
    setFiltered(sorted(result));
  }, [search, copieurs, sourceFilter, kpaxAlertFilter, colFilters, sorted]);

  const handleSubmit = async () => {
    try {
      const payload = { ...form };
      if (editingId) {
        await api.put(`/${editingId}`, payload);
      } else {
        await api.post('/', payload);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      fetchCopieurs();
    } catch (e: any) {
      alert('Erreur: ' + (e.response?.data?.error || e.response?.data?.message || e.message));
    }
  };

  const handleEdit = (c: Copieur) => {
    setForm({
      direction: c.direction || '', service: c.service || '', secteur: c.secteur || '',
      adresse: c.adresse || '', numero_serie: c.numero_serie || '',
      modele: c.modele || '', modele_papercut: c.modele_papercut || '',
      couleur: c.couleur || '', date_acquisition: c.date_acquisition || '',
      nom_reseau: c.nom_reseau || '', ip: c.ip || '', present: c.present || '',
      nb_pages: c.nb_pages?.toString() || '', mainteneur: c.mainteneur || '',
      divers: c.divers || '', source: c.source || 'ville', archive: c.archive,
      latitude: c.latitude?.toString() || '', longitude: c.longitude?.toString() || ''
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleArchive = async (id: number) => {
    await api.put(`/${id}/archive`);
    fetchCopieurs();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce copieur ?')) return;
    await api.delete(`/${id}`);
    fetchCopieurs();
  };

  const openMoveModal = (c: Copieur) => {
    setMoveTarget(c);
    setMoveForm({ source: c.source, direction: c.direction, service: c.service, adresse: c.adresse, ip: c.ip });
    setShowMoveModal(true);
  };

  const handleMove = async () => {
    if (!moveTarget) return;
    try {
      await api.post(`/${moveTarget.id}/move`, moveForm);
      setShowMoveModal(false);
      setMoveTarget(null);
      fetchCopieurs();
    } catch (e) {
      alert('Erreur lors du déménagement');
    }
  };

  const toggleMoves = async (id: number) => {
    if (showMoves[id]) {
      setShowMoves(p => ({ ...p, [id]: false }));
      return;
    }
    try {
      const res = await api.get(`/${id}/moves`);
      setMoves(res.data);
      setShowMoves(p => ({ ...p, [id]: true }));
    } catch { setMoves([]); }
  };

  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const addressTimer = useRef<any>(null);

  const searchAddress = (q: string) => {
    if (addressTimer.current) clearTimeout(addressTimer.current);
    if (q.trim().length < 3) { setAddressSuggestions([]); return; }
    addressTimer.current = setTimeout(async () => {
      setAddressSearching(true);
      try {
        const res = await api.get(`/search/address?q=${encodeURIComponent(q)}`);
        setAddressSuggestions(res.data);
      } catch { setAddressSuggestions([]); }
      finally { setAddressSearching(false); }
    }, 300);
  };

  const toggleInterventions = async (id: number) => {
    if (showInterventions[id]) {
      setShowInterventions(p => ({ ...p, [id]: false }));
      return;
    }
    try {
      const res = await api.get(`/${id}/interventions`);
      setInterventions(p => ({ ...p, [id]: res.data }));
      setShowInterventions(p => ({ ...p, [id]: true }));
    } catch {}
  };

  const openIntervModal = (c: Copieur) => {
    setIntervTarget(c);
    setIntervForm({ date_intervention: new Date().toISOString().split('T')[0], mainteneur: '', technicien: '', description: '' });
    setShowIntervModal(true);
  };

  const handleAddIntervention = async () => {
    if (!intervTarget || !intervForm.date_intervention) return;
    try {
      await api.post(`/${intervTarget.id}/interventions`, intervForm);
      setShowIntervModal(false);
      setIntervTarget(null);
      const res = await api.get(`/${intervTarget.id}/interventions`);
      setInterventions(p => ({ ...p, [intervTarget.id]: res.data }));
    } catch {
      alert('Erreur lors de l\'ajout de l\'intervention');
    }
  };

  const handleDeleteIntervention = async (copieurId: number, intervId: number) => {
    if (!confirm('Supprimer cette intervention ?')) return;
    try {
      await api.delete(`/${copieurId}/interventions/${intervId}`);
      const res = await api.get(`/${copieurId}/interventions`);
      setInterventions(p => ({ ...p, [copieurId]: res.data }));
    } catch {}
  };

  const handleImportKpax = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingKpax(true);
    setImportResult('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/import-kpax', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data.message || 'Import KPAX terminé');
      fetchCopieurs();
    } catch (err: any) {
      setImportResult('Erreur import KPAX: ' + (err.response?.data?.message || err.response?.data?.error || err.message));
    } finally {
      setImportingKpax(false);
      e.target.value = '';
    }
  };

  const handleImportEmails = async () => {
    setImportingEmails(true);
    setImportResult('');
    try {
      const res = await api.post('/import-emails');
      setImportResult(`Emails importés: ${res.data.imported} nouveaux, ${res.data.skipped} déjà présents, ${res.data.matched} copieurs matchés, ${res.data.noMatch} sans correspondance`);
      const countsRes = await api.get('/intervention-counts');
      setInterventionCounts(countsRes.data);
      const itvs = await api.get('/interventions/all');
      setAllInterventions(itvs.data);
    } catch (err: any) {
      setImportResult('Erreur import emails: ' + (err.response?.data?.message || err.response?.data?.error || err.message));
    } finally {
      setImportingEmails(false);
    }
  };

  const openCopieurInterventions = async (c: Copieur) => {
    setCopieurIntervTarget(c);
    setShowCopieurInterv(true);
    setLoadingCopieurInterv(true);
    setCopieurIntervSearch('');
    try {
      const res = await api.get(`/${c.id}/interventions`);
      setCopieurIntervList(res.data);
    } catch {}
    finally { setLoadingCopieurInterv(false); }
  };

  // ── Utilitaires ────────────────────────────────────────────────────────────

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
  };

  const fmtTarif = (t: string | null) => {
    if (!t) return '—';
    const n = parseFloat(t);
    return isNaN(n) ? t : `${n.toFixed(5)} €`;
  };

  // ── Admin codes compteur ───────────────────────────────────────────────────

  const fetchCodesAdmin = async () => {
    setLoadingCodes(true);
    try {
      const [codesRes, mainRes] = await Promise.all([
        api.get('/compteur-codes'),
        api.get('/mainteneurs'),
      ]);
      setCodesAdmin(codesRes.data);
      setMainteneursList(mainRes.data);
      if (!selectedMainteneur && mainRes.data.length > 0) setSelectedMainteneur(mainRes.data[0]);
    } catch { setCodesAdmin([]); }
    finally { setLoadingCodes(false); }
  };

  const openCodesAdmin = async () => {
    setShowCodesAdmin(true);
    setShowCodeForm(false);
    setEditingCode(null);
    setExpandedCodeId(null);
    setTarifForms({});
    await fetchCodesAdmin();
  };

  const handleSaveCode = async () => {
    if (!codeForm.mainteneur.trim() || !codeForm.code.trim()) return;
    setSavingCode(true);
    try {
      if (editingCode) {
        await api.put(`/compteur-codes/${editingCode.id}`, codeForm);
      } else {
        await api.post('/compteur-codes', codeForm);
      }
      setShowCodeForm(false);
      setEditingCode(null);
      await fetchCodesAdmin();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur sauvegarde');
    } finally { setSavingCode(false); }
  };

  const handleDeleteCode = async (codeId: number) => {
    if (!confirm('Supprimer ce code et tous ses tarifs ?')) return;
    try {
      await api.delete(`/compteur-codes/${codeId}`);
      await fetchCodesAdmin();
      if (expandedCodeId === codeId) setExpandedCodeId(null);
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur suppression'); }
  };

  const handleAddCodeTarif = async (code: CompteurCode) => {
    const form = tarifForms[code.id];
    if (!form?.tarif || !form?.date_debut) return;
    setSavingTarif(p => ({ ...p, [code.id]: true }));
    try {
      await api.post(`/compteur-codes/${code.id}/tarifs`, form);
      setTarifForms(p => ({ ...p, [code.id]: { tarif: '', date_debut: new Date().toISOString().split('T')[0], date_fin: '' } }));
      await fetchCodesAdmin();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur ajout tarif');
    } finally { setSavingTarif(p => ({ ...p, [code.id]: false })); }
  };

  const handleDeleteCodeTarif = async (code: CompteurCode, tarifId: number) => {
    if (!confirm('Supprimer ce tarif ?')) return;
    try {
      await api.delete(`/compteur-codes/${code.id}/tarifs/${tarifId}`);
      await fetchCodesAdmin();
    } catch { alert('Erreur suppression tarif'); }
  };

  // ── Relevés trimestriels par copieur ──────────────────────────────────────

  const fetchCopieurReleves = async (copieurId: number, mainteneur: string) => {
    setLoadingReleves(true);
    try {
      const [relevesRes, codesRes] = await Promise.all([
        api.get(`/${copieurId}/releves`),
        api.get(`/compteur-codes?mainteneur=${encodeURIComponent(mainteneur)}`),
      ]);
      setCopieurReleves(relevesRes.data);
      setCodesForMainteneur(codesRes.data);
    } catch { setCopieurReleves([]); setCodesForMainteneur([]); }
    finally { setLoadingReleves(false); }
  };

  const openRelevesModal = async (c: Copieur) => {
    setRelevesTarget(c);
    setShowRelevesModal(true);
    setReleveDate(new Date().toISOString().split('T')[0]);
    setReleveValues({});
    setSavingReleve(false);
    await fetchCopieurReleves(c.id, c.mainteneur || '');
  };

  const handleAddReleve = async () => {
    if (!relevesTarget || !releveDate) return;
    const values = Object.entries(releveValues)
      .filter(([, v]) => v !== '')
      .map(([code_id, valeur]) => ({ code_id: parseInt(code_id), valeur: parseInt(valeur) }));
    if (values.length === 0) return;
    setSavingReleve(true);
    try {
      await api.post(`/${relevesTarget.id}/releves`, { date_releve: releveDate, values });
      setReleveValues({});
      await fetchCopieurReleves(relevesTarget.id, relevesTarget.mainteneur || '');
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur ajout relevé');
    } finally { setSavingReleve(false); }
  };

  const handleDeleteReleve = async (releveId: number) => {
    if (!relevesTarget || !confirm('Supprimer ce relevé ?')) return;
    try {
      await api.delete(`/${relevesTarget.id}/releves/${releveId}`);
      await fetchCopieurReleves(relevesTarget.id, relevesTarget.mainteneur || '');
    } catch { alert('Erreur suppression relevé'); }
  };

  const openVisitesModal = async (c: Copieur) => {
    setVisitesTarget(c);
    setShowVisitesModal(true);
    setLoadingVisites(false);
    setVisiteForm({ date_visite: new Date().toISOString().split('T')[0], annotation: '' });
    setSelectedFiles([]);
    await fetchVisites(c.id);
  };

  const fetchVisites = async (copieurId: number) => {
    setLoadingVisites(true);
    try {
      const res = await api.get(`/${copieurId}/visites`);
      setVisites(res.data);
    } catch (e) {
      console.error('Erreur chargement visites', e);
      setVisites([]);
    } finally {
      setLoadingVisites(false);
    }
  };

  const handleAddVisite = async () => {
    if (!visitesTarget || !visiteForm.date_visite) return;
    setSubmittingVisite(true);
    const formData = new FormData();
    formData.append('date_visite', visiteForm.date_visite);
    formData.append('annotation', visiteForm.annotation);
    selectedFiles.forEach((file) => {
      formData.append('photos', file);
    });

    try {
      await api.post(`/${visitesTarget.id}/visites`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setVisiteForm({ date_visite: new Date().toISOString().split('T')[0], annotation: '' });
      setSelectedFiles([]);
      await fetchVisites(visitesTarget.id);
      await fetchCopieurs();
    } catch (e) {
      alert('Erreur lors de l\'ajout de la visite');
    } finally {
      setSubmittingVisite(false);
    }
  };

  const handleDeleteVisite = async (visiteId: number) => {
    if (!visitesTarget || !confirm('Supprimer cette visite ?')) return;
    try {
      await api.delete(`/${visitesTarget.id}/visites/${visiteId}`);
      await fetchVisites(visitesTarget.id);
      await fetchCopieurs();
    } catch (e) {
      alert('Erreur lors de la suppression de la visite');
    }
  };

  const openAllInterventions = async () => {
    setShowAllInterventions(true);
    setLoadingAllInterventions(true);
    try {
      const res = await api.get('/interventions/all');
      setAllInterventions(res.data);
    } catch {}
    finally { setLoadingAllInterventions(false); }
  };

  const handleGeocode = async () => {
    setGeocoding(true);
    try {
      const res = await api.post('/geocode-all');
      setImportResult(`Géocodage terminé: ${res.data.geocoded} adresses localisées sur ${res.data.total}`);
      fetchCopieurs();
    } catch (err: any) {
      setImportResult('Erreur géocodage: ' + (err.response?.data?.error || err.message));
    } finally {
      setGeocoding(false);
    }
  };

  const mapCopieurs = filtered.filter(c => {
    if (c.latitude == null || c.longitude == null) return false;
    const lat = typeof c.latitude === 'string' ? parseFloat(c.latitude) : c.latitude;
    const lng = typeof c.longitude === 'string' ? parseFloat(c.longitude) : c.longitude;
    return !isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng);
  });

  const countBySource = (src: string) => copieurs.filter(c => c.source === src && !c.archive).length;
  const counts = {
    all: copieurs.filter(c => !c.archive).length,
    ville: countBySource('ville'),
    ecoles: countBySource('ecoles'),
  };

  const handlePingAll = async () => {
    const toPing = copieurs.filter(c => c.ip && c.ip !== '42');
    if (toPing.length === 0) { setImportResult('Aucun copieur avec IP'); return; }
    setPinging(true);
    setPingProgress({ current: 0, total: toPing.length });
    setImportResult('');
    const results: { id: number; ping_status: string; last_seen_active: string | null }[] = [];
    for (let i = 0; i < toPing.length; i++) {
      const c = toPing[i];
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        await fetch(`http://${c.ip}`, { mode: 'no-cors', signal: controller.signal });
        clearTimeout(timer);
        results.push({ id: c.id, ping_status: 'actif', last_seen_active: new Date().toISOString() });
      } catch {
        results.push({ id: c.id, ping_status: 'inactif', last_seen_active: null });
      }
      setPingProgress({ current: i + 1, total: toPing.length });
    }
    try {
      await api.post('/ping-save', { results });
    } catch {}
    const actifs = results.filter(r => r.ping_status === 'actif').length;
    setImportResult(`Ping terminé: ${actifs} joignables, ${results.length - actifs} injoignables sur ${results.length}`);
    setPingProgress(null);
    setPinging(false);
    fetchCopieurs();
  };

  const handleImportPapercut = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingPapercut(true);
    setImportResult('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/import-papercut', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data.message || 'Import PaperCut terminé');
      fetchCopieurs();
    } catch (err: any) {
      setImportResult('Erreur import PaperCut: ' + (err.response?.data?.error || err.message));
    } finally {
      setImportingPapercut(false);
      e.target.value = '';
    }
  };

  const lastSeen = (d: string) => {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'à l\'instant';
    if (diffMin < 60) return `il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `il y a ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `il y a ${diffD}j`;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (d: string) => {
    if (!d) return '';
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const m2 = d.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m2) return d;
    return d;
  };

  const isKpaxAlert = (c: Copieur) => {
    if (!c.kpax_last_collecte) return c.kpax_status !== 'non';
    const diff = Date.now() - new Date(c.kpax_last_collecte).getTime();
    return diff > 7 * 24 * 60 * 60 * 1000;
  };

  const kpaxAlertCount = copieurs.filter(isKpaxAlert).length;

  const formFields: { label: string; key: keyof CopieurForm; type?: string; cols?: number }[] = [
    { label: 'Direction', key: 'direction' },
    { label: 'Service', key: 'service' },
    { label: 'Secteur', key: 'secteur' },
    { label: 'Adresse', key: 'adresse' },
    { label: 'N° de série', key: 'numero_serie' },
    { label: 'Modèle', key: 'modele' },
    { label: 'Modèle PaperCut', key: 'modele_papercut' },
    { label: 'Couleur', key: 'couleur' },
    { label: 'Date acquisition', key: 'date_acquisition', type: 'date' },
    { label: 'Nom réseau', key: 'nom_reseau' },
    { label: 'IP', key: 'ip' },
    { label: 'Présent', key: 'present' },
    { label: 'Nb pages', key: 'nb_pages', type: 'number' },
    { label: 'Mainteneur', key: 'mainteneur' },
    { label: 'Divers', key: 'divers' },
    { label: 'Latitude', key: 'latitude', type: 'number' },
    { label: 'Longitude', key: 'longitude', type: 'number' },
  ];

  return (
    <div className="copieurs-page">
      <Header />
      <div className="container" style={{ padding: '24px 24px', maxWidth: '98%' }}>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="page-icon"><Printer size={32} /></div>
            <div>
              <h1>Gestion des photocopieurs</h1>
              <p className="page-subtitle">Canon — Ville d'Ivry-sur-Seine</p>
            </div>
          </div>
          <div className="page-actions">
            <button className="btn btn-outline" onClick={handlePingAll} disabled={pinging}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: pinging ? '#fbbf24' : '#16a34a' }} /> {pinging ? 'Ping...' : 'Ping tout'}
            </button>
            <label className="btn btn-outline" style={{ cursor: 'pointer', color: '#0891b2', borderColor: '#a5f3fc' }}>
              <Printer size={16} /> {importingPapercut ? 'Import...' : 'Import PaperCut'}
              <input type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={handleImportPapercut} disabled={importingPapercut} ref={papercutInputRef} />
            </label>
            <label className="btn btn-outline" style={{ cursor: 'pointer', color: '#0891b2', borderColor: '#a5f3fc' }}>
              <Printer size={16} /> {importingKpax ? 'Import...' : 'Import KPAX'}
              <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportKpax} disabled={importingKpax} ref={kpaxInputRef} />
            </label>
            <button className="btn btn-outline" onClick={handleImportEmails} disabled={importingEmails}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: importingEmails ? '#fbbf24' : '#16a34a' }} /> {importingEmails ? 'Import...' : 'Import emails'}
            </button>
            <button className="btn btn-outline" onClick={openAllInterventions}>
              <History size={16} /> Toutes les interventions
            </button>
            <button className="btn btn-outline" onClick={openCodesAdmin} style={{ color: '#0891b2', borderColor: '#a5f3fc' }}>
              <Gauge size={16} /> Codes compteur
            </button>
            <button className="btn btn-outline" onClick={handleGeocode} disabled={geocoding}>
              <MapPin size={16} /> {geocoding ? 'Géocodage...' : 'Géocoder'}
            </button>
            <button className="btn btn-primary" onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm(true); }}>
              <Plus size={16} /> Nouveau copieur
            </button>
          </div>
        </div>

        <div className="stats-bar">
          <div className="stat stat-active"><span className="stat-dot" /> Actifs <strong>{copieurs.filter(c => !c.archive).length}</strong></div>
          <div className="stat stat-archived"><span className="stat-dot" /> Archivés <strong>{copieurs.filter(c => c.archive).length}</strong></div>
          <div className="stat stat-total">Total <strong>{copieurs.length}</strong></div>
        </div>

        {pingProgress && (
          <div className="ping-progress">
            <div className="ping-progress-bar">
              <div className="ping-progress-fill" style={{ width: `${(pingProgress.current / pingProgress.total) * 100}%` }} />
            </div>
            <span className="ping-progress-text">Ping {pingProgress.current}/{pingProgress.total}</span>
          </div>
        )}

        {importResult && (
          <div className="alert alert-info" style={{ marginBottom: 20, padding: '12px 20px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, color: '#1e40af', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{importResult}</span>
            <button onClick={() => setImportResult('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1e40af' }}><X size={18} /></button>
          </div>
        )}

        <div className="toolbar">
          <div className="toolbar-left">
            <div className="source-filters">
              <button className={`src-filter ${sourceFilter === 'all' ? 'active' : ''}`} onClick={() => setSourceFilter('all')}>
                Tous <span className="badge-filter">{counts.all}</span>
              </button>
              <button className={`src-filter ${sourceFilter === 'ville' ? 'active' : ''}`} onClick={() => setSourceFilter('ville')}>
                <Building2 size={14} /> Administration <span className="badge-filter">{counts.ville}</span>
              </button>
              <button className={`src-filter ${sourceFilter === 'ecoles' ? 'active' : ''}`} onClick={() => setSourceFilter('ecoles')}>
                <School size={14} /> Écoles <span className="badge-filter">{counts.ecoles}</span>
              </button>
              <button className={`src-filter ${kpaxAlertFilter ? 'active' : ''}`} onClick={() => setKpaxAlertFilter(!kpaxAlertFilter)} style={{ color: kpaxAlertFilter ? '#dc2626' : undefined }}>
                ⚠ Alerte KPAX <span className="badge-filter" style={kpaxAlertFilter ? { background: '#dc2626', color: '#fff' } : {}}>{kpaxAlertCount}</span>
              </button>
            </div>
            <div className="search-box">
              <Search size={18} />
              <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="view-filter-tabs">
              <button className={`tab ${filterMode === 'actifs' ? 'active' : ''}`} onClick={() => setFilterMode('actifs')}>Actifs <span className="badge-count">{copieurs.filter(c => !c.archive).length}</span></button>
              <button className={`tab ${filterMode === 'archives' ? 'active' : ''}`} onClick={() => setFilterMode('archives')}>Archives <span className="badge-count">{copieurs.filter(c => c.archive).length}</span></button>
              <button className={`tab ${filterMode === 'tous' ? 'active' : ''}`} onClick={() => setFilterMode('tous')}>Tous <span className="badge-count">{copieurs.length}</span></button>
            </div>
          </div>
          <div className="view-tabs">
            <button className={`tab ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}><List size={16} /> Liste</button>
            <button className={`tab ${view === 'map' ? 'active' : ''}`} onClick={() => setView('map')}><MapPin size={16} /> Carte ({mapCopieurs.length})</button>
          </div>
        </div>

        {view === 'list' ? (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => handleSort('source')}>
                    Source {sortIcon('source')}
                    <Filter size={11} className="col-filter-btn" onClick={e => { e.stopPropagation(); setShowColFilter(showColFilter === 'source' ? null : 'source'); }} />
                    {showColFilter === 'source' && (
                      <div className="col-filter-dropdown" onClick={e => e.stopPropagation()}>
                        <button className={!colFilters.source ? 'active' : ''} onClick={() => { setColFilters(f => ({ ...f, source: '' })); setShowColFilter(null); }}>Tous</button>
                        <button className={colFilters.source === 'ville' ? 'active' : ''} onClick={() => { setColFilters(f => ({ ...f, source: 'ville' })); setShowColFilter(null); }}>Administration</button>
                        <button className={colFilters.source === 'ecoles' ? 'active' : ''} onClick={() => { setColFilters(f => ({ ...f, source: 'ecoles' })); setShowColFilter(null); }}>Écoles</button>
                      </div>
                    )}
                  </th>
                  <th className="sortable" onClick={() => handleSort('direction')}>
                    Direction / Service {sortIcon('direction')}
                    <Filter size={11} className="col-filter-btn" onClick={e => { e.stopPropagation(); setShowColFilter(showColFilter === 'direction' ? null : 'direction'); }} />
                    {showColFilter === 'direction' && (
                      <div className="col-filter-dropdown" onClick={e => e.stopPropagation()}>
                        <button className={!colFilters.direction ? 'active' : ''} onClick={() => { setColFilters(f => ({ ...f, direction: '' })); setShowColFilter(null); }}>Tous</button>
                        {[...new Set(copieurs.map(c => c.direction).filter(Boolean))].sort().map(d => (
                          <button key={d} className={colFilters.direction === d ? 'active' : ''} onClick={() => { setColFilters(f => ({ ...f, direction: d })); setShowColFilter(null); }}>{d}</button>
                        ))}
                      </div>
                    )}
                  </th>
                  <th className="sortable" onClick={() => handleSort('numero_serie')}>N° Série {sortIcon('numero_serie')}</th>
                  <th className="sortable" onClick={() => handleSort('modele')}>
                    Modèle {sortIcon('modele')}
                    <Filter size={11} className="col-filter-btn" onClick={e => { e.stopPropagation(); setShowColFilter(showColFilter === 'modele' ? null : 'modele'); }} />
                    {showColFilter === 'modele' && (
                      <div className="col-filter-dropdown" onClick={e => e.stopPropagation()}>
                        <button className={!colFilters.modele ? 'active' : ''} onClick={() => { setColFilters(f => ({ ...f, modele: '' })); setShowColFilter(null); }}>Tous</button>
                        {[...new Set(copieurs.map(c => c.modele).filter(Boolean))].sort().map(v => (
                          <button key={v} className={colFilters.modele === v ? 'active' : ''} onClick={() => { setColFilters(f => ({ ...f, modele: v })); setShowColFilter(null); }}>{v}</button>
                        ))}
                      </div>
                    )}
                  </th>
                  <th className="sortable" onClick={() => handleSort('ip')}>IP / Nom réseau {sortIcon('ip')}</th>
                  <th className="sortable" onClick={() => handleSort('ping_status')}>
                    Ping {sortIcon('ping_status')}
                    <Filter size={11} className="col-filter-btn" onClick={e => { e.stopPropagation(); setShowColFilter(showColFilter === 'ping_status' ? null : 'ping_status'); }} />
                    {showColFilter === 'ping_status' && (
                      <div className="col-filter-dropdown" onClick={e => e.stopPropagation()}>
                        <button className={!colFilters.ping_status ? 'active' : ''} onClick={() => { setColFilters(f => ({ ...f, ping_status: '' })); setShowColFilter(null); }}>Tous</button>
                        {['actif', 'inactif', 'inconnu'].map(v => (
                          <button key={v} className={colFilters.ping_status === v ? 'active' : ''} onClick={() => { setColFilters(f => ({ ...f, ping_status: v })); setShowColFilter(null); }}>{v}</button>
                        ))}
                      </div>
                    )}
                  </th>
                  <th className="sortable" onClick={() => handleSort('kpax_status')}>
                    KPAX {sortIcon('kpax_status')}
                    <Filter size={11} className="col-filter-btn" onClick={e => { e.stopPropagation(); setShowColFilter(showColFilter === 'kpax_status' ? null : 'kpax_status'); }} />
                    {showColFilter === 'kpax_status' && (
                      <div className="col-filter-dropdown" onClick={e => e.stopPropagation()}>
                        <button className={!colFilters.kpax_status ? 'active' : ''} onClick={() => { setColFilters(f => ({ ...f, kpax_status: '' })); setShowColFilter(null); }}>Tous</button>
                        {['géré', 'non géré', 'non'].map(v => (
                          <button key={v} className={colFilters.kpax_status === v ? 'active' : ''} onClick={() => { setColFilters(f => ({ ...f, kpax_status: v })); setShowColFilter(null); }}>{v}</button>
                        ))}
                      </div>
                    )}
                  </th>
                  <th className="sortable" onClick={() => handleSort('date_acquisition')}>Date acq. {sortIcon('date_acquisition')}</th>
                  <th className="sortable" onClick={() => handleSort('divers')}>
                    Annotation {sortIcon('divers')}
                    <Filter size={11} className="col-filter-btn" onClick={e => { e.stopPropagation(); setShowColFilter(showColFilter === 'divers' ? null : 'divers'); }} />
                    {showColFilter === 'divers' && (
                      <div className="col-filter-dropdown" onClick={e => e.stopPropagation()}>
                        <button className={!colFilters.divers ? 'active' : ''} onClick={() => { setColFilters(f => ({ ...f, divers: '' })); setShowColFilter(null); }}>Tous</button>
                        {[...new Set(copieurs.map(c => c.divers).filter(Boolean))].sort().map(v => (
                          <button key={v} className={colFilters.divers === v ? 'active' : ''} onClick={() => { setColFilters(f => ({ ...f, divers: v })); setShowColFilter(null); }}>{v}</button>
                        ))}
                      </div>
                    )}
                  </th>
                  <th className="sortable" onClick={() => handleSort('last_visit_date')}>Dernière visite {sortIcon('last_visit_date')}</th>
                  <th className="sortable" style={{ width: 60 }} onClick={() => handleSort('interventions')}>Int. {sortIcon('interventions')}</th>
                  <th style={{ width: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={12} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Aucun copieur trouvé</td></tr>
                )}
                {filtered.map(c => (
                  <React.Fragment key={c.id}>
                    <tr className={c.archive ? 'archived' : ''} onClick={() => setExpandedId(expandedId === c.id ? null : c.id)} style={{ cursor: 'pointer' }}>
                      <td>{c.source === 'ecoles' ? <span className="src-badge ecoles"><School size={12} /> École</span> : <span className="src-badge ville"><Building2 size={12} /> Mairie</span>}</td>
                      <td>
                        <strong>{c.direction}</strong>
                        {c.service && <><br /><span style={{ fontSize: 12, color: '#94a3b8' }}>{c.service}</span></>}
                      </td>
                      <td><code>{c.numero_serie}</code>{c.papercut_matched ? <span title="Données PaperCut" style={{ marginLeft: 6, fontSize: 12, color: '#0891b2', fontWeight: 700 }}>🖨️</span> : null}</td>
                      <td style={{ color: c.couleur === 'Oui' ? '#0891b2' : undefined, fontWeight: c.couleur === 'Oui' ? 600 : undefined }}>{c.modele}</td>
                      <td>
                        {c.ip ? <code className="ip-link" onClick={() => window.open(`http://${c.ip}`, '_blank')}>{c.ip}</code> : <code>-</code>}
                        {c.nom_reseau && <><br /><span style={{ fontSize: 11, color: '#94a3b8' }}>{c.nom_reseau}</span></>}
                      </td>
                      <td>
                        <span className={`ping-dot ${c.ping_status || 'inconnu'}`} title={c.ping_status === 'actif' ? `Vu ${lastSeen(c.last_seen_active)}` : c.ping_status === 'inactif' ? 'Injoignable' : 'Inconnu'} />
                        {c.ping_status === 'actif' ? <span className="ping-label">{lastSeen(c.last_seen_active)}</span> : c.ping_status === 'inactif' ? <span className="ping-label">injoignable</span> : '-'}
                      </td>
                      <td>
                        {c.kpax_status === 'géré' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                            <span className="kpax-badge kpax-gere">géré</span>
                            {c.kpax_last_collecte ? (
                              <span className={`kpax-date${isKpaxAlert(c) ? ' kpax-date-alert' : ''}`}>
                                {new Date(c.kpax_last_collecte).toLocaleDateString('fr-FR')}
                              </span>
                            ) : (
                              <span className="kpax-date kpax-date-alert">jamais</span>
                            )}
                          </div>
                        ) : c.kpax_status === 'non géré' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                            <span className="kpax-badge kpax-non-gere">non géré</span>
                            {c.kpax_last_collecte ? (
                              <span className={`kpax-date${isKpaxAlert(c) ? ' kpax-date-alert' : ''}`}>
                                {new Date(c.kpax_last_collecte).toLocaleDateString('fr-FR')}
                              </span>
                            ) : (
                              <span className="kpax-date kpax-date-alert">jamais</span>
                            )}
                          </div>
                        ) : (
                          <span className="kpax-badge kpax-non">non</span>
                        )}
                      </td>
                      <td>{formatDate(c.date_acquisition)}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.divers || ''}>{c.divers || '-'}</td>
                      <td>
                        {c.last_visit_date ? (
                          <span className="visit-badge visit-badge-active" onClick={(e) => { e.stopPropagation(); openVisitesModal(c); }}>
                            {formatDate(c.last_visit_date)}
                          </span>
                        ) : (
                          <span className="visit-badge visit-badge-empty" onClick={(e) => { e.stopPropagation(); openVisitesModal(c); }}>
                            Aucune (Ajouter)
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="interv-count" onClick={e => { e.stopPropagation(); openCopieurInterventions(c); }} title="Voir les interventions">
                          {interventionCounts[c.id] || 0}
                        </span>
                      </td>
                      <td>
                        <div className="action-btns" onClick={e => e.stopPropagation()}>
                          <button className="btn-icon" title="Modifier" onClick={() => handleEdit(c)}><Edit3 size={15} /></button>
                          <button className="btn-icon" title={c.archive ? 'Désarchiver' : 'Archiver'} onClick={() => handleArchive(c.id)}><Archive size={15} /></button>
                          <button className="btn-icon" title="Déménager" onClick={() => openMoveModal(c)}><Move size={15} /></button>
                          <button className="btn-icon" title="Relevés compteurs" onClick={() => openRelevesModal(c)} style={{ color: '#0891b2' }}><Gauge size={15} /></button>
                          <button className="btn-icon btn-icon-danger" title="Supprimer" onClick={() => handleDelete(c.id)}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === c.id && (
                      <tr className="expanded-row">
                        <td colSpan={12}>
                          <div className="expanded-details">
                            <div><strong>Secteur:</strong> {c.secteur || '-'}</div>
                            <div><strong>N° série:</strong> {c.numero_serie}</div>
                            <div><strong>Modèle PaperCut:</strong> {c.modele_papercut || '-'}</div>
                            <div><strong>Nom réseau:</strong> {c.nom_reseau || '-'}</div>
                            <div><strong>IP:</strong> {c.ip || '-'}</div>
                            <div><strong>Date acquisition:</strong> {c.date_acquisition || '-'}</div>
                            <div><strong>Nb pages:</strong> {c.nb_pages ?? '-'}</div>
                            <div><strong>Source:</strong> {c.source === 'ecoles' ? 'Écoles' : 'Administration'}</div>
                            <div><strong>Divers:</strong> {c.divers || '-'}</div>
                            <div><strong>PaperCut:</strong> {c.papercut_matched ? <span style={{ color: '#0891b2' }}>🖨️ Appairé{c.papercut_last_import ? ` (${new Date(c.papercut_last_import).toLocaleDateString('fr-FR')})` : ''}</span> : '—'}</div>
                            <div><strong>KPAX:</strong> {c.kpax_status === 'géré' ? <span style={{ color: '#16a34a' }}>géré</span> : c.kpax_status === 'non géré' ? <span style={{ color: '#ca8a04' }}>non géré</span> : <span style={{ color: '#94a3b8' }}>non</span>}{c.kpax_last_collecte ? <span style={{ color: '#64748b', fontSize: 12 }}> (collecte: {new Date(c.kpax_last_collecte).toLocaleDateString('fr-FR')})</span> : ''}</div>
                            {(c.latitude || c.latitude === 0) && (c.longitude || c.longitude === 0) && <div><strong>Coordonnées:</strong> {c.latitude}, {c.longitude}</div>}
                            <div><button className="btn-icon" title="Historique des déménagements" onClick={() => toggleMoves(c.id)}><History size={15} /></button> <span style={{ fontSize: 12, color: '#94a3b8', cursor: 'pointer' }} onClick={() => toggleMoves(c.id)}>Déménagements</span></div>
                          </div>
                          {showMoves[c.id] && moves.filter(m => m.copieur_id === c.id).length > 0 && (
                            <div style={{ marginTop: 8, padding: '0 32px 16px', fontSize: 12, color: '#64748b' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <th style={{ padding: '4px 8px', textAlign: 'left' }}>Date</th>
                                    <th style={{ padding: '4px 8px', textAlign: 'left' }}>Source</th>
                                    <th style={{ padding: '4px 8px', textAlign: 'left' }}>Direction</th>
                                    <th style={{ padding: '4px 8px', textAlign: 'left' }}>Service</th>
                                    <th style={{ padding: '4px 8px', textAlign: 'left' }}>Adresse</th>
                                    <th style={{ padding: '4px 8px', textAlign: 'left' }}>IP</th>
                                    <th style={{ padding: '4px 8px', textAlign: 'left' }}>Par</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {moves.filter(m => m.copieur_id === c.id).map(m => (
                                    <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                      <td style={{ padding: '4px 8px' }}>{new Date(m.moved_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                      <td style={{ padding: '4px 8px' }}><span style={{ color: '#94a3b8' }}>{m.old_source}</span> → {m.new_source}</td>
                                      <td style={{ padding: '4px 8px' }}><span style={{ color: '#94a3b8' }}>{m.old_direction}</span> → {m.new_direction}</td>
                                      <td style={{ padding: '4px 8px' }}><span style={{ color: '#94a3b8' }}>{m.old_service}</span> → {m.new_service}</td>
                                      <td style={{ padding: '4px 8px' }}><span style={{ color: '#94a3b8' }}>{m.old_adresse}</span> → {m.new_adresse}</td>
                                      <td style={{ padding: '4px 8px' }}><span style={{ color: '#94a3b8' }}>{m.old_ip}</span> → {m.new_ip}</td>
                                      <td style={{ padding: '4px 8px' }}>{m.moved_by}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <div style={{ marginTop: 8, padding: '0 32px 16px' }}>
                            <button className="btn-icon" title="Interventions" onClick={() => toggleInterventions(c.id)}><History size={15} /></button>
                            <span style={{ fontSize: 12, color: '#94a3b8', cursor: 'pointer' }} onClick={() => toggleInterventions(c.id)}>Interventions</span>
                            <button className="btn-icon" title="Ajouter une intervention" onClick={() => openIntervModal(c)} style={{ marginLeft: 8 }}><Plus size={13} /></button>
                          </div>
                          {showInterventions[c.id] && (
                            <div style={{ padding: '0 32px 16px', fontSize: 12, color: '#64748b' }}>
                              {(interventions[c.id] || []).length === 0 ? (
                                <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>Aucune intervention</div>
                              ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                      <th style={{ padding: '4px 8px', textAlign: 'left' }}>Date</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'left' }}>Mainteneur</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'left' }}>Technicien</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'left' }}>Description</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'left' }}></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(interventions[c.id] || []).map(iv => (
                                      <tr key={iv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '4px 8px' }}>{new Date(iv.date_intervention).toLocaleDateString('fr-FR')}</td>
                                        <td style={{ padding: '4px 8px' }}>{iv.mainteneur || '-'}</td>
                                        <td style={{ padding: '4px 8px' }}>{iv.technicien || '-'}</td>
                                        <td style={{ padding: '4px 8px', maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{iv.description || '-'}</td>
                                        <td style={{ padding: '4px 8px' }}><button className="btn-icon btn-icon-danger" title="Supprimer" onClick={() => handleDeleteIntervention(c.id, iv.id)}><Trash2 size={12} /></button></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="map-wrapper" style={{ height: 'calc(100vh - 300px)', minHeight: 500, borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            {mapCopieurs.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
                <div style={{ textAlign: 'center' }}>
                  <MapPin size={48} style={{ marginBottom: 12, opacity: 0.4 }} />
                  <p>Aucun copieur géolocalisé</p>
                  <button className="btn btn-outline" onClick={handleGeocode} style={{ marginTop: 12 }}>Géocoder les adresses</button>
                </div>
              </div>
            ) : (
              <MapContainer center={[48.8156, 2.3842]} zoom={13} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
                {ivryBoundary && <GeoJSON key={JSON.stringify(ivryBoundary)} data={ivryBoundary} style={{ color: '#2563eb', weight: 2, fillColor: '#dbeafe', fillOpacity: 0.15 }} />}
                {(() => {
                  const groups = new Map<string, { copieurs: typeof mapCopieurs; lat: number; lng: number }>();
                  mapCopieurs.forEach(c => {
                    const lat = typeof c.latitude === 'string' ? parseFloat(c.latitude) : c.latitude;
                    const lng = typeof c.longitude === 'string' ? parseFloat(c.longitude) : c.longitude;
                    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
                    if (!groups.has(key)) groups.set(key, { copieurs: [], lat, lng });
                    groups.get(key)!.copieurs.push(c);
                  });
                  return Array.from(groups.entries()).map(([key, group]) => {
                    const count = group.copieurs.length;
                    const icon = L.divIcon({
                      className: 'marker-group',
                      html: `<div style="background:#2563eb;color:#fff;border-radius:50%;width:${count > 9 ? 36 : 32}px;height:${count > 9 ? 36 : 32}px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)">${count}</div>`,
                      iconSize: [count > 9 ? 36 : 32, count > 9 ? 36 : 32],
                      iconAnchor: [count > 9 ? 18 : 16, count > 9 ? 18 : 16],
                    });
                    return (
                      <Marker key={key} position={[group.lat, group.lng]} icon={icon}>
                        <Popup>
                          <div style={{ fontSize: 13, lineHeight: 1.8, maxHeight: 250, overflowY: 'auto' }}>
                            {group.copieurs.map(c => (
                              <div key={c.id} style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 0' }}>
                                <strong>{c.direction}</strong>{c.service ? ` / ${c.service}` : ''}<br />
                                <span style={{ color: '#64748b' }}>{c.adresse}</span><br />
                                <code>{c.numero_serie}</code> — {c.modele}<br />
                                {c.source === 'ecoles' ? '🏫 ' : '🏛️ '}{c.archive ? <span style={{ color: '#94a3b8' }}>Archivé</span> : <span style={{ color: '#16a34a' }}>Actif</span>}
                              </div>
                            ))}
                          </div>
                        </Popup>
                      </Marker>
                    );
                  });
                })()}
              </MapContainer>
            )}
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Modifier le copieur' : 'Nouveau copieur'}</h2>
              <button className="btn-icon" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                {formFields.map(f => (
                  <div key={f.key} className="form-group" style={{ gridColumn: f.cols ? `span ${f.cols}` : undefined, position: 'relative' }}>
                    <label>{f.label}</label>
                    {f.key === 'divers' ? (
                      <textarea value={form[f.key] as string} onChange={e => setForm({ ...form, [f.key]: e.target.value })} rows={3} />
                    ) : f.key === 'adresse' ? (
                      <div style={{ position: 'relative' }}>
                        <input type="text" value={form.adresse} onChange={e => { setForm({ ...form, adresse: e.target.value }); searchAddress(e.target.value); }} onFocus={() => form.adresse.trim().length >= 3 && searchAddress(form.adresse)} onBlur={() => setTimeout(() => setAddressSuggestions([]), 200)} />
                        {addressSuggestions.length > 0 && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 10px 25px rgba(0,0,0,.1)', maxHeight: 250, overflowY: 'auto' }}>
                            {addressSuggestions.map((s, i) => (
                              <div key={i} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }} onMouseDown={() => { setForm({ ...form, adresse: s.label, latitude: String(s.latitude), longitude: String(s.longitude) }); setAddressSuggestions([]); }}>
                                <div>{s.label}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.city} · {s.postcode} {s.latitude && <span>({s.latitude.toFixed(4)}, {s.longitude.toFixed(4)})</span>}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <input type={f.type || 'text'} value={form[f.key] as string} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                    )}
                  </div>
                ))}
                <div className="form-group">
                  <label>Source</label>
                  <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none' }}>
                    <option value="ville">Administration (Ville)</option>
                    <option value="ecoles">Écoles</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>
                    <input type="checkbox" checked={form.archive} onChange={e => setForm({ ...form, archive: e.target.checked })} />
                    <span style={{ marginLeft: 8 }}>Archivé</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSubmit}>{editingId ? 'Mettre à jour' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}

      {showMoveModal && moveTarget && (
        <div className="modal-overlay" onClick={() => setShowMoveModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Déménager le copieur</h2>
              <button className="btn-icon" onClick={() => setShowMoveModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ marginTop: 0, fontSize: 14, color: '#64748b' }}><strong>{moveTarget.numero_serie}</strong> — {moveTarget.direction} / {moveTarget.service}</p>
              <div className="form-grid">
                <div className="form-group">
                  <label>Source</label>
                  <select value={moveForm.source} onChange={e => setMoveForm({ ...moveForm, source: e.target.value })} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none' }}>
                    <option value="ville">Administration (Ville)</option>
                    <option value="ecoles">Écoles</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Direction / École</label>
                  <input type="text" value={moveForm.direction} onChange={e => setMoveForm({ ...moveForm, direction: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Service</label>
                  <input type="text" value={moveForm.service} onChange={e => setMoveForm({ ...moveForm, service: e.target.value })} />
                </div>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label>Adresse</label>
                  <div style={{ position: 'relative' }}>
                    <input type="text" value={moveForm.adresse} onChange={e => { setMoveForm({ ...moveForm, adresse: e.target.value }); searchAddress(e.target.value); }} onFocus={() => moveForm.adresse.trim().length >= 3 && searchAddress(moveForm.adresse)} onBlur={() => setTimeout(() => setAddressSuggestions([]), 200)} />
                    {addressSuggestions.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 10px 25px rgba(0,0,0,.1)', maxHeight: 250, overflowY: 'auto' }}>
                        {addressSuggestions.map((s, i) => (
                          <div key={i} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }} onMouseDown={() => { setMoveForm({ ...moveForm, adresse: s.label }); setAddressSuggestions([]); }}>
                            <div>{s.label}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.city} · {s.postcode}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label>IP</label>
                  <input type="text" value={moveForm.ip} onChange={e => setMoveForm({ ...moveForm, ip: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowMoveModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleMove}>Déménager</button>
            </div>
          </div>
        </div>
      )}

      {showIntervModal && intervTarget && (
        <div className="modal-overlay" onClick={() => setShowIntervModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Nouvelle intervention</h2>
              <button className="btn-icon" onClick={() => setShowIntervModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ marginTop: 0, fontSize: 14, color: '#64748b' }}><strong>{intervTarget.numero_serie}</strong> — {intervTarget.direction} / {intervTarget.service}</p>
              <div className="form-grid">
                <div className="form-group">
                  <label>Date *</label>
                  <input type="date" value={intervForm.date_intervention} onChange={e => setIntervForm({ ...intervForm, date_intervention: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Mainteneur</label>
                  <input type="text" value={intervForm.mainteneur} onChange={e => setIntervForm({ ...intervForm, mainteneur: e.target.value })} placeholder="Ex: Canon, DSI..." />
                </div>
                <div className="form-group">
                  <label>Technicien</label>
                  <input type="text" value={intervForm.technicien} onChange={e => setIntervForm({ ...intervForm, technicien: e.target.value })} placeholder="Nom du technicien" />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Description</label>
                  <textarea value={intervForm.description} onChange={e => setIntervForm({ ...intervForm, description: e.target.value })} rows={4} placeholder="Détail de l'intervention..." />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowIntervModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleAddIntervention} disabled={!intervForm.date_intervention}>Ajouter</button>
            </div>
          </div>
        </div>
      )}

      {showAllInterventions && (() => {
        const q = allIntervSearch.toLowerCase();
        const filteredItvs = allInterventions.filter(iv => {
          if (allIntervSource === 'email' && !iv.email_message_id) return false;
          if (allIntervSource === 'manuel' && iv.email_message_id) return false;
          if (!q) return true;
          return (iv.numero_serie || '').toLowerCase().includes(q) ||
            (iv.direction || '').toLowerCase().includes(q) ||
            (iv.service || '').toLowerCase().includes(q) ||
            (iv.email_demandeur || '').toLowerCase().includes(q) ||
            (iv.technicien || '').toLowerCase().includes(q) ||
            (iv.mainteneur || '').toLowerCase().includes(q) ||
            (iv.description || '').toLowerCase().includes(q);
        });
        const nbCopieurs = new Set(allInterventions.filter(i => i.numero_serie).map(i => i.numero_serie)).size;
        const nbTechs = new Set(allInterventions.filter(i => i.technicien).map(i => i.technicien)).size;
        const nbEmails = allInterventions.filter(i => i.email_message_id).length;
        return (
          <div className="modal-overlay" onClick={() => { setShowAllInterventions(false); setAllIntervSearch(''); setAllIntervSource('all'); }}>
            <div className="modal modal-interv" onClick={e => e.stopPropagation()}>
              <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                <div>
                  <h2 style={{ marginBottom: 2 }}>Interventions Koesio</h2>
                  <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Historique complet des interventions SAV importées</p>
                </div>
                <button className="btn-icon" onClick={() => { setShowAllInterventions(false); setAllIntervSearch(''); setAllIntervSource('all'); }}><X size={20} /></button>
              </div>

              <div className="interv-stats-bar">
                <div className="interv-stat interv-stat-blue">
                  <div className="interv-stat-value">{allInterventions.length}</div>
                  <div className="interv-stat-label">interventions</div>
                </div>
                <div className="interv-stat interv-stat-purple">
                  <div className="interv-stat-value">{nbCopieurs}</div>
                  <div className="interv-stat-label">copieurs concernés</div>
                </div>
                <div className="interv-stat interv-stat-green">
                  <div className="interv-stat-value">{nbTechs}</div>
                  <div className="interv-stat-label">techniciens</div>
                </div>
                <div className="interv-stat interv-stat-cyan">
                  <div className="interv-stat-value">{nbEmails}</div>
                  <div className="interv-stat-label">via email</div>
                </div>
              </div>

              <div style={{ padding: '12px 24px', display: 'flex', gap: 10, alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
                <div className="search-box" style={{ flex: 1 }}>
                  <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
                  <input type="text" placeholder="Copieur, direction, technicien, demandeur..." value={allIntervSearch} onChange={e => setAllIntervSearch(e.target.value)} autoFocus />
                  {allIntervSearch && <button onClick={() => setAllIntervSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8', display: 'flex' }}><X size={14} /></button>}
                </div>
                <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 8, flexShrink: 0 }}>
                  {(['all', 'email', 'manuel'] as const).map(s => (
                    <button key={s} onClick={() => setAllIntervSource(s)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: allIntervSource === s ? '#fff' : 'transparent', color: allIntervSource === s ? '#0f172a' : '#64748b', boxShadow: allIntervSource === s ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>
                      {s === 'all' ? 'Tout' : s === 'email' ? '✉ Email' : '✎ Manuel'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="modal-body" style={{ padding: 0, maxHeight: '52vh', overflow: 'auto' }}>
                {loadingAllInterventions ? (
                  <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>Chargement...
                  </div>
                ) : filteredItvs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>Aucune intervention{q ? ' pour cette recherche' : ''}
                  </div>
                ) : (
                  <table className="interv-table">
                    <thead>
                      <tr>
                        <th style={{ width: 90 }}>Date</th>
                        <th style={{ width: 110 }}>N° Série</th>
                        <th>Localisation</th>
                        <th style={{ width: 140 }}>Demandeur</th>
                        <th style={{ width: 150 }}>Technicien</th>
                        <th>Détail intervention</th>
                        <th style={{ width: 70 }}>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItvs.map(iv => {
                        const isEmail = !!iv.email_message_id;
                        const dateStr = iv.date_intervention ? new Date(iv.date_intervention).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
                        const desc = (iv.description || '').replace(/\n+/g, ' ').trim();
                        return (
                          <tr key={iv.id} className="interv-row" style={{ cursor: 'pointer' }} onClick={() => setSelectedInterv(iv)}>
                            <td className="interv-date">{dateStr}</td>
                            <td>
                              {iv.numero_serie
                                ? <code className="interv-serial">{iv.numero_serie}</code>
                                : <span style={{ color: '#cbd5e1', fontSize: 12 }}>non lié</span>}
                            </td>
                            <td>
                              <div className="interv-location">
                                {iv.direction && <span className="interv-direction">{iv.direction}</span>}
                                {iv.service && <span className="interv-service">{iv.service}</span>}
                                {!iv.direction && !iv.service && <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>}
                              </div>
                            </td>
                            <td className="interv-person">{iv.email_demandeur || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td className="interv-person">{iv.technicien || iv.mainteneur || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td>
                              <span className="interv-desc" title={desc}>{desc ? desc.substring(0, 90) + (desc.length > 90 ? '…' : '') : <span style={{ color: '#cbd5e1' }}>—</span>}</span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {isEmail
                                ? <span className="interv-badge interv-badge-email" title={iv.email_subject || ''}>✉</span>
                                : <span className="interv-badge interv-badge-manuel" title="Saisie manuelle">✎</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="modal-footer">
                <span style={{ fontSize: 12, color: '#94a3b8', marginRight: 'auto' }}>
                  {q || allIntervSource !== 'all'
                    ? <><strong style={{ color: '#334155' }}>{filteredItvs.length}</strong> résultat{filteredItvs.length > 1 ? 's' : ''} sur {allInterventions.length}</>
                    : <><strong style={{ color: '#334155' }}>{allInterventions.length}</strong> intervention{allInterventions.length > 1 ? 's' : ''} au total</>}
                </span>
                <button className="btn btn-outline" onClick={() => { setShowAllInterventions(false); setAllIntervSearch(''); setAllIntervSource('all'); }}>Fermer</button>
              </div>
            </div>
          </div>
        );
      })()}

      {showCopieurInterv && copieurIntervTarget && (() => {
        const q = copieurIntervSearch.toLowerCase();
        const filteredList = copieurIntervList.filter(iv => {
          if (!q) return true;
          return (iv.email_demandeur || '').toLowerCase().includes(q) ||
            (iv.technicien || '').toLowerCase().includes(q) ||
            (iv.mainteneur || '').toLowerCase().includes(q) ||
            (iv.description || '').toLowerCase().includes(q);
        });
        return (
          <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => { setShowCopieurInterv(false); setCopieurIntervSearch(''); }}>
            <div className="modal modal-interv" onClick={e => e.stopPropagation()}>
              <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                <div>
                  <h2 style={{ marginBottom: 2 }}>Interventions — <code style={{ fontSize: 18, background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: 6 }}>{copieurIntervTarget.numero_serie}</code></h2>
                  <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{copieurIntervTarget.direction}{copieurIntervTarget.service ? ` / ${copieurIntervTarget.service}` : ''}</p>
                </div>
                <button className="btn-icon" onClick={() => { setShowCopieurInterv(false); setCopieurIntervSearch(''); }}><X size={20} /></button>
              </div>

              <div className="interv-stats-bar">
                <div className="interv-stat interv-stat-blue">
                  <div className="interv-stat-value">{copieurIntervList.length}</div>
                  <div className="interv-stat-label">interventions</div>
                </div>
                <div className="interv-stat interv-stat-green">
                  <div className="interv-stat-value">{new Set(copieurIntervList.filter(i => i.technicien).map(i => i.technicien)).size}</div>
                  <div className="interv-stat-label">techniciens</div>
                </div>
                <div className="interv-stat interv-stat-cyan">
                  <div className="interv-stat-value">{copieurIntervList.filter(i => i.email_message_id).length}</div>
                  <div className="interv-stat-label">via email</div>
                </div>
              </div>

              {copieurIntervList.length > 5 && (
                <div style={{ padding: '12px 24px', borderBottom: '1px solid #e2e8f0' }}>
                  <div className="search-box">
                    <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    <input type="text" placeholder="Technicien, demandeur, description..." value={copieurIntervSearch} onChange={e => setCopieurIntervSearch(e.target.value)} autoFocus />
                    {copieurIntervSearch && <button onClick={() => setCopieurIntervSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8', display: 'flex' }}><X size={14} /></button>}
                  </div>
                </div>
              )}

              <div className="modal-body" style={{ padding: 0, maxHeight: '52vh', overflow: 'auto' }}>
                {loadingCopieurInterv ? (
                  <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>Chargement...
                  </div>
                ) : filteredList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>Aucune intervention{q ? ' pour cette recherche' : ''}
                  </div>
                ) : (
                  <table className="interv-table">
                    <thead>
                      <tr>
                        <th style={{ width: 90 }}>Date</th>
                        <th style={{ width: 140 }}>Demandeur</th>
                        <th style={{ width: 160 }}>Technicien</th>
                        <th>Détail intervention</th>
                        <th style={{ width: 70 }}>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredList.map(iv => {
                        const isEmail = !!iv.email_message_id;
                        const dateStr = iv.date_intervention ? new Date(iv.date_intervention).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
                        const desc = (iv.description || '').replace(/\n+/g, ' ').trim();
                        return (
                          <tr key={iv.id} className="interv-row" style={{ cursor: 'pointer' }} onClick={() => setSelectedInterv({ ...iv, numero_serie: copieurIntervTarget.numero_serie, direction: copieurIntervTarget.direction, service: copieurIntervTarget.service })}>
                            <td className="interv-date">{dateStr}</td>
                            <td className="interv-person">{iv.email_demandeur || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td className="interv-person">{iv.technicien || iv.mainteneur || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td><span className="interv-desc" title={desc}>{desc ? desc.substring(0, 100) + (desc.length > 100 ? '…' : '') : <span style={{ color: '#cbd5e1' }}>—</span>}</span></td>
                            <td style={{ textAlign: 'center' }}>
                              {isEmail
                                ? <span className="interv-badge interv-badge-email" title={iv.email_subject || ''}>✉</span>
                                : <span className="interv-badge interv-badge-manuel" title="Saisie manuelle">✎</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="modal-footer">
                <span style={{ fontSize: 12, color: '#94a3b8', marginRight: 'auto' }}>
                  {q ? <><strong style={{ color: '#334155' }}>{filteredList.length}</strong> résultat{filteredList.length > 1 ? 's' : ''} sur {copieurIntervList.length}</> : <><strong style={{ color: '#334155' }}>{copieurIntervList.length}</strong> intervention{copieurIntervList.length > 1 ? 's' : ''}</>}
                </span>
                <button className="btn btn-outline" onClick={() => { setShowCopieurInterv(false); setCopieurIntervSearch(''); }}>Fermer</button>
              </div>
            </div>
          </div>
        );
      })()}

      {selectedInterv && (
        <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={() => { setSelectedInterv(null); setEmailPreviewHtml(null); }}>
          <div className="modal modal-detail" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ marginBottom: 4 }}>Détail de l'intervention</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {selectedInterv.numero_serie && <code className="interv-serial" style={{ fontSize: 13 }}>{selectedInterv.numero_serie}</code>}
                  {selectedInterv.date_intervention && <span style={{ fontSize: 13, color: '#64748b' }}>{new Date(selectedInterv.date_intervention).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>}
                  {selectedInterv.email_message_id ? <span className="interv-badge interv-badge-email" style={{ fontSize: 11 }}>✉ Email</span> : <span className="interv-badge interv-badge-manuel" style={{ fontSize: 11 }}>✎ Manuel</span>}
                </div>
              </div>
              <button className="btn-icon" onClick={() => { setSelectedInterv(null); setEmailPreviewHtml(null); }}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                {selectedInterv.direction && (
                  <div className="detail-field">
                    <div className="detail-label">Direction / Localisation</div>
                    <div className="detail-value">{selectedInterv.direction}{selectedInterv.service ? ` / ${selectedInterv.service}` : ''}</div>
                  </div>
                )}
                {selectedInterv.email_demandeur && (
                  <div className="detail-field">
                    <div className="detail-label">Demandeur</div>
                    <div className="detail-value">{selectedInterv.email_demandeur}</div>
                  </div>
                )}
                {(selectedInterv.technicien || selectedInterv.mainteneur) && (
                  <div className="detail-field">
                    <div className="detail-label">Technicien / Mainteneur</div>
                    <div className="detail-value">{selectedInterv.technicien || selectedInterv.mainteneur}</div>
                  </div>
                )}
                {selectedInterv.email_from && (
                  <div className="detail-field">
                    <div className="detail-label">Expéditeur</div>
                    <div className="detail-value" style={{ fontSize: 13, color: '#64748b' }}>{selectedInterv.email_from}</div>
                  </div>
                )}
                {selectedInterv.email_received_at && (
                  <div className="detail-field">
                    <div className="detail-label">Reçu le</div>
                    <div className="detail-value">{new Date(selectedInterv.email_received_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                )}
              </div>
              {selectedInterv.email_subject && (
                <div style={{ margin: '16px 0 0', padding: '10px 14px', background: '#f1f5f9', borderRadius: 8, fontSize: 13, color: '#334155' }}>
                  <span style={{ fontWeight: 700, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Objet : </span>{selectedInterv.email_subject}
                </div>
              )}
              {selectedInterv.email_message_id && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aperçu du mail</div>
                    {!emailPreviewHtml && (
                      <button className="btn btn-outline" style={{ fontSize: 12, padding: '5px 12px', color: '#2563eb', borderColor: '#bfdbfe' }}
                        disabled={emailPreviewLoading}
                        onClick={async () => {
                          setEmailPreviewLoading(true);
                          try {
                            const res = await api.get(`/interventions/${selectedInterv.id}/email-link`);
                            setEmailPreviewHtml(res.data.html);
                          } catch (e: any) {
                            alert('Impossible de charger le mail : ' + (e.response?.data?.message || e.message));
                          } finally { setEmailPreviewLoading(false); }
                        }}>
                        {emailPreviewLoading ? '⏳ Chargement...' : '✉ Charger l\'aperçu'}
                      </button>
                    )}
                    {emailPreviewHtml && (
                      <button onClick={() => setEmailPreviewHtml(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#94a3b8' }}>Masquer</button>
                    )}
                  </div>
                  {emailPreviewHtml && (
                    <iframe
                      srcDoc={emailPreviewHtml}
                      sandbox="allow-same-origin"
                      style={{ width: '100%', height: 480, border: '1px solid #e2e8f0', borderRadius: 10 }}
                      title="Aperçu email"
                    />
                  )}
                  {!emailPreviewHtml && !emailPreviewLoading && selectedInterv.description && (
                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 18px', border: '1px solid #e2e8f0', maxHeight: 200, overflowY: 'auto' }}>
                      <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 12, color: '#64748b', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{selectedInterv.description}</pre>
                    </div>
                  )}
                </div>
              )}
              {!selectedInterv.email_message_id && selectedInterv.description && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Description</div>
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 18px', border: '1px solid #e2e8f0' }}>
                    <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{selectedInterv.description}</pre>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setSelectedInterv(null); setEmailPreviewHtml(null); }}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {showVisitesModal && visitesTarget && (
        <div className="modal-overlay" onClick={() => setShowVisitesModal(false)}>
          <div className="modal modal-visites" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ marginBottom: 2 }}>Visites de copieur — <code style={{ fontSize: 18, background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 6 }}>{visitesTarget.numero_serie}</code></h2>
                <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{visitesTarget.direction}{visitesTarget.service ? ` / ${visitesTarget.service}` : ''}</p>
              </div>
              <button className="btn-icon" onClick={() => setShowVisitesModal(false)}><X size={20} /></button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Formulaire d'ajout de visite */}
              <div className="visit-form-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Plus size={18} style={{ color: '#0284c7' }} /> Enregistrer une nouvelle visite
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="form-group">
                      <label>Date de la visite *</label>
                      <input 
                        type="date" 
                        value={visiteForm.date_visite} 
                        onChange={e => setVisiteForm({ ...visiteForm, date_visite: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Photos (Une ou plusieurs)</label>
                      <input 
                        type="file" 
                        multiple 
                        accept="image/*" 
                        onChange={e => {
                          if (e.target.files) {
                            setSelectedFiles(Array.from(e.target.files));
                          }
                        }}
                        style={{ padding: '6px 12px' }}
                      />
                    </div>
                  </div>
                  
                  {selectedFiles.length > 0 && (
                    <div style={{ fontSize: 12, color: '#0284c7', fontWeight: 600, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      Fichiers sélectionnés ({selectedFiles.length}) :
                      {selectedFiles.map((file, idx) => (
                        <span key={idx} style={{ background: '#e0f2fe', padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>
                          {file.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="form-group">
                    <label>Annotation / Commentaires</label>
                    <textarea 
                      value={visiteForm.annotation} 
                      onChange={e => setVisiteForm({ ...visiteForm, annotation: e.target.value })} 
                      rows={3} 
                      placeholder="Observations, remarques, état du matériel..."
                    />
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                      className="btn btn-primary" 
                      onClick={handleAddVisite} 
                      disabled={submittingVisite || !visiteForm.date_visite}
                      style={{ background: '#0284c7' }}
                    >
                      {submittingVisite ? 'Enregistrement...' : 'Enregistrer la visite'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Historique des visites */}
              <div>
                <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  Historique des visites ({visites.length})
                </h3>
                
                {loadingVisites ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748b' }}>
                    ⏳ Chargement des visites...
                  </div>
                ) : visites.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontStyle: 'italic', border: '1px dashed #e2e8f0', borderRadius: 12 }}>
                    Aucune visite enregistrée pour le moment.
                  </div>
                ) : (
                  <div className="visits-timeline" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {visites.map((visite) => (
                      <div key={visite.id} className="visit-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, position: 'relative', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                          <div>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                              Visite du {new Date(visite.date_visite).toLocaleDateString('fr-FR')}
                            </span>
                            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>
                              par {visite.created_by || 'inconnu'}
                            </span>
                          </div>
                          <button 
                            className="btn-icon btn-icon-danger" 
                            title="Supprimer la visite"
                            onClick={() => handleDeleteVisite(visite.id)}
                            style={{ margin: '-8px -8px 0 0' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        
                        {visite.annotation && (
                          <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                            {visite.annotation}
                          </p>
                        )}
                        
                        {visite.photos && visite.photos.length > 0 && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, marginTop: 8 }}>
                            {visite.photos.map((photo: string, index: number) => (
                              <div 
                                key={index} 
                                className="visit-photo-thumb"
                                onClick={() => setActiveLightbox(photo)}
                                style={{ 
                                  height: 80, 
                                  borderRadius: 8, 
                                  overflow: 'hidden', 
                                  cursor: 'pointer', 
                                  border: '1px solid #f1f5f9',
                                  position: 'relative'
                                }}
                              >
                                <img 
                                  src={photo} 
                                  alt={`Visite ${visite.id} - ${index}`} 
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.2s' }}
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowVisitesModal(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Admin : Codes compteur par marque ── */}
      {showCodesAdmin && (() => {
        const allMainteneurs = [...new Set([...mainteneursList, ...codesAdmin.map(c => c.mainteneur)])].sort();
        const filteredCodes = selectedMainteneur ? codesAdmin.filter(c => c.mainteneur === selectedMainteneur) : codesAdmin;
        return (
          <div className="modal-overlay" onClick={() => setShowCodesAdmin(false)}>
            <div className="modal modal-compteurs" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2 style={{ marginBottom: 2 }}>Codes compteur par marque</h2>
                  <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Codes, formats, couleurs et tarifs — partagés entre tous les copieurs de même mainteneur</p>
                </div>
                <button className="btn-icon" onClick={() => setShowCodesAdmin(false)}><X size={20} /></button>
              </div>

              <div className="modal-body" style={{ padding: 0, maxHeight: '74vh', display: 'flex', flexDirection: 'column' }}>
                {/* Barre mainteneurs + bouton nouveau code */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 10, flexWrap: 'wrap' }}>
                    <button className={`tab ${!selectedMainteneur ? 'active' : ''}`} onClick={() => setSelectedMainteneur('')}>Tous</button>
                    {allMainteneurs.map(m => (
                      <button key={m} className={`tab ${selectedMainteneur === m ? 'active' : ''}`} onClick={() => setSelectedMainteneur(m)}>{m}</button>
                    ))}
                  </div>
                  <button className="btn btn-primary" style={{ marginLeft: 'auto', background: '#0891b2' }}
                    onClick={() => { setShowCodeForm(true); setEditingCode(null); setCodeForm({ mainteneur: selectedMainteneur || '', code: '', libelle: '', format: '', couleur: false, description: '' }); }}>
                    <Plus size={15} /> Nouveau code
                  </button>
                </div>

                {/* Formulaire nouveau/modifier code */}
                {showCodeForm && (
                  <div style={{ background: '#f0fdff', border: '1px solid #a5f3fc', margin: '16px 24px 0', borderRadius: 14, padding: 20 }}>
                    <h3 style={{ margin: '0 0 14px 0', fontSize: 14, fontWeight: 700, color: '#0e7490' }}>
                      {editingCode ? `Modifier le code ${editingCode.code} (${editingCode.mainteneur})` : 'Nouveau code compteur'}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                      <div className="form-group">
                        <label>Mainteneur *</label>
                        <input type="text" value={codeForm.mainteneur} onChange={e => setCodeForm(p => ({ ...p, mainteneur: e.target.value }))} placeholder="Canon, Toshiba..." list="mainteneurs-list" />
                        <datalist id="mainteneurs-list">{allMainteneurs.map(m => <option key={m} value={m} />)}</datalist>
                      </div>
                      <div className="form-group">
                        <label>Code *</label>
                        <input type="text" value={codeForm.code} onChange={e => setCodeForm(p => ({ ...p, code: e.target.value }))} placeholder="ex: 101" />
                      </div>
                      <div className="form-group">
                        <label>Format</label>
                        <select value={codeForm.format} onChange={e => setCodeForm(p => ({ ...p, format: e.target.value }))} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none' }}>
                          <option value="">—</option>
                          <option>A4</option><option>A3</option><option>A5</option><option>Autre</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ gridColumn: 'span 2' }}>
                        <label>Libellé</label>
                        <input type="text" value={codeForm.libelle} onChange={e => setCodeForm(p => ({ ...p, libelle: e.target.value }))} placeholder="ex: A4 monochrome, A3 couleur..." />
                      </div>
                      <div className="form-group" style={{ justifyContent: 'center' }}>
                        <label>Couleur</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8 }}>
                          <input type="checkbox" checked={codeForm.couleur} onChange={e => setCodeForm(p => ({ ...p, couleur: e.target.checked }))} style={{ width: 16, height: 16 }} />
                          <span style={{ fontSize: 14 }}>Impression couleur</span>
                        </label>
                      </div>
                      <div className="form-group" style={{ gridColumn: 'span 3' }}>
                        <label>Description</label>
                        <input type="text" value={codeForm.description} onChange={e => setCodeForm(p => ({ ...p, description: e.target.value }))} placeholder="Détails..." />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="btn btn-outline" onClick={() => { setShowCodeForm(false); setEditingCode(null); }}>Annuler</button>
                      <button className="btn btn-primary" style={{ background: '#0891b2' }}
                        disabled={!codeForm.mainteneur.trim() || !codeForm.code.trim() || savingCode}
                        onClick={handleSaveCode}>
                        {savingCode ? 'Enregistrement...' : editingCode ? 'Mettre à jour' : 'Créer'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Liste des codes */}
                <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {loadingCodes ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Chargement...</div>
                  ) : filteredCodes.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', border: '1px dashed #e2e8f0', borderRadius: 12, fontStyle: 'italic' }}>
                      Aucun code compteur configuré{selectedMainteneur ? ` pour ${selectedMainteneur}` : ''}.
                    </div>
                  ) : filteredCodes.map(code => (
                    <div key={code.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                      {/* En-tête code */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#f8fafc', cursor: 'pointer', borderBottom: expandedCodeId === code.id ? '1px solid #e2e8f0' : 'none' }}
                        onClick={() => setExpandedCodeId(expandedCodeId === code.id ? null : code.id)}>
                        {expandedCodeId === code.id ? <ChevronDown size={15} style={{ color: '#94a3b8', flexShrink: 0 }} /> : <ChevronRight size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />}
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', background: '#e2e8f0', padding: '2px 8px', borderRadius: 6 }}>{code.mainteneur}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: '#0891b2', background: '#ecfeff', padding: '2px 10px', borderRadius: 8 }}>{code.code}</span>
                        {code.libelle && <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{code.libelle}</span>}
                        {code.format && <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '2px 7px', borderRadius: 6 }}>{code.format}</span>}
                        {code.couleur
                          ? <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 7px', borderRadius: 6, fontWeight: 700 }}>🎨 Couleur</span>
                          : <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '2px 7px', borderRadius: 6 }}>⚫ Mono</span>}
                        {code.tarif_actuel
                          ? <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', padding: '2px 10px', borderRadius: 8 }}>
                              {fmtTarif(code.tarif_actuel)}/page
                            </span>
                          : <span style={{ marginLeft: 'auto', fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>⚠ Pas de tarif actif</span>}
                        <div style={{ display: 'flex', gap: 4, marginLeft: code.tarif_actuel ? 8 : 0 }} onClick={e => e.stopPropagation()}>
                          <button className="btn-icon" title="Modifier" onClick={() => { setEditingCode(code); setCodeForm({ mainteneur: code.mainteneur, code: code.code, libelle: code.libelle, format: code.format, couleur: code.couleur, description: code.description }); setShowCodeForm(true); }}><Edit3 size={13} /></button>
                          <button className="btn-icon btn-icon-danger" title="Supprimer" onClick={() => handleDeleteCode(code.id)}><Trash2 size={13} /></button>
                        </div>
                      </div>

                      {/* Tarifs (expandés) */}
                      {expandedCodeId === code.id && (
                        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {code.description && <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>{code.description}</p>}
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Euro size={13} style={{ color: '#16a34a' }} /> Historique des tarifs
                          </div>
                          {(code.tarifs || []).length > 0 && (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                  {(['Tarif (€/page)', 'Début', 'Fin', 'Ajouté par', '']).map(h => (
                                    <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Tarif (€/page)' || h === '' ? undefined : 'left', fontWeight: 700, color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(code.tarifs || []).map(t => {
                                  const isActif = t.id === code.tarif_actuel_id;
                                  return (
                                    <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', background: isActif ? '#f0fdf4' : undefined }}>
                                      <td style={{ padding: '6px 10px', fontWeight: 700, color: isActif ? '#16a34a' : '#334155' }}>
                                        {fmtTarif(t.tarif)}
                                        {isActif && <span style={{ fontSize: 9, background: '#dcfce7', color: '#16a34a', padding: '1px 5px', borderRadius: 4, marginLeft: 5, fontWeight: 700 }}>ACTIF</span>}
                                      </td>
                                      <td style={{ padding: '6px 10px' }}>{fmtDate(t.date_debut)}</td>
                                      <td style={{ padding: '6px 10px', color: t.date_fin ? '#475569' : '#94a3b8', fontStyle: t.date_fin ? 'normal' : 'italic' }}>{t.date_fin ? fmtDate(t.date_fin) : 'En cours'}</td>
                                      <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{t.created_by || '—'}</td>
                                      <td style={{ padding: '6px 10px' }}><button className="btn-icon btn-icon-danger" onClick={() => handleDeleteCodeTarif(code, t.id)}><Trash2 size={12} /></button></td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                          {/* Formulaire nouveau tarif */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'flex-end', background: '#f8fafc', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <div className="form-group">
                              <label style={{ fontSize: 10 }}>Tarif (€/page) *</label>
                              <input type="number" step="0.000001" min="0" placeholder="0.000500"
                                value={tarifForms[code.id]?.tarif || ''}
                                onChange={e => setTarifForms(p => ({ ...p, [code.id]: { ...p[code.id], tarif: e.target.value } }))} />
                            </div>
                            <div className="form-group">
                              <label style={{ fontSize: 10 }}>Date début *</label>
                              <input type="date"
                                value={tarifForms[code.id]?.date_debut || ''}
                                onChange={e => setTarifForms(p => ({ ...p, [code.id]: { ...p[code.id], date_debut: e.target.value } }))} />
                            </div>
                            <div className="form-group">
                              <label style={{ fontSize: 10 }}>Date fin <span style={{ color: '#94a3b8' }}>(opt.)</span></label>
                              <input type="date"
                                value={tarifForms[code.id]?.date_fin || ''}
                                onChange={e => setTarifForms(p => ({ ...p, [code.id]: { ...p[code.id], date_fin: e.target.value } }))} />
                            </div>
                            <button className="btn btn-primary" style={{ background: '#16a34a', padding: '8px 12px', height: 36, alignSelf: 'flex-end' }}
                              disabled={!tarifForms[code.id]?.tarif || !tarifForms[code.id]?.date_debut || savingTarif[code.id]}
                              onClick={() => handleAddCodeTarif(code)}>
                              {savingTarif[code.id] ? '...' : <Plus size={14} />}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-footer">
                <span style={{ fontSize: 12, color: '#94a3b8', marginRight: 'auto' }}>
                  <strong style={{ color: '#0891b2' }}>{filteredCodes.length}</strong> code{filteredCodes.length !== 1 ? 's' : ''} configuré{filteredCodes.length !== 1 ? 's' : ''}
                  {selectedMainteneur ? ` pour ${selectedMainteneur}` : ''}
                </span>
                <button className="btn btn-outline" onClick={() => setShowCodesAdmin(false)}>Fermer</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modal Relevés trimestriels par copieur ── */}
      {showRelevesModal && relevesTarget && (() => {
        // Grouper les relevés par date
        const byDate = copieurReleves.reduce<Record<string, CopieurReleve[]>>((acc, r) => {
          const d = r.date_releve.split('T')[0];
          (acc[d] = acc[d] || []).push(r);
          return acc;
        }, {});
        const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
        const hasValues = Object.values(releveValues).some(v => v !== '');
        return (
          <div className="modal-overlay" onClick={() => setShowRelevesModal(false)}>
            <div className="modal modal-compteurs" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2 style={{ marginBottom: 2 }}>Relevés — <code style={{ fontSize: 18, background: '#ecfeff', color: '#0891b2', padding: '2px 8px', borderRadius: 6 }}>{relevesTarget.numero_serie}</code></h2>
                  <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                    {relevesTarget.direction}{relevesTarget.service ? ` / ${relevesTarget.service}` : ''}
                    {relevesTarget.mainteneur && <span style={{ marginLeft: 10, background: '#e2e8f0', padding: '2px 8px', borderRadius: 6, fontWeight: 700, color: '#475569' }}>{relevesTarget.mainteneur}</span>}
                  </p>
                </div>
                <button className="btn-icon" onClick={() => setShowRelevesModal(false)}><X size={20} /></button>
              </div>

              <div className="modal-body" style={{ padding: '20px 24px', maxHeight: '74vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
                {loadingReleves ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Chargement...</div>
                ) : (
                  <>
                    {/* ── Nouveau relevé trimestriel ── */}
                    <div style={{ background: '#f0fdff', border: '1px solid #a5f3fc', borderRadius: 14, padding: 20 }}>
                      <h3 style={{ margin: '0 0 14px 0', fontSize: 14, fontWeight: 700, color: '#0e7490', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Plus size={16} /> Nouveau relevé trimestriel
                      </h3>

                      {codesForMainteneur.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: '#f59e0b', fontSize: 13 }}>
                          ⚠ Aucun code compteur configuré pour <strong>{relevesTarget.mainteneur || '(mainteneur non renseigné)'}</strong>.<br />
                          <span style={{ color: '#64748b', fontSize: 12 }}>Configurez d'abord les codes via le bouton "Codes compteur" dans la barre d'actions.</span>
                        </div>
                      ) : (
                        <>
                          <div className="form-group" style={{ marginBottom: 16, maxWidth: 240 }}>
                            <label>Date du relevé *</label>
                            <input type="date" value={releveDate} onChange={e => setReleveDate(e.target.value)} />
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 14 }}>
                            <thead>
                              <tr style={{ background: '#e0f9ff' }}>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#0e7490', textTransform: 'uppercase', letterSpacing: '.04em' }}>Code</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#0e7490', textTransform: 'uppercase', letterSpacing: '.04em' }}>Libellé</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#0e7490', textTransform: 'uppercase', letterSpacing: '.04em' }}>Format</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#0e7490', textTransform: 'uppercase', letterSpacing: '.04em' }}>Tarif actuel</th>
                                <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#0e7490', textTransform: 'uppercase', letterSpacing: '.04em' }}>Valeur relevée *</th>
                              </tr>
                            </thead>
                            <tbody>
                              {codesForMainteneur.map(code => {
                                const lastReleve = copieurReleves.find(r => r.code_id === code.id);
                                return (
                                  <tr key={code.id} style={{ borderBottom: '1px solid #cffafe' }}>
                                    <td style={{ padding: '8px 12px' }}>
                                      <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0891b2', background: '#ecfeff', padding: '2px 8px', borderRadius: 6 }}>{code.code}</span>
                                    </td>
                                    <td style={{ padding: '8px 12px', color: '#334155' }}>
                                      {code.libelle}
                                      {code.couleur
                                        ? <span style={{ marginLeft: 6, fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 4 }}>🎨</span>
                                        : <span style={{ marginLeft: 6, fontSize: 10, background: '#f1f5f9', color: '#64748b', padding: '1px 6px', borderRadius: 4 }}>⚫</span>}
                                    </td>
                                    <td style={{ padding: '8px 12px', color: '#64748b', fontSize: 12 }}>{code.format || '—'}</td>
                                    <td style={{ padding: '8px 12px', color: '#16a34a', fontWeight: 600, fontSize: 12 }}>{code.tarif_actuel ? fmtTarif(code.tarif_actuel) : <span style={{ color: '#f59e0b' }}>⚠</span>}</td>
                                    <td style={{ padding: '8px 12px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <input type="number" min="0" step="1" placeholder={lastReleve ? `≥ ${lastReleve.valeur.toLocaleString('fr-FR')}` : 'ex: 1234567'}
                                          value={releveValues[code.id] || ''}
                                          onChange={e => setReleveValues(p => ({ ...p, [code.id]: e.target.value }))}
                                          style={{ width: 140, padding: '6px 10px', border: '1px solid #a5f3fc', borderRadius: 8, fontSize: 13, outline: 'none' }} />
                                        {lastReleve && <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>dernier: {lastReleve.valeur.toLocaleString('fr-FR')}</span>}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary" style={{ background: '#0891b2' }}
                              disabled={!releveDate || !hasValues || savingReleve}
                              onClick={handleAddReleve}>
                              {savingReleve ? 'Enregistrement...' : 'Enregistrer le relevé'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* ── Historique des relevés ── */}
                    {dates.length > 0 && (
                      <div>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <BarChart2 size={16} style={{ color: '#7c3aed' }} /> Historique ({dates.length} relevé{dates.length > 1 ? 's' : ''})
                        </h3>
                        {dates.map(date => {
                          const items = byDate[date];
                          // Calculer les deltas et montants
                          return (
                            <div key={date} style={{ marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <span style={{ fontWeight: 700, color: '#334155', fontSize: 14 }}>
                                  📅 {new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                </span>
                                <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                  Saisi par {[...new Set(items.map(i => i.created_by).filter(Boolean))].join(', ') || '—'}
                                </span>
                              </div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                  <tr style={{ background: '#fafafa' }}>
                                    <th style={{ padding: '6px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>Code</th>
                                    <th style={{ padding: '6px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>Libellé</th>
                                    <th style={{ padding: '6px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>Valeur</th>
                                    <th style={{ padding: '6px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>Δ pages</th>
                                    <th style={{ padding: '6px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>Montant</th>
                                    <th style={{ width: 36 }}></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map(r => {
                                    const delta = r.valeur_precedente !== null ? r.valeur - Number(r.valeur_precedente) : null;
                                    // Tarif applicable : chercher dans les codes
                                    const code = codesForMainteneur.find(c => c.id === r.code_id);
                                    const tarifApplicable = code?.tarifs?.find(t =>
                                      t.date_debut <= date && (t.date_fin === null || t.date_fin >= date)
                                    );
                                    const montant = delta !== null && tarifApplicable ? delta * parseFloat(tarifApplicable.tarif) : null;
                                    return (
                                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '8px 14px' }}>
                                          <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0891b2', background: '#ecfeff', padding: '1px 7px', borderRadius: 5, fontSize: 12 }}>{r.code}</span>
                                          {r.couleur
                                            ? <span style={{ marginLeft: 5, fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: 4 }}>🎨</span>
                                            : <span style={{ marginLeft: 5, fontSize: 10, background: '#f1f5f9', color: '#64748b', padding: '1px 5px', borderRadius: 4 }}>⚫</span>}
                                        </td>
                                        <td style={{ padding: '8px 14px', color: '#475569', fontSize: 12 }}>{r.libelle || '—'}</td>
                                        <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>{r.valeur.toLocaleString('fr-FR')}</td>
                                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: delta !== null ? (delta < 0 ? '#dc2626' : '#7c3aed') : '#94a3b8' }}>
                                          {delta !== null ? `+${delta.toLocaleString('fr-FR')}` : '—'}
                                        </td>
                                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: montant !== null ? '#16a34a' : '#94a3b8' }}>
                                          {montant !== null ? `${montant.toFixed(2)} €` : '—'}
                                        </td>
                                        <td style={{ padding: '8px 14px' }}>
                                          <button className="btn-icon btn-icon-danger" title="Supprimer" onClick={() => handleDeleteReleve(r.id)}><Trash2 size={12} /></button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="modal-footer">
                <span style={{ fontSize: 12, color: '#94a3b8', marginRight: 'auto' }}>
                  <strong style={{ color: '#7c3aed' }}>{dates.length}</strong> relevé{dates.length !== 1 ? 's' : ''} trimestriel{dates.length !== 1 ? 's' : ''} enregistré{dates.length !== 1 ? 's' : ''}
                </span>
                <button className="btn btn-outline" onClick={() => setShowRelevesModal(false)}>Fermer</button>
              </div>
            </div>
          </div>
        );
      })()}

      {activeLightbox && (
        <div className="lightbox-overlay" onClick={() => setActiveLightbox(null)} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 20 }}>
          <button style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 40, height: 40, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setActiveLightbox(null)}>
            <X size={24} />
          </button>
          <img src={activeLightbox} alt="Visite zoom" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain', margin: 'auto', borderRadius: 8, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }} />
        </div>
      )}

      <style>{`
        .copieurs-page { min-height: 100vh; background: var(--bg-color); }
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
        .page-icon { width: 56px; height: 56px; background: linear-gradient(135deg, #dbeafe, #eff6ff); border-radius: 16px; display: flex; align-items: center; justify-content: center; color: #2563eb; flex-shrink: 0; }
        .page-header h1 { font-size: 28px; font-weight: 800; color: #0f172a; margin: 0; }
        .page-subtitle { color: #64748b; margin: 4px 0 0; font-size: 14px; }
        .page-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .btn { padding: 8px 16px; border-radius: 10px; font-size: 14px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; border: none; transition: all .15s; }
        .btn-primary { background: #2563eb; color: #fff; }
        .btn-primary:hover { background: #1d4ed8; }
        .btn-outline { background: #fff; color: #475569; border: 1px solid #e2e8f0; }
        .btn-outline:hover { background: #f8fafc; border-color: #cbd5e1; }

        .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; gap: 12px; flex-wrap: wrap; }
        .toolbar-left { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .source-filters { display: flex; gap: 4px; background: #f1f5f9; padding: 4px; border-radius: 10px; }
        .stats-bar { display: flex; gap: 16px; margin-bottom: 16px; padding: 12px 20px; background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; }
        .stat { display: flex; align-items: center; gap: 6px; font-size: 14px; color: #64748b; }
        .stat strong { font-size: 18px; color: #0f172a; margin-left: 4px; }
        .stat-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .stat-active .stat-dot { background: #16a34a; }
        .stat-archived .stat-dot { background: #94a3b8; }
        .stat-total { margin-left: auto; }
        .ping-progress { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 8px 20px; background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; }
        .ping-progress-bar { flex: 1; height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
        .ping-progress-fill { height: 100%; background: linear-gradient(90deg, #2563eb, #0891b2); border-radius: 4px; transition: width .3s ease; }
        .ping-progress-text { font-size: 13px; font-weight: 600; color: #64748b; white-space: nowrap; }
        .ping-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
        .ping-dot.actif { background: #16a34a; box-shadow: 0 0 6px rgba(22,163,74,.4); }
        .ping-dot.inactif { background: #dc2626; box-shadow: 0 0 6px rgba(220,38,38,.4); }
        .ping-dot.inconnu { background: #cbd5e1; }
        .ping-label { font-size: 11px; color: #64748b; }
        .src-filter { padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; border: none; background: transparent; color: #64748b; transition: all .15s; white-space: nowrap; }
        .src-filter.active { background: #fff; color: #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
        .badge-filter { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; font-size: 11px; font-weight: 700; background: #e2e8f0; color: #475569; }
        .src-filter.active .badge-filter { background: #2563eb; color: #fff; }

        .search-box { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 14px; color: #94a3b8; }
        .search-box input { border: none; outline: none; font-size: 14px; min-width: 200px; background: transparent; }
        .view-filter-tabs { display: flex; gap: 4px; background: #f1f5f9; padding: 4px; border-radius: 10px; }
        .badge-count { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; font-size: 11px; font-weight: 700; background: #e2e8f0; color: #475569; margin-left: 4px; }
        .view-filter-tabs .tab.active .badge-count { background: #2563eb; color: #fff; }
        .view-tabs { display: flex; gap: 4px; background: #f1f5f9; padding: 4px; border-radius: 10px; }
        .tab { padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; cursor: pointer; border: none; background: transparent; color: #64748b; transition: all .15s; white-space: nowrap; }
        .tab.active { background: #fff; color: #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,.08); }

        .table-container { background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: auto; }
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table th { text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .05em; background: #f8fafc; border-bottom: 1px solid #e2e8f0; white-space: nowrap; position: relative; }
        .data-table th.sortable { cursor: pointer; user-select: none; }
        .data-table th.sortable:hover { background: #f1f5f9; color: #0f172a; }
        .col-filter-btn { margin-left: 4px; cursor: pointer; opacity: 0.4; vertical-align: middle; }
        .col-filter-btn:hover { opacity: 1; color: #2563eb; }
        .col-filter-dropdown { position: absolute; top: 100%; left: 0; z-index: 20; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,.1); padding: 6px; min-width: 180px; max-height: 240px; overflow-y: auto; }
        .col-filter-dropdown button { display: block; width: 100%; text-align: left; padding: 6px 10px; border: none; border-radius: 6px; background: transparent; font-size: 13px; color: #334155; cursor: pointer; white-space: nowrap; }
        .col-filter-dropdown button:hover { background: #f1f5f9; }
        .col-filter-dropdown button.active { background: #eff6ff; color: #2563eb; font-weight: 600; }
        .data-table td { padding: 12px 16px; font-size: 14px; color: #334155; border-bottom: 1px solid #f1f5f9; }
        .data-table tr.archived td { opacity: .5; }
        .data-table tr:hover td { background: #f8fafc; }
        .data-table code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
        .kpax-badge { display: inline-flex; padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 700; white-space: nowrap; }
        .kpax-gere { background: #dcfce7; color: #16a34a; }
        .kpax-non-gere { background: #fef9c3; color: #ca8a04; }
        .kpax-non { background: #f1f5f9; color: #94a3b8; }
        .kpax-date { font-size: 11px; color: #64748b; white-space: nowrap; margin-top: 2px; }
        .kpax-date-alert { color: #dc2626; font-weight: 700; }
        .ip-link { cursor: pointer; text-decoration: underline dotted; }
        .ip-link:hover { color: #2563eb; }

        .src-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 700; white-space: nowrap; }
        .src-badge.ville { background: #ede9fe; color: #7c3aed; }
        .src-badge.ecoles { background: #dbeafe; color: #2563eb; }

        .badge { display: inline-flex; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
        .badge-active { background: #dcfce7; color: #16a34a; }
        .badge-archived { background: #f1f5f9; color: #64748b; }
        .action-btns { display: flex; gap: 4px; }
        .btn-icon { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; border: none; background: transparent; color: #64748b; cursor: pointer; transition: all .15s; }
        .btn-icon:hover { background: #f1f5f9; color: #0f172a; }
        .btn-icon-danger:hover { background: #fef2f2; color: #dc2626; }
        .expanded-row td { padding: 0; }
        .expanded-details { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; padding: 16px 32px 20px; font-size: 13px; color: #64748b; background: #f8fafc; }
        .expanded-details strong { color: #334155; }

        .modal-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(15,23,42,.5); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; }
        .modal { background: #fff; border-radius: 20px; max-width: 800px; width: 100%; max-height: 90vh; overflow: auto; box-shadow: 0 25px 50px -12px rgba(0,0,0,.25); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #e2e8f0; }
        .modal-header h2 { margin: 0; font-size: 20px; font-weight: 700; }
        .modal-body { padding: 24px; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 24px; border-top: 1px solid #e2e8f0; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .form-group label { font-size: 13px; font-weight: 600; color: #334155; }
        .form-group input, .form-group textarea, .form-group select { padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; transition: border-color .15s; background: #fff; }
        .form-group input:focus, .form-group textarea:focus, .form-group select:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
        .alert-info { margin-bottom: 20px; }
        .interv-count { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; background: #f1f5f9; color: #64748b; transition: all .15s; padding: 0 4px; }
        .interv-count:hover { background: #2563eb; color: #fff; }
        .marker-group { background: none !important; border: none !important; }

        .modal-interv { max-width: 1100px; width: 100%; }
        .interv-stats-bar { display: flex; gap: 0; padding: 20px 24px 16px; border-bottom: 1px solid #e2e8f0; }
        .interv-stat { flex: 1; text-align: center; padding: 12px 8px; border-radius: 12px; margin: 0 4px; }
        .interv-stat-blue  { background: #eff6ff; }
        .interv-stat-purple{ background: #f5f3ff; }
        .interv-stat-green { background: #f0fdf4; }
        .interv-stat-cyan  { background: #ecfeff; }
        .interv-stat-value { font-size: 28px; font-weight: 800; line-height: 1; margin-bottom: 4px; }
        .interv-stat-blue  .interv-stat-value { color: #2563eb; }
        .interv-stat-purple .interv-stat-value { color: #7c3aed; }
        .interv-stat-green  .interv-stat-value { color: #16a34a; }
        .interv-stat-cyan   .interv-stat-value { color: #0891b2; }
        .interv-stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; }

        .interv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .interv-table thead tr { background: #f8fafc; position: sticky; top: 0; z-index: 2; }
        .interv-table th { padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
        .interv-row { border-bottom: 1px solid #f1f5f9; transition: background .1s; }
        .interv-row:hover { background: #f8fafc; }
        .interv-row td { padding: 10px 14px; vertical-align: middle; }
        .interv-date { font-weight: 600; color: #334155; white-space: nowrap; font-size: 12px; }
        .interv-serial { background: #ede9fe; color: #6d28d9; padding: 2px 7px; border-radius: 5px; font-size: 11.5px; font-weight: 700; letter-spacing: .03em; }
        .interv-location { display: flex; flex-direction: column; gap: 2px; }
        .interv-direction { font-weight: 600; color: #1e293b; font-size: 12.5px; }
        .interv-service { font-size: 11px; color: #94a3b8; }
        .interv-person { font-size: 12.5px; color: #475569; }
        .interv-desc { font-size: 12px; color: #64748b; line-height: 1.4; }
        .interv-badge { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 8px; font-size: 13px; }
        .interv-badge-email  { background: #dbeafe; color: #2563eb; }
        .interv-badge-manuel { background: #f1f5f9; color: #64748b; }

        .modal-detail { max-width: 680px; width: 100%; }
        .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .detail-field { background: #f8fafc; border-radius: 8px; padding: 10px 14px; border: 1px solid #f1f5f9; }
        .detail-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
        .detail-value { font-size: 14px; color: #0f172a; font-weight: 500; }

        .visit-badge {
          display: inline-flex;
          padding: 4px 8px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .visit-badge-active {
          background: #e0f2fe;
          color: #0369a1;
          border: 1px solid #bae6fd;
        }
        .visit-badge-active:hover {
          background: #0284c7;
          color: #fff;
          border-color: #0284c7;
          transform: translateY(-1px);
        }
        .visit-badge-empty {
          background: #f8fafc;
          color: #94a3b8;
          border: 1px dashed #cbd5e1;
        }
        .visit-badge-empty:hover {
          background: #f1f5f9;
          color: #475569;
          border-color: #94a3b8;
          transform: translateY(-1px);
        }
        .modal-visites {
          max-width: 700px;
        }
        .visit-form-card input[type="date"], .visit-form-card textarea {
          background: #fff !important;
        }
        .visit-photo-thumb:hover img {
          transform: scale(1.08);
        }
        .visit-card:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.05) !important;
          border-color: #cbd5e1 !important;
          transform: translateY(-1px);
          transition: all 0.2s ease;
        }
        .modal-compteurs { max-width: 860px; width: 100%; }
      `}</style>
    </div>
  );
};

export default Copieurs;
