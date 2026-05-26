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
            const res = await axios.get('/api/admin/settings', {
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
            await axios.post('/api/admin/settings', {
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
            await axios.delete(`/api/admin/settings/${key}`, {
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

    if (loading) return <div style={{ padding: 24, color: '#64748b', fontSize: '0.875rem' }}>Chargement...</div>;

    return (
        <div className="as-root">
            <div className="as-header">
                <span className="as-header-icon">
                    <Sliders size={16} />
                </span>
                <div>
                    <h1 className="as-title">Paramètres système</h1>
                    <p className="as-desc">Variables de configuration globales de l'application</p>
                </div>
            </div>

            <div className="as-toolbar">
                <button className="as-btn-add" onClick={startNew} disabled={editMode !== null}>
                    <Plus size={14} /> Ajouter une variable
                </button>
            </div>

            <div className="as-table-card">
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
                                        <button className="btn-icon" style={{ color: '#3b82f6' }} onClick={() => startEdit(s)} disabled={editMode !== null}><Edit2 size={15} /></button>
                                        <button className="btn-icon" style={{ color: '#ef4444' }} onClick={() => handleDelete(s.setting_key)} disabled={editMode !== null}><Trash2 size={15} /></button>
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
                .as-root { display: flex; flex-direction: column; min-height: 0; }

                .as-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding-bottom: 18px;
                    border-bottom: 1px solid #e8edf3;
                    margin-bottom: 0;
                }

                .as-header-icon {
                    width: 34px; height: 34px;
                    border-radius: 7px;
                    background: #eff6ff;
                    color: #2563eb;
                    border: 1px solid #bfdbfe;
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0;
                }

                .as-title {
                    font-size: 0.9375rem;
                    font-weight: 700;
                    color: #0f172a;
                    margin: 0 0 2px 0;
                    line-height: 1.3;
                }

                .as-desc {
                    font-size: 0.78rem;
                    color: #94a3b8;
                    margin: 0;
                    line-height: 1.4;
                }

                .as-toolbar {
                    display: flex;
                    justify-content: flex-end;
                    margin: 18px 0 14px 0;
                }

                .as-btn-add {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 7px 14px;
                    background: #2563eb;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 0.8125rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background .15s;
                }
                .as-btn-add:hover:not(:disabled) { background: #1d4ed8; }
                .as-btn-add:disabled { opacity: 0.5; cursor: not-allowed; }

                .as-table-card {
                    background: white;
                    border-radius: 8px;
                    overflow: hidden;
                    border: 1px solid #e2e8f0;
                }
                .settings-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .settings-table { width: 100%; border-collapse: collapse; }
                .settings-table th {
                    background: #f8fafc;
                    padding: 10px 16px;
                    text-align: left;
                    font-size: 0.73rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    color: #64748b;
                    border-bottom: 1px solid #e2e8f0;
                }
                .settings-table td {
                    padding: 10px 16px;
                    border-bottom: 1px solid #f1f5f9;
                    vertical-align: middle;
                    font-size: 0.8125rem;
                }
                .settings-table tr:last-child td { border-bottom: none; }
                .actions-cell {
                    text-align: right;
                    display: flex;
                    justify-content: flex-end;
                    gap: 6px;
                }
                .btn-icon {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 5px;
                    border-radius: 5px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                .btn-icon:hover:not(:disabled) { background: #f1f5f9; }
                .btn-icon:disabled { opacity: 0.3; cursor: not-allowed; }

                .edit-row td { background: #f8fafc; }
                .edit-row input {
                    width: 100%;
                    padding: 6px 10px;
                    border: 1px solid #cbd5e1;
                    border-radius: 5px;
                    font-size: 0.8125rem;
                    outline: none;
                    box-sizing: border-box;
                }
                .edit-row input:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,.1); }
                .btn-save {
                    background: #22c55e;
                    color: white;
                    border: none;
                    padding: 5px 10px;
                    border-radius: 5px;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    font-size: 0.8rem;
                }
                .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
                .btn-cancel {
                    background: white;
                    border: 1px solid #cbd5e1;
                    padding: 5px 10px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 0.8rem;
                    color: #475569;
                }
            `}</style>
        </div>
    );
};

export default AdminSettings;
