import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Smartphone, Shield, CheckCircle2, AlertCircle, 
  Send, RefreshCw, Save, Server, Globe, Key, Lock, Clock, Phone, MessageSquare, Check, X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface FrizbiSettingsData {
  is_enabled: number;
  api_url: string;
  client_id: string;
  client_secret: string;
  sender_id: string;
}

const FrizbiSettings: React.FC = () => {
  const { token } = useAuth();
  const [settings, setSettings] = useState<FrizbiSettingsData>({
    is_enabled: 0,
    api_url: 'https://apiv2.frizbi.evolnet.fr',
    client_id: '',
    client_secret: '',
    sender_id: 'IVRY'
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMobile, setTestMobile] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [smsLogs, setSmsLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/api/admin/frizbi-settings', { headers });
      if (res.data) setSettings(res.data);
    } catch (err) {
      console.error("Error fetching Frizbi settings", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await axios.post('/api/admin/frizbi-settings', settings, { headers });
      setStatus({ type: 'success', message: 'Paramètres enregistrés avec succès' });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.response?.data?.message || 'Erreur lors de l\'enregistrement' });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const res = await axios.post('/api/admin/frizbi/test-connection', {
        api_url: settings.api_url,
        client_id: settings.client_id,
        client_secret: settings.client_secret
      }, { headers });
      setStatus({ type: 'success', message: res.data.message });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.response?.data?.message || 'Échec de la connexion' });
    } finally {
      setTesting(false);
    }
  };

  const sendTestSMS = async () => {
    if (!testMobile) return setStatus({ type: 'error', message: 'Veuillez saisir un numéro de mobile' });
    setTesting(true);
    setStatus(null);
    try {
      await axios.post('/api/admin/frizbi/send-test', {
        mobile: testMobile
      }, { headers });
      setStatus({ type: 'success', message: 'SMS de test envoyé avec succès !' });
    } catch (err: any) {
      const d = err.response?.data;
      const msg = d?.message || d?.detail || d?.title || 'Erreur lors de l\'envoi';
      setStatus({ type: 'error', message: msg });
    } finally {
      setTesting(false);
    }
  };

  const fetchSmsLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await axios.get('/api/admin/frizbi/sms-logs', { headers });
      setSmsLogs(res.data || []);
    } catch (err) {
      console.error("Error fetching SMS logs", err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (!loading) fetchSmsLogs();
  }, [loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <RefreshCw className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  return (
    <div className="frizbi-settings">
      <div className="settings-header">
        <div className="icon-wrapper">
          <Smartphone size={24} />
        </div>
        <div>
          <h2>Interface SMS Frizbi</h2>
          <p>Configurez les accès à l'API Frizbi pour l'envoi de SMS système.</p>
        </div>
        <div className="ml-auto flex gap-3">
          <button 
            className="btn btn-secondary" 
            onClick={testConnection} 
            disabled={testing || !settings.client_id || !settings.client_secret}
          >
            {testing ? <RefreshCw size={16} className="animate-spin" /> : <Shield size={16} />}
            Tester la connexion
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            Enregistrer
          </button>
        </div>
      </div>

      {status && (
        <div className={`status-alert ${status.type}`}>
          {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{status.message}</span>
          <button className="close-btn" onClick={() => setStatus(null)}>×</button>
        </div>
      )}

      <div className="settings-grid">
        <div className="settings-card">
          <div className="card-header">
            <Server size={20} />
            <h3>Configuration Générale</h3>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label>État du service</label>
              <div className="toggle-wrapper" onClick={() => setSettings({...settings, is_enabled: settings.is_enabled ? 0 : 1})}>
                <div className={`toggle-track ${settings.is_enabled ? 'active' : ''}`}>
                  <div className="toggle-thumb" />
                </div>
                <span>{settings.is_enabled ? 'Service Activé' : 'Service Désactivé'}</span>
              </div>
            </div>

            <div className="form-group">
              <label>URL de l'API</label>
              <div className="input-wrapper">
                <Globe size={16} className="input-icon" />
                <input
                  type="url"
                  value={settings.api_url}
                  onChange={e => setSettings({...settings, api_url: e.target.value})}
                  placeholder="https://apiv2.frizbi.evolnet.fr"
                />
              </div>
              <small>Ex. préprod : https://apiv2.frizbi.evolnet.fr — prod : https://www.lesmsagile.com</small>
            </div>

            <div className="form-group">
              <label>Identifiant Expéditeur (Sender ID)</label>
              <div className="input-wrapper">
                <Smartphone size={16} className="input-icon" />
                <input 
                  type="text" 
                  value={settings.sender_id} 
                  onChange={e => setSettings({...settings, sender_id: e.target.value})}
                  placeholder="EX: IVRY"
                  maxLength={11}
                />
              </div>
              <small>Max 11 caractères alphanumériques.</small>
            </div>
          </div>
        </div>

        <div className="settings-card">
          <div className="card-header">
            <Lock size={20} />
            <h3>Identifiants API</h3>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label>Client ID (API Key)</label>
              <div className="input-wrapper">
                <Key size={16} className="input-icon" />
                <input 
                  type="text" 
                  value={settings.client_id} 
                  onChange={e => setSettings({...settings, client_id: e.target.value})}
                  placeholder="ID généré dans Frizbi"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Secret ID (API Secret)</label>
              <div className="input-wrapper">
                <Lock size={16} className="input-icon" />
                <input 
                  type="password" 
                  value={settings.client_secret} 
                  onChange={e => setSettings({...settings, client_secret: e.target.value})}
                  placeholder="Secret généré dans Frizbi"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="settings-card full-width">
          <div className="card-header">
            <Send size={20} />
            <h3>Test d'envoi SMS</h3>
          </div>
          <div className="card-body test-area">
            <p>Envoyez un message de test pour vérifier la délivrabilité.</p>
            <div className="test-form">
              <div className="input-wrapper">
                <Smartphone size={16} className="input-icon" />
                <input 
                  type="tel" 
                  value={testMobile} 
                  onChange={e => setTestMobile(e.target.value)}
                  placeholder="06XXXXXXXX"
                />
              </div>
              <button 
                className="btn btn-primary" 
                onClick={sendTestSMS}
                disabled={testing || !testMobile || !settings.client_id}
              >
                {testing ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                Envoyer le test
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SMS Logs */}
      <div className="settings-card full-width" style={{ marginTop: 25 }}>
        <div className="card-header">
          <Clock size={20} />
          <h3>Historique des SMS envoyés</h3>
          <button className="btn btn-secondary" onClick={fetchSmsLogs} disabled={logsLoading}
            style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: 13 }}>
            <RefreshCw size={14} className={logsLoading ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {smsLogs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
              Aucun SMS envoyé pour le moment.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="sms-logs-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Destinataire</th>
                    <th>Message</th>
                    <th>Expéditeur</th>
                    <th>Source</th>
                    <th>Statut</th>
                    <th>Erreur</th>
                  </tr>
                </thead>
                <tbody>
                  {smsLogs.map((log: any) => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                        {new Date(log.sent_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{log.recipient}</td>
                      <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13 }}>{log.message}</td>
                      <td style={{ fontSize: 13 }}>{log.sender_id}</td>
                      <td>
                        <span className={`source-badge source-${log.source}`}>
                          {log.source === 'ecole_notify' ? 'École' : log.source === 'emergency' ? 'Urgence' : log.source === 'test' ? 'Test' : log.source}
                        </span>
                      </td>
                      <td>
                        {log.status === 'sent' ? <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 13 }}><Check size={14} /> Envoyé</span>
                          : <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 13 }}><X size={14} /> Échec</span>}
                      </td>
                      <td style={{ color: '#ef4444', fontSize: 12, maxWidth: 200 }}>{log.error_message || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .frizbi-settings {
          color: #1e293b;
        }

        .settings-header {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 30px;
        }

        .icon-wrapper {
          width: 56px;
          height: 56px;
          background: #eff6ff;
          color: #3b82f6;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          border: 1px solid #dbeafe;
        }

        .settings-header h2 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 800;
          color: #1e293b;
        }

        .settings-header p {
          margin: 4px 0 0 0;
          color: #64748b;
          font-size: 0.95rem;
        }

        .btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 20px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
        }

        .btn-primary:hover { background: #2563eb; transform: translateY(-1px); }
        .btn-primary:active { transform: translateY(0); }
        .btn-primary:disabled { background: #94a3b8; cursor: not-allowed; }

        .btn-secondary {
          background: white;
          color: #64748b;
          border: 1px solid #e2e8f0;
        }

        .btn-secondary:hover {
          background: #f8fafc;
          color: #1e293b;
        }

        .status-alert {
          padding: 14px 20px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 25px;
          font-weight: 600;
          font-size: 0.9rem;
          position: relative;
        }

        .status-alert.success { background: #ecfdf5; color: #059669; border: 1px solid #10b981; }
        .status-alert.error { background: #fef2f2; color: #dc2626; border: 1px solid #ef4444; }

        .close-btn {
          margin-left: auto;
          background: none;
          border: none;
          color: inherit;
          font-size: 20px;
          cursor: pointer;
          opacity: 0.5;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 25px;
        }

        .settings-card {
          background: white;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .settings-card.full-width {
          grid-column: 1 / -1;
        }

        .card-header {
          padding: 20px 25px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          gap: 12px;
          color: #475569;
        }

        .card-header h3 {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 700;
        }

        .card-body {
          padding: 25px;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group:last-child { margin-bottom: 0; }

        .form-group label {
          display: block;
          font-weight: 700;
          font-size: 0.85rem;
          color: #475569;
          margin-bottom: 8px;
        }

        .toggle-wrapper {
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
        }

        .toggle-track {
          width: 44px;
          height: 24px;
          background: #cbd5e1;
          border-radius: 20px;
          position: relative;
          transition: all 0.3s;
        }

        .toggle-track.active { background: #10b981; }

        .toggle-thumb {
          width: 18px;
          height: 18px;
          background: white;
          border-radius: 50%;
          position: absolute;
          top: 3px;
          left: 3px;
          transition: all 0.3s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .toggle-track.active .toggle-thumb { left: 23px; }

        .toggle-wrapper span {
          font-size: 0.9rem;
          font-weight: 600;
          color: #334155;
        }

.input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 14px;
          color: #94a3b8;
        }

        .input-wrapper input {
          width: 100%;
          padding: 12px 14px 12px 42px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          font-size: 0.9rem;
          color: #1e293b;
          transition: all 0.2s;
          background: #f8fafc;
        }

        .input-wrapper input:focus {
          outline: none;
          border-color: #3b82f6;
          background: white;
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
        }

        small {
          color: #94a3b8;
          font-size: 0.75rem;
          margin-top: 6px;
          display: block;
        }

        .test-area {
          background: #fdfdfd;
        }

        .test-form {
          display: flex;
          gap: 15px;
          margin-top: 15px;
          max-width: 500px;
        }

        .test-form .input-wrapper { flex: 1; }

        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .sms-logs-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .sms-logs-table th {
          padding: 12px 16px;
          text-align: left;
          font-weight: 600;
          color: #64748b;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          white-space: nowrap;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .sms-logs-table td {
          padding: 10px 16px;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
        }
        .sms-logs-table tbody tr:hover {
          background: #f8fafc;
        }
        .source-badge {
          display: inline-flex;
          align-items: center;
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
        }
        .source-badge.source-test {
          background: #eff6ff;
          color: #3b82f6;
        }
        .source-badge.source-ecole_notify {
          background: #ecfdf5;
          color: #059669;
        }
        .source-badge.source-emergency {
          background: #fef2f2;
          color: #dc2626;
        }
        .source-badge.source-system {
          background: #f3f4f6;
          color: #6b7280;
        }

        @media (max-width: 600px) {
          .test-form { flex-direction: column; }
          .settings-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};

export default FrizbiSettings;
