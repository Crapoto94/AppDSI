import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { Plus, Edit2, Trash2, Upload, Search, ChevronUp, ChevronDown, ChevronsUpDown, X, MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface VilleConfig { id?: number; nom: string; code_postal: string; }
interface Elu { id?: number; nom: string; prenom: string; email?: string; telephone?: string; role: string; delegation?: string; }
interface Site { id?: number; code_bien?: string; nom: string; categorie?: string; adresse?: string; is_active: boolean; lat?: number; lng?: number; }
interface Ecole { id?: number; nom: string; adresse?: string; code_postal?: string; email?: string; telephone?: string; directeur?: string; }
interface GeocodedSite { code: string; nom: string; lat: number; lng: number; adresse: string; categorie?: string; }

type SortKey = 'code_bien' | 'nom' | 'categorie' | 'adresse' | 'is_active';
type SortDir = 'asc' | 'desc';

const ROLES = ['Maire', 'Adjoint', 'Conseiller municipal'];

const CATEGORY_ICONS: Record<string, string> = {
  'ESPACES VERTS': '🌳',
  'SPORTIF': '⚽',
  'ADMINISTRATIF': '🏛️',
  'AUTRE ADMINISTRATION': '🏢',
  'LOGEMENT': '🏠',
  'ACTIVITES': '🎯',
  'HANG': '🏭',
  'SCOLAIRE': '🏫',
  'CULTE': '⛪',
  'CULTUREL': '🎭',
  'TECHNIQUE': '🔧',
  'PARKING': '🅿️',
  'SANITAIRES': '🚽',
  'EQUIPEMENT': '⚙️',
};

const CATEGORY_COLORS: Record<string, string> = {
  'ESPACES VERTS': '#16a34a',
  'SPORTIF': '#ea580c',
  'ADMINISTRATIF': '#2563eb',
  'AUTRE ADMINISTRATION': '#7c3aed',
  'LOGEMENT': '#db2777',
  'ACTIVITES': '#ca8a04',
  'HANG': '#4b5563',
  'SCOLAIRE': '#0891b2',
  'CULTE': '#9333ea',
  'CULTUREL': '#c026d3',
  'TECHNIQUE': '#0f766e',
  'PARKING': '#374151',
  'SANITAIRES': '#0284c7',
  'EQUIPEMENT': '#7c3aed',
};

const getCategoryEmoji = (cat?: string): string =>
  CATEGORY_ICONS[(cat || '').trim().toUpperCase()] || '📌';

const getCategoryColor = (cat?: string): string =>
  CATEGORY_COLORS[(cat || '').trim().toUpperCase()] || '#3b82f6';

const getCategoryIcon = (cat?: string): L.DivIcon => {
  const emoji = getCategoryEmoji(cat);
  const color = getCategoryColor(cat);
  return L.divIcon({
    className: '',
    html: `<div style="background:white;border:2.5px solid ${color};border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 2px 8px rgba(0,0,0,0.25);cursor:pointer">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -36],
  });
};

const MapController = ({ selectedCode, geocodedSites }: { selectedCode: string | null; geocodedSites: GeocodedSite[] }) => {
  const map = useMap();
  useEffect(() => {
    if (!selectedCode) return;
    const site = geocodedSites.find(g => g.code === selectedCode);
    if (site) map.flyTo([site.lat, site.lng], 17, { duration: 1.2 });
  }, [selectedCode, geocodedSites, map]);
  return null;
};

const getSortValue = (site: Site, key: SortKey): string => {
  if (key === 'is_active') return site.is_active ? '1' : '0';
  return String((site as any)[key] ?? '');
};

export default function ParamVille() {
  const { user: _user } = useAuth();
  const [selectedTab, setSelectedTab] = useState<'general' | 'elus' | 'sites' | 'ecoles' | 'carte'>('general');

  const [config, setConfig] = useState<VilleConfig>({ nom: '', code_postal: '' });

  const [elus, setElus] = useState<Elu[]>([]);
  const [editingElu, setEditingElu] = useState<Elu | null>(null);
  const [eluForm, setEluForm] = useState<Elu>({ nom: '', prenom: '', role: 'Conseiller municipal' });

  const [sites, setSites] = useState<Site[]>([]);
  const [sitesLoaded, setSitesLoaded] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [siteForm, setSiteForm] = useState<Site>({ nom: '', adresse: '', is_active: true });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<any>(null);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importedSitesList, setImportedSitesList] = useState<any[]>([]);

  // Sites search / filter / sort
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterActif, setFilterActif] = useState<'tous' | 'actifs' | 'inactifs'>('actifs');
  const [showInactifs, setShowInactifs] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('code_bien');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Carte
  const [geocodedSites, setGeocodedSites] = useState<GeocodedSite[]>([]);
  const [geocodingProgress, setGeocodingProgress] = useState(0);
  const [geocodingTotal, setGeocodingTotal] = useState(0);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const geocodingStopRef = useRef(false);
  const [selectedMapSite, setSelectedMapSite] = useState<string | null>(null);
  const [carteFilterCategorie, setCarteFilterCategorie] = useState('');
  const [showInactifsCarte, setShowInactifsCarte] = useState(false);

  const [ecoles, setEcoles] = useState<Ecole[]>([]);
  const [editingEcole, setEditingEcole] = useState<Ecole | null>(null);
  const [ecoleForm, setEcoleForm] = useState<Ecole>({ nom: '', adresse: '', code_postal: '', email: '', telephone: '', directeur: '' });

  const [loading, setLoading] = useState(false);

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  useEffect(() => {
    if (selectedTab === 'general') loadConfig();
    else if (selectedTab === 'elus') loadElus();
    else if (selectedTab === 'sites') loadSites();
    else if (selectedTab === 'carte') { if (!sitesLoaded) loadSites(); }
    else if (selectedTab === 'ecoles') loadEcoles();
  }, [selectedTab]);

  // Pré-charger les géocodages existants depuis la BDD
  useEffect(() => {
    if (!sitesLoaded) return;
    const fromDB = sites
      .filter(s => s.code_bien && /^S\d{3}$/.test(s.code_bien) && s.lat != null && s.lng != null)
      .map(s => ({ code: s.code_bien!, nom: s.nom, lat: s.lat!, lng: s.lng!, adresse: s.adresse || '', categorie: s.categorie }));
    setGeocodedSites(fromDB);
  }, [sitesLoaded]);

  // ─── GÉNÉRAL ─────────────────────────────────────────────────────
  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/ville/config', { headers: getHeaders() });
      setConfig(res.data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const saveConfig = async () => {
    try {
      await axios.put('/api/ville/config', config, { headers: getHeaders() });
      alert('Configuration mise à jour');
    } catch (error: any) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  // ─── ÉLUS ────────────────────────────────────────────────────────
  const loadElus = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/ville/elus', { headers: getHeaders() });
      setElus(res.data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const saveElu = async () => {
    try {
      if (editingElu?.id) await axios.put(`/api/ville/elus/${editingElu.id}`, eluForm, { headers: getHeaders() });
      else await axios.post('/api/ville/elus', eluForm, { headers: getHeaders() });
      setEditingElu(null);
      setEluForm({ nom: '', prenom: '', role: 'Conseiller municipal' });
      loadElus();
    } catch (error: any) { alert('Erreur: ' + (error.response?.data?.message || error.message)); }
  };

  const deleteElu = async (id: number) => {
    if (!confirm('Confirmer la suppression?')) return;
    try {
      await axios.delete(`/api/ville/elus/${id}`, { headers: getHeaders() });
      loadElus();
    } catch (error: any) { alert('Erreur: ' + (error.response?.data?.message || error.message)); }
  };

  // ─── SITES ───────────────────────────────────────────────────────
  const loadSites = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/ville/sites', { headers: getHeaders() });
      setSites(res.data);
      setSitesLoaded(true);
    } catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const importSites = async () => {
    if (!uploadFile) { alert('Sélectionner un fichier'); return; }
    setIsImporting(true);
    setImportProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      const res = await axios.post('/api/ville/sites/import', formData, {
        headers: { ...getHeaders(), 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e: any) => setImportProgress(Math.min(Math.round((e.loaded * 100) / e.total), 90))
      });
      setImportProgress(100);
      setImportStatus(res.data);
      setUploadFile(null);
      if (res.data.sites?.length > 0) {
        setImportedSitesList([]);
        res.data.sites.forEach((site: any, idx: number) => {
          setTimeout(() => setImportedSitesList(prev => [...prev, site]), idx * 30);
        });
      }
      setTimeout(() => { setIsImporting(false); setImportProgress(0); loadSites(); }, 500);
    } catch (error: any) {
      setIsImporting(false); setImportProgress(0);
      alert('Erreur import: ' + (error.response?.data?.message || error.message));
    }
  };

  const saveSite = async () => {
    try {
      if (editingSite?.id) await axios.put(`/api/ville/sites/${editingSite.id}`, siteForm, { headers: getHeaders() });
      setEditingSite(null);
      setSiteForm({ nom: '', adresse: '', is_active: true });
      loadSites();
    } catch (error: any) { alert('Erreur: ' + (error.response?.data?.message || error.message)); }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const categories = useMemo(() =>
    [...new Set(sites.map(s => s.categorie).filter(Boolean) as string[])].sort(),
    [sites]
  );

  const sitesFiltered = useMemo(() => {
    const q = search.toLowerCase();
    let result = sites.filter(site => {
      if (!showInactifs && !site.is_active) return false;
      if (q && !(site.code_bien || '').toLowerCase().includes(q) && !site.nom.toLowerCase().includes(q) &&
          !(site.categorie || '').toLowerCase().includes(q) && !(site.adresse || '').toLowerCase().includes(q)) return false;
      if (filterCategorie && site.categorie !== filterCategorie) return false;
      if (filterActif === 'actifs' && !site.is_active) return false;
      if (filterActif === 'inactifs' && site.is_active) return false;
      return true;
    });
    return [...result].sort((a, b) => {
      const cmp = getSortValue(a, sortKey).localeCompare(getSortValue(b, sortKey), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [sites, search, filterCategorie, filterActif, showInactifs, sortKey, sortDir]);

  const sitesSXXX = useMemo(() =>
    sites
      .filter(s => s.code_bien && /^S\d{3}$/.test(s.code_bien) && (showInactifsCarte || s.is_active))
      .sort((a, b) => (a.code_bien || '').localeCompare(b.code_bien || '', undefined, { numeric: true })),
    [sites, showInactifsCarte]
  );

  const carteCategories = useMemo(() =>
    [...new Set(sitesSXXX.map(s => s.categorie).filter(Boolean) as string[])].sort(),
    [sitesSXXX]
  );

  const sitesSXXXFiltered = useMemo(() =>
    carteFilterCategorie ? sitesSXXX.filter(s => s.categorie === carteFilterCategorie) : sitesSXXX,
    [sitesSXXX, carteFilterCategorie]
  );

  const geocodedSitesFiltered = useMemo(() =>
    carteFilterCategorie ? geocodedSites.filter(s => s.categorie === carteFilterCategorie) : geocodedSites,
    [geocodedSites, carteFilterCategorie]
  );

  // ─── CARTE / GÉOCODAGE ───────────────────────────────────────────
  const startGeocoding = async () => {
    geocodingStopRef.current = false;
    setGeocodingProgress(0);
    setIsGeocoding(true);
    const city = config.nom || 'Ivry-sur-Seine';

    // Ne géocoder que les sites sans coordonnées
    const toGeocode = sitesSXXX.filter(s => !s.lat || !s.lng);
    setGeocodingTotal(toGeocode.length);

    for (let i = 0; i < toGeocode.length; i++) {
      if (geocodingStopRef.current) break;
      const site = toGeocode[i];
      setGeocodingProgress(i + 1);
      if (site.adresse) {
        try {
          const query = `${site.adresse}, ${city}, France`;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
            { headers: { 'User-Agent': 'AppDSI-Ville/1.0' } }
          );
          const data = await res.json();
          if (data[0]) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            const entry: GeocodedSite = { code: site.code_bien!, nom: site.nom, lat, lng, adresse: site.adresse || '', categorie: site.categorie };

            // Mise à jour state local immédiate
            setGeocodedSites(prev => [...prev.filter(g => g.code !== site.code_bien), entry]);

            // Mise à jour lat/lng dans le state sites (pour cohérence)
            setSites(prev => prev.map(s => s.id === site.id ? { ...s, lat, lng } : s));

            // Sauvegarde en BDD (sans bloquer)
            if (site.id) {
              axios.patch(`/api/ville/sites/${site.id}/geocode`, { lat, lng }, { headers: getHeaders() })
                .catch(() => { /* ignore */ });
            }
          }
        } catch { /* skip */ }
      }
      await new Promise(r => setTimeout(r, 1100));
    }
    setIsGeocoding(false);
  };

  const stopGeocoding = () => { geocodingStopRef.current = true; setIsGeocoding(false); };

  // ─── ÉCOLES ──────────────────────────────────────────────────────
  const loadEcoles = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/ville/ecoles', { headers: getHeaders() });
      setEcoles(res.data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const saveEcole = async () => {
    try {
      if (editingEcole?.id) await axios.put(`/api/ville/ecoles/${editingEcole.id}`, ecoleForm, { headers: getHeaders() });
      else await axios.post('/api/ville/ecoles', ecoleForm, { headers: getHeaders() });
      setEditingEcole(null);
      setEcoleForm({ nom: '', adresse: '', code_postal: '', email: '', telephone: '', directeur: '' });
      loadEcoles();
    } catch (error: any) { alert('Erreur: ' + (error.response?.data?.message || error.message)); }
  };

  const deleteEcole = async (id: number) => {
    if (!confirm('Confirmer la suppression?')) return;
    try {
      await axios.delete(`/api/ville/ecoles/${id}`, { headers: getHeaders() });
      loadEcoles();
    } catch (error: any) { alert('Erreur: ' + (error.response?.data?.message || error.message)); }
  };

  // ─── STYLES ──────────────────────────────────────────────────────
  const s = {
    container: { padding: '24px', maxWidth: '1400px', margin: '0 auto' },
    title: { fontSize: '28px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px 0' },
    subtitle: { fontSize: '14px', color: '#6b7280', margin: '0 0 32px 0' },
    tabs: { display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '2px solid #e5e7eb' },
    tab: (active: boolean): React.CSSProperties => ({
      padding: '12px 24px', backgroundColor: 'transparent', color: active ? '#0ea5e9' : '#6b7280',
      border: 'none', borderBottom: active ? '2px solid #0ea5e9' : '2px solid transparent',
      cursor: 'pointer', fontWeight: active ? '600' : '500', marginBottom: '-2px', fontSize: '15px'
    }),
    btn: (variant: 'primary' | 'success' | 'danger' | 'warning' = 'primary'): React.CSSProperties => {
      const colors = { primary: '#0ea5e9', success: '#10b981', danger: '#ef4444', warning: '#f59e0b' };
      return { padding: '8px 16px', marginRight: '8px', borderRadius: '6px', border: 'none', backgroundColor: colors[variant], color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '6px' };
    },
    form: { marginBottom: '20px', padding: '20px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#f9fafb' },
    row: { marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px' },
    label: { minWidth: '140px', fontWeight: '600', fontSize: '14px', color: '#374151' },
    input: { padding: '8px 12px', width: '100%', maxWidth: '300px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' as const },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' },
    th: (sortable = false): React.CSSProperties => ({
      padding: '10px 14px', backgroundColor: '#f3f4f6', border: 'none', textAlign: 'left' as const,
      fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb',
      cursor: sortable ? 'pointer' : 'default', userSelect: 'none' as const, whiteSpace: 'nowrap' as const
    }),
    td: { padding: '10px 14px', border: 'none', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' as const },
    badge: (color: string): React.CSSProperties => ({
      display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '12px',
      fontSize: '11px', fontWeight: '600', backgroundColor: color + '18', color: color, whiteSpace: 'nowrap' as const
    }),
    select: { padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', backgroundColor: 'white', cursor: 'pointer' }
  };

  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `@keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronsUpDown size={12} style={{ opacity: 0.4, flexShrink: 0 }} />;
    return sortDir === 'asc' ? <ChevronUp size={12} style={{ flexShrink: 0 }} /> : <ChevronDown size={12} style={{ flexShrink: 0 }} />;
  };

  const CITY_CENTER: [number, number] = [48.8129, 2.3838]; // Ivry-sur-Seine par défaut

  return (
    <div style={s.container}>
      <h1 style={s.title}>Paramètres Ville</h1>
      <p style={s.subtitle}>Configuration générale, élus, sites et écoles</p>

      <div style={s.tabs}>
        {(['general', 'elus', 'sites', 'ecoles', 'carte'] as const).map(tab => (
          <button key={tab} style={s.tab(selectedTab === tab)} onClick={() => setSelectedTab(tab)}>
            {tab === 'general' ? '⚙️ Général'
              : tab === 'elus' ? '👤 Élus'
              : tab === 'sites' ? '🏢 Sites'
              : tab === 'ecoles' ? '🏫 Écoles'
              : '🗺️ Carte'}
          </button>
        ))}
      </div>

      {/* ─── GÉNÉRAL ─────────────────────────────────────────────── */}
      {selectedTab === 'general' && (
        <div style={s.form}>
          <div style={s.row}>
            <span style={s.label}>Nom de la ville</span>
            <input style={s.input} value={config.nom || ''} onChange={e => setConfig({ ...config, nom: e.target.value })} placeholder="Ivry-sur-Seine" />
          </div>
          <div style={s.row}>
            <span style={s.label}>Code postal</span>
            <input style={s.input} value={config.code_postal || ''} onChange={e => setConfig({ ...config, code_postal: e.target.value })} placeholder="94200" />
          </div>
          <button style={s.btn('primary')} onClick={saveConfig}>Enregistrer</button>
        </div>
      )}

      {/* ─── ÉLUS ────────────────────────────────────────────────── */}
      {selectedTab === 'elus' && (
        <>
          <button style={s.btn(editingElu ? 'success' : 'primary')} onClick={() => {
            if (editingElu) { setEditingElu(null); setEluForm({ nom: '', prenom: '', role: 'Conseiller municipal' }); }
            else setEditingElu({} as Elu);
          }}>
            {editingElu ? <><X size={16} /> Annuler</> : <><Plus size={16} /> Ajouter un élu</>}
          </button>

          {editingElu !== null && (
            <div style={s.form}>
              {[['Prénom', 'prenom'], ['Nom', 'nom'], ['Email', 'email'], ['Téléphone', 'telephone'], ['Délégation', 'delegation']].map(([lbl, key]) => (
                <div key={key} style={s.row}>
                  <span style={s.label}>{lbl}</span>
                  <input style={s.input} type={key === 'email' ? 'email' : 'text'} value={(eluForm as any)[key] || ''} onChange={e => setEluForm({ ...eluForm, [key]: e.target.value })} />
                </div>
              ))}
              <div style={s.row}>
                <span style={s.label}>Rôle</span>
                <select style={s.input} value={eluForm.role} onChange={e => setEluForm({ ...eluForm, role: e.target.value })}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <button style={s.btn('success')} onClick={saveElu}>{editingElu?.id ? 'Enregistrer' : 'Créer'}</button>
            </div>
          )}

          <table style={s.table}>
            <thead><tr>
              {['Nom', 'Rôle', 'Email', 'Téléphone', 'Délégation', 'Actions'].map(h => <th key={h} style={s.th()}>{h}</th>)}
            </tr></thead>
            <tbody>
              {elus.map(e => (
                <tr key={e.id}>
                  <td style={s.td}><strong>{e.prenom} {e.nom}</strong></td>
                  <td style={s.td}><span style={s.badge('#8b5cf6')}>{e.role}</span></td>
                  <td style={s.td}><code style={{ fontSize: '12px' }}>{e.email || '—'}</code></td>
                  <td style={s.td}>{e.telephone || '—'}</td>
                  <td style={s.td}>{e.delegation || '—'}</td>
                  <td style={{ ...s.td, display: 'flex', gap: '6px' }}>
                    <button style={{ ...s.btn('warning'), padding: '5px 9px' }} onClick={() => { setEditingElu(e); setEluForm(e); }}><Edit2 size={15} /></button>
                    <button style={{ ...s.btn('danger'), padding: '5px 9px' }} onClick={() => deleteElu(e.id!)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
              {elus.length === 0 && <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', padding: '30px', color: '#9ca3af' }}>Aucun élu</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {/* ─── SITES ───────────────────────────────────────────────── */}
      {selectedTab === 'sites' && (
        <>
          {/* Import */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ marginBottom: '12px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="file" accept=".xlsx,.xls" onChange={e => setUploadFile(e.target.files?.[0] || null)} disabled={isImporting}
                style={{ padding: '7px', borderRadius: '6px', border: '1px solid #d1d5db', opacity: isImporting ? 0.5 : 1 }} />
              <button style={{ ...s.btn('primary'), opacity: isImporting ? 0.6 : 1 }} onClick={importSites} disabled={isImporting}>
                <Upload size={15} /> {isImporting ? 'Import en cours...' : 'Importer Excel'}
              </button>
            </div>
            {isImporting && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <div style={{ flex: 1, height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', backgroundColor: '#0ea5e9', width: `${importProgress}%`, transition: 'width 0.3s ease' }} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#0ea5e9', minWidth: '42px', textAlign: 'right' }}>{importProgress}%</span>
                </div>
                {importedSitesList.length > 0 && (
                  <div style={{ maxHeight: '260px', overflowY: 'auto', padding: '10px', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #86efac' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#16a34a', marginBottom: '6px' }}>Sites importés ({importedSitesList.length})</div>
                    {importedSitesList.map((site: any, idx: number) => (
                      <div key={idx} style={{ fontSize: '12px', color: '#15803d', padding: '5px 8px', backgroundColor: 'white', borderRadius: '4px', borderLeft: '3px solid #22c55e', marginBottom: '3px', animation: 'slideIn 0.3s ease-in-out' }}>
                        <strong>{site.code}</strong> — {site.designation}
                        {site.disabled && <span style={{ color: '#f59e0b', marginLeft: '6px' }}>(désactivé)</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {importStatus && !isImporting && (
              <div style={{ padding: '10px 14px', borderRadius: '6px', backgroundColor: importStatus.errors?.length ? '#fef2f2' : '#f0fdf4' }}>
                <span style={{ color: importStatus.errors?.length ? '#dc2626' : '#16a34a', fontWeight: '600' }}>
                  ✓ {importStatus.imported} importé(s), {importStatus.updated} mis à jour{importStatus.disabled ? `, ${importStatus.disabled} désactivé(s)` : ''}
                </span>
                {importStatus.errors?.length > 0 && (
                  <details style={{ marginTop: '8px' }}>
                    <summary style={{ cursor: 'pointer', color: '#dc2626' }}>Voir les erreurs ({importStatus.errors.length})</summary>
                    <ul style={{ marginTop: '6px', paddingLeft: '18px' }}>
                      {importStatus.errors.map((e: string, i: number) => <li key={i} style={{ color: '#dc2626', fontSize: '12px' }}>{e}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* Barre de recherche et filtres */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid #d1d5db', borderRadius: '6px', overflow: 'hidden', flex: '1', minWidth: '200px', maxWidth: '380px' }}>
              <input
                placeholder="Rechercher code, nom, catégorie, adresse..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setSearch(searchInput)}
                style={{ flex: 1, padding: '8px 12px', border: 'none', outline: 'none', fontSize: '13px' }}
              />
              {searchInput && (
                <button onClick={() => { setSearchInput(''); setSearch(''); }}
                  style={{ padding: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af' }}><X size={14} /></button>
              )}
              <button onClick={() => setSearch(searchInput)}
                style={{ padding: '8px 12px', border: 'none', borderLeft: '1px solid #d1d5db', background: '#f3f4f6', cursor: 'pointer', color: '#374151' }}>
                <Search size={15} />
              </button>
            </div>

            <select style={s.select} value={filterCategorie} onChange={e => setFilterCategorie(e.target.value)}>
              <option value="">Toutes catégories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select style={s.select} value={filterActif} onChange={e => setFilterActif(e.target.value as any)}>
              <option value="tous">Tous</option>
              <option value="actifs">Actifs</option>
              <option value="inactifs">Inactifs</option>
            </select>

            <button
              onClick={() => setShowInactifs(v => !v)}
              style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #d1d5db', background: showInactifs ? '#fef2f2' : 'white', color: showInactifs ? '#ef4444' : '#6b7280', fontSize: '12px', cursor: 'pointer', fontWeight: '500', whiteSpace: 'nowrap' as const }}
            >
              {showInactifs ? '✕ Masquer inactifs' : '⚠ Afficher sites hors service'}
            </button>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              {sitesFiltered.length} / {sites.filter(s => showInactifs || s.is_active).length} sites
            </span>
          </div>

          {/* Form édition */}
          {editingSite && (
            <div style={s.form}>
              <div style={s.row}><span style={s.label}>Nom</span><input style={s.input} value={siteForm.nom} onChange={e => setSiteForm({ ...siteForm, nom: e.target.value })} /></div>
              <div style={s.row}><span style={s.label}>Adresse</span><input style={s.input} value={siteForm.adresse || ''} onChange={e => setSiteForm({ ...siteForm, adresse: e.target.value })} /></div>
              <div style={s.row}><span style={s.label}><input type="checkbox" checked={siteForm.is_active} onChange={e => setSiteForm({ ...siteForm, is_active: e.target.checked })} /> Actif</span></div>
              <button style={s.btn('success')} onClick={saveSite}>Enregistrer</button>
              <button style={s.btn('danger')} onClick={() => setEditingSite(null)}>Annuler</button>
            </div>
          )}

          {/* Tableau */}
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead><tr>
                {([['code_bien', 'Code'], ['nom', 'Nom'], ['categorie', 'Catégorie'], ['adresse', 'Adresse'], ['is_active', 'État']] as [SortKey, string][]).map(([key, lbl]) => (
                  <th key={key} style={s.th(true)} onClick={() => handleSort(key)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>{lbl} <SortIcon k={key} /></span>
                  </th>
                ))}
                <th style={s.th()}>Actions</th>
              </tr></thead>
              <tbody>
                {sitesFiltered.map(site => (
                  <tr key={site.id} style={{ background: site.is_active ? 'white' : '#fafafa' }}>
                    <td style={s.td}><code style={{ fontSize: '12px', background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{site.code_bien || '—'}</code></td>
                    <td style={s.td}><strong style={{ fontSize: '13px' }}>{site.nom}</strong></td>
                    <td style={s.td}>{site.categorie ? <span style={s.badge('#6366f1')}>{site.categorie}</span> : '—'}</td>
                    <td style={{ ...s.td, color: '#6b7280', fontSize: '12px' }}>{site.adresse || '—'}</td>
                    <td style={s.td}><span style={s.badge(site.is_active ? '#10b981' : '#ef4444')}>{site.is_active ? '✓ Actif' : '✕ Inactif'}</span></td>
                    <td style={{ ...s.td, display: 'flex', gap: '5px' }}>
                      <button style={{ ...s.btn('warning'), padding: '5px 9px' }} onClick={() => { setEditingSite(site); setSiteForm(site); }}><Edit2 size={14} /></button>
                    </td>
                  </tr>
                ))}
                {sitesFiltered.length === 0 && <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', padding: '30px', color: '#9ca3af' }}>Aucun résultat</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─── ÉCOLES ──────────────────────────────────────────────── */}
      {selectedTab === 'ecoles' && (
        <>
          <button style={s.btn(editingEcole ? 'danger' : 'primary')} onClick={() => {
            if (editingEcole) { setEditingEcole(null); setEcoleForm({ nom: '', adresse: '', code_postal: '', email: '', telephone: '', directeur: '' }); }
            else setEditingEcole({} as Ecole);
          }}>
            {editingEcole ? <><X size={16} /> Annuler</> : <><Plus size={16} /> Ajouter une école</>}
          </button>

          {editingEcole !== null && (
            <div style={s.form}>
              {[['Nom', 'nom'], ['Adresse', 'adresse'], ['Code postal', 'code_postal'], ['Email', 'email'], ['Téléphone', 'telephone'], ['Directeur', 'directeur']].map(([lbl, key]) => (
                <div key={key} style={s.row}>
                  <span style={s.label}>{lbl}</span>
                  <input style={s.input} type={key === 'email' ? 'email' : 'text'} value={(ecoleForm as any)[key] || ''} onChange={e => setEcoleForm({ ...ecoleForm, [key]: e.target.value })} />
                </div>
              ))}
              <button style={s.btn('success')} onClick={saveEcole}>{editingEcole?.id ? 'Enregistrer' : 'Créer'}</button>
            </div>
          )}

          <table style={s.table}>
            <thead><tr>
              {['Nom', 'Adresse', 'Code postal', 'Email', 'Directeur', 'Actions'].map(h => <th key={h} style={s.th()}>{h}</th>)}
            </tr></thead>
            <tbody>
              {ecoles.map(e => (
                <tr key={e.id}>
                  <td style={s.td}><strong>{e.nom}</strong></td>
                  <td style={s.td}>{e.adresse || '—'}</td>
                  <td style={s.td}>{e.code_postal || '—'}</td>
                  <td style={s.td}><code style={{ fontSize: '12px' }}>{e.email || '—'}</code></td>
                  <td style={s.td}>{e.directeur || '—'}</td>
                  <td style={{ ...s.td, display: 'flex', gap: '6px' }}>
                    <button style={{ ...s.btn('warning'), padding: '5px 9px' }} onClick={() => { setEditingEcole(e); setEcoleForm(e); }}><Edit2 size={14} /></button>
                    <button style={{ ...s.btn('danger'), padding: '5px 9px' }} onClick={() => deleteEcole(e.id!)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {ecoles.length === 0 && <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', padding: '30px', color: '#9ca3af' }}>Aucune école</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {/* ─── CARTE ───────────────────────────────────────────────── */}
      {selectedTab === 'carte' && (
        <>
          {/* Barre de contrôle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', padding: '10px 14px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={15} color="#0ea5e9" />
              <strong style={{ fontSize: '13px', color: '#1e293b' }}>
                Sites principaux — {sitesSXXX.length}{!showInactifsCarte ? ' actifs' : ''}
              </strong>
            </div>

            <button
              onClick={() => setShowInactifsCarte(v => !v)}
              style={{ padding: '6px 11px', borderRadius: '6px', border: '1px solid #d1d5db', background: showInactifsCarte ? '#fef2f2' : 'white', color: showInactifsCarte ? '#ef4444' : '#6b7280', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}
            >
              {showInactifsCarte ? '✕ Masquer inactifs' : '⚠ Afficher hors service'}
            </button>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {!isGeocoding && geocodedSites.length === 0 && (
                <button style={s.btn('primary')} onClick={startGeocoding}>
                  <MapPin size={14} /> Géocoder les sites
                </button>
              )}
              {isGeocoding && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '120px', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', backgroundColor: '#0ea5e9', width: `${geocodingTotal ? Math.round((geocodingProgress / geocodingTotal) * 100) : 0}%`, transition: 'width 0.5s ease' }} />
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {geocodingProgress}/{geocodingTotal} — {geocodedSites.length} localisés
                    </span>
                  </div>
                  <button style={s.btn('danger')} onClick={stopGeocoding}>Arrêter</button>
                </>
              )}
              {!isGeocoding && geocodedSites.length > 0 && (
                <>
                  <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '600' }}>
                    ✓ {geocodedSites.length} localisés
                    {sitesSXXX.filter(s => !s.lat).length > 0 && (
                      <span style={{ color: '#f59e0b', marginLeft: '6px' }}>({sitesSXXX.filter(s => !s.lat).length} restants)</span>
                    )}
                  </span>
                  <button style={s.btn('warning')} onClick={startGeocoding}>
                    {sitesSXXX.filter(s => !s.lat).length > 0 ? 'Continuer' : 'Relancer'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Layout carte + liste */}
          <div style={{ display: 'flex', gap: '14px', height: 'calc(100vh - 300px)', minHeight: '500px' }}>

            {/* Liste SXXX à gauche */}
            <div style={{ width: '270px', flexShrink: 0, display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: 'white', overflow: 'hidden' }}>
              {/* Filtre catégorie dans la liste */}
              <div style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', flexShrink: 0 }}>
                <select
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '5px', border: '1px solid #d1d5db', fontSize: '12px', backgroundColor: 'white' }}
                  value={carteFilterCategorie}
                  onChange={e => setCarteFilterCategorie(e.target.value)}
                >
                  <option value="">Toutes catégories ({sitesSXXX.length})</option>
                  {carteCategories.map(c => (
                    <option key={c} value={c}>{getCategoryEmoji(c)} {c} ({sitesSXXX.filter(s => s.categorie === c).length})</option>
                  ))}
                </select>
              </div>

              <div style={{ overflowY: 'auto', flex: 1 }}>
                {sitesSXXXFiltered.map(site => {
                  const geocoded = geocodedSites.find(g => g.code === site.code_bien);
                  const isSelected = selectedMapSite === site.code_bien;
                  return (
                    <div
                      key={site.id}
                      onClick={() => setSelectedMapSite(isSelected ? null : (site.code_bien || null))}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                        backgroundColor: isSelected ? '#eff6ff' : (!site.is_active ? '#fafafa' : 'transparent'),
                        borderLeft: `3px solid ${isSelected ? getCategoryColor(site.categorie) : 'transparent'}`,
                        transition: 'all 0.15s', opacity: site.is_active ? 1 : 0.6
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '15px', lineHeight: 1 }}>{getCategoryEmoji(site.categorie)}</span>
                        <code style={{ fontSize: '11px', background: '#f1f5f9', padding: '1px 5px', borderRadius: '3px', fontWeight: '700', color: '#334155' }}>{site.code_bien}</code>
                        {!site.is_active && <span style={{ fontSize: '10px', color: '#ef4444' }}>inactif</span>}
                        {geocoded
                          ? <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#10b981', fontWeight: '600' }}>✓</span>
                          : <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#cbd5e1' }}>—</span>
                        }
                      </div>
                      <div style={{ fontSize: '12px', color: '#374151', lineHeight: 1.3 }}>{site.nom}</div>
                      {site.adresse && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{site.adresse}</div>}
                    </div>
                  );
                })}
              </div>

              {/* Légende / filtre rapide par catégorie */}
              {geocodedSites.length > 0 && (
                <div style={{ borderTop: '1px solid #e2e8f0', padding: '8px 10px', backgroundColor: '#f8fafc', flexShrink: 0, maxHeight: '180px', overflowY: 'auto' }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Légende — cliquer pour filtrer</div>
                  {carteCategories.map(cat => {
                    const count = geocodedSites.filter(g => g.categorie === cat).length;
                    if (count === 0) return null;
                    const isActive = carteFilterCategorie === cat;
                    return (
                      <div key={cat} onClick={() => setCarteFilterCategorie(isActive ? '' : cat)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px', borderRadius: '4px', cursor: 'pointer', backgroundColor: isActive ? getCategoryColor(cat) + '20' : 'transparent', border: isActive ? `1px solid ${getCategoryColor(cat)}40` : '1px solid transparent', marginBottom: '2px' }}>
                        <span style={{ fontSize: '14px' }}>{getCategoryEmoji(cat)}</span>
                        <span style={{ fontSize: '11px', color: '#475569', flex: 1 }}>{cat}</span>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: getCategoryColor(cat) }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Carte Leaflet avec overlay filtre */}
            <div style={{ flex: 1, borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', position: 'relative' }}>
              <MapContainer center={CITY_CENTER} zoom={14} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapController selectedCode={selectedMapSite} geocodedSites={geocodedSites} />
                {geocodedSitesFiltered.map(site => (
                  <Marker key={site.code} position={[site.lat, site.lng]} icon={getCategoryIcon(site.categorie)}>
                    <Popup>
                      <div style={{ minWidth: '180px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '22px' }}>{getCategoryEmoji(site.categorie)}</span>
                          <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontWeight: '700' }}>{site.code}</code>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>{site.nom}</div>
                        {site.categorie && <div style={{ fontSize: '11px', color: getCategoryColor(site.categorie), fontWeight: '600', marginBottom: '4px' }}>{site.categorie}</div>}
                        {site.adresse && <div style={{ fontSize: '11px', color: '#64748b' }}>{site.adresse}</div>}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>

              {/* Overlay filtre catégorie sur la carte */}
              <div
                style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000, backgroundColor: 'white', borderRadius: '8px', padding: '10px 12px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)', minWidth: '200px', maxHeight: '60vh', overflowY: 'auto' }}
                onMouseDown={e => e.stopPropagation()}
              >
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Catégories
                </div>
                <div
                  onClick={() => setCarteFilterCategorie('')}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 6px', borderRadius: '5px', cursor: 'pointer', marginBottom: '4px', backgroundColor: !carteFilterCategorie ? '#eff6ff' : 'transparent', fontWeight: !carteFilterCategorie ? '600' : '400' }}
                >
                  <span style={{ fontSize: '14px' }}>🗺️</span>
                  <span style={{ fontSize: '12px', color: '#334155', flex: 1 }}>Tout afficher</span>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>{geocodedSites.length}</span>
                </div>
                {carteCategories.map(cat => {
                  const count = geocodedSites.filter(g => g.categorie === cat).length;
                  if (count === 0) return null;
                  const isActive = carteFilterCategorie === cat;
                  return (
                    <div key={cat} onClick={() => setCarteFilterCategorie(isActive ? '' : cat)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 6px', borderRadius: '5px', cursor: 'pointer', marginBottom: '2px', backgroundColor: isActive ? getCategoryColor(cat) + '18' : 'transparent', borderLeft: isActive ? `3px solid ${getCategoryColor(cat)}` : '3px solid transparent' }}>
                      <span style={{ fontSize: '16px', lineHeight: 1 }}>{getCategoryEmoji(cat)}</span>
                      <span style={{ fontSize: '12px', color: '#334155', flex: 1 }}>{cat}</span>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: getCategoryColor(cat) }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
