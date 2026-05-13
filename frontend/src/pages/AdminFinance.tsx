import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus, Trash2, Edit2, Save, X, Database,
  Eye, ArrowRight, Columns, Table2, Layers
} from 'lucide-react';

interface Variable {
  id: number;
  rubrique_id: number;
  variable_name: string;
  expression_type: string;
  expression: string;
  display_type: string;
  display_order: number;
  created_at: string;
  join_schema?: string | null;
  join_table?: string | null;
  join_on_field?: string | null;
  join_display_field?: string | null;
}

interface Rubrique {
  id: number;
  name: string;
  pg_schema: string;
  pg_table: string;
  fiscal_year_column: string | null;
  link_target: string | null;
  link_id_column: string | null;
  sedit_id_column: string | null;
  child_rubrique_id: number | null;
  child_link_column: string | null;
  parent_link_column: string | null;
  child_rubrique: { id: number; name: string; pg_schema: string; pg_table: string; parent_link_column: string | null } | null;
  created_at: string;
  variables: Variable[];
}

interface PgColumn {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

interface PgTable {
  table_schema: string;
  table_name: string;
}

const AdminFinance: React.FC = () => {
  const { token } = useAuth();
  const [rubriques, setRubriques] = useState<Rubrique[]>([]);
  const [selectedRubriqueId, setSelectedRubriqueId] = useState<number | null>(null);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<PgTable[]>([]);
  const [columns, setColumns] = useState<PgColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{ columns: { name: string; display_type: string }[]; rows: any[]; rubrique: string; table: string } | null>(null);

  const [editingRubrique, setEditingRubrique] = useState<Rubrique | null>(null);
  const [newRubriqueName, setNewRubriqueName] = useState('');
  const [newRubriqueSchema, setNewRubriqueSchema] = useState('');
  const [newRubriqueTable, setNewRubriqueTable] = useState('');
  const [newRubriqueFYColumn, setNewRubriqueFYColumn] = useState('');
  const [newRubriqueLinkIdColumn, setNewRubriqueLinkIdColumn] = useState('');
  const [newRubriqueSeditIdColumn, setNewRubriqueSeditIdColumn] = useState('');
  const [showNewRubrique, setShowNewRubrique] = useState(false);

  const [editingVariable, setEditingVariable] = useState<Variable | null>(null);
  const [newVarName, setNewVarName] = useState('');
  const [newVarType, setNewVarType] = useState<'field' | 'expression'>('field');
  const [newVarExpr, setNewVarExpr] = useState('');
  const [newVarDisplayType, setNewVarDisplayType] = useState<string>('text');
  const [newVarJoinSchema, setNewVarJoinSchema] = useState('');
  const [newVarJoinTable, setNewVarJoinTable] = useState('');
  const [newVarJoinOnField, setNewVarJoinOnField] = useState('');
  const [newVarJoinDisplayField, setNewVarJoinDisplayField] = useState('');
  const [showNewVariable, setShowNewVariable] = useState(false);
  const [newVarExprMode, setNewVarExprMode] = useState<'concat' | 'raw'>('concat');

  const [exprFields, setExprFields] = useState<{ field: string; separator: string }[]>([
    { field: '', separator: '' }
  ]);

  const selectedRubrique = rubriques.find(r => r.id === selectedRubriqueId);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchRubriques = async () => {
    try {
      const res = await axios.get('/api/finance/field-mapping/rubriques', { headers });
      setRubriques(res.data);
      setError(null);
    } catch (err: any) {
      console.error('Erreur chargement rubriques', err);
      setError(err?.response?.data?.message || err?.message || 'Erreur lors du chargement des rubriques');
    } finally {
      setLoading(false);
    }
  };

  const fetchSchemas = async () => {
    try {
      const res = await axios.get('/api/finance/field-mapping/pg-schemas', { headers });
      setSchemas(res.data);
    } catch (err: any) {
      console.error('Erreur chargement schemas', err);
      setError(err?.response?.data?.message || err?.message || 'Erreur lors du chargement des schémas');
    }
  };

  const fetchTables = async (schema: string) => {
    try {
      const res = await axios.get('/api/finance/field-mapping/pg-tables', { params: { schema }, headers });
      setTables(res.data);
    } catch (err) {
      console.error('Erreur chargement tables', err);
    }
  };

  const fetchColumns = async (schema: string, table: string) => {
    try {
      const res = await axios.get(`/api/finance/field-mapping/pg-columns/${schema}/${table}`, { headers });
      setColumns(res.data);
    } catch (err) {
      console.error('Erreur chargement colonnes', err);
    }
  };

  useEffect(() => {
    fetchRubriques();
    fetchSchemas();
  }, [token]);

  useEffect(() => {
    if (newRubriqueSchema) {
      fetchTables(newRubriqueSchema);
    }
  }, [newRubriqueSchema]);

  useEffect(() => {
    if (editingRubrique && editingRubrique.pg_schema) {
      fetchTables(editingRubrique.pg_schema);
    }
  }, [editingRubrique?.pg_schema]);

  useEffect(() => {
    if (selectedRubrique) {
      fetchColumns(selectedRubrique.pg_schema, selectedRubrique.pg_table);
    } else {
      setColumns([]);
    }
  }, [selectedRubriqueId]);

  const createRubrique = async () => {
    if (!newRubriqueName || !newRubriqueTable) return;
    try {
      const linkTarget = newRubriqueTable.includes('commande') ? 'orders' : newRubriqueTable.includes('facture') ? 'invoices' : null;
      await axios.post('/api/finance/field-mapping/rubriques', {
        name: newRubriqueName,
        pg_schema: newRubriqueSchema || 'public',
        pg_table: newRubriqueTable,
        fiscal_year_column: newRubriqueFYColumn || null,
        link_target: linkTarget,
        link_id_column: newRubriqueLinkIdColumn || null,
        sedit_id_column: newRubriqueSeditIdColumn || null,
        child_rubrique_id: null,
        child_link_column: null,
        parent_link_column: null
      }, { headers });
      setShowNewRubrique(false);
      setNewRubriqueName('');
      setNewRubriqueTable('');
      setNewRubriqueFYColumn('');
      setNewRubriqueLinkIdColumn('');
      setNewRubriqueSeditIdColumn('');
      fetchRubriques();
    } catch (err) {
      console.error('Erreur création rubrique', err);
      alert('Erreur lors de la création de la rubrique.');
    }
  };

  const updateRubrique = async () => {
    if (!editingRubrique) return;
    try {
      const linkTarget = editingRubrique.link_target || (editingRubrique.pg_table?.includes('commande') ? 'orders' : editingRubrique.pg_table?.includes('facture') ? 'invoices' : null);
      await axios.put(`/api/finance/field-mapping/rubriques/${editingRubrique.id}`, {
        name: editingRubrique.name,
        pg_schema: editingRubrique.pg_schema,
        pg_table: editingRubrique.pg_table,
        fiscal_year_column: editingRubrique.fiscal_year_column || null,
        link_target: linkTarget,
        link_id_column: editingRubrique.link_id_column || null,
        sedit_id_column: editingRubrique.sedit_id_column || null,
        child_rubrique_id: editingRubrique.child_rubrique_id || null,
        child_link_column: editingRubrique.child_link_column || null,
        parent_link_column: editingRubrique.parent_link_column || null
      }, { headers });
      setEditingRubrique(null);
      fetchRubriques();
    } catch (err) {
      console.error('Erreur mise à jour rubrique', err);
    }
  };

  const deleteRubrique = async (id: number) => {
    if (!window.confirm('Supprimer cette rubrique et toutes ses variables ?')) return;
    try {
      await axios.delete(`/api/finance/field-mapping/rubriques/${id}`, { headers });
      if (selectedRubriqueId === id) setSelectedRubriqueId(null);
      fetchRubriques();
    } catch (err) {
      console.error('Erreur suppression rubrique', err);
    }
  };

  const createVariable = async () => {
    if (!selectedRubriqueId || !newVarName) return;
    let expression = newVarExpr;
    if (newVarType === 'expression') {
      if (newVarExprMode === 'concat') {
        const parts = exprFields.filter(f => f.field);
        if (parts.length > 0) {
          const segments: string[] = [];
          for (let i = 0; i < parts.length; i++) {
            segments.push(`"${parts[i].field}"`);
            if (i < parts.length - 1 && parts[i].separator) {
              segments.push(`'${parts[i].separator.replace(/'/g, "''")}'`);
            }
          }
          expression = segments.join(' || ');
        }
      } else {
        expression = newVarExpr;
      }
    }
    try {
      const body: any = {
        variable_name: newVarName,
        expression_type: newVarType,
        expression: expression,
        display_type: newVarDisplayType,
        display_order: 0
      };
      if (newVarDisplayType === 'jointure') {
        body.join_schema = newVarJoinSchema;
        body.join_table = newVarJoinTable;
        body.join_on_field = newVarJoinOnField;
        body.join_display_field = newVarJoinDisplayField;
      }
      await axios.post(`/api/finance/field-mapping/rubriques/${selectedRubriqueId}/variables`, body, { headers });
      setShowNewVariable(false);
      setNewVarName('');
      setNewVarExpr('');
      setNewVarJoinSchema('');
      setNewVarJoinTable('');
      setNewVarJoinOnField('');
      setNewVarJoinDisplayField('');
      setExprFields([{ field: '', separator: '' }]);
      fetchRubriques();
    } catch (err) {
      console.error('Erreur création variable', err);
      alert('Erreur lors de la création de la variable.');
    }
  };

  const updateVariable = async () => {
    if (!editingVariable) return;
    try {
      const body: any = {
        variable_name: editingVariable.variable_name,
        expression_type: editingVariable.expression_type,
        expression: editingVariable.expression,
        display_type: editingVariable.display_type,
        display_order: editingVariable.display_order
      };
      if (editingVariable.display_type === 'jointure') {
        body.join_schema = editingVariable.join_schema || null;
        body.join_table = editingVariable.join_table || null;
        body.join_on_field = editingVariable.join_on_field || null;
        body.join_display_field = editingVariable.join_display_field || null;
      }
      await axios.put(`/api/finance/field-mapping/variables/${editingVariable.id}`, body, { headers });
      setEditingVariable(null);
      fetchRubriques();
    } catch (err) {
      console.error('Erreur mise à jour variable', err);
    }
  };

  const deleteVariable = async (id: number) => {
    if (!window.confirm('Supprimer cette variable ?')) return;
    try {
      await axios.delete(`/api/finance/field-mapping/variables/${id}`, { headers });
      fetchRubriques();
    } catch (err) {
      console.error('Erreur suppression variable', err);
    }
  };

  const previewMapping = async () => {
    if (!selectedRubriqueId) return;
    try {
      const res = await axios.get(`/api/finance/field-mapping/preview/${selectedRubriqueId}`, { headers });
      setPreviewData(res.data);
    } catch (err) {
      console.error('Erreur prévisualisation', err);
      alert('Erreur lors de la prévisualisation. Vérifiez vos expressions.');
    }
  };

  const quickUpdateDisplayType = async (variableId: number, newDisplayType: string) => {
    const rub = rubriques.find(r => r.variables?.some(v => v.id === variableId));
    const variable = rub?.variables?.find(v => v.id === variableId);
    if (!variable) return;
    try {
      const body: any = {
        variable_name: variable.variable_name,
        expression_type: variable.expression_type,
        expression: variable.expression,
        display_type: newDisplayType,
        display_order: variable.display_order
      };
      if (newDisplayType === 'jointure') {
        body.join_schema = variable.join_schema || null;
        body.join_table = variable.join_table || null;
        body.join_on_field = variable.join_on_field || null;
        body.join_display_field = variable.join_display_field || null;
      }
      await axios.put(`/api/finance/field-mapping/variables/${variableId}`, body, { headers });
      fetchRubriques();
    } catch (err) {
      console.error('Erreur mise à jour affichage', err);
    }
  };

  const addExprField = () => {
    setExprFields([...exprFields, { field: '', separator: '' }]);
  };

  const removeExprField = (index: number) => {
    setExprFields(exprFields.filter((_, i) => i !== index));
  };

  const updateExprField = (index: number, key: 'field' | 'separator', value: string) => {
    const updated = [...exprFields];
    updated[index] = { ...updated[index], [key]: value };
    setExprFields(updated);
  };

  if (loading) return <div className="fm-loading">Chargement...</div>;

  return (
    <div className="fm-container">
      {error && (
        <div className="fm-error-banner">
          <strong>Erreur :</strong> {error}
          <button className="fm-error-close" onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}
      <div className="fm-header">
        <div className="fm-title">
          <Layers size={24} className="text-blue-500" />
          <h2>Mapping de Champs - Finances</h2>
        </div>
        <p className="fm-subtitle">Configurez le mapping entre les tables PostgreSQL et vos rubriques de données financières</p>
      </div>

      <div className="fm-layout">
        <div className="fm-sidebar">
          <div className="fm-sidebar-header">
            <h3>Rubriques</h3>
            <button className="btn-primary-sm" onClick={() => {
              setShowNewRubrique(true);
              setNewRubriqueSchema(schemas.length > 0 ? schemas[0] : 'public');
              setNewRubriqueTable('');
            }}>
              <Plus size={14} /> Nouvelle rubrique
            </button>
          </div>

          {showNewRubrique && (
            <div className="fm-new-rubrique">
              <input
                type="text"
                placeholder="Nom de la rubrique"
                value={newRubriqueName}
                onChange={e => setNewRubriqueName(e.target.value)}
              />
              <select value={newRubriqueSchema} onChange={e => { setNewRubriqueSchema(e.target.value); setNewRubriqueTable(''); }}>
                <option value="">-- Sélectionner un schéma ({schemas.length}) --</option>
                {schemas.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={newRubriqueTable} onChange={e => setNewRubriqueTable(e.target.value)}>
                <option value="">-- Sélectionner une table ({tables.length}) --</option>
                {tables.map(t => <option key={t.table_name} value={t.table_name}>{t.table_name}</option>)}
              </select>
              <select value={newRubriqueFYColumn} onChange={e => setNewRubriqueFYColumn(e.target.value)}>
                <option value="">-- Colonne année fiscale (optionnel) --</option>
                {columns.map(c => <option key={c.column_name} value={c.column_name}>{c.column_name}</option>)}
              </select>
              <div className="fm-new-actions">
                <button className="btn-save" onClick={createRubrique} disabled={!newRubriqueName || !newRubriqueTable}>
                  <Save size={14} /> Créer
                </button>
                <button className="btn-cancel" onClick={() => setShowNewRubrique(false)}>Annuler</button>
              </div>
            </div>
          )}

          <div className="fm-rubrique-list">
            {rubriques.map(r => (
              <div
                key={r.id}
                className={`fm-rubrique-item ${selectedRubriqueId === r.id ? 'active' : ''}`}
                onClick={() => { setSelectedRubriqueId(r.id); setPreviewData(null); }}
              >
                <div className="fm-rubrique-info">
                  <span className="fm-rubrique-name">{r.name}</span>
                  <span className="fm-rubrique-table">
                    <Table2 size={12} /> {r.pg_schema}.{r.pg_table}
                    {r.fiscal_year_column && <span className="fm-fy-badge">Filtre: {r.fiscal_year_column}</span>}
                    {r.child_rubrique && <span className="fm-child-badge">Lignes: {r.child_rubrique.name}</span>}
                  </span>
                </div>
                <div className="fm-rubrique-actions" onClick={e => e.stopPropagation()}>
                  <button className="btn-icon-sm" onClick={() => setEditingRubrique({ ...r })}>
                    <Edit2 size={13} />
                  </button>
                  <button className="btn-icon-sm text-red-500" onClick={() => deleteRubrique(r.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            {rubriques.length === 0 && (
              <div className="fm-empty">Aucune rubrique. Créez-en une pour commencer.</div>
            )}
          </div>
        </div>

        <div className="fm-main">
          {editingRubrique && (
            <div className="fm-modal-overlay" onClick={() => setEditingRubrique(null)}>
              <div className="fm-modal" onClick={e => e.stopPropagation()}>
                <h3>Modifier la rubrique</h3>
                <label>Nom</label>
                <input
                  type="text"
                  value={editingRubrique.name}
                  onChange={e => setEditingRubrique({ ...editingRubrique, name: e.target.value })}
                />
                <label>Schéma PostgreSQL</label>
                <select
                  value={editingRubrique.pg_schema}
                  onChange={e => setEditingRubrique({ ...editingRubrique, pg_schema: e.target.value })}
                >
                  {schemas.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <label>Table PostgreSQL</label>
                <select
                  value={editingRubrique.pg_table}
                  onChange={e => setEditingRubrique({ ...editingRubrique, pg_table: e.target.value })}
                >
                  <option value="">-- Sélectionner ({tables.length}) --</option>
                  {tables.map(t => <option key={t.table_name} value={t.table_name}>{t.table_name}</option>)}
                </select>
                <label>Colonne année fiscale (optionnel)</label>
                <select
                  value={editingRubrique.fiscal_year_column || ''}
                  onChange={e => setEditingRubrique({ ...editingRubrique, fiscal_year_column: e.target.value || null })}
                >
                  <option value="">-- Aucune --</option>
                  {selectedRubrique && columns.map(c => <option key={c.column_name} value={c.column_name}>{c.column_name}</option>)}
                </select>
                {(editingRubrique.pg_table?.includes('commande') || editingRubrique.pg_table?.includes('facture')) && (
                  <>
                    <label>Colonne ID lien (pour lien opération)</label>
                    <select
                      value={editingRubrique.link_id_column || ''}
                      onChange={e => setEditingRubrique({ ...editingRubrique, link_id_column: e.target.value || null })}
                    >
                      <option value="">-- Aucune --</option>
                      {selectedRubrique && columns.map(c => <option key={c.column_name} value={c.column_name}>{c.column_name}</option>)}
                    </select>
                    <label>Colonne ID SEDIT (pour bouton Sedit)</label>
                    <select
                      value={editingRubrique.sedit_id_column || ''}
                      onChange={e => setEditingRubrique({ ...editingRubrique, sedit_id_column: e.target.value || null })}
                    >
                      <option value="">-- Aucune --</option>
                      {selectedRubrique && columns.map(c => <option key={c.column_name} value={c.column_name}>{c.column_name}</option>)}
                    </select>
                    <label>Rubrique enfant (lignes déroulantes)</label>
                    <select
                      value={editingRubrique.child_rubrique_id || ''}
                      onChange={e => setEditingRubrique({ ...editingRubrique, child_rubrique_id: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">-- Aucune --</option>
                      {rubriques.filter(r => r.id !== editingRubrique.id).map(r => (
                        <option key={r.id} value={r.id}>{r.name} ({r.pg_schema}.{r.pg_table})</option>
                      ))}
                    </select>
                    <label>Colonne de liaison parent</label>
                    <select
                      value={editingRubrique.child_link_column || ''}
                      onChange={e => setEditingRubrique({ ...editingRubrique, child_link_column: e.target.value || null })}
                    >
                      <option value="">-- Aucune --</option>
                      {selectedRubrique && columns.map(c => <option key={c.column_name} value={c.column_name}>{c.column_name}</option>)}
                    </select>
                  </>
                )}
                {editingRubrique.child_rubrique_id && (
                  <label>Colonne de liaison enfant (dans {rubriques.find(r => r.id === editingRubrique.child_rubrique_id)?.name || 'enfant'})</label>
                )}
                {editingRubrique.parent_link_column != null && (
                  <select
                    value={editingRubrique.parent_link_column || ''}
                    onChange={e => setEditingRubrique({ ...editingRubrique, parent_link_column: e.target.value || null })}
                  >
                    <option value="">-- Aucune --</option>
                    {columns.map(c => <option key={c.column_name} value={c.column_name}>{c.column_name}</option>)}
                  </select>
                )}
                <div className="fm-modal-actions">
                  <button className="btn-save" onClick={updateRubrique}>
                    <Save size={14} /> Enregistrer
                  </button>
                  <button className="btn-cancel" onClick={() => setEditingRubrique(null)}>Annuler</button>
                </div>
              </div>
            </div>
          )}

          {selectedRubrique ? (
            <>
              <div className="fm-detail-header">
                <div>
                  <h3>{selectedRubrique.name}</h3>
                  <span className="fm-table-badge">
                    <Database size={14} /> {selectedRubrique.pg_schema}.{selectedRubrique.pg_table}
                  </span>
                </div>
                <div className="fm-detail-actions">
                  <button className="btn-primary-sm" onClick={previewMapping}>
                    <Eye size={14} /> Prévisualiser
                  </button>
                  <button className="btn-secondary-sm" onClick={() => setShowNewVariable(true)}>
                    <Plus size={14} /> Ajouter une variable
                  </button>
                </div>
              </div>

              <div className="fm-columns-info">
                <Columns size={14} />
                <span>{columns.length} colonnes disponibles dans {selectedRubrique.pg_schema}.{selectedRubrique.pg_table}</span>
              </div>

              {showNewVariable && (
                <div className="fm-new-variable">
                  <h4>Nouvelle variable</h4>
                  <div className="fm-form-row">
                    <div className="fm-form-group">
                      <label>Nom de la variable</label>
                      <input
                        type="text"
                        placeholder="ex: numero_commande"
                        value={newVarName}
                        onChange={e => setNewVarName(e.target.value)}
                      />
                    </div>
                    <div className="fm-form-group">
                      <label>Type</label>
                      <select value={newVarType} onChange={e => setNewVarType(e.target.value as 'field' | 'expression')}>
                        <option value="field">Champ simple</option>
                        <option value="expression">Expression (concaténation...)</option>
                      </select>
                    </div>
                    <div className="fm-form-group">
                      <label>Affichage</label>
                      <select value={newVarDisplayType} onChange={e => { setNewVarDisplayType(e.target.value); if (e.target.value !== 'jointure') { setNewVarJoinSchema(''); setNewVarJoinTable(''); setNewVarJoinOnField(''); setNewVarJoinDisplayField(''); }}}>
<option value="text">Texte</option>
                              <option value="number">Nombre</option>
                              <option value="integer">Entier</option>
                              <option value="currency">Monétaire</option>
                              <option value="date">Date (JJ/MM/AAAA)</option>
                              <option value="text_date">Date texte (JJ/MM/AAAA)</option>
                              <option value="text_timestamp">Date+Heure texte (JJ/MM/AAAA HH:MM)</option>
                              <option value="timestamp">Date + Heure</option>
                              <option value="boolean">Booléen (Oui/Non)</option>
                              <option value="jointure">Jointure</option>
                      </select>
                    </div>
                  </div>

                  {newVarDisplayType === 'jointure' && (
                    <div className="fm-form-row" style={{ marginTop: '8px', gap: '8px' }}>
                      <div className="fm-form-group" style={{ flex: 1 }}>
                        <label>Schéma table jointe</label>
                        <input type="text" placeholder="oracle" value={newVarJoinSchema}
                          onChange={e => setNewVarJoinSchema(e.target.value)} className="fm-expr-input" />
                      </div>
                      <div className="fm-form-group" style={{ flex: 1 }}>
                        <label>Table jointe</label>
                        <input type="text" placeholder="gf_oracle_tiers" value={newVarJoinTable}
                          onChange={e => setNewVarJoinTable(e.target.value)} className="fm-expr-input" />
                      </div>
                      <div className="fm-form-group" style={{ flex: 1 }}>
                        <label>Champ lié (dans table jointe)</label>
                        <input type="text" placeholder="TIERS_TIERS" value={newVarJoinOnField}
                          onChange={e => setNewVarJoinOnField(e.target.value)} className="fm-expr-input" />
                      </div>
                      <div className="fm-form-group" style={{ flex: 1 }}>
                        <label>Champ à afficher</label>
                        <input type="text" placeholder="TIERS_LIBELLE" value={newVarJoinDisplayField}
                          onChange={e => setNewVarJoinDisplayField(e.target.value)} className="fm-expr-input" />
                      </div>
                    </div>
                  )}

                  {newVarType === 'field' && (
                    <div className="fm-form-group">
                      <label>Champ de la table</label>
                      <select value={newVarExpr} onChange={e => {
                        setNewVarExpr(e.target.value);
                        const col = columns.find(c => c.column_name === e.target.value);
                        if (col) {
                          const dt = col.data_type.toLowerCase();
                          const colName = col.column_name.toLowerCase();
                          const looksLikeDate = colName.includes('date') || colName.includes('dat');
                          if (dt.includes('timestamp')) setNewVarDisplayType('timestamp');
                          else if (dt === 'date') setNewVarDisplayType('date');
                          else if (dt === 'boolean') setNewVarDisplayType('boolean');
                          else if (colName.includes('montant') || colName.includes('prix') || colName.includes('total') || colName.includes('taux') || colName.includes('mont')) setNewVarDisplayType('currency');
                          else if (dt.includes('int') || dt === 'smallint' || dt === 'bigint' || dt === 'integer') setNewVarDisplayType('integer');
                          else if (dt.includes('numeric') || dt.includes('decimal') || dt.includes('double') || dt.includes('real') || dt.includes('float')) setNewVarDisplayType('number');
                          else if (looksLikeDate && (dt === 'text' || dt.includes('char') || dt.includes('varying'))) setNewVarDisplayType('text_date');
                        }
                      }}>
                        <option value="">-- Sélectionner un champ --</option>
                        {columns.map(c => (
                          <option key={c.column_name} value={c.column_name}>
                            {c.column_name} ({c.data_type})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {newVarType === 'expression' && (
                    <div className="fm-expression-builder">
                      <label>Type d'expression</label>
                      <div className="fm-expr-mode-toggle">
                        <button
                          className={`fm-expr-mode-btn ${newVarExprMode === 'concat' ? 'active' : ''}`}
                          onClick={() => setNewVarExprMode('concat')}
                        >
                          Concaténation
                        </button>
                        <button
                          className={`fm-expr-mode-btn ${newVarExprMode === 'raw' ? 'active' : ''}`}
                          onClick={() => setNewVarExprMode('raw')}
                        >
                          SQL libre (+, *, etc.)
                        </button>
                      </div>

                      {newVarExprMode === 'concat' ? (
                        <>
                          <label>Concaténation de champs</label>
                          <div className="fm-expression-info">
                            Construisez votre expression en ajoutant des champs et des séparateurs.
                            Par exemple : CHAMP_A + "-" + CHAMP_B donnera "toto-titi"
                          </div>
                          {exprFields.map((f, i) => (
                            <div key={i} className="fm-expr-row">
                              <span className="fm-expr-num">{i + 1}</span>
                              <select value={f.field} onChange={e => updateExprField(i, 'field', e.target.value)}>
                                <option value="">-- Champ --</option>
                                {columns.map(c => (
                                  <option key={c.column_name} value={c.column_name}>
                                    {c.column_name}
                                  </option>
                                ))}
                              </select>
                              {i < exprFields.length - 1 && (
                                <input
                                  type="text"
                                  placeholder="Séparateur (ex: '-', '_', ' ')"
                                  value={f.separator}
                                  onChange={e => updateExprField(i, 'separator', e.target.value)}
                                  className="fm-separator-input"
                                />
                              )}
                              {exprFields.length > 1 && (
                                <button className="btn-remove-sm" onClick={() => removeExprField(i)}>
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                          <button className="btn-add-field" onClick={addExprField}>
                            <Plus size={14} /> Ajouter un champ
                          </button>
                          {exprFields.filter(f => f.field).length > 0 && (
                            <div className="fm-preview-expr">
                              <ArrowRight size={14} />
                              <code>
                                {exprFields.filter(f => f.field).map((f, i, arr) => {
                                  let part = `"${f.field}"`;
                                  if (f.separator) {
                                    part += ` || '${f.separator.replace(/'/g, "''")}'`;
                                  }
                                  if (i < arr.length - 1) {
                                    part += ' || ';
                                  }
                                  return part;
                                }).join('')}
                              </code>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="fm-form-group">
                          <label>Expression SQL libre</label>
                          <div className="fm-expression-info">
                            Saisissez une expression SQL utilisant les champs de la table.
                            Exemples : <code>"MONTANT_HT" * 1.2</code> ou <code>"QTE" * "PRIX" + "FRAIS"</code>
                          </div>
                          <textarea
                            value={newVarExpr}
                            onChange={e => setNewVarExpr(e.target.value)}
                            placeholder='ex: "CMDLIGNE_QUANTITE" * "CMDLIGNE_PRIXE" - COALESCE("CMDLIGNE_REMISE", 0)'
                            className="fm-expr-textarea"
                            rows={3}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="fm-form-actions">
                    <button className="btn-save" onClick={createVariable} disabled={!newVarName || (!newVarExpr && newVarType === 'field')}>
                      <Save size={14} /> Ajouter
                    </button>
                    <button className="btn-cancel" onClick={() => {
      setShowNewVariable(false);
      setNewVarName('');
      setNewVarType('field');
      setNewVarDisplayType('text');
      setNewVarExpr('');
      setNewVarExprMode('concat');
      setExprFields([{ field: '', separator: '' }]);
                    }}>Annuler</button>
                  </div>
                </div>
              )}

              <div className="fm-table-card">
                <table className="fm-variables-table">
                  <thead>
                    <tr>
                      <th>Nom_variable</th>
                      <th>Type</th>
                      <th>Affichage</th>
                      <th>Expression</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRubrique.variables && selectedRubrique.variables.map(v => (
                      editingVariable && editingVariable.id === v.id ? (
                        <tr key={v.id} className="edit-row">
                          <td>
                            <input
                              type="text"
                              value={editingVariable.variable_name}
                              onChange={e => setEditingVariable({ ...editingVariable, variable_name: e.target.value })}
                            />
                          </td>
                          <td>
                            <select
                              value={editingVariable.expression_type}
                              onChange={e => setEditingVariable({ ...editingVariable, expression_type: e.target.value })}
                            >
                              <option value="field">Champ</option>
                              <option value="expression">Expression</option>
                            </select>
                          </td>
                          <td>
                            <select
                              value={editingVariable.display_type || 'text'}
                              onChange={e => setEditingVariable({ ...editingVariable, display_type: e.target.value })}
                            >
                              <option value="text">Texte</option>
                              <option value="number">Nombre</option>
                              <option value="integer">Entier</option>
                              <option value="currency">Monétaire</option>
                              <option value="date">Date (JJ/MM/AAAA)</option>
                              <option value="text_date">Date texte (JJ/MM/AAAA)</option>
                              <option value="timestamp">Date + Heure</option>
                              <option value="boolean">Booléen</option>
                              <option value="jointure">Jointure</option>
                            </select>
                          </td>
                          <td>
                            {editingVariable.display_type === 'jointure' ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                                <input type="text" placeholder="Schéma (ex: oracle)" value={editingVariable.join_schema || ''}
                                  onChange={e => setEditingVariable({ ...editingVariable, join_schema: e.target.value })} className="fm-expr-input" style={{ width: '100%' }} />
                                <input type="text" placeholder="Table jointe (ex: gf_oracle_tiers)" value={editingVariable.join_table || ''}
                                  onChange={e => setEditingVariable({ ...editingVariable, join_table: e.target.value })} className="fm-expr-input" style={{ width: '100%' }} />
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <input type="text" placeholder="Champ lié (ex: TIERS_TIERS)" value={editingVariable.join_on_field || ''}
                                    onChange={e => setEditingVariable({ ...editingVariable, join_on_field: e.target.value })} className="fm-expr-input" style={{ flex: 1 }} />
                                  <span style={{ alignSelf: 'center', color: '#94a3b8' }}>→</span>
                                  <input type="text" placeholder="Champ affiché (ex: TIERS_LIBELLE)" value={editingVariable.join_display_field || ''}
                                    onChange={e => setEditingVariable({ ...editingVariable, join_display_field: e.target.value })} className="fm-expr-input" style={{ flex: 1 }} />
                                </div>
                              </div>
                            ) : (
                              <input
                                type="text"
                                value={editingVariable.expression}
                                onChange={e => setEditingVariable({ ...editingVariable, expression: e.target.value })}
                                className="fm-expr-input"
                              />
                            )}
                          </td>
                          <td className="actions-cell">
                            <button className="btn-save-sm" onClick={updateVariable}><Save size={14} /></button>
                            <button className="btn-icon-sm" onClick={() => setEditingVariable(null)}><X size={14} /></button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={v.id}>
                          <td className="font-semibold">{v.variable_name}</td>
                          <td>
                            <span className={`fm-badge ${v.expression_type === 'expression' ? 'expression' : 'field'}`}>
                              {v.expression_type === 'field' ? 'Champ' : 'Expression'}
                            </span>
                          </td>
                          <td>
                            <select
                              className="fm-inline-select"
                              value={v.display_type || 'text'}
                              onChange={e => quickUpdateDisplayType(v.id, e.target.value)}
                              disabled={!!editingVariable}
                            >
                              <option value="text">Texte</option>
                              <option value="number">Nombre</option>
                              <option value="integer">Entier</option>
                              <option value="currency">Monétaire</option>
                              <option value="date">Date (JJ/MM/AAAA)</option>
                              <option value="text_date">Date texte (JJ/MM/AAAA)</option>
                              <option value="timestamp">Date + Heure</option>
                              <option value="boolean">Booléen</option>
                              <option value="jointure">Jointure</option>
                            </select>
                          </td>
                          <td className="font-mono text-sm">
                            {v.display_type === 'jointure' && v.join_table ? (
                              <span title={`${v.join_schema || 'public'}.${v.join_table} ON ${v.join_on_field} → ${v.join_display_field}`}>
                                🔗 {v.join_table}.{v.join_display_field}
                              </span>
                            ) : (
                              v.expression
                            )}
                          </td>
                          <td className="actions-cell">
                            <button className="btn-icon-sm" onClick={() => setEditingVariable({ ...v })}
                              disabled={!!editingVariable}>
                              <Edit2 size={13} />
                            </button>
                            <button className="btn-icon-sm text-red-500" onClick={() => deleteVariable(v.id)}
                              disabled={!!editingVariable}>
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      )
                    ))}
                    {(!selectedRubrique.variables || selectedRubrique.variables.length === 0) && !showNewVariable && (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-gray-500">
                          Aucune variable définie. Ajoutez-en pour configurer le mapping.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {previewData && (
                <div className="fm-preview-card">
                  <div className="fm-preview-header">
                    <h4>Prévisualisation : {previewData.rubrique}</h4>
                    <span className="fm-preview-table">{previewData.table}</span>
                    <button className="btn-icon-sm" onClick={() => setPreviewData(null)}><X size={14} /></button>
                  </div>
                  <div className="fm-preview-scroll">
                    <table className="fm-preview-table">
                      <thead>
                        <tr>
                          {previewData.columns.map(col => <th key={col.name}>
                            {col.name}
{col.display_type !== 'text' && (
                            <span className="fm-type-hint">({{ number: 'Nb', integer: 'Int', currency: '€', date: 'Date', text_date: 'DateTxt', text_timestamp: 'DateTimeTxt', timestamp: 'Date+Heure', boolean: 'Bool' }[col.display_type] || col.display_type})</span>
                            )}
                          </th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.rows.map((row: any, i: number) => (
                          <tr key={i}>
                            {previewData.columns.map(col => <td key={col.name}>{row[col.name] !== null && row[col.name] !== undefined ? String(row[col.name]) : ''}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {previewData.rows.length === 0 && (
                    <div className="fm-preview-empty">Aucune donnée trouvée pour cette requête.</div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="fm-empty-main">
              <Layers size={48} className="text-gray-300" />
              <h3>Mapping de Champs</h3>
              <p>Sélectionnez ou créez une rubrique pour configurer le mapping de champs.</p>
              <p className="text-sm text-gray-400">
                Associez une table PostgreSQL à une rubrique, puis définissez des variables
                qui correspondent à des champs simples ou des expressions concatenées.
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .fm-container { max-width: 1400px; margin: 0 auto; }
        .fm-loading { padding: 40px; text-align: center; color: #64748b; }
        .fm-error-banner {
          background: #fef2f2;
          border: 1px solid #fca5a5;
          color: #991b1b;
          padding: 10px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
        }
        .fm-error-close {
          margin-left: auto;
          background: none;
          border: none;
          cursor: pointer;
          color: #991b1b;
          padding: 2px;
        }

        .fm-header { margin-bottom: 24px; }
        .fm-title { display: flex; align-items: center; gap: 12px; }
        .fm-title h2 { margin: 0; color: #1e293b; font-size: 1.25rem; }
        .fm-subtitle { margin: 6px 0 0; color: #64748b; font-size: 0.875rem; }

        .fm-layout { display: flex; gap: 24px; min-height: 500px; }

        .fm-sidebar {
          width: 280px;
          flex-shrink: 0;
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          border: 1px solid #e2e8f0;
          overflow: hidden;
        }
        .fm-sidebar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .fm-sidebar-header h3 { margin: 0; font-size: 0.95rem; color: #1e293b; }

        .fm-main {
          flex: 1;
          min-width: 0;
        }

        .fm-new-rubrique {
          padding: 12px 16px;
          border-bottom: 1px solid #e2e8f0;
          background: #f0f7ff;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .fm-new-rubrique input,
        .fm-new-rubrique select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.85rem;
          outline: none;
          background: white;
        }
        .fm-new-rubrique input:focus,
        .fm-new-rubrique select:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59,130,246,0.1);
        }
        .fm-new-actions { display: flex; gap: 8px; }

        .fm-rubrique-list { max-height: 400px; overflow-y: auto; }

        .fm-rubrique-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          cursor: pointer;
          transition: background 0.15s;
          border-bottom: 1px solid #f1f5f9;
        }
        .fm-rubrique-item:hover { background: #f8fafc; }
        .fm-rubrique-item.active { background: #eff6ff; border-left: 3px solid #3b82f6; }

        .fm-rubrique-info { display: flex; flex-direction: column; gap: 2px; }
        .fm-rubrique-name { font-weight: 600; font-size: 0.9rem; color: #1e293b; }
        .fm-rubrique-table {
          font-size: 0.75rem;
          color: #94a3b8;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .fm-fy-badge {
          background: #fef3c7;
          color: #92400e;
          font-size: 0.65rem;
          padding: 1px 6px;
          border-radius: 10px;
          margin-left: 4px;
          font-weight: 600;
        }
        .fm-child-badge {
          background: #dbeafe;
          color: #1e40af;
          font-size: 0.65rem;
          padding: 1px 6px;
          border-radius: 10px;
          margin-left: 4px;
          font-weight: 600;
        }
        .fm-rubrique-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s; }
        .fm-rubrique-item:hover .fm-rubrique-actions,
        .fm-rubrique-item.active .fm-rubrique-actions { opacity: 1; }

        .fm-empty { padding: 24px; text-align: center; color: #94a3b8; font-size: 0.85rem; }
        .fm-empty-main {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 40px;
          text-align: center;
          background: white;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }
        .fm-empty-main h3 { margin: 16px 0 8px; color: #1e293b; }
        .fm-empty-main p { color: #94a3b8; margin: 0; line-height: 1.6; }

        .fm-detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .fm-detail-header h3 { margin: 0; color: #1e293b; }
        .fm-detail-actions { display: flex; gap: 8px; }
        .fm-table-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #f0f7ff;
          color: #3b82f6;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 600;
          margin-top: 4px;
        }

        .fm-columns-info {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8rem;
          color: #64748b;
          margin-bottom: 16px;
          padding: 8px 12px;
          background: #f8fafc;
          border-radius: 8px;
        }

        .fm-new-variable {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 16px;
        }
        .fm-new-variable h4 { margin: 0 0 16px; color: #1e293b; }
        .fm-form-row { display: flex; gap: 16px; }
        .fm-form-group { flex: 1; margin-bottom: 12px; }
        .fm-form-group label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: #64748b;
          margin-bottom: 4px;
          text-transform: uppercase;
        }
        .fm-form-group input,
        .fm-form-group select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.85rem;
          outline: none;
        }
        .fm-form-group input:focus,
        .fm-form-group select:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59,130,246,0.1);
        }
        .fm-form-actions { display: flex; gap: 8px; margin-top: 8px; }

        .fm-expression-builder {
          background: #fafbfc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
        }
        .fm-expression-builder > label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: #64748b;
          margin-bottom: 8px;
          text-transform: uppercase;
        }
        .fm-expression-info {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 6px;
          padding: 8px 12px;
          font-size: 0.8rem;
          color: #92400e;
          margin-bottom: 12px;
        }
        .fm-expr-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .fm-expr-num {
          width: 24px;
          height: 24px;
          background: #3b82f6;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          font-weight: 700;
          flex-shrink: 0;
        }
        .fm-expr-row select,
        .fm-separator-input {
          padding: 6px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.85rem;
          outline: none;
          background: white;
        }
        .fm-expr-row select { flex: 1; }
        .fm-separator-input { width: 180px; }
        .btn-remove-sm {
          background: none;
          border: 1px solid #fca5a5;
          color: #ef4444;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .btn-remove-sm:hover { background: #fef2f2; }
        .btn-add-field {
          background: none;
          border: 1px dashed #cbd5e1;
          color: #3b82f6;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.85rem;
          margin-top: 4px;
        }
        .btn-add-field:hover { border-color: #3b82f6; background: #f0f7ff; }
        .fm-preview-expr {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          padding: 8px 12px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 6px;
          font-size: 0.85rem;
        }
        .fm-preview-expr code {
          color: #166534;
          font-family: 'Courier New', monospace;
        }
        .fm-expr-mode-toggle {
          display: flex;
          gap: 4px;
          margin-bottom: 12px;
          background: #f1f5f9;
          border-radius: 8px;
          padding: 3px;
        }
        .fm-expr-mode-btn {
          flex: 1;
          padding: 6px 12px;
          border: none;
          border-radius: 6px;
          font-size: 0.8rem;
          cursor: pointer;
          background: transparent;
          color: #64748b;
          font-weight: 500;
          transition: all 0.15s;
        }
        .fm-expr-mode-btn.active {
          background: white;
          color: #1e293b;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          font-weight: 600;
        }
        .fm-expr-textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.85rem;
          font-family: 'Courier New', monospace;
          outline: none;
          resize: vertical;
        }
        .fm-expr-textarea:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59,130,246,0.1);
        }

        .fm-table-card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          overflow: hidden;
          border: 1px solid #e2e8f0;
        }
        .fm-variables-table { width: 100%; border-collapse: collapse; }
        .fm-variables-table th {
          background: #f8fafc;
          padding: 12px 16px;
          text-align: left;
          font-size: 0.8rem;
          text-transform: uppercase;
          color: #64748b;
          border-bottom: 1px solid #e2e8f0;
          font-weight: 700;
        }
        .fm-variables-table td {
          padding: 10px 16px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 0.85rem;
        }
        .fm-variables-table .edit-row td { background: #f8fafc; }
        .fm-variables-table .edit-row input,
        .fm-variables-table .edit-row select {
          width: 100%;
          padding: 6px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.85rem;
        }
        .fm-variables-table .edit-row input:focus,
        .fm-variables-table .edit-row select:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59,130,246,0.1);
        }
        .fm-expr-input { font-family: 'Courier New', monospace; }

        .fm-badge {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .fm-badge.field { background: #dbeafe; color: #1d4ed8; }
        .fm-badge.expression { background: #fef3c7; color: #92400e; }
        .fm-badge.display-type { background: #e0e7ff; color: #4338ca; }
        .fm-type-hint { font-size: 0.7rem; color: #94a3b8; margin-left: 4px; font-weight: 400; }

        .fm-inline-select {
          appearance: none;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 2px 20px 2px 8px;
          font-size: 0.78rem;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 4px center;
          transition: all 0.15s;
        }
        .fm-inline-select:hover { border-color: #3b82f6; background-color: #eff6ff; }
        .fm-inline-select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }
        .fm-inline-select:disabled { opacity: 0.4; cursor: not-allowed; }

        .actions-cell {
          text-align: right;
          display: flex;
          justify-content: flex-end;
          gap: 4px;
        }

        .fm-preview-card {
          margin-top: 20px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          border: 1px solid #e2e8f0;
          overflow: hidden;
        }
        .fm-preview-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }
        .fm-preview-header h4 { margin: 0; }
        .fm-preview-table { color: #64748b; font-size: 0.8rem; }
        .fm-preview-scroll { overflow-x: auto; }
        .fm-preview-table { width: 100%; border-collapse: collapse; }
        .fm-preview-table th {
          background: #f1f5f9;
          padding: 8px 12px;
          text-align: left;
          font-size: 0.75rem;
          text-transform: uppercase;
          color: #475569;
          white-space: nowrap;
        }
        .fm-preview-table td {
          padding: 8px 12px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 0.85rem;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .fm-preview-empty { padding: 24px; text-align: center; color: #94a3b8; }

        .fm-modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .fm-modal {
          background: white;
          border-radius: 16px;
          padding: 24px;
          width: 480px;
          max-width: 90vw;
          box-shadow: 0 25px 50px rgba(0,0,0,0.25);
        }
        .fm-modal h3 { margin: 0 0 20px; color: #1e293b; }
        .fm-modal label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: #64748b;
          margin: 12px 0 4px;
          text-transform: uppercase;
        }
        .fm-modal input,
        .fm-modal select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.85rem;
          outline: none;
        }
        .fm-modal input:focus,
        .fm-modal select:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59,130,246,0.1);
        }
        .fm-modal-actions { display: flex; gap: 8px; margin-top: 20px; }

        .btn-primary {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-weight: 600;
          transition: background 0.2s;
        }
        .btn-primary:hover:not(:disabled) { background: #2563eb; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-primary-sm {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 6px 14px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 600;
          transition: background 0.2s;
        }
        .btn-primary-sm:hover { background: #2563eb; }

        .btn-secondary-sm {
          background: white;
          color: #3b82f6;
          border: 1px solid #3b82f6;
          padding: 6px 14px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 600;
          transition: all 0.2s;
        }
        .btn-secondary-sm:hover { background: #eff6ff; }

        .btn-save {
          background: #22c55e;
          color: white;
          border: none;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.85rem;
          font-weight: 600;
        }
        .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-save:hover:not(:disabled) { background: #16a34a; }

        .btn-save-sm {
          background: #22c55e;
          color: white;
          border: none;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
        }

        .btn-cancel {
          background: white;
          border: 1px solid #cbd5e1;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
        }
        .btn-cancel:hover { background: #f8fafc; }

        .btn-icon-sm {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          color: #64748b;
        }
        .btn-icon-sm:hover { background: #f1f5f9; }
        .btn-icon-sm:disabled { opacity: 0.3; cursor: not-allowed; }

        .text-right { text-align: right; }
        .font-semibold { font-weight: 600; }
        .font-mono { font-family: 'Courier New', monospace; }
        .text-sm { font-size: 0.85rem; }
        .text-gray-400 { color: #94a3b8; }
        .text-gray-500 { color: #64748b; }
        .text-blue-500 { color: #3b82f6; }
        .text-red-500 { color: #ef4444; }
        .text-center { text-align: center; }
      `}</style>
    </div>
  );
};

export default AdminFinance;