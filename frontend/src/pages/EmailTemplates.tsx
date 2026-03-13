import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { 
  FileText, Save, Plus, Trash2, Edit3, 
  Loader2, Mail, Code
} from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

interface Template {
  id: number;
  name: string;
  subject: string;
  content: string;
}

const EmailTemplates: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { token } = useAuth();

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await axios.get('http://localhost:3001/api/email-templates', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTemplates(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.id) {
        await axios.put(`http://localhost:3001/api/email-templates/${editing.id}`, editing, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post('http://localhost:3001/api/email-templates', editing, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      setEditing(null);
      fetchTemplates();
    } catch (err) {
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce modèle ?')) return;
    try {
      await axios.delete(`http://localhost:3001/api/email-templates/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchTemplates();
    } catch (err) {
      alert('Erreur lors de la suppression');
    }
  };

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-600" size={40} /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-gray-900">Modèles d'Emails</h2>
          <p className="text-gray-500 font-medium">Gérez le contenu des notifications automatiques.</p>
        </div>
        {!editing && (
          <button 
            className="btn btn-primary"
            onClick={() => setEditing({ id: 0, name: '', subject: '', content: '' })}
          >
            <Plus size={18} /> Nouveau Modèle
          </button>
        )}
      </div>

      {editing ? (
        <div className="form-card animate-in zoom-in-95 duration-200">
          <div className="card-header">
            <h3>{editing.id ? 'Modifier le modèle' : 'Nouveau modèle'}</h3>
          </div>
          <form onSubmit={handleSave} className="card-body space-y-6">
            <div className="form-grid">
              <div className="form-group">
                <label>Nom du modèle (Interne)</label>
                <input 
                  required
                  value={editing.name} 
                  onChange={e => setEditing({...editing, name: e.target.value})}
                  placeholder="ex: Rappel de facture"
                />
              </div>
              <div className="form-group">
                <label>Sujet de l'email</label>
                <div className="input-with-icon">
                  <Mail size={16} />
                  <input 
                    required
                    value={editing.subject} 
                    onChange={e => setEditing({...editing, subject: e.target.value})}
                    placeholder="ex: [Ivry] Votre facture n°{{num}}"
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Contenu du message</label>
              <div className="editor-container">
                <ReactQuill 
                  theme="snow" 
                  value={editing.content} 
                  onChange={val => setEditing({...editing, content: val})}
                />
              </div>
              <div className="variables-hint mt-3 p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Code size={14} className="text-blue-500" /> Variables disponibles
                </p>
                <div className="flex flex-wrap gap-2">
                  {['{{app_name}}', '{{username}}', '{{description}}', '{{order_id}}'].map(v => (
                    <code key={v} className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-blue-600 font-bold text-[10px]">{v}</code>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
              <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Enregistrer le modèle
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {templates.map(tpl => (
            <div key={tpl.id} className="template-card hover:shadow-xl transition-all group">
              <div className="tpl-icon-box">
                <FileText size={24} />
              </div>
              <div className="tpl-info">
                <h4>{tpl.name}</h4>
                <p className="subject line-clamp-1">{tpl.subject}</p>
                <div className="actions opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="icon-btn edit" onClick={() => setEditing(tpl)}><Edit3 size={16} /></button>
                  <button className="icon-btn delete" onClick={() => handleDelete(tpl.id)}><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .form-card { background: white; border-radius: 24px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .card-header { padding: 20px 30px; border-bottom: 1px solid #f1f5f9; background: #fafafa; }
        .card-header h3 { margin: 0; font-size: 1.1rem; font-weight: 800; color: #0f172a; }
        .card-body { padding: 30px; }

        .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 25px; }
        .form-group label { display: block; font-size: 0.75rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.025em; }
        
        .input-with-icon { position: relative; display: flex; align-items: center; }
        .input-with-icon svg { position: absolute; left: 15px; color: #94a3b8; }
        .input-with-icon input { padding-left: 45px !important; }

        input { width: 100%; padding: 12px 15px; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 0.9rem; font-weight: 600; color: #1e293b; outline: none; }
        input:focus { border-color: #3b82f6; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); }

        .editor-container { border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; }
        .ql-container { min-height: 300px; font-family: 'Inter', sans-serif !important; }

        .btn { padding: 10px 20px; border-radius: 10px; font-weight: 700; border: none; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px; }
        .btn-primary { background: #3b82f6; color: white; }
        .btn-outline { background: white; border: 1px solid #e2e8f0; color: #64748b; }

        .template-card {
          background: white;
          padding: 20px;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          gap: 20px;
          position: relative;
        }

        .tpl-icon-box {
          width: 50px;
          height: 50px;
          background: #eff6ff;
          color: #3b82f6;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .tpl-info h4 { margin: 0 0 4px 0; font-weight: 800; color: #1e293b; }
        .tpl-info p.subject { margin: 0; font-size: 0.8rem; color: #64748b; font-weight: 500; }

        .actions { position: absolute; right: 20px; display: flex; gap: 8px; }
        .icon-btn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; display: flex; align-items: center; justify-content: center; color: #64748b; cursor: pointer; }
        .icon-btn.edit:hover { color: #3b82f6; border-color: #3b82f6; }
        .icon-btn.delete:hover { color: #ef4444; border-color: #ef4444; }
      `}</style>
    </div>
  );
};

export default EmailTemplates;
