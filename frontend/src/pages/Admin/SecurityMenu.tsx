import React, { useState, useEffect } from 'react';
import {
  Download, Upload, AlertTriangle, CheckCircle, Clock, Database,
  FileArchive, HardDrive, ShieldAlert, Loader2, RefreshCw, Server, Package,
  CalendarClock, Mail, Search, Save, PlayCircle, X, FolderInput,
  Layers, Settings2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useADSearch } from '../../utils/useADSearch';

type ExportType = 'sqlite' | 'postgres' | 'files' | 'global';
type ImportType = 'sqlite' | 'postgres' | 'files';
type ProgressStatus = 'pending' | 'loading' | 'success' | 'error';

interface Recipient { email: string; displayName: string }
interface AutoConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  hour: number;
  weekday: number;
  destPath: string;
  retention: number;
  alertAfterDays: number;
  recipients: Recipient[];
  lastRun: { at: string; ok: boolean; message: string; file?: string; location?: string } | null;
  storageRoot?: string;
  backupSubdir?: string;
  defaultDestLabel?: string;
}
interface AdUser { username: string; displayName: string; email: string; service?: string }
interface SchemaItem { name: string; tables: number; bytes: number; size: string }
interface SchemaInfo { available: SchemaItem[]; selected: string[]; defaultExcluded: string[] }

interface BackupStatus {
  sqlite?: { path: string | null; size: number; initialized: boolean };
  postgres?: { database: string | null; size: string | null; connected: boolean; method?: string; format?: string };
  timestamp?: string;
}

const formatMB = (bytes?: number) => {
  if (!bytes && bytes !== 0) return 'N/A';
  return `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
};

/** Téléchargement classique (repli si File System Access API indisponible). */
const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  window.URL.revokeObjectURL(url);
};

/**
 * Enregistre un Blob via la boîte « Enregistrer sous… » (showSaveFilePicker).
 * Contrairement à showDirectoryPicker, cette API n'est pas bloquée pour
 * Documents / Téléchargements. Renvoie true si enregistré, false si annulé,
 * ou lève si l'API est indisponible (-> repli téléchargement par l'appelant).
 * `startIn` peut être un FileSystemHandle pour rouvrir dans le même dossier.
 */
const saveBlobAs = async (blob: Blob, suggestedName: string, startIn?: any): Promise<any> => {
  const picker = (window as any).showSaveFilePicker;
  if (typeof picker !== 'function') throw new Error('NO_PICKER');
  const opts: any = { suggestedName, id: 'dsi-backup' };
  opts.startIn = startIn || 'documents';
  const handle = await picker(opts);
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return handle;
};

export default function SecurityMenu() {
  const { token } = useAuth();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'export' | 'import' | 'auto'>('export');
  const [busy, setBusy] = useState<string | null>(null);
  const [importFiles, setImportFiles] = useState<Record<ImportType, File | null>>({
    sqlite: null, postgres: null, files: null
  });
  const [progress, setProgress] = useState<{ status: ProgressStatus; message: string }>({
    status: 'pending', message: ''
  });

  // Sauvegarde automatique
  const [auto, setAuto] = useState<AutoConfig | null>(null);
  // Recherche AD (hook générique : gère debounce, endpoint /api/ad/search?q=…).
  const adSearch = useADSearch(token);

  // Sélection des schémas PostgreSQL
  const [schemaInfo, setSchemaInfo] = useState<SchemaInfo | null>(null);
  const [schemaSel, setSchemaSel] = useState<string[]>([]);
  const [showSchemas, setShowSchemas] = useState(false);
  const [savingSchemas, setSavingSchemas] = useState(false);

  useEffect(() => { if (token) { fetchBackupStatus(); fetchAutoConfig(); fetchSchemas(); } }, [token]);

  const fetchSchemas = async () => {
    try {
      const res = await fetch('/api/backup/schemas', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d: SchemaInfo = await res.json();
        setSchemaInfo(d);
        setSchemaSel(d.selected);
      }
    } catch (e) {
      console.error('Failed to fetch schemas:', e);
    }
  };

  const openSchemaModal = () => {
    if (schemaInfo) setSchemaSel(schemaInfo.selected); // repart de la sélection enregistrée
    setShowSchemas(true);
  };

  const toggleSchema = (name: string) =>
    setSchemaSel(prev => prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]);

  const saveSchemas = async () => {
    setSavingSchemas(true);
    try {
      const res = await fetch('/api/backup/schemas', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemas: schemaSel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setSchemaInfo(prev => prev ? { ...prev, selected: data.selected } : prev);
      setShowSchemas(false);
      setProgress({ status: 'success', message: `Schémas à sauvegarder : ${data.selected.length} sélectionné(s).` });
      setTimeout(() => setProgress(p => p.status !== 'loading' ? { status: 'pending', message: '' } : p), 5000);
    } catch (e) {
      setProgress({ status: 'error', message: e instanceof Error ? e.message : 'Échec de l\'enregistrement des schémas' });
    } finally {
      setSavingSchemas(false);
    }
  };

  const fetchAutoConfig = async () => {
    try {
      const res = await fetch('/api/backup/auto-config', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setAuto(await res.json());
    } catch (e) {
      console.error('Failed to fetch auto config:', e);
    }
  };

  const patchAuto = (patch: Partial<AutoConfig>) => setAuto(prev => prev ? { ...prev, ...patch } : prev);

  const addRecipient = (u: AdUser) => {
    if (!u.email) return;
    setAuto(prev => {
      if (!prev) return prev;
      if (prev.recipients.some(r => r.email.toLowerCase() === u.email.toLowerCase())) return prev;
      return { ...prev, recipients: [...prev.recipients, { email: u.email, displayName: u.displayName || u.email }] };
    });
    adSearch.setQuery(''); adSearch.clearResults();
  };

  const removeRecipient = (email: string) =>
    setAuto(prev => prev ? { ...prev, recipients: prev.recipients.filter(r => r.email !== email) } : prev);

  const saveAutoConfig = async () => {
    if (!auto) return;
    setBusy('auto-save');
    setProgress({ status: 'loading', message: 'Enregistrement de la configuration…' });
    try {
      const res = await fetch('/api/backup/auto-config', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: auto.enabled, frequency: auto.frequency, hour: auto.hour,
          weekday: auto.weekday, destPath: auto.destPath, retention: auto.retention,
          alertAfterDays: auto.alertAfterDays, recipients: auto.recipients,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.config) patchAuto(data.config);
      setProgress({ status: 'success', message: 'Configuration enregistrée.' });
    } catch (e) {
      setProgress({ status: 'error', message: e instanceof Error ? e.message : 'Échec de l\'enregistrement' });
    } finally {
      setBusy(null);
      setTimeout(() => setProgress(p => p.status !== 'loading' ? { status: 'pending', message: '' } : p), 6000);
    }
  };

  const runAutoNow = async () => {
    setBusy('auto-run');
    setProgress({ status: 'loading', message: 'Sauvegarde en cours… (cela peut prendre plusieurs minutes)' });
    try {
      const res = await fetch('/api/backup/auto/run-now', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setProgress({ status: 'success', message: `Sauvegarde terminée : ${data.file || ''} (${formatMB(data.size)})` });
      fetchAutoConfig();
    } catch (e) {
      setProgress({ status: 'error', message: e instanceof Error ? e.message : 'Échec de la sauvegarde' });
    } finally {
      setBusy(null);
      setTimeout(() => setProgress(p => p.status !== 'loading' ? { status: 'pending', message: '' } : p), 8000);
    }
  };

  const fetchBackupStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/backup/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setStatus(await res.json());
    } catch (e) {
      console.error('Failed to fetch backup status:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (type: ExportType) => {
    setBusy(`export-${type}`);
    setProgress({ status: 'loading', message: `Export ${type} en cours…` });
    try {
      // 1. Récupérer le dump.
      const res = await fetch(`/api/backup/export/${type}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        let msg = res.statusText;
        try { const j = await res.json(); msg = j.error || j.message || msg; } catch {}
        throw new Error(msg);
      }
      const cd = res.headers.get('content-disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `backup_${type}.zip`;
      const logName = filename.replace(/\.[^.]+$/, '') + '.log.txt';
      const blob = await res.blob();

      // 2. Récupérer le log associé (schémas/tables/fichiers + tailles).
      let logText = '';
      try {
        const logRes = await fetch(`/api/backup/log/${type}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (logRes.ok) logText = await logRes.text();
      } catch { /* log facultatif */ }
      const logBlob = new Blob([logText || `(log indisponible pour « ${type} »)`], { type: 'text/plain;charset=utf-8' });

      // 3. Enregistrer via la boîte « Enregistrer sous… » (showSaveFilePicker).
      //    Le log est ensuite proposé dans le MÊME dossier (startIn = handle).
      try {
        const handle = await saveBlobAs(blob, filename);          // boîte « Enregistrer sous »
        try {
          await saveBlobAs(logBlob, logName, handle);             // log dans le même dossier
        } catch (e: any) {
          if (e && e.name === 'AbortError') downloadBlob(logBlob, logName); // log annulé -> téléchargé
          else throw e;
        }
        setProgress({ status: 'success', message: `Enregistré : ${filename} + ${logName}` });
      } catch (e: any) {
        if (e && e.name === 'AbortError') {                       // utilisateur a annulé
          setProgress({ status: 'pending', message: 'Enregistrement annulé.' });
          setBusy(null);
          setTimeout(() => setProgress(p => p.status !== 'loading' ? { status: 'pending', message: '' } : p), 4000);
          return;
        }
        // API indisponible (Firefox…) ou autre -> repli téléchargement classique des deux.
        downloadBlob(blob, filename);
        downloadBlob(logBlob, logName);
        setProgress({ status: 'success', message: `Téléchargé : ${filename} + ${logName}` });
      }
    } catch (e) {
      setProgress({ status: 'error', message: e instanceof Error ? e.message : 'Échec de l\'export' });
    } finally {
      setBusy(null);
      setTimeout(() => setProgress(p => p.status !== 'loading' ? { status: 'pending', message: '' } : p), 6000);
    }
  };

  const handleImport = async (type: ImportType) => {
    const file = importFiles[type];
    if (!file) {
      setProgress({ status: 'error', message: 'Veuillez sélectionner un fichier.' });
      return;
    }
    setBusy(`import-${type}`);
    setProgress({ status: 'loading', message: `Restauration ${type} en cours…` });
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/backup/import/${type}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || res.statusText);
      setProgress({ status: 'success', message: data.message || `Restauration « ${type} » terminée` });
      setImportFiles(prev => ({ ...prev, [type]: null }));
      fetchBackupStatus();
    } catch (e) {
      setProgress({ status: 'error', message: e instanceof Error ? e.message : 'Échec de l\'import' });
    } finally {
      setBusy(null);
    }
  };

  const exportCards: { type: ExportType; title: string; desc: string; icon: any; accent: string; featured?: boolean }[] = [
    { type: 'sqlite', title: 'Base SQLite', desc: 'Base locale (utilisateurs, paramètres AD/Azure).', icon: Database, accent: '#3b82f6' },
    { type: 'postgres', title: 'Base PostgreSQL', desc: 'Dump SQL complet de toutes les données applicatives.', icon: Server, accent: '#10b981' },
    { type: 'files', title: 'Tous les fichiers', desc: 'Archive ZIP de l\'ensemble du stockage SMB.', icon: FileArchive, accent: '#8b5cf6' },
    { type: 'global', title: 'Sauvegarde globale', desc: 'Tout-en-un : SQLite + PostgreSQL + fichiers.', icon: Package, accent: '#ef4444', featured: true },
  ];

  const importCards: { type: ImportType; title: string; desc: string; accept: string; icon: any; accent: string }[] = [
    { type: 'sqlite', title: 'Restaurer SQLite', desc: 'Remplace la base SQLite (.db / .sqlite).', accept: '.db,.sqlite', icon: Database, accent: '#3b82f6' },
    { type: 'postgres', title: 'Restaurer PostgreSQL', desc: 'Dump .sql (via psql) ou .ndjson (restauration JS).', accept: '.sql,.ndjson', icon: Server, accent: '#10b981' },
    { type: 'files', title: 'Restaurer les fichiers', desc: 'Renvoie une archive ZIP vers le stockage.', accept: '.zip', icon: FileArchive, accent: '#8b5cf6' },
  ];

  const statusMeta = {
    pending: { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0', Icon: Clock },
    loading: { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', Icon: Loader2 },
    success: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', Icon: CheckCircle },
    error: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', Icon: AlertTriangle },
  }[progress.status];

  return (
    <div className="sec-page">
      {/* Hero */}
      <div className="sec-hero">
        <div className="sec-hero-icon"><ShieldAlert size={28} /></div>
        <div>
          <h1>Sécurité &amp; Sauvegarde</h1>
          <p>Exportez et restaurez l'intégralité des données. Idéal pour migrer lorsque le serveur
            PostgreSQL ou le chemin de stockage des fichiers change.</p>
        </div>
        <button className="sec-refresh" onClick={fetchBackupStatus} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'sec-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* Status cards */}
      <div className="sec-status-grid">
        <div className="sec-stat-card">
          <div className="sec-stat-head"><span className="sec-dot" style={{ background: '#3b82f6' }} /><Database size={18} color="#3b82f6" /><h3>SQLite</h3></div>
          <ul>
            <li><span>Statut</span><strong style={{ color: status?.sqlite?.initialized ? '#16a34a' : '#dc2626' }}>{status?.sqlite?.initialized ? 'Prête' : 'Indisponible'}</strong></li>
            <li><span>Taille</span><strong>{formatMB(status?.sqlite?.size)}</strong></li>
            <li className="sec-mono"><span>Fichier</span><code title={status?.sqlite?.path || ''}>{status?.sqlite?.path?.split(/[\\/]/).pop() || 'N/A'}</code></li>
          </ul>
        </div>
        <div className="sec-stat-card">
          <div className="sec-stat-head"><span className="sec-dot" style={{ background: '#10b981' }} /><Server size={18} color="#10b981" /><h3>PostgreSQL</h3></div>
          <ul>
            <li><span>Statut</span><strong style={{ color: status?.postgres?.connected ? '#16a34a' : '#dc2626' }}>{status?.postgres?.connected ? 'Connectée' : 'Déconnectée'}</strong></li>
            <li><span>Taille</span><strong>{status?.postgres?.size || 'N/A'}</strong></li>
            <li className="sec-mono"><span>Base</span><code>{status?.postgres?.database || 'N/A'}</code></li>
            <li><span>Méthode</span><strong title={status?.postgres?.method === 'pg_dump' ? 'Outils client PostgreSQL détectés' : 'Fallback JavaScript (pg_dump non installé)'}>{status?.postgres?.method === 'pg_dump' ? 'pg_dump (.sql)' : status?.postgres?.method === 'js' ? 'JS (.ndjson)' : 'N/A'}</strong></li>
          </ul>
        </div>
        <div className="sec-stat-card">
          <div className="sec-stat-head"><span className="sec-dot" style={{ background: '#8b5cf6' }} /><HardDrive size={18} color="#8b5cf6" /><h3>Stockage fichiers</h3></div>
          <ul>
            <li><span>Type</span><strong>SMB / CIFS</strong></li>
            <li><span>Statut</span><strong style={{ color: '#16a34a' }}>Configuré</strong></li>
            <li className="sec-mono"><span>Maj</span><code>{status?.timestamp ? new Date(status.timestamp).toLocaleString('fr-FR') : 'N/A'}</code></li>
          </ul>
        </div>
      </div>

      {/* Tabs */}
      <div className="sec-tabs">
        <button className={activeTab === 'export' ? 'active' : ''} onClick={() => setActiveTab('export')}>
          <Download size={16} /> Exporter
        </button>
        <button className={activeTab === 'import' ? 'active' : ''} onClick={() => setActiveTab('import')}>
          <Upload size={16} /> Importer
        </button>
        <button className={activeTab === 'auto' ? 'active' : ''} onClick={() => setActiveTab('auto')}>
          <CalendarClock size={16} /> Automatisation
        </button>
      </div>

      {/* Export panel */}
      {activeTab === 'export' && (
        <>
        {/* Sélection des schémas PostgreSQL à sauvegarder */}
        <div className="sec-schemabar">
          <div className="sec-schemabar-info">
            <Layers size={18} color="#10b981" />
            <div>
              <strong>Schémas PostgreSQL sauvegardés</strong>
              <span>
                {schemaInfo
                  ? `${schemaInfo.selected.length} / ${schemaInfo.available.length} schémas — ${schemaInfo.selected.join(', ') || 'aucun'}`
                  : 'Chargement…'}
              </span>
            </div>
          </div>
          <button className="sec-schemabar-btn" onClick={openSchemaModal} disabled={!schemaInfo}>
            <Settings2 size={15} /> Choisir les schémas
          </button>
        </div>

        <div className="sec-grid">
          {exportCards.map(card => {
            const Icon = card.icon;
            const isBusy = busy === `export-${card.type}`;
            return (
              <div key={card.type} className={`sec-card ${card.featured ? 'featured' : ''}`}>
                <div className="sec-card-icon" style={{ background: `${card.accent}1a`, color: card.accent }}><Icon size={22} /></div>
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
                <button
                  className="sec-btn"
                  style={{ background: card.accent }}
                  onClick={() => handleExport(card.type)}
                  disabled={!!busy}
                >
                  {isBusy ? <Loader2 size={16} className="sec-spin" /> : <Download size={16} />}
                  {isBusy ? 'Export…' : 'Exporter'}
                </button>
              </div>
            );
          })}
        </div>
        </>
      )}

      {/* Import panel */}
      {activeTab === 'import' && (
        <>
          <div className="sec-warning">
            <AlertTriangle size={18} />
            <span><strong>Attention :</strong> l'import écrase les données existantes. Effectuez une sauvegarde globale au préalable.</span>
          </div>
          <div className="sec-grid sec-grid-3">
            {importCards.map(card => {
              const Icon = card.icon;
              const file = importFiles[card.type];
              const isBusy = busy === `import-${card.type}`;
              return (
                <div key={card.type} className="sec-card">
                  <div className="sec-card-icon" style={{ background: `${card.accent}1a`, color: card.accent }}><Icon size={22} /></div>
                  <h3>{card.title}</h3>
                  <p>{card.desc}</p>
                  <label className="sec-file">
                    <input
                      type="file"
                      accept={card.accept}
                      disabled={!!busy}
                      onChange={(e) => setImportFiles(prev => ({ ...prev, [card.type]: e.target.files?.[0] || null }))}
                    />
                    <span className="sec-file-label">{file ? file.name : `Choisir un fichier (${card.accept})`}</span>
                  </label>
                  <button
                    className="sec-btn"
                    style={{ background: card.accent }}
                    onClick={() => handleImport(card.type)}
                    disabled={!!busy || !file}
                  >
                    {isBusy ? <Loader2 size={16} className="sec-spin" /> : <Upload size={16} />}
                    {isBusy ? 'Import…' : 'Restaurer'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Automation panel */}
      {activeTab === 'auto' && (
        <div className="sec-auto">
          {!auto ? (
            <div className="sec-card" style={{ alignItems: 'center', padding: 40 }}>
              <Loader2 size={22} className="sec-spin" />
            </div>
          ) : (
            <>
              {/* En-tête : activation + dernière exécution */}
              <div className="sec-auto-top">
                <label className="sec-switch">
                  <input
                    type="checkbox"
                    checked={auto.enabled}
                    onChange={(e) => patchAuto({ enabled: e.target.checked })}
                  />
                  <span className="sec-switch-track"><span className="sec-switch-thumb" /></span>
                  <span className="sec-switch-label">{auto.enabled ? 'Sauvegarde automatique activée' : 'Sauvegarde automatique désactivée'}</span>
                </label>
                {auto.lastRun && (
                  <div className="sec-lastrun" style={{ color: auto.lastRun.ok ? '#16a34a' : '#dc2626' }}>
                    {auto.lastRun.ok ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
                    <span>Dernière : {new Date(auto.lastRun.at).toLocaleString('fr-FR')} — {auto.lastRun.message}</span>
                    {auto.lastRun.location && (
                      <span style={{ display: 'block', fontSize: 11, color: '#64748b', marginTop: 2, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        📁 {auto.lastRun.location}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="sec-auto-grid">
                {/* Planification */}
                <div className="sec-card">
                  <div className="sec-card-icon" style={{ background: '#3b82f61a', color: '#3b82f6' }}><CalendarClock size={22} /></div>
                  <h3>Planification</h3>
                  <p>Fréquence et heure de déclenchement de la sauvegarde globale.</p>
                  <div className="sec-field">
                    <label>Fréquence</label>
                    <select value={auto.frequency} onChange={(e) => patchAuto({ frequency: e.target.value as AutoConfig['frequency'] })}>
                      <option value="daily">Quotidienne</option>
                      <option value="weekly">Hebdomadaire</option>
                      <option value="monthly">Mensuelle (le 1er)</option>
                    </select>
                  </div>
                  {auto.frequency === 'weekly' && (
                    <div className="sec-field">
                      <label>Jour de la semaine</label>
                      <select value={auto.weekday} onChange={(e) => patchAuto({ weekday: parseInt(e.target.value, 10) })}>
                        {['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map((d, i) => (
                          <option key={i} value={i}>{d}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="sec-field">
                    <label>Heure</label>
                    <select value={auto.hour} onChange={(e) => patchAuto({ hour: parseInt(e.target.value, 10) })}>
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Destination & rétention */}
                <div className="sec-card">
                  <div className="sec-card-icon" style={{ background: '#8b5cf61a', color: '#8b5cf6' }}><FolderInput size={22} /></div>
                  <h3>Destination &amp; rétention</h3>
                  <p>Par défaut, le stockage SMB (sous-dossier <code>{auto.backupSubdir || '_backups'}</code>). Le dossier des sauvegardes n'est jamais inclus dans la sauvegarde.</p>
                  <div className="sec-field">
                    <label>Dossier de destination</label>
                    <input
                      type="text"
                      placeholder={auto.defaultDestLabel || '(stockage)/_backups'}
                      value={auto.destPath}
                      onChange={(e) => patchAuto({ destPath: e.target.value })}
                    />
                    <small>
                      <strong>Laisser vide</strong> pour utiliser le stockage configuré dans <code>/admin/ged</code> (recommandé sur Docker — les chemins UNC Windows ne fonctionnent pas sous Linux).
                      Sinon, chemin local accessible par le serveur (ex. <code>/backups</code> ou point de montage SMB).
                    </small>
                  </div>
                  <div className="sec-field">
                    <label>Nombre de sauvegardes à conserver</label>
                    <input
                      type="number" min={1} max={365}
                      value={auto.retention}
                      onChange={(e) => patchAuto({ retention: parseInt(e.target.value, 10) || 1 })}
                    />
                    <small>Les sauvegardes les plus anciennes au-delà de ce nombre sont supprimées automatiquement.</small>
                  </div>
                  <div className="sec-field">
                    <label>Seuil d'alerte (jours)</label>
                    <input
                      type="number" min={0} max={365}
                      value={auto.alertAfterDays ?? 0}
                      onChange={(e) => patchAuto({ alertAfterDays: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    />
                    <small>Envoie une alerte e-mail aux destinataires si aucune sauvegarde réussie depuis ce nombre de jours. <strong>0 = automatique</strong> selon la fréquence (quotidien : 2 j, hebdo : 8 j, mensuel : 32 j).</small>
                  </div>
                </div>

                {/* Destinataires */}
                <div className="sec-card sec-card-wide">
                  <div className="sec-card-icon" style={{ background: '#10b9811a', color: '#10b981' }}><Mail size={22} /></div>
                  <h3>Destinataires du rapport</h3>
                  <p>L'état et le journal détaillé sont envoyés à ces personnes après chaque sauvegarde automatique.</p>
                  <div className="sec-field sec-ad">
                    <label>Ajouter un destinataire (recherche AD)</label>
                    <div className="sec-ad-input">
                      <Search size={15} />
                      <input
                        type="text"
                        placeholder="Nom, prénom ou identifiant…"
                        value={adSearch.query}
                        onChange={(e) => adSearch.setQuery(e.target.value)}
                      />
                      {adSearch.searching && <Loader2 size={15} className="sec-spin" />}
                    </div>
                    {adSearch.results.length > 0 && (
                      <ul className="sec-ad-results">
                        {adSearch.results.map(u => (
                          <li key={u.username} onClick={() => addRecipient(u)}>
                            <strong>{u.displayName || u.username}</strong>
                            <span>{u.email || 'pas d\'e-mail'}{u.service ? ` · ${u.service}` : ''}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {auto.recipients.length > 0 ? (
                    <div className="sec-chips">
                      {auto.recipients.map(r => (
                        <span key={r.email} className="sec-chip">
                          <Mail size={13} />
                          <span title={r.email}>{r.displayName}</span>
                          <button onClick={() => removeRecipient(r.email)}><X size={13} /></button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="sec-empty">Aucun destinataire. Aucun rapport ne sera envoyé.</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="sec-auto-actions">
                <button className="sec-btn" style={{ background: '#1e293b' }} onClick={saveAutoConfig} disabled={!!busy}>
                  {busy === 'auto-save' ? <Loader2 size={16} className="sec-spin" /> : <Save size={16} />}
                  Enregistrer la configuration
                </button>
                <button className="sec-btn" style={{ background: '#ef4444' }} onClick={runAutoNow} disabled={!!busy}>
                  {busy === 'auto-run' ? <Loader2 size={16} className="sec-spin" /> : <PlayCircle size={16} />}
                  Lancer maintenant
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Schema selection modal */}
      {showSchemas && schemaInfo && (
        <div className="sec-modal-overlay" onClick={() => !savingSchemas && setShowSchemas(false)}>
          <div className="sec-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sec-modal-head">
              <div className="sec-modal-title"><Layers size={20} color="#10b981" /><h3>Schémas PostgreSQL à sauvegarder</h3></div>
              <button className="sec-modal-close" onClick={() => setShowSchemas(false)} disabled={savingSchemas}><X size={18} /></button>
            </div>
            <p className="sec-modal-sub">
              Cochez les schémas à inclure dans les exports PostgreSQL, la sauvegarde globale et les sauvegardes
              automatiques. Par défaut, <code>{(schemaInfo.defaultExcluded || []).join(', ') || 'aucun'}</code> est exclu.
            </p>
            <div className="sec-modal-actions-top">
              <button onClick={() => setSchemaSel(schemaInfo.available.map(s => s.name))}>Tout cocher</button>
              <button onClick={() => setSchemaSel([])}>Tout décocher</button>
              <button onClick={() => setSchemaSel(schemaInfo.available.filter(s => !(schemaInfo.defaultExcluded || []).includes(s.name)).map(s => s.name))}>Défaut</button>
            </div>
            <div className="sec-schema-list">
              {schemaInfo.available.map(s => {
                const checked = schemaSel.includes(s.name);
                return (
                  <label key={s.name} className={`sec-schema-item ${checked ? 'on' : ''}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSchema(s.name)} />
                    <span className="sec-schema-check" />
                    <span className="sec-schema-name">{s.name}</span>
                    <span className="sec-schema-meta">{s.tables} table{s.tables > 1 ? 's' : ''} · {s.size}</span>
                  </label>
                );
              })}
            </div>
            <div className="sec-modal-foot">
              <span className="sec-modal-count">{schemaSel.length} sélectionné(s)</span>
              <div>
                <button className="sec-btn sec-btn-ghost" onClick={() => setShowSchemas(false)} disabled={savingSchemas}>Annuler</button>
                <button className="sec-btn" style={{ background: '#10b981' }} onClick={saveSchemas} disabled={savingSchemas || schemaSel.length === 0}>
                  {savingSchemas ? <Loader2 size={16} className="sec-spin" /> : <Save size={16} />}
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Progress banner */}
      {progress.message && (
        <div className="sec-banner" style={{ background: statusMeta.bg, borderColor: statusMeta.border, color: statusMeta.color }}>
          <statusMeta.Icon size={18} className={progress.status === 'loading' ? 'sec-spin' : ''} />
          <span>{progress.message}</span>
        </div>
      )}

      <style>{`
        .sec-page { max-width: 1100px; margin: 0 auto; padding: 4px; display: flex; flex-direction: column; gap: 22px; }

        .sec-hero {
          display: flex; align-items: center; gap: 18px;
          background: linear-gradient(135deg, #1a2234 0%, #2d3a52 100%);
          color: #fff; padding: 24px 28px; border-radius: 16px;
          box-shadow: 0 10px 30px rgba(26, 34, 52, 0.25);
        }
        .sec-hero-icon {
          width: 56px; height: 56px; flex-shrink: 0; border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(239, 68, 68, 0.2); color: #fca5a5;
        }
        .sec-hero h1 { margin: 0 0 4px; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; }
        .sec-hero p { margin: 0; font-size: 0.88rem; color: #cbd5e1; line-height: 1.5; max-width: 640px; }
        .sec-refresh {
          margin-left: auto; flex-shrink: 0; display: flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.15);
          padding: 9px 16px; border-radius: 9px; font-weight: 600; font-size: 0.82rem; cursor: pointer;
          transition: background 0.2s;
        }
        .sec-refresh:hover:not(:disabled) { background: rgba(255,255,255,0.18); }
        .sec-refresh:disabled { opacity: 0.6; cursor: default; }

        .sec-status-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .sec-stat-card {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .sec-stat-head { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
        .sec-stat-head h3 { margin: 0; font-size: 0.95rem; font-weight: 700; color: #1e293b; }
        .sec-dot { width: 9px; height: 9px; border-radius: 50%; }
        .sec-stat-card ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .sec-stat-card li { display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; }
        .sec-stat-card li span { color: #64748b; }
        .sec-stat-card li strong { color: #1e293b; font-weight: 700; }
        .sec-stat-card li.sec-mono code {
          background: #f1f5f9; padding: 2px 8px; border-radius: 6px; font-size: 0.74rem; color: #475569;
          max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        .sec-tabs { display: flex; gap: 6px; background: #e8edf3; padding: 5px; border-radius: 11px; width: fit-content; }
        .sec-tabs button {
          display: flex; align-items: center; gap: 8px; border: none; background: transparent;
          padding: 9px 20px; border-radius: 8px; font-weight: 600; font-size: 0.86rem; color: #64748b; cursor: pointer;
          transition: all 0.2s;
        }
        .sec-tabs button.active { background: #fff; color: #1e293b; box-shadow: 0 2px 6px rgba(0,0,0,0.08); }

        .sec-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        .sec-grid-3 { grid-template-columns: repeat(3, 1fr); }
        .sec-card {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 22px;
          display: flex; flex-direction: column; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .sec-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.08); }
        .sec-card.featured { border-color: #fca5a5; background: linear-gradient(135deg, #fff 0%, #fff5f5 100%); }
        .sec-card-icon {
          width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center;
          justify-content: center; margin-bottom: 14px;
        }
        .sec-card h3 { margin: 0 0 6px; font-size: 1rem; font-weight: 700; color: #1e293b; }
        .sec-card p { margin: 0 0 18px; font-size: 0.83rem; color: #64748b; line-height: 1.5; flex: 1; }

        .sec-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          border: none; color: #fff; padding: 10px 16px; border-radius: 9px;
          font-weight: 700; font-size: 0.85rem; cursor: pointer; transition: filter 0.2s, opacity 0.2s;
        }
        .sec-btn:hover:not(:disabled) { filter: brightness(1.08); }
        .sec-btn:disabled { opacity: 0.5; cursor: default; }

        .sec-file { display: block; margin-bottom: 12px; cursor: pointer; }
        .sec-file input { display: none; }
        .sec-file-label {
          display: block; padding: 9px 12px; border: 1.5px dashed #cbd5e1; border-radius: 9px;
          font-size: 0.78rem; color: #64748b; background: #f8fafc; text-align: center;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: border-color 0.2s;
        }
        .sec-file:hover .sec-file-label { border-color: #94a3b8; }

        .sec-warning {
          display: flex; align-items: center; gap: 10px; background: #fffbeb; border: 1px solid #fde68a;
          color: #92400e; padding: 13px 18px; border-radius: 11px; font-size: 0.85rem;
        }

        .sec-banner {
          display: flex; align-items: center; gap: 10px; border: 1px solid; padding: 13px 18px;
          border-radius: 11px; font-size: 0.86rem; font-weight: 600;
        }

        .sec-spin { animation: sec-spin 1s linear infinite; }
        @keyframes sec-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

        /* ── Automatisation ───────────────────────────────── */
        .sec-auto { display: flex; flex-direction: column; gap: 16px; }
        .sec-auto-top {
          display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
          background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px 20px;
        }
        .sec-lastrun { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; font-weight: 600; }

        .sec-switch { display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .sec-switch input { display: none; }
        .sec-switch-track {
          width: 44px; height: 24px; border-radius: 999px; background: #cbd5e1; position: relative; transition: background 0.2s; flex-shrink: 0;
        }
        .sec-switch-thumb {
          position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
          background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: transform 0.2s;
        }
        .sec-switch input:checked + .sec-switch-track { background: #16a34a; }
        .sec-switch input:checked + .sec-switch-track .sec-switch-thumb { transform: translateX(20px); }
        .sec-switch-label { font-size: 0.9rem; font-weight: 700; color: #1e293b; }

        .sec-auto-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        .sec-card-wide { grid-column: 1 / -1; }

        .sec-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
        .sec-field > label { font-size: 0.78rem; font-weight: 700; color: #475569; }
        .sec-field select, .sec-field input[type="text"], .sec-field input[type="number"] {
          padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 9px; font-size: 0.85rem;
          color: #1e293b; background: #fff; outline: none; transition: border-color 0.2s; width: 100%; box-sizing: border-box;
        }
        .sec-field select:focus, .sec-field input:focus { border-color: #3b82f6; }
        .sec-field small { font-size: 0.72rem; color: #94a3b8; line-height: 1.4; }
        .sec-field small code, .sec-card p code {
          background: #f1f5f9; padding: 1px 5px; border-radius: 5px; font-size: 0.9em; color: #475569;
        }

        .sec-ad { position: relative; }
        .sec-ad-input {
          display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1.5px solid #e2e8f0;
          border-radius: 9px; color: #94a3b8; background: #fff;
        }
        .sec-ad-input:focus-within { border-color: #3b82f6; }
        .sec-ad-input input { border: none; outline: none; flex: 1; font-size: 0.85rem; color: #1e293b; background: transparent; }
        .sec-ad-results {
          list-style: none; margin: 4px 0 0; padding: 4px; position: absolute; top: 100%; left: 0; right: 0; z-index: 20;
          background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: 0 12px 28px rgba(0,0,0,0.12);
          max-height: 240px; overflow-y: auto;
        }
        .sec-ad-results li {
          display: flex; flex-direction: column; gap: 2px; padding: 8px 12px; border-radius: 7px; cursor: pointer; transition: background 0.15s;
        }
        .sec-ad-results li:hover { background: #f1f5f9; }
        .sec-ad-results li strong { font-size: 0.85rem; color: #1e293b; }
        .sec-ad-results li span { font-size: 0.74rem; color: #64748b; }

        .sec-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .sec-chip {
          display: inline-flex; align-items: center; gap: 6px; background: #eff6ff; border: 1px solid #bfdbfe;
          color: #1e40af; padding: 5px 8px 5px 10px; border-radius: 999px; font-size: 0.8rem; font-weight: 600;
        }
        .sec-chip button {
          display: flex; border: none; background: rgba(30,64,175,0.12); color: #1e40af; border-radius: 50%;
          width: 18px; height: 18px; align-items: center; justify-content: center; cursor: pointer; padding: 0;
        }
        .sec-chip button:hover { background: rgba(30,64,175,0.25); }
        .sec-empty { font-size: 0.8rem; color: #94a3b8; font-style: italic; margin: 0; }

        .sec-auto-actions { display: flex; gap: 12px; justify-content: flex-end; }

        /* ── Barre + modale de sélection des schémas ──────── */
        .sec-schemabar {
          display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
          background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 12px 16px;
        }
        .sec-schemabar-info { display: flex; align-items: center; gap: 12px; }
        .sec-schemabar-info > div { display: flex; flex-direction: column; }
        .sec-schemabar-info strong { font-size: 0.86rem; color: #166534; }
        .sec-schemabar-info span { font-size: 0.76rem; color: #15803d; opacity: 0.85; max-width: 640px; }
        .sec-schemabar-btn {
          display: flex; align-items: center; gap: 7px; flex-shrink: 0; background: #fff; color: #166534;
          border: 1px solid #86efac; padding: 8px 14px; border-radius: 9px; font-weight: 600; font-size: 0.82rem; cursor: pointer;
          transition: background 0.2s;
        }
        .sec-schemabar-btn:hover:not(:disabled) { background: #dcfce7; }
        .sec-schemabar-btn:disabled { opacity: 0.6; cursor: default; }

        .sec-modal-overlay {
          position: fixed; inset: 0; background: rgba(15,23,42,0.5); z-index: 1000;
          display: flex; align-items: center; justify-content: center; padding: 20px;
        }
        .sec-modal {
          background: #fff; border-radius: 16px; width: 100%; max-width: 560px; max-height: 86vh;
          display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(0,0,0,0.3); overflow: hidden;
        }
        .sec-modal-head {
          display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #e2e8f0;
        }
        .sec-modal-title { display: flex; align-items: center; gap: 10px; }
        .sec-modal-title h3 { margin: 0; font-size: 1.05rem; font-weight: 700; color: #1e293b; }
        .sec-modal-close {
          display: flex; border: none; background: #f1f5f9; color: #64748b; border-radius: 8px;
          width: 32px; height: 32px; align-items: center; justify-content: center; cursor: pointer;
        }
        .sec-modal-close:hover:not(:disabled) { background: #e2e8f0; }
        .sec-modal-sub { margin: 14px 22px 0; font-size: 0.8rem; color: #64748b; line-height: 1.5; }
        .sec-modal-sub code { background: #f1f5f9; padding: 1px 6px; border-radius: 5px; color: #475569; }
        .sec-modal-actions-top { display: flex; gap: 8px; padding: 12px 22px 4px; }
        .sec-modal-actions-top button {
          background: #f1f5f9; border: 1px solid #e2e8f0; color: #475569; border-radius: 7px;
          padding: 5px 11px; font-size: 0.76rem; font-weight: 600; cursor: pointer;
        }
        .sec-modal-actions-top button:hover { background: #e2e8f0; }

        .sec-schema-list { overflow-y: auto; padding: 8px 22px; display: flex; flex-direction: column; gap: 6px; }
        .sec-schema-item {
          display: flex; align-items: center; gap: 12px; padding: 9px 12px; border: 1.5px solid #e2e8f0;
          border-radius: 9px; cursor: pointer; transition: border-color 0.15s, background 0.15s;
        }
        .sec-schema-item:hover { border-color: #cbd5e1; }
        .sec-schema-item.on { border-color: #86efac; background: #f0fdf4; }
        .sec-schema-item input { display: none; }
        .sec-schema-check {
          width: 18px; height: 18px; flex-shrink: 0; border-radius: 5px; border: 2px solid #cbd5e1;
          position: relative; transition: all 0.15s;
        }
        .sec-schema-item.on .sec-schema-check { background: #16a34a; border-color: #16a34a; }
        .sec-schema-item.on .sec-schema-check::after {
          content: ''; position: absolute; left: 5px; top: 1px; width: 4px; height: 9px;
          border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg);
        }
        .sec-schema-name { font-size: 0.86rem; font-weight: 600; color: #1e293b; font-family: ui-monospace, monospace; }
        .sec-schema-meta { margin-left: auto; font-size: 0.75rem; color: #94a3b8; }

        .sec-modal-foot {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 16px 22px; border-top: 1px solid #e2e8f0;
        }
        .sec-modal-foot > div { display: flex; gap: 10px; }
        .sec-modal-count { font-size: 0.8rem; color: #64748b; font-weight: 600; }
        .sec-btn-ghost { background: #f1f5f9 !important; color: #475569 !important; }

        @media (max-width: 900px) {
          .sec-status-grid, .sec-grid, .sec-grid-3, .sec-auto-grid { grid-template-columns: 1fr; }
          .sec-hero { flex-wrap: wrap; }
          .sec-refresh { margin-left: 0; }
        }
      `}</style>
    </div>
  );
}
