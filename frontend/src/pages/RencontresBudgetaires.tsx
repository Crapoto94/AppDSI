import React, { useState, useEffect, useRef } from 'react';
import {
    Plus, Upload, X, Search, ChevronDown, ChevronUp, Edit2, Trash2, Save,
    Calendar, Users, CheckCircle, AlertCircle, FileText
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';

interface Rencontre {
    id: number;
    titre: string;
    direction: string;
    date_reunion: string;
    annee: number;
    type: string;
    description: string;
    cout_ttc: number;
    arbitrage: string;
    responsable_dsi: string;
    ticket_glpi: string;
    lien_reference: string;
    statut: string;
    commentaires: string;
    created_at: string;
    participants?: Participant[];
    suivi?: Suivi[];
}

interface Participant {
    id: number;
    rencontre_id: number;
    nom: string;
    role: string;
    email: string;
    statut: string;
}

interface Suivi {
    id: number;
    rencontre_id: number;
    action_item: string;
    responsable: string;
    date_echeance: string;
    statut: string;
}

const RencontresBudgetaires: React.FC = () => {
    const { token } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // États principaux
    const [rencontres, setRencontres] = useState<Rencontre[]>([]);
    const [filteredRencontres, setFilteredRencontres] = useState<Rencontre[]>([]);
    const [loading, setLoading] = useState(true);

    // États filtres
    const [selectedDirection, setSelectedDirection] = useState<string>('');
    const [selectedAnnee, setSelectedAnnee] = useState<number | ''>('');
    const [selectedStatut, setSelectedStatut] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState<string>('');

    // États modal import
    const [showImportModal, setShowImportModal] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importLoading, setImportLoading] = useState(false);
    const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // États détail rencontre
    const [selectedRencontre, setSelectedRencontre] = useState<Rencontre | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);

    // États pour ajout participant/suivi
    const [newParticipant, setNewParticipant] = useState({ nom: '', role: '', email: '' });
    const [newSuivi, setNewSuivi] = useState({ action_item: '', responsable: '', date_echeance: '' });

    // Directions et années uniques
    const [directions, setDirections] = useState<string[]>([]);
    const [annees, setAnnees] = useState<number[]>([]);

    // Charger les rencontres
    useEffect(() => {
        if (token) {
            fetchRencontres();
        }
    }, [token]);

    // Appliquer filtres
    useEffect(() => {
        let filtered = rencontres;

        if (selectedDirection) {
            filtered = filtered.filter(r => r.direction === selectedDirection);
        }
        if (selectedAnnee) {
            filtered = filtered.filter(r => r.annee === selectedAnnee);
        }
        if (selectedStatut) {
            filtered = filtered.filter(r => r.statut === selectedStatut);
        }
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(r =>
                r.titre.toLowerCase().includes(term) ||
                r.description.toLowerCase().includes(term) ||
                r.direction.toLowerCase().includes(term)
            );
        }

        setFilteredRencontres(filtered);
    }, [rencontres, selectedDirection, selectedAnnee, selectedStatut, searchTerm]);

    // Extraire directions et années
    useEffect(() => {
        const dirs = [...new Set(rencontres.map(r => r.direction))].sort();
        const years = [...new Set(rencontres.map(r => r.annee))].filter(y => y).sort((a, b) => b - a);
        setDirections(dirs);
        setAnnees(years as number[]);
    }, [rencontres]);

    const fetchRencontres = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/rencontres-budgetaires', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            setRencontres(data || []);
        } catch (error) {
            console.error('Erreur chargement rencontres:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchRencontreDetail = async (id: number) => {
        try {
            setDetailLoading(true);
            const response = await fetch(`/api/rencontres-budgetaires/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            setSelectedRencontre(data);
        } catch (error) {
            console.error('Erreur chargement détail:', error);
        } finally {
            setDetailLoading(false);
        }
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImportFile(file);
        }
    };

    const confirmImport = async () => {
        if (!importFile) {
            setImportMessage({ type: 'error', text: 'Veuillez sélectionner un fichier' });
            return;
        }

        try {
            setImportLoading(true);
            const formData = new FormData();
            formData.append('file', importFile);

            const response = await fetch('/api/rencontres-budgetaires/import', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                setImportMessage({ type: 'success', text: result.message });
                setImportFile(null);
                setTimeout(() => {
                    setShowImportModal(false);
                    setImportMessage(null);
                    fetchRencontres();
                }, 2000);
            } else {
                setImportMessage({ type: 'error', text: result.error || 'Erreur lors de l\'import' });
            }
        } catch (error) {
            setImportMessage({ type: 'error', text: 'Erreur: ' + String(error) });
        } finally {
            setImportLoading(false);
        }
    };

    const handleDeleteRencontre = async (id: number) => {
        if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette rencontre?')) return;

        try {
            const response = await fetch(`/api/rencontres-budgetaires/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                fetchRencontres();
                if (selectedRencontre?.id === id) {
                    setShowDetailModal(false);
                }
            }
        } catch (error) {
            console.error('Erreur suppression:', error);
        }
    };

    const handleAddParticipant = async () => {
        if (!selectedRencontre || !newParticipant.nom) return;

        try {
            const response = await fetch(`/api/rencontres-budgetaires/${selectedRencontre.id}/participants`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newParticipant)
            });

            if (response.ok) {
                setNewParticipant({ nom: '', role: '', email: '' });
                fetchRencontreDetail(selectedRencontre.id);
            }
        } catch (error) {
            console.error('Erreur ajout participant:', error);
        }
    };

    const handleAddSuivi = async () => {
        if (!selectedRencontre || !newSuivi.action_item) return;

        try {
            const response = await fetch(`/api/rencontres-budgetaires/${selectedRencontre.id}/suivi`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newSuivi)
            });

            if (response.ok) {
                setNewSuivi({ action_item: '', responsable: '', date_echeance: '' });
                fetchRencontreDetail(selectedRencontre.id);
            }
        } catch (error) {
            console.error('Erreur ajout suivi:', error);
        }
    };

    const getStatutColor = (statut: string) => {
        switch (statut) {
            case 'importée': return 'bg-blue-100 text-blue-800';
            case 'planifiée': return 'bg-yellow-100 text-yellow-800';
            case 'effectuée': return 'bg-green-100 text-green-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getArbitrageColor = (arbitrage: string) => {
        if (arbitrage.includes('OK')) return 'text-green-600';
        if (arbitrage.includes('En attente')) return 'text-yellow-600';
        if (arbitrage.includes('Refusé')) return 'text-red-600';
        return 'text-gray-600';
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <Header />

            <main className="container mx-auto p-6">
                {/* En-tête */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">Rencontres Budgétaires</h1>
                        <p className="text-gray-600">Gestion des rencontres budgétaires par direction et par année</p>
                    </div>
                    <button
                        onClick={handleImportClick}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                    >
                        <Upload size={20} />
                        Importer Excel
                    </button>
                </div>

                {/* Filtres */}
                <div className="bg-white rounded-lg shadow p-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <input
                            type="text"
                            placeholder="Rechercher..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="px-3 py-2 border rounded-lg"
                        />

                        <select
                            value={selectedDirection}
                            onChange={(e) => setSelectedDirection(e.target.value)}
                            className="px-3 py-2 border rounded-lg"
                        >
                            <option value="">Toutes les directions</option>
                            {directions.map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>

                        <select
                            value={selectedAnnee}
                            onChange={(e) => setSelectedAnnee(e.target.value ? parseInt(e.target.value) : '')}
                            className="px-3 py-2 border rounded-lg"
                        >
                            <option value="">Toutes les années</option>
                            {annees.map(a => (
                                <option key={a} value={a}>{a}</option>
                            ))}
                        </select>

                        <select
                            value={selectedStatut}
                            onChange={(e) => setSelectedStatut(e.target.value)}
                            className="px-3 py-2 border rounded-lg"
                        >
                            <option value="">Tous les statuts</option>
                            <option value="importée">Importée</option>
                            <option value="planifiée">Planifiée</option>
                            <option value="effectuée">Effectuée</option>
                        </select>

                        <button
                            onClick={() => {
                                setSelectedDirection('');
                                setSelectedAnnee('');
                                setSelectedStatut('');
                                setSearchTerm('');
                            }}
                            className="px-3 py-2 border rounded-lg hover:bg-gray-100"
                        >
                            Réinitialiser
                        </button>
                    </div>
                </div>

                {/* Tableau */}
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    {loading ? (
                        <div className="p-8 text-center">Chargement...</div>
                    ) : filteredRencontres.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">Aucune rencontre trouvée</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="px-6 py-3 text-left">Direction</th>
                                        <th className="px-6 py-3 text-left">Titre</th>
                                        <th className="px-6 py-3 text-left">Date</th>
                                        <th className="px-6 py-3 text-left">Montant TTC</th>
                                        <th className="px-6 py-3 text-left">Arbitrage</th>
                                        <th className="px-6 py-3 text-left">Statut</th>
                                        <th className="px-6 py-3 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredRencontres.map(r => (
                                        <tr key={r.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-3 font-medium">{r.direction}</td>
                                            <td className="px-6 py-3 text-sm text-gray-700">{r.titre}</td>
                                            <td className="px-6 py-3 text-sm">
                                                {r.date_reunion ? new Date(r.date_reunion).toLocaleDateString('fr-FR') : '-'}
                                            </td>
                                            <td className="px-6 py-3 text-sm">{r.cout_ttc?.toFixed(2) || 0}€</td>
                                            <td className={`px-6 py-3 text-sm font-medium ${getArbitrageColor(r.arbitrage)}`}>
                                                {r.arbitrage || '-'}
                                            </td>
                                            <td className="px-6 py-3">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatutColor(r.statut)}`}>
                                                    {r.statut}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                <button
                                                    onClick={() => {
                                                        fetchRencontreDetail(r.id);
                                                        setShowDetailModal(true);
                                                    }}
                                                    className="text-blue-600 hover:text-blue-800 mr-3"
                                                >
                                                    <FileText size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteRencontre(r.id)}
                                                    className="text-red-600 hover:text-red-800"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Modal Import */}
                {showImportModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 w-full max-w-md">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold">Importer Excel</h2>
                                <button onClick={() => setShowImportModal(false)}>
                                    <X size={24} />
                                </button>
                            </div>

                            {importMessage ? (
                                <div className={`p-4 rounded-lg mb-4 ${importMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {importMessage.text}
                                </div>
                            ) : (
                                <>
                                    <div className="mb-4">
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleFileChange}
                                            accept=".xlsx,.xls"
                                            className="hidden"
                                        />
                                        <button
                                            onClick={handleImportClick}
                                            className="w-full border-2 border-dashed rounded-lg p-6 text-center hover:bg-gray-50"
                                        >
                                            {importFile ? (
                                                <div>
                                                    <CheckCircle className="mx-auto mb-2 text-green-600" />
                                                    <p className="font-medium">{importFile.name}</p>
                                                </div>
                                            ) : (
                                                <div>
                                                    <Upload className="mx-auto mb-2" />
                                                    <p className="text-sm text-gray-600">Cliquez pour sélectionner un fichier Excel</p>
                                                </div>
                                            )}
                                        </button>
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setShowImportModal(false)}
                                            className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-100"
                                        >
                                            Annuler
                                        </button>
                                        <button
                                            onClick={confirmImport}
                                            disabled={!importFile || importLoading}
                                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                                        >
                                            {importLoading ? 'Importation...' : 'Importer'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Modal Détail */}
                {showDetailModal && selectedRencontre && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                            <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
                                <h2 className="text-2xl font-bold">{selectedRencontre.titre}</h2>
                                <button onClick={() => setShowDetailModal(false)}>
                                    <X size={24} />
                                </button>
                            </div>

                            {detailLoading ? (
                                <div className="p-8 text-center">Chargement...</div>
                            ) : (
                                <div className="p-6 space-y-6">
                                    {/* Informations principales */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium text-gray-600">Direction</label>
                                            <p className="text-lg">{selectedRencontre.direction}</p>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-gray-600">Date</label>
                                            <p className="text-lg">
                                                {selectedRencontre.date_reunion ? new Date(selectedRencontre.date_reunion).toLocaleDateString('fr-FR') : '-'}
                                            </p>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-gray-600">Montant TTC</label>
                                            <p className="text-lg font-medium text-green-600">{selectedRencontre.cout_ttc?.toFixed(2) || 0}€</p>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-gray-600">Statut</label>
                                            <span className={`inline-block px-2 py-1 rounded-full text-sm font-medium ${getStatutColor(selectedRencontre.statut)}`}>
                                                {selectedRencontre.statut}
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-600">Description</label>
                                        <p className="mt-1 text-gray-700">{selectedRencontre.description}</p>
                                    </div>

                                    {selectedRencontre.commentaires && (
                                        <div>
                                            <label className="text-sm font-medium text-gray-600">Commentaires</label>
                                            <p className="mt-1 text-gray-700">{selectedRencontre.commentaires}</p>
                                        </div>
                                    )}

                                    {/* Participants */}
                                    <div className="border-t pt-4">
                                        <h3 className="font-bold mb-3 flex items-center gap-2">
                                            <Users size={20} />
                                            Participants ({selectedRencontre.participants?.length || 0})
                                        </h3>

                                        {selectedRencontre.participants && selectedRencontre.participants.length > 0 && (
                                            <div className="mb-4 space-y-2">
                                                {selectedRencontre.participants.map(p => (
                                                    <div key={p.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                                                        <div>
                                                            <p className="font-medium">{p.nom}</p>
                                                            {p.role && <p className="text-sm text-gray-600">{p.role}</p>}
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                // Supprimer participant (à implémenter)
                                                            }}
                                                            className="text-red-600 hover:text-red-800"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <input
                                                type="text"
                                                placeholder="Nom du participant"
                                                value={newParticipant.nom}
                                                onChange={(e) => setNewParticipant({...newParticipant, nom: e.target.value})}
                                                className="w-full px-3 py-2 border rounded"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Rôle"
                                                value={newParticipant.role}
                                                onChange={(e) => setNewParticipant({...newParticipant, role: e.target.value})}
                                                className="w-full px-3 py-2 border rounded"
                                            />
                                            <button
                                                onClick={handleAddParticipant}
                                                className="w-full px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                            >
                                                Ajouter un participant
                                            </button>
                                        </div>
                                    </div>

                                    {/* Suivi */}
                                    <div className="border-t pt-4">
                                        <h3 className="font-bold mb-3 flex items-center gap-2">
                                            <CheckCircle size={20} />
                                            Suivi des actions ({selectedRencontre.suivi?.length || 0})
                                        </h3>

                                        {selectedRencontre.suivi && selectedRencontre.suivi.length > 0 && (
                                            <div className="mb-4 space-y-2">
                                                {selectedRencontre.suivi.map(s => (
                                                    <div key={s.id} className="p-2 bg-gray-50 rounded border-l-4 border-blue-500">
                                                        <p className="font-medium text-sm">{s.action_item}</p>
                                                        {s.responsable && <p className="text-xs text-gray-600">Responsable: {s.responsable}</p>}
                                                        {s.date_echeance && <p className="text-xs text-gray-600">Échéance: {new Date(s.date_echeance).toLocaleDateString('fr-FR')}</p>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <input
                                                type="text"
                                                placeholder="Action à suivre"
                                                value={newSuivi.action_item}
                                                onChange={(e) => setNewSuivi({...newSuivi, action_item: e.target.value})}
                                                className="w-full px-3 py-2 border rounded"
                                            />
                                            <input
                                                type="date"
                                                value={newSuivi.date_echeance}
                                                onChange={(e) => setNewSuivi({...newSuivi, date_echeance: e.target.value})}
                                                className="w-full px-3 py-2 border rounded"
                                            />
                                            <button
                                                onClick={handleAddSuivi}
                                                className="w-full px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                                            >
                                                Ajouter une action
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => setShowDetailModal(false)}
                                        className="w-full px-4 py-2 border rounded-lg hover:bg-gray-100"
                                    >
                                        Fermer
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default RencontresBudgetaires;
