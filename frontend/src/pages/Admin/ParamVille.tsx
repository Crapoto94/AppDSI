import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { Plus, Edit2, Trash2, Upload, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface VilleConfig {
  id?: number;
  nom: string;
  code_postal: string;
}

interface Elu {
  id?: number;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  role: string;
  delegation?: string;
}

interface Site {
  id?: number;
  code_bien?: string;
  nom: string;
  categorie?: string;
  adresse?: string;
  is_active: boolean;
}

interface Ecole {
  id?: number;
  nom: string;
  adresse?: string;
  code_postal?: string;
  email?: string;
  telephone?: string;
  directeur?: string;
}

const ROLES = ['Maire', 'Adjoint', 'Conseiller municipal'];

export default function ParamVille() {
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState<'general' | 'elus' | 'sites' | 'ecoles'>('general');

  // Général
  const [config, setConfig] = useState<VilleConfig>({ nom: '', code_postal: '' });

  // Élus
  const [elus, setElus] = useState<Elu[]>([]);
  const [editingElu, setEditingElu] = useState<Elu | null>(null);
  const [eluForm, setEluForm] = useState<Elu>({ nom: '', prenom: '', role: 'Conseiller municipal' });

  // Sites
  const [sites, setSites] = useState<Site[]>([]);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [siteForm, setSiteForm] = useState<Site>({ nom: '', adresse: '', is_active: true });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<any>(null);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importedSitesList, setImportedSitesList] = useState<any[]>([]);

  // Écoles
  const [ecoles, setEcoles] = useState<Ecole[]>([]);
  const [editingEcole, setEditingEcole] = useState<Ecole | null>(null);
  const [ecoleForm, setEcoleForm] = useState<Ecole>({ nom: '', adresse: '', code_postal: '', email: '', telephone: '', directeur: '' });

  const [loading, setLoading] = useState(false);

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  useEffect(() => {
    if (selectedTab === 'general') loadConfig();
    else if (selectedTab === 'elus') loadElus();
    else if (selectedTab === 'sites') loadSites();
    else if (selectedTab === 'ecoles') loadEcoles();
  }, [selectedTab]);

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
      if (editingElu?.id) {
        await axios.put(`/api/ville/elus/${editingElu.id}`, eluForm, { headers: getHeaders() });
      } else {
        await axios.post('/api/ville/elus', eluForm, { headers: getHeaders() });
      }
      setEditingElu(null);
      setEluForm({ nom: '', prenom: '', role: 'Conseiller municipal' });
      loadElus();
    } catch (error: any) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  const deleteElu = async (id: number) => {
    if (!confirm('Confirmer la suppression?')) return;
    try {
      await axios.delete(`/api/ville/elus/${id}`, { headers: getHeaders() });
      loadElus();
    } catch (error: any) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  // ─── SITES ───────────────────────────────────────────────────────
  const loadSites = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/ville/sites', { headers: getHeaders() });
      setSites(res.data);
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
        onUploadProgress: (progressEvent: any) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setImportProgress(Math.min(percentCompleted, 90)); // Cap à 90% pendant l'upload
        }
      });

      setImportProgress(100);
      setImportStatus(res.data);
      setUploadFile(null);

      // Afficher les sites importés au fur et à mesure
      if (res.data.sites && res.data.sites.length > 0) {
        setImportedSitesList([]);
        res.data.sites.forEach((site: any, idx: number) => {
          setTimeout(() => {
            setImportedSitesList(prev => [...prev, site]);
          }, idx * 30); // 30ms entre chaque site
        });
      }

      // Petit délai pour montrer 100%
      setTimeout(() => {
        setIsImporting(false);
        setImportProgress(0);
        loadSites();
      }, 500);
    } catch (error: any) {
      setIsImporting(false);
      setImportProgress(0);
      alert('Erreur import: ' + (error.response?.data?.message || error.message));
    }
  };

  const saveSite = async () => {
    try {
      if (editingSite?.id) {
        await axios.put(`/api/ville/sites/${editingSite.id}`, siteForm, { headers: getHeaders() });
      }
      setEditingSite(null);
      setSiteForm({ nom: '', adresse: '', is_active: true });
      loadSites();
    } catch (error: any) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

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
      if (editingEcole?.id) {
        await axios.put(`/api/ville/ecoles/${editingEcole.id}`, ecoleForm, { headers: getHeaders() });
      } else {
        await axios.post('/api/ville/ecoles', ecoleForm, { headers: getHeaders() });
      }
      setEditingEcole(null);
      setEcoleForm({ nom: '', adresse: '', code_postal: '', email: '', telephone: '', directeur: '' });
      loadEcoles();
    } catch (error: any) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  const deleteEcole = async (id: number) => {
    if (!confirm('Confirmer la suppression?')) return;
    try {
      await axios.delete(`/api/ville/ecoles/${id}`, { headers: getHeaders() });
      loadEcoles();
    } catch (error: any) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  const s = {
    container: { padding: '24px', maxWidth: '1200px', margin: '0 auto' },
    header: { marginBottom: '32px' },
    title: { fontSize: '28px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px 0' },
    subtitle: { fontSize: '14px', color: '#6b7280', margin: '0' },
    tabs: { display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '2px solid #e5e7eb' },
    tab: (active: boolean): React.CSSProperties => ({
      padding: '12px 24px', backgroundColor: 'transparent', color: active ? '#0ea5e9' : '#6b7280',
      border: 'none', borderBottom: active ? '2px solid #0ea5e9' : '2px solid transparent',
      cursor: 'pointer', fontWeight: active ? '600' : '500', marginBottom: '-2px', fontSize: '15px'
    }),
    btn: (variant: 'primary' | 'success' | 'danger' | 'warning' = 'primary'): React.CSSProperties => {
      const colors = { primary: '#0ea5e9', success: '#10b981', danger: '#ef4444', warning: '#f59e0b' };
      return { padding: '8px 16px', marginRight: '8px', borderRadius: '6px', border: 'none', backgroundColor: colors[variant], color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '500' };
    },
    form: { marginBottom: '20px', padding: '20px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#f9fafb' },
    row: { marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px' },
    label: { minWidth: '140px', fontWeight: '600', fontSize: '14px', color: '#374151' },
    input: { padding: '8px 12px', width: '100%', maxWidth: '300px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' as const },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' },
    th: { padding: '12px 16px', backgroundColor: '#f3f4f6', border: 'none', textAlign: 'left' as const, fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' },
    td: { padding: '12px 16px', border: 'none', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' as const },
    badge: (color: string): React.CSSProperties => ({
      display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '16px',
      fontSize: '12px', fontWeight: '600', backgroundColor: color + '20', color: color
    })
  };

  // Ajouter animation CSS
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateX(-10px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <div style={s.container}>
      <div style={s.header}>
        <h1 style={s.title}>Paramètres Ville</h1>
        <p style={s.subtitle}>Configuration générale, élus, sites et écoles</p>
      </div>

      <div style={s.tabs}>
        {(['general', 'elus', 'sites', 'ecoles'] as const).map(tab => (
          <button key={tab} style={s.tab(selectedTab === tab)} onClick={() => setSelectedTab(tab)}>
            {tab === 'general' ? '⚙️ Général' : tab === 'elus' ? '👤 Élus' : tab === 'sites' ? '🏢 Sites' : '🏫 Écoles'}
          </button>
        ))}
      </div>

      {/* ─── GÉNÉRAL ─────────────────────────────────────────────── */}
      {selectedTab === 'general' && (
        <div style={s.form}>
          <div style={s.row}>
            <span style={s.label}>Nom de la ville</span>
            <input style={s.input} value={config.nom || ''} onChange={e => setConfig({...config, nom: e.target.value})} placeholder="Ivry-sur-Seine" />
          </div>
          <div style={s.row}>
            <span style={s.label}>Code postal</span>
            <input style={s.input} value={config.code_postal || ''} onChange={e => setConfig({...config, code_postal: e.target.value})} placeholder="94200" />
          </div>
          <button style={s.btn('primary')} onClick={saveConfig}>Enregistrer</button>
        </div>
      )}

      {/* ─── ÉLUS ────────────────────────────────────────────────── */}
      {selectedTab === 'elus' && (
        <>
          <button style={s.btn(editingElu ? 'success' : 'primary')} onClick={() => {
            if (editingElu) { setEditingElu(null); setEluForm({ nom: '', prenom: '', role: 'Conseiller municipal' }); }
            else { setEditingElu({} as Elu); }
          }}>
            {editingElu ? '✕ Annuler' : <span style={{display: 'flex', alignItems: 'center', gap: '6px'}}><Plus size={16} /> Ajouter un élu</span>}
          </button>

          {editingElu !== null && (
            <div style={s.form}>
              <div style={s.row}>
                <span style={s.label}>Prénom</span>
                <input style={s.input} value={eluForm.prenom || ''} onChange={e => setEluForm({...eluForm, prenom: e.target.value})} />
              </div>
              <div style={s.row}>
                <span style={s.label}>Nom</span>
                <input style={s.input} value={eluForm.nom || ''} onChange={e => setEluForm({...eluForm, nom: e.target.value})} />
              </div>
              <div style={s.row}>
                <span style={s.label}>Rôle</span>
                <select style={s.input} value={eluForm.role} onChange={e => setEluForm({...eluForm, role: e.target.value})}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={s.row}>
                <span style={s.label}>Email</span>
                <input style={s.input} type="email" value={eluForm.email || ''} onChange={e => setEluForm({...eluForm, email: e.target.value})} />
              </div>
              <div style={s.row}>
                <span style={s.label}>Téléphone</span>
                <input style={s.input} value={eluForm.telephone || ''} onChange={e => setEluForm({...eluForm, telephone: e.target.value})} />
              </div>
              <div style={s.row}>
                <span style={s.label}>Délégation</span>
                <input style={s.input} value={eluForm.delegation || ''} onChange={e => setEluForm({...eluForm, delegation: e.target.value})} placeholder="Ex: Finances, Urbanisme..." />
              </div>
              <button style={s.btn('success')} onClick={saveElu}>{editingElu?.id ? 'Enregistrer' : 'Créer'}</button>
            </div>
          )}

          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Nom</th>
                <th style={s.th}>Rôle</th>
                <th style={s.th}>Email</th>
                <th style={s.th}>Téléphone</th>
                <th style={s.th}>Délégation</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {elus.map(e => (
                <tr key={e.id}>
                  <td style={s.td}><strong>{e.prenom} {e.nom}</strong></td>
                  <td style={s.td}><span style={s.badge('#8b5cf6')}>{e.role}</span></td>
                  <td style={s.td}><code style={{fontSize: '12px'}}>{e.email || '—'}</code></td>
                  <td style={s.td}>{e.telephone || '—'}</td>
                  <td style={s.td}>{e.delegation || '—'}</td>
                  <td style={{...s.td, display: 'flex', gap: '6px'}}>
                    <button style={{...s.btn('warning'), padding: '6px 10px'}} onClick={() => { setEditingElu(e); setEluForm(e); }}><Edit2 size={16} /></button>
                    <button style={{...s.btn('danger'), padding: '6px 10px'}} onClick={() => deleteElu(e.id!)}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {elus.length === 0 && <tr><td colSpan={6} style={{...s.td, textAlign: 'center', padding: '30px', color: '#9ca3af'}}>Aucun élu</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {/* ─── SITES ───────────────────────────────────────────────── */}
      {selectedTab === 'sites' && (
        <>
          <div style={{marginBottom: '24px'}}>
            <div style={{marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center'}}>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                disabled={isImporting}
                style={{padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', opacity: isImporting ? 0.5 : 1, cursor: isImporting ? 'not-allowed' : 'pointer'}}
              />
              <button
                style={{...s.btn('primary'), opacity: isImporting ? 0.6 : 1, cursor: isImporting ? 'not-allowed' : 'pointer'}}
                onClick={importSites}
                disabled={isImporting}
              >
                <span style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                  <Upload size={16} /> {isImporting ? 'Import en cours...' : 'Importer Excel'}
                </span>
              </button>
            </div>

            {isImporting && (
              <div style={{marginBottom: '16px'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px'}}>
                  <div style={{flex: 1}}>
                    <div style={{height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden'}}>
                      <div
                        style={{
                          height: '100%',
                          backgroundColor: '#0ea5e9',
                          width: `${importProgress}%`,
                          transition: 'width 0.3s ease'
                        }}
                      />
                    </div>
                  </div>
                  <span style={{fontSize: '13px', fontWeight: '600', color: '#0ea5e9', minWidth: '45px', textAlign: 'right'}}>
                    {importProgress}%
                  </span>
                </div>

                {importedSitesList.length > 0 && (
                  <div style={{maxHeight: '300px', overflowY: 'auto', padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #86efac'}}>
                    <div style={{fontSize: '12px', fontWeight: '600', color: '#16a34a', marginBottom: '8px'}}>Sites importés ({importedSitesList.length})</div>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                      {importedSitesList.map((site: any, idx: number) => (
                        <div
                          key={idx}
                          style={{
                            fontSize: '12px',
                            color: '#15803d',
                            padding: '6px 8px',
                            backgroundColor: 'white',
                            borderRadius: '4px',
                            borderLeft: '3px solid #22c55e',
                            animation: 'slideIn 0.3s ease-in-out',
                            opacity: 1
                          }}
                        >
                          <strong>{site.code}</strong> - {site.designation}
                          {site.disabled && <span style={{color: '#f59e0b', marginLeft: '6px'}}>(désactivé)</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {importStatus && !isImporting && (
              <div style={{padding: '12px', borderRadius: '6px', backgroundColor: importStatus.errors?.length ? '#fef2f2' : '#f0fdf4'}}>
                <div style={{color: importStatus.errors?.length ? '#dc2626' : '#16a34a', fontWeight: '600', marginBottom: '8px'}}>
                  ✓ {importStatus.imported} importé(s), {importStatus.updated} mis à jour {importStatus.disabled ? `, ${importStatus.disabled} désactivé(s)` : ''}
                </div>
                {importStatus.errors?.length > 0 && (
                  <details style={{marginTop: '8px'}}>
                    <summary style={{cursor: 'pointer', color: '#dc2626'}}>Voir les erreurs ({importStatus.errors.length})</summary>
                    <ul style={{marginTop: '8px', paddingLeft: '20px'}}>
                      {importStatus.errors.map((e: string, i: number) => <li key={i} style={{color: '#dc2626', fontSize: '12px'}}>{e}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>

          {editingSite && (
            <div style={s.form}>
              <div style={s.row}>
                <span style={s.label}>Nom du site</span>
                <input style={s.input} value={siteForm.nom} onChange={e => setSiteForm({...siteForm, nom: e.target.value})} />
              </div>
              <div style={s.row}>
                <span style={s.label}>Adresse</span>
                <input style={s.input} value={siteForm.adresse || ''} onChange={e => setSiteForm({...siteForm, adresse: e.target.value})} />
              </div>
              <div style={s.row}>
                <span style={s.label}>
                  <input type="checkbox" checked={siteForm.is_active} onChange={e => setSiteForm({...siteForm, is_active: e.target.checked})} /> Actif
                </span>
              </div>
              <button style={s.btn('success')} onClick={saveSite}>Enregistrer</button>
              <button style={{...s.btn('danger'), marginLeft: '8px'}} onClick={() => setEditingSite(null)}>Annuler</button>
            </div>
          )}

          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Code</th>
                <th style={s.th}>Nom</th>
                <th style={s.th}>Catégorie</th>
                <th style={s.th}>Adresse</th>
                <th style={s.th}>État</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sites.map(site => (
                <tr key={site.id} style={{background: site.is_active ? 'white' : '#f9fafb'}}>
                  <td style={s.td}><code style={{fontSize: '12px', background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px'}}>{site.code_bien || '—'}</code></td>
                  <td style={s.td}><strong>{site.nom}</strong></td>
                  <td style={s.td}>{site.categorie ? <span style={s.badge('#6366f1')}>{site.categorie}</span> : '—'}</td>
                  <td style={s.td}>{site.adresse || '—'}</td>
                  <td style={s.td}><span style={s.badge(site.is_active ? '#10b981' : '#ef4444')}>{site.is_active ? '✓ Actif' : '✕ Inactif'}</span></td>
                  <td style={{...s.td, display: 'flex', gap: '6px'}}>
                    <button style={{...s.btn('warning'), padding: '6px 10px'}} onClick={() => { setEditingSite(site); setSiteForm(site); }}><Edit2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {sites.length === 0 && <tr><td colSpan={4} style={{...s.td, textAlign: 'center', padding: '30px', color: '#9ca3af'}}>Aucun site</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {/* ─── ÉCOLES ──────────────────────────────────────────────── */}
      {selectedTab === 'ecoles' && (
        <>
          <button style={s.btn(editingEcole ? 'danger' : 'primary')} onClick={() => {
            if (editingEcole) { setEditingEcole(null); setEcoleForm({ nom: '', adresse: '', code_postal: '', email: '', telephone: '', directeur: '' }); }
            else { setEditingEcole({} as Ecole); }
          }}>
            {editingEcole ? '✕ Annuler' : <span style={{display: 'flex', alignItems: 'center', gap: '6px'}}><Plus size={16} /> Ajouter une école</span>}
          </button>

          {editingEcole !== null && (
            <div style={s.form}>
              <div style={s.row}>
                <span style={s.label}>Nom</span>
                <input style={s.input} value={ecoleForm.nom} onChange={e => setEcoleForm({...ecoleForm, nom: e.target.value})} />
              </div>
              <div style={s.row}>
                <span style={s.label}>Adresse</span>
                <input style={s.input} value={ecoleForm.adresse || ''} onChange={e => setEcoleForm({...ecoleForm, adresse: e.target.value})} />
              </div>
              <div style={s.row}>
                <span style={s.label}>Code postal</span>
                <input style={s.input} value={ecoleForm.code_postal || ''} onChange={e => setEcoleForm({...ecoleForm, code_postal: e.target.value})} />
              </div>
              <div style={s.row}>
                <span style={s.label}>Email</span>
                <input style={s.input} type="email" value={ecoleForm.email || ''} onChange={e => setEcoleForm({...ecoleForm, email: e.target.value})} />
              </div>
              <div style={s.row}>
                <span style={s.label}>Téléphone</span>
                <input style={s.input} value={ecoleForm.telephone || ''} onChange={e => setEcoleForm({...ecoleForm, telephone: e.target.value})} />
              </div>
              <div style={s.row}>
                <span style={s.label}>Directeur</span>
                <input style={s.input} value={ecoleForm.directeur || ''} onChange={e => setEcoleForm({...ecoleForm, directeur: e.target.value})} />
              </div>
              <button style={s.btn('success')} onClick={saveEcole}>{editingEcole?.id ? 'Enregistrer' : 'Créer'}</button>
            </div>
          )}

          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Nom</th>
                <th style={s.th}>Adresse</th>
                <th style={s.th}>Code postal</th>
                <th style={s.th}>Email</th>
                <th style={s.th}>Directeur</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ecoles.map(e => (
                <tr key={e.id}>
                  <td style={s.td}><strong>{e.nom}</strong></td>
                  <td style={s.td}>{e.adresse || '—'}</td>
                  <td style={s.td}>{e.code_postal || '—'}</td>
                  <td style={s.td}><code style={{fontSize: '12px'}}>{e.email || '—'}</code></td>
                  <td style={s.td}>{e.directeur || '—'}</td>
                  <td style={{...s.td, display: 'flex', gap: '6px'}}>
                    <button style={{...s.btn('warning'), padding: '6px 10px'}} onClick={() => { setEditingEcole(e); setEcoleForm(e); }}><Edit2 size={16} /></button>
                    <button style={{...s.btn('danger'), padding: '6px 10px'}} onClick={() => deleteEcole(e.id!)}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {ecoles.length === 0 && <tr><td colSpan={6} style={{...s.td, textAlign: 'center', padding: '30px', color: '#9ca3af'}}>Aucune école</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
