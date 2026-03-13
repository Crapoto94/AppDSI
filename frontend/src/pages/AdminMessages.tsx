import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Save, Trash2, Plus, X, Edit2, Loader2, Search } from 'lucide-react';

interface Message {
    id: number;
    code: string;
    libelle: string;
    content: string;
}

const AdminMessages: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [editing, setEditing] = useState<Message | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const { token } = useAuth();

    const fetchMessages = async () => {
        setLoading(true);
        try {
            const res = await axios.get('http://localhost:3001/api/messages', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMessages(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchMessages(); }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        setSaving(true);
        try {
            if (editing.id) {
                await axios.put(`http://localhost:3001/api/messages/${editing.id}`, editing, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else {
                await axios.post('http://localhost:3001/api/messages', editing, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
            setEditing(null);
            fetchMessages();
        } catch (err) {
            alert('Erreur lors de la sauvegarde');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Supprimer ce message ?')) return;
        try {
            await axios.delete(`http://localhost:3001/api/messages/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchMessages();
        } catch (err) {
            alert('Erreur lors de la suppression');
        }
    };

    const filteredMessages = messages.filter(m => 
        m.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.libelle.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.content.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-600" size={40} /></div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-gray-900">Messages Système</h2>
                    <p className="text-gray-500 font-medium">Gestion centralisée des textes de l'application.</p>
                </div>
                <button 
                    onClick={() => setEditing({ id: 0, code: '', libelle: '', content: '' })}
                    className="btn btn-primary"
                >
                    <Plus size={18} /> Nouveau Message
                </button>
            </div>

            <div className="section-container">
                <div className="section-header">
                    <div className="search-bar">
                        <Search size={18} className="search-icon" />
                        <input 
                            type="text" 
                            placeholder="Rechercher un message..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="data-table-container">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Libellé</th>
                                <th>Aperçu du contenu</th>
                                <th className="actions">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredMessages.map(msg => (
                                <tr key={msg.id}>
                                    <td><span className="code-badge">{msg.code}</span></td>
                                    <td><span className="font-bold text-gray-900">{msg.libelle}</span></td>
                                    <td className="content-preview-cell">
                                        <div className="content-trunc" title={msg.content}>
                                            {msg.content}
                                        </div>
                                    </td>
                                    <td className="actions">
                                        <button className="icon-btn edit" onClick={() => setEditing(msg)}><Edit2 size={16} /></button>
                                        <button className="icon-btn delete" onClick={() => handleDelete(msg.id)}><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {editing && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-8 py-6 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-black text-gray-900">{editing.id ? 'Modifier' : 'Nouveau'} Message</h3>
                                <p className="text-sm text-gray-500 font-medium">Configurez le code technique et le texte affiché.</p>
                            </div>
                            <button onClick={() => setEditing(null)} className="icon-btn"><X size={20} /></button>
                        </div>
                        
                        <form onSubmit={handleSave} className="p-8 space-y-6">
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Code Identifiant</label>
                                    <input 
                                        required
                                        disabled={!!editing.id}
                                        value={editing.code} 
                                        onChange={e => setEditing({...editing, code: e.target.value})}
                                        placeholder="nologin"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Libellé Admin</label>
                                    <input 
                                        required
                                        value={editing.libelle} 
                                        onChange={e => setEditing({...editing, libelle: e.target.value})}
                                        placeholder="Message Absence de compte"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Contenu affiché</label>
                                <textarea 
                                    required
                                    rows={6}
                                    value={editing.content}
                                    onChange={e => setEditing({...editing, content: e.target.value})}
                                    placeholder="Saisissez le texte..."
                                    style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc' }}
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                                <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>Annuler</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                    Enregistrer
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                .section-container { background: white; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; }
                .section-header { padding: 20px 25px; border-bottom: 1px solid #f1f5f9; }
                
                .search-bar { position: relative; width: 300px; }
                .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
                .search-bar input { width: 100%; padding: 10px 15px 10px 40px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 0.9rem; outline: none; }

                .admin-table { width: 100%; border-collapse: collapse; text-align: left; }
                .admin-table th { padding: 15px 25px; background: #f8fafc; color: #64748b; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; }
                .admin-table td { padding: 15px 25px; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; vertical-align: middle; }

                .code-badge { background: #eff6ff; color: #3b82f6; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; font-family: monospace; }
                
                .content-preview-cell { max-width: 400px; }
                .content-trunc { color: #64748b; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

                .actions { display: flex; gap: 8px; justify-content: flex-end; }
                .icon-btn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; display: flex; align-items: center; justify-content: center; color: #64748b; cursor: pointer; transition: all 0.2s; }
                .icon-btn:hover { background: #f8fafc; color: #1e293b; border-color: #3b82f6; }

                .btn { padding: 10px 20px; border-radius: 10px; font-weight: 700; border: none; cursor: pointer; display: flex; align-items: center; gap: 8px; }
                .btn-primary { background: #3b82f6; color: white; }
                .btn-outline { background: white; border: 1px solid #e2e8f0; color: #64748b; }

                .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
                .form-group label { display: block; font-size: 0.75rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; }
                .form-group input { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #e2e8f0; background: #f8fafc; outline: none; }
            `}</style>
        </div>
    );
};

export default AdminMessages;
