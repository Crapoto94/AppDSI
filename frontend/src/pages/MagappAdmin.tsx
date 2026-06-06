import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { Plus, Edit2, Trash2, Save, X, Globe, LayoutGrid, BarChart2, Bell, Tag, Code, CheckCircle, Settings, Users, Lightbulb, GraduationCap, Star, FileText, Wrench, Calendar, Paperclip, Download, Search, ChevronRight, Layers, Banknote, ShieldAlert, ExternalLink } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip as RTooltip } from 'recharts';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

interface Category {
  id: number;
  name: string;
  icon: string;
  display_order: number;
}

interface AppItem {
  id: number;
  category_id: number;
  name: string;
  description: string;
  url: string;
  icon: string;
  display_order: number;
  is_maintenance: number;
  maintenance_start: string | null;
  maintenance_end: string | null;
  app_type: string;
  present_magapp: string;
  present_onboard: string;
  email_createur: string;
  url_test?: string;
  lien_mercator: string;
  mercator_id: number | null;
  mercator_name: string;
  user_count?: number;
  normal_doc_count?: number;
  technical_doc_count?: number;
  project_manager_username?: string;
  project_manager_name?: string;
  contract_count?: number;
  future_maintenance_count?: number;
  ongoing_maintenance_count?: number;
  dsi_only?: number;
  orders_amount?: number;
  orders_count?: number;
}

interface Maintenance {
  id: number;
  app_id: number;
  app_name: string;
  app_icon: string;
  name: string;
  description: string;
  severity: 'mineure' | 'majeure';
  has_interruption: boolean;
  start_date: string;
  end_date: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface MaintenanceAttachment {
  id: number;
  maintenance_id: number;
  filename: string;
  original_name: string;
  file_path: string;
  file_size: number;
  created_at: string;
}

interface AppUser {
  id: number;
  app_id: number;
  username: string;
  display_name: string;
  last_connection: string;
  source?: 'magapp' | 'admin';
}


interface ClickStats {
  id: number;
  name: string;
  total_clicks: number;
  avg_clicks_per_day: number;
  avg_unique_users_per_day: number;
  has_today_stats: number;
  today_clicks: number;
}

interface Subscription {
  id: number;
  app_id: number;
  email: string;
  app_name: string;
  subscribed_at: string;
}

interface AppVersion {
  id: number;
  version_number: string;
  release_notes_html: string;
  release_date: string;
  is_active: boolean;
}

interface PostgresSettings {
  id: number;
  is_enabled: number;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  updated_at: string;
}

interface AppDoc {
  id: number;
  app_id: number;
  title: string;
  doc_type: 'pdf' | 'youtube' | 'link';
  url: string;
  description?: string;
  is_obsolete: boolean;
  is_favorite: boolean;
  is_technical: boolean;
  created_at: string;
  app_name?: string;
}

interface DocStats {
  id: number;
  title: string;
  app_name: string;
  total_views: number;
  avg_rating: number;
  total_ratings: number;
}

const MagappAdmin: React.FC = () => {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<ClickStats[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [activeTab, setActiveTab] = useState<'apps' | 'categories' | 'versions' | 'subscriptions' | 'maintenances' | 'stats' | 'postgres' | 'settings' | 'ideas' | 'library'>('apps');
  const [showAllStats, setShowAllStats] = useState(false);
  const [editingApp, setEditingApp] = useState<AppItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [postgresSettings, setPostgresSettings] = useState<PostgresSettings | null>(null);
  const [newCategory, setNewCategory] = useState<Partial<Category>>({ name: '', icon: '', display_order: 0 });
  const [newApp, setNewApp] = useState<Partial<AppItem>>({
    name: '', 
    category_id: 1, 
    description: '', 
    url: '', 
    icon: '/api/img/default.png', 
    display_order: 0,
    is_maintenance: 0,
    app_type: 'web',
    present_magapp: '1',
    present_onboard: '0',
    dsi_only: 0
  });

  const [docs, setDocs] = useState<AppDoc[]>([]);
  const [docStats, setDocStats] = useState<DocStats[]>([]);
  const [editingDoc, setEditingDoc] = useState<AppDoc | null>(null);
  const [filterLibApp, setFilterLibApp] = useState<number | 'all'>('all');
  const [newDoc, setNewDoc] = useState<Partial<AppDoc>>({ 
    title: '', 
    description: '',
    app_id: 0, 
    doc_type: 'pdf', 
    url: '', 
    is_favorite: false,
    is_technical: false,
    is_obsolete: false
  });
  const [magappSettings, setMagappSettings] = useState<{show_tickets: boolean, show_subscriptions: boolean, show_health_check: boolean, show_create_buttons: boolean, show_ideas: boolean, show_rencontres: boolean, show_library: boolean, show_consommables: boolean, show_chat_live: boolean}>({
    show_tickets: true,
    show_subscriptions: true,
    show_health_check: true,
    show_create_buttons: true,
    show_ideas: true,
    show_rencontres: true,
    show_library: false,
    show_consommables: true,
    show_chat_live: false,
  });
  const [showDocModal, setShowDocModal] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [ticketCounts, setTicketCounts] = useState<Record<number, { incident_count: number; request_count: number; total: number }>>({});
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [mercatorApps, setMercatorApps] = useState<{id: number, name: string, description?: string}[]>([]);
  const [editingVersion, setEditingVersion] = useState<AppVersion | null>(null);
  const [newVersion, setNewVersion] = useState({ version_number: '', release_notes_html: '' });
  const [showAppModal, setShowAppModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [appToDelete, setAppToDelete] = useState<AppItem | null>(null);
  const [filterPublished, setFilterPublished] = useState<'all' | 'oui' | 'non'>('all');
  const [filterContracts, setFilterContracts] = useState<'all' | 'with' | 'without'>('all');
  const [filterDsi, setFilterDsi] = useState<'all' | 'dsi' | 'other'>('all');
  const [appSearch, setAppSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<number | 'all'>('all');
  const [appSort, setAppSort] = useState<'name' | 'users' | 'orders' | 'docs'>('name');
  const [filterPM, setFilterPM] = useState<string>('all');
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [clicksTimeline, setClicksTimeline] = useState<{ month: string; clicks: number; users: number }[]>([]);
  const [allContracts, setAllContracts] = useState<any[]>([]);
  const [infoModal, setInfoModal] = useState<{ title: string } | null>(null);
  const [infoItems, setInfoItems] = useState<{ primary: string; secondary?: string; right?: string }[]>([]);
  const [infoLoading, setInfoLoading] = useState(false);

  // Modal tickets par logiciel
  const [ticketModal, setTicketModal] = useState<{ appId: number; appName: string; type: '1' | '2' } | null>(null);
  const [ticketModalData, setTicketModalData] = useState<any[]>([]);
  const [ticketModalLoading, setTicketModalLoading] = useState(false);

  // User tracking states
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [adSearchQuery, setAdSearchQuery] = useState('');
  const [adResults, setAdResults] = useState<{username: string, displayName: string, email: string}[]>([]);

  // Chef de projet AD search
  const [pmSearchQuery, setPmSearchQuery] = useState('');
  const [pmSearchResults, setPmSearchResults] = useState<{username: string, displayName: string, email: string}[]>([]);
  const [isSearchingPM, setIsSearchingPM] = useState(false);

  // Ideas states
  const [allIdeas, setAllIdeas] = useState<{id: number, title: string, description: string, author_email: string, author_name: string, status: string, admin_response: string, created_at: string, attachments: any[]}[]>([]);
  const [isSearchingAD, setIsSearchingAD] = useState(false);
  const [modalTab, setModalTab] = useState<'general' | 'users'>('general');

  // Maintenance states
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState<Maintenance | null>(null);
  const [newMaintenance, setNewMaintenance] = useState<{app_id: number, name: string, description: string, severity: 'mineure' | 'majeure', has_interruption: boolean, start_date: string, end_date: string}>({
    app_id: 0, name: '', description: '', severity: 'mineure', has_interruption: false, start_date: '', end_date: ''
  });
  const [maintenanceFiles, setMaintenanceFiles] = useState<File[]>([]);
  const [maintenanceAttachments, setMaintenanceAttachments] = useState<Record<number, MaintenanceAttachment[]>>({});
  const [isUploadingMaintenance, setIsUploadingMaintenance] = useState(false);
  const [maintenanceFilterApp, setMaintenanceFilterApp] = useState<number | 'all'>('all');

  const token = localStorage.getItem('token');

  // Les compteurs (COUNT) reviennent de PostgreSQL en chaînes → coercition numérique
  // pour éviter les concaténations lors des sommes (KPI, totaux).
  const normApps = (list: any[]): AppItem[] => (Array.isArray(list) ? list : []).map((a: any) => ({
    ...a,
    user_count: Number(a.user_count) || 0,
    normal_doc_count: Number(a.normal_doc_count) || 0,
    technical_doc_count: Number(a.technical_doc_count) || 0,
    future_maintenance_count: Number(a.future_maintenance_count) || 0,
    ongoing_maintenance_count: Number(a.ongoing_maintenance_count) || 0,
    contract_count: Number(a.contract_count) || 0,
    orders_amount: Number(a.orders_amount) || 0,
    orders_count: Number(a.orders_count) || 0,
  }));

  const fetchData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [appsRes, catsRes, statsRes, pgSettingsRes, settingsRes, mercatorRes] = await Promise.all([
        fetch('/api/magapp/apps', { headers }),
        fetch('/api/magapp/categories', { headers }),
        fetch('/api/magapp/stats', { headers }),
        fetch('/api/postgres-settings', { headers }),
        fetch('/api/magapp/settings?real=true', { headers }),
        fetch('/api/magapp/mercator-apps', { headers })
      ]);

      if (appsRes.ok) setApps(normApps(await appsRes.json()));
      if (catsRes.ok) setCategories(await catsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (pgSettingsRes.ok) setPostgresSettings(await pgSettingsRes.json());
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setMagappSettings({
          show_tickets: data.show_tickets_original ?? data.show_tickets ?? true,
          show_subscriptions: data.show_subscriptions_original ?? data.show_subscriptions ?? true,
          show_health_check: data.show_health_check_original ?? data.show_health_check ?? true,
          show_create_buttons: data.show_create_buttons_original ?? data.show_create_buttons ?? true,
          show_ideas: data.show_ideas_original ?? data.show_ideas ?? true,
          show_rencontres: data.show_rencontres_original ?? data.show_rencontres ?? true,
          show_library: data.show_library_original ?? data.show_library ?? false,
          show_consommables: data.show_consommables_original ?? data.show_consommables ?? true,
          show_chat_live: data.show_chat_live ?? false,
        });
      }
      if (mercatorRes.ok) setMercatorApps(await mercatorRes.json());
      fetch('/api/magapp/clicks-timeline', { headers })
        .then(r => r.ok ? r.json() : [])
        .then(d => setClicksTimeline(Array.isArray(d) ? d : []))
        .catch(() => {});
      fetchLibrary();
    } catch (e) { console.error(e); }
  };

  const fetchApps = async () => {
    try {
      const [appsRes, contratsRes] = await Promise.all([
        fetch('/api/magapp/apps', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/contrats', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      if (appsRes.ok) {
        const appsList = normApps(await appsRes.json());
        const contractCount: Record<number, number> = {};

        // Compter les contrats par app_id
        if (contratsRes.ok) {
          try {
            const contrats = await contratsRes.json();
            if (Array.isArray(contrats)) {
              setAllContracts(contrats);
              contrats.forEach((c: any) => {
                if (c.app_id) {
                  contractCount[c.app_id] = (contractCount[c.app_id] || 0) + 1;
                }
              });
            }
          } catch (e) {
            console.error('[MagappAdmin] Erreur parsing contrats:', e);
          }
        } else {
          console.warn('[MagappAdmin] Contrats API non OK:', contratsRes.status);
        }

        // Ajouter le contract_count à chaque app
        const appsWithContracts = appsList.map((app: AppItem) => ({
          ...app,
          contract_count: contractCount[app.id] || 0
        }));

        console.log('[MagappAdmin] Apps avec contrats:', appsWithContracts.filter((a: AppItem) => (a.contract_count || 0) > 0));
        setApps(appsWithContracts);
        fetchTicketCounts();
      }
    } catch (e) { console.error('[MagappAdmin] Erreur fetchApps:', e); }
  };

  const fetchTicketCounts = async () => {
    try {
      const response = await fetch('/api/tickets/ticket-stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const countMap: Record<number, { incident_count: number; request_count: number; total: number }> = {};
        data.forEach((item: any) => {
          if (item.software_id) {
            countMap[item.software_id] = {
              incident_count: item.incident_count || 0,
              request_count: item.request_count || 0,
              total: item.ticket_count || 0
            };
          }
        });
        setTicketCounts(countMap);
      }
    } catch (e) { console.error('[MagappAdmin] Erreur fetchTicketCounts:', e); }
  };

  const openTicketModal = async (appId: number, appName: string, type: '1' | '2') => {
    setTicketModal({ appId, appName, type });
    setTicketModalData([]);
    setTicketModalLoading(true);
    try {
      const res = await fetch(
        `/api/tickets?software_id=${appId}&type=${type}&status_in=1,2,3,4&limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json();
      setTicketModalData(json.data || []);
    } catch (e) {
      console.error('Erreur chargement tickets:', e);
    } finally {
      setTicketModalLoading(false);
    }
  };

  const fetchLibrary = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [docsRes, docStatsRes] = await Promise.all([
        fetch('/api/admin/magapp/docs', { headers }),
        fetch('/api/admin/magapp/docs/stats', { headers })
      ]);
      if (docsRes.ok) setDocs(await docsRes.json());
      if (docStatsRes.ok) setDocStats(await docStatsRes.json());
    } catch (e) { console.error(e); }
  };

  const fetchSubscriptions = async () => {
    try {
      const response = await fetch('/api/magapp/subscriptions', { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) setSubscriptions(await response.json());
    } catch (e) { console.error(e); }
  };

  const fetchVersions = async () => {
    try {
      const response = await fetch('/api/magapp/versions');
      if (response.ok) setVersions(await response.json());
    } catch (e) { console.error(e); }
  };

  const fetchIdeas = async () => {
    try {
      const response = await fetch('/api/admin/magapp/ideas', { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) setAllIdeas(await response.json());
    } catch (e) { console.error(e); }
  };

  const handleUploadDocFile = async (_appId: number, appName: string): Promise<string | null> => {
    if (!docFile) return null;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', docFile);
      const sanitizedAppName = appName
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_-]/g, '');

      const res = await fetch(`/api/admin/magapp/docs/upload?app_name=${encodeURIComponent(sanitizedAppName)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        return data.url;
      }
      return null;
    } catch (err) {
      console.error('Upload error:', err);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreateDoc = async () => {
    if (!newDoc.app_id || !newDoc.title || (!newDoc.url && !docFile)) {
      alert('Veuillez remplir tous les champs obligatoires (Application, Titre, URL ou Fichier)');
      return;
    }
    try {
      let finalUrl = newDoc.url;
      if (newDoc.doc_type === 'pdf' && docFile) {
        const appName = apps.find(a => a.id === newDoc.app_id)?.name || '';
        const uploadedUrl = await handleUploadDocFile(newDoc.app_id, appName);
        if (uploadedUrl) finalUrl = uploadedUrl;
      }
      
      const response = await fetch('/api/admin/magapp/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...newDoc, url: finalUrl })
      });
      if (response.ok) {
        setNewDoc({ title: '', description: '', app_id: 0, doc_type: 'pdf', url: '', is_favorite: false, is_technical: false, is_obsolete: false });
        setDocFile(null);
        setShowDocModal(false);
        fetchLibrary();
        fetchApps();
      } else {
        const err = await response.json();
        alert(`Erreur : ${err.message}`);
      }
    } catch (err) { console.error(err); }
  };

  const handleUpdateDoc = async (doc: AppDoc) => {
    try {
      let finalUrl = doc.url;
      if (doc.doc_type === 'pdf' && docFile) {
        const appName = apps.find(a => a.id === doc.app_id)?.name || '';
        const uploadedUrl = await handleUploadDocFile(doc.app_id, appName);
        if (uploadedUrl) finalUrl = uploadedUrl;
      }

      const response = await fetch(`/api/admin/magapp/docs/${doc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...doc, url: finalUrl })
      });
      if (response.ok) {
        setEditingDoc(null);
        setDocFile(null);
        setShowDocModal(false);
        fetchLibrary();
        fetchApps();
      }
    } catch (err) { console.error(err); }
  };

  const handleDeleteDoc = async (id: number) => {
    if (window.confirm('Supprimer ce document ?')) {
      try {
        const response = await fetch(`/api/admin/magapp/docs/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) { fetchLibrary(); fetchApps(); }
      } catch (err) { console.error(err); }
    }
  };

  const handleUpdateIdeaStatus = async (id: number, status: string) => {
    try {
      await fetch(`/api/admin/magapp/ideas/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status })
      });
      fetchIdeas();
    } catch (e) { console.error(e); }
  };

  const handleDeleteIdea = async (id: number) => {
    if (!window.confirm('Supprimer cette idée ?')) return;
    try {
      await fetch(`/api/admin/magapp/ideas/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      fetchIdeas();
    } catch (e) { console.error(e); }
  };

  // Maintenance CRUD
  const fetchMaintenances = async () => {
    try {
      const response = await fetch('/api/admin/magapp/maintenances', { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) setMaintenances(await response.json());
    } catch (e) { console.error(e); }
  };

  const fetchMaintenanceAttachmentsForAll = async (maintenancesList?: Maintenance[]) => {
    try {
      const list = maintenancesList || maintenances;
      if (list.length === 0) return;
      const attachmentPromises = list.map((m: Maintenance) =>
        fetch(`/api/admin/magapp/maintenances/${m.id}/attachments`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.ok ? r.json() : [])
      );
      const allAttachments = await Promise.all(attachmentPromises);
      const attachmentMap: Record<number, MaintenanceAttachment[]> = {};
      list.forEach((m: Maintenance, i: number) => {
        attachmentMap[m.id] = allAttachments[i] || [];
      });
      setMaintenanceAttachments(attachmentMap);
    } catch (e) { console.error(e); }
  };

  const handleSaveMaintenance = async () => {
    if (!newMaintenance.name || !newMaintenance.start_date || !newMaintenance.end_date) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }
    try {
      const url = editingMaintenance ? `/api/admin/magapp/maintenances/${editingMaintenance.id}` : '/api/admin/magapp/maintenances';
      const method = editingMaintenance ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(newMaintenance)
      });
      if (response.ok) {
        if (!editingMaintenance) {
          const created = await response.json();
          // Upload files if any
          if (maintenanceFiles.length > 0) {
            await uploadMaintenanceFiles(created.id);
          }
        }
        setShowMaintenanceModal(false);
        setEditingMaintenance(null);
        setNewMaintenance({ app_id: 0, name: '', description: '', severity: 'mineure', has_interruption: false, start_date: '', end_date: '' });
        setMaintenanceFiles([]);
        fetchMaintenances();
        fetchMaintenanceAttachmentsForAll();
      }
    } catch (e) { console.error(e); }
  };

  const uploadMaintenanceFiles = async (maintenanceId: number): Promise<void> => {
    if (maintenanceFiles.length === 0) return;
    setIsUploadingMaintenance(true);
    try {
      const formData = new FormData();
      formData.append('maintenance_id', String(maintenanceId));
      maintenanceFiles.forEach(f => formData.append('files', f));
      await fetch('/api/admin/magapp/maintenances/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
    } catch (e) { console.error(e); }
    setIsUploadingMaintenance(false);
  };

  const handleDeleteMaintenance = async (id: number) => {
    if (!window.confirm('Supprimer cette maintenance ?')) return;
    try {
      await fetch(`/api/admin/magapp/maintenances/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      fetchMaintenances();
      fetchMaintenanceAttachmentsForAll();
    } catch (e) { console.error(e); }
  };

  const toLocalDatetime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openMaintenanceModal = (appId: number, maintenance?: Maintenance) => {
    if (maintenance) {
      setEditingMaintenance(maintenance);
      setNewMaintenance({
        app_id: maintenance.app_id,
        name: maintenance.name,
        description: maintenance.description,
        severity: maintenance.severity,
        has_interruption: maintenance.has_interruption,
        start_date: toLocalDatetime(maintenance.start_date),
        end_date: toLocalDatetime(maintenance.end_date)
      });
    } else {
      setEditingMaintenance(null);
      setNewMaintenance({ app_id: appId, name: '', description: '', severity: 'mineure', has_interruption: false, start_date: '', end_date: '' });
      setMaintenanceFiles([]);
    }
    setShowMaintenanceModal(true);
  };

  useEffect(() => { fetchData(); fetchApps(); fetchVersions(); fetchSubscriptions(); fetchIdeas(); }, []);

  // Courbe d'usages filtrée par le logiciel sélectionné (ou globale si aucun).
  useEffect(() => {
    const url = selectedAppId ? `/api/magapp/clicks-timeline?app_id=${selectedAppId}` : '/api/magapp/clicks-timeline';
    fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => setClicksTimeline(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [selectedAppId]);

  // Liste détaillée au clic sur un KPI du panneau (utilisateurs, docs, contrats, commandes).
  const openAppList = async (kind: 'users' | 'docs' | 'contracts' | 'orders', app: AppItem) => {
    const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '';
    if (kind === 'contracts') {
      const items = allContracts.filter((c: any) => c.app_id === app.id)
        .map((c: any) => ({ primary: c.objet || c.raison_sociale || `Contrat #${c.id}`, secondary: c.raison_sociale || c.tiers_nom || '', right: c.date_fin ? `échéance ${fmtDate(c.date_fin)}` : '' }));
      setInfoItems(items); setInfoModal({ title: `Contrats — ${app.name}` }); return;
    }
    setInfoLoading(true); setInfoItems([]); setInfoModal({ title: `${kind === 'users' ? 'Utilisateurs' : kind === 'docs' ? 'Documents' : 'Commandes'} — ${app.name}` });
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      if (kind === 'users') {
        const r = await fetch(`/api/magapp/apps/${app.id}/users`, { headers });
        const d = r.ok ? await r.json() : [];
        setInfoItems((Array.isArray(d) ? d : []).map((u: any) => ({ primary: u.display_name || u.username, secondary: u.username, right: u.last_connection ? `dernière connexion ${fmtDate(u.last_connection)}` : (u.source || '') })));
      } else if (kind === 'docs') {
        const r = await fetch(`/api/magapp/apps/${app.id}/docs`, { headers });
        const d = r.ok ? await r.json() : [];
        setInfoItems((Array.isArray(d) ? d : []).filter((x: any) => !x.is_obsolete).map((x: any) => ({ primary: x.title, secondary: x.description || '', right: (x.doc_type || '').toUpperCase() })));
      } else if (kind === 'orders') {
        const r = await fetch(`/api/magapp/apps/${app.id}/orders`, { headers });
        const d = r.ok ? await r.json() : [];
        setInfoItems((Array.isArray(d) ? d : []).map((o: any) => ({ primary: o.libelle || o.num, secondary: `N° ${o.num}${o.date_commande ? ' · ' + fmtDate(o.date_commande) : ''}${o.service ? ' · ' + o.service : ''}`, right: (Number(String(o.montant_ttc).replace(',', '.')) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) })));
      }
    } catch (e) { /* ignore */ }
    setInfoLoading(false);
  };
  useEffect(() => {
    if (activeTab === 'subscriptions') fetchSubscriptions();
    if (activeTab === 'versions') fetchVersions();
    if (activeTab === 'ideas') fetchIdeas();
    if (activeTab === 'maintenances') {
      fetch('/api/admin/magapp/maintenances', { headers: { 'Authorization': `Bearer ${token}` } }).then(async (res) => {
        if (res.ok) { const data = await res.json(); setMaintenances(data); fetchMaintenanceAttachmentsForAll(data); }
      });
    }
  }, [activeTab]);

  // Set default category for "New App" when categories change
  useEffect(() => {
    if (categories.length > 0 && !newApp.category_id) {
       setNewApp(prev => ({ ...prev, category_id: categories[0].id }));
    } else if (categories.length > 0 && newApp.category_id === 1 && !categories.find(c => c.id === 1)) {
       // If default 1 is not in list, pick the first one
       setNewApp(prev => ({ ...prev, category_id: categories[0].id }));
    }
  }, [categories]);

  const handleSaveApp = async (appData: Partial<AppItem>, isEditing: boolean) => {
    const url = isEditing ? `/api/magapp/apps/${appData.id}` : '/api/magapp/apps';
    const method = isEditing ? 'PUT' : 'POST';
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(appData)
      });
      if (response.ok) { 
        setEditingApp(null); 
        setShowAppModal(false);
        fetchData();
        if (!isEditing) {
          setNewApp({
            name: '', 
            category_id: categories[0]?.id || 1, 
            description: '', 
            url: '',
            url_test: '',
            icon: '/api/img/default.png',
            display_order: 0,
            is_maintenance: 0,
            maintenance_start: '',
            maintenance_end: '',
            app_type: 'Web',
            present_magapp: 'oui',
            present_onboard: 'oui',
            email_createur: '',
            lien_mercator: '',
            mercator_id: null,
            mercator_name: '',
            dsi_only: 0
          });
        }
      } else {
        const errData = await response.json();
        alert(`Erreur: ${errData.message || 'Échec de la sauvegarde'}`);
      }
    } catch (e) { 
      console.error(e);
      alert("Erreur réseau ou serveur"); 
    }
  };

  const handleDeleteApp = (app: AppItem) => {
    setAppToDelete(app);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!appToDelete) return;
    try {
      const response = await fetch(`/api/magapp/apps/${appToDelete.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) {
        setShowDeleteModal(false);
        setAppToDelete(null);
        fetchData();
      } else {
        const err = await response.json();
        alert("Erreur lors de la suppression: " + (err.message || "Cause inconnue"));
      }
    } catch (e) {
      alert("Erreur réseau lors de la suppression");
    }
  };

  const handleIconUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('target_type', 'magapp_icon');
    formData.append('icon', file);
    
    try {
      const response = await fetch('/api/magapp/upload-icon', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (response.ok) {
        const data = await response.json();
        if (editingApp) setEditingApp({ ...editingApp, icon: data.url });
        else setNewApp({ ...newApp, icon: data.url });
      } else {
        alert("Erreur lors de l'upload de l'icône");
      }
    } catch (e) {
      console.error(e);
      alert("Erreur réseau");
    }
  };

  const handleSaveCategory = async (catData: Partial<Category>, isEditing: boolean) => {
    const url = isEditing ? `/api/magapp/categories/${catData.id}` : '/api/magapp/categories';
    const method = isEditing ? 'PUT' : 'POST';
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(catData)
      });
      if (response.ok) { setEditingCategory(null); fetchData(); }
    } catch (e) { alert("Erreur"); }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!window.confirm("Supprimer cette catégorie ?")) return;
    await fetch(`/api/magapp/categories/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    fetchData();
  };

  const handleDeleteSubscription = async (id: number) => {
    if (!window.confirm("Supprimer cet abonnement ?")) return;
    await fetch(`/api/magapp/subscriptions/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    fetchSubscriptions();
  };

  const handleSaveVersion = async (vData: any, isEditing: boolean) => {
    const url = isEditing ? `/api/admin/magapp/versions/${vData.id}` : '/api/admin/magapp/versions';
    const method = isEditing ? 'PUT' : 'POST';
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(vData)
    });
    if (response.ok) { setEditingVersion(null); setNewVersion({ version_number: '', release_notes_html: '' }); fetchVersions(); }
  };

  const handleDeleteVersion = async (id: number) => {
    if (!window.confirm("Supprimer cette version ?")) return;
    await fetch(`/api/admin/magapp/versions/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    fetchVersions();
  };

  const handleActivateVersion = async (id: number) => {
    await fetch(`/api/admin/magapp/versions/${id}/activate`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
    fetchVersions();
  };

  const handleSavePostgresSettings = async () => {
    if (!postgresSettings) return;
    await fetch('/api/postgres-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(postgresSettings)
    });
    alert('Config mise à jour');
  };

  const handleSaveMagappSettings = async () => {
    try {
      const response = await fetch('/api/magapp/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(magappSettings)
      });
      if (response.ok) {
        alert('Paramètres MagApp mis à jour avec succès');
      } else {
        alert('Erreur lors de la mise à jour des paramètres');
      }
    } catch (e) {
      alert("Erreur réseau");
    }
  };

  const fetchAppUsers = async (appId: number) => {
    try {
      const response = await fetch(`/api/magapp/apps/${appId}/users`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) setAppUsers(await response.json());
    } catch (e) { console.error(e); }
  };

  const handleSearchAD = async () => {
    if (adSearchQuery.length < 2) return;
    setIsSearchingAD(true);
    try {
      const response = await fetch('/api/magapp/ad/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ query: adSearchQuery })
      });
      if (response.ok) setAdResults(await response.json());
    } catch (e) { console.error(e); }
    finally { setIsSearchingAD(false); }
  };

  const handleSearchPM = async () => {
    if (pmSearchQuery.length < 2) return;
    setIsSearchingPM(true);
    try {
      const response = await fetch('/api/magapp/ad/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ query: pmSearchQuery })
      });
      if (response.ok) setPmSearchResults(await response.json());
    } catch (e) { console.error(e); }
    finally { setIsSearchingPM(false); }
  };

  const selectPM = (username: string, displayName: string) => {
    if (editingApp) {
      setEditingApp({ ...editingApp, project_manager_username: username, project_manager_name: displayName });
    } else {
      setNewApp({ ...newApp, project_manager_username: username, project_manager_name: displayName });
    }
    setPmSearchQuery('');
    setPmSearchResults([]);
  };

  const handleAddUserToApp = async (username: string, displayName: string) => {
    if (!editingApp) return;
    try {
      const response = await fetch(`/api/magapp/apps/${editingApp.id}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ username, display_name: displayName })
      });
      if (response.ok) {
        fetchAppUsers(editingApp.id);
        setAdSearchQuery('');
        setAdResults([]);
        fetchData();
      } else {
        const errorData = await response.json();
        alert(`Erreur: ${errorData.message || 'Impossible d\'ajouter l\'utilisateur'}`);
      }
    } catch (e) {
      console.error('Add user error:', e);
      alert(`Erreur: ${(e as Error).message}`);
    }
  };

  const handleRemoveUserFromApp = async (username: string) => {
    if (!editingApp || !window.confirm(`Retirer ${username} de la liste ?`)) return;
    try {
      const response = await fetch(`/api/magapp/apps/${editingApp.id}/users/${username}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchAppUsers(editingApp.id);
        fetchData(); // refresh user count
      }
    } catch (e) { console.error(e); }
  };


  const filteredStats = showAllStats ? stats : stats.filter(s => s.today_clicks > 0);
  const catName = (id: number) => categories.find(c => c.id === id)?.name || '—';

  const filteredApps = apps.filter(app => {
    const publishedMatch = filterPublished === 'all' || app.present_magapp === filterPublished;
    const contractMatch =
      filterContracts === 'all' ||
      (filterContracts === 'with' && (app.contract_count || 0) > 0) ||
      (filterContracts === 'without' && (app.contract_count || 0) === 0);
    const dsiMatch = filterDsi === 'all' || (filterDsi === 'dsi' && app.dsi_only) || (filterDsi === 'other' && !app.dsi_only);
    const categoryMatch = filterCategory === 'all' || app.category_id === filterCategory;
    const pmMatch = filterPM === 'all'
      || (filterPM === '__none__' ? !app.project_manager_name : app.project_manager_name === filterPM);
    const s = appSearch.trim().toLowerCase();
    const searchMatch = !s ||
      (app.name || '').toLowerCase().includes(s) ||
      (app.url || '').toLowerCase().includes(s) ||
      (app.description || '').toLowerCase().includes(s) ||
      (app.project_manager_name || '').toLowerCase().includes(s);
    return publishedMatch && contractMatch && dsiMatch && categoryMatch && searchMatch && pmMatch;
  }).sort((a, b) => {
    if (appSort === 'users') return (b.user_count || 0) - (a.user_count || 0);
    if (appSort === 'orders') return (b.orders_amount || 0) - (a.orders_amount || 0);
    if (appSort === 'docs') return ((b.normal_doc_count || 0) + (b.technical_doc_count || 0)) - ((a.normal_doc_count || 0) + (a.technical_doc_count || 0));
    return (a.name || '').localeCompare(b.name || '', 'fr');
  });

  // KPI généraux (sur l'ensemble du catalogue)
  const magKpi = {
    total: apps.length,
    published: apps.filter(a => a.present_magapp === 'oui').length,
    hidden: apps.filter(a => a.present_magapp !== 'oui').length,
    maintenance: apps.filter(a => (a.ongoing_maintenance_count || 0) > 0).length,
    dsi: apps.filter(a => a.dsi_only).length,
    users: apps.reduce((s, a) => s + (a.user_count || 0), 0),
    docs: apps.reduce((s, a) => s + (a.normal_doc_count || 0) + (a.technical_doc_count || 0), 0),
    contracts: apps.reduce((s, a) => s + (a.contract_count || 0), 0),
    ordersAmount: apps.reduce((s, a) => s + (a.orders_amount || 0), 0),
  };
  const eur0 = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const selApp = selectedAppId != null ? apps.find(a => a.id === selectedAppId) || null : null;

  // Styles (refonte master-détail)
  const mkCard: React.CSSProperties = { background: '#fff', border: '1px solid #e8ecf3', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 2px rgba(16,24,40,.04)' };
  const mkLabel: React.CSSProperties = { fontSize: '.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' };
  const mkBig: React.CSSProperties = { fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 };
  const mkSub: React.CSSProperties = { fontSize: '.74rem', color: '#94a3b8', marginTop: 3 };
  const mkSelect: React.CSSProperties = { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: '.82rem', color: '#334155', background: '#fff', outline: 'none', cursor: 'pointer' };
  const totalClicks12 = clicksTimeline.reduce((s, r) => s + (r.clicks || 0), 0);
  // 'YYYY-MM' → 'avr. 25' (court) / 'avril 2025' (long)
  const monthLabel = (ym: string) => {
    const [y, m] = String(ym).split('-').map(Number);
    if (!y || !m) return ym;
    return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  };
  const monthLabelLong = (ym: string) => {
    const [y, m] = String(ym).split('-').map(Number);
    if (!y || !m) return ym;
    return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  };
  const projectManagers = [...new Set(apps.map(a => a.project_manager_name).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, 'fr'));

  return (
    <div className="magapp-admin-container animate-fade-in">
      <Header />
      
      <div className="magapp-admin-content container">
        <header className="admin-header-v2">
          <div className="header-info">
            <h1>Administration MagApp</h1>
            <p>Pilotage du catalogue et des statistiques d'usage.</p>
          </div>
          
          <nav className="admin-tabs-v2">
            {[
              { id: 'apps', icon: <LayoutGrid size={18} />, label: 'Applications' },
              { id: 'categories', icon: <Tag size={18} />, label: 'Catégories' },
              { id: 'versions', icon: <Code size={18} />, label: 'Versions' },
              { id: 'subscriptions', icon: <Bell size={18} />, label: 'Abonnés' },
              { id: 'maintenances', icon: <Wrench size={18} />, label: 'Maintenances' },
              { id: 'ideas', icon: <Lightbulb size={18} />, label: 'Idées' },
              { id: 'stats', icon: <BarChart2 size={18} />, label: 'Stats' },
              { id: 'library', icon: <GraduationCap size={18} />, label: 'Bibliothèque' },
              { id: 'postgres', icon: <Globe size={18} />, label: 'DB' },
              { id: 'settings', icon: <Settings size={18} />, label: 'Paramètres' }
            ].map(tab => (
              <button 
                key={tab.id}
                className={`tab-btn-v2 ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id as any)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </header>

        <main className="admin-workspace-v2">
          {activeTab === 'apps' && (
            <div className="workspace-grid" style={{ gridTemplateColumns: '1fr' }}>
              <section className="workspace-section" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* ===== KPI band ===== */}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ ...mkCard, flex: '2 1 300px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={mkLabel}>Évolution des usages · clics / mois{selApp ? ` · ${selApp.name}` : ' · global'}</div>
                    <div style={{ height: 110 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={clicksTimeline} margin={{ top: 6, right: 2, left: 2, bottom: 0 }}>
                          <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} />
                          <RTooltip formatter={(v: any) => [`${v} clic(s)`, '']} labelFormatter={(l: any) => monthLabelLong(l)} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.12)', fontSize: 12 }} cursor={{ fill: 'rgba(99,102,241,.08)' }} />
                          <Bar dataKey="clicks" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={mkSub}>{totalClicks12.toLocaleString('fr-FR')} clics sur 12 mois</div>
                  </div>

                  <div style={{ ...mkCard, flex: '1 1 150px', minWidth: 150 }}>
                    <div style={mkLabel}>Applications</div>
                    <div style={mkBig}>{magKpi.total}</div>
                    <div style={mkSub}><span style={{ color: '#16a34a', fontWeight: 700 }}>{magKpi.published} publiées</span> · {magKpi.hidden} masquées</div>
                  </div>

                  <div style={{ ...mkCard, flex: '1 1 150px', minWidth: 150 }}>
                    <div style={mkLabel}>Maintenance · DSI</div>
                    <div style={mkBig}>{magKpi.maintenance}</div>
                    <div style={mkSub}>{magKpi.maintenance} en cours · {magKpi.dsi} réservées DSI</div>
                  </div>

                  <div style={{ ...mkCard, flex: '1 1 170px', minWidth: 170 }}>
                    <div style={mkLabel}>Commandes associées</div>
                    <div style={{ ...mkBig, color: '#1e40af' }}>{eur0(magKpi.ordersAmount)}</div>
                    <div style={mkSub}>total TTC lié aux logiciels</div>
                  </div>

                  <div style={{ ...mkCard, flex: '1 1 150px', minWidth: 150 }}>
                    <div style={mkLabel}>Utilisateurs · Contrats</div>
                    <div style={mkBig}>{magKpi.users} <span style={{ fontSize: '.9rem', color: '#94a3b8', fontWeight: 600 }}>util.</span></div>
                    <div style={mkSub}>{magKpi.contracts} contrats liés</div>
                  </div>

                  <div style={{ ...mkCard, flex: '1 1 150px', minWidth: 150 }}>
                    <div style={mkLabel}>Documents</div>
                    <div style={mkBig}>{magKpi.docs}</div>
                    <div style={mkSub}>documentations associées</div>
                  </div>
                </div>

                {/* ===== Toolbar filtres ===== */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 220 }}>
                    <Search size={16} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input type="text" placeholder="Rechercher une application…" value={appSearch} onChange={e => setAppSearch(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: '.85rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <select value={filterCategory} onChange={e => setFilterCategory(e.target.value === 'all' ? 'all' : parseInt(e.target.value))} style={mkSelect}>
                    <option value="all">Toutes catégories</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select value={filterPublished} onChange={e => setFilterPublished(e.target.value as any)} style={mkSelect}>
                    <option value="all">Statut : tous</option>
                    <option value="oui">Publiées</option>
                    <option value="non">Masquées</option>
                  </select>
                  <select value={filterDsi} onChange={e => setFilterDsi(e.target.value as any)} style={mkSelect}>
                    <option value="all">DSI : toutes</option>
                    <option value="dsi">Réservées DSI</option>
                    <option value="other">Hors DSI</option>
                  </select>
                  <select value={filterContracts} onChange={e => setFilterContracts(e.target.value as any)} style={mkSelect}>
                    <option value="all">Contrats : tous</option>
                    <option value="with">Avec contrat</option>
                    <option value="without">Sans contrat</option>
                  </select>
                  <select value={filterPM} onChange={e => setFilterPM(e.target.value)} style={mkSelect}>
                    <option value="all">Chef de projet : tous</option>
                    <option value="__none__">Sans chef de projet</option>
                    {projectManagers.map(pm => <option key={pm} value={pm}>{pm}</option>)}
                  </select>
                  <select value={appSort} onChange={e => setAppSort(e.target.value as any)} style={mkSelect}>
                    <option value="name">Tri : nom</option>
                    <option value="users">Tri : utilisateurs</option>
                    <option value="orders">Tri : montant commandes</option>
                    <option value="docs">Tri : documents</option>
                  </select>
                  <button className="primary-btn-v2" style={{ marginLeft: 'auto' }} onClick={() => { setEditingApp(null); setShowAppModal(true); }}>
                    <Plus size={18} /> Nouvelle Application
                  </button>
                </div>

                {/* ===== Master-détail ===== */}
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  {/* Liste */}
                  <div style={{ ...mkCard, padding: 0, flex: '0 0 340px', maxWidth: 340, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid #eef1f6', fontSize: '.75rem', fontWeight: 700, color: '#64748b' }}>{filteredApps.length} application(s)</div>
                    <div style={{ maxHeight: '64vh', overflowY: 'auto' }}>
                      {filteredApps.map(app => {
                        const active = app.id === selectedAppId;
                        const tc = ticketCounts[app.id];
                        const docTotal = (app.normal_doc_count || 0) + (app.technical_doc_count || 0);
                        const pill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 10, fontSize: '.66rem', fontWeight: 700, lineHeight: 1.5 };
                        return (
                          <button key={app.id} onClick={() => setSelectedAppId(app.id)}
                            style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6, padding: '10px 14px', border: 'none', borderLeft: active ? '3px solid #6366f1' : '3px solid transparent', background: active ? '#f5f3ff' : 'transparent', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <img src={app.icon} alt="" onError={(e) => { (e.target as HTMLImageElement).src = '/api/img/default.png'; }} style={{ width: 30, height: 30, borderRadius: 7, objectFit: 'contain', flexShrink: 0 }} />
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontWeight: 600, fontSize: '.85rem', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.name}</span>
                                <span style={{ display: 'block', fontSize: '.72rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{catName(app.category_id)}{app.project_manager_name ? ` · ${app.project_manager_name}` : ''}</span>
                              </span>
                              <span title={app.present_magapp === 'oui' ? 'Publiée' : 'Masquée'} style={{ width: 8, height: 8, borderRadius: '50%', background: app.present_magapp === 'oui' ? '#22c55e' : '#cbd5e1', flexShrink: 0 }} />
                            </span>
                            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 40 }}>
                              <span style={{ ...pill, background: '#f1f5f9', color: '#475569' }} title={`${app.user_count || 0} utilisateur(s)`}>👤 {app.user_count || 0}</span>
                              {tc && tc.incident_count > 0 && <span style={{ ...pill, background: '#fee2e2', color: '#991b1b' }} title={`${tc.incident_count} incident(s) ouvert(s)`}>⚠ {tc.incident_count}</span>}
                              {tc && tc.request_count > 0 && <span style={{ ...pill, background: '#fef3c7', color: '#92400e' }} title={`${tc.request_count} demande(s) ouverte(s)`}>＋ {tc.request_count}</span>}
                              {(app.orders_amount || 0) > 0 && <span style={{ ...pill, background: '#dbeafe', color: '#1e40af' }} title={`Coût calculé — ${app.orders_count || 0} commande(s)`}>💶 {eur0(app.orders_amount || 0)}</span>}
                              <span style={{ ...pill, background: '#eef2ff', color: '#4338ca' }} title={`${docTotal} documentation(s) associée(s)`}>📄 {docTotal}</span>
                              {app.url_test ? <span style={{ ...pill, background: '#fae8ff', color: '#86198f' }} title={`Version de test : ${app.url_test}`}>🧪 Test</span> : null}
                              {(app.contract_count || 0) > 0 && <span style={{ ...pill, background: '#fef9c3', color: '#854d0e' }} title={`${app.contract_count} contrat(s)`}>📋 {app.contract_count}</span>}
                            </span>
                          </button>
                          );
                      })}
                      {filteredApps.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: '.85rem' }}>Aucune application</div>}
                    </div>
                  </div>

                  {/* Détail */}
                  <div style={{ ...mkCard, flex: 1, minHeight: 320 }}>
                    {!selApp ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 280, color: '#94a3b8', gap: 10 }}>
                        <ChevronRight size={36} />
                        <div style={{ fontSize: '.9rem' }}>Sélectionnez une application pour voir le détail</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                          <img src={selApp.icon} alt="" onError={(e) => { (e.target as HTMLImageElement).src = '/api/img/default.png'; }} style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'contain', border: '1px solid #eef1f6' }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>{selApp.name}</h2>
                            <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 2 }}>{catName(selApp.category_id)}{selApp.app_type ? ` · ${selApp.app_type}` : ''}</div>
                            {selApp.url && <a href={selApp.url} target="_blank" rel="noreferrer" style={{ fontSize: '.78rem', color: '#6366f1', wordBreak: 'break-all' }}>{selApp.url}</a>}
                            {selApp.url_test && <div style={{ marginTop: 2 }}><a href={selApp.url_test} target="_blank" rel="noreferrer" style={{ fontSize: '.76rem', color: '#a21caf', wordBreak: 'break-all' }}>🧪 Test : {selApp.url_test}</a></div>}
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="primary-btn-v2" onClick={() => { setEditingApp(selApp); setShowAppModal(true); }}><Edit2 size={16} /> Modifier</button>
                            <button className="primary-btn-v2" style={{ background: '#fee2e2', color: '#b91c1c' }} onClick={() => handleDeleteApp(selApp)}><Trash2 size={16} /></button>
                          </div>
                        </div>

                        {selApp.description && <p style={{ margin: 0, fontSize: '.85rem', color: '#475569', lineHeight: 1.5 }}>{selApp.description}</p>}

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, background: selApp.present_magapp === 'oui' ? '#dcfce7' : '#f1f5f9', color: selApp.present_magapp === 'oui' ? '#166534' : '#64748b', fontSize: '.74rem', fontWeight: 700 }}>● {selApp.present_magapp === 'oui' ? 'Publiée' : 'Masquée'}</span>
                          {selApp.dsi_only ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, background: '#1e293b', color: '#fff', fontSize: '.74rem', fontWeight: 700 }}><ShieldAlert size={13} /> DSI</span> : null}
                          {(selApp.ongoing_maintenance_count || 0) > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, background: '#fef2f2', color: '#dc2626', fontSize: '.74rem', fontWeight: 700 }}><Wrench size={13} /> Maintenance</span>}
                          {selApp.mercator_id ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, background: '#ecfeff', color: '#0e7490', fontSize: '.74rem', fontWeight: 700 }}>Mercator</span> : null}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                          <div style={{ border: '1px solid #eef1f6', borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }} title="Voir la liste des utilisateurs" onClick={() => openAppList('users', selApp)}><div style={mkLabel}>👤 Utilisateurs ›</div><div style={{ ...mkBig, fontSize: '1.2rem' }}>{selApp.user_count || 0}</div></div>
                          <div style={{ border: '1px solid #eef1f6', borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }} title="Voir la liste des documents" onClick={() => openAppList('docs', selApp)}><div style={mkLabel}>📄 Documents ›</div><div style={{ ...mkBig, fontSize: '1.2rem' }}>{(selApp.normal_doc_count || 0) + (selApp.technical_doc_count || 0)}</div></div>
                          <div style={{ border: '1px solid #eef1f6', borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }} title="Voir la liste des contrats" onClick={() => openAppList('contracts', selApp)}><div style={mkLabel}>📋 Contrats ›</div><div style={{ ...mkBig, fontSize: '1.2rem' }}>{selApp.contract_count || 0}</div></div>
                          <div style={{ border: '1px solid #eef1f6', borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }} title="Voir la liste des commandes" onClick={() => openAppList('orders', selApp)}><div style={mkLabel}>💶 Commandes ›</div><div style={{ ...mkBig, fontSize: '1.1rem', color: '#1e40af' }}>{eur0(selApp.orders_amount || 0)}</div><div style={{ fontSize: '.7rem', color: '#94a3b8' }}>{selApp.orders_count || 0} cmd</div></div>
                        </div>

                        {selApp.project_manager_name && (
                          <div style={{ fontSize: '.82rem', color: '#334155' }}><span style={{ color: '#94a3b8' }}>Chef de projet : </span><strong>{selApp.project_manager_name}</strong></div>
                        )}

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                          <button className="primary-btn-v2" style={{ background: '#eef2ff', color: '#4338ca' }} onClick={() => openMaintenanceModal(selApp.id)}><Wrench size={15} /> Maintenance</button>
                          <button className="primary-btn-v2" style={{ background: '#ecfeff', color: '#0e7490' }} onClick={() => { setEditingDoc(null); setNewDoc({ title: '', description: '', app_id: selApp.id, doc_type: 'pdf', url: '', is_favorite: false, is_technical: false, is_obsolete: false }); setShowDocModal(true); }}><Plus size={15} /> Document</button>
                          {ticketCounts[selApp.id] && ticketCounts[selApp.id].incident_count > 0 && (
                            <button className="primary-btn-v2" style={{ background: '#fee2e2', color: '#991b1b' }} onClick={() => openTicketModal(selApp.id, selApp.name, '1')}>⚠ {ticketCounts[selApp.id].incident_count} incident(s)</button>
                          )}
                          {ticketCounts[selApp.id] && ticketCounts[selApp.id].request_count > 0 && (
                            <button className="primary-btn-v2" style={{ background: '#fef3c7', color: '#92400e' }} onClick={() => openTicketModal(selApp.id, selApp.name, '2')}>+ {ticketCounts[selApp.id].request_count} demande(s)</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>


              {showAppModal && (
                <div className="modal-overlay-v2">
                  <div className="modal-content-v2 animate-fade-in">
                    <div className="modal-header-v2">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="header-icon-v2">{editingApp ? <Edit2 size={18} /> : <Plus size={18} />}</div>
                        <h3>{editingApp ? 'Modifier Application' : 'Nouvelle Application'}</h3>
                      </div>
                      <button className="close-modal-btn" onClick={() => setShowAppModal(false)}><X size={20} /></button>
                    </div>

                    <div className="modal-tabs">
                      <button className={modalTab === 'general' ? 'active' : ''} onClick={() => setModalTab('general')}>Général</button>
                      {editingApp && (
                        <button className={modalTab === 'users' ? 'active' : ''} onClick={() => { setModalTab('users'); fetchAppUsers(editingApp.id); }}>
                          Utilisateurs {editingApp.user_count ? `(${editingApp.user_count})` : ''}
                        </button>
                      )}
                    </div>
                    
                    <div className="modal-body-v2">
                      {modalTab === 'general' ? (
                        <div className="form-grid-v2">
                          <div className="form-group-v2">
                            <label>Nom</label>
                            <input type="text" value={editingApp ? editingApp.name : newApp.name} onChange={e => editingApp ? setEditingApp({...editingApp, name: e.target.value}) : setNewApp({...newApp, name: e.target.value})} />
                          </div>
                          <div className="form-group-v2">
                            <label>URL</label>
                            <input type="text" value={editingApp ? editingApp.url : newApp.url} onChange={e => editingApp ? setEditingApp({...editingApp, url: e.target.value}) : setNewApp({...newApp, url: e.target.value})} />
                          </div>
                          <div className="form-group-v2">
                            <label>URL de version de test</label>
                            <input type="text" placeholder="https://… (optionnel)" value={editingApp ? (editingApp.url_test || '') : (newApp.url_test || '')} onChange={e => editingApp ? setEditingApp({...editingApp, url_test: e.target.value}) : setNewApp({...newApp, url_test: e.target.value})} />
                          </div>
                          <div className="form-group-v2">
                            <label>Catégorie</label>
                            <select value={editingApp ? editingApp.category_id : newApp.category_id} onChange={e => editingApp ? setEditingApp({...editingApp, category_id: parseInt(e.target.value)}) : setNewApp({...newApp, category_id: parseInt(e.target.value)})}>
                              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                          <div className="form-group-v2">
                            <label>Type</label>
                            <select value={editingApp ? editingApp.app_type : newApp.app_type} onChange={e => editingApp ? setEditingApp({...editingApp, app_type: e.target.value}) : setNewApp({...newApp, app_type: e.target.value})}>
                              <option value="Web">Web</option>
                              <option value="SAAS">SAAS</option>
                              <option value="Client/serveur">Client/serveur</option>
                              <option value="Monoposte">Monoposte</option>
                            </select>
                          </div>
                          <div className="form-group-v2 full-width">
                            <label>Description</label>
                            <textarea rows={2} value={editingApp ? editingApp.description : newApp.description} onChange={e => editingApp ? setEditingApp({...editingApp, description: e.target.value}) : setNewApp({...newApp, description: e.target.value})}></textarea>
                          </div>
                          <div className="form-group-v2">
                            <label>MagApp</label>
                            <select value={editingApp ? editingApp.present_magapp : newApp.present_magapp} onChange={e => editingApp ? setEditingApp({...editingApp, present_magapp: e.target.value}) : setNewApp({...newApp, present_magapp: e.target.value})}>
                              <option value="oui">Oui</option>
                              <option value="non">Non</option>
                            </select>
                          </div>
                          <div className="form-group-v2">
                            <label>OnBoard</label>
                            <select value={editingApp ? editingApp.present_onboard : newApp.present_onboard} onChange={e => editingApp ? setEditingApp({...editingApp, present_onboard: e.target.value}) : setNewApp({...newApp, present_onboard: e.target.value})}>
                              <option value="oui">Oui</option>
                              <option value="non">Non</option>
                            </select>
                          </div>
                          <div className="form-group-v2">
                            <label>Email Créateur</label>
                            <input type="text" value={editingApp ? editingApp.email_createur : newApp.email_createur} onChange={e => editingApp ? setEditingApp({...editingApp, email_createur: e.target.value}) : setNewApp({...newApp, email_createur: e.target.value})} />
                          </div>

                          <div className="form-group-v2 full-width">
                            <label>Chef de projet</label>
                            {(() => {
                              const currentPM = editingApp ? editingApp.project_manager_name : newApp.project_manager_name;
                              return (
                                <div>
                                  {currentPM && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', padding: '8px 14px', background: '#eef2ff', borderRadius: '10px' }}>
                                      <span style={{ fontWeight: 700, color: '#4f46e5' }}>{currentPM}</span>
                                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>({editingApp ? editingApp.project_manager_username : newApp.project_manager_username})</span>
                                      <button type="button" onClick={() => editingApp ? setEditingApp({...editingApp, project_manager_username: '', project_manager_name: ''}) : setNewApp({...newApp, project_manager_username: '', project_manager_name: ''})} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', gap: '10px' }}>
                                    <input
                                      type="text"
                                      placeholder="Rechercher dans l'AD..."
                                      value={pmSearchQuery}
                                      onChange={e => setPmSearchQuery(e.target.value)}
                                      onKeyDown={e => e.key === 'Enter' && handleSearchPM()}
                                      style={{ flex: 1, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem' }}
                                    />
                                    <button type="button" className="filter-btn-v2" onClick={handleSearchPM} disabled={isSearchingPM} style={{ padding: '0 16px' }}>
                                      {isSearchingPM ? '...' : 'Rechercher'}
                                    </button>
                                  </div>
                                  {pmSearchResults.length > 0 && (
                                    <div style={{ marginTop: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                      {pmSearchResults.map(r => (
                                        <div key={r.username} style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => selectPM(r.username, r.displayName)}>
                                          <div>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{r.displayName}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{r.username}</div>
                                          </div>
                                          <button type="button" style={{ padding: '4px 10px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Sélectionner</button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          <div className="form-group-v2">
                            <label>Application Mercator</label>
                            <select 
                              value={editingApp ? (editingApp.mercator_id || '') : (newApp.mercator_id || '')} 
                              onChange={e => {
                                  const val = e.target.value ? parseInt(e.target.value) : null;
                                  const name = e.target.value ? (mercatorApps.find(m => m.id === val)?.name || '') : '';
                                  if (editingApp) {
                                      setEditingApp({...editingApp, mercator_id: val, mercator_name: name});
                                  } else {
                                      setNewApp({...newApp, mercator_id: val, mercator_name: name});
                                  }
                              }}>
                              <option value="">Aucune</option>
                              {mercatorApps.map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                            {(() => {
                                const currId = editingApp ? editingApp.mercator_id : newApp.mercator_id;
                                const currMercator = currId ? mercatorApps.find(m => m.id === currId) : null;
                                if (currMercator && currMercator.description) {
                                    return (
                                        <div style={{ marginTop: '10px', padding: '10px 15px', background: '#eef2ff', borderRadius: '8px', color: '#4338ca', fontSize: '0.85rem', lineHeight: '1.4' }}>
                                            <strong>Description Mercator :</strong><br/>
                                            <div dangerouslySetInnerHTML={{ __html: currMercator.description }} />
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                          </div>
                          
                          <div className="form-group-v2 full-width" style={{ marginTop: '10px', padding: '15px', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #e2e8f0' }}>
                            <label style={{ color: '#4f46e5' }}>Logo de l'application</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '10px' }}>
                              <img 
                                src={editingApp ? editingApp.icon : newApp.icon} 
                                alt="Preview" 
                                style={{ width: '60px', height: '60px', borderRadius: '12px', objectFit: 'contain', background: 'white', padding: '5px', border: '1px solid #e2e8f0' }} 
                                onError={(e) => { (e.target as HTMLImageElement).src = '/api/img/default.png'; }}
                              />
                              <div style={{ flex: 1 }}>
                                <input 
                                  type="file" 
                                  id="icon-upload" 
                                  style={{ display: 'none' }} 
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleIconUpload(file);
                                  }}
                                />
                                <label htmlFor="icon-upload" className="filter-btn-v2" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                  <Globe size={16} /> Choisir un fichier
                                </label>
                                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '5px' }}>Recommandé: PNG/WebP avec fond transparent.</p>
                              </div>
                            </div>
                          </div>

                          <div className="form-group-v2">
                            <label>Maintenance</label>
                            <select value={editingApp ? editingApp.is_maintenance : newApp.is_maintenance} onChange={e => editingApp ? setEditingApp({...editingApp, is_maintenance: parseInt(e.target.value)}) : setNewApp({...newApp, is_maintenance: parseInt(e.target.value)})}>
                              <option value={0}>Non</option>
                              <option value={1}>En cours</option>
                            </select>
                          </div>
                          <div className="form-group-v2">
                            <label>Début Maintenance</label>
                            <input type="datetime-local" value={editingApp ? (editingApp.maintenance_start ? new Date(editingApp.maintenance_start).toISOString().slice(0, 16) : '') : (newApp.maintenance_start || '')} onChange={e => editingApp ? setEditingApp({...editingApp, maintenance_start: e.target.value}) : setNewApp({...newApp, maintenance_start: e.target.value})} />
                          </div>
                          <div className="form-group-v2">
                            <label>Fin Maintenance (estimée)</label>
                            <input type="datetime-local" value={editingApp ? (editingApp.maintenance_end ? new Date(editingApp.maintenance_end).toISOString().slice(0, 16) : '') : (newApp.maintenance_end || '')} onChange={e => editingApp ? setEditingApp({...editingApp, maintenance_end: e.target.value}) : setNewApp({...newApp, maintenance_end: e.target.value})} />
                          </div>
                          <div className="form-group-v2">
                            <label>Ordre</label>
                            <input type="number" value={editingApp ? editingApp.display_order : newApp.display_order} onChange={e => editingApp ? setEditingApp({...editingApp, display_order: parseInt(e.target.value)}) : setNewApp({...newApp, display_order: parseInt(e.target.value)})} />
                          </div>
                          <div className="form-group-v2 full-width">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                              <input type="checkbox" checked={editingApp ? !!editingApp.dsi_only : !!newApp.dsi_only} onChange={e => editingApp ? setEditingApp({...editingApp, dsi_only: e.target.checked ? 1 : 0}) : setNewApp({...newApp, dsi_only: e.target.checked ? 1 : 0})} style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#4f46e5' }} />
                              <span style={{ fontWeight: 600, color: '#334155' }}>Application réservée à la DSI (invisible dans le MagApp public)</span>
                            </label>
                          </div>
                        </div>
                      ) : (
                        <div className="users-management">
                            <div className="ad-search-box" style={{ padding: '0 5px' }}>
                              <label style={{ fontWeight: 700, color: '#64748b', fontSize: '0.85rem' }}>Ajouter un agent (recherche AD)</label>
                              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <input 
                                  type="text" 
                                  placeholder="Nom, login..." 
                                  value={adSearchQuery} 
                                  onChange={e => setAdSearchQuery(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && handleSearchAD()}
                                  style={{ flex: 1, padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '0.9rem' }}
                                />
                                <button 
                                  className="primary-btn-v2" 
                                  style={{ padding: '0 20px', fontSize: '0.9rem', boxShadow: 'none' }}
                                  onClick={handleSearchAD} 
                                  disabled={isSearchingAD}
                                >
                                  {isSearchingAD ? '...' : 'Rechercher'}
                                </button>
                              </div>
                              
                              {adResults.length > 0 && (
                                <div className="ad-results" style={{ marginTop: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden' }}>
                                  {adResults.map(res => (
                                    <div key={res.username} className="ad-result-item" style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{res.displayName}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{res.username}</div>
                                      </div>
                                      <button 
                                        onClick={() => handleAddUserToApp(res.username, res.displayName)}
                                        style={{ padding: '6px 12px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                      >
                                        Ajouter
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            
                            <div className="app-users-list" style={{ marginTop: '32px', padding: '0 5px' }}>
                              <label style={{ fontWeight: 700, color: '#64748b', fontSize: '0.85rem' }}>Agents ayant accès / connectés ({appUsers.length})</label>
                              {appUsers.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                                  <div style={{ marginBottom: '10px' }}><Users size={32} opacity={0.3} /></div>
                                  <p style={{ fontStyle: 'italic', fontSize: '0.9rem' }}>Aucun utilisateur enregistré pour le moment.</p>
                                </div>
                              ) : (
                                <div className="users-table-scroll">
                                  <table className="modern-table-v2" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                                    <thead>
                                      <tr>
                                        <th style={{ textAlign: 'left', padding: '0 12px', fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Agent</th>
                                        <th style={{ textAlign: 'left', padding: '0 12px', fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Dernière connexion</th>
                                        <th style={{ textAlign: 'left', padding: '0 12px', fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Source</th>
                                        <th style={{ textAlign: 'right', padding: '0 12px', fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Action</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {appUsers.map(u => (
                                        <tr key={u.id}>
                                          <td style={{ background: '#f8fafc', padding: '12px', borderTopLeftRadius: '12px', borderBottomLeftRadius: '12px' }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{u.display_name}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{u.username}</div>
                                          </td>
                                          <td style={{ background: '#f8fafc', padding: '12px' }}>
                                            <div style={{ fontSize: '0.85rem' }}>
                                              {u.last_connection ? u.last_connection : 'Jamais'}
                                            </div>
                                          </td>
                                          <td style={{ background: '#f8fafc', padding: '12px' }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                                              <span style={{
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                background: u.source === 'admin' ? '#dbeafe' : '#e0f2fe',
                                                color: u.source === 'admin' ? '#0c4a6e' : '#0c4a6e',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                display: 'inline-block'
                                              }}>
                                                {u.source === 'admin' ? 'Admin' : 'Magapp'}
                                              </span>
                                            </div>
                                          </td>
                                          <td style={{ background: '#f8fafc', padding: '12px', borderTopRightRadius: '12px', borderBottomRightRadius: '12px', textAlign: 'right' }}>
                                            <button
                                              onClick={() => handleRemoveUserFromApp(u.username)}
                                              style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '5px' }}
                                              title="Retirer l'accès"
                                            >
                                              <Trash2 size={16} />
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                        </div>
                      )}
                    </div>

                    <div className="modal-footer-v2">
                      <button className="primary-btn-v2" style={{ width: '100%' }} onClick={() => {
                        handleSaveApp(editingApp || newApp, !!editingApp);
                      }}>
                        <Save size={18} /> {editingApp ? 'Enregistrer les modifications' : 'Créer l\'application'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal tickets par logiciel */}
              {infoModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={() => setInfoModal(null)}>
                  <div style={{ background: '#fff', borderRadius: 14, width: 'min(560px, 92vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #eef1f6' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>{infoModal.title} <span style={{ color: '#94a3b8', fontWeight: 600 }}>({infoItems.length})</span></h3>
                      <button className="close-modal-btn" onClick={() => setInfoModal(null)}><X size={20} /></button>
                    </div>
                    <div style={{ overflowY: 'auto', padding: '8px 0' }}>
                      {infoLoading ? (
                        <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>
                      ) : infoItems.length === 0 ? (
                        <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>Aucun élément</div>
                      ) : infoItems.map((it, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 18px', borderBottom: '1px solid #f4f6fa' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '.86rem', color: '#1e293b' }}>{it.primary}</div>
                            {it.secondary && <div style={{ fontSize: '.74rem', color: '#94a3b8' }}>{it.secondary}</div>}
                          </div>
                          {it.right && <div style={{ fontSize: '.78rem', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{it.right}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {ticketModal && (
                <div
                  style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
                  onClick={() => setTicketModal(null)}
                >
                  <div
                    style={{ background: '#fff', borderRadius: 16, width: 680, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6366f1', marginBottom: 4 }}>
                          {ticketModal.appName}
                        </div>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                          {ticketModal.type === '1'
                            ? <><span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 10px', borderRadius: 20, fontSize: 12 }}>⚠ Incidents ouverts</span></>
                            : <><span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 10px', borderRadius: 20, fontSize: 12 }}>+ Demandes ouvertes</span></>
                          }
                        </h3>
                      </div>
                      <button
                        onClick={() => setTicketModal(null)}
                        style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        ✕
                      </button>
                    </div>
                    {/* Body */}
                    <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px' }}>
                      {ticketModalLoading ? (
                        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chargement...</div>
                      ) : ticketModalData.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Aucun ticket trouvé</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {ticketModalData.map((t: any) => (
                            <a
                              key={t.id}
                              href={`/tickets/${t.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', textDecoration: 'none', background: '#f8fafc', transition: 'background 0.1s' }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#eef2ff')}
                              onMouseLeave={e => (e.currentTarget.style.background = '#f8fafc')}
                            >
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#6366f1', fontSize: 13, flexShrink: 0 }}>
                                #{t.id}
                              </span>
                              <span style={{ flex: 1, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.title}
                              </span>
                              <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
                                {t.requester?.name || ''}
                              </span>
                              <span style={{
                                fontSize: 11, fontWeight: 600, flexShrink: 0,
                                padding: '2px 8px', borderRadius: 12,
                                background: t.status?.id === 4 ? '#fff7ed' : t.status?.id >= 5 ? '#f0fdf4' : '#eef2ff',
                                color: t.status?.id === 4 ? '#c2410c' : t.status?.id >= 5 ? '#166534' : '#4338ca',
                              }}>
                                {t.status?.label || `#${t.status?.id}`}
                              </span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Footer */}
                    <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                      <a
                        href={`/tickets?software_id=${ticketModal.appId}&type=${ticketModal.type}&status_in=1,2,3,4`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 13, color: '#6366f1', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        Voir dans le module tickets →
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {showDeleteModal && appToDelete && (
                <div className="modal-overlay-v2">
                  <div className="modal-content-v2 animate-fade-in" style={{ maxWidth: '450px' }}>
                    <div className="modal-header-v2">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="header-icon-v2" style={{ background: '#fff1f2', color: '#e11d48' }}><Trash2 size={18} /></div>
                        <h3>Supprimer l'application</h3>
                      </div>
                      <button className="close-modal-btn" onClick={() => setShowDeleteModal(false)}><X size={20} /></button>
                    </div>
                    
                    <div className="modal-body-v2">
                      <p style={{ margin: 0, color: '#475569', lineHeight: '1.6' }}>
                        Êtes-vous sûr de vouloir supprimer l'application <strong>{appToDelete.name}</strong> ?<br/>
                        <span style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: '700', display: 'block', marginTop: '10px' }}>
                          Cette action est irréversible et supprimera également tous les favoris et abonnés associés à cette application.
                        </span>
                      </p>
                    </div>

                    <div className="modal-footer-v2" style={{ display: 'flex', gap: '12px' }}>
                      <button className="filter-btn-v2" style={{ flex: 1 }} onClick={() => setShowDeleteModal(false)}>Annuler</button>
                      <button className="primary-btn-v2" style={{ flex: 1, background: '#e11d48' }} onClick={confirmDelete}>
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'maintenances' && (
            <div className="workspace-grid" style={{ gridTemplateColumns: '1fr' }}>
              <section className="workspace-section">
                <div className="section-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <h2>Journal des Maintenances ({maintenances.length})</h2>
                    <div className="header-icon-v2"><Wrench size={20} /></div>
                  </div>
                </div>
                
                {maintenances.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                    <Wrench size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                    <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Aucune maintenance programmée</p>
                    <p style={{ fontSize: '0.9rem' }}>Cliquez sur l'icône clé à molette dans une carte d'application pour programmer une maintenance.</p>
                  </div>
                ) : (
                  <div>
                    {/* Filtre par application */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.85rem', color: '#475569' }}>Filtrer par application :</label>
                      <select
                        value={maintenanceFilterApp}
                        onChange={e => setMaintenanceFilterApp(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                        style={{ padding: '8px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem', background: '#fafbfc', maxWidth: '300px' }}
                      >
                        <option value="all">Toutes les applications</option>
                        {apps.map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Timeline / Card list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {maintenances
                        .filter(m => maintenanceFilterApp === 'all' || m.app_id === maintenanceFilterApp)
                        .map(m => {
                          const now = new Date();
                          const isOngoing = new Date(m.start_date) <= now && new Date(m.end_date) >= now;
                          return (
                          <div key={m.id} style={{
                            background: 'white', borderRadius: '16px', border: isOngoing ? '2px solid #dc2626' : '1px solid #e2e8f0',
                            padding: '20px 24px', display: 'flex', gap: '20px', alignItems: 'flex-start',
                            transition: 'all 0.2s', boxShadow: isOngoing ? '0 0 0 3px rgba(220,38,38,0.1)' : '0 2px 8px rgba(0,0,0,0.04)'
                          }}>
                            {/* App icon */}
                            <img
                              src={m.app_icon}
                              alt=""
                              style={{ width: '48px', height: '48px', borderRadius: '12px', objectFit: 'contain', background: '#f8fafc', padding: '6px', border: '1px solid #f1f5f9', flexShrink: 0 }}
                              onError={(e) => { (e.target as HTMLImageElement).src = '/api/img/default.png'; }}
                            />

                            {/* Content */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4f46e5', background: '#eef2ff', padding: '2px 10px', borderRadius: '6px' }}>{m.app_name}</span>
                                <span style={{
                                  fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
                                  background: m.severity === 'majeure' ? '#fef2f2' : '#f0fdf4',
                                  color: m.severity === 'majeure' ? '#dc2626' : '#16a34a'
                                }}>
                                  {m.severity === 'majeure' ? 'Majeure' : 'Mineure'}
                                </span>
                                {m.has_interruption ? (
                                  <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: '#fef2f2', color: '#dc2626' }}>
                                    Avec interruption
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: '#f0fdf4', color: '#16a34a' }}>
                                    Sans interruption
                                  </span>
                                )}
                              </div>
                              <h4 style={{ margin: '4px 0 2px', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>{m.name}</h4>
                              {m.description && (
                                <p style={{ margin: '4px 0', fontSize: '0.85rem', color: '#64748b', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{m.description}</p>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px', fontSize: '0.8rem', color: '#94a3b8' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Calendar size={14} />
                                  {new Date(m.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  {' → '}
                                  {new Date(m.end_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {m.created_by && <span>par {m.created_by}</span>}
                              </div>

                              {/* Attachments */}
                              {maintenanceAttachments[m.id] && maintenanceAttachments[m.id].length > 0 && (
                                <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                  {maintenanceAttachments[m.id].map((att: MaintenanceAttachment) => (
                                    <a
                                      key={att.id}
                                      href={`/api/uploads/maintenances/${att.filename}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0',
                                        borderRadius: '8px', fontSize: '0.78rem', color: '#4f46e5',
                                        textDecoration: 'none', fontWeight: 600
                                      }}
                                    >
                                      <Paperclip size={14} />
                                      {att.original_name}
                                      <Download size={12} style={{ opacity: 0.5 }} />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                              <button
                                onClick={() => openMaintenanceModal(m.app_id, m)}
                                style={{ width: '34px', height: '34px', border: 'none', background: '#f8fafc', color: '#64748b', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                                title="Modifier"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteMaintenance(m.id)}
                                style={{ width: '34px', height: '34px', border: 'none', background: '#f8fafc', color: '#ef4444', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                                title="Supprimer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        )})}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Maintenance Modal */}
          {showMaintenanceModal && (
            <div className="modal-overlay-v2">
              <div className="modal-content-v2 animate-fade-in" style={{ maxWidth: '700px' }}>
                <div className="modal-header-v2">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="header-icon-v2"><Wrench size={18} /></div>
                    <h3>{editingMaintenance ? 'Modifier la maintenance' : 'Programmer une maintenance'}</h3>
                  </div>
                  <button className="close-modal-btn" onClick={() => setShowMaintenanceModal(false)}><X size={20} /></button>
                </div>

                <div className="modal-body-v2">
                  <div className="form-grid-v2">
                    <div className="form-group-v2">
                      <label>Application</label>
                      <select
                        value={newMaintenance.app_id}
                        onChange={e => setNewMaintenance({...newMaintenance, app_id: parseInt(e.target.value)})}
                      >
                        {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group-v2">
                      <label>Nom de la maintenance *</label>
                      <input type="text" value={newMaintenance.name} onChange={e => setNewMaintenance({...newMaintenance, name: e.target.value})} placeholder="Ex: Mise à jour sécurité" />
                    </div>
                    <div className="form-group-v2">
                      <label>Gravité</label>
                      <select value={newMaintenance.severity} onChange={e => setNewMaintenance({...newMaintenance, severity: e.target.value as 'mineure' | 'majeure'})}>
                        <option value="mineure">Mineure</option>
                        <option value="majeure">Majeure</option>
                      </select>
                    </div>
                    <div className="form-group-v2">
                      <label>Interruption de service</label>
                      <select value={newMaintenance.has_interruption ? 'oui' : 'non'} onChange={e => setNewMaintenance({...newMaintenance, has_interruption: e.target.value === 'oui'})}>
                        <option value="non">Sans interruption</option>
                        <option value="oui">Avec interruption</option>
                      </select>
                    </div>
                    <div className="form-group-v2">
                      <label>Début *</label>
                      <input type="datetime-local" value={newMaintenance.start_date} onChange={e => setNewMaintenance({...newMaintenance, start_date: e.target.value})} />
                    </div>
                    <div className="form-group-v2">
                      <label>Fin *</label>
                      <input type="datetime-local" value={newMaintenance.end_date} onChange={e => setNewMaintenance({...newMaintenance, end_date: e.target.value})} />
                    </div>
                    <div className="form-group-v2 full-width">
                      <label>Description</label>
                      <textarea rows={4} value={newMaintenance.description} onChange={e => setNewMaintenance({...newMaintenance, description: e.target.value})} placeholder="Décrivez la maintenance..."></textarea>
                    </div>
                    <div className="form-group-v2 full-width">
                      <label>Pièces jointes (comptes rendus, etc.)</label>
                      <input
                        type="file"
                        multiple
                        onChange={e => {
                          const files = e.target.files;
                          if (files) setMaintenanceFiles(Array.from(files));
                        }}
                        style={{ padding: '10px', border: '2px dashed #e2e8f0', borderRadius: '12px', background: '#fafbfc', cursor: 'pointer' }}
                      />
                      {maintenanceFiles.length > 0 && (
                        <div style={{ marginTop: '8px' }}>
                          {maintenanceFiles.map((f, i) => (
                            <div key={i} style={{ fontSize: '0.8rem', color: '#64748b', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Paperclip size={12} /> {f.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="modal-footer-v2" style={{ display: 'flex', gap: '12px' }}>
                  <button className="filter-btn-v2" style={{ flex: 1 }} onClick={() => setShowMaintenanceModal(false)}>Annuler</button>
                  <button className="primary-btn-v2" style={{ flex: 1 }} onClick={handleSaveMaintenance} disabled={isUploadingMaintenance}>
                    {isUploadingMaintenance ? <><div className="spinner-v2" style={{ width: '16px', height: '16px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> Upload...</> : <><Save size={18} /> {editingMaintenance ? 'Mettre à jour' : 'Programmer'}</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'categories' && (
            <div className="workspace-grid">
              <section className="workspace-section">
                <div className="section-header">
                  <h2>{editingCategory ? 'Modifier Catégorie' : 'Nouvelle Catégorie'}</h2>
                  <div className="header-icon-v2">{editingCategory ? <Edit2 size={20} /> : <Tag size={20} />}</div>
                </div>
                <div className="form-group-v2">
                  <label>Nom</label>
                  <input type="text" value={editingCategory ? editingCategory.name : newCategory.name} onChange={e => editingCategory ? setEditingCategory({...editingCategory, name: e.target.value}) : setNewCategory({...newCategory, name: e.target.value})} />
                </div>
                <div className="form-group-v2" style={{ marginTop: '10px' }}>
                  <label>Icône (Badge/Emoji)</label>
                  <input type="text" value={editingCategory ? editingCategory.icon : newCategory.icon} onChange={e => editingCategory ? setEditingCategory({...editingCategory, icon: e.target.value}) : setNewCategory({...newCategory, icon: e.target.value})} />
                </div>
                <div className="form-group-v2" style={{ marginTop: '10px' }}>
                  <label>Ordre</label>
                  <input type="number" value={editingCategory ? editingCategory.display_order : newCategory.display_order} onChange={e => editingCategory ? setEditingCategory({...editingCategory, display_order: parseInt(e.target.value)}) : setNewCategory({...newCategory, display_order: parseInt(e.target.value)})} />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button className="primary-btn-v2" style={{ flex: 1 }} onClick={() => editingCategory ? handleSaveCategory(editingCategory, true) : handleSaveCategory(newCategory, false)}>
                    <Save size={18} /> {editingCategory ? 'Sauvegarder' : 'Ajouter'}
                  </button>
                  {editingCategory && (
                    <button className="filter-btn-v2" onClick={() => setEditingCategory(null)}>
                      Annuler
                    </button>
                  )}
                </div>
              </section>

              <section className="workspace-section">
                <div className="section-header">
                  <h2>Existantes</h2>
                </div>
                <div className="categories-list-v2">
                  {categories.map(cat => (
                    <div key={cat.id} className="category-item-v2">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{cat.icon}</span>
                        <span>{cat.name}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setEditingCategory(cat)} style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDeleteCategory(cat.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'versions' && (
            <div className="workspace-grid">
              <section className="workspace-section">
                <div className="section-header">
                  <h2>{editingVersion ? 'Modifier Version' : 'Nouvelle Version'}</h2>
                  <div className="header-icon-v2"><Code size={20} /></div>
                </div>
                <div className="form-group-v2">
                  <label>Numéro de version</label>
                  <input type="text" value={editingVersion ? editingVersion.version_number : newVersion.version_number} onChange={e => editingVersion ? setEditingVersion({...editingVersion, version_number: e.target.value}) : setNewVersion({...newVersion, version_number: e.target.value})} />
                </div>
                <div className="form-group-v2" style={{ marginTop: '10px' }}>
                  <label>Notes de mise à jour</label>
                  <ReactQuill 
                    theme="snow" 
                    value={editingVersion ? editingVersion.release_notes_html : newVersion.release_notes_html} 
                    onChange={val => editingVersion ? setEditingVersion({...editingVersion, release_notes_html: val}) : setNewVersion({...newVersion, release_notes_html: val})} 
                    style={{ height: '200px', marginBottom: '50px' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="primary-btn-v2" style={{ flex: 1 }} onClick={() => editingVersion ? handleSaveVersion(editingVersion, true) : handleSaveVersion(newVersion, false)}>
                    {editingVersion ? 'Mettre à jour' : 'Publier'}
                  </button>
                  {editingVersion && <button className="filter-btn-v2" onClick={() => setEditingVersion(null)}>Annuler</button>}
                </div>
              </section>

              <section className="workspace-section">
                <div className="section-header">
                  <h2>Historique</h2>
                </div>
                {versions.map(v => (
                  <div key={v.id} className="app-card-v2" style={{ marginBottom: '10px' }}>
                    <div className="app-card-inner-v2" style={{ alignItems: 'flex-start' }}>
                      <div className="app-details-v2" style={{ flex: 1 }}>
                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {v.version_number}
                          {v.is_active && <CheckCircle size={14} color="#10b981" />}
                        </h4>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(v.release_date).toLocaleDateString()}</span>
                        <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#64748b', maxHeight: '40px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }} dangerouslySetInnerHTML={{ __html: v.release_notes_html }}></div>
                      </div>
                      <div className="app-actions-v2">
                        {!v.is_active && <button onClick={() => handleActivateVersion(v.id)} style={{ color: '#10b981' }} title="Activer"><CheckCircle size={16} /></button>}
                        <button onClick={() => setEditingVersion(v)} title="Modifier"><Edit2 size={16} /></button>
                        <button onClick={() => handleDeleteVersion(v.id)} className="delete" title="Supprimer"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            </div>
          )}

          {activeTab === 'subscriptions' && (
            <section className="workspace-section">
              <div className="section-header">
                <h2>Abonnements Actifs</h2>
                <div className="header-icon-v2"><Bell size={20} /></div>
              </div>
              <table className="modern-table-v2">
                <thead>
                  <tr><th>App</th><th>Utilisateur</th><th>Date</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {subscriptions.map(s => (
                    <tr key={s.id}>
                      <td><strong>{s.app_name}</strong></td>
                      <td>{s.email || 'Utilisateur'}</td>
                      <td>{new Date(s.subscribed_at).toLocaleDateString()}</td>
                      <td><button onClick={() => handleDeleteSubscription(s.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {activeTab === 'ideas' && (
            <section className="workspace-section">
              <div className="section-header">
                <h2>Idées Soumises ({allIdeas.length})</h2>
                <div className="header-icon-v2"><Lightbulb size={20} /></div>
              </div>
              <div style={{ display: 'grid', gap: '12px' }}>
                {allIdeas.length === 0 ? (
                  <p style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>Aucune idée soumise pour le moment.</p>
                ) : (
                  allIdeas.map(idea => (
                    <div key={idea.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                            <h4 style={{ margin: 0 }}>{idea.title}</h4>
                            <span style={{ 
                              padding: '4px 10px', 
                              borderRadius: '6px', 
                              fontSize: '0.75rem', 
                              fontWeight: 600,
                              background: idea.status === 'new' ? '#fef3c7' : idea.status === 'in_progress' ? '#dbeafe' : idea.status === 'accepted' ? '#dcfce7' : '#fee2e2',
                              color: idea.status === 'new' ? '#92400e' : idea.status === 'in_progress' ? '#1e40af' : idea.status === 'accepted' ? '#166534' : '#991b1b'
                            }}>
                              {idea.status === 'new' ? 'Nouvelle' : idea.status === 'in_progress' ? 'En cours' : idea.status === 'accepted' ? 'Acceptée' : idea.status === 'rejected' ? 'Refusée' : idea.status}
                            </span>
                          </div>
                          <p style={{ margin: '0 0 8px 0', color: '#475569', fontSize: '0.9rem' }}>{idea.description}</p>
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            <span>Par {idea.author_name || idea.author_email}</span>
                            <span style={{ margin: '0 8px' }}>•</span>
                            <span>{new Date(idea.created_at).toLocaleDateString('fr-FR')}</span>
                            {idea.attachments && idea.attachments.length > 0 && (
                              <>
                                <span style={{ margin: '0 8px' }}>•</span>
                                <span>{idea.attachments.length} pièce(s) jointe(s)</span>
                              </>
                            )}
                          </div>
                          {idea.admin_response && (
                            <div style={{ marginTop: '12px', padding: '10px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                              <strong style={{ fontSize: '0.8rem', color: '#166534' }}>Réponse DSI :</strong>
                              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#15803d' }}>{idea.admin_response}</p>
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginLeft: '16px' }}>
                          <select 
                            value={idea.status} 
                            onChange={e => handleUpdateIdeaStatus(idea.id, e.target.value)}
                            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
                          >
                            <option value="new">Nouvelle</option>
                            <option value="in_progress">En cours</option>
                            <option value="accepted">Acceptée</option>
                            <option value="rejected">Refusée</option>
                          </select>
                          <button 
                            onClick={() => handleDeleteIdea(idea.id)} 
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: '6px' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <div style={{ marginTop: '12px' }}>
                        <textarea
                          id={`response-${idea.id}`}
                          placeholder="Réponse à l'utilisateur..."
                          defaultValue={idea.admin_response || ''}
                          style={{ width: '100%', minHeight: '60px', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem', resize: 'vertical' }}
                        />
                        <button 
                          className="primary-btn-v2"
                          style={{ marginTop: '8px', padding: '6px 12px', fontSize: '0.8rem' }}
                          onClick={async () => {
                            const response = (document.getElementById(`response-${idea.id}`) as HTMLTextAreaElement).value;
                            await fetch(`/api/admin/magapp/ideas/${idea.id}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                              body: JSON.stringify({ status: idea.status, admin_response: response })
                            });
                            fetchIdeas();
                          }}
                        >
                          <Save size={14} /> Enregistrer la réponse
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {activeTab === 'stats' && (
            <section className="workspace-section">
              <div className="section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h2>Usage</h2>
                  <div className="header-icon-v2"><BarChart2 size={20} /></div>
                </div>
                <button className={`filter-btn-v2 ${showAllStats ? 'active' : ''}`} onClick={() => setShowAllStats(!showAllStats)}>
                  {showAllStats ? "Toutes" : "Aujourd'hui"}
                </button>
              </div>
              <div className="stats-visual-grid-v2">
                {filteredStats.map(s => (
                  <div key={s.id} className="stat-card-v2">
                    <div className="stat-info-v2">
                      <span className="stat-name-v2">{s.name}</span>
                      <span className="stat-value-v2">{showAllStats ? s.total_clicks : s.today_clicks} 🖱️</span>
                    </div>
                    <div className="stat-bar-bg-v2">
                      <div className="stat-bar-fill-v2" style={{ width: `${Math.min(100, ((showAllStats ? s.total_clicks : s.today_clicks) / (Math.max(...stats.map(x => showAllStats ? x.total_clicks : x.today_clicks)) || 1)) * 100)}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'postgres' && postgresSettings && (
            <section className="workspace-section" style={{ maxWidth: '600px' }}>
              <div className="section-header">
                <h2>PostgreSQL Configuration</h2>
                <div className="header-icon-v2"><Globe size={20} /></div>
              </div>
              <div className="form-grid-v2">
                <div className="form-group-v2 full-width">
                  <label>Host</label>
                  <input type="text" value={postgresSettings.host} onChange={e => setPostgresSettings({...postgresSettings, host: e.target.value})} />
                </div>
                <div className="form-group-v2">
                  <label>Database</label>
                  <input type="text" value={postgresSettings.database} onChange={e => setPostgresSettings({...postgresSettings, database: e.target.value})} />
                </div>
                <div className="form-group-v2">
                  <label>User</label>
                  <input type="text" value={postgresSettings.username} onChange={e => setPostgresSettings({...postgresSettings, username: e.target.value})} />
                </div>
                <div className="form-group-v2 full-width">
                  <label>Password</label>
                  <input type="password" value={postgresSettings.password || ''} onChange={e => setPostgresSettings({...postgresSettings, password: e.target.value})} placeholder="••••••••" />
                </div>
                <button className="primary-btn-v2" style={{ marginTop: '10px' }} onClick={handleSavePostgresSettings}><Save size={18} /> Sauvegarder</button>
              </div>
            </section>
          )}

          {activeTab === 'settings' && (
            <section className="workspace-section" style={{ maxWidth: '600px' }}>
              <div className="section-header">
                <h2>Paramètres MagApp</h2>
                <div className="header-icon-v2"><Settings size={20} /></div>
              </div>
              <div className="form-grid-v2">
                <div className="form-group-v2 full-width" style={{ padding: '15px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>Afficher les tickets système (GLPI)</span>
                    <input 
                      type="checkbox" 
                      checked={magappSettings.show_tickets} 
                      onChange={e => setMagappSettings({...magappSettings, show_tickets: e.target.checked})} 
                      style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#4f46e5' }}
                    />
                  </label>
                  <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Active l'affichage du panneau latéral des tickets incidents pour les utilisateurs.</p>
                </div>
                <div className="form-group-v2 full-width" style={{ padding: '15px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>Afficher les abonnements Push</span>
                    <input 
                      type="checkbox" 
                      checked={magappSettings.show_subscriptions} 
                      onChange={e => setMagappSettings({...magappSettings, show_subscriptions: e.target.checked})} 
                      style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#4f46e5' }}
                    />
                  </label>
                  <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Permet aux utilisateurs de s'abonner aux notifications d'état d'un service (abonnement Push).</p>
                </div>
                <div className="form-group-v2 full-width" style={{ padding: '15px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>Afficher le Health Check global</span>
                    <input 
                      type="checkbox" 
                      checked={magappSettings.show_health_check} 
                      onChange={e => setMagappSettings({...magappSettings, show_health_check: e.target.checked})} 
                      style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#4f46e5' }}
                    />
                  </label>
                  <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Affiche le badge d'état global du système (Health Check) en haut de la page.</p>
                </div>
                <div className="form-group-v2 full-width" style={{ padding: '15px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>Afficher les boutons de création (Incident/Demande)</span>
                    <input 
                      type="checkbox" 
                      checked={magappSettings.show_create_buttons} 
                      onChange={e => setMagappSettings({...magappSettings, show_create_buttons: e.target.checked})} 
                      style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#4f46e5' }}
                    />
                  </label>
                  <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Affiche les boutons pour créer des incidents ou demandes GLPI.</p>
                </div>
                <div className="form-group-v2 full-width" style={{ padding: '15px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>Afficher la section Idées</span>
                    <input
                      type="checkbox"
                      checked={magappSettings.show_ideas}
                      onChange={e => setMagappSettings({...magappSettings, show_ideas: e.target.checked})}
                      style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#4f46e5' }}
                    />
                  </label>
                  <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Affiche le bouton "Mes Idées" et le formulaire de soumission.</p>
                </div>
                <div className="form-group-v2 full-width" style={{ padding: '15px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>Afficher la Bibliothèque (BETA)</span>
                    <input 
                      type="checkbox" 
                      checked={magappSettings.show_library} 
                      onChange={e => setMagappSettings({...magappSettings, show_library: e.target.checked})} 
                      style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#4f46e5' }}
                    />
                  </label>
                  <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Active l'accès à la bibliothèque de documentation pour les utilisateurs.</p>
                </div>
                <div className="form-group-v2 full-width" style={{ padding: '15px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>Afficher les Rencontres Budgétaires</span>
                    <input
                      type="checkbox"
                      checked={magappSettings.show_rencontres}
                      onChange={e => setMagappSettings({...magappSettings, show_rencontres: e.target.checked})}
                      style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#4f46e5' }}
                    />
                  </label>
                  <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Affiche le bouton "Rencontres Budgétaires" pour consulter les demandes de directions.</p>
                </div>
                <div className="form-group-v2 full-width" style={{ padding: '15px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>Afficher les demandes de consommables</span>
                    <input
                      type="checkbox"
                      checked={magappSettings.show_consommables}
                      onChange={e => setMagappSettings({...magappSettings, show_consommables: e.target.checked})}
                      style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#4f46e5' }}
                    />
                  </label>
                  <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                    Si décoché, le bouton "Consommables" ne sera visible que pour les administrateurs ou les personnes associées à la tuile "Demandes de consommables".
                  </p>
                </div>
                <div className="form-group-v2 full-width" style={{ padding: '15px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>
                      Chat Live
                      <span style={{ marginLeft: 8, background: '#6366f1', color: 'white', fontSize: '0.6rem', fontWeight: 800, padding: '2px 6px', borderRadius: '6px', letterSpacing: '0.05em', verticalAlign: 'middle' }}>BETA</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={magappSettings.show_chat_live}
                      onChange={e => setMagappSettings({...magappSettings, show_chat_live: e.target.checked})}
                      style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#6366f1' }}
                    />
                  </label>
                  <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                    Affiche la bulle de chat en direct sur MagApp. Les utilisateurs peuvent contacter un technicien en temps réel.
                  </p>
                </div>
                <button className="primary-btn-v2 full-width" style={{ marginTop: '10px' }} onClick={handleSaveMagappSettings}>
                  <Save size={18} /> Mettre à jour les paramètres
                </button>
              </div>
            </section>
          )}

          {activeTab === 'library' && (
            <div className="workspace-grid" style={{ gridTemplateColumns: '1fr' }}>
              <section className="workspace-section">
                <div className="section-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <h2>Statistiques de consultation</h2>
                    <div className="header-icon-v2"><BarChart2 size={20} /></div>
                  </div>
                </div>
                <div className="stats-grid-v2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                  <div className="stat-card-v2">
                    <div className="stat-label" style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 600 }}>Total Vues</div>
                    <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 900, color: '#4f46e5' }}>{docStats.reduce((acc, s) => acc + (parseInt(s.total_views as any) || 0), 0)}</div>
                  </div>
                  <div className="stat-card-v2">
                    <div className="stat-label" style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 600 }}>Note Moyenne Globale</div>
                    <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 900, color: '#f59e0b' }}>
                      {(() => {
                        const rated = docStats.filter(s => (parseFloat(s.avg_rating as any) || 0) > 0);
                        if (rated.length === 0) return 'N/A';
                        const total = rated.reduce((acc, s) => acc + (parseFloat(s.avg_rating as any) || 0), 0);
                        return (total / rated.length).toFixed(1);
                      })()} / 5
                    </div>
                  </div>
                  <div className="stat-card-v2">
                    <div className="stat-label" style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 600 }}>Documents actifs</div>
                    <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 900, color: '#10b981' }}>{docs.filter(d => !d.is_obsolete).length}</div>
                  </div>
                </div>
              </section>

              <section className="workspace-section">
                <div className="section-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <h2>Gestion de la bibliothèque ({docs.length})</h2>
                    <div className="header-icon-v2"><GraduationCap size={20} /></div>
                    
                    <div className="filter-group-v2" style={{ marginLeft: '10px' }}>
                      <select 
                        value={filterLibApp} 
                        onChange={e => setFilterLibApp(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                        style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: 'white', fontSize: '0.85rem', fontWeight: 600, color: '#4f46e5', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                      >
                        <option value="all">Toutes les applications</option>
                        {apps.map(app => (
                          <option key={app.id} value={app.id}>{app.name} ({app.normal_doc_count || 0},{app.technical_doc_count || 0})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button className="primary-btn-v2" onClick={() => { setEditingDoc(null); setNewDoc({ title: '', app_id: apps[0]?.id || 0, doc_type: 'pdf', url: '', is_favorite: false, is_technical: false, is_obsolete: false }); setShowDocModal(true); }}>
                    <Plus size={18} /> Nouveau Document
                  </button>
                </div>

                <div className="table-responsive-v2" style={{ overflowX: 'auto' }}>
                  <table className="modern-table-v2">
                    <thead>
                      <tr>
                        <th>Application</th>
                        <th>Titre</th>
                        <th>Type</th>
                        <th>Statut</th>
                        <th>Stats</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const filteredDocs = docs.filter(d => filterLibApp === 'all' || d.app_id === filterLibApp);
                        const groupedByApp = filteredDocs.reduce((acc, doc) => {
                          const appName = doc.app_name || 'Sans application';
                          if (!acc[appName]) acc[appName] = [];
                          acc[appName].push(doc);
                          return acc;
                        }, {} as Record<string, AppDoc[]>);

                        return Object.entries(groupedByApp).map(([appName, appDocs]) => (
                          <React.Fragment key={appName}>
                            <tr style={{ background: '#f8fafc' }}>
                              <td colSpan={5} style={{ padding: '12px 16px', fontWeight: 800, color: '#4f46e5', fontSize: '0.9rem', borderBottom: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <LayoutGrid size={16} />
                                  {appName} ({appDocs.length})
                                </div>
                              </td>
                            </tr>
                            {appDocs.map(doc => {
                              const s = docStats.find(st => st.id === doc.id);
                              return (
                                <tr key={doc.id} style={{ opacity: doc.is_obsolete ? 0.6 : 1 }}>
                                  <td>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4f46e5' }}>{doc.app_name || 'N/A'}</span>
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      {doc.is_favorite && <Star size={14} fill="#f59e0b" color="#f59e0b" />}
                                      {doc.is_technical && <div style={{ background: '#eef2ff', color: '#4f46e5', padding: '4px', borderRadius: '6px' }} title="Document technique"><Code size={14} /></div>}
                                      {doc.title}
                                    </div>
                                  </td>
                                  <td>
                                    <span style={{ 
                                      padding: '4px 8px', 
                                      borderRadius: '6px', 
                                      fontSize: '0.7rem', 
                                      fontWeight: 800,
                                      background: doc.doc_type === 'pdf' ? '#fee2e2' : (doc.doc_type === 'youtube' ? '#ffedd5' : '#e0f2fe'),
                                      color: doc.doc_type === 'pdf' ? '#dc2626' : (doc.doc_type === 'youtube' ? '#ea580c' : '#0369a1')
                                    }}>
                                      {doc.doc_type.toUpperCase()}
                                    </span>
                                  </td>
                                  <td>
                                    <span style={{ 
                                      padding: '4px 8px', 
                                      borderRadius: '6px', 
                                      fontSize: '0.7rem', 
                                      fontWeight: 800,
                                      background: doc.is_obsolete ? '#f1f5f9' : '#dcfce7',
                                      color: doc.is_obsolete ? '#64748b' : '#166534'
                                    }}>
                                      {doc.is_obsolete ? 'Non publié' : 'Publié'}
                                    </span>
                                  </td>
                                  <td>
                                    <div style={{ fontSize: '0.8rem' }}>
                                      <div>👁️ {s?.total_views || 0} vues</div>
                                      {(parseFloat(s?.avg_rating as any) || 0) > 0 && <div style={{ color: '#f59e0b', fontWeight: 700 }}>⭐ {parseFloat(s?.avg_rating as any).toFixed(1)} ({s?.total_ratings})</div>}
                                    </div>
                                  </td>
                                  <td>
                                    <div className="action-btns-v2" style={{ display: 'flex', gap: '8px' }}>
                                      <a 
                                        href={doc.doc_type === 'youtube' && !doc.url.startsWith('http') ? `https://www.youtube.com/watch?v=${doc.url}` : doc.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="action-btn-v2" 
                                        style={{ background: '#e0f2fe', color: '#0369a1', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                        title="Ouvrir le document"
                                      >
                                        <ExternalLink size={16} />
                                      </a>
                                      <button className="action-btn-v2" style={{ background: '#f1f5f9', border: 'none', padding: '6px', borderRadius: '8px', cursor: 'pointer' }} onClick={() => { setEditingDoc(doc); setShowDocModal(true); }}><Edit2 size={16} /></button>
                                      <button className="action-btn-v2" style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '6px', borderRadius: '8px', cursor: 'pointer' }} onClick={() => handleDeleteDoc(doc.id)}><Trash2 size={16} /></button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      {/* Doc Modal */}
      {showDocModal && (
        <div className="modal-overlay-v2">
          <div className="modal-content-v2 animate-fade-in" style={{ maxWidth: '700px' }}>
            <div className="modal-header-v2" style={{ borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={28} style={{ color: '#7c3aed' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>{editingDoc ? 'Modifier Document' : 'Nouveau Document'}</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                    {editingDoc ? 'Mettre à jour les informations du document' : 'Ajouter un nouveau document à la bibliothèque'}
                  </p>
                </div>
              </div>
              <button className="close-modal-btn" onClick={() => setShowDocModal(false)}><X size={20} /></button>
            </div>

            <div className="modal-body-v2" style={{ paddingTop: '28px' }}>
              <div className="form-grid-v2" style={{ gridTemplateColumns: '1fr', gap: '24px' }}>

                {/* Section Information générale */}
                <div style={{ paddingBottom: '20px', borderBottom: '1px solid #f1f5f9' }}>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📋 Informations générales</h4>

                  <div className="form-group-v2" style={{ marginBottom: '16px' }}>
                    <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>Application associée</label>
                    <select
                      value={editingDoc ? editingDoc.app_id : newDoc.app_id}
                      onChange={e => editingDoc ? setEditingDoc({...editingDoc, app_id: parseInt(e.target.value)}) : setNewDoc({...newDoc, app_id: parseInt(e.target.value)})}
                      style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '0.95rem', background: '#ffffff', color: '#1e293b', cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                      <option value={0}>Sélectionner une application</option>
                      {apps.map(app => (
                        <option key={app.id} value={app.id}>{app.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group-v2" style={{ marginBottom: '16px' }}>
                    <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>Titre du document</label>
                    <input
                      type="text"
                      value={editingDoc ? editingDoc.title : newDoc.title}
                      onChange={e => editingDoc ? setEditingDoc({...editingDoc, title: e.target.value}) : setNewDoc({...newDoc, title: e.target.value})}
                      placeholder="Ex: Guide utilisateur, Vidéo de démo..."
                      style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '0.95rem', transition: 'all 0.2s' }}
                    />
                  </div>

                  <div className="form-group-v2">
                    <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>Description</label>
                    <textarea
                      value={editingDoc ? editingDoc.description : newDoc.description}
                      onChange={e => editingDoc ? setEditingDoc({...editingDoc, description: e.target.value}) : setNewDoc({...newDoc, description: e.target.value})}
                      placeholder="Précisez le contenu ou l'usage de ce document..."
                      style={{ width: '100%', minHeight: '90px', padding: '11px 12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '0.95rem', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                  </div>
                </div>

                {/* Section Contenu */}
                <div style={{ paddingBottom: '20px', borderBottom: '1px solid #f1f5f9' }}>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📄 Contenu du document</h4>

                  <div className="form-group-v2" style={{ marginBottom: '16px' }}>
                    <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>Type de document</label>
                    <select
                      value={editingDoc ? editingDoc.doc_type : newDoc.doc_type}
                      onChange={e => editingDoc ? setEditingDoc({...editingDoc, doc_type: e.target.value as any}) : setNewDoc({...newDoc, doc_type: e.target.value as any})}
                      style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '0.95rem', background: '#ffffff', color: '#1e293b', cursor: 'pointer' }}
                    >
                      <option value="pdf">📕 Fichier PDF</option>
                      <option value="youtube">🎬 Vidéo YouTube</option>
                      <option value="link">🔗 Lien externe</option>
                    </select>
                  </div>

                  <div className="form-group-v2">
                    <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>
                      {(editingDoc ? editingDoc.doc_type : newDoc.doc_type) === 'youtube' ? '🎬 Identifiant ou URL vidéo' : '🔗 URL'}
                    </label>
                    <input
                      type="text"
                      value={editingDoc ? editingDoc.url : newDoc.url}
                      onChange={e => editingDoc ? setEditingDoc({...editingDoc, url: e.target.value}) : setNewDoc({...newDoc, url: e.target.value})}
                      placeholder="https://..."
                      style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '0.95rem' }}
                    />
                  </div>

                  {(editingDoc ? editingDoc.doc_type : newDoc.doc_type) === 'pdf' && (
                    <div className="form-group-v2" style={{ marginTop: '16px' }}>
                      <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>📁 Fichier PDF</label>
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={e => setDocFile(e.target.files ? e.target.files[0] : null)}
                        style={{ width: '100%', padding: '14px 12px', border: '2px dashed #cbd5e1', borderRadius: '10px', background: '#f8fafc', fontSize: '0.95rem', cursor: 'pointer' }}
                      />
                      {(editingDoc?.url || newDoc?.url) && !docFile && (
                        <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '8px' }}>✓ Fichier actuel : {editingDoc?.url || newDoc?.url}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Section Options */}
                <div>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚙️ Options</h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', borderRadius: '10px', background: '#fff7ed', border: '1px solid #fed7aa', transition: 'all 0.2s' }}>
                      <input
                        type="checkbox"
                        checked={editingDoc ? editingDoc.is_favorite : newDoc.is_favorite}
                        onChange={e => editingDoc ? setEditingDoc({...editingDoc, is_favorite: e.target.checked}) : setNewDoc({...newDoc, is_favorite: e.target.checked})}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#f97316' }}
                      />
                      <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#92400e' }}>⭐ Favori</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', borderRadius: '10px', background: '#dbeafe', border: '1px solid #bfdbfe', transition: 'all 0.2s' }}>
                      <input
                        type="checkbox"
                        checked={editingDoc ? editingDoc.is_technical : newDoc.is_technical}
                        onChange={e => editingDoc ? setEditingDoc({...editingDoc, is_technical: e.target.checked}) : setNewDoc({...newDoc, is_technical: e.target.checked})}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#0284c7' }}
                      />
                      <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#0c4a6e' }}>🔧 Technique</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', borderRadius: '10px', background: '#fee2e2', border: '1px solid #fecaca', transition: 'all 0.2s' }}>
                      <input
                        type="checkbox"
                        checked={editingDoc ? editingDoc.is_obsolete : newDoc.is_obsolete}
                        onChange={e => editingDoc ? setEditingDoc({...editingDoc, is_obsolete: e.target.checked}) : setNewDoc({...newDoc, is_obsolete: e.target.checked})}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#dc2626' }}
                      />
                      <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#7f1d1d' }}>🚫 Masqué</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer-v2" style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="filter-btn-v2" onClick={() => setShowDocModal(false)} style={{ padding: '10px 20px' }}>Annuler</button>
              <button className="primary-btn-v2" onClick={editingDoc ? () => handleUpdateDoc(editingDoc) : handleCreateDoc} disabled={isUploading} style={{ padding: '10px 24px' }}>
                {isUploading ? <><div className="spinner-v2" style={{ width: '16px', height: '16px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> Upload...</> : <><Save size={18} /> {editingDoc ? 'Mettre à jour' : 'Créer le document'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .magapp-admin-container {
          min-height: 100vh;
          background: #f8fafc;
          padding-bottom: 50px;
          color: #1e293b;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }

        .magapp-admin-content {
          margin-top: 30px;
          max-width: 1400px !important;
          padding: 0 40px;
        }

        .admin-header-v2 {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
          padding: 32px 40px;
          background: rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(12px);
          border-radius: 30px;
          border: 1px solid rgba(255, 255, 255, 0.8);
          box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.05);
          flex-wrap: wrap;
          gap: 20px;
        }

        .header-info h1 {
          font-size: 2.2rem;
          font-weight: 1000;
          margin: 0;
          color: #0f172a;
          letter-spacing: -0.04em;
        }

        .header-info p {
          color: #64748b;
          margin: 6px 0 0 0;
          font-size: 1.05rem;
          font-weight: 500;
        }

        .admin-tabs-v2 {
          display: flex;
          flex-wrap: wrap;
          background: rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(8px);
          padding: 6px;
          border-radius: 18px;
          gap: 6px;
          border: 1px solid white;
        }

        .tab-btn-v2 {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border: none;
          background: none;
          border-radius: 14px;
          color: #64748b;
          font-weight: 800;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .tab-btn-v2:hover {
          color: #4f46e5;
          background: rgba(255, 255, 255, 0.8);
          transform: translateY(-1px);
        }

        .tab-btn-v2.active {
          background: white;
          color: #4f46e5;
          box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.1);
          transform: scale(1.05);
        }

        .admin-workspace-v2 {
          animation: fadeSlideUp 0.5s ease-out;
        }

        .workspace-grid {
          display: grid;
          grid-template-columns: 400px 1fr;
          gap: 30px;
        }

        .workspace-section {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(16px);
          border-radius: 28px;
          border: 1px solid rgba(255, 255, 255, 0.8);
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.02);
          padding: 32px;
          display: flex;
          flex-direction: column;
          margin-bottom: 30px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .section-header h2 {
          font-size: 1.2rem;
          font-weight: 800;
          margin: 0;
          color: #1e293b;
        }

        .header-icon-v2 {
          width: 40px;
          height: 40px;
          background: #eef2ff;
          color: #4f46e5;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
        }

        .form-grid-v2 {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
        }

        .form-group-v2 {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group-v2.full-width { grid-column: span 2; }

        .form-group-v2 label {
          font-size: 0.9rem;
          font-weight: 600;
          color: #334155;
          margin-left: 0;
        }

        .form-group-v2 input,
        .form-group-v2 textarea,
        .form-group-v2 select {
          padding: 12px 16px;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          background: #fafbfc;
          font-size: 0.95rem;
          transition: all 0.2s;
        }

        .form-group-v2 input::placeholder,
        .form-group-v2 textarea::placeholder {
          color: #94a3b8;
        }

        .form-group-v2 input:focus,
        .form-group-v2 textarea:focus,
        .form-group-v2 select:focus {
          border-color: #4f46e5;
          background: white;
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1);
          outline: none;
        }

        .apps-grid-v2 {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 24px;
        }

        .app-card-v2 {
          background: white;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .app-card-v2:hover {
          transform: translateY(-4px);
          border-color: #4f46e5;
          box-shadow: 0 12px 20px -8px rgba(79, 70, 229, 0.2);
        }

        .app-card-v2.is-published {
          background: #f0f3ff;
          border-color: #c7d2fe;
        }

        .published-badge {
          font-size: 0.65rem;
          font-weight: 800;
          padding: 2px 6px;
          background: #e0e7ff;
          color: #4338ca;
          border-radius: 6px;
          text-transform: uppercase;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .status-dot.mercator { background-color: #10b981; } /* Green */
        .status-dot.creator { background-color: #3b82f6; } /* Blue */

        .app-card-inner-v2 {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .app-card-inner-v2 img {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          background: white;
          padding: 8px;
          border: 1px solid #f1f5f9;
          object-fit: contain;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          transition: transform 0.3s;
        }

        .app-card-v2:hover img {
          transform: rotate(-5deg) scale(1.1);
        }

        .app-details-v2 h4 {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.01em;
        }

        .app-details-v2 p {
          margin: 2px 0 0 0;
          font-size: 0.75rem;
          color: #94a3b8;
          max-width: 150px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .app-actions-v2 {
          margin-left: auto;
          display: flex;
          gap: 8px;
        }

        .app-actions-v2 button {
          width: 36px;
          height: 36px;
          border: none;
          background: #f8fafc;
          color: #64748b;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }

        .app-actions-v2 button:hover { 
          background: #4f46e5; 
          color: white; 
          transform: scale(1.1);
          box-shadow: 0 4px 8px rgba(79, 70, 229, 0.2);
        }
        
        .app-actions-v2 button.delete:hover { 
          background: #e11d48; 
          box-shadow: 0 4px 8px rgba(225, 29, 72, 0.2);
        }

        .stats-visual-grid-v2 {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 20px;
        }

        .stat-card-v2 {
          background: white;
          padding: 20px;
          border-radius: 18px;
          border: 1px solid #e2e8f0;
        }

        .stat-info-v2 {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .stat-name-v2 { font-weight: 700; color: #475569; }
        .stat-value-v2 { font-weight: 900; color: #1e293b; font-size: 1.1rem; }

        .stat-bar-bg-v2 {
          height: 6px;
          background: #f1f5f9;
          border-radius: 10px;
          overflow: hidden;
        }

        .stat-bar-fill-v2 {
          height: 100%;
          background: linear-gradient(90deg, #4f46e5, #7c3aed);
          border-radius: 10px;
          transition: width 1s ease-out;
        }

        .primary-btn-v2 {
          background: linear-gradient(135deg, #4f46e5 0%, #4f46e5 100%);
          color: white;
          border: none;
          padding: 13px 28px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 0.95rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          box-shadow: 0 8px 16px -2px rgba(79, 70, 229, 0.3);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .primary-btn-v2:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 24px -4px rgba(79, 70, 229, 0.4);
          background: linear-gradient(135deg, #4338ca 0%, #4338ca 100%);
        }

        .primary-btn-v2:active {
          transform: translateY(0);
          box-shadow: 0 4px 8px -1px rgba(79, 70, 229, 0.3);
        }

        .primary-btn-v2:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .categories-list-v2 {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
        }

        .category-item-v2 {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: white;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }

        .category-item-v2 span { font-weight: 700; color: #334155; }

        .modern-table-v2 {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0 10px;
        }

        .modern-table-v2 th {
          text-align: left;
          padding: 12px 16px;
          color: #94a3b8;
          font-weight: 700;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .modern-table-v2 tr {
          background: white;
          border-radius: 12px;
          transition: all 0.2s;
        }

        .modern-table-v2 tbody tr:hover {
          box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.08);
          transform: translateY(-1px);
        }

        .modern-table-v2 td {
          padding: 14px 16px;
          background: white;
          border: none;
        }

        .modern-table-v2 td:first-child { border-top-left-radius: 12px; border-bottom-left-radius: 12px; }
        .modern-table-v2 td:last-child { border-top-right-radius: 12px; border-bottom-right-radius: 12px; }

        .filter-btn-v2 {
          padding: 8px 16px;
          border: 1px solid #e2e8f0;
          background: white;
          border-radius: 10px;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
        }

        .filter-btn-v2.active {
          background: #4f46e5;
          color: white;
          border-color: #4f46e5;
        }

        .filter-group-v2 {
          display: flex;
          background: #f1f5f9;
          padding: 4px;
          border-radius: 12px;
          gap: 2px;
        }

        .filter-group-v2 .filter-btn-v2 {
          padding: 6px 12px;
          border: none;
          background: none;
          font-size: 0.75rem;
          border-radius: 8px;
        }

        .filter-group-v2 .filter-btn-v2.active {
          background: white;
          color: #4f46e5;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }

        .modal-overlay-v2 {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 20px;
        }

        .modal-content-v2 {
          background: white;
          border-radius: 24px;
          width: 100%;
          max-width: 1000px;
          max-height: 92vh;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 10px 25px -5px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          border: 1px solid #e2e8f0;
          overflow: hidden;
        }

        .modal-header-v2 {
          padding: 28px 36px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #f1f5f9;
          flex-shrink: 0;
          background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
        }

        .modal-header-v2 h3 {
          margin: 0;
          font-size: 1.6rem;
          font-weight: 700;
          color: #0f172a;
          letter-spacing: -0.025em;
        }

        .header-icon-v2 {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          border-radius: 12px;
          color: white;
        }

        .modal-body-v2 {
          padding: 36px;
          overflow-y: auto;
          flex: 1;
          min-height: 0;
          background: white;
        }

        /* Style des barres de défilement - webkit browsers */
        .modal-body-v2::-webkit-scrollbar {
          width: 10px;
        }

        .modal-body-v2::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 10px;
        }

        .modal-body-v2::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 5px;
        }

        .modal-body-v2::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .modal-footer-v2 {
          padding: 24px 36px;
          border-top: 2px solid #f1f5f9;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
          border-bottom-left-radius: 24px;
          border-bottom-right-radius: 24px;
          flex-shrink: 0;
        }

        .close-modal-btn {
          background: #f1f5f9;
          border: none;
          padding: 10px;
          border-radius: 12px;
          cursor: pointer;
          color: #64748b;
          transition: all 0.2s;
        }

        .close-modal-btn:hover {
          background: #fee2e2;
          color: #ef4444;
          transform: rotate(90deg);
        }

        .animate-fade-in {
          animation: modalFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .user-count-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: white;
          border-radius: 50%;
          font-size: 0.7rem;
          font-weight: 800;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }

        .modal-tabs {
          display: flex;
          padding: 0 36px;
          border-bottom: none;
          gap: 8px;
          flex-shrink: 0;
          background: white;
          align-items: center;
        }

        .modal-tabs button {
          padding: 12px 20px;
          background: transparent;
          border: 2px solid transparent;
          border-radius: 12px;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
          font-size: 0.95rem;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }

        .modal-tabs button:hover {
          background: #f1f5f9;
          color: #4f46e5;
        }

        .modal-tabs button.active {
          background: white;
          color: #4f46e5;
          border-bottom-color: #4f46e5;
          box-shadow: 0 0 0 2px #dbeafe;
        }

        .ad-search-box input {
          flex: 1;
          padding: 10px 14px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
        }

        .ad-results {
          margin-top: 12px;
          background: white;
          border-radius: 14px;
          border: 2px solid #e2e8f0;
          max-height: 260px;
          overflow-y: auto;
          transition: all 0.2s;
        }

        .ad-results::-webkit-scrollbar {
          width: 8px;
        }

        .ad-results::-webkit-scrollbar-track {
          background: transparent;
        }

        .ad-results::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }

        .ad-results::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .ad-result-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
          border-bottom: 1px solid #f1f5f9;
          transition: all 0.15s;
        }

        .ad-result-item:hover {
          background: #f8fafc;
        }

        .ad-result-item:last-child { border-bottom: none; }
        .ad-result-item strong { display: block; font-size: 0.9rem; color: #0f172a; font-weight: 600; }
        .ad-result-item span { font-size: 0.8rem; color: #64748b; }
        .ad-result-item button {
          padding: 6px 14px;
          background: #4f46e5;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .ad-result-item button:hover {
          background: #4338ca;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }

        .empty-msg {
          text-align: center;
          color: #94a3b8;
          font-style: italic;
          padding: 20px;
        }

        .users-table-scroll {
          max-height: 380px;
          overflow-y: auto;
          margin-top: 16px;
          border-radius: 14px;
          border: 2px solid #e2e8f0;
          background: white;
        }

        .users-table-scroll::-webkit-scrollbar {
          width: 10px;
        }

        .users-table-scroll::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 10px;
        }

        .users-table-scroll::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 5px;
        }

        .users-table-scroll::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .users-management {
          display: flex;
          flex-direction: column;
          gap: 40px;
        }

        .ad-search-box {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .ad-search-box label {
          font-weight: 600;
          color: #334155;
          font-size: 0.95rem;
        }

        .app-users-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .app-users-list > label {
          font-weight: 600;
          color: #334155;
          font-size: 0.95rem;
        }

        .app-actions-v2 button.maintenance-btn:hover {
          background: #f59e0b;
          box-shadow: 0 4px 8px rgba(245, 158, 11, 0.2);
        }

        @media (max-width: 1024px) {
          .workspace-grid { grid-template-columns: 1fr; }
          .form-grid-v2 { grid-template-columns: 1fr; }
          .form-group-v2.full-width { grid-column: span 1; }
          .modal-content-v2 { max-width: 95vw; }
          .modal-header-v2, .modal-body-v2, .modal-footer-v2 { padding: 20px 24px; }
          .modal-tabs { padding: 0 24px; }
        }

        @media (max-width: 640px) {
          .modal-content-v2 { max-width: 100vw; border-radius: 16px; max-height: 95vh; }
          .modal-header-v2 { padding: 16px 20px; }
          .modal-header-v2 h3 { font-size: 1.3rem; }
          .modal-body-v2 { padding: 20px; }
          .modal-footer-v2 { padding: 16px 20px; }
          .modal-tabs { padding: 0 20px; gap: 0; }
          .modal-tabs button { padding: 12px 16px; font-size: 0.85rem; }
          .form-grid-v2 { gap: 16px; }
        }
      `}</style>
    </div>
  );
};

export default MagappAdmin;
