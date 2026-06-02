import React, { useState, useEffect, useRef } from 'react';
import { Database, Globe, Euro, Server, Eye, EyeOff, Save, CheckCircle, AlertCircle } from 'lucide-react';
import axios from 'axios';
import Admin from './Admin';
import AdminFinance from './AdminFinance';
import { useAuth } from '../contexts/AuthContext';

type DbTab = 'glpi' | 'glpi10' | 'oracle' | 'mariadb' | 'finance' | 'postgresql';

const TABS: { id: DbTab; label: string; Icon: React.ElementType }[] = [
  { id: 'glpi',       label: 'GLPI',           Icon: Globe    },
  { id: 'glpi10',     label: 'GLPI 10',         Icon: Globe    },
  { id: 'oracle',     label: 'Oracle',          Icon: Database },
  { id: 'mariadb',    label: 'MariaDB',         Icon: Server   },
  { id: 'finance',    label: 'Finance Mapping', Icon: Euro     },
  { id: 'postgresql', label: 'PostgreSQL',      Icon: Database },
];

const AdminDatabases: React.FC = () => {
  const [tab, setTab] = useState<DbTab>('glpi');

  return (
    <div className="adb-root">
      <div className="adb-header">
        <span className="adb-header-icon">
          <Database size={16} />
        </span>
        <div>
          <h1 className="adb-title">Bases de données</h1>
          <p className="adb-desc">Liaisons GLPI, Oracle, MariaDB, Finance et PostgreSQL</p>
        </div>
      </div>

      <nav className="adb-tabs">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`adb-tab${tab === id ? ' adb-tab--on' : ''}`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </nav>

      <div className="adb-body">
        {tab === 'glpi'       && <Admin section="glpi" />}
        {tab === 'glpi10'     && <Glpi10Config />}
        {tab === 'oracle'     && <Admin section="oracle" />}
        {tab === 'mariadb'    && <Admin section="mariadb" />}
        {tab === 'finance'    && <AdminFinance />}
        {tab === 'postgresql' && <PostgreSQLConfig />}
      </div>

      <style>{`
        .adb-root { display:flex; flex-direction:column; min-height:0; }

        .adb-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 18px;
          border-bottom: 1px solid #e8edf3;
          margin-bottom: 0;
        }

        .adb-header-icon {
          width: 34px; height: 34px;
          border-radius: 7px;
          background: #f0fdfa;
          color: #0f766e;
          border: 1px solid #99f6e4;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        .adb-title {
          font-size: 0.9375rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 2px 0;
          line-height: 1.3;
        }

        .adb-desc {
          font-size: 0.78rem;
          color: #94a3b8;
          margin: 0;
          line-height: 1.4;
        }

        .adb-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid #e8edf3;
          margin-bottom: 24px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .adb-tabs::-webkit-scrollbar { display: none; }

        .adb-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 14px;
          border: none;
          border-bottom: 2px solid transparent;
          background: transparent;
          color: #64748b;
          font-size: 0.8125rem;
          font-weight: 500;
          cursor: pointer;
          transition: color .15s, border-color .15s;
          white-space: nowrap;
          margin-bottom: -1px;
          border-radius: 0;
          letter-spacing: 0.01em;
        }
        .adb-tab:hover { color: #1e293b; }
        .adb-tab--on {
          color: #0f766e;
          border-bottom-color: #0f766e;
          font-weight: 600;
        }

        .adb-body { min-height: 0; }
      `}</style>
    </div>
  );
};

interface PgConfig {
  is_enabled: number;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl_mode: string;
  connect_timeout: number;
  application_name: string;
  schema_name: string;
  updated_at?: string;
}

const DEFAULT_CONFIG: PgConfig = {
  is_enabled: 1,
  host: '',
  port: 5432,
  database: '',
  username: '',
  password: '',
  ssl_mode: 'disable',
  connect_timeout: 10,
  application_name: 'DSIHub',
  schema_name: 'public',
};

const PostgreSQLConfig: React.FC = () => {
  const { token } = useAuth();
  const [config, setConfig] = useState<PgConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    axios.get('/api/postgres-settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        setConfig({ ...DEFAULT_CONFIG, ...res.data });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  const handleSave = async () => {
    setSaving(true);
    setStatus('idle');
    try {
      await axios.post('/api/postgres-settings', config, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || 'Erreur lors de la sauvegarde');
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const set = (field: keyof PgConfig, value: any) =>
    setConfig(prev => ({ ...prev, [field]: value }));

  if (loading) return <div style={{ padding: 24, color: '#64748b', fontSize: '0.875rem' }}>Chargement...</div>;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    fontSize: '0.8125rem',
    color: '#1e293b',
    background: 'white',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#374151',
    marginBottom: 5,
    letterSpacing: '0.01em',
  };

  const fieldWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column' };

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Card */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>

        {/* Card header */}
        <div style={{
          padding: '12px 18px',
          borderBottom: '1px solid #f1f5f9',
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Database size={15} color="#0f766e" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1e293b' }}>
                Configuration PostgreSQL
              </div>
              <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: 1 }}>
                Paramètres de connexion à la base de données principale
              </div>
            </div>
          </div>

          {/* Enable toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              {config.is_enabled ? 'Activée' : 'Désactivée'}
            </span>
            <button
              onClick={() => set('is_enabled', config.is_enabled ? 0 : 1)}
              style={{
                width: 38, height: 20, borderRadius: 10,
                background: config.is_enabled ? '#22c55e' : '#cbd5e1',
                border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
                transition: 'background .2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 2,
                left: config.is_enabled ? 20 : 2,
                width: 16, height: 16, borderRadius: '50%',
                background: 'white',
                transition: 'left .15s',
                boxShadow: '0 1px 2px rgba(0,0,0,.2)',
              }} />
            </button>
          </div>
        </div>

        {/* Form body */}
        <div style={{ padding: 20 }}>

          {/* Section: Connexion */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Connexion
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 12 }}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Hôte</label>
                <input
                  style={inputStyle}
                  value={config.host}
                  onChange={e => set('host', e.target.value)}
                  placeholder="10.103.130.106"
                />
              </div>
              <div style={fieldWrap}>
                <label style={labelStyle}>Port</label>
                <input
                  style={{ ...inputStyle, width: 90 }}
                  type="number"
                  value={config.port}
                  onChange={e => set('port', parseInt(e.target.value) || 5432)}
                  placeholder="5432"
                  min={1}
                  max={65535}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Base de données</label>
                <input
                  style={inputStyle}
                  value={config.database}
                  onChange={e => set('database', e.target.value)}
                  placeholder="ivry_admin"
                />
              </div>
              <div style={fieldWrap}>
                <label style={labelStyle}>Schéma par défaut</label>
                <input
                  style={inputStyle}
                  value={config.schema_name}
                  onChange={e => set('schema_name', e.target.value)}
                  placeholder="public"
                />
              </div>
            </div>
          </div>

          {/* Section: Authentification */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Authentification
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Nom d'utilisateur</label>
                <input
                  style={inputStyle}
                  value={config.username}
                  onChange={e => set('username', e.target.value)}
                  placeholder="postgres"
                  autoComplete="off"
                />
              </div>
              <div style={fieldWrap}>
                <label style={labelStyle}>Mot de passe</label>
                <div style={{ position: 'relative' }}>
                  <input
                    style={{ ...inputStyle, paddingRight: 36 }}
                    type={showPassword ? 'text' : 'password'}
                    value={config.password}
                    onChange={e => set('password', e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8',
                      display: 'flex', alignItems: 'center', padding: 2,
                    }}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Options avancées */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Options avancées
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Mode SSL</label>
                <select
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  value={config.ssl_mode}
                  onChange={e => set('ssl_mode', e.target.value)}
                >
                  <option value="disable">disable</option>
                  <option value="allow">allow</option>
                  <option value="prefer">prefer</option>
                  <option value="require">require</option>
                  <option value="verify-ca">verify-ca</option>
                  <option value="verify-full">verify-full</option>
                </select>
              </div>
              <div style={fieldWrap}>
                <label style={labelStyle}>Timeout connexion (s)</label>
                <input
                  style={inputStyle}
                  type="number"
                  value={config.connect_timeout}
                  onChange={e => set('connect_timeout', parseInt(e.target.value) || 10)}
                  placeholder="10"
                  min={1}
                  max={300}
                />
              </div>
              <div style={fieldWrap}>
                <label style={labelStyle}>Nom application</label>
                <input
                  style={inputStyle}
                  value={config.application_name}
                  onChange={e => set('application_name', e.target.value)}
                  placeholder="DSIHub"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card footer */}
        <div style={{
          padding: '10px 18px',
          borderTop: '1px solid #f1f5f9',
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '0.73rem', color: '#94a3b8' }}>
            {config.updated_at
              ? `Dernière modification : ${new Date(config.updated_at).toLocaleString('fr-FR')}`
              : ''}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {status === 'saved' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: '#16a34a' }}>
                <CheckCircle size={14} /> Enregistré
              </span>
            )}
            {status === 'error' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: '#dc2626' }}>
                <AlertCircle size={14} /> {errorMsg}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px',
                background: saving ? '#94a3b8' : '#0f766e',
                color: 'white',
                border: 'none', borderRadius: 6,
                fontSize: '0.8125rem', fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'background .15s',
              }}
            >
              <Save size={13} />
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── GLPI 10 : nouvelle API (token unique). Destiné à l'inventaire, le stock
//     et les documents (pas les tickets). Auth exacte à confirmer côté serveur. ───
const Glpi10Config: React.FC = () => {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const [cfg, setCfg] = useState({ url: '', app_token: '', user_token: '', is_enabled: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showApp, setShowApp] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Synchro parc
  const [stats, setStats] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Synchro usagers (e-mails AD)
  const [infocomSyncing, setInfocomSyncing] = useState(false);
  const [infocomResult, setInfocomResult] = useState<any>(null);
  const [usagerSyncing, setUsagerSyncing] = useState(false);
  const [usagerResult, setUsagerResult] = useState<any>(null);
  const [usagerProgress, setUsagerProgress] = useState<any>(null);
  const usagerPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStats = () => { axios.get('/api/parc/stats', { headers }).then(r => setStats(r.data)).catch(() => {}); };

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  const fetchProgress = async () => {
    try { const r = await axios.get('/api/parc/sync-progress', { headers }); setProgress(r.data); }
    catch { /* on ignore les erreurs ponctuelles de polling */ }
  };
  const stopUsagerPolling = () => { if (usagerPollRef.current) { clearInterval(usagerPollRef.current); usagerPollRef.current = null; } };
  const fetchUsagerProgress = async () => {
    try { const r = await axios.get('/api/parc/sync-usagers-progress', { headers }); setUsagerProgress(r.data); }
    catch { /* ignore */ }
  };
  // Nettoyage du polling au démontage
  useEffect(() => () => { stopPolling(); stopUsagerPolling(); }, []);

  useEffect(() => {
    axios.get('/api/glpi/settings?profile=glpi10', { headers })
      .then(res => {
        const d = res.data || {};
        setCfg({ url: d.url || '', app_token: d.app_token || '', user_token: d.user_token || '', is_enabled: !!d.is_enabled });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    loadStats();
  }, []);

  const save = async () => {
    setSaving(true); setStatus('idle');
    try {
      await axios.post('/api/glpi/settings', {
        profile: 'glpi10', url: cfg.url, app_token: cfg.app_token, user_token: cfg.user_token,
        login: '', password: '', is_enabled: cfg.is_enabled,
      }, { headers });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
    } finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true); setTestResult(null);
    try {
      const res = await axios.post('/api/glpi/test-connection-glpi10', { url: cfg.url, token: cfg.app_token, user_token: cfg.user_token }, { headers });
      setTestResult({ success: res.data.success, message: res.data.message });
    } catch (e: any) {
      setTestResult({ success: false, message: e.response?.data?.message || 'Erreur lors du test' });
    } finally { setTesting(false); }
  };

  const syncParc = async () => {
    setSyncing(true); setSyncResult(null); setProgress(null);
    // Polling de la progression (barre + compteurs par type, à la volée)
    stopPolling();
    fetchProgress();
    pollRef.current = setInterval(fetchProgress, 1000);
    try {
      const res = await axios.post('/api/parc/sync', {}, { headers });
      setSyncResult({ ok: true, ...res.data });
      loadStats();
    } catch (e: any) {
      setSyncResult({ ok: false, message: e.response?.data?.message || 'Erreur lors de la synchronisation' });
    } finally {
      setSyncing(false);
      stopPolling();
      fetchProgress(); // dernier état (terminé / erreur)
    }
  };

  const syncInfocoms = async () => {
    setInfocomSyncing(true); setInfocomResult(null);
    try {
      const res = await axios.post('/api/parc/sync-infocoms', {}, { headers });
      setInfocomResult({ ok: true, ...res.data });
    } catch (e: any) {
      setInfocomResult({ ok: false, message: e.response?.data?.message || 'Erreur' });
    } finally { setInfocomSyncing(false); }
  };

  const syncUsagers = async () => {
    setUsagerSyncing(true); setUsagerResult(null); setUsagerProgress(null);
    stopUsagerPolling();
    fetchUsagerProgress();
    usagerPollRef.current = setInterval(fetchUsagerProgress, 1000);
    try {
      const res = await axios.post('/api/parc/sync-usagers', {}, { headers });
      setUsagerResult({ ok: true, ...res.data });
    } catch (e: any) {
      setUsagerResult({ ok: false, message: e.response?.data?.message || 'Erreur lors de la synchronisation des usagers' });
    } finally {
      setUsagerSyncing(false);
      stopUsagerPolling();
      fetchUsagerProgress();
    }
  };

  if (loading) return <div style={{ padding: 24, color: '#64748b', fontSize: '0.875rem' }}>Chargement...</div>;

  const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.8125rem', color: '#1e293b', background: 'white', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: 5 };
  const tokenField = (label: string, val: string, set: (v: string) => void, show: boolean, toggle: () => void, ph: string) => (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input style={{ ...inputStyle, paddingRight: 36 }} type={show ? 'text' : 'password'} value={val}
          onChange={e => set(e.target.value)} placeholder={ph} autoComplete="new-password" />
        <button type="button" onClick={toggle}
          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', padding: 2 }}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '4px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Carte configuration */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Globe size={15} color="#0f766e" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1e293b' }}>Configuration GLPI 10 (nouveau serveur)</div>
              <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: 1 }}>API REST (apirest.php) — inventaire du parc (hors tickets)</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{cfg.is_enabled ? 'Activée' : 'Désactivée'}</span>
            <button onClick={() => setCfg(c => ({ ...c, is_enabled: !c.is_enabled }))}
              style={{ width: 38, height: 20, borderRadius: 10, background: cfg.is_enabled ? '#22c55e' : '#cbd5e1', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
              <span style={{ position: 'absolute', top: 2, left: cfg.is_enabled ? 20 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
            </button>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>URL de l'API GLPI 10</label>
            <input style={inputStyle} value={cfg.url} onChange={e => setCfg(c => ({ ...c, url: e.target.value }))}
              placeholder="https://glpi-ng.ivry.local/apirest.php" />
          </div>
          {tokenField("App-Token", cfg.app_token, v => setCfg(c => ({ ...c, app_token: v })), showApp, () => setShowApp(s => !s), "App-Token (Configuration > API)")}
          {tokenField("User-Token", cfg.user_token, v => setCfg(c => ({ ...c, user_token: v })), showUser, () => setShowUser(s => !s), "Jeton API personnel de l'utilisateur (Préférences > Clés API)")}

          {testResult && (
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: testResult.success ? '#16a34a' : '#dc2626' }}>
              {testResult.success ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        <div style={{ padding: '10px 18px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
          {status === 'saved' && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: '#16a34a' }}><CheckCircle size={14} /> Enregistré</span>}
          {status === 'error' && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: '#dc2626' }}><AlertCircle size={14} /> Erreur</span>}
          <button onClick={test} disabled={testing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'white', color: '#0f766e', border: '1px solid #0f766e', borderRadius: 6, fontSize: '0.8125rem', fontWeight: 600, cursor: testing ? 'not-allowed' : 'pointer' }}>
            {testing ? 'Test…' : 'Tester la connexion'}
          </button>
          <button onClick={save} disabled={saving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: saving ? '#94a3b8' : '#0f766e', color: 'white', border: 'none', borderRadius: 6, fontSize: '0.8125rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            <Save size={13} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {/* Carte synchronisation du parc */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Server size={15} color="#0f766e" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1e293b' }}>Synchronisation du parc</div>
              <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: 1 }}>Ordinateurs, moniteurs, périphériques, imprimantes → schéma hub_parc</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={syncInfocoms} disabled={infocomSyncing || syncing}
              title="Recalcule les dates de garantie/achat uniquement — rapide (quelques secondes)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: infocomSyncing ? '#94a3b8' : '#7c3aed', color: 'white', border: 'none', borderRadius: 6, fontSize: '0.8125rem', fontWeight: 600, cursor: infocomSyncing ? 'not-allowed' : 'pointer' }}>
              <Database size={13} /> {infocomSyncing ? 'Mise à jour…' : '↻ Garanties / Âges'}
            </button>
            <button onClick={syncParc} disabled={syncing}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: syncing ? '#94a3b8' : '#0f766e', color: 'white', border: 'none', borderRadius: 6, fontSize: '0.8125rem', fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer' }}>
              <Database size={13} /> {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
            </button>
          </div>
        </div>
        <div style={{ padding: 20 }}>
          {/* Compteurs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
            {stats?.counts && Object.entries(stats.counts).map(([k, v]: [string, any]) => (
              <div key={k} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', background: '#f8fafc' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0f766e' }}>{v.count.toLocaleString('fr-FR')}</div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{v.label}</div>
              </div>
            ))}
          </div>
          {stats?.lastSync && (
            <div style={{ fontSize: '0.73rem', color: '#94a3b8' }}>
              Dernière synchro : {stats.lastSync.finished_at ? new Date(stats.lastSync.finished_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '—'}
              {stats.lastSync.status === 'error' && <span style={{ color: '#dc2626' }}> (échec)</span>}
              {stats.lastSync.triggered_by && ` · par ${stats.lastSync.triggered_by}`}
            </div>
          )}
          {syncing && progress && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#0f766e', fontWeight: 600, marginBottom: 6 }}>
                <span>{progress.phase || 'Synchronisation…'}{progress.current ? ` — ${progress.current}` : ''}</span>
                <span>{(progress.done || 0).toLocaleString('fr-FR')} / {progress.total ? progress.total.toLocaleString('fr-FR') : '…'}</span>
              </div>
              <div style={{ height: 8, background: '#e2e8f0', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: `${progress.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0}%`, height: '100%', background: '#0f766e', borderRadius: 5, transition: 'width .3s ease' }} />
              </div>
              {Array.isArray(progress.types) && progress.types.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginTop: 10 }}>
                  {progress.types.map((t: any) => (
                    <div key={t.key} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', background: '#f8fafc' }}>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{t.label}</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: t.erreur ? '#dc2626' : '#0f766e' }}>
                        {t.erreur ? '⚠ Erreur' : `${(t.enregistre || 0).toLocaleString('fr-FR')} / ${(t.recupere || 0).toLocaleString('fr-FR')}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {infocomResult && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: infocomResult.ok ? '#faf5ff' : '#fef2f2', border: `1px solid ${infocomResult.ok ? '#d8b4fe' : '#fecaca'}`, color: infocomResult.ok ? '#6b21a8' : '#991b1b', fontSize: '0.8rem' }}>
              {infocomResult.ok
                ? <span>✓ {infocomResult.message}</span>
                : <span>✕ {infocomResult.message}</span>}
            </div>
          )}
          {syncResult && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: syncResult.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${syncResult.ok ? '#86efac' : '#fecaca'}`, color: syncResult.ok ? '#166534' : '#991b1b', fontSize: '0.8rem' }}>
              {syncResult.ok ? (
                <>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>✓ {syncResult.message}</div>
                  {(syncResult.types || []).map((t: any) => (
                    <div key={t.type}>{t.type} : {t.enregistre} / {t.recupere} récupérés{t.erreur ? ` — ⚠ ${t.erreur}` : ''}</div>
                  ))}
                </>
              ) : (
                <div>✕ {syncResult.message}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Carte synchronisation des usagers (e-mails AD) */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Globe size={15} color="#0f766e" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1e293b' }}>Synchronisation des usagers</div>
              <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: 1 }}>Résout l'adresse e-mail des usagers du parc via l'Active Directory</div>
            </div>
          </div>
          <button onClick={syncUsagers} disabled={usagerSyncing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: usagerSyncing ? '#94a3b8' : '#0f766e', color: 'white', border: 'none', borderRadius: 6, fontSize: '0.8125rem', fontWeight: 600, cursor: usagerSyncing ? 'not-allowed' : 'pointer' }}>
            <Server size={13} /> {usagerSyncing ? 'Synchronisation…' : 'Synchroniser les usagers'}
          </button>
        </div>
        <div style={{ padding: 20 }}>
          {usagerSyncing && usagerProgress && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#0f766e', fontWeight: 600, marginBottom: 6 }}>
                <span>{usagerProgress.current ? `Résolution AD : ${usagerProgress.current}` : 'Résolution AD…'}</span>
                <span>{(usagerProgress.done || 0).toLocaleString('fr-FR')} / {usagerProgress.total ? usagerProgress.total.toLocaleString('fr-FR') : '…'} · {(usagerProgress.found || 0).toLocaleString('fr-FR')} e-mails</span>
              </div>
              <div style={{ height: 8, background: '#e2e8f0', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: `${usagerProgress.total ? Math.min(100, Math.round((usagerProgress.done / usagerProgress.total) * 100)) : 0}%`, height: '100%', background: '#0f766e', borderRadius: 5, transition: 'width .3s ease' }} />
              </div>
            </div>
          )}
          {usagerResult && (
            <div style={{ marginTop: usagerSyncing ? 12 : 0, padding: 12, borderRadius: 8, background: usagerResult.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${usagerResult.ok ? '#86efac' : '#fecaca'}`, color: usagerResult.ok ? '#166534' : '#991b1b', fontSize: '0.8rem' }}>
              {usagerResult.ok ? `✓ ${usagerResult.message}` : `✕ ${usagerResult.message}`}
            </div>
          )}
          {!usagerSyncing && !usagerResult && (
            <div style={{ fontSize: '0.73rem', color: '#94a3b8' }}>Nécessite une configuration AD (Admin → AD) et un parc déjà synchronisé.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDatabases;
