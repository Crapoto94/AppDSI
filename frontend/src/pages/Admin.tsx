import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, X, UserPlus, Users, Edit2, Edit3, 
  ChevronUp, ChevronDown, 
  Loader2, Search, ShieldCheck, Radio, Save,
  CheckCircle2, Activity, Database, Euro,
  ShieldAlert, Box, LayoutGrid,
  Globe, Key, Fingerprint, Check, AlertTriangle, BarChart3,
  Zap, History as HistoryIcon, Hash, Lock, Download, MessageSquare,
  Clock, Play
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

interface TileLink {
  id: number;
  tile_id: number;
  label: string;
  url: string;
  is_internal: number;
}

interface TileData {
  id: number;
  title: string;
  icon: string;
  description: string;
  links: TileLink[];
  status: 'active' | 'maintenance' | 'soon';
  sort_order: number;
}

interface UserData {
  id: number;
  username: string;
  role: string;
  is_approved: number;
  last_activity: string | null;
  service_code: string | null;
  service_complement: string | null;
  authorized_tiles?: number[];
}

interface AdminProps {
  section?: 'main' | 'tiles' | 'users' | 'ad' | 'azure-ad' | 'glpi' | 'oracle' | 'mariadb';
}

const Admin: React.FC<AdminProps> = ({ section = 'main' }) => {
  const { token } = useAuth();
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [newTile, setNewTile] = useState({ title: '', icon: 'Box', description: '', status: 'active' as any });
  const [editingTile, setEditingTile] = useState<TileData | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user', service_code: '', service_complement: '' });
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [adConfig, setAdConfig] = useState({ 
    is_enabled: false,
    host: '10.103.130.118', 
    port: 389,
    base_dn: 'DC=ivry,DC=local',
    required_group: 'gantto',
    bind_dn: 'CN=testo,OU=IRS,OU=IVRY,DC=ivry,DC=local',
    bind_password: ''
  });
  const [azureConfig, setAzureConfig] = useState({
    is_enabled: false,
    tenant_id: '',
    client_id: '',
    client_secret: '',
    redirect_uri: window.location.origin + '/api/auth/azure/callback'
  });
  const [testUser, setTestUser] = useState({ username: '' });
  const [azureTestUser, setAzureTestUser] = useState({ username: '' });
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
  const [azureTestResult, setAzureTestResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [glpiConfig, setGlpiConfig] = useState({
    url: '',
    app_token: '',
    user_token: '',
    login: '',
    password: '',
    is_enabled: false
  });
  const [glpiTestResult, setGlpiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [ticketsCount, setTicketsCount] = useState<number | null>(null);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isSyncingRecent, setIsSyncingRecent] = useState(false);
  const [isSyncingObservers, setIsSyncingObservers] = useState(false);
  const [isSyncingFollowups, setIsSyncingFollowups] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ active: false, processed: 0, total: 0 });
  const [observersSyncStatus, setObserversSyncStatus] = useState({ active: false, processed: 0, total: 0 });
  const [followupsSyncStatus, setFollowupsSyncStatus] = useState({ active: false, processed: 0, total: 0 });
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [syncLogsPage, setSyncLogsPage] = useState(1);
  const syncLogsPerPage = 10;
  const [syncLogFilters, setSyncLogFilters] = useState({ type: '', status: '', dateFrom: '', dateTo: '' });
  const [scheduledSyncs, setScheduledSyncs] = useState<any[]>([]);
  const [showScheduledModal, setShowScheduledModal] = useState(false);
  const [editingScheduledSync, setEditingScheduledSync] = useState<any>(null);
  const [newScheduledSync, setNewScheduledSync] = useState({
    sync_type: 'tickets',
    sync_mode: 'recent',
    frequency_type: 'minutes',
    frequency_value: 30,
    execution_time: '00:00',
    is_enabled: true
  });
  
  const [oracleConfigs, setOracleConfigs] = useState<any[]>([
    { type: 'FINANCES', host: '', port: 1521, service_name: '', username: '', password: '', is_enabled: 0 },
    { type: 'RH', host: '', port: 1521, service_name: '', username: '', password: '', is_enabled: 0 }
  ]);
  const [mariadbConfigs, setMariadbConfigs] = useState<any[]>([
    { type: 'MAIN', host: '', port: 3306, user: '', password: '', database: '', is_enabled: 0 }
  ]);
  const [oracleTestResults, setOracleTestResults] = useState<Record<string, { success: boolean, message: string, details?: string[] }>>({});
  const [isTestingOracle, setIsTestingOracle] = useState<Record<string, boolean>>({});
  const [selectedTables, setSelectedTables] = useState<Record<string, string[]>>({});
  const [tableFilters, setTableFilters] = useState<Record<string, Record<string, string>>>({});
  const [tableSearch, setTableSearch] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState<Record<string, boolean>>({});
  const [importReports, setImportReports] = useState<Record<string, any[]>>({});
  const [tableColumns, setTableColumns] = useState<Record<string, string[]>>({});
  const [substitutions, setSubstitutions] = useState<Record<string, Record<string, any>>>({});
  const [activeSubstModal, setActiveSubstModal] = useState<{type: string, table: string} | null>(null);
  const [activeSelectionModal, setActiveSelectionModal] = useState<{type: string, table: string} | null>(null);
  const [activeFieldConfig, setActiveFieldConfig] = useState<string | null>(null);
  const [allOracleTables, setAllOracleTables] = useState<Record<string, string[]>>({});
  // loadingCols intentionally unused; kept for future use
  const [searchTableRef, setSearchTableRef] = useState('');
  const [tablePreviews, setTablePreviews] = useState<Record<string, any>>({});
  const [selectedFields, setSelectedFields] = useState<Record<string, string[]>>({});
  const [primaryKeys, setPrimaryKeys] = useState<Record<string, string>>({});
  const [dateFields, setDateFields] = useState<Record<string, string[]>>({});
  const [joinPreviewResult, setJoinPreviewResult] = useState<string | null>(null);

  const toggleDateField = (type: string, table: string, field: string) => {
    const key = `${type}:${table}`;
    const current = dateFields[key] || [];
    const updated = current.includes(field) 
      ? (current as string[]).filter(f => f !== field)
      : [...current, field];
    setDateFields({ ...dateFields, [key]: updated });
  };

  useEffect(() => {
    if (activeSelectionModal && activeFieldConfig) {
      const type = activeSelectionModal.type;
      const table = activeSelectionModal.table;
      const subst = substitutions[type]?.[table]?.[activeFieldConfig];
      const previewVal = tablePreviews[`${type}:${table}`]?.[activeFieldConfig];
      
      if (subst && subst.secondaryTable && subst.joinField && subst.labelField) {
        fetchJoinPreview(type, subst, previewVal);
      } else {
        setJoinPreviewResult(null);
      }
    }
  }, [activeFieldConfig, substitutions, activeSelectionModal, tablePreviews]);

  const fetchJoinPreview = async (type: string, subst: any, searchValue: any) => {
    if (!subst.secondaryTable || !subst.joinField || !subst.labelField || searchValue === null || searchValue === undefined) {
      setJoinPreviewResult(null);
      return;
    }
    try {
      const res = await axios.post('/api/oracle/test-join', {
        type,
        secondaryTable: subst.secondaryTable,
        joinField: subst.joinField,
        labelField: subst.labelField,
        searchValue
      }, { headers: { Authorization: `Bearer ${token}` } });
      setJoinPreviewResult(res.data.result || "XXXXX");
    } catch (e) {
      setJoinPreviewResult("ERREUR");
    }
  };

  const fetchTableColumns = async (type: string, tableName: string) => {
    try {
      const res = await axios.post('/api/oracle/table-columns', { type, tableName }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTableColumns(prev => ({ ...prev, [`${type}:${tableName}`]: res.data.columns }));
    } catch (error) {
      console.error('Erreur colonnes:', error);
    }
  };

  const fetchTablePreview = async (type: string, tableName: string) => {
    try {
      const res = await axios.post('/api/oracle/table-preview', { type, tableName }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTablePreviews(prev => ({ ...prev, [`${type}:${tableName}`]: res.data.preview }));
    } catch (error) {
      console.error('Erreur preview:', error);
    }
  };

  const handleOpenSelectionModal = async (type: string, tableName: string) => {
    setActiveSelectionModal({ type, table: tableName });
    setActiveFieldConfig(null);
    setSearchTableRef('');

    if (!tableColumns[`${type}:${tableName}`]) {
      await fetchTableColumns(type, tableName);
    }
    if (!tablePreviews[`${type}:${tableName}`]) {
      await fetchTablePreview(type, tableName);
    }
    
    // Charger la liste globale des tables pour les jointures
    if (!allOracleTables[type]) {
      try {
        const res = await axios.post('/api/oracle/check-tables', { type }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setAllOracleTables(prev => ({ ...prev, [type]: res.data.details }));
      } catch (e) {}
    }

    if (!selectedFields[`${type}:${tableName}`]) {
      const cols = tableColumns[`${type}:${tableName}`] || [];
      setSelectedFields(prev => ({ ...prev, [`${type}:${tableName}`]: [...cols] }));
    }
  };

  const handleOpenSubstModal = (type: string, table: string) => {
    setActiveSubstModal({ type, table });
  };

  const toggleFieldSelection = (type: string, table: string, field: string) => {
    const key = `${type}:${table}`;
    const current = selectedFields[key] || [];
    const updated = current.includes(field) 
      ? current.filter(f => f !== field)
      : [...current, field];
    setSelectedFields({ ...selectedFields, [key]: updated });
  };

  const setTablePK = (type: string, table: string, field: string) => {
    setPrimaryKeys({ ...primaryKeys, [`${type}:${table}`]: field });
    // Si on choisit un champ comme PK, on s'assure qu'il est sélectionné pour l'import
    const key = `${type}:${table}`;
    const current = selectedFields[key] || [];
    if (!current.includes(field)) {
      setSelectedFields({ ...selectedFields, [key]: [...current, field] });
    }
  };

  const handleSelectRefTable = async (type: string, refTable: string, currentField: string) => {
    const table = activeSelectionModal?.table || '';
    const subst = substitutions[type]?.[table]?.[currentField] || {};
    updateSubstitution(type, table, currentField, { ...subst, secondaryTable: refTable });
    
    // Charger les colonnes de cette table de référence
    if (!tableColumns[`${type}:${refTable}`]) {
      await fetchTableColumns(type, refTable);
    }
  };

  const updateSubstitution = (type: string, table: string, field: string, data: any) => {
    setSubstitutions(prev => {
      const current = prev[type] || {};
      const tableSubst = { ...(current[table] || {}) };
      
      if (!data) {
        delete tableSubst[field];
      } else {
        tableSubst[field] = data;
      }

      return {
        ...prev,
        [type]: {
          ...current,
          [table]: tableSubst
        }
      };
    });
  };

  const toggleLabelField = (type: string, table: string, field: string, labelField: string) => {
    const current = substitutions[type] || {};
    const tableSubst = current[table] || {};
    const subst = tableSubst[field] || { labelFields: [] };
    
    let labels = subst.labelFields || [];
    if (labels.includes(labelField)) {
      labels = labels.filter((f: string) => f !== labelField);
    } else {
      labels = [...labels, labelField];
    }

    updateSubstitution(type, table, field, { ...subst, labelFields: labels });
  };


  const handleImportOracleTables = async (type: string) => {
    const tables = selectedTables[type] || [];
    if (tables.length === 0) return;
    
    if (!window.confirm(`Confirmer l'importation de ${tables.length} objet(s) (tables/vues) depuis Oracle ${type} vers la base locale ?\nLes tables locales seront préfixées par 'oracle_'.`)) return;

    setImporting(prev => ({ ...prev, [type]: true }));
    setImportReports(prev => ({ ...prev, [type]: [] }));

    // Préparer le mapping pour le backend
    const tableConfig: Record<string, string[]> = {};
    const pkConfig: Record<string, string> = {};
    
    tables.forEach(table => {
      const key = `${type}:${table}`;
      if (selectedFields[key]) tableConfig[table] = selectedFields[key];
      if (primaryKeys[key]) pkConfig[table] = primaryKeys[key];
    });

    try {
      const res = await axios.post('/api/oracle/import-tables', { 
        type, 
        tables,
        filters: tableFilters[type] || {},
        substitutions: substitutions[type] || {},
        tableConfig,
        primaryKeys: pkConfig,
        dateFields
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setImportReports(prev => ({ ...prev, [type]: res.data.report }));
      alert(res.data.message);
    } catch (error: any) {
      alert(error.response?.data?.message || "Erreur lors de l'importation");
    } finally {
      setImporting(prev => ({ ...prev, [type]: false }));
    }
  };

  const fetchTiles = async () => {
    try {
      const response = await fetch('/api/tiles-all', { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) {
        const data = await response.json();
        setTiles(Array.isArray(data) ? data.sort((a: any, b: any) => a.sort_order - b.sort_order) : []);
      }
    } catch (e) {}
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchADSettings = async () => {
    try {
      const response = await fetch('/api/ad-settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAdConfig({ 
          is_enabled: !!data.is_enabled,
          host: data.host || '',
          port: data.port || 389,
          base_dn: data.base_dn || '',
          required_group: data.required_group || '',
          bind_dn: data.bind_dn || '',
          // Si un mot de passe est déjà enregistré, on affiche un masque
          // Le backend préserve le mdp existant si on renvoie '••••••••'
          bind_password: data.bind_password ? '••••••••' : ''
        });
      }
    } catch (error) {
      console.error('Erreur chargement AD:', error);
    }
  };

  const fetchAzureSettings = async () => {
    try {
      const response = await fetch('/api/azure-ad-settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAzureConfig({
          is_enabled: !!data.is_enabled,
          tenant_id: data.tenant_id || '',
          client_id: data.client_id || '',
          client_secret: data.client_secret ? '••••••••' : '',
          redirect_uri: data.redirect_uri || (window.location.origin + '/api/auth/azure/callback')
        });
      }
    } catch (error) {
      console.error('Erreur chargement Azure AD:', error);
    }
  };

  const fetchGLPISettings = async () => {
    try {
      const res = await fetch('/api/glpi-settings', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setGlpiConfig({ ...data, is_enabled: !!data.is_enabled });
      }
    } catch (e) {}
  };

  const fetchOracleSettings = async () => {
    try {
      const res = await fetch('/api/oracle-settings', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const types = ['FINANCES', 'RH'];
        const syncedData = types.map(t => {
          const existing = data.find((d: any) => d.type === t);
          return existing || { type: t, host: '', port: 1521, service_name: '', username: '', password: '', is_enabled: 0 };
        });
        setOracleConfigs(syncedData);
        
        // Load permanent sync config for each type
        for (const type of types) {
          const configRes = await axios.get(`/api/oracle/sync-config/${type}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (configRes.data && Array.isArray(configRes.data)) {
            const tables = configRes.data.map((item: any) => item.table_name);
            const filters: Record<string, string> = {};

            const newSelectedFields: Record<string, string[]> = {};
            const newPrimaryKeys: Record<string, string> = {};
            const newSubstitutions: Record<string, any> = {};
            const newDateFields: Record<string, string[]> = {};

            configRes.data.forEach((item: any) => {
              filters[item.table_name] = item.where_clause || '';
              if (item.config_json) {
                try {
                  const config = JSON.parse(item.config_json);
                  const key = `${type}:${item.table_name}`;
                  if (config.selectedFields) newSelectedFields[key] = config.selectedFields;
                  if (config.primaryKey) newPrimaryKeys[key] = config.primaryKey;
                  if (config.substitutions) newSubstitutions[item.table_name] = config.substitutions;
                  if (config.dateFields) newDateFields[key] = config.dateFields;
                } catch (e) {}
              }
            });

            setSelectedTables(prev => ({ ...prev, [type]: tables }));
            setTableFilters(prev => ({ ...prev, [type]: filters }));
            setSelectedFields(prev => ({ ...prev, ...newSelectedFields }));
            setPrimaryKeys(prev => ({ ...prev, ...newPrimaryKeys }));
            setSubstitutions(prev => ({ ...prev, [type]: { ...(prev[type] || {}), ...newSubstitutions } }));
            setDateFields(prev => ({ ...prev, ...newDateFields }));
          }
        }      }
    } catch (e) {}
  };

  const handleSaveOracleSyncConfig = async (type: string) => {
    setIsSaving(true);
    
    // Préparer les configurations avancées pour chaque table
    const advancedConfigs: Record<string, any> = {};
    const tables = selectedTables[type] || [];
    
    tables.forEach(table => {
      const key = `${type}:${table}`;
      advancedConfigs[table] = {
        selectedFields: selectedFields[key] || [],
        primaryKey: primaryKeys[key] || null,
        substitutions: substitutions[type]?.[table] || {},
        dateFields: dateFields[key] || []
      };
    });

    try {
      await axios.post('/api/oracle/sync-config', {
        type,
        tables,
        filters: tableFilters[type] || {},
        advancedConfigs
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Configuration de synchronisation enregistrée');
    } catch (error) {
      alert('Erreur lors de la sauvegarde de la configuration');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (section === 'tiles') fetchTiles();
    if (section === 'users') { fetchTiles(); fetchUsers(); }
    if (section === 'ad') fetchADSettings();
    if (section === 'azure-ad') fetchAzureSettings();
    if (section === 'glpi') { fetchGLPISettings(); fetchSyncLogs(); fetchScheduledSyncs(); }
    if (section === 'oracle') fetchOracleSettings();
    if (section === 'mariadb') fetchMariaDBSettings();
    if (section === 'main') { fetchTiles(); fetchUsers(); }
  }, [section, token]);

  const handleSaveGLPI = async () => {
    setIsSaving(true);
    try {
      await axios.post('/api/glpi-settings', glpiConfig, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Paramètres GLPI enregistrés');
    } catch (error) {
      alert('Erreur lors de l\'enregistrement');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestGLPI = async () => {
    setIsTesting(true);
    setGlpiTestResult(null);
    try {
      const response = await axios.post('/api/glpi/test-connection', {
        url: glpiConfig.url,
        app_token: glpiConfig.app_token,
        user_token: glpiConfig.user_token,
        login: glpiConfig.login,
        password: glpiConfig.password
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGlpiTestResult({ success: response.data.success, message: response.data.message });
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Erreur lors du test';
      setGlpiTestResult({ success: false, message: msg });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCountTickets = async () => {
    setIsLoadingTickets(true);
    try {
      const res = await fetch('/api/glpi/tickets-count', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setTicketsCount(data.count);
      } else {
        const data = await res.json();
        alert(data.message);
      }
    } catch (e) {
      alert('Erreur lors de la récupération du nombre de tickets');
    } finally {
      setIsLoadingTickets(false);
    }
  };

  const handleFetchRecentTickets = async () => {
    setIsSyncingRecent(true);
    try {
      const res = await axios.post('/api/glpi/sync-recent', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`Synchronisation réussie : ${res.data.count} tickets importés.`);
      fetchSyncLogs();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erreur lors de la synchronisation');
    } finally {
      setIsSyncingRecent(false);
    }
  };

  const fetchSyncLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (syncLogFilters.type) params.set('type', syncLogFilters.type);
      if (syncLogFilters.status) params.set('status', syncLogFilters.status);
      if (syncLogFilters.dateFrom) params.set('date_from', syncLogFilters.dateFrom);
      if (syncLogFilters.dateTo) params.set('date_to', syncLogFilters.dateTo);
      const res = await axios.get(`/api/glpi/sync-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSyncLogs(res.data);
    } catch (e) {
      console.error('Erreur chargement logs:', e);
    }
  };

  useEffect(() => {
    fetchSyncLogs();
    setSyncLogsPage(1);
  }, [syncLogFilters]);

  const fetchScheduledSyncs = async () => {
    try {
      const res = await axios.get('/api/glpi/scheduled-syncs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setScheduledSyncs(res.data);
    } catch (e) {
      console.error('Erreur chargement synchros programmées:', e);
    }
  };

  const handleSaveScheduledSync = async () => {
    try {
      const payload = {
        frequency_type: newScheduledSync.frequency_type,
        frequency_value: newScheduledSync.frequency_value,
        execution_time: newScheduledSync.frequency_type === 'days' ? newScheduledSync.execution_time : '00:00',
        is_enabled: newScheduledSync.is_enabled
      };
      if (editingScheduledSync) {
        await axios.put(`/api/glpi/scheduled-syncs/${editingScheduledSync.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post('/api/glpi/scheduled-syncs', {
          ...newScheduledSync,
          execution_time: newScheduledSync.frequency_type === 'days' ? newScheduledSync.execution_time : '00:00'
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      setShowScheduledModal(false);
      setEditingScheduledSync(null);
      setNewScheduledSync({ sync_type: 'tickets', sync_mode: 'recent', frequency_type: 'minutes', frequency_value: 30, execution_time: '00:00', is_enabled: true });
      fetchScheduledSyncs();
      fetchSyncLogs();
    } catch (e) {
      console.error('Erreur sauvegarde synchro programmée:', e);
      alert('Erreur lors de la sauvegarde');
    }
  };

  const handleDeleteScheduledSync = async (id: number) => {
    if (!window.confirm('Supprimer cette synchro programmée ?')) return;
    try {
      await axios.delete(`/api/glpi/scheduled-syncs/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchScheduledSyncs();
    } catch (e) {
      console.error('Erreur suppression synchro programmée:', e);
    }
  };

  const handleRunScheduledSync = async (id: number) => {
    try {
      await axios.post(`/api/glpi/scheduled-syncs/${id}/run`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchSyncLogs();
    } catch (e) {
      console.error('Erreur lancement synchro:', e);
    }
  };

  const handleToggleScheduledSync = async (sync: any) => {
    try {
      await axios.put(`/api/glpi/scheduled-syncs/${sync.id}`, {
        is_enabled: !sync.is_enabled
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchScheduledSyncs();
    } catch (e) {
      console.error('Erreur toggle synchro:', e);
    }
  };

  const handleSyncAllTickets = async () => {
    if (!window.confirm("Attention : Vous allez synchroniser l'intégralité de la base GLPI (+36 000 tickets). Cette opération peut prendre quelques minutes. Souhaitez-vous continuer ?")) return;

    setIsSyncingAll(true);
    setSyncStatus({ active: true, processed: 0, total: 0 });

    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      pollInterval = setInterval(async () => {
        try {
          const res = await axios.get('/api/glpi/sync-status', {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSyncStatus(res.data);
          if (!res.data.active) {
            clearInterval(pollInterval!);
            setIsSyncingAll(false);
          }
        } catch (e: unknown) {
          const err = e as { response?: { status: number }; message?: string };
          console.error('[GLPI Polling] Erreur:', err.response?.status, err.message);
        }
      }, 1000);
    };

    startPolling();

    try {
      const response = await axios.post('/api/glpi/sync-all-tickets', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`Synchronisation totale réussie : ${response.data.count} / ${response.data.total} tickets importés.`);
    } catch (error: any) {
      if (pollInterval) clearInterval(pollInterval);
      setSyncStatus(prev => ({ ...prev, active: false }));
      setIsSyncingAll(false);
      alert(error.response?.data?.message || 'Erreur lors de la synchronisation totale');
    }
  };

  const handleCancelSync = async () => {
    if (!window.confirm('Voulez-vous vraiment annuler la synchronisation en cours ?')) return;
    try {
      await axios.post('/api/glpi/sync-cancel', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Annulation demandée. La synchronisation s\'arrêtera bientôt.');
    } catch (e) {
      console.error('Erreur lors de l\'annulation:', e);
    }
  };

  const handleSyncObservers = async () => {
    if (!window.confirm('Synchroniser les observateurs GLPI ? Cette opération peut prendre plusieurs minutes.')) return;
    
    setIsSyncingObservers(true);
    setObserversSyncStatus({ active: true, processed: 0, total: 0 });

    let pollInterval = setInterval(async () => {
      try {
        const res = await axios.get('/api/glpi/sync-observers-status', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setObserversSyncStatus(res.data);
        if (!res.data.active) clearInterval(pollInterval);
      } catch (e) {
        console.error('Erreur polling observers:', e);
      }
    }, 1500);

    try {
      const response = await axios.post('/api/glpi/sync-observers', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`Synchronisation des observateurs réussie : ${response.data.count} observateurs importés.`);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erreur lors de la synchronisation des observateurs');
    } finally {
      setIsSyncingObservers(false);
      setObserversSyncStatus(prev => ({ ...prev, active: false }));
      clearInterval(pollInterval);
    }
  };

  const handleCancelObserversSync = async () => {
    if (!window.confirm('Voulez-vous vraiment annuler la synchronisation des observateurs ?')) return;
    try {
      await axios.post('/api/glpi/sync-observers-cancel', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Annulation demandée. La synchronisation s\'arrêtera bientôt.');
    } catch (e) {
      console.error('Erreur lors de l\'annulation:', e);
    }
  };

  const handleSyncObserversRecent = async () => {
    setIsSyncingObservers(true);
    setObserversSyncStatus({ active: true, processed: 0, total: 0 });

    let pollInterval = setInterval(async () => {
      try {
        const res = await axios.get('/api/glpi/sync-observers-status', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setObserversSyncStatus(res.data);
        if (!res.data.active) clearInterval(pollInterval);
      } catch (e) {
        console.error('Erreur polling observers:', e);
      }
    }, 1500);

    try {
      const response = await axios.post('/api/glpi/sync-observers-recent', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`Synchronisation réussie : ${response.data.count} observateurs importés.`);
      fetchSyncLogs();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erreur lors de la synchronisation');
    } finally {
      setIsSyncingObservers(false);
      setObserversSyncStatus(prev => ({ ...prev, active: false }));
      clearInterval(pollInterval);
    }
  };

  const handleSyncFollowups = async () => {
    if (!window.confirm('Synchroniser tous les traitements de tickets ? Cette opération peut prendre plusieurs minutes.')) return;
    
    setIsSyncingFollowups(true);
    setFollowupsSyncStatus({ active: true, processed: 0, total: 0 });

    let pollInterval = setInterval(async () => {
      try {
        const res = await axios.get('/api/glpi/sync-followups-status', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFollowupsSyncStatus(res.data);
        if (!res.data.active) clearInterval(pollInterval);
      } catch (e) {
        console.error('Erreur polling followups:', e);
      }
    }, 1500);

    try {
      const response = await axios.post('/api/glpi/sync-followups', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`Synchronisation réussie : ${response.data.count} traitements importés.`);
      fetchSyncLogs();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erreur lors de la synchronisation des traitements');
    } finally {
      setIsSyncingFollowups(false);
      setFollowupsSyncStatus(prev => ({ ...prev, active: false }));
      clearInterval(pollInterval);
    }
  };

  const handleSyncFollowupsRecent = async () => {
    setIsSyncingFollowups(true);
    setFollowupsSyncStatus({ active: true, processed: 0, total: 0 });

    let pollInterval = setInterval(async () => {
      try {
        const res = await axios.get('/api/glpi/sync-followups-status', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFollowupsSyncStatus(res.data);
        if (!res.data.active) clearInterval(pollInterval);
      } catch (e) {
        console.error('Erreur polling followups:', e);
      }
    }, 1500);

    try {
      const response = await axios.post('/api/glpi/sync-followups-recent', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`Synchronisation réussie : ${response.data.count} traitements importés.`);
      fetchSyncLogs();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erreur lors de la synchronisation');
    } finally {
      setIsSyncingFollowups(false);
      setFollowupsSyncStatus(prev => ({ ...prev, active: false }));
      clearInterval(pollInterval);
    }
  };

  const handleCancelFollowupsSync = async () => {
    try {
      await axios.post('/api/glpi/sync-followups-cancel', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e) {
      console.error('Erreur annulation followups:', e);
    }
  };

  const handleTestCreateTicket = async () => {
    const title = prompt('Titre du ticket de test :');
    if (!title) return;
    const content = prompt('Description du ticket :') || title;
    const typeStr = prompt('Type (1=Incident, 2=Demande) :') || '1';
    const type = parseInt(typeStr) || 1;
    
    try {
      const response = await axios.post('/api/glpi/tickets', {
        title,
        content,
        type,
        urgency: 3
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`Ticket créé avec succès ! ID: ${response.data.ticket?.id || 'N/A'}`);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erreur lors de la création du ticket');
    }
  };

  const handleSaveOracle = async (config: any) => {
    setIsSaving(true);
    try {
      await axios.post('/api/oracle-settings', config, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`Paramètres Oracle ${config.type} enregistrés`);
      fetchOracleSettings();
    } catch (error) {
      alert('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestOracle = async (type: string) => {
    const config = oracleConfigs.find(c => c.type === type);
    if (!config) return;
    
    setIsTestingOracle(prev => ({ ...prev, [type]: true }));
    setOracleTestResults(prev => ({ ...prev, [type]: { success: false, message: 'Test en cours...' } }));
    
    try {
        const res = await axios.post('/api/oracle/test-connection', { host: config.host, type }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        setOracleTestResults(prev => ({ ...prev, [type]: { success: res.data.success, message: res.data.message } }));
    } catch (error: any) {
        setOracleTestResults(prev => ({ ...prev, [type]: { success: false, message: error.response?.data?.message || 'Erreur de connexion' } }));
    } finally {
        setIsTestingOracle(prev => ({ ...prev, [type]: false }));
    }
  };

  const fetchMariaDBSettings = async () => {
    try {
      const res = await fetch('/api/mariadb-settings', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const types = ['MAIN'];
        const syncedData = types.map(t => {
          const existing = data.find((d: any) => d.type === t);
          return existing || { type: t, host: '', port: 3306, user: '', password: '', database: '', is_enabled: 0 };
        });
        setMariadbConfigs(syncedData);
      }
    } catch (e) {}
  };

  const handleSaveMariaDB = async (config: any) => {
    setIsSaving(true);
    try {
      await axios.post('/api/mariadb-settings', config, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`Paramètres MariaDB ${config.type} enregistrés`);
      fetchMariaDBSettings();
    } catch (error) {
      alert('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestMariaDB = async (type: string) => {
    const config = mariadbConfigs.find(c => c.type === type);
    if (!config) return;
    
    setIsTestingOracle(prev => ({ ...prev, [`MARIADB_${type}`]: true }));
    
    try {
        const res = await axios.post('/api/mariadb/test-connection', { type }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        alert(res.data.message);
    } catch (error: any) {
        alert(error.response?.data?.message || 'Erreur de connexion MariaDB');
    } finally {
        setIsTestingOracle(prev => ({ ...prev, [`MARIADB_${type}`]: false }));
    }
  };

  const handleCheckMariaDBTables = async (type: string) => {
    setIsTestingOracle(prev => ({ ...prev, [`MARIADB_${type}`]: true }));
    try {
        const res = await axios.post('/api/mariadb/check-tables', { type }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        setOracleTestResults(prev => ({ 
            ...prev, 
            [`MARIADB_${type}`]: { success: true, message: res.data.message, details: res.data.details } 
        }));
    } catch (error: any) {
        setOracleTestResults(prev => ({ 
            ...prev, 
            [`MARIADB_${type}`]: { success: false, message: error.response?.data?.message || 'Erreur lors du listage des tables' } 
        }));
    } finally {
        setIsTestingOracle(prev => ({ ...prev, [`MARIADB_${type}`]: false }));
    }
  };

  const handleCheckOracleTables = async (type: string) => {
    setIsTestingOracle(prev => ({ ...prev, [type]: true }));
    try {
        const res = await axios.post('/api/oracle/check-tables', { type }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        setOracleTestResults(prev => ({ ...prev, [type]: { success: res.data.success, message: res.data.message, details: res.data.details } }));
    } catch (error: any) {
        setOracleTestResults(prev => ({ ...prev, [type]: { success: false, message: 'Erreur lors de la vérification' } }));
    } finally {
        setIsTestingOracle(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleSaveAD = async () => {
    setIsSaving(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/ad-settings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(adConfig)
      });
      if (response.ok) {
        setTestResult({ success: true, message: 'Configuration enregistrée avec succès.' });
      } else {
        setTestResult({ success: false, message: 'Erreur lors de l\'enregistrement.' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAzure = async () => {
    setIsSaving(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/azure-ad-settings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(azureConfig)
      });
      if (response.ok) {
        setTestResult({ success: true, message: 'Configuration Azure AD enregistrée avec succès.' });
      } else {
        setTestResult({ success: false, message: 'Erreur lors de l\'enregistrement Azure AD.' });
      }
    } catch (error) {
      setTestResult({ success: false, message: 'Erreur de connexion Azure AD.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePingAD = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/auth/ad-ping', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(adConfig)
      });
      const data = await response.json();
      setTestResult({ success: response.ok, message: data.message });
    } catch (error) {
      setTestResult({ success: false, message: 'Erreur de liaison au serveur AD.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleVerifyUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testUser.username) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/auth/ad-test', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...adConfig, username: testUser.username })
      });
      const data = await response.json();
      setTestResult({ success: response.ok, message: data.message, data: data.data });
    } catch (error) {
      setTestResult({ success: false, message: 'Erreur de recherche.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleVerifyAzureUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!azureTestUser.username) return;
    setIsTesting(true);
    setAzureTestResult(null);
    try {
      const response = await fetch('/api/admin/azure/lookup', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: azureTestUser.username })
      });
      const data = await response.json();
      setAzureTestResult({ success: data.success, message: data.message, data: data.data });
    } catch (error) {
      setAzureTestResult({ success: false, message: 'Erreur lors de la recherche Azure AD.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDeleteTile = async (id: number) => {
    if (window.confirm('Supprimer cette tuile ?')) {
      await fetch(`/api/tiles/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      fetchTiles();
    }
  };

  const handleMoveTile = async (index: number, direction: 'up' | 'down') => {
    const newTiles = [...tiles];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newTiles.length) return;
    [newTiles[index], newTiles[targetIndex]] = [newTiles[targetIndex], newTiles[index]];
    setTiles(newTiles);
    for (let i = 0; i < newTiles.length; i++) {
      await fetch(`/api/tiles/${newTiles[i].id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newTiles[i], sort_order: i })
      });
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser)
    });
    if (response.ok) {
      setNewUser({ username: '', password: '', role: 'user', service_code: '', service_complement: '' });
      setIsAddingUser(false);
      fetchUsers();
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const { role, is_approved, service_code, service_complement } = editingUser;
      await axios.put(`/api/users/${editingUser.id}`, { role, is_approved, service_code, service_complement }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await axios.put(`/api/users/${editingUser.id}/tiles`, { tiles: editingUser.authorized_tiles || [] }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEditingUser(null);
      fetchUsers();
    } catch (error: any) {
      console.error('Erreur mise à jour utilisateur:', error?.response?.data || error);
      alert(`Erreur lors de la mise à jour : ${error?.response?.data?.message || error?.message || 'Erreur inconnue'}`);
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (window.confirm('Supprimer cet utilisateur ?')) {
      await axios.delete(`/api/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchUsers();
    }
  };

  const formatActivityDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Jamais';
    try {
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(new Date(dateStr));
    } catch (e) { return dateStr; }
  };

  const filteredUsers = (users || []).filter(u => 
    u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.service_code && u.service_code.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-blue-500" size={48} />
      </div>
    );
  }

  return (
    <div className="admin-page-content animate-in fade-in duration-500">
        {/* Modal Synchro Programmée */}
        {showScheduledModal && (
          <div className="modal-overlay">
            <div className="modal-container" style={{ maxWidth: '500px' }}>
              <div className="modal-header">
                <div className="modal-header-info">
                  <div className="modal-icon-box emerald">
                    <Clock size={24} />
                  </div>
                  <div>
                    <h3 className="modal-title">{editingScheduledSync ? 'Modifier la synchro' : 'Nouvelle synchro programmée'}</h3>
                    <p className="modal-subtitle">Configurez la fréquence d'exécution automatique</p>
                  </div>
                </div>
                <button onClick={() => setShowScheduledModal(false)} className="icon-btn">
                  <X size={24} />
                </button>
              </div>
              <div className="modal-body padding">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
                  <div className="form-field">
                    <label className="field-label">Type de synchronisation</label>
                    <select 
                      className="admin-input"
                      value={newScheduledSync.sync_type}
                      onChange={e => setNewScheduledSync({...newScheduledSync, sync_type: e.target.value})}
                      disabled={!!editingScheduledSync}
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                    >
                      <option value="tickets">Tickets</option>
                      <option value="observers">Observateurs</option>
                      <option value="followups">Traitements</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="field-label">Mode de synchronisation</label>
                    <select 
                      className="admin-input"
                      value={newScheduledSync.sync_mode}
                      onChange={e => setNewScheduledSync({...newScheduledSync, sync_mode: e.target.value})}
                      disabled={!!editingScheduledSync}
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                    >
                      <option value="recent">Récents</option>
                      <option value="full">Totale</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="field-label">Fréquence</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input
                        type="number"
                        className="admin-input"
                        value={newScheduledSync.frequency_value}
                        onChange={e => setNewScheduledSync({...newScheduledSync, frequency_value: parseInt(e.target.value) || 1})}
                        min={1}
                        style={{ width: '100px', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                      />
                      <select 
                        className="admin-input"
                        value={newScheduledSync.frequency_type}
                        onChange={e => setNewScheduledSync({...newScheduledSync, frequency_type: e.target.value})}
                        style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                      >
                        <option value="minutes">Minutes</option>
                        <option value="hours">Heures</option>
                        <option value="days">Jours</option>
                      </select>
                    </div>
                  </div>
                  {newScheduledSync.frequency_type === 'days' && (
                    <div className="form-field">
                      <label className="field-label">Heure d'exécution</label>
                      <input
                        type="time"
                        className="admin-input"
                        value={newScheduledSync.execution_time}
                        onChange={e => setNewScheduledSync({...newScheduledSync, execution_time: e.target.value})}
                        style={{ padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                      />
                    </div>
                  )}
                  <div className="form-field">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={newScheduledSync.is_enabled}
                        onChange={e => setNewScheduledSync({...newScheduledSync, is_enabled: e.target.checked})}
                      />
                      <span style={{ fontWeight: 600 }}>Activée</span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <div></div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setShowScheduledModal(false)} className="btn-admin-outline">Annuler</button>
                  <button onClick={handleSaveScheduledSync} className="btn-admin-primary" style={{ background: '#059669' }}>
                    <Save size={18} />
                    {editingScheduledSync ? 'Modifier' : 'Créer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Substitutions Oracle Assistée */}
        {/* Modal Super-Configuration Oracle (Structure + Jointures + Preview) */}
        {activeSelectionModal && (
          <div className="modal-overlay">
            <div className="modal-container large" style={{ maxWidth: '1400px', height: '90vh' }}>
              
              <div className="modal-header">
                <div className="modal-header-info">
                  <div className="modal-icon-box blue">
                    <Database size={24} />
                  </div>
                  <div>
                    <h3 className="modal-title">Configuration de l'import : {activeSelectionModal.table}</h3>
                    <p className="modal-subtitle">Définissez la structure, l'identifiant et les transformations de libellés.</p>
                  </div>
                </div>
                <button onClick={() => setActiveSelectionModal(null)} className="icon-btn">
                  <X size={24} />
                </button>
              </div>

              <div className="modal-body" style={{ display: 'flex', overflow: 'hidden' }}>
                {/* PARTIE GAUCHE : TABLEAU DE STRUCTURE */}
                <div style={{ flex: 1, overflow: 'auto', borderRight: '1px solid #f1f5f9', background: 'white' }}>
                  <table className="structure-table">
                    <thead>
                      <tr>
                        <th>Colonne</th>
                        <th>Aperçu</th>
                        <th style={{ textAlign: 'center' }}>Import</th>
                        <th style={{ textAlign: 'center' }}>Index</th>
                        <th style={{ textAlign: 'center' }}>Date</th>
                        <th style={{ textAlign: 'center' }}>Jointure</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(tableColumns[`${activeSelectionModal.type}:${activeSelectionModal.table}`] || []).map(col => {
                        const isSelected = (selectedFields[`${activeSelectionModal.type}:${activeSelectionModal.table}`] || []).includes(col);
                        const isPK = primaryKeys[`${activeSelectionModal.type}:${activeSelectionModal.table}`] === col;
                        const isDate = (dateFields[`${activeSelectionModal.type}:${activeSelectionModal.table}`] || []).includes(col);
                        const hasSubst = !!substitutions[activeSelectionModal.type]?.[activeSelectionModal.table]?.[col];
                        const isActive = activeFieldConfig === col;
                        const previewVal = tablePreviews[`${activeSelectionModal.type}:${activeSelectionModal.table}`]?.[col];

                        return (
                          <tr key={col} style={{ 
                            background: isActive ? '#eff6ff' : (isPK ? '#f0f9ff' : 'transparent'),
                            transition: 'all 0.2s'
                          }}>
                            <td onClick={() => setActiveFieldConfig(col)} style={{ cursor: 'pointer' }}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '12px', color: isActive ? '#2563eb' : '#334155' }}>{col}</span>
                                <span style={{ fontSize: '9px', color: '#94a3b8' }}>➜ {activeSelectionModal.table.toUpperCase()}_{col}</span>
                              </div>
                            </td>
                            <td>
                              <div className="preview-box" style={{ maxWidth: '150px' }}>
                                {previewVal !== null && previewVal !== undefined ? String(previewVal) : <span style={{ opacity: 0.3, fontStyle: 'italic' }}>NULL</span>}
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input 
                                type="checkbox" 
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                checked={isSelected}
                                onChange={() => toggleFieldSelection(activeSelectionModal.type, activeSelectionModal.table, col)}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button 
                                onClick={() => setTablePK(activeSelectionModal.type, activeSelectionModal.table, col)}
                                className={`icon-btn ${isPK ? 'active' : ''}`}
                                style={isPK ? { background: '#2563eb', color: 'white' } : { background: '#f1f5f9' }}
                              >
                                <Key size={14} />
                              </button>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button 
                                onClick={() => toggleDateField(activeSelectionModal.type, activeSelectionModal.table, col)}
                                className={`icon-btn ${isDate ? 'active' : ''}`}
                                style={isDate ? { background: '#f59e0b', color: 'white' } : { background: '#f1f5f9' }}
                                title="Marquer comme champ Date"
                              >
                                <HistoryIcon size={14} />
                              </button>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button 
                                onClick={() => { setActiveFieldConfig(col); setSearchTableRef(''); }}
                                className={`icon-btn ${hasSubst ? 'active' : ''}`}
                                style={{ 
                                  background: hasSubst ? '#10b981' : '#f1f5f9', 
                                  color: hasSubst ? 'white' : '#94a3b8',
                                  border: isActive ? '2px solid #2563eb' : 'none'
                                }}
                              >
                                <Activity size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* PARTIE DROITE : ASSISTANT DE JOINTURE */}
                <div style={{ width: '400px', background: '#f8fafc', padding: '30px', overflowY: 'auto' }}>
                  {!activeFieldConfig ? (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', opacity: 0.4 }}>
                      <div style={{ width: '60px', height: '60px', background: '#e2e8f0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '15px' }}>
                        <Box size={30} />
                      </div>
                      <p style={{ fontSize: '12px', fontWeight: 'bold' }}>Cliquez sur un champ ou sur l'icône <Activity size={12} /> pour configurer une jointure.</p>
                    </div>
                  ) : (
                    <div className="animate-in slide-in-from-right-4 duration-300">
                      <div style={{ marginBottom: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '900' }}>Jointure : <span style={{ color: '#2563eb' }}>{activeFieldConfig}</span></h4>
                        {substitutions[activeSelectionModal.type]?.[activeSelectionModal.table]?.[activeFieldConfig] && (
                          <button onClick={() => updateSubstitution(activeSelectionModal.type, activeSelectionModal.table, activeFieldConfig, null)} style={{ fontSize: '10px', color: '#ef4444', fontWeight: 'bold', border: 'none', background: 'none', cursor: 'pointer' }}>Supprimer</button>
                        )}
                      </div>

                      <div className="config-section-title"><div className="step-badge">1</div> Table de référence</div>
                      <div className="search-input-wrapper">
                        <Search className="search-icon-inside" size={16} />
                        <input 
                          style={{ padding: '12px 12px 12px 40px', fontSize: '12px' }}
                          placeholder="Rechercher (ex: SERVICE...)"
                          value={searchTableRef}
                          onChange={(e) => setSearchTableRef(e.target.value.toUpperCase())}
                        />
                      </div>

                      {searchTableRef && (
                        <div className="table-ref-list" style={{ gridTemplateColumns: '1fr' }}>
                          {(allOracleTables[activeSelectionModal.type] || [])
                            .filter(t => t.includes(searchTableRef))
                            .map(t => (
                              <button key={t} onClick={() => { handleSelectRefTable(activeSelectionModal.type, t, activeFieldConfig); setSearchTableRef(''); }} className="table-ref-item">{t}</button>
                            ))
                          }
                        </div>
                      )}

                      {substitutions[activeSelectionModal.type]?.[activeSelectionModal.table]?.[activeFieldConfig]?.secondaryTable && (
                        <>
                          <div style={{ padding: '12px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #dbeafe', marginBottom: '20px' }}>
                            <span className="stat-label-mini">Table liée</span>
                            <div style={{ fontWeight: 'bold', fontSize: '12px', fontFamily: 'monospace' }}>{substitutions[activeSelectionModal.type]?.[activeSelectionModal.table]?.[activeFieldConfig].secondaryTable}</div>
                          </div>

                          <div className="config-section-title"><div className="step-badge">2</div> Champ ID</div>
                          <select 
                            className="luxe-select" style={{ padding: '10px', fontSize: '12px', marginBottom: '20px' }}
                            value={substitutions[activeSelectionModal.type]?.[activeSelectionModal.table]?.[activeFieldConfig]?.joinField || ''}
                            onChange={(e) => updateSubstitution(activeSelectionModal.type, activeSelectionModal.table, activeFieldConfig, { ...substitutions[activeSelectionModal.type]?.[activeSelectionModal.table]?.[activeFieldConfig], joinField: e.target.value })}
                          >
                            <option value="">-- Choisir ID --</option>
                            {(tableColumns[`${activeSelectionModal.type}:${substitutions[activeSelectionModal.type]?.[activeSelectionModal.table]?.[activeFieldConfig].secondaryTable}`] || []).map(c => <option key={c} value={c}>{c}</option>)}
                          </select>

                          <div className="config-section-title"><div className="step-badge">3</div> Champs Libellés (Multi)</div>
                          <div className="table-ref-list" style={{ gridTemplateColumns: '1fr', maxHeight: '150px' }}>
                            {(tableColumns[`${activeSelectionModal.type}:${substitutions[activeSelectionModal.type]?.[activeSelectionModal.table]?.[activeFieldConfig].secondaryTable}`] || []).map(c => {
                              const isChecked = (substitutions[activeSelectionModal.type]?.[activeSelectionModal.table]?.[activeFieldConfig]?.labelFields || []).includes(c);
                              return (
                                <label key={c} className="table-checkbox-label" style={{ padding: '5px 10px' }}>
                                  <input 
                                    type="checkbox" 
                                    checked={isChecked}
                                    onChange={() => toggleLabelField(activeSelectionModal.type, activeSelectionModal.table, activeFieldConfig, c)}
                                  />
                                  <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>{c}</span>
                                </label>
                              );
                            })}
                          </div>

                          <div className="sql-preview" style={{ padding: '15px', fontSize: '9px', marginTop: '20px', border: '1px solid #10b981' }}>
                            <div style={{ color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', fontWeight: '900' }}>Résultat de la jointure (Concaténé) :</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ color: '#94a3b8' }}>{String(tablePreviews[`${activeSelectionModal.type}:${activeSelectionModal.table}`]?.[activeFieldConfig])}</span>
                              <span style={{ color: '#10b981' }}>➜</span>
                              <span style={{ color: joinPreviewResult === "XXXXX" ? '#ef4444' : '#10b981', fontWeight: 'bold', fontSize: '11px' }}>
                                {joinPreviewResult || "Choisir des champs..."}
                              </span>
                            </div>
                          </div>

                          <div className="sql-preview" style={{ padding: '15px', fontSize: '9px', marginTop: '10px', opacity: 0.6 }}>
                            <div style={{ color: '#10b981' }}>REF.{substitutions[activeSelectionModal.type]?.[activeSelectionModal.table]?.[activeFieldConfig].labelField} AS {activeFieldConfig}</div>
                            <div style={{ opacity: 0.5 }}>ON T1.{activeFieldConfig} = REF.{substitutions[activeSelectionModal.type]?.[activeSelectionModal.table]?.[activeFieldConfig].joinField}</div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <div className="footer-stats">
                  <div className="stat-item">
                    <span className="stat-label-mini">Colonnes</span>
                    <span className="stat-value-mini">{(selectedFields[`${activeSelectionModal.type}:${activeSelectionModal.table}`] || []).length} sélectionnés</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label-mini">Transformations</span>
                    <span className="stat-value-mini" style={{ color: '#10b981' }}>{Object.keys(substitutions[activeSelectionModal.type]?.[activeSelectionModal.table] || {}).length} actives</span>
                  </div>
                </div>
                <button onClick={() => setActiveSelectionModal(null)} className="btn btn-primary" style={{ borderRadius: '12px' }}>
                  <CheckCircle2 size={18} /> Valider la configuration
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Substitutions Oracle Assistée (Retirée car fusionnée) */}

        {section === 'main' && (
          <div className="space-y-8">
            <div className="welcome-banner">
              <div className="banner-content">
                <h2>Vue d'ensemble</h2>
                <p>Bienvenue dans votre console d'administration. Gérez les paramètres globaux du DSI Hub.</p>
              </div>
              <ShieldCheck size={80} className="banner-icon" />
            </div>

            <div className="stats-cards">
              <div className="stat-card">
                <div className="stat-icon users"><Users size={20} /></div>
                <div className="stat-info">
                  <span className="stat-value">{users.length}</span>
                  <span className="stat-label">Utilisateurs</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon tiles"><LayoutGrid size={20} /></div>
                <div className="stat-info">
                  <span className="stat-value">{tiles.length}</span>
                  <span className="stat-label">Briques actives</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon status"><Activity size={20} /></div>
                <div className="stat-info">
                  <span className="stat-value">OK</span>
                  <span className="stat-label">Statut Système</span>
                </div>
              </div>
            </div>

            <div className="kpi-placeholder bg-white p-12 rounded-[2rem] border-2 border-dashed border-gray-200 text-center">
               <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                  <Activity size={32} />
               </div>
               <h3 className="text-xl font-bold text-gray-400">KPIs et Statistiques</h3>
               <p className="text-gray-400">Cet espace sera prochainement dédié aux indicateurs de performance.</p>
            </div>
          </div>
        )}

        {section === 'users' && (
          <div className="section-container">
            <div className="section-header">
              <div className="search-bar">
                <Search size={18} className="search-icon" />
                <input 
                  type="text" 
                  placeholder="Rechercher un utilisateur, un service..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button 
                className="btn btn-primary" 
                style={{ borderRadius: '14px', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800', boxShadow: '0 4px 12px rgba(227, 6, 19, 0.2)' }}
                onClick={() => { setIsAddingUser(!isAddingUser); setEditingUser(null); }}
              >
                <UserPlus size={18} /> Nouvel Utilisateur
              </button>
            </div>

             {(isAddingUser || editingUser) && (
               <div className="modal-overlay" onClick={() => { setIsAddingUser(false); setEditingUser(null); }}>
                 <div className="modal-container" style={{ maxWidth: '680px', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                  <div className="form-header flex justify-between items-center">
                    <h3 className="flex items-center gap-3">
                      <span className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Edit2 size={20} /></span>
                      {editingUser ? `Modifier le profil de ${editingUser.username}` : 'Nouvel utilisateur'}
                    </h3>
                    <button onClick={() => { setIsAddingUser(false); setEditingUser(null); }} className="icon-btn"><X size={20} /></button>
                  </div>
                  <form onSubmit={editingUser ? handleUpdateUser : handleAddUser} className="admin-form">
                    <div className="form-grid">
                      <div className="form-group">
                        <label>Identifiant</label>
                        <input disabled={!!editingUser} value={editingUser ? editingUser.username : newUser.username} onChange={e => editingUser ? setEditingUser({...editingUser, username: e.target.value}) : setNewUser({...newUser, username: e.target.value})} required />
                      </div>
                      <div className="form-group">
                        <label>Rôle</label>
                        <select value={editingUser ? editingUser.role : newUser.role} onChange={e => editingUser ? setEditingUser({...editingUser, role: e.target.value}) : setNewUser({...newUser, role: e.target.value})}>
                          <option value="user">Utilisateur standard</option>
                          <option value="finances">Direction Finances</option>
                          <option value="compta">Comptabilité</option>
                          <option value="magapp">Magasin d'Apps</option>
                          <option value="admin">Administrateur</option>
                        </select>
                      </div>
                      {!editingUser && (
                        <div className="form-group">
                          <label>Mot de passe</label>
                          <input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} required />
                        </div>
                      )}
                      <div className="form-group">
                        <label>Statut Approbation</label>
                        <div className="approval-toggle flex gap-3">
                          <button type="button" onClick={() => editingUser && setEditingUser({...editingUser, is_approved: 1})} className={`toggle-btn approved ${editingUser?.is_approved === 1 ? 'active' : ''}`}>
                            <CheckCircle2 size={16} /> Approuvé
                          </button>
                          <button type="button" onClick={() => editingUser && setEditingUser({...editingUser, is_approved: 0})} className={`toggle-btn pending ${editingUser?.is_approved === 0 ? 'active' : ''}`}>
                            <ShieldAlert size={16} /> En attente
                          </button>
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Code Service</label>
                        <input placeholder="ex: DSI" value={editingUser ? editingUser.service_code || '' : newUser.service_code} onChange={e => editingUser ? setEditingUser({...editingUser, service_code: e.target.value}) : setNewUser({...newUser, service_code: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label>Complément Service</label>
                        <input placeholder="Description longue..." value={editingUser ? editingUser.service_complement || '' : newUser.service_complement} onChange={e => editingUser ? setEditingUser({...editingUser, service_complement: e.target.value}) : setNewUser({...newUser, service_complement: e.target.value})} />
                      </div>
                      {editingUser && (
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                          <label>Tuiles Autorisées & Permissions</label>
                          <div className="tiles-grid-compact grid grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                            {tiles.map(tile => {
                              const isAuth = editingUser?.authorized_tiles?.includes(tile.id);
                              return (
                                <label key={tile.id} className={`tile-checkbox-card ${isAuth ? 'selected' : ''}`}>
                                  <input 
                                    type="checkbox" 
                                    checked={!!isAuth}
                                    onChange={(e) => {
                                      if (!editingUser) return;
                                      const currentTiles = editingUser.authorized_tiles || [];
                                      if (e.target.checked) {
                                        setEditingUser({...editingUser, authorized_tiles: [...currentTiles, tile.id]});
                                      } else {
                                        setEditingUser({...editingUser, authorized_tiles: currentTiles.filter(id => id !== tile.id)});
                                      }
                                    }}
                                  />
                                  <span className="tile-checkbox-title">{tile.title}</span>
                                  <span className="tile-checkbox-icon">{isAuth ? '✓' : ''}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="form-footer mt-8 pt-6 border-t border-gray-100 flex justify-end">
                      <button type="submit" className="btn btn-primary" style={{ borderRadius: '14px', padding: '12px 30px', fontWeight: '800',  boxShadow: '0 4px 12px rgba(227, 6, 19, 0.2)' }}>
                        <Save size={18} className="mr-2 inline-block" /> {editingUser ? 'Sauvegarder le profil' : 'Créer le compte'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            <div className="data-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th>Rôle</th>
                    <th>Statut</th>
                    <th>Service</th>
                    <th>Activité</th>
                    <th className="actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => (
                    <tr key={user.id}>
                      <td className="user-cell">
                        <div className="avatar">{user.username?.substring(0, 2).toUpperCase() || '??'}</div>
                        <span className="username font-bold text-gray-900">{user.username}</span>
                      </td>
                      <td>
                        <span className={`role-badge ${user.role}`}>{user.role}</span>
                      </td>
                      <td>
                        <div className="flex flex-col gap-2">
                          {user.is_approved === 1 ? (
                            <span className="status-badge approved self-start"><ShieldCheck size={12} /> OK</span>
                          ) : (
                            <span className="status-badge pending self-start"><ShieldAlert size={12} /> ATTENTE</span>
                          )}
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', marginTop: '4px', maxWidth: '260px' }}>
                            {user.role === 'admin' ? (
                              <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.05em', background: '#f3e8ff', color: '#7c3aed', border: '1px solid #c4b5fd' }}>ACCÈS TOTAL</span>
                            ) : (
                              tiles.filter(t => user.authorized_tiles?.includes(t.id)).map(t => {
                                const colors: Record<string, { bg: string; color: string; border: string }> = {
                                  '1': { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
                                  '2': { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
                                  '3': { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
                                  '4': { bg: '#fce7f3', color: '#9d174d', border: '#f9a8d4' },
                                  '5': { bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' },
                                  '6': { bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
                                  '7': { bg: '#cffafe', color: '#155e75', border: '#67e8f9' },
                                  '8': { bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' },
                                  '9': { bg: '#fff7ed', color: '#9a3412', border: '#fdba74' },
                                  '10': { bg: '#ede9fe', color: '#5b21b6', border: '#c4b5fd' },
                                  '11': { bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0' },
                                  '12': { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
                                  '13': { bg: '#f0f9ff', color: '#075985', border: '#7dd3fc' },
                                  '14': { bg: '#fdf4ff', color: '#86198f', border: '#e879f9' },
                                  '15': { bg: '#fffbeb', color: '#92400e', border: '#fcd34d' },
                                  '16': { bg: '#ecfccb', color: '#3f6212', border: '#bef264' },
                                  '17': { bg: '#f5f3ff', color: '#4c1d95', border: '#c4b5fd' },
                                  '18': { bg: '#f0fdf4', color: '#166534', border: '#86efac' },
                                  '19': { bg: '#fefce8', color: '#854d0e', border: '#fde047' },
                                  '20': { bg: '#faf5ff', color: '#6b21a8', border: '#d8b4fe' },
                                  '21': { bg: '#eef2ff', color: '#3730a3', border: '#a5b4fc' },
                                };
                                const c = colors[String(t.id)] || { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
                                return (
                                  <span key={t.id} style={{ padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    {t.title}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="service-cell">
                        <div style={{ fontWeight: 700, color: '#334155' }}>{user.service_code || '-'}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af' }}>{user.service_complement}</div>
                      </td>
                      <td className="activity-cell" style={{ fontSize: '0.75rem', color: '#6b7280' }}>{formatActivityDate(user.last_activity)}</td>
                      <td className="actions">
                        <button className="icon-btn edit" onClick={() => setEditingUser(user)}><Edit2 size={16} /></button>
                        <button className="icon-btn delete" onClick={() => handleDeleteUser(user.id)} disabled={user.username === 'admin' || user.username === 'adminhub'}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {section === 'ad' && (
          <div className="admin-ad-container">
            <div className="ad-layout-grid">
                <div className="ad-main-column">
                    <div className="admin-card ad-config-card">
                        <div className="card-banner">
                            <div className="banner-info">
                                <h3 className="banner-title">Paramètres Active Directory</h3>
                                <p className="banner-subtitle">Liaison avec l'annuaire LDAP de la Ville d'Ivry-sur-Seine.</p>
                            </div>
                            <div className="banner-controls">
                                <span className={`status-pill ${adConfig.is_enabled ? 'active' : 'inactive'}`}>
                                    {adConfig.is_enabled ? 'Activé' : 'Désactivé'}
                                </span>
                                <label className="switch">
                                    <input type="checkbox" checked={adConfig.is_enabled} onChange={e => setAdConfig({...adConfig, is_enabled: e.target.checked})} />
                                    <span className="slider round"></span>
                                </label>
                            </div>
                        </div>
                        
                        <div className={`card-content ${!adConfig.is_enabled ? 'is-disabled' : ''}`}>
                            <div className="form-responsive-grid">
                                <div className="form-field">
                                    <label className="field-label"><Globe size={14} /> Hôte (Serveur ou IP)</label>
                                    <input 
                                        className="admin-input"
                                        value={adConfig.host} 
                                        onChange={e => setAdConfig({...adConfig, host: e.target.value})} 
                                        placeholder="10.103.130.118" 
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="field-label"><Hash size={14} /> Port</label>
                                    <input 
                                        type="number"
                                        className="admin-input"
                                        value={adConfig.port} 
                                        onChange={e => setAdConfig({...adConfig, port: parseInt(e.target.value) || 389})} 
                                    />
                                </div>
                                <div className="form-field full-width">
                                    <label className="field-label"><ShieldCheck size={14} /> Base DN (Recherche)</label>
                                    <input 
                                        className="admin-input font-mono text-xs"
                                        value={adConfig.base_dn} 
                                        onChange={e => setAdConfig({...adConfig, base_dn: e.target.value})} 
                                        placeholder="DC=ivry,DC=local" 
                                    />
                                </div>
                                <div className="form-field full-width">
                                    <label className="field-label"><Key size={14} /> Bind DN (Compte technique)</label>
                                    <input 
                                        className="admin-input font-mono text-xs"
                                        value={adConfig.bind_dn} 
                                        onChange={e => setAdConfig({...adConfig, bind_dn: e.target.value})} 
                                        placeholder="CN=user,OU=..." 
                                    />
                                </div>
                                <div className="form-field full-width">
                                    <label className="field-label"><Lock size={14} /> Mot de passe Liaison</label>
                                    <input 
                                        type="password"
                                        className="admin-input"
                                        value={adConfig.bind_password} 
                                        onChange={e => setAdConfig({...adConfig, bind_password: e.target.value})} 
                                    />
                                </div>
                            </div>

                            <div className="card-footer-btns">
                                <button className="btn-admin-primary" onClick={handleSaveAD} disabled={isSaving}>
                                    {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                    Enregistrer la configuration
                                </button>
                                <button className="btn-admin-outline" onClick={handlePingAD} disabled={isTesting}>
                                    <Radio size={18} className={isTesting ? "animate-pulse" : ""} />
                                    Tester la liaison
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="ad-side-column">
                    <div className="admin-side-card lookup-card">
                        <h3 className="side-card-title"><Search size={18} /> Outil de Lookup AD</h3>
                        <p className="side-card-desc">Vérifiez si un utilisateur est correctement identifié par l'AD.</p>
                        
                        <form onSubmit={handleVerifyUser} className="lookup-search-form">
                            <input 
                                placeholder="Login windows..." 
                                className="admin-input" 
                                value={testUser.username} 
                                onChange={e => setTestUser({...testUser, username: e.target.value})} 
                            />
                            <button type="submit" className="btn-admin-primary" disabled={isTesting || !testUser.username}>
                                {isTesting ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                            </button>
                        </form>

                        {testResult && (
                            <div className={`lookup-result-box ${testResult.success ? 'is-success' : 'is-error'}`}>
                                <div className="result-header">
                                    {testResult.success ? <Check size={16} /> : <AlertTriangle size={16} />}
                                    <span>{testResult.message}</span>
                                </div>
                                {testResult.data && (
                                    <div className="result-details">
                                        <div className="detail-item"><strong>Nom :</strong> {testResult.data.displayName}</div>
                                        <div className="detail-item"><strong>Email :</strong> {testResult.data.mail || 'N/A'}</div>
                                        <div className="detail-item"><strong>Dept :</strong> {testResult.data.department || 'N/A'}</div>
                                        <div className="detail-item"><strong>DN :</strong> <span className="font-mono text-[9px]">{testResult.data.dn}</span></div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
          </div>
        )}

        {section === 'azure-ad' && (
          <div className="admin-ad-container">
            <div className="ad-layout-grid">
                <div className="ad-main-column">
                    <div className="admin-card ad-config-card">
                        <div className="card-banner" style={{ background: 'linear-gradient(135deg, #0078d4 0%, #28a8ea 100%)' }}>
                            <div className="banner-info">
                                <h3 className="banner-title">Paramètres Azure AD (Entra ID)</h3>
                                <p className="banner-subtitle">Authentification OAuth2 / OpenID Connect avec Microsoft 365.</p>
                            </div>
                            <div className="banner-controls">
                                <span className={`status-pill ${azureConfig.is_enabled ? 'active' : 'inactive'}`}>
                                    {azureConfig.is_enabled ? 'Activé' : 'Désactivé'}
                                </span>
                                <label className="switch">
                                    <input type="checkbox" checked={azureConfig.is_enabled} onChange={e => setAzureConfig({...azureConfig, is_enabled: e.target.checked})} />
                                    <span className="slider round"></span>
                                </label>
                            </div>
                        </div>
                        
                        <div className={`card-content ${!azureConfig.is_enabled ? 'is-disabled' : ''}`}>
                            <div className="form-responsive-grid">
                                <div className="form-field full-width">
                                    <label className="field-label"><Fingerprint size={14} /> ID de l'annuaire (Tenant)</label>
                                    <input 
                                        className="admin-input font-mono text-xs"
                                        value={azureConfig.tenant_id} 
                                        onChange={e => setAzureConfig({...azureConfig, tenant_id: e.target.value})} 
                                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" 
                                    />
                                </div>
                                <div className="form-field full-width">
                                    <label className="field-label"><Box size={14} /> ID d'application (Client)</label>
                                    <input 
                                        className="admin-input font-mono text-xs"
                                        value={azureConfig.client_id} 
                                        onChange={e => setAzureConfig({...azureConfig, client_id: e.target.value})} 
                                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" 
                                    />
                                </div>
                                <div className="form-field full-width">
                                    <label className="field-label"><Lock size={14} /> Secret Client</label>
                                    <input 
                                        type="password"
                                        className="admin-input font-mono text-xs"
                                        value={azureConfig.client_secret} 
                                        onChange={e => setAzureConfig({...azureConfig, client_secret: e.target.value})} 
                                        placeholder="••••••••••••••••"
                                    />
                                </div>
                                <div className="form-field full-width">
                                    <label className="field-label"><Globe size={14} /> URI de redirection</label>
                                    <input 
                                        className="admin-input font-mono text-[10px]"
                                        value={azureConfig.redirect_uri} 
                                        onChange={e => setAzureConfig({...azureConfig, redirect_uri: e.target.value})} 
                                        placeholder="https://votre-hub.fr/api/auth/azure/callback"
                                    />
                                </div>
                            </div>

                            <div className="card-footer-btns">
                                <button className="btn-admin-primary" onClick={handleSaveAzure} disabled={isSaving} style={{ backgroundColor: '#0078d4' }}>
                                    {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                    Enregistrer la configuration Azure
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="ad-side-column">
                    <div className="admin-side-card lookup-card">
                        <h3 className="side-card-title"><Search size={18} /> Outil de Lookup Azure AD</h3>
                        <p className="side-card-desc">Vérifiez si un utilisateur est correctement identifié par Entra ID (Graph API).</p>
                        
                        <form onSubmit={handleVerifyAzureUser} className="lookup-search-form">
                            <input 
                                placeholder="Email ou Nom d'affichage..." 
                                className="admin-input" 
                                value={azureTestUser.username} 
                                onChange={e => setAzureTestUser({...azureTestUser, username: e.target.value})} 
                            />
                            <button type="submit" className="btn-admin-primary" disabled={isTesting || !azureTestUser.username} style={{ backgroundColor: '#0078d4' }}>
                                {isTesting ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                            </button>
                        </form>

                        {azureTestResult && (
                            <div className={`lookup-result-box ${azureTestResult.success ? 'is-success' : 'is-error'}`}>
                                <div className="result-header">
                                    {azureTestResult.success ? <Check size={16} /> : <AlertTriangle size={16} />}
                                    <span>{azureTestResult.message}</span>
                                </div>
                                {azureTestResult.data && (
                                    <div className="result-details">
                                        <div className="detail-item"><strong>Nom :</strong> {azureTestResult.data.displayName}</div>
                                        <div className="detail-item"><strong>Email :</strong> {azureTestResult.data.mail || 'N/A'}</div>
                                        <div className="detail-item"><strong>Dept/Job :</strong> {azureTestResult.data.department || 'N/A'}</div>
                                        <div className="detail-item"><strong>UPN :</strong> <span className="font-mono text-[9px]">{azureTestResult.data.dn}</span></div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
          </div>
        )}

        {section === 'oracle' && (
          <div className="admin-oracle-section">
            <div className="section-header luxe-header">
              <div className="header-icon-container">
                <Database size={32} strokeWidth={1.5} />
              </div>
              <div className="header-content">
                <h2>Synchronisation Oracle</h2>
                <p>Paramétrez les flux de données entre les bases Oracle RH/FINANCES et la base locale.</p>
              </div>
            </div>

            <div className="oracle-grid">
              {['FINANCES', 'RH'].map(type => {
                const config = oracleConfigs.find(c => c.type === type) || { type, host: '', port: 1521, service_name: '', username: '', password: '', is_enabled: 0 };
                const result = oracleTestResults[type];
                const testing = isTestingOracle[type];

                return (
                  <div key={type} className="oracle-card glass-card">
                    <div className="card-header">
                      <div className="header-info">
                        <div className="type-icon">
                          {type === 'FINANCES' ? <Euro size={20} /> : <Users size={20} />}
                        </div>
                        <h3>Oracle {type}</h3>
                      </div>
                      <div className={`status-badge ${config.is_enabled ? 'active' : 'inactive'}`}>
                        {config.is_enabled ? 'Activé' : 'Désactivé'}
                      </div>
                    </div>

                    <div className="card-body">
                      <div className="form-grid">
                        <div className="input-group">
                          <label><Globe size={14} /> Hôte / IP</label>
                          <input 
                            type="text" 
                            placeholder="ex: 10.1.x.x"
                            value={config.host || ''} 
                            onChange={(e) => {
                              const updated = oracleConfigs.map(c => c.type === type ? { ...c, host: e.target.value } : c);
                              setOracleConfigs(updated);
                            }}
                          />
                        </div>
                        <div className="input-group">
                          <label><Hash size={14} /> Port</label>
                          <input 
                            type="number" 
                            value={config.port || 1521} 
                            onChange={(e) => {
                              const updated = oracleConfigs.map(c => c.type === type ? { ...c, port: parseInt(e.target.value) } : c);
                              setOracleConfigs(updated);
                            }}
                          />
                        </div>
                        <div className="input-group full">
                          <label><Box size={14} /> Service Name / SID</label>
                          <input 
                            type="text" 
                            placeholder="ex: XE, ORCL, PROD..."
                            value={config.service_name || ''} 
                            onChange={(e) => {
                              const updated = oracleConfigs.map(c => c.type === type ? { ...c, service_name: e.target.value } : c);
                              setOracleConfigs(updated);
                            }}
                          />
                        </div>
                        <div className="input-group">
                          <label><UserPlus size={14} /> Utilisateur</label>
                          <input 
                            type="text" 
                            value={config.username || ''} 
                            onChange={(e) => {
                              const updated = oracleConfigs.map(c => c.type === type ? { ...c, username: e.target.value } : c);
                              setOracleConfigs(updated);
                            }}
                          />
                        </div>
                        <div className="input-group">
                          <label><Lock size={14} /> Mot de passe</label>
                          <input 
                            type="password" 
                            value={config.password || ''} 
                            onChange={(e) => {
                              const updated = oracleConfigs.map(c => c.type === type ? { ...c, password: e.target.value } : c);
                              setOracleConfigs(updated);
                            }}
                          />
                        </div>
                      </div>

                      <div className="toggle-container">
                        <label className="luxe-toggle">
                          <input 
                            type="checkbox" 
                            checked={!!config.is_enabled}
                            onChange={(e) => {
                              const updated = oracleConfigs.map(c => c.type === type ? { ...c, is_enabled: e.target.checked ? 1 : 0 } : c);
                              setOracleConfigs(updated);
                            }}
                          />
                          <span className="slider"></span>
                          <span className="label-text">Activer cette liaison</span>
                        </label>
                      </div>

                      <div className="card-actions">
                      <button className="btn-save-luxe" onClick={() => handleSaveOracle(config)} disabled={isSaving}>
                        <Save size={18} /> Enregistrer Paramètres Connexion
                      </button>
                      <div className="btn-group">
                        <button className="btn-test-luxe" onClick={() => handleTestOracle(type)} disabled={testing}>
                          {testing ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
                          Tester Connexion
                        </button>
                        <button className="btn-test-luxe" onClick={() => handleCheckOracleTables(type)} disabled={testing}>
                          <LayoutGrid size={18} /> Lister Tables & Vues Oracle
                        </button>
                      </div>
                      </div>

                      {result && result.details && result.details.length > 0 && (
                      <div className="oracle-tables-selector mt-4">
                        <div className="selector-header flex justify-between items-center mb-4">
                          <h4 className="selector-title mb-0">Sélection des objets (tables/vues) à synchroniser :</h4>
                          <div className="search-mini">
                            <Search size={14} />
                            <input 
                              type="text" 
                              placeholder="Chercher table ou vue..." 
                              value={tableSearch[type] || ''}
                              onChange={(e) => setTableSearch({ ...tableSearch, [type]: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="tables-grid">
                          {result.details
                            .filter((name: string) => !tableSearch[type] || name.toLowerCase().includes(tableSearch[type].toLowerCase()))
                            .sort((a: string, b: string) => {
                              const aSel = selectedTables[type]?.includes(a) ? 1 : 0;
                              const bSel = selectedTables[type]?.includes(b) ? 1 : 0;
                              if (aSel !== bSel) return bSel - aSel;
                              return a.localeCompare(b);
                            })
                            .map((tableName: string) => {
                              const isSelected = selectedTables[type]?.includes(tableName);
                              return (
                                <div key={tableName} className={`table-row-config ${isSelected ? 'selected' : ''}`}>
                                  <label className="table-checkbox-label">
                                    <input 
                                      type="checkbox" 
                                      checked={isSelected || false}
                                      onChange={(e) => {
                                        const current = selectedTables[type] || [];
                                        const updated = e.target.checked 
                                          ? [...current, tableName]
                                          : current.filter(t => t !== tableName);
                                        setSelectedTables({ ...selectedTables, [type]: updated });
                                      }}
                                    />
                                    <span className="table-name">{tableName}</span>
                                    {isSelected && (
                                      <div className="flex gap-2 ml-auto pr-4">
                                        <span className="text-[9px] font-black bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded uppercase">
                                          {(selectedFields[`${type}:${tableName}`] || []).length} champs
                                        </span>
                                        {Object.keys(substitutions[type]?.[tableName] || {}).length > 0 && (
                                          <span className="text-[9px] font-black bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded uppercase">
                                            {Object.keys(substitutions[type]?.[tableName] || {}).length} joints
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </label>

                                  {isSelected && (
                                    <div className="table-filter-input animate-in slide-in-from-left-2 duration-200">
                                      <div className="flex items-center gap-2 mb-2">
                                        <input 
                                          type="text"
                                          className="flex-1"
                                          placeholder="Clause WHERE (ex: ANNEE=2024)"
                                          value={tableFilters[type]?.[tableName] || ''}
                                          onChange={(e) => {
                                            const currentFilters = tableFilters[type] || {};
                                            setTableFilters({
                                              ...tableFilters,
                                              [type]: { ...currentFilters, [tableName]: e.target.value }
                                            });
                                          }}
                                        />
                                        <div className="flex items-center gap-2">
                                          <button 
                                            type="button"
                                            className="btn-champs-config px-3 py-1 bg-white border border-gray-200 hover:bg-gray-50 rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors shadow-sm"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              handleOpenSelectionModal(type, tableName);
                                            }}
                                          >
                                            <Fingerprint size={12} className="text-blue-600" /> Structure
                                          </button>
                                          <button 
                                            type="button"
                                            className="btn-champs-config px-3 py-1 bg-white border border-gray-200 hover:bg-gray-50 rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors shadow-sm"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              handleOpenSubstModal(type, tableName);
                                            }}
                                          >
                                            <Database size={12} className="text-emerald-600" /> Jointures
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>

                        <div className="selector-footer mt-4 pt-4 border-t border-gray-200 flex flex-col gap-3">
                          <button 
                            className="btn-save-luxe bg-blue-600 hover:bg-blue-700" 
                            onClick={() => handleSaveOracleSyncConfig(type)} 
                            disabled={isSaving}
                          >
                            <Save size={18} /> Enregistrer la configuration
                          </button>

                          <button 
                            className="btn-import-oracle" 
                            disabled={importing[type] || !(selectedTables[type]?.length > 0)}
                            onClick={() => handleImportOracleTables(type)}
                          >
                            {importing[type] ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                            Lancer l'Import (Tables & Vues)
                          </button>

                          <p className="text-[10px] text-gray-400 mt-1 italic text-center">
                            La synchronisation supprimera et recréera les tables locales sélectionnées.
                          </p>
                        </div>
                      </div>
                      )}

                      {/* Default import button (when tables list is NOT visible) but config is saved */}
                      {(!result || !result.details) && selectedTables[type]?.length > 0 && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <p className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-2">
                           <Check size={14} className="text-green-500" /> 
                           {selectedTables[type].length} objet(s) configuré(s) pour synchronisation.
                        </p>
                        <button 
                          className="btn-import-oracle" 
                          disabled={importing[type]}
                          onClick={() => handleImportOracleTables(type)}
                        >
                          {importing[type] ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                          Synchroniser maintenant
                        </button>
                      </div>
                      )}

                      {result && !result.details && (
                      <div className={`result-feedback ${result.success ? 'success' : 'error'}`}>
                        {result.success ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                        <div className="result-content">
                          <span className="result-title">{result.message}</span>
                        </div>
                      </div>
                      )}

                      {importReports[type] && (
                      <div className="import-report mt-4">
                        <h4 className="report-title">Rapport d'import {type} :</h4>
                        <div className="report-list">
                          {importReports[type]?.map((item: any, idx: number) => (
                            <div key={idx} className={`report-item ${item.status.toLowerCase()}`}>
                              <span className="item-table">{item.table}</span>
                              <span className="item-status">{item.status}</span>
                              {item.count !== undefined && <span className="item-count">{item.count} lignes</span>}
                              {item.message && <span className="item-msg">{item.message}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                      )}
                      </div>                  </div>
                );
              })}
            </div>
          </div>
        )}

        {section === 'mariadb' && (
          <div className="admin-oracle-section">
            <div className="section-header luxe-header">
              <div className="header-icon-container">
                <Database size={32} strokeWidth={1.5} />
              </div>
              <div className="header-content">
                <h2>Liaison MariaDB</h2>
                <p>Paramétrez les flux de données entre les bases MariaDB RH/FINANCES et la base locale.</p>
              </div>
            </div>

            <div className="oracle-grid">
              {['MAIN'].map(type => {
                const config = mariadbConfigs.find(c => c.type === type) || { type, host: '', port: 3306, user: '', password: '', database: '', is_enabled: 0 };
                const testing = isTestingOracle[`MARIADB_${type}`];
                const result = oracleTestResults[`MARIADB_${type}`];

                return (
                  <div key={type} className="oracle-card glass-card">
                    <div className="card-header">
                      <div className="header-info">
                        <div className="type-icon">
                          <Database size={20} />
                        </div>
                        <h3>Connexion Centrale MariaDB</h3>
                      </div>
                      <div className={`status-badge ${config.is_enabled ? 'active' : 'inactive'}`}>
                        {config.is_enabled ? 'Activé' : 'Désactivé'}
                      </div>
                    </div>

                    <div className="card-body">
                      <div className="form-grid">
                        <div className="input-group">
                          <label><Globe size={14} /> Hôte / IP</label>
                          <input 
                            type="text" 
                            placeholder="ex: 10.1.x.x"
                            value={config.host || ''} 
                            onChange={(e) => {
                              const updated = mariadbConfigs.map(c => c.type === type ? { ...c, host: e.target.value } : c);
                              setMariadbConfigs(updated);
                            }}
                          />
                        </div>
                        <div className="input-group">
                          <label><Hash size={14} /> Port</label>
                          <input 
                            type="number" 
                            value={config.port || 3306} 
                            onChange={(e) => {
                              const updated = mariadbConfigs.map(c => c.type === type ? { ...c, port: parseInt(e.target.value) } : c);
                              setMariadbConfigs(updated);
                            }}
                          />
                        </div>
                        <div className="input-group">
                          <label><UserPlus size={14} /> Utilisateur</label>
                          <input 
                            type="text" 
                            value={config.user || ''} 
                            onChange={(e) => {
                              const updated = mariadbConfigs.map(c => c.type === type ? { ...c, user: e.target.value } : c);
                              setMariadbConfigs(updated);
                            }}
                          />
                        </div>
                        <div className="input-group">
                          <label><Lock size={14} /> Mot de passe</label>
                          <input 
                            type="password" 
                            value={config.password || ''} 
                            onChange={(e) => {
                              const updated = mariadbConfigs.map(c => c.type === type ? { ...c, password: e.target.value } : c);
                              setMariadbConfigs(updated);
                            }}
                          />
                        </div>
                        <div className="input-group full">
                          <label><Database size={14} /> Base de données</label>
                          <input 
                            type="text" 
                            placeholder="Nom de la base..."
                            value={config.database || ''} 
                            onChange={(e) => {
                              const updated = mariadbConfigs.map(c => c.type === type ? { ...c, database: e.target.value } : c);
                              setMariadbConfigs(updated);
                            }}
                          />
                        </div>
                      </div>

                      <div className="toggle-container">
                        <label className="luxe-toggle">
                          <input 
                            type="checkbox" 
                            checked={!!config.is_enabled}
                            onChange={(e) => {
                              const updated = mariadbConfigs.map(c => c.type === type ? { ...c, is_enabled: e.target.checked ? 1 : 0 } : c);
                              setMariadbConfigs(updated);
                            }}
                          />
                          <span className="slider"></span>
                          <span className="label-text">Activer cette liaison</span>
                        </label>
                      </div>

                      <div className="card-actions">
                        <button className="btn-save-luxe" onClick={() => handleSaveMariaDB(config)} disabled={isSaving}>
                          <Save size={18} /> Enregistrer Paramètres
                        </button>
                        <div className="btn-group">
                          <button className="btn-test-luxe" onClick={() => handleTestMariaDB(type)} disabled={testing}>
                            {testing ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
                            Tester
                          </button>
                          <button className="btn-test-luxe" onClick={() => handleCheckMariaDBTables(type)} disabled={testing}>
                            <LayoutGrid size={18} /> Lister Tables
                          </button>
                        </div>
                      </div>

                      {result && result.details && result.details.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-sm font-semibold mb-2">Tables trouvées ({result.details.length}) :</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto w-full p-2 bg-gray-50 border rounded text-xs font-mono">
                             {result.details.map((t: string) => (
                               <div key={t} className="p-1 bg-white border shadow-sm rounded truncate">
                                   {t}
                               </div>
                             ))}
                          </div>
                        </div>
                      )}
                      
                      {result && !result.details && (
                        <div className={`result-feedback ${result.success ? 'success' : 'error'} mt-4`}>
                          {result.success ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                          <div className="result-content">
                            <span className="result-title">{result.message}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {section === 'glpi' && (
          <div className="admin-glpi-container">
            <div className="glpi-layout-grid">
                <div className="glpi-main-column">
                    <div className="admin-card glpi-config-card">
                        <div className="card-banner">
                            <div className="banner-info">
                                <h3 className="banner-title">Configuration GLPI</h3>
                                <p className="banner-subtitle">Liaison temps réel avec l'écosystème de tickets DSI.</p>
                            </div>
                            <div className="banner-controls">
                                <span className={`status-pill ${glpiConfig.is_enabled ? 'active' : 'inactive'}`}>
                                    {glpiConfig.is_enabled ? 'Activé' : 'Désactivé'}
                                </span>
                                <label className="switch">
                                    <input type="checkbox" checked={glpiConfig.is_enabled} onChange={e => setGlpiConfig({...glpiConfig, is_enabled: e.target.checked})} />
                                    <span className="slider round"></span>
                                </label>
                            </div>
                        </div>
                        
                        <div className={`card-content ${!glpiConfig.is_enabled ? 'is-disabled' : ''}`}>
                            <div className="form-responsive-grid">
                                <div className="form-field full-width">
                                    <label className="field-label"><Globe size={14} /> URL de l'API GLPI</label>
                                    <input 
                                        className="admin-input"
                                        value={glpiConfig.url} 
                                        onChange={e => setGlpiConfig({...glpiConfig, url: e.target.value})} 
                                        placeholder="https://glpi-prod.../apirest.php" 
                                    />
                                    <span className="field-tip">Conseil : privilégiez le HTTPS pour une session stable.</span>
                                </div>
                                <div className="form-field">
                                    <label className="field-label"><Key size={14} /> App-Token</label>
                                    <input 
                                        className="admin-input font-mono"
                                        value={glpiConfig.app_token} 
                                        onChange={e => setGlpiConfig({...glpiConfig, app_token: e.target.value})} 
                                        placeholder="Token application" 
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="field-label"><ShieldCheck size={14} /> User-Token</label>
                                    <input 
                                        type="password"
                                        className="admin-input font-mono"
                                        value={glpiConfig.user_token} 
                                        onChange={e => setGlpiConfig({...glpiConfig, user_token: e.target.value})} 
                                        placeholder="••••••••••••" 
                                    />
                                </div>
                            </div>

                            <div className="auth-alt-box">
                                <h4 className="box-title"><Fingerprint size={14} /> Authentification Alternative</h4>
                                <div className="box-fields">
                                    <input 
                                        className="admin-input small"
                                        value={glpiConfig.login} 
                                        onChange={e => setGlpiConfig({...glpiConfig, login: e.target.value})} 
                                        placeholder="Identifiant" 
                                    />
                                    <input 
                                        type="password"
                                        className="admin-input small"
                                        value={glpiConfig.password} 
                                        onChange={e => setGlpiConfig({...glpiConfig, password: e.target.value})} 
                                        placeholder="Mot de passe" 
                                    />
                                </div>
                                <p className="box-note">L'identifiant/password est prioritaire sur le User-Token si renseigné.</p>
                            </div>

                            <div className="card-footer-btns">
                                <button className="btn-admin-primary" onClick={handleSaveGLPI} disabled={isSaving}>
                                    {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                    Enregistrer
                                </button>
                                <button className="btn-admin-outline" onClick={handleTestGLPI} disabled={isTesting}>
                                    <Radio size={18} className={isTesting ? "animate-pulse" : ""} />
                                    Tester la connexion
                                </button>
                            </div>
                            
                            {glpiTestResult && (
                                <div className={`admin-result-alert ${glpiTestResult.success ? 'is-success' : 'is-error'}`}>
                                    {glpiTestResult.success ? <Check size={18} /> : <AlertTriangle size={18} />}
                                    <span>{glpiTestResult.message}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="glpi-side-column">
                    <div className="admin-side-card monitor-card">
                        <h3 className="side-card-title"><BarChart3 size={18} /> Moniteur GLPI</h3>
                        
                        <div className="counter-display">
                            {isLoadingTickets ? (
                                <Loader2 className="animate-spin" size={30} />
                            ) : ticketsCount !== null ? (
                                <div className="counter-body">
                                    <div className="counter-value">{ticketsCount.toLocaleString()}</div>
                                    <div className="counter-label">Tickets en base locale</div>
                                </div>
                            ) : (
                                <div className="counter-empty">Non testé</div>
                            )}
                        </div>

                        <div className="action-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                            <button onClick={handleCountTickets} className="action-tile" disabled={isLoadingTickets || !glpiConfig.is_enabled}>
                                <Activity size={18} />
                                <span>Actualiser</span>
                            </button>
                            
                            <button onClick={handleFetchRecentTickets} className="action-tile" disabled={isSyncingRecent || !glpiConfig.is_enabled}>
                                <HistoryIcon size={18} />
                                <span>{isSyncingRecent ? '...' : 'Tickets Récents'}</span>
                            </button>

                            <button onClick={handleSyncAllTickets} className="action-tile danger" disabled={isSyncingAll || !glpiConfig.is_enabled}>
                                <Zap size={18} />
                                <span>Totale</span>
                            </button>

                            <button onClick={handleTestCreateTicket} className="action-tile success" disabled={!glpiConfig.is_enabled}>
                                <Plus size={18} />
                                <span>Créer Ticket</span>
                            </button>

                            <button onClick={handleSyncObservers} className="action-tile info" disabled={isSyncingObservers || !glpiConfig.is_enabled}>
                                <Users size={18} />
                                <span>Obs. Total</span>
                            </button>

                            <button onClick={handleSyncObserversRecent} className="action-tile info" disabled={isSyncingObservers || !glpiConfig.is_enabled}>
                                <Users size={18} />
                                <span>Obs. Récents</span>
                            </button>

                            <button onClick={handleSyncFollowups} className="action-tile warning" disabled={isSyncingFollowups || !glpiConfig.is_enabled}>
                                <MessageSquare size={18} />
                                <span>Traitements</span>
                            </button>

                            <button onClick={handleSyncFollowupsRecent} className="action-tile warning" disabled={isSyncingFollowups || !glpiConfig.is_enabled}>
                                <MessageSquare size={18} />
                                <span>Trait. Récents</span>
                            </button>

                        </div>

                        {observersSyncStatus.active && (
                            <div className="sync-progress-box" style={{ marginTop: '10px', borderColor: '#17a2b8' }}>
                                <div className="progress-header">
                                    <div className="progress-label">
                                        <span className="progress-spinner">⟳</span>
                                        Synchronisation observateurs...
                                    </div>
                                    <div className="progress-percent">
                                        {observersSyncStatus.total > 0 ? Math.round((observersSyncStatus.processed / observersSyncStatus.total) * 100) : 0}%
                                    </div>
                                </div>
                                <div className="progress-bar-container">
                                    <div
                                        className="progress-bar-fill"
                                        style={{
                                            width: `${observersSyncStatus.total > 0 ? (observersSyncStatus.processed / observersSyncStatus.total) * 100 : 0}%`,
                                            transition: 'width 0.3s ease',
                                            backgroundColor: '#17a2b8'
                                        }}
                                    >
                                        <div className="progress-bar-shimmer"></div>
                                    </div>
                                </div>
                                <div className="progress-stats">
                                    <span>{observersSyncStatus.processed.toLocaleString()} / {observersSyncStatus.total.toLocaleString()}</span>
                                        <button className="btn-cancel-sync" onClick={handleCancelObserversSync}>Annuler</button>
                                </div>
                            </div>
                        )}

                        {followupsSyncStatus.active && (
                            <div className="sync-progress-box" style={{ marginTop: '10px', borderColor: '#f59e0b' }}>
                                <div className="progress-header">
                                    <div className="progress-label">
                                        <span className="progress-spinner">⟳</span>
                                        Synchronisation traitements...
                                    </div>
                                    <div className="progress-percent">
                                        {followupsSyncStatus.total > 0 ? Math.round((followupsSyncStatus.processed / followupsSyncStatus.total) * 100) : 0}%
                                    </div>
                                </div>
                                <div className="progress-bar-container">
                                    <div
                                        className="progress-bar-fill"
                                        style={{
                                            width: `${followupsSyncStatus.total > 0 ? (followupsSyncStatus.processed / followupsSyncStatus.total) * 100 : 0}%`,
                                            transition: 'width 0.3s ease',
                                            backgroundColor: '#f59e0b'
                                        }}
                                    >
                                        <div className="progress-bar-shimmer"></div>
                                    </div>
                                </div>
                                <div className="progress-stats">
                                    <span>{followupsSyncStatus.processed.toLocaleString()} / {followupsSyncStatus.total.toLocaleString()}</span>
                                    <button className="btn-cancel-sync" onClick={handleCancelFollowupsSync}>Annuler</button>
                                </div>
                            </div>
                        )}

                        {syncStatus.active && (
                            <div className="sync-progress-box">
                                <div className="progress-header">
                                    <div className="progress-label">
                                        <span className="progress-spinner">⟳</span>
                                        Synchronisation en cours...
                                    </div>
                                    <div className="progress-percent">
                                        {syncStatus.total > 0 ? Math.round((syncStatus.processed / syncStatus.total) * 100) : 0}%
                                    </div>
                                </div>
                                <div className="progress-bar-container">
                                    <div
                                        className="progress-bar-fill"
                                        style={{
                                            width: `${syncStatus.total > 0 ? (syncStatus.processed / syncStatus.total) * 100 : 0}%`,
                                            transition: 'width 0.3s ease'
                                        }}
                                    >
                                        <div className="progress-bar-shimmer"></div>
                                    </div>
                                </div>
                                <div className="progress-stats">
                                    <div className="stats-items">
                                        <span className="stat-item">
                                            <strong>{syncStatus.processed.toLocaleString()}</strong> / {syncStatus.total.toLocaleString()}
                                        </span>
                                        <span className="stat-item">
                                            {syncStatus.total > 0 ? ((syncStatus.processed / syncStatus.total) * 100).toFixed(1) : '0'}% complété
                                        </span>
                                    </div>
                                    <button className="btn-cancel-sync" onClick={handleCancelSync}>
                                        Annuler
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="admin-card scheduled-syncs-card" style={{ marginTop: '20px' }}>
                    <div className="card-banner" style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}>
                        <div className="banner-info">
                            <h3 className="banner-title" style={{ color: 'white' }}><Clock size={20} /> Synchronisations Programmées</h3>
                            <p className="banner-subtitle" style={{ color: 'rgba(255,255,255,0.8)' }}>{scheduledSyncs.length} synchros actives</p>
                        </div>
                        <button 
                            className="btn-schedule-add"
                            onClick={() => { setEditingScheduledSync(null); setNewScheduledSync({ sync_type: 'tickets', sync_mode: 'recent', frequency_type: 'minutes', frequency_value: 30, execution_time: '00:00', is_enabled: true }); setShowScheduledModal(true); }}
                            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', padding: '10px 16px', color: 'white', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Plus size={16} /> Ajouter
                        </button>
                    </div>
                    <div className="card-content">
                        {scheduledSyncs.length === 0 ? (
                            <p style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>Aucune synchro programmée</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {scheduledSyncs.map(sync => (
                                    <div key={sync.id} style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'space-between',
                                        padding: '16px',
                                        background: sync.is_enabled ? '#f0fdf4' : '#f1f5f9',
                                        borderRadius: '12px',
                                        border: '1px solid #e2e8f0'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            <label className="switch">
                                                <input type="checkbox" checked={sync.is_enabled === 1} onChange={() => handleToggleScheduledSync(sync)} />
                                                <span className="slider round"></span>
                                            </label>
                                            <div>
                                                <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                                    {sync.sync_type === 'tickets' ? 'Tickets' : sync.sync_type === 'observers' ? 'Observateurs' : 'Traitements'}
                                                    {' - '}
                                                    {sync.sync_mode === 'recent' ? 'Récents' : 'Totale'}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                    Toutes les {sync.frequency_value} {sync.frequency_type}
                                                    {sync.next_run && ` • Prochain: ${new Date(sync.next_run).toLocaleString('fr-FR')}`}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button 
                                                onClick={() => handleRunScheduledSync(sync.id)}
                                                style={{ padding: '8px 12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                                                title="Lancer maintenant"
                                            >
                                                <Play size={14} />
                                            </button>
                                            <button 
                                                onClick={() => { setEditingScheduledSync(sync); setNewScheduledSync({ sync_type: sync.sync_type, sync_mode: sync.sync_mode, frequency_type: sync.frequency_type, frequency_value: sync.frequency_value, execution_time: sync.execution_time || '00:00', is_enabled: sync.is_enabled === 1 }); setShowScheduledModal(true); }}
                                                style={{ padding: '8px 12px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                                                title="Modifier"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteScheduledSync(sync.id)}
                                                style={{ padding: '8px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                                                title="Supprimer"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="admin-card" style={{ marginTop: '20px' }}>
                <div className="card-banner" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)' }}>
                    <div className="banner-info">
                        <h3 className="banner-title" style={{ color: 'white' }}><HistoryIcon size={20} /> Historique des Synchronisations</h3>
                        <p className="banner-subtitle" style={{ color: '#cbd5e1' }}>{syncLogs.length} entrées</p>
                    </div>
                    <button 
                        onClick={fetchSyncLogs} 
                        style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', cursor: 'pointer' }}
                    >
                        ↻ Rafraîchir
                    </button>
                </div>
                <div style={{ display: 'flex', gap: '12px', padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={syncLogFilters.type} onChange={e => setSyncLogFilters(f => ({ ...f, type: e.target.value }))} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8rem', background: 'white', color: '#475569' }}>
                        <option value="">Tous les types</option>
                        <option value="tickets">Tickets</option>
                        <option value="observers">Observateurs</option>
                        <option value="followups">Traitements</option>
                        <option value="ticket">Ticket unique</option>
                    </select>
                    <select value={syncLogFilters.status} onChange={e => setSyncLogFilters(f => ({ ...f, status: e.target.value }))} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8rem', background: 'white', color: '#475569' }}>
                        <option value="">Tous les statuts</option>
                        <option value="completed">Terminé</option>
                        <option value="running">En cours</option>
                        <option value="error">Erreur</option>
                    </select>
                    <input type="date" value={syncLogFilters.dateFrom} onChange={e => setSyncLogFilters(f => ({ ...f, dateFrom: e.target.value }))} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8rem', color: '#475569' }} placeholder="Du" />
                    <input type="date" value={syncLogFilters.dateTo} onChange={e => setSyncLogFilters(f => ({ ...f, dateTo: e.target.value }))} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8rem', color: '#475569' }} placeholder="Au" />
                    {(syncLogFilters.type || syncLogFilters.status || syncLogFilters.dateFrom || syncLogFilters.dateTo) && (
                        <button onClick={() => setSyncLogFilters({ type: '', status: '', dateFrom: '', dateTo: '' })} style={{ padding: '6px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>✕ Réinitialiser</button>
                    )}
                </div>
                
                <div className="card-body" style={{ padding: '0' }}>
                    {syncLogs.length === 0 ? (
                        <div style={{ color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center', padding: '40px' }}>
                            Aucune synchronisation effectuée
                        </div>
                    ) : (
                        <>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>TYPE</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>STATUT</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>DATE</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>TICKETS</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>UTILISATEUR</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {syncLogs.slice((syncLogsPage - 1) * syncLogsPerPage, syncLogsPage * syncLogsPerPage).map(log => (
                                        <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>
                                                <span style={{ 
                                                    padding: '4px 8px', 
                                                    borderRadius: '4px', 
                                                    fontSize: '0.75rem', 
                                                    fontWeight: 600,
                                                    background: log.sync_type === 'tickets' ? '#dbeafe' : log.sync_type === 'observers' ? '#dcfce7' : log.sync_type === 'followups' ? '#fef3c7' : '#f3e8ff',
                                                    color: log.sync_type === 'tickets' ? '#1e40af' : log.sync_type === 'observers' ? '#166534' : log.sync_type === 'followups' ? '#92400e' : '#7c3aed'
                                                }}>
                                                    {(log.sync_type === 'tickets' ? 'Tickets' : log.sync_type === 'observers' ? 'Observateurs' : log.sync_type === 'followups' ? 'Traitements' : log.sync_type === 'ticket' ? 'Ticket' : log.sync_type) + ' - ' + (log.sync_mode === 'recent' ? 'Récents' : log.sync_mode === 'partial' ? 'Partielle' : log.sync_mode === 'full' ? 'Totale' : log.sync_mode === 'auto' ? 'Auto' : log.sync_mode === 'close' ? 'Clôture' : log.sync_mode)}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>
                                                <span style={{ 
                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                    color: log.status === 'error' ? '#ef4444' : log.status === 'running' ? '#3b82f6' : '#22c55e'
                                                }}>
                                                    {log.status === 'error' ? '✗' : log.status === 'running' ? '⟳' : '✓'}
                                                    {log.status === 'error' ? 'Erreur' : log.status === 'running' ? 'En cours' : 'Terminé'}
                                                </span>
                                                {log.status === 'error' && (
                                                    <span style={{ fontSize: '0.75rem', color: '#ef4444', display: 'block', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {log.error_message}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#64748b' }}>
                                                {new Date(log.started_at).toLocaleString('fr-FR')}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>
                                                {log.status === 'running' ? (
                                                    <span>{log.processed_tickets}/{log.total_tickets}</span>
                                                ) : (
                                                    <span style={{ fontWeight: 600 }}>{log.processed_tickets || 0}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#64748b' }}>
                                                {log.triggered_by}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            
                            {syncLogs.length > syncLogsPerPage && (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '16px', borderTop: '1px solid #e2e8f0' }}>
                                    <button 
                                        onClick={() => setSyncLogsPage(p => Math.max(1, p - 1))}
                                        disabled={syncLogsPage === 1}
                                        style={{ padding: '8px 12px', background: syncLogsPage === 1 ? '#f1f5f9' : '#e2e8f0', border: 'none', borderRadius: '6px', cursor: syncLogsPage === 1 ? 'not-allowed' : 'pointer', color: syncLogsPage === 1 ? '#94a3b8' : '#475569' }}
                                    >
                                        ← Précédent
                                    </button>
                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                        Page {syncLogsPage} / {Math.ceil(syncLogs.length / syncLogsPerPage)}
                                    </span>
                                    <button 
                                        onClick={() => setSyncLogsPage(p => Math.min(Math.ceil(syncLogs.length / syncLogsPerPage), p + 1))}
                                        disabled={syncLogsPage >= Math.ceil(syncLogs.length / syncLogsPerPage)}
                                        style={{ padding: '8px 12px', background: syncLogsPage >= Math.ceil(syncLogs.length / syncLogsPerPage) ? '#f1f5f9' : '#e2e8f0', border: 'none', borderRadius: '6px', cursor: syncLogsPage >= Math.ceil(syncLogs.length / syncLogsPerPage) ? 'not-allowed' : 'pointer', color: syncLogsPage >= Math.ceil(syncLogs.length / syncLogsPerPage) ? '#94a3b8' : '#475569' }}
                                    >
                                        Suivant →
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
          </div>
        )}

        {section === 'tiles' && (
          <div className="section-container">
            <div className="section-header">
              <div className="flex flex-col">
                <h3 className="text-xl font-black">Configuration du Hub</h3>
                <p className="text-sm text-gray-500">Gérez les briques de services et leur ordre d'affichage.</p>
              </div>
              <button className="btn btn-primary" onClick={() => { setEditingTile(null); setNewTile({ title: '', icon: 'Box', description: '', status: 'active' }); }}>
                <Plus size={18} /> Ajouter une brique
              </button>
            </div>

            {(editingTile || newTile.title !== '') && (
              <div className="p-4 bg-blue-50 border-b border-blue-100 text-xs text-blue-600 italic">
                Mode édition activé pour : {editingTile?.title || 'Nouvelle brique'}
              </div>
            )}

            <div className="data-table-container">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th style={{ width: '80px' }}>Ordre</th>
                            <th style={{ width: '60px' }}>Icône</th>
                            <th>Service</th>
                            <th>Description</th>
                            <th>Statut</th>
                            <th className="actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tiles.map((tile, index) => (
                            <tr key={tile.id}>
                                <td>
                                    <div className="order-controls flex items-center gap-1">
                                        <button className="icon-btn small" onClick={() => handleMoveTile(index, 'up')} disabled={index === 0}><ChevronUp size={12} /></button>
                                        <button className="icon-btn small" onClick={() => handleMoveTile(index, 'down')} disabled={index === tiles.length - 1}><ChevronDown size={12} /></button>
                                    </div>
                                </td>
                                <td><div className="avatar bg-gray-100"><Box size={18} /></div></td>
                                <td><span className="font-bold text-gray-900">{tile.title}</span></td>
                                <td><span className="text-sm text-gray-500 line-clamp-1">{tile.description}</span></td>
                                <td><span className={`status-tag ${tile.status}`}>{tile.status}</span></td>
                                <td className="actions">
                                    <button className="icon-btn edit" onClick={() => setEditingTile(tile)}><Edit2 size={16} /></button>
                                    <button className="icon-btn delete" onClick={() => handleDeleteTile(tile.id)}><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          </div>
        )}

      <style>{`
        .admin-page-content { color: #1e293b; }
        .welcome-banner { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 40px; border-radius: 24px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        
        /* Modal Backdrop & Container */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; animation: fadeIn 0.3s ease; }
        .modal-container { background: white; border-radius: 30px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); width: 100%; max-width: 1000px; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column; animation: zoomIn 0.3s ease; }
        .modal-container.large { max-width: 1200px; }
        
        /* Modal Header */
        .modal-header { padding: 30px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
        .modal-header-info { display: flex; align-items: center; gap: 15px; }
        .modal-icon-box { width: 50px; height: 50px; border-radius: 15px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.3); }
        .modal-icon-box.blue { background: #2563eb; }
        .modal-icon-box.emerald { background: #10b981; }
        .modal-title { font-size: 1.5rem; font-weight: 900; color: #0f172a; margin: 0; }
        .modal-subtitle { font-size: 0.85rem; color: #64748b; margin-top: 4px; font-weight: 500; }
        
        /* Modal Content & Layout */
        .modal-body { flex: 1; overflow: auto; padding: 0; display: flex; }
        .modal-body.padding { padding: 30px; }
        .modal-sidebar { width: 30%; border-right: 1px solid #f1f5f9; background: #f8fafc; overflow-y: auto; padding: 20px; }
        .modal-main { flex: 1; padding: 30px; overflow-y: auto; background: white; }
        
        /* Modal Footer */
        .modal-footer { padding: 25px 30px; border-top: 1px solid #f1f5f9; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
        .footer-stats { display: flex; gap: 30px; }
        .stat-item { display: flex; flex-direction: column; }
        .stat-label-mini { font-size: 10px; font-weight: 900; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; }
        .stat-value-mini { font-size: 14px; font-weight: 700; color: #1e293b; }

        /* Tables & Lists inside Modals */
        .structure-table { width: 100%; border-collapse: collapse; }
        .structure-table th { position: sticky; top: 0; background: #f8fafc; padding: 15px 20px; font-size: 10px; font-weight: 900; text-transform: uppercase; color: #94a3b8; text-align: left; border-bottom: 1px solid #e2e8f0; z-index: 5; }
        .structure-table td { padding: 15px 20px; border-bottom: 1px solid #f1f5f9; }
        .preview-box { background: #f1f5f9; padding: 6px 12px; border-radius: 8px; font-size: 11px; color: #64748b; font-family: monospace; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border: 1px solid #e2e8f0; }
        
        .field-list-btn { width: 100%; text-align: left; padding: 15px; border-radius: 12px; margin-bottom: 8px; border: 1px solid transparent; transition: all 0.2s; display: flex; align-items: center; justify-content: space-between; }
        .field-list-btn.active { background: #2563eb; color: white; box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.2); }
        .field-list-btn.configured { background: #eff6ff; border-color: #dbeafe; color: #1e40af; }
        .field-list-btn:not(.active):hover { background: #f1f5f9; }

        /* Assistant Styles */
        .step-badge { width: 24px; height: 24px; background: #dbeafe; color: #2563eb; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 900; }
        .config-section-title { font-size: 11px; font-weight: 900; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
        .search-input-wrapper { position: relative; margin-bottom: 20px; }
        .search-input-wrapper input { width: 100%; padding: 15px 15px 15px 45px; background: #f8fafc; border: 2px solid transparent; border-radius: 15px; font-weight: 700; transition: all 0.2s; }
        .search-input-wrapper input:focus { background: white; border-color: #2563eb; outline: none; box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1); }
        .search-icon-inside { position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        
        .table-ref-list { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 200px; overflow-y: auto; padding: 10px; background: #f8fafc; border-radius: 15px; margin-bottom: 20px; }
        .table-ref-item { padding: 10px; border-radius: 8px; font-size: 11px; font-family: monospace; font-weight: 700; text-align: left; transition: all 0.2s; }
        .table-ref-item:hover { background: #2563eb; color: white; }

        .luxe-select { width: 100%; padding: 15px; background: #f8fafc; border: 2px solid transparent; border-radius: 15px; font-weight: 700; font-size: 13px; outline: none; appearance: none; cursor: pointer; }
        .luxe-select:focus { border-color: #2563eb; background: white; }

        .sql-preview { background: #0f172a; padding: 20px; border-radius: 20px; color: #38bdf8; font-family: monospace; font-size: 11px; line-height: 1.6; border: 1px solid #1e293b; margin-top: 25px; }

        @keyframes zoomIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        
        .welcome-banner h2 { font-size: 2rem; font-weight: 800; margin: 0 0 10px 0; }
        .banner-icon { opacity: 0.2; }

        .stats-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 20px; border-radius: 16px; display: flex; align-items: center; gap: 15px; border: 1px solid #e2e8f0; }
        .stat-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .stat-icon.users { background: #e0e7ff; color: #4338ca; }
        .stat-icon.tiles { background: #dbeafe; color: #1d4ed8; }
        .stat-icon.status { background: #dcfce7; color: #15803d; }
        .stat-value { font-size: 1.5rem; font-weight: 800; display: block; color: #0f172a; }
        .stat-label { font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; }

        .section-container { background: white; border-radius: 24px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 40px -10px rgba(0,0,0,0.05); }
        .section-header { padding: 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f8fafc; background: #ffffff; }
        .search-bar { position: relative; width: 350px; }
        .search-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        .search-bar input { width: 100%; padding: 12px 20px 12px 48px; background: #f8fafc; border: 2px solid transparent; border-radius: 16px; font-size: 0.95rem; font-weight: 500; outline: none; transition: all 0.2s ease; }
        .search-bar input:focus { border-color: #3b82f6; background: white; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); }

        .data-table-container { overflow-x: auto; }
        .admin-table { width: 100%; border-collapse: separate; border-spacing: 0; text-align: left; background: white; }
        .admin-table th { padding: 18px 25px; background: #f8fafc; color: #64748b; font-weight: 800; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0; }
        .admin-table td { padding: 20px 25px; border-bottom: 1px solid #f1f5f9; font-size: 0.95rem; transition: background 0.2s ease; vertical-align: middle; }
        .admin-table tr { transition: all 0.2s ease; }
        .admin-table tbody tr:hover td { background: #f8fafc; }
        .admin-table tbody tr:last-child td { border-bottom: none; }

        .user-cell { display: flex; align-items: center; gap: 16px; }
        .avatar { width: 42px; height: 42px; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); color: #2563eb; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.9rem; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.1); border: 1px solid rgba(255,255,255,0.5); }
        .role-badge { padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; display: inline-flex; align-items: center; justify-content: center; }
        .role-badge.admin { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        .role-badge.magapp { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
        .role-badge.finances { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
        .role-badge.compta { background: #fefce8; color: #ca8a04; border: 1px solid #fef08a; }
        .role-badge.user { background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }
        
        .status-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; font-weight: 800; padding: 4px 10px; border-radius: 8px; }
        .status-badge.approved { color: #15803d; background: #dcfce7; }
        .status-badge.pending { color: #c2410c; background: #ffedd5; }

        .status-tag { padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
        .status-tag.active { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;}
        .status-tag.maintenance { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca;}

        .icon-btn { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; border: none; background: transparent; cursor: pointer; transition: all 0.2s ease; color: #94a3b8; }
        .icon-btn:hover { background: #f1f5f9; transform: scale(1.05); }
        .icon-btn.edit:hover { color: #2563eb; background: #eff6ff; }
        .icon-btn.delete:hover { color: #ef4444; background: #fef2f2; }
        .icon-btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

        .edit-form-card { margin: 25px; border-radius: 24px; background: white; border: 1px solid #e2e8f0; box-shadow: 0 20px 40px -10px rgba(0,0,0,0.08); overflow: hidden; }
        .form-header { padding: 25px 30px; border-bottom: 1px solid #f1f5f9; background: #f8fafc; }
        .form-header h3 { margin: 0; color: #0f172a; font-weight: 900; font-size: 1.25rem; }
        .admin-form { padding: 30px; }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 25px; }
        .form-group label { font-size: 0.75rem; font-weight: 800; color: #475569; text-transform: uppercase; margin-bottom: 8px; display: block; letter-spacing: 0.05em; }
        .form-group input, .form-group select { width: 100%; padding: 14px 18px; border: 2px solid transparent; border-radius: 16px; background: #f1f5f9; font-size: 0.95rem; font-weight: 600; color: #1e293b; transition: all 0.2s ease; outline: none; }
        .form-group input:focus, .form-group select:focus { border-color: #3b82f6; background: white; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); }
        .form-group input:disabled { opacity: 0.5; cursor: not-allowed; }
        
        .toggle-btn { flex: 1; padding: 12px; border-radius: 12px; font-weight: 800; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s ease; border: 2px solid transparent; }
        .toggle-btn.approved.active { background: #16a34a; color: white; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.2); }
        .toggle-btn.pending.active { background: #ea580c; color: white; box-shadow: 0 4px 12px rgba(234, 88, 12, 0.2); }
        .toggle-btn:not(.active) { background: #f8fafc; color: #64748b; border-color: #e2e8f0; }
        .toggle-btn:not(.active):hover { background: #f1f5f9; border-color: #cbd5e1; }

        .tiles-grid-compact .tile-checkbox-card { padding: 14px 16px; border-radius: 16px; border: 2px solid #e2e8f0; transition: all 0.2s ease; background: #f8fafc; cursor: pointer; display: flex; align-items: center; gap: 10px; position: relative; overflow: hidden; }
        .tiles-grid-compact .tile-checkbox-card:hover { background: #f1f5f9; border-color: #cbd5e1; transform: translateY(-1px); }
        .tiles-grid-compact .tile-checkbox-card.selected { background: linear-gradient(135deg, #eff6ff, #dbeafe); border-color: #3b82f6; box-shadow: 0 4px 14px rgba(59, 130, 246, 0.15); }
        .tiles-grid-compact .tile-checkbox-card.selected .tile-checkbox-title { color: #1d4ed8; font-weight: 700; }
        .tiles-grid-compact .tile-checkbox-card input[type="checkbox"] { width: 18px; height: 18px; border-radius: 6px; cursor: pointer; accent-color: #2563eb; flex-shrink: 0; }
        .tiles-grid-compact .tile-checkbox-title { font-size: 0.85rem; font-weight: 600; color: #475569; }
        .tiles-grid-compact .tile-checkbox-icon { margin-left: auto; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; }
        .tiles-grid-compact .tile-checkbox-card.selected .tile-checkbox-icon { background: #3b82f6; color: white; }
        .tiles-grid-compact .tile-checkbox-card:not(.selected) .tile-checkbox-icon { display: none; }
        
        .admin-glpi-container { padding: 20px; color: #333; }
        .glpi-layout-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 30px; }
        @media (max-width: 1024px) { .glpi-layout-grid { grid-template-columns: 1fr; } }
        .scheduled-syncs-card .card-content { padding: 0; }
        .btn-schedule-add:hover { background: rgba(255,255,255,0.3) !important; }

        /* General Card Styles */
        .admin-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); overflow: hidden; }
        .card-banner { background: var(--secondary-color, #003366); color: white; padding: 25px; display: flex; justify-content: space-between; align-items: center; }
        .card-banner .banner-title { font-size: 1.4rem; font-weight: 800; margin: 0; }
        .card-banner .banner-subtitle { font-size: 0.85rem; opacity: 0.8; margin-top: 4px; }
        
        .card-content { padding: 30px; }
        .card-content.is-disabled { pointer-events: none; opacity: 0.5; filter: grayscale(1); }

        .banner-controls { display: flex; align-items: center; gap: 15px; }
        .status-pill { padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; background: rgba(0,0,0,0.2); }
        .status-pill.active { color: #4ade80; border: 1px solid #4ade80; }
        .status-pill.inactive { color: #94a3b8; border: 1px solid #94a3b8; }

        /* Form Styles */
        .form-responsive-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .form-responsive-grid .full-width { grid-column: 1 / -1; }
        .form-field { display: flex; flex-direction: column; gap: 8px; }
        .field-label { font-size: 0.75rem; font-weight: 800; color: #475569; display: flex; align-items: center; gap: 6px; text-transform: uppercase; }
        .admin-input { width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.95rem; background: #f8fafc; transition: border-color 0.2s; }
        .admin-input:focus { border-color: var(--primary-color, #E30613); outline: none; background: white; }
        .admin-input.small { padding: 8px 12px; font-size: 0.85rem; }
        .field-tip { font-size: 0.7rem; color: #64748b; font-style: italic; }

        .auth-alt-box { margin-top: 30px; padding: 20px; background: #f1f5f9; border-radius: 10px; }
        .box-title { font-size: 0.75rem; font-weight: 800; color: #0f172a; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; text-transform: uppercase; }
        .box-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .box-note { font-size: 0.7rem; color: #64748b; margin-top: 10px; font-weight: 600; }

        .card-footer-btns { margin-top: 30px; display: flex; gap: 12px; padding-top: 20px; border-top: 1px solid #f1f5f9; }
        
        /* Side Cards */
        .admin-side-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); margin-bottom: 30px; }
        .side-card-title { font-size: 1rem; font-weight: 800; border-bottom: 2px solid #f1f5f9; padding-bottom: 15px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
        
        .counter-display { background: #f8fafc; padding: 25px; border-radius: 12px; text-align: center; border: 1px solid #e2e8f0; margin-bottom: 20px; }
        .counter-value { font-size: 2.5rem; font-weight: 900; color: var(--secondary-color, #003366); }
        .counter-label { font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 5px; }

        .action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .action-tile { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 10px; padding: 15px; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: all 0.2s; }
        .action-tile span { font-size: 0.75rem; font-weight: 700; }
        .action-tile:hover:not(:disabled) { transform: translateY(-2px); background: white; border-color: var(--primary-color, #E30613); color: var(--primary-color, #E30613); cursor: pointer; }
        .action-tile.warning { color: #f59e0b; }
        .action-tile.danger { color: #ef4444; }
        .action-tile.info { color: #6366f1; }
        .action-tile.full-width { grid-column: 1 / -1; }

        /* Buttons Style */
        .btn-admin-primary { background: var(--primary-color, #E30613); color: white; padding: 12px 24px; border-radius: 8px; font-weight: 700; display: flex; align-items: center; gap: 10px; flex: 1; justify-content: center; }
        .btn-admin-outline { background: white; border: 2px solid #e2e8f0; color: #475569; padding: 12px 24px; border-radius: 8px; font-weight: 700; display: flex; align-items: center; gap: 10px; flex: 1; justify-content: center; }
        .btn-admin-primary:hover:not(:disabled) { opacity: 0.9; transform: scale(1.02); }
        .btn-admin-outline:hover:not(:disabled) { border-color: #94a3b8; }

        /* Progress Bar */
        .sync-progress-box {
            margin-top: 25px;
            padding: 20px;
            border: 2px solid #e0e7ff;
            border-radius: 16px;
            background: linear-gradient(135deg, #f0f4ff 0%, #f8fafc 100%);
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.08);
        }

        .progress-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .progress-label {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.95rem;
            font-weight: 700;
            color: #0f172a;
        }

        .progress-spinner {
            display: inline-block;
            animation: spin 1s linear infinite;
            font-size: 1.2rem;
        }

        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .progress-percent {
            font-size: 1.1rem;
            font-weight: 900;
            color: #4f46e5;
            min-width: 50px;
            text-align: right;
        }

        .progress-bar-container {
            height: 14px;
            background: #e2e8f0;
            border-radius: 14px;
            overflow: hidden;
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);
            margin-bottom: 12px;
        }

        .progress-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #3b82f6 0%, #4f46e5 50%, #7c3aed 100%);
            position: relative;
            overflow: hidden;
        }

        .progress-bar-shimmer {
            position: absolute;
            top: 0;
            left: -100%;
            height: 100%;
            width: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
            animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
            0% { left: -100%; }
            100% { left: 100%; }
        }

        .progress-stats {
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-size: 0.85rem;
            color: #475569;
        }

        .stats-items {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .stat-item {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .stat-item strong {
            color: #4f46e5;
            font-size: 1rem;
        }

        .btn-cancel-sync {
            margin-top: 12px;
            width: 100%;
            padding: 10px 16px;
            background: #fee2e2;
            color: #dc2626;
            border: 1px solid #fca5a5;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .btn-cancel-sync:hover {
            background: #fecaca;
        }

        /* History */
        .history-section { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
        .history-section h4 { margin: 0 0 12px 0; font-size: 0.9rem; font-weight: 800; color: #334155; }
        .history-list { display: flex; flex-direction: column; gap: 8px; }
        .history-item { background: #f8fafc; padding: 10px 12px; border-radius: 8px; border-left: 4px solid var(--secondary-color, #003366); }
        .item-header { display: flex; justify-content: space-between; font-size: 0.7rem; font-weight: 800; margin-bottom: 4px; color: #94a3b8; }
        .item-title { font-size: 0.8rem; font-weight: 700; color: #334155; }

        /* Results / Profile */
        .admin-result-alert { margin-top: 20px; padding: 15px; border-radius: 8px; display: flex; align-items: center; gap: 10px; font-size: 0.85rem; font-weight: 700; }
        .admin-result-alert.is-success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
        .admin-result-alert.is-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
        .profile-content { margin-top: 15px; padding: 15px; background: #0f172a; color: #38bdf8; border-radius: 8px; font-size: 11px; max-height: 200px; overflow: auto; }

        /* Switches & Rest */
        .switch { position: relative; display: inline-block; width: 44px; height: 22px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .4s; }
        .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .4s; }
        input:checked + .slider { background-color: #22c55e; }
        input:checked + .slider:before { transform: translateX(22px); }
        .slider.round { border-radius: 34px; }
        .slider.round:before { border-radius: 50%; }
        /* Styles Oracle */
        .admin-oracle-section { padding: 30px; animation: fadeIn 0.5s ease-out; }
        .oracle-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)); gap: 25px; margin-top: 25px; }
        .oracle-card { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(10px); border-radius: 20px; border: 1px solid rgba(250, 250, 250, 0.5); overflow: hidden; transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .oracle-card:hover { transform: translateY(-5px); box-shadow: 0 15px 35px rgba(0,0,0,0.1); }
        .card-header { padding: 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; background: rgba(255,255,255,0.4); }
        .header-info { display: flex; align-items: center; gap: 15px; }
        .type-icon { width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, #6366f1, #a855f7); color: white; display: flex; align-items: center; justify-content: center; }
        .status-badge { padding: 5px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
        .status-badge.active { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
        .status-badge.inactive { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
        .card-body { padding: 25px; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .form-grid .full { grid-column: span 2; }
        .input-group label { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 600; color: #64748b; margin-bottom: 8px; }
        .input-group input { width: 100%; padding: 12px; border: 2px solid #f1f5f9; border-radius: 12px; font-size: 0.95rem; transition: border-color 0.2s, box-shadow 0.2s; background: white; }
        .input-group input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
        .toggle-container { margin: 20px 0; }
        .luxe-toggle { display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .luxe-toggle input { display: none; }
        .luxe-toggle .slider { width: 44px; height: 24px; background: #e2e8f0; border-radius: 24px; position: relative; transition: 0.3s; }
        .luxe-toggle .slider:before { content: ""; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .luxe-toggle input:checked + .slider { background: #6366f1; }
        .luxe-toggle input:checked + .slider:before { transform: translateX(20px); }
        .card-actions { display: flex; flex-direction: column; gap: 12px; margin-top: 25px; }
        .btn-save-luxe { width: 100%; background: #1e293b; color: white; border: none; padding: 12px; border-radius: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; transition: 0.2s; }
        .btn-save-luxe:hover { background: #0f172a; }
        .btn-group { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .btn-test-luxe { background: #f8fafc; color: #475569; border: 2px solid #f1f5f9; padding: 10px; border-radius: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: 0.2s; }
        .btn-test-luxe:hover { background: #f1f5f9; border-color: #e2e8f0; }
        .result-feedback { margin-top: 20px; padding: 15px; border-radius: 15px; display: flex; gap: 12px; align-items: flex-start; animation: slideInUp 0.3s ease-out; }
        .result-feedback.success { background: #f0fdf4; color: #166534; border: 1px solid #dcfce7; }
        .result-feedback.error { background: #fef2f2; color: #991b1b; border: 1px solid #fee2e2; }
        .result-title { font-weight: 600; font-size: 0.9rem; display: block; }
        .result-details { font-size: 0.8rem; margin-top: 5px; opacity: 0.9; }
        
        /* Oracle Import UI Styles */
        .oracle-tables-selector { background: #f8fafc; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; }
        .selector-title { font-size: 0.9rem; font-weight: 700; color: #1e293b; margin-bottom: 15px; }
        .tables-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; max-height: 250px; overflow-y: auto; padding: 10px; background: white; border-radius: 10px; border: 1px solid #f1f5f9; }
        .table-checkbox-label { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; cursor: pointer; transition: background 0.2s; }
        .table-checkbox-label:hover { background: #f1f5f9; }
        .table-checkbox-label input { width: 18px; height: 18px; cursor: pointer; }
        .table-name { font-size: 0.85rem; font-family: monospace; color: #475569; overflow: hidden; text-overflow: ellipsis; }
        
        /* New Table Config Styles */
        .search-mini { position: relative; display: flex; align-items: center; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px 10px; gap: 8px; }
        .search-mini input { border: none; outline: none; font-size: 0.8rem; width: 120px; }
        .table-row-config { border-bottom: 1px solid #f1f5f9; padding: 10px; transition: 0.2s; border-radius: 8px; }
        .table-row-config.selected { background: #f0f9ff; border-color: #bae6fd; }
        .table-filter-input { margin-top: 8px; padding-left: 28px; }
        .table-filter-input input { width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.75rem; background: white; color: #1e293b; font-family: monospace; }
        .table-filter-input input:focus { border-color: #6366f1; outline: none; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); }
        .tables-grid { display: flex; flex-direction: column; gap: 4px; max-height: 350px; overflow-y: auto; padding: 10px; background: white; border-radius: 10px; border: 1px solid #f1f5f9; }

        .btn-import-oracle { width: 100%; background: #6366f1; color: white; border: none; padding: 12px; border-radius: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; transition: 0.2s; }
        .btn-import-oracle:hover:not(:disabled) { background: #4f46e5; transform: translateY(-2px); }
        .btn-import-oracle:disabled { background: #cbd5e1; cursor: not-allowed; }

        .import-report { background: #1e293b; color: white; padding: 20px; border-radius: 16px; }
        .report-title { font-size: 0.9rem; font-weight: 700; margin-bottom: 15px; color: #94a3b8; }
        .report-list { display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto; }
        .report-item { display: flex; align-items: center; gap: 15px; padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.05); font-size: 0.8rem; }
        .report-item.ok { border-left: 4px solid #22c55e; }
        .report-item.error { border-left: 4px solid #ef4444; }
        .report-item.skip { border-left: 4px solid #f59e0b; }
        .item-table { font-weight: 700; font-family: monospace; min-width: 120px; }
        .item-status { font-weight: 800; font-size: 0.7rem; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; }
        .ok .item-status { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
        .error .item-status { background: rgba(239, 68, 68, 0.2); color: #f87171; }
        .item-count { color: #94a3b8; font-style: italic; }
        .item-msg { color: #f87171; font-size: 0.75rem; }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      {activeSubstModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-height-90vh overflow-auto">
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="text-xl font-bold">Configurations des Substitution ({activeSubstModal.table})</h3>
              <button onClick={() => setActiveSubstModal(null)} className="p-2 hover:bg-gray-100 rounded-full"><X /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">Fonctionnalité de jointure en cours de développement.</p>
              <button onClick={() => setActiveSubstModal(null)} className="btn-primary w-full">Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
