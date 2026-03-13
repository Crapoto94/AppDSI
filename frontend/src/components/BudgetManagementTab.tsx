import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext'; 
import { Plus, Edit2, Trash2, Save, X, Calendar, Hash, Tag, LayoutGrid } from 'lucide-react';

interface Budget {
    id: number;
    Annee: number;
    numero: number;
    Libelle: string;
}

const BudgetManagementTab: React.FC = () => {
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [newBudget, setNewBudget] = useState<Omit<Budget, 'id'>>({ Annee: new Date().getFullYear(), numero: 0, Libelle: '' });
    const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
    const { user, token } = useAuth();

    const isAdmin = user?.role === 'admin';

    useEffect(() => {
        fetchBudgets();
    }, [token]);

    const fetchBudgets = async () => {
        try {
            const response = await axios.get<Budget[]>('/api/budgets', {
                headers: { Authorization: `Bearer ${token}` },
            });
            setBudgets(response.data);
        } catch (error) {
            console.error('Error fetching budgets:', error);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const val = name === 'Annee' || name === 'numero' ? parseInt(value) || 0 : value;
        if (editingBudget) {
            setEditingBudget({ ...editingBudget, [name]: val });
        } else {
            setNewBudget({ ...newBudget, [name]: val });
        }
    };

    const handleCreateBudget = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post('/api/budgets', newBudget, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setNewBudget({ Annee: new Date().getFullYear(), numero: (budgets.length > 0 ? Math.max(...budgets.map(b => b.numero)) + 1 : 1), Libelle: '' });
            fetchBudgets();
        } catch (error) {
            alert('Erreur lors de la création');
        }
    };

    const handleUpdateBudget = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingBudget) return;
        try {
            await axios.put(`/api/budgets/${editingBudget.id}`, editingBudget, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setEditingBudget(null);
            fetchBudgets();
        } catch (error) {
            alert('Erreur lors de la mise à jour');
        }
    };

    const handleDeleteBudget = async (id: number) => {
        if (window.confirm('Supprimer ce budget ?')) {
            try {
                await axios.delete(`/api/budgets/${id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                fetchBudgets();
            } catch (error) {
                alert('Erreur lors de la suppression');
            }
        }
    };

    return (
        <div className="budget-mgmt-container">
            <div className="mgmt-header">
                <div className="header-info">
                    <h2 className="section-title">
                        <LayoutGrid size={22} />
                        Référentiel des Budgets
                    </h2>
                    <p className="section-desc">Gérez la liste des budgets disponibles pour l'imputation des dépenses.</p>
                </div>
                <div className="header-stats">
                    <div className="mini-stat">
                        <span className="stat-value">{budgets.length}</span>
                        <span className="stat-label">Budgets actifs</span>
                    </div>
                </div>
            </div>

            {isAdmin && (
                <div className="form-section glass-card">
                    <h3 className="form-title">
                        {editingBudget ? <><Edit2 size={18} /> Modifier le budget</> : <><Plus size={18} /> Nouveau budget</>}
                    </h3>
                    <form onSubmit={editingBudget ? handleUpdateBudget : handleCreateBudget} className="budget-form">
                        <div className="input-group">
                            <div className="field">
                                <label><Calendar size={14} /> Année</label>
                                <input
                                    type="number"
                                    name="Annee"
                                    value={editingBudget ? editingBudget.Annee : newBudget.Annee}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div className="field">
                                <label><Hash size={14} /> Numéro</label>
                                <input
                                    type="number"
                                    name="numero"
                                    value={editingBudget ? editingBudget.numero : newBudget.numero}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div className="field grow">
                                <label><Tag size={14} /> Libellé du budget</label>
                                <input
                                    type="text"
                                    name="Libelle"
                                    placeholder="Ex: Ville, Luxy, Restauration..."
                                    value={editingBudget ? editingBudget.Libelle : newBudget.Libelle}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                        </div>
                        <div className="form-actions">
                            <button type="submit" className="btn-save">
                                {editingBudget ? <><Save size={18} /> Enregistrer</> : <><Plus size={18} /> Ajouter</>}
                            </button>
                            {editingBudget && (
                                <button type="button" onClick={() => setEditingBudget(null)} className="btn-cancel">
                                    <X size={18} /> Annuler
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            )}

            <div className="table-section glass-card">
                <table className="modern-mgmt-table">
                    <thead>
                        <tr>
                            <th>N°</th>
                            <th>Année</th>
                            <th>Libellé</th>
                            {isAdmin && <th className="text-right">Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {budgets.map((budget) => (
                            <tr key={budget.id} className={editingBudget?.id === budget.id ? 'row-editing' : ''}>
                                <td className="cell-num">#{budget.numero}</td>
                                <td><span className="year-badge">{budget.Annee}</span></td>
                                <td className="cell-label">{budget.Libelle}</td>
                                {isAdmin && (
                                    <td className="cell-actions">
                                        <button onClick={() => setEditingBudget(budget)} className="action-btn edit" title="Modifier">
                                            <Edit2 size={16} />
                                        </button>
                                        <button onClick={() => handleDeleteBudget(budget.id)} className="action-btn delete" title="Supprimer">
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                        {budgets.length === 0 && (
                            <tr>
                                <td colSpan={4} className="empty-row">Aucun budget défini dans le référentiel.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <style>{`
                .budget-mgmt-container {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }
                .mgmt-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0 0.5rem;
                }
                .section-title {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    margin: 0;
                    color: #003366;
                    font-size: 1.25rem;
                    font-weight: 800;
                }
                .section-desc {
                    color: #64748b;
                    margin: 0.25rem 0 0 0;
                    font-size: 0.9rem;
                }
                .header-stats {
                    display: flex;
                    gap: 1rem;
                }
                .mini-stat {
                    background: white;
                    padding: 0.5rem 1rem;
                    border-radius: 0.75rem;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }
                .stat-value { font-weight: 800; color: #e30613; font-size: 1.1rem; }
                .stat-label { font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; }

                .form-section {
                    padding: 1.5rem;
                    border-top: 4px solid #003366;
                }
                .form-title {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin: 0 0 1.25rem 0;
                    font-size: 1rem;
                    font-weight: 700;
                    color: #1e293b;
                }
                .budget-form {
                    display: flex;
                    flex-direction: column;
                    gap: 1.25rem;
                }
                .input-group {
                    display: flex;
                    gap: 1rem;
                    flex-wrap: wrap;
                }
                .field {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    min-width: 120px;
                }
                .field.grow { flex: 1; min-width: 250px; }
                .field label {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    font-size: 0.8rem;
                    font-weight: 700;
                    color: #64748b;
                }
                .field input {
                    padding: 0.625rem 1rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 0.5rem;
                    font-size: 0.9rem;
                    outline: none;
                    transition: border-color 0.2s;
                }
                .field input:focus { border-color: #003366; box-shadow: 0 0 0 3px rgba(0,51,102,0.05); }

                .form-actions { display: flex; gap: 0.75rem; justify-content: flex-end; }
                .btn-save {
                    background: #003366;
                    color: white;
                    border: none;
                    padding: 0.625rem 1.25rem;
                    border-radius: 0.5rem;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-save:hover { transform: translateY(-1px); box-shadow: 0 4px 6px rgba(0,51,102,0.2); }
                .btn-cancel {
                    background: #f1f5f9;
                    color: #64748b;
                    border: none;
                    padding: 0.625rem 1.25rem;
                    border-radius: 0.5rem;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                }

                .table-section { overflow: hidden; }
                .modern-mgmt-table { width: 100%; border-collapse: collapse; }
                .modern-mgmt-table th {
                    background: #f8fafc;
                    padding: 1rem;
                    text-align: left;
                    font-size: 0.75rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    color: #94a3b8;
                    border-bottom: 1px solid #f1f5f9;
                }
                .modern-mgmt-table td {
                    padding: 1rem;
                    border-bottom: 1px solid #f8fafc;
                    font-size: 0.95rem;
                }
                .row-editing td { background: #eff6ff !important; }
                .year-badge {
                    background: #f1f5f9;
                    color: #475569;
                    padding: 0.25rem 0.6rem;
                    border-radius: 0.5rem;
                    font-weight: 700;
                    font-size: 0.8rem;
                }
                .cell-num { font-weight: 800; color: #94a3b8; font-family: monospace; }
                .cell-label { font-weight: 600; color: #1e293b; }
                .cell-actions { text-align: right; white-space: nowrap; }
                .action-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    border: none;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    margin-left: 0.5rem;
                    transition: all 0.2s;
                }
                .action-btn.edit { background: #eff6ff; color: #3b82f6; }
                .action-btn.edit:hover { background: #3b82f6; color: white; }
                .action-btn.delete { background: #fee2e2; color: #e30613; }
                .action-btn.delete:hover { background: #e30613; color: white; }
                .empty-row { text-align: center; color: #94a3b8; padding: 3rem !important; font-style: italic; }
            `}</style>
        </div>
    );
};

export default BudgetManagementTab;
