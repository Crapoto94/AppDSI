import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { Save, Send, ArrowLeft, Shield, Server, Mail, Globe, Code, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
        body { font-family: 'Inter', sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; }
        .email-wrapper { padding: 40px 10px; }
        .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); }
        .header { background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); padding: 40px 20px; text-align: center; }
        .logo-svg { width: 60px; height: 60px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.2)); }
        .header h1 { color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; }
        .header .tagline { color: #bfdbfe; font-size: 14px; margin-top: 4px; text-transform: uppercase; font-weight: 600; }
        .body-content { padding: 40px; color: #374151; line-height: 1.7; font-size: 16px; }
        .footer { background-color: #f9fafb; padding: 32px; text-align: center; border-top: 1px solid #f3f4f6; }
        .footer p { color: #6b7280; font-size: 12px; margin: 4px 0; }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="email-container">
            <div class="header">
                <svg class="logo-svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M100 20L169.282 60V140L100 180L30.718 140V60L100 20Z" fill="white" fill-opacity="0.15"/>
                    <path d="M100 20L169.282 60V140L100 180L30.718 140V60L100 20Z" stroke="white" stroke-width="4"/>
                    <path d="M75 75V125M125 75V125M75 100H125" stroke="white" stroke-width="12" stroke-linecap="round"/>
                </svg>
                <h1>DSI HUB IVRY</h1>
                <div class="tagline">Smart Budget Management</div>
            </div>
            <div class="body-content">{{content}}</div>
            <div class="footer">
                <p>&copy; 2026 Ville d'Ivry-sur-Seine - DSI</p>
            </div>
        </div>
    </div>
</body>
</html>`;

const MailSettings: React.FC = () => {
  const [settings, setSettings] = useState<any>(null);
  const [testEmail, setTestEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleResetTemplate = () => {
    if (window.confirm("Voulez-vous vraiment restaurer le template par défaut ? Toutes vos modifications actuelles seront perdues.")) {
      setSettings({ ...settings, template_html: DEFAULT_TEMPLATE });
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/mail-settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const response = await fetch('/api/mail-settings', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });
      if (response.ok) {
        alert('Paramètres enregistrés avec succès !');
      }
    } catch (e) {
      alert("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) return alert('Veuillez saisir une adresse mail de test');
    setTesting(true);
    try {
      const response = await fetch('/api/send-test-mail', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ to: testEmail })
      });
      const data = await response.json();
      if (response.ok) {
        alert(data.message);
      } else {
        alert("Erreur: " + data.message);
      }
    } catch (e) {
      alert("Erreur lors de l'envoi du test");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="mail-settings-page">
        <Header />
        <div style={{ padding: '100px', textAlign: 'center', color: '#64748b' }}>
          Chargement des paramètres de messagerie...
        </div>
      </div>
    );
  }

  return (
    <div className="mail-settings-page">
      <Header />
      <main className="container">
        <div className="settings-header">
          <button className="btn-back" onClick={() => navigate('/admin')}>
            <ArrowLeft size={20} /> Retour Administration
          </button>
          <h1>Paramètres du Serveur de Messagerie</h1>
          <p className="subtitle">Configurez le relais SMTP, le proxy et l'habillage global des mails.</p>
        </div>

        <div className="settings-grid">
          {/* Section SMTP */}
          <div className="settings-card">
            <div className="card-header">
              <Server size={20} />
              <h2>Relais SMTP</h2>
            </div>
            <div className="card-content">
              <div className="form-group">
                <label>Hôte SMTP</label>
                <input 
                  value={settings?.smtp_host || ''} 
                  onChange={e => setSettings({...settings, smtp_host: e.target.value})}
                  placeholder="ex: smtp.brevo.com"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Port</label>
                  <input 
                    type="number"
                    value={settings?.smtp_port || ''} 
                    onChange={e => setSettings({...settings, smtp_port: e.target.value ? parseInt(e.target.value) : 0})}
                  />
                </div>
                <div className="form-group">
                  <label>Sécurité</label>
                  <select 
                    value={settings?.smtp_secure || 'none'} 
                    onChange={e => setSettings({...settings, smtp_secure: e.target.value})}
                  >
                    <option value="none">Aucune</option>
                    <option value="tls">TLS (STARTTLS)</option>
                    <option value="ssl">SSL/TLS Direct</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Utilisateur SMTP</label>
                <input 
                  value={settings?.smtp_user || ''} 
                  onChange={e => setSettings({...settings, smtp_user: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Mot de passe SMTP / Clé API</label>
                <input 
                  type="password"
                  value={settings?.smtp_pass || ''} 
                  onChange={e => setSettings({...settings, smtp_pass: e.target.value})}
                />
              </div>
            </div>
          </div>

          {/* Section Expéditeur & Proxy */}
          <div className="settings-card">
            <div className="card-header">
              <Mail size={20} />
              <h2>Identité & Proxy</h2>
            </div>
            <div className="card-content">
              <div className="form-group">
                <label>Adresse d'émission</label>
                <input 
                  value={settings?.sender_email || ''} 
                  onChange={e => setSettings({...settings, sender_email: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Nom d'affichage</label>
                <input 
                  value={settings?.sender_name || ''} 
                  onChange={e => setSettings({...settings, sender_name: e.target.value})}
                />
              </div>
              
              <div className="divider"></div>
              
              <div className="proxy-title">
                <Globe size={18} />
                <h3>Proxy (Optionnel)</h3>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 3 }}>
                  <label>Hôte Proxy</label>
                  <input 
                    value={settings?.proxy_host || ''} 
                    onChange={e => setSettings({...settings, proxy_host: e.target.value})}
                    placeholder="10.x.x.x"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Port</label>
                  <input 
                    type="number"
                    value={settings?.proxy_port || ''} 
                    onChange={e => setSettings({...settings, proxy_port: e.target.value ? parseInt(e.target.value) : null})}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section Template Structure HTML */}
          <div className="settings-card full-width">
            <div className="card-header" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Shield size={20} />
                <h2>Habillage Global (Template HTML)</h2>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  className="btn-reset-template" 
                  onClick={handleResetTemplate}
                >
                  Réinitialiser
                </button>
                <button 
                  className="btn-toggle-code" 
                  onClick={() => setShowCode(!showCode)}
                >
                  {showCode ? <><Eye size={18} /> Mode Visuel</> : <><Code size={18} /> Mode Code HTML</>}
                </button>
              </div>
            </div>
            
            <div className="template-editor-layout">
              <div className="editor-side">
                <div className="card-content">
                  <p className="hint">Utilisez <code>{"{{content}}"}</code> pour définir où s'insérera le message contextuel.</p>
                  <div className="quill-wrapper">
                    {showCode ? (
                      <textarea 
                        className="html-editor"
                        value={settings?.template_html || ''}
                        onChange={e => setSettings({...settings, template_html: e.target.value})}
                        spellCheck={false}
                      />
                    ) : (
                      <ReactQuill 
                        theme="snow" 
                        value={settings?.template_html || ''} 
                        onChange={val => setSettings({...settings, template_html: val})}
                        modules={{
                          toolbar: [
                            [{ 'font': [] }, { 'size': ['small', false, 'large', 'huge'] }],
                            ['bold', 'italic', 'underline', 'strike'],
                            [{ 'color': [] }, { 'background': [] }],
                            [{ 'header': 1 }, { 'header': 2 }, 'blockquote'],
                            [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'align': [] }],
                            ['link', 'image', 'clean']
                          ],
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="preview-side">
                <div className="preview-header-actions">
                  <div className="preview-label">Aperçu de l'habillage</div>
                  <div className="responsive-toggles">
                    <button 
                      className={previewMode === 'desktop' ? 'active' : ''} 
                      onClick={() => setPreviewMode('desktop')}
                    >
                      Bureau
                    </button>
                    <button 
                      className={previewMode === 'mobile' ? 'active' : ''} 
                      onClick={() => setPreviewMode('mobile')}
                    >
                      Mobile
                    </button>
                  </div>
                </div>

                <div className={`mock-mail-client ${previewMode}`}>
                  <div className="client-header">
                    <div className="client-dots">
                      <span></span><span></span><span></span>
                    </div>
                    <div className="client-title">Aperçu Mail - Habillage</div>
                  </div>
                  <div className="client-meta">
                    <div className="meta-row">
                      <span className="meta-label">De :</span>
                      <span className="meta-value"><strong>{settings?.sender_name}</strong> &lt;{settings?.sender_email}&gt;</span>
                    </div>
                  </div>
                  <div className="preview-frame-container">
                    <div 
                      className="preview-content"
                      dangerouslySetInnerHTML={{ 
                        __html: (settings?.template_html || '').replace('{{content}}', `
                          <div style="padding: 20px; background: #f8fafc; border: 2px dashed #cbd5e1; text-align: center; border-radius: 8px;">
                            <h2 style="color: #64748b; margin: 0;">ZONE DE MESSAGE</h2>
                            <p style="color: #94a3b8; margin: 10px 0 0 0;">Le message spécifique au contexte (ex: envoi de commande) s'affichera ici.</p>
                          </div>
                        `) 
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-actions">
          <div className="test-box">
            <input 
              placeholder="Email pour le test..." 
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
            />
            <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>
              <Send size={18} /> {testing ? 'Envoi...' : "Tester l'envoi"}
            </button>
          </div>
          <button className="btn btn-primary btn-large" onClick={handleSave} disabled={saving}>
            <Save size={20} /> {saving ? 'Enregistrement...' : 'Enregistrer tout'}
          </button>
        </div>
      </main>

      <style>{`
        .mail-settings-page { padding-bottom: 80px; background: #f8fafc; min-height: 100vh; }
        .settings-header { padding: 40px 0; border-bottom: 1px solid #e2e8f0; margin-bottom: 30px; }
        .btn-back { background: none; border: none; color: #64748b; display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; margin-bottom: 15px; }
        .btn-back:hover { color: var(--primary-color); }
        .settings-header h1 { color: #1e293b; font-weight: 800; margin: 0; font-size: 2rem; }
        .subtitle { color: #64748b; margin-top: 5px; }

        .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
        .settings-card { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; overflow: hidden; }
        .settings-card.full-width { grid-column: 1 / -1; }
        
        .card-header { background: #f1f5f9; padding: 15px 25px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #e2e8f0; }
        .card-header h2 { font-size: 1.1rem; color: #334155; margin: 0; }
        
        .btn-toggle-code { 
          display: flex; align-items: center; gap: 6px; 
          background: #334155; color: white; border: none; 
          padding: 8px 16px; border-radius: 6px; cursor: pointer; 
          font-size: 0.85rem; font-weight: 600; transition: all 0.2s;
        }
        .btn-toggle-code:hover { background: #1e293b; }
        
        .btn-reset-template {
          background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca;
          padding: 8px 16px; border-radius: 6px; cursor: pointer;
          font-size: 0.85rem; font-weight: 600; transition: all 0.2s;
        }
        .btn-reset-template:hover { background: #fecaca; }
        
        .template-editor-layout { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid #e2e8f0; }
        .editor-side { border-right: 1px solid #e2e8f0; }
        
        .preview-side { background: #f1f5f9; padding: 25px; display: flex; flex-direction: column; transition: all 0.3s; }
        .preview-header-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .preview-label { font-size: 0.8rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
        
        .responsive-toggles { display: flex; background: #e2e8f0; border-radius: 6px; padding: 3px; }
        .responsive-toggles button { 
          border: none; background: none; padding: 4px 12px; font-size: 0.75rem; 
          font-weight: 700; color: #64748b; cursor: pointer; border-radius: 4px; transition: all 0.2s;
        }
        .responsive-toggles button.active { background: white; color: #1e3a8a; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
        
        .mock-mail-client {
          background: white; border-radius: 10px; overflow: hidden;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          border: 1px solid #e2e8f0; display: flex; flex-direction: column; flex: 1;
          margin: 0 auto; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .mock-mail-client.desktop { width: 100%; }
        .mock-mail-client.mobile { width: 375px; height: 667px; }
        
        .client-header { background: #e2e8f0; padding: 10px 15px; display: flex; align-items: center; gap: 20px; }
        .client-dots { display: flex; gap: 6px; }
        .client-dots span { width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; }
        .client-title { font-size: 0.75rem; color: #64748b; font-weight: 600; }
        
        .client-meta { padding: 15px 20px; border-bottom: 1px solid #f1f5f9; background: #fff; }
        .meta-row { font-size: 0.85rem; margin-bottom: 4px; display: flex; gap: 10px; }
        .meta-label { color: #94a3b8; width: 50px; }
        .meta-value { color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .preview-frame-container { 
          flex: 1; overflow-y: auto; background: #f8fafc;
        }
        .preview-content { transform: scale(0.95); transform-origin: top center; }
        .mobile .preview-content { transform: scale(1); padding: 0; }
        
        .card-content { padding: 25px; }
        .form-group { margin-bottom: 20px; display: flex; flex-direction: column; gap: 8px; }
        .form-group label { font-size: 0.9rem; font-weight: 600; color: #475569; }
        .form-group input, .form-group select { padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.95rem; font-family: inherit; }
        .form-row { display: flex; gap: 20px; }
        .form-row > div { flex: 1; }
        
        .divider { height: 1px; background: #e2e8f0; margin: 25px 0; }
        .proxy-title { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; color: #475569; }
        .proxy-title h3 { font-size: 1rem; margin: 0; }
        .hint { font-size: 0.85rem; color: #64748b; margin-bottom: 15px; }
        
        .quill-wrapper { background: white; border-radius: 8px; }
        .ql-container { min-height: 400px; font-size: 16px; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; }
        .ql-toolbar { border-top-left-radius: 8px; border-top-right-radius: 8px; }
        
        .html-editor {
          width: 100%; min-height: 500px; 
          padding: 20px; border: 1px solid #cbd5e1; border-radius: 8px;
          background: #1e293b; color: #e2e8f0;
          font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; line-height: 1.5;
          resize: vertical; outline: none;
        }

        .settings-actions { 
          position: sticky; bottom: 0; 
          background: white; padding: 20px; border-top: 1px solid #e2e8f0; 
          display: flex; justify-content: space-between; align-items: center;
          margin: 0; box-shadow: 0 -4px 6px -1px rgba(0,0,0,0.1);
          z-index: 1000;
        }
        .test-box { display: flex; gap: 10px; align-items: center; }
        .test-box input { padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; width: 250px; }
        
        .btn-large { padding: 12px 30px; font-size: 1.1rem; }
      `}</style>
    </div>
  );
};

export default MailSettings;
