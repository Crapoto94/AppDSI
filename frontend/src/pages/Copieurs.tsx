import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { Printer, Plus, Edit3, Archive, MapPin, List, Trash2, Download, Search, X, Building2, School, ArrowUpDown, ArrowUp, ArrowDown, Filter, Move, History } from 'lucide-react';
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
        c.ip?.toLowerCase().includes(q)
      );
    }
    setFiltered(sorted(result));
  }, [search, copieurs, sourceFilter, colFilters, sorted]);

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
    setPinging(true);
    try {
      const res = await api.post('/ping-all');
      setImportResult(`Ping terminé: ${res.data.actifs} joignables, ${res.data.inactifs} injoignables sur ${res.data.total}`);
      fetchCopieurs();
    } catch (err: any) {
      setImportResult('Erreur ping: ' + (err.response?.data?.error || err.message));
    } finally {
      setPinging(false);
    }
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
            <button className="btn btn-outline" onClick={handleImportEmails} disabled={importingEmails}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: importingEmails ? '#fbbf24' : '#16a34a' }} /> {importingEmails ? 'Import...' : 'Import emails'}
            </button>
            <button className="btn btn-outline" onClick={openAllInterventions}>
              <History size={16} /> Toutes les interventions
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
                    Direction / École {sortIcon('direction')}
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
                  <th className="sortable" onClick={() => handleSort('service')}>Service {sortIcon('service')}</th>
                  <th className="sortable" onClick={() => handleSort('adresse')}>Adresse {sortIcon('adresse')}</th>
                  <th className="sortable" onClick={() => handleSort('numero_serie')}>N° Série {sortIcon('numero_serie')}</th>
                  <th className="sortable" onClick={() => handleSort('modele')}>Modèle {sortIcon('modele')}</th>
                  <th className="sortable" onClick={() => handleSort('ip')}>IP {sortIcon('ip')}</th>
                  <th className="sortable" onClick={() => handleSort('ping_status')}>Ping {sortIcon('ping_status')}</th>
                  <th className="sortable" onClick={() => handleSort('date_acquisition')}>Date acq. {sortIcon('date_acquisition')}</th>
                  <th className="sortable" onClick={() => handleSort('couleur')}>Couleur {sortIcon('couleur')}</th>
                  <th className="sortable" onClick={() => handleSort('divers')}>Annotation {sortIcon('divers')}</th>
                  <th className="sortable" onClick={() => handleSort('archive')}>Statut {sortIcon('archive')}</th>
                  <th className="sortable" style={{ width: 60 }} onClick={() => handleSort('interventions')}>Int. {sortIcon('interventions')}</th>
                  <th style={{ width: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={14} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Aucun copieur trouvé</td></tr>
                )}
                {filtered.map(c => (
                  <React.Fragment key={c.id}>
                    <tr className={c.archive ? 'archived' : ''} onClick={() => setExpandedId(expandedId === c.id ? null : c.id)} style={{ cursor: 'pointer' }}>
                      <td>{c.source === 'ecoles' ? <span className="src-badge ecoles"><School size={12} /> École</span> : <span className="src-badge ville"><Building2 size={12} /> Mairie</span>}</td>
                      <td><strong>{c.direction}</strong></td>
                      <td>{c.service}</td>
                      <td>{c.adresse}{c.latitude && c.longitude ? <MapPin size={12} style={{ marginLeft: 6, color: '#2563eb', verticalAlign: 'middle', flexShrink: 0 }} /> : null}</td>
                      <td><code>{c.numero_serie}</code>{c.papercut_matched ? <span title="Données PaperCut" style={{ marginLeft: 6, fontSize: 12, color: '#0891b2', fontWeight: 700 }}>🖨️</span> : null}</td>
                      <td>{c.modele}</td>
                      <td><code>{c.ip || '-'}</code></td>
                      <td>
                        <span className={`ping-dot ${c.ping_status || 'inconnu'}`} title={c.ping_status === 'actif' ? `Vu ${lastSeen(c.last_seen_active)}` : c.ping_status === 'inactif' ? 'Injoignable' : 'Inconnu'} />
                        {c.ping_status === 'actif' ? <span className="ping-label">{lastSeen(c.last_seen_active)}</span> : c.ping_status === 'inactif' ? <span className="ping-label">injoignable</span> : '-'}
                      </td>
                      <td>{formatDate(c.date_acquisition)}</td>
                      <td>{c.couleur === 'Oui' ? '🟥' : (c.couleur || '-')}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.divers || ''}>{c.divers || '-'}</td>
                      <td>{c.archive ? <span className="badge badge-archived">Archivé</span> : <span className="badge badge-active">Actif</span>}</td>
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
                          <button className="btn-icon btn-icon-danger" title="Supprimer" onClick={() => handleDelete(c.id)}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === c.id && (
                      <tr className="expanded-row">
                        <td colSpan={14}>
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
      `}</style>
    </div>
  );
};

export default Copieurs;
