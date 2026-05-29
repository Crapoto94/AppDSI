import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Save, Mail, Fingerprint, Key, AtSign, CheckCircle, AlertCircle } from 'lucide-react';

const O365MailSettings: React.FC = () => {
  const { token } = useAuth();
  const [config, setConfig] = useState({
    is_enabled: false,
    tenant_id: '',
    client_id: '',
    client_secret: '',
    mailbox: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const api = axios.create({ headers: { Authorization: `Bearer ${token}` } });

  useEffect(() => {
    api.get('/api/o365-mail-settings')
      .then(r => setConfig({
        is_enabled: !!r.data.is_enabled,
        tenant_id: r.data.tenant_id || '',
        client_id: r.data.client_id || '',
        client_secret: r.data.client_secret || '',
        mailbox: r.data.mailbox || '',
      }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setResult(null);
    try {
      await api.post('/api/o365-mail-settings', config);
      setResult({ ok: true, msg: 'Paramètres enregistrés.' });
    } catch (err: any) {
      setResult({ ok: false, msg: err.response?.data?.message || err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 40, color: '#64748b' }}>Chargement...</div>;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ background: 'linear-gradient(135deg, #0078d4 0%, #28a8ea 100%)', borderRadius: '16px 16px 0 0', padding: '24px 28px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Messagerie Copieurs — O365</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.85 }}>Connexion Azure AD pour l'import des emails SAV Koesio (dsia@ivry94.fr)</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.9 }}>{config.is_enabled ? 'Activé' : 'Désactivé'}</span>
          <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
            <input type="checkbox" checked={config.is_enabled} onChange={e => setConfig({ ...config, is_enabled: e.target.checked })} style={{ opacity: 0, width: 0, height: 0 }} />
            <span style={{ position: 'absolute', inset: 0, background: config.is_enabled ? '#22c55e' : 'rgba(255,255,255,0.3)', borderRadius: 12, transition: '.2s' }}>
              <span style={{ position: 'absolute', top: 3, left: config.is_enabled ? 22 : 3, width: 18, height: 18, background: '#fff', borderRadius: '50%', transition: '.2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
            </span>
          </label>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ background: '#fff', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 16px 16px', padding: 28 }}>
        <div style={{ display: 'grid', gap: 18 }}>
          <Field icon={<Fingerprint size={15} />} label="ID de l'annuaire (Tenant ID)" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
            <input value={config.tenant_id} onChange={e => setConfig({ ...config, tenant_id: e.target.value })} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style={inputStyle} />
          </Field>
          <Field icon={<AtSign size={15} />} label="ID de l'application (Client ID)" placeholder="">
            <input value={config.client_id} onChange={e => setConfig({ ...config, client_id: e.target.value })} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style={inputStyle} />
          </Field>
          <Field icon={<Key size={15} />} label="Secret client" hint="Laissez vide pour conserver le secret existant">
            <input type="text" value={config.client_secret} onChange={e => setConfig({ ...config, client_secret: e.target.value })} placeholder="Secret client" style={inputStyle} autoComplete="off" />
          </Field>
          <Field icon={<Mail size={15} />} label="Boîte à surveiller (mailbox)" hint="Adresse email dont les messages seront analysés">
            <input type="email" value={config.mailbox} onChange={e => setConfig({ ...config, mailbox: e.target.value })} placeholder="dsia@ivry94.fr" style={inputStyle} />
          </Field>
        </div>

        {result && (
          <div style={{ marginTop: 20, padding: '10px 16px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, background: result.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${result.ok ? '#bbf7d0' : '#fecaca'}`, color: result.ok ? '#16a34a' : '#dc2626', fontSize: 13 }}>
            {result.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {result.msg}
          </div>
        )}

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" disabled={saving} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: saving ? 0.7 : 1 }}>
            <Save size={16} /> {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>

      <div style={{ marginTop: 16, padding: '14px 18px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
        <strong style={{ color: '#334155' }}>Permissions requises dans Azure portal.azure.com :</strong><br />
        App registrations → API permissions → Microsoft Graph → <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>Mail.Read</code> (Application) → Grant admin consent
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
  fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

const Field: React.FC<{ icon: React.ReactNode; label: string; hint?: string; placeholder?: string; children: React.ReactNode }> = ({ icon, label, hint, children }) => (
  <div>
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
      {icon} {label}
      {hint && <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 12 }}>— {hint}</span>}
    </label>
    {children}
  </div>
);

export default O365MailSettings;
