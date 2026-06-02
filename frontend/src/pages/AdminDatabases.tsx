import React, { useState, useEffect } from 'react';
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
  const [cfg, setCfg] = useState({ url: '', glpi_token: '', is_enabled: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    axios.get('/api/glpi/settings?profile=glpi10', { headers })
      .then(res => {
        const d = res.data || {};
        // Le token unique est stocké dans la colonne app_token (réutilisée)
        setCfg({ url: d.url || '', glpi_token: d.app_token || '', is_enabled: !!d.is_enabled });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true); setStatus('idle');
    try {
      await axios.post('/api/glpi/settings', {
        profile: 'glpi10',
        url: cfg.url,
        app_token: cfg.glpi_token,   // token unique GLPI 10
        user_token: '', login: '', password: '',
        is_enabled: cfg.is_enabled,
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
      const res = await axios.post('/api/glpi/test-connection-glpi10', { url: cfg.url, token: cfg.glpi_token }, { headers });
      setTestResult({ success: res.data.success, message: res.data.message });
    } catch (e: any) {
      setTestResult({ success: false, message: e.response?.data?.message || 'Erreur lors du test' });
    } finally { setTesting(false); }
  };

  if (loading) return <div style={{ padding: 24, color: '#64748b', fontSize: '0.875rem' }}>Chargement...</div>;

  const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.8125rem', color: '#1e293b', background: 'white', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: 5 };

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Globe size={15} color="#0f766e" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1e293b' }}>Configuration GLPI 10 (nouveau serveur)</div>
              <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: 1 }}>Nouvelle API à token unique — inventaire, stock, documents (hors tickets)</div>
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
            <label style={labelStyle}>URL / IP de l'API GLPI 10</label>
            <input style={inputStyle} value={cfg.url} onChange={e => setCfg(c => ({ ...c, url: e.target.value }))}
              placeholder="https://glpi10.ivry.local/api.php  (ou http://IP/glpi/api.php)" />
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4, display: 'block' }}>Nouvelle API « High-Level » de GLPI 10 (endpoint api.php).</span>
          </div>
          <div>
            <label style={labelStyle}>Token API</label>
            <div style={{ position: 'relative' }}>
              <input style={{ ...inputStyle, paddingRight: 36 }} type={showToken ? 'text' : 'password'}
                value={cfg.glpi_token} onChange={e => setCfg(c => ({ ...c, glpi_token: e.target.value }))}
                placeholder="Token unique (Bearer)" autoComplete="new-password" />
              <button type="button" onClick={() => setShowToken(v => !v)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', padding: 2 }}>
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {testResult && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: testResult.success ? '#16a34a' : '#dc2626' }}>
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
    </div>
  );
};

export default AdminDatabases;
