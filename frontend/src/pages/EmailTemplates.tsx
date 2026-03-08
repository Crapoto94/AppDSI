import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { Save, ArrowLeft, Eye, Plus, Trash2, FileText, Code, Shield } from 'lucide-react';
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

interface EmailTemplate {
  id?: number;
  label: string;
  slug: string;
  context: string;
  subject: string;
  body: string;
}

const EmailTemplates: React.FC = () => {
  const [settings, setSettings] = useState<any>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [settingsRes, templatesRes] = await Promise.all([
        fetch('/api/mail-settings', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/email-templates', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data);
        if (data.length > 0) setSelectedTemplate(data[0]);
      }
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      const url = selectedTemplate.id 
        ? `/api/email-templates/${selectedTemplate.id}`
        : '/api/email-templates';
      const method = selectedTemplate.id ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(selectedTemplate)
      });
      
      if (response.ok) {
        alert('Modèle de message enregistré avec succès !');
        fetchData();
      }
    } catch (e) {
      alert("Erreur lors de l'enregistrement du modèle");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!window.confirm('Supprimer ce modèle ?')) return;
    try {
      const res = await fetch(`/api/email-templates/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert('Modèle supprimé');
        fetchData();
      }
    } catch (e) {
      alert('Erreur suppression');
    }
  };

  const handleNewTemplate = () => {
    const newT: EmailTemplate = {
      label: 'Nouveau Modèle',
      slug: 'NOUVEAU_' + Date.now(),
      context: 'envoi_commande',
      subject: 'Objet du message',
      body: 'Corps du message...'
    };
    setSelectedTemplate(newT);
  };

  if (loading) {
    return (
      <div className="mail-settings-page">
        <Header />
        <div style={{ padding: '100px', textAlign: 'center', color: '#64748b' }}>
          Chargement des modèles d'emails...
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
          <h1>Modèles d'Emails par Contexte</h1>
          <p className="subtitle">Personnalisez les messages automatiques envoyés aux tiers.</p>
        </div>

        <div className="settings-grid">
          {/* Section Modèles par contexte */}
          <div className="settings-card full-width">
            <div className="card-header" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <FileText size={20} />
                <h2>Modèles de Messages</h2>
              </div>
              <button className="btn btn-primary" onClick={handleNewTemplate}>
                <Plus size={18} /> Nouveau Modèle
              </button>
            </div>
            
            <div className="template-manager-layout">
              <div className="template-sidebar">
                {templates.map(t => (
                  <div 
                    key={t.id} 
                    className={`template-item ${selectedTemplate?.id === t.id ? 'active' : ''}`}
                    onClick={() => setSelectedTemplate(t)}
                  >
                    <div className="template-info">
                      <span className="label">{t.label}</span>
                      <span className="context">{t.context === 'envoi_commande' ? '📦 Envoi de commandes' : t.context === 'relance_facture' ? '💰 Relance facture' : '⚙️ Autre'}</span>
                    </div>
                    <button className="btn-delete-mini" onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.id!); }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="template-editor-side">
                {selectedTemplate ? (
                  <div className="editor-container">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                      <div className="form-group">
                        <label>Libellé Interne</label>
                        <input value={selectedTemplate.label} onChange={e => setSelectedTemplate({...selectedTemplate, label: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label>Slug (Unique)</label>
                        <input value={selectedTemplate.slug} onChange={e => setSelectedTemplate({...selectedTemplate, slug: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label>Contexte</label>
                        <select value={selectedTemplate.context} onChange={e => setSelectedTemplate({...selectedTemplate, context: e.target.value})}>
                          <option value="envoi_commande">📦 Envoi de commandes</option>
                          <option value="relance_facture">💰 Relance facture</option>
                          <option value="autre">⚙️ Autre</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Sujet de l'Email (Objet)</label>
                      <input value={selectedTemplate.subject} onChange={e => setSelectedTemplate({...selectedTemplate, subject: e.target.value})} style={{ width: '100%' }} />
                    </div>
                    <div className="form-group">
                      <label>Corps du Message (Contenu)</label>
                      <textarea 
                        value={selectedTemplate.body} 
                        onChange={e => setSelectedTemplate({...selectedTemplate, body: e.target.value})} 
                        rows={10} 
                        style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontFamily: 'inherit' }}
                      />
                    </div>
                    <button className="btn btn-primary" onClick={handleSaveTemplate} disabled={saving}>
                      <Save size={18} /> Enregistrer ce modèle
                    </button>
                  </div>
                ) : (
                  <div className="empty-state">
                    Sélectionnez ou créez un modèle pour le modifier.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Aperçu */}
          <div className="settings-card full-width">
            <div className="card-header" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Eye size={20} />
                <h2>Aperçu du Rendu Final</h2>
              </div>
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
            
            <div className="preview-side" style={{ padding: '40px' }}>
                <div className={`mock-mail-client ${previewMode}`} style={{ margin: '0 auto' }}>
                  <div className="client-header">
                    <div className="client-dots">
                      <span></span><span></span><span></span>
                    </div>
                    <div className="client-title">Aperçu Mail - DSI Hub</div>
                  </div>
                  <div className="client-meta">
                    <div className="meta-row">
                      <span className="meta-label">De :</span>
                      <span className="meta-value"><strong>{settings?.sender_name}</strong> &lt;{settings?.sender_email}&gt;</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-label">Objet :</span>
                      <span className="meta-value"><strong>{selectedTemplate?.subject || '[DSI HUB] Objet du message'}</strong></span>
                    </div>
                  </div>
                  <div className="preview-frame-container">
                    <div 
                      className="preview-content"
                      dangerouslySetInnerHTML={{ 
                        __html: (settings?.template_html || DEFAULT_TEMPLATE).replace('{{content}}', 
                          (selectedTemplate?.body || 'Contenu du message...').replace(/\n/g, '<br>')
                        ) 
                      }}
                    />
                  </div>
                </div>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .mail-settings-page { padding-bottom: 80px; background: #f8fafc; min-height: 100vh; }
        .settings-header { padding: 40px 0; border-bottom: 1px solid #e2e8f0; margin-bottom: 30px; }
        .btn-back { background: none; border: none; color: #64748b; display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; margin-bottom: 15px; }
        .btn-back:hover { color: var(--primary-color); }
        .settings-header h1 { color: #1e293b; font-weight: 800; margin: 0; font-size: 2rem; }
        .subtitle { color: #64748b; margin-top: 5px; }

        .settings-grid { display: grid; grid-template-columns: 1fr; gap: 30px; margin-bottom: 30px; }
        .settings-card { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; overflow: hidden; }
        .full-width { grid-column: 1 / -1; }
        
        .card-header { background: #f1f5f9; padding: 15px 25px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #e2e8f0; }
        .card-header h2 { font-size: 1.1rem; color: #334155; margin: 0; }
        
        .template-manager-layout { display: grid; grid-template-columns: 300px 1fr; border-top: 1px solid #e2e8f0; min-height: 400px; }
        .template-sidebar { border-right: 1px solid #e2e8f0; background: #f8fafc; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
        .template-item { 
          padding: 12px 15px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; 
          cursor: pointer; transition: all 0.2s; display: flex; justify-content: space-between; align-items: center;
        }
        .template-item:hover { border-color: #3b82f6; transform: translateX(5px); }
        .template-item.active { border-color: #3b82f6; background: #eff6ff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        .template-info { display: flex; flex-direction: column; }
        .template-info .label { font-weight: 700; color: #1e293b; font-size: 0.9rem; }
        .template-info .context { font-size: 0.75rem; color: #64748b; font-weight: 600; }
        .btn-delete-mini { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 5px; border-radius: 4px; }
        .btn-delete-mini:hover { color: #ef4444; background: #fee2e2; }
        
        .template-editor-side { padding: 30px; background: white; }
        .empty-state { height: 100%; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-style: italic; }

        .responsive-toggles { display: flex; background: #e2e8f0; border-radius: 6px; padding: 3px; }
        .responsive-toggles button { 
          border: none; background: none; padding: 4px 12px; font-size: 0.75rem; 
          font-weight: 700; color: #64748b; cursor: pointer; border-radius: 4px; transition: all 0.2s;
        }
        .responsive-toggles button.active { background: white; color: #1e3a8a; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
        
        .mock-mail-client {
          background: white; border-radius: 10px; overflow: hidden;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          border: 1px solid #e2e8f0; display: flex; flex-direction: column; 
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
        
        .form-group { margin-bottom: 20px; display: flex; flex-direction: column; gap: 8px; }
        .form-group label { font-size: 0.9rem; font-weight: 600; color: #475569; }
        .form-group input, .form-group select { padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.95rem; font-family: inherit; }
        
        .btn-primary { 
          background: var(--primary-color); color: white; border: none; 
          padding: 10px 20px; border-radius: 8px; cursor: pointer; 
          display: flex; align-items: center; gap: 8px; font-weight: 600;
        }
      `}</style>
    </div>
  );
};

export default EmailTemplates;
