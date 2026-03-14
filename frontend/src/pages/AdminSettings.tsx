import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Save, Plus, Trash2, Edit2, Sliders } from 'lucide-react';

interface Setting {
    id: number;
    setting_key: string;
    setting_value: string;
    description: string;
}

const AdminSettings: React.FC = () => {
    const { token } = useAuth();
    const [settings, setSettings] = useState<Setting[]>([]);
    const [loading, setLoading] = useState(true);
    const [editMode, setEditMode] = useState<string | null>(null); // null means no row is being edited, 'new' means adding new row, or setting_key of row being edited

    const [formKey, setFormKey] = useState('');
    const [formValue, setFormValue] = useState('');
    const [formDescription, setFormDescription] = useState('');

    useEffect(() => {
        fetchSettings();
    }, [token]);

    const fetchSettings = async () => {
        try {
            const res = await axios.get('http://localhost:3001/api/admin/settings', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSettings(res.data);
        } catch (err) {
            console.error('Erreur lecture settings', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:3001/api/admin/settings', {
                setting_key: formKey,
                setting_value: formValue,
                description: formDescription
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setEditMode(null);
            fetchSettings();
        } catch (err) {
            console.error('Erreur sauvegarde setting', err);
            alert("Erreur lors de la sauvegarde.");
        }
    };

    const handleDelete = async (key: string) => {
        if (!window.confirm(`Êtes-vous sûr de vouloir supprimer la variable "${key}" ?`)) return;
        try {
            await axios.delete(`http://localhost:3001/api/admin/settings/${key}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchSettings();
        } catch (err) {
            console.error('Erreur suppression', err);
            alert("Erreur lors de la suppression.");
        }
    };

    const startEdit = (setting: Setting) => {
        setFormKey(setting.setting_key);
        setFormValue(setting.setting_value);
        setFormDescription(setting.description || '');
        setEditMode(setting.setting_key);
    };

    const startNew = () => {
        setFormKey('');
        setFormValue('');
        setFormDescription('');
        setEditMode('new');
    };

    if (loading) return <div className="p-4">Chargement...</div>;

    return (
        <div className="admin-settings-container">
            <div className="header-flex">
                <div className="title-block">
                    <Sliders size={24} className="text-blue-500" />
                    <h2>Paramètres Systèmes (Variables)</h2>
                </div>
                <button className="btn-primary" onClick={startNew} disabled={editMode !== null}>
                    <Plus size={16} /> Ajouter une variable
                </button>
            </div>

            <div className="table-card">
                <table className="settings-table">
                    <thead>
                        <tr>
                            <th>Clé</th>
                            <th>Valeur</th>
                            <th>Description</th>
                            <th className="text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {editMode === 'new' && (
                            <tr className="edit-row">
                                <td><input type="text" value={formKey} onChange={e => setFormKey(e.target.value)} placeholder="Clé unique" required /></td>
                                <td><input type="text" value={formValue} onChange={e => setFormValue(e.target.value)} placeholder="Valeur" required /></td>
                                <td><input type="text" value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Description" /></td>
                                <td className="actions-cell">
                                    <button className="btn-save" onClick={handleSave} disabled={!formKey || !formValue}><Save size={16} /></button>
                                    <button className="btn-cancel" onClick={() => setEditMode(null)}>Annuler</button>
                                </td>
                            </tr>
                        )}
                        {settings.map(s => (
                            editMode === s.setting_key ? (
                                <tr key={s.id} className="edit-row">
                                    <td><input type="text" value={formKey} disabled className="bg-gray-100" /></td>
                                    <td><input type="text" value={formValue} onChange={e => setFormValue(e.target.value)} required /></td>
                                    <td><input type="text" value={formDescription} onChange={e => setFormDescription(e.target.value)} /></td>
                                    <td className="actions-cell">
                                        <button className="btn-save" onClick={handleSave} disabled={!formValue}><Save size={16} /></button>
                                        <button className="btn-cancel" onClick={() => setEditMode(null)}>Annuler</button>
                                    </td>
                                </tr>
                            ) : (
                                <tr key={s.id}>
                                    <td className="font-semibold text-gray-700">{s.setting_key}</td>
                                    <td className="font-mono text-sm">{s.setting_value}</td>
                                    <td className="text-gray-500">{s.description}</td>
                                    <td className="actions-cell">
                                        <button className="btn-icon text-blue-500" onClick={() => startEdit(s)} disabled={editMode !== null}><Edit2 size={16} /></button>
                                        <button className="btn-icon text-red-500" onClick={() => handleDelete(s.setting_key)} disabled={editMode !== null}><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            )
                        ))}
                        {settings.length === 0 && editMode !== 'new' && (
                            <tr><td colSpan={4} className="text-center py-8 text-gray-500">Aucun paramètre configuré.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <style>{`
                .admin-settings-container {
                    max-width: 1000px;
                    margin: 0 auto;
                }
                .header-flex {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 24px;
                }
                .title-block {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .title-block h2 {
                    margin: 0;
                    color: #1e293b;
                    font-size: 1.25rem;
                }
                .btn-primary {
                    background-color: #3b82f6;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: background 0.2s;
                }
                .btn-primary:hover:not(:disabled) { background-color: #2563eb; }
                .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
                
                .table-card {
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    overflow: hidden;
                    border: 1px solid #e2e8f0;
                }
                .settings-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .settings-table th {
                    background-color: #f8fafc;
                    padding: 12px 16px;
                    text-align: left;
                    font-size: 0.85rem;
                    text-transform: uppercase;
                    color: #64748b;
                    border-bottom: 1px solid #e2e8f0;
                }
                .settings-table td {
                    padding: 12px 16px;
                    border-bottom: 1px solid #f1f5f9;
                    vertical-align: middle;
                }
                .actions-cell {
                    text-align: right;
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                }
                .btn-icon {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 6px;
                    border-radius: 6px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                .btn-icon:hover:not(:disabled) { background-color: #f1f5f9; }
                .btn-icon:disabled { opacity: 0.3; cursor: not-allowed; }
                
                .edit-row td { background-color: #f8fafc; }
                .edit-row input {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid #cbd5e1;
                    border-radius: 6px;
                    font-size: 0.9rem;
                    outline: none;
                }
                .edit-row input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }
                .btn-save {
                    background-color: #22c55e;
                    color: white;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                }
                .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
                .btn-cancel {
                    background-color: white;
                    border: 1px solid #cbd5e1;
                    padding: 6px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.85rem;
                }
            `}</style>
        </div>
    );
};

export default AdminSettings;
