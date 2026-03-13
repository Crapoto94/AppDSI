import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Save, Send, Shield, Globe, Mail, User, Lock, Server, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const MailSettings: React.FC = () => {
    const [settings, setSettings] = useState<any>({
        smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '',
        smtp_secure: 'tls', sender_email: '', sender_name: 'DSI Hub',
        template_html: '<html><body>{{content}}</body></html>'
    });
    const [testEmail, setTestEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
    const { token } = useAuth();

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await axios.get('http://localhost:3001/api/mail-settings', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data) setSettings(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setStatus(null);
        try {
            await axios.post('http://localhost:3001/api/mail-settings', settings, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setStatus({ type: 'success', msg: 'Configuration enregistrée avec succès' });
        } catch (err) {
            setStatus({ type: 'error', msg: 'Erreur lors de l\'enregistrement' });
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        if (!testEmail) return alert('Saisissez un email de destination');
        setTesting(true);
        setStatus(null);
        try {
            await axios.post('http://localhost:3001/api/send-test-mail', { to: testEmail }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setStatus({ type: 'success', msg: 'Email de test envoyé ! Vérifiez votre boîte de réception.' });
        } catch (err: any) {
            setStatus({ type: 'error', msg: `Échec de l'envoi : ${err.response?.data?.error || err.message}` });
        } finally {
            setTesting(false);
        }
    };

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-600" size={40} /></div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Configuration SMTP */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="form-card">
                        <div className="card-header">
                            <div className="header-with-icon">
                                <div className="icon-box blue"><Server size={20} /></div>
                                <div>
                                    <h3>Serveur SMTP / Brevo</h3>
                                    <p>Configurez le relais de messagerie pour les envois automatiques.</p>
                                </div>
                            </div>
                        </div>
                        <div className="card-body">
                            <div className="form-grid">
                                <div className="form-group lg:col-span-2">
                                    <label>Hôte SMTP (Laissez vide pour utiliser Brevo via Clé API)</label>
                                    <div className="input-with-icon">
                                        <Globe size={16} />
                                        <input 
                                            value={settings.smtp_host} 
                                            onChange={e => setSettings({...settings, smtp_host: e.target.value})}
                                            placeholder="ex: smtp.office365.com ou 10.10.x.x"
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Port</label>
                                    <input 
                                        type="number" 
                                        value={settings.smtp_port} 
                                        onChange={e => setSettings({...settings, smtp_port: parseInt(e.target.value)})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Sécurité</label>
                                    <select value={settings.smtp_secure} onChange={e => setSettings({...settings, smtp_secure: e.target.value})}>
                                        <option value="none">Aucune</option>
                                        <option value="tls">STARTTLS (587)</option>
                                        <option value="ssl">SSL/TLS (465)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Utilisateur / Identifiant</label>
                                    <div className="input-with-icon">
                                        <User size={16} />
                                        <input 
                                            value={settings.smtp_user} 
                                            onChange={e => setSettings({...settings, smtp_user: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Mot de passe / Clé API</label>
                                    <div className="input-with-icon">
                                        <Lock size={16} />
                                        <input 
                                            type="password"
                                            value={settings.smtp_pass} 
                                            onChange={e => setSettings({...settings, smtp_pass: e.target.value})}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="form-card">
                        <div className="card-header">
                            <div className="header-with-icon">
                                <div className="icon-box green"><Mail size={20} /></div>
                                <div>
                                    <h3>Expéditeur & Template</h3>
                                    <p>Identité visuelle des emails sortants.</p>
                                </div>
                            </div>
                        </div>
                        <div className="card-body space-y-6">
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Nom de l'expéditeur</label>
                                    <input 
                                        value={settings.sender_name} 
                                        onChange={e => setSettings({...settings, sender_name: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Email de l'expéditeur</label>
                                    <input 
                                        value={settings.sender_email} 
                                        onChange={e => setSettings({...settings, sender_email: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Template HTML Global (Utilisez {"{{content}}"} pour le corps du message)</label>
                                <div className="editor-container">
                                    <ReactQuill 
                                        theme="snow" 
                                        value={settings.template_html} 
                                        onChange={val => setSettings({...settings, template_html: val})}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="card-footer">
                            <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving}>
                                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                Enregistrer la configuration
                            </button>
                        </div>
                    </div>
                </div>

                {/* Test & Status */}
                <div className="space-y-6">
                    <div className="form-card highlight">
                        <div className="card-header">
                            <h3>Test d'envoi</h3>
                        </div>
                        <div className="card-body space-y-4">
                            <p className="text-sm text-gray-500">Envoyez un email de test pour valider vos paramètres en temps réel.</p>
                            <div className="form-group">
                                <label>Destinataire du test</label>
                                <input 
                                    placeholder="votre-email@ivry94.fr"
                                    value={testEmail}
                                    onChange={e => setTestEmail(e.target.value)}
                                />
                            </div>
                            <button className="btn btn-outline full-width" onClick={handleTest} disabled={testing || !testEmail}>
                                {testing ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                                Lancer le test
                            </button>
                        </div>
                    </div>

                    {status && (
                        <div className={`status-box ${status.type} animate-in slide-in-from-top-2`}>
                            <div className="status-icon">
                                {status.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                            </div>
                            <div className="status-content">
                                <strong>{status.type === 'success' ? 'Succès' : 'Attention'}</strong>
                                <p>{status.msg}</p>
                            </div>
                        </div>
                    )}

                    <div className="info-card bg-indigo-50 border-indigo-100 border p-6 rounded-3xl">
                        <h4 className="text-indigo-900 font-bold mb-2 flex items-center gap-2">
                            <Shield size={18} className="text-indigo-600" /> Note technique
                        </h4>
                        <p className="text-xs text-indigo-700 leading-relaxed">
                            Si vous utilisez un relais SMTP interne à la Ville, assurez-vous que l'adresse IP du serveur est autorisée dans les paramètres du connecteur SMTP.
                        </p>
                    </div>
                </div>
            </div>

            <style>{`
                .form-card { background: white; border-radius: 24px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
                .card-header { padding: 20px 30px; border-bottom: 1px solid #f1f5f9; background: #fafafa; }
                .card-header h3 { margin: 0; font-size: 1.1rem; font-weight: 800; color: #0f172a; }
                .card-header p { margin: 4px 0 0 0; font-size: 0.8rem; color: #64748b; font-weight: 500; }
                
                .header-with-icon { display: flex; align-items: center; gap: 15px; }
                .icon-box { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
                .icon-box.blue { background: #eff6ff; color: #3b82f6; }
                .icon-box.green { background: #ecfdf5; color: #10b981; }

                .card-body { padding: 30px; }
                .card-footer { padding: 20px 30px; background: #f8fafc; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; }

                .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 25px; }
                .form-group label { display: block; font-size: 0.75rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.025em; }
                
                .input-with-icon { position: relative; display: flex; align-items: center; }
                .input-with-icon svg { position: absolute; left: 15px; color: #94a3b8; }
                .input-with-icon input { padding-left: 45px !important; }

                input, select { width: 100%; padding: 12px 15px; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 0.9rem; font-weight: 600; color: #1e293b; outline: none; transition: all 0.2s; }
                input:focus, select:focus { border-color: #3b82f6; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); background: white; }

                .editor-container { border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; }
                .ql-toolbar { border: none !important; background: #f8fafc; border-bottom: 1px solid #e2e8f0 !important; }
                .ql-container { border: none !important; min-height: 200px; font-family: 'Inter', sans-serif !important; }

                .btn { padding: 12px 24px; border-radius: 12px; font-weight: 700; border: none; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 0.9rem; }
                .btn-primary { background: #3b82f6; color: white; box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.2); }
                .btn-primary:hover { background: #2563eb; transform: translateY(-1px); box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.3); }
                .btn-outline { background: white; color: #3b82f6; border: 2px solid #3b82f6; }
                .btn-outline:hover { background: #eff6ff; }
                .btn-lg { padding: 14px 32px; }
                .full-width { width: 100%; }

                .status-box { padding: 15px 20px; border-radius: 16px; display: flex; gap: 15px; }
                .status-box.success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
                .status-box.error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
                .status-icon { flex-shrink: 0; margin-top: 2px; }
                .status-content strong { display: block; font-size: 0.9rem; margin-bottom: 2px; }
                .status-content p { margin: 0; font-size: 0.8rem; opacity: 0.9; line-height: 1.4; }

                .lg\\:col-span-2 { grid-column: span 2; }
            `}</style>
        </div>
    );
};

export default MailSettings;
