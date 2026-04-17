import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import {
  Upload, Search, X, Columns, Eye, EyeOff, Plus, Trash2, Edit2, Save,
  ChevronDown, ChevronUp, Info, Filter
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

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
  participants?: any[];
  suivi?: any[];
}

const RencontresBudgetaires: React.FC = () => {
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rencontres, setRencontres] = useState<Rencontre[]>([]);
  const [filteredRencontres, setFilteredRencontres] = useState<Rencontre[]>([]);
  const [loading, setLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);

  // Filtres
  const [selectedDirection, setSelectedDirection] = useState<string>('');
  const [selectedAnnee, setSelectedAnnee] = useState<number | ''>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStatut, setSelectedStatut] = useState<string>('');

  // UI
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [showColumnConfig, setShowColumnConfig] = useState(false);

  // Detail modal
  const [selectedRencontre, setSelectedRencontre] = useState<Rencontre | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const directions = [...new Set(rencontres.map(r => r.direction))].sort();
  const annees = [...new Set(rencontres.map(r => r.annee))].filter(a => a).sort((a, b) => b - a);

  useEffect(() => {
    if (token) {
      fetchRencontres();
    }
  }, [token]);

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
        r.direction.toLowerCase().includes(term)
      );
    }

    // Apply sorting
    if (sortConfig) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortConfig.key as keyof Rencontre];
        const bVal = b[sortConfig.key as keyof Rencontre];
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredRencontres(filtered);
  }, [rencontres, selectedDirection, selectedAnnee, selectedStatut, searchTerm, sortConfig]);

  const fetchRencontres = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/rencontres-budgetaires', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setRencontres(data || []);
    } catch (error) {
      console.error('Erreur chargement:', error);
      alert('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsImporting(true);
      const res = await fetch('/api/rencontres-budgetaires/import', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const result = await res.json();
      if (res.ok) {
        alert(`Import réussi : ${result.imported} importées${result.errors?.length > 0 ? ', ' + result.errors.length + ' erreurs' : ''}`);
        fetchRencontres();
      } else {
        alert(`Erreur : ${result.error || result.message}`);
      }
    } catch (err) {
      console.error('Import error:', err);
      alert('Erreur lors de l\'import');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteRencontre = async (id: number) => {
    if (!window.confirm('Êtes-vous sûr ?')) return;

    try {
      const res = await fetch(`/api/rencontres-budgetaires/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert('Supprimée avec succès');
        fetchRencontres();
        if (selectedRencontre?.id === id) setShowDetailModal(false);
      } else {
        alert('Erreur suppression');
      }
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const handleSort = (key: string) => {
    setSortConfig(current => ({
      key,
      direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getStatutColor = (statut: string) => {
    switch (statut) {
      case 'importée': return '#3b82f6';
      case 'planifiée': return '#f59e0b';
      case 'effectuée': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getArbitrageColor = (arbitrage: string) => {
    if (arbitrage.includes('OK')) return '#10b981';
    if (arbitrage.includes('En attente')) return '#f59e0b';
    if (arbitrage.includes('Refusé')) return '#ef4444';
    return '#6b7280';
  };

  return (
    <div style={styles.container}>
      <Header />

      <main style={styles.mainContent}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          <h2 style={styles.title}>Rencontres Budgétaires</h2>
          <div style={styles.toolbarActions}>
            <button
              style={styles.toolbarBtn}
              onClick={handleImportClick}
              disabled={isImporting}
              title="Importer un fichier Excel"
            >
              <Upload size={18} />
              <span>{isImporting ? 'Import...' : 'Importer'}</span>
            </button>
            <button
              style={styles.toolbarBtn}
              onClick={() => setShowColumnConfig(!showColumnConfig)}
              title="Paramètres colonnes"
            >
              <Columns size={18} />
            </button>
          </div>
        </div>

        {/* Filtres */}
        <div style={styles.filterBar}>
          <div style={styles.searchBox}>
            <Search size={16} style={{ opacity: 0.5 }} />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          <select
            value={selectedDirection}
            onChange={(e) => setSelectedDirection(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">Toutes directions</option>
            {directions.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select
            value={selectedAnnee}
            onChange={(e) => setSelectedAnnee(e.target.value ? parseInt(e.target.value) : '')}
            style={styles.filterSelect}
          >
            <option value="">Toutes années</option>
            {annees.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <select
            value={selectedStatut}
            onChange={(e) => setSelectedStatut(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">Tous statuts</option>
            <option value="importée">Importée</option>
            <option value="planifiée">Planifiée</option>
            <option value="effectuée">Effectuée</option>
          </select>

          <button
            style={styles.resetBtn}
            onClick={() => {
              setSelectedDirection('');
              setSelectedAnnee('');
              setSelectedStatut('');
              setSearchTerm('');
            }}
          >
            Réinitialiser
          </button>
        </div>

        {/* Tableau */}
        <div style={styles.tableContainer}>
          {loading ? (
            <div style={styles.loading}>Chargement...</div>
          ) : filteredRencontres.length === 0 ? (
            <div style={styles.empty}>Aucune donnée</div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.headerRow}>
                  <th style={{ ...styles.th, cursor: 'pointer' }} onClick={() => handleSort('direction')}>
                    Direction {sortConfig?.key === 'direction' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ ...styles.th, cursor: 'pointer' }} onClick={() => handleSort('titre')}>
                    Titre {sortConfig?.key === 'titre' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ ...styles.th, cursor: 'pointer' }} onClick={() => handleSort('date_reunion')}>
                    Date {sortConfig?.key === 'date_reunion' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={styles.th}>Montant TTC</th>
                  <th style={styles.th}>Arbitrage</th>
                  <th style={styles.th}>Statut</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRencontres.map(r => (
                  <React.Fragment key={r.id}>
                    <tr
                      style={{
                        ...styles.row,
                        backgroundColor: expandedId === r.id ? '#f9fafb' : 'transparent'
                      }}
                    >
                      <td style={styles.td}>{r.direction}</td>
                      <td
                        style={{
                          ...styles.td,
                          cursor: 'pointer',
                          color: '#2563eb',
                          textDecoration: 'underline',
                          fontWeight: '500'
                        }}
                        onClick={() => {
                          setSelectedRencontre(r);
                          setShowDetailModal(true);
                        }}
                        title="Cliquer pour voir les détails"
                      >
                        {r.titre.substring(0, 60)}
                      </td>
                      <td style={styles.td}>
                        {r.date_reunion ? new Date(r.date_reunion).toLocaleDateString('fr-FR') : '-'}
                      </td>
                      <td style={styles.td}>{r.cout_ttc?.toFixed(2) || 0}€</td>
                      <td style={{ ...styles.td, color: getArbitrageColor(r.arbitrage) }}>
                        <strong>{r.arbitrage || '-'}</strong>
                      </td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            backgroundColor: getStatutColor(r.statut),
                            color: 'white'
                          }}
                        >
                          {r.statut}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <button
                          style={{ ...styles.iconBtn, marginRight: '8px' }}
                          onClick={() => {
                            setSelectedRencontre(r);
                            setShowDetailModal(true);
                          }}
                          title="Détails"
                        >
                          <Info size={16} />
                        </button>
                        <button
                          style={styles.iconBtn}
                          onClick={() => handleDeleteRencontre(r.id)}
                          title="Supprimer"
                        >
                          <Trash2 size={16} color="#ef4444" />
                        </button>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Détail - Complète avec tous les champs */}
        {showDetailModal && selectedRencontre && (
          <div style={styles.modalOverlay} onClick={() => setShowDetailModal(false)}>
            <div style={{...styles.modal, maxWidth: '800px', maxHeight: '90vh'}} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>{selectedRencontre.titre}</h3>
                <button style={styles.modalCloseBtn} onClick={() => setShowDetailModal(false)}>
                  <X size={24} />
                </button>
              </div>

              <div style={{...styles.modalContent, overflowY: 'auto', maxHeight: 'calc(90vh - 180px)'}}>
                {/* Première section - Informations principales */}
                <div style={styles.modalSection}>
                  <h4 style={styles.sectionTitle}>📋 Informations Principales</h4>
                  <div style={styles.detailGrid2}>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Direction</label>
                      <p style={styles.value}>{selectedRencontre.direction}</p>
                    </div>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Date</label>
                      <p style={styles.value}>
                        {selectedRencontre.date_reunion ? new Date(selectedRencontre.date_reunion).toLocaleDateString('fr-FR') : '-'}
                      </p>
                    </div>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Année</label>
                      <p style={styles.value}>{selectedRencontre.annee || '-'}</p>
                    </div>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Type</label>
                      <p style={styles.value}>{selectedRencontre.type || '-'}</p>
                    </div>
                  </div>
                </div>

                {/* Deuxième section - Finances */}
                <div style={styles.modalSection}>
                  <h4 style={styles.sectionTitle}>💰 Informations Financières</h4>
                  <div style={styles.detailGrid2}>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Montant TTC</label>
                      <p style={{...styles.value, fontSize: '18px', fontWeight: 'bold', color: '#10b981'}}>
                        {selectedRencontre.cout_ttc?.toFixed(2) || 0}€
                      </p>
                    </div>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Arbitrage</label>
                      <p style={{
                        ...styles.value,
                        color: getArbitrageColor(selectedRencontre.arbitrage),
                        fontWeight: 'bold',
                        fontSize: '16px'
                      }}>
                        {selectedRencontre.arbitrage || '-'}
                      </p>
                    </div>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Statut</label>
                      <span style={{
                        ...styles.badge,
                        backgroundColor: getStatutColor(selectedRencontre.statut),
                        color: 'white',
                        display: 'inline-block'
                      }}>
                        {selectedRencontre.statut}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Troisième section - Description et Commentaires */}
                <div style={styles.modalSection}>
                  <h4 style={styles.sectionTitle}>📝 Description</h4>
                  <div style={{...styles.detailField, marginBottom: '16px'}}>
                    <label style={styles.label}>Détails de la demande</label>
                    <p style={{...styles.value, whiteSpace: 'pre-wrap', lineHeight: '1.6'}}>
                      {selectedRencontre.description || '-'}
                    </p>
                  </div>

                  {selectedRencontre.commentaires && (
                    <div style={styles.detailField}>
                      <label style={styles.label}>Commentaires</label>
                      <p style={{...styles.value, whiteSpace: 'pre-wrap', lineHeight: '1.6'}}>
                        {selectedRencontre.commentaires}
                      </p>
                    </div>
                  )}
                </div>

                {/* Quatrième section - Suivi et Responsabilité */}
                <div style={styles.modalSection}>
                  <h4 style={styles.sectionTitle}>👤 Responsabilité</h4>
                  <div style={styles.detailGrid2}>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Responsable DSI</label>
                      <p style={styles.value}>{selectedRencontre.responsable_dsi || '-'}</p>
                    </div>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Ticket GLPI</label>
                      <p style={{...styles.value, fontFamily: 'monospace'}}>
                        {selectedRencontre.ticket_glpi || '-'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Cinquième section - Références */}
                {selectedRencontre.lien_reference && (
                  <div style={styles.modalSection}>
                    <h4 style={styles.sectionTitle}>🔗 Références</h4>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Lien</label>
                      <p style={{...styles.value, fontFamily: 'monospace', fontSize: '13px'}}>
                        {selectedRencontre.lien_reference}
                      </p>
                    </div>
                  </div>
                )}

                {/* Sixième section - Dates */}
                <div style={styles.modalSection}>
                  <h4 style={styles.sectionTitle}>📅 Dates</h4>
                  <div style={styles.detailGrid2}>
                    <div style={styles.detailField}>
                      <label style={styles.label}>Créée le</label>
                      <p style={{...styles.value, fontSize: '12px', color: '#6b7280'}}>
                        {selectedRencontre.created_at ? new Date(selectedRencontre.created_at).toLocaleDateString('fr-FR') : '-'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div style={styles.modalFooter}>
                <button
                  style={{ ...styles.btn, ...styles.btnDanger }}
                  onClick={() => {
                    handleDeleteRencontre(selectedRencontre.id);
                  }}
                >
                  🗑️ Supprimer
                </button>
                <button
                  style={styles.btn}
                  onClick={() => setShowDetailModal(false)}
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
        />
      </main>

      <style>{`
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f4f4f4',
  },
  mainContent: {
    padding: '40px 20px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  } as React.CSSProperties,
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    margin: 0,
    color: '#1d1d1b',
  } as React.CSSProperties,
  toolbarActions: {
    display: 'flex',
    gap: '8px',
  } as React.CSSProperties,
  toolbarBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  } as React.CSSProperties,
  filterBar: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
    flexWrap: 'wrap',
    alignItems: 'center',
  } as React.CSSProperties,
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    flex: '1',
    minWidth: '200px',
  } as React.CSSProperties,
  searchInput: {
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    width: '100%',
  } as React.CSSProperties,
  filterSelect: {
    padding: '8px 12px',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    fontSize: '14px',
    cursor: 'pointer',
  } as React.CSSProperties,
  resetBtn: {
    padding: '8px 12px',
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  tableContainer: {
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    overflow: 'auto',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  } as React.CSSProperties,
  headerRow: {
    backgroundColor: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '13px',
    fontWeight: '600',
    color: '#6b7280',
    userSelect: 'none',
  } as React.CSSProperties,
  row: {
    borderBottom: '1px solid #e5e7eb',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  td: {
    padding: '12px 16px',
    fontSize: '14px',
    color: '#1f2937',
  } as React.CSSProperties,
  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
  } as React.CSSProperties,
  iconBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'inline-flex',
    alignItems: 'center',
  } as React.CSSProperties,
  loading: {
    padding: '40px',
    textAlign: 'center',
    color: '#6b7280',
  } as React.CSSProperties,
  empty: {
    padding: '40px',
    textAlign: 'center',
    color: '#6b7280',
  } as React.CSSProperties,
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  } as React.CSSProperties,
  modal: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '90vh',
    overflow: 'auto',
  } as React.CSSProperties,
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  modalTitle: {
    fontSize: '20px',
    fontWeight: '600',
    margin: 0,
  } as React.CSSProperties,
  modalCloseBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0',
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  modalContent: {
    padding: '20px',
  } as React.CSSProperties,
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '20px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: '4px',
  } as React.CSSProperties,
  value: {
    fontSize: '14px',
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  modalFooter: {
    display: 'flex',
    gap: '12px',
    padding: '20px',
    borderTop: '1px solid #e5e7eb',
    justifyContent: 'flex-end',
  } as React.CSSProperties,
  btn: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  } as React.CSSProperties,
  btnDanger: {
    backgroundColor: '#fecaca',
    color: '#991b1b',
    border: 'none',
  } as React.CSSProperties,
  modalSection: {
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  detailGrid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
  } as React.CSSProperties,
  detailField: {
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
};

export default RencontresBudgetaires;
