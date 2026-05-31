import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import Header from '../../components/Header';
import TicketList from './TicketList';
import TicketKanban from './TicketKanban';
import TicketInbox from './TicketInbox';
import LiveSessionsPanel from './LiveSessionsPanel';
import { useAuth } from '../../contexts/AuthContext';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

const KPI_FILTERS: Record<string, { label: string; params?: Record<string, string> }> = {
  open:      { label: 'Ouverts',    params: { status_in: '1,2,3' } },
  in_progress: { label: 'En cours', params: { status_in: '2,3' } },
  waiting:   { label: 'En attente', params: { status_in: '4' } },
  critical:  { label: 'Critiques',  params: { status_in: '1,2,3', priority: '5' } },
  resolved:  { label: 'Résolus',    params: { status_in: '5' } },
  problems:  { label: 'Problèmes',  params: { type: '3', status_in: '1,2,3,4,5,6' } },
  sla_breached: { label: 'SLA dépassées', params: { sla_breached: '1' } },
};

const USER_FILTERS: Record<string, { label: string; icon?: string; getParams: () => Record<string, string> }> = {
  my:       { label: 'Mes tickets assignés', getParams: () => { const u = JSON.parse(localStorage.getItem('user') || '{}'); return { my_username: u.username, status_in: '1,2,3,4,5' }; } },
  my_req:   { label: 'Mes tickets',          getParams: () => { const u = JSON.parse(localStorage.getItem('user') || '{}'); return { requester_email: u.email }; } },
  vip:      { label: 'VIP', icon: '⭐',      getParams: () => ({ vip: '1' }) },
};

const ROLE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  superadmin:   { label: 'Super Admin',   color: '#dc2626', bg: '#fef2f2' },
  superadmins:  { label: 'Super Admin',   color: '#dc2626', bg: '#fef2f2' },
  admin:        { label: 'Admin',         color: '#ea580c', bg: '#fff7ed' },
  superviseur:  { label: 'Superviseur',   color: '#7c3aed', bg: '#faf5ff' },
  supervisor:   { label: 'Superviseur',   color: '#7c3aed', bg: '#faf5ff' },
  technicien:   { label: 'Technicien',    color: '#1d4ed8', bg: '#eff6ff' },
  technicienne: { label: 'Technicien',    color: '#1d4ed8', bg: '#eff6ff' },
  technician:   { label: 'Technicien',    color: '#1d4ed8', bg: '#eff6ff' },
  tech:         { label: 'Technicien',    color: '#1d4ed8', bg: '#eff6ff' },
  readonly:     { label: 'Lecture seule', color: '#64748b', bg: '#f1f5f9' },
  user:         { label: 'Utilisateur',   color: '#0284c7', bg: '#e0f2fe' },
};

export default function TicketsDashboard() {
  const { user } = useAuth();
  const [resolvedRole, setResolvedRole] = useState<string | null>(null);
  const [canViewKpi, setCanViewKpi] = useState(true);
  // Vue initiale : « live » si on arrive via la bulle de chat (/tickets?view=live).
  const initialView = (typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('view') === 'live') ? 'live' : 'table';
  const [viewMode, setViewMode] = useState<'table' | 'kanban' | 'inbox' | 'live'>(initialView);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [dailyMetrics, setDailyMetrics] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [activeUserFilter, setActiveUserFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  // ── Réinitialisation GLPI (modale + barre de progression) ──
  const [showResetModal, setShowResetModal] = useState(false);
  const [backupBeforeReset, setBackupBeforeReset] = useState(true);
  const [resetRunning, setResetRunning] = useState(false);
  const [resetProgress, setResetProgress] = useState<{
    active: boolean; phase: string | null; percent: number; message: string;
    error: string | null; result: any;
  } | null>(null);
  const resetPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const showRejectedRef = useRef(false);
  const [showResolved, setShowResolved] = useState(false);
  const showResolvedRef = useRef(false);
  const [selectedInboxId, setSelectedInboxId] = useState<number | null>(null);
  const viewModeRef = useRef<'table' | 'kanban' | 'inbox' | 'live'>(initialView);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  const [sortKey, setSortKey] = useState('date_creation');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [requesterSearch, setRequesterSearch] = useState('');
  const [requesterResults, setRequesterResults] = useState<any[]>([]);
  const [requesterSearching, setRequesterSearching] = useState(false);
  const [activeRequesterEmail, setActiveRequesterEmail] = useState<string | null>(null);
  const [kpiHistory, setKpiHistory] = useState<any[]>([]);
  const [kpiDays, setKpiDays] = useState(30);
  const [kpiActionLoading, setKpiActionLoading] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | 'none' | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<number | null>(null);
  const [softwares, setSoftwares] = useState<{ id: number; name: string }[]>([]);
  const [activeSoftware, setActiveSoftware] = useState<number | null>(null);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [activeGroup, setActiveGroup] = useState<number | null>(null);
  const activeGroupRef = useRef<number | null>(null);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [activeTechnician, setActiveTechnician] = useState<number | null>(null);
  const activeTechnicianRef = useRef<number | null>(null);
  const [liveNotif, setLiveNotif] = useState<{ count: number; lastSession: any } | null>(null);
  const [liveTickerMsg, setLiveTickerMsg] = useState<string | null>(null);
  const [activeLiveFilter, setActiveLiveFilter] = useState(false);
  const [liveStats, setLiveStats] = useState<any>(null);
  const ALL_KPI_KEYS = ['open','in_progress','waiting','critical','resolved','problems','sla_breached','age','wait_time','resolve_time','live_chat'];
  const [selectedKpis, setSelectedKpis] = useState<string[]>(ALL_KPI_KEYS);
  const [showKpiConfig, setShowKpiConfig] = useState(false);
  const limit = 50;

  const inboxParams = React.useMemo(() => {
    const params: Record<string, string> = {};
    if (activeFilter && KPI_FILTERS[activeFilter]?.params) {
      Object.assign(params, KPI_FILTERS[activeFilter].params);
    } else if (!showRejected && !showResolved) {
      params.status_in = '1,2,3,4,5';
    } else if (!showRejected && showResolved) {
      params.status_in = '1,2,3,4,5,6';
    }
    if (activeUserFilter && USER_FILTERS[activeUserFilter]) {
      Object.assign(params, USER_FILTERS[activeUserFilter].getParams());
    }
    if (search.trim()) {
      params.search = search.trim();
    }
    if (activeRequesterEmail) {
      params.requester_email = activeRequesterEmail;
    }
    if (activeCategory) {
      params.category_id = String(activeCategory);
    }
    if (activeSubcategory) {
      params.subcategory_id = String(activeSubcategory);
    }
    if (activeSoftware) {
      params.software_id = String(activeSoftware);
    }
    if (activeGroup) {
      params.group_id = String(activeGroup);
    }
    if (activeTechnician) {
      params.technician_id = String(activeTechnician);
    }
    if (activeLiveFilter) {
      params.is_live = 'true';
      params.status_in = '1,2,3,4,5,6';
    }
    params.sort = sortKey;
    params.order = sortDir;
    return params;
  }, [activeFilter, activeUserFilter, search, activeRequesterEmail, activeCategory, activeSubcategory, activeSoftware, activeGroup, activeTechnician, activeLiveFilter, showRejected, showResolved, sortKey, sortDir]);

  const lastLoadArgsRef = useRef<any[]>([]);
  const loadData = useCallback(async (
    filter?: string | null,
    userFilter?: string | null,
    pageNum?: number,
    searchValue: string = search,
    categoryId?: number | 'none' | null,
    subcategoryId?: number | null,
    softwareId?: number | null,
    requesterEmail?: string | null,
    isLiveOverride?: boolean,
    silent?: boolean
  ) => {
    lastLoadArgsRef.current = [filter, userFilter, pageNum, searchValue, categoryId, subcategoryId, softwareId, requesterEmail, isLiveOverride];
    if (!silent) setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params: Record<string, string> = { limit: String(limit), page: String(pageNum || page) };
      if (filter && KPI_FILTERS[filter]?.params) {
        Object.assign(params, KPI_FILTERS[filter].params);
      } else if (!showRejectedRef.current && !showResolvedRef.current) {
        params.status_in = (viewModeRef.current === 'kanban' || viewModeRef.current === 'inbox') ? '1,2,3,4,5' : '1,2,3,4';
      } else if (!showRejectedRef.current && showResolvedRef.current) {
        params.status_in = '1,2,3,4,5,6';
      } else if (viewModeRef.current === 'kanban' || viewModeRef.current === 'inbox') {
        params.status_in = '1,2,3,4,5';
      }
      if (userFilter && USER_FILTERS[userFilter]) {
        Object.assign(params, USER_FILTERS[userFilter].getParams());
      }
      if (searchValue.trim()) {
        params.search = searchValue.trim();
      }
      if (requesterEmail) {
        params.requester_email = requesterEmail;
      } else if (viewModeRef.current === 'kanban' || viewModeRef.current === 'inbox') {
        params.status_in = '1,2,3,4,5';
      }
      if (userFilter && USER_FILTERS[userFilter]) {
        Object.assign(params, USER_FILTERS[userFilter].getParams());
      }
      if (searchValue.trim()) {
        params.search = searchValue.trim();
      }
      if (categoryId) {
        params.category_id = String(categoryId);
      }
      if (subcategoryId) {
        params.subcategory_id = String(subcategoryId);
      }
      if (softwareId) {
        params.software_id = String(softwareId);
      }
      if (activeGroupRef.current) {
        params.group_id = String(activeGroupRef.current);
      }
      if (activeTechnicianRef.current) {
        params.technician_id = String(activeTechnicianRef.current);
      }
      const isLiveActive = isLiveOverride !== undefined ? isLiveOverride : activeLiveFilter;
      if (isLiveActive) {
        params.is_live = 'true';
        params.status_in = '1,2,3,4,5,6';
      }
      params.sort = sortKey;
      params.order = sortDir;
      const qs = new URLSearchParams(params).toString();
      // Filtres passés aux stats (pour afficher KPI filtrés + globaux)
      const statsParams: Record<string, string> = {};
      ['category_id', 'subcategory_id', 'software_id', 'group_id', 'technician_id', 'requester_email', 'search'].forEach(k => {
        if (params[k]) statsParams[k] = params[k];
      });
      const statsQs = new URLSearchParams(statsParams).toString();
      const [ticketsRes, statsRes] = await Promise.all([
        axios.get(`/api/tickets?${qs}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/tickets/dashboard/stats${statsQs ? '?' + statsQs : ''}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setTickets(ticketsRes.data.data || []);
      setTotal(ticketsRes.data.pagination?.total || 0);
      setTotalPages(ticketsRes.data.pagination?.totalPages || 1);
      setStats(statsRes.data);
    } catch (e: any) {
      console.error('Failed to load tickets:', e);
      if (e.response?.data?.message) alert('Erreur serveur: ' + e.response.data.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, search, sortKey, sortDir, activeLiveFilter]);

  const loadDataRef = useRef(loadData);
  useEffect(() => { loadDataRef.current = loadData; }, [loadData]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadDataRef.current(activeFilter, activeUserFilter, page, search, activeCategory, activeSubcategory, activeSoftware);
    }, 60000);
    return () => clearInterval(interval);
  }, [activeFilter, activeUserFilter, page, search, activeCategory, activeSubcategory, activeSoftware]);

  useEffect(() => { loadData(activeFilter, activeUserFilter, 1, search, activeCategory, activeSubcategory, activeSoftware); }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    axios.get('/api/tickets/my-role', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setResolvedRole(r.data.role))
      .catch(() => {});
    axios.get('/api/tickets/has-permission/dashboard:view_kpi', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setCanViewKpi(r.data.allowed !== false))
      .catch(() => {});
    axios.get('/api/tickets/dashboard/live-stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setLiveStats(r.data))
      .catch(() => {});
    axios.get('/api/tickets/dashboard/widgets', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const saved = r.data || [];
        if (saved.length > 0) {
          const savedKeys = saved.filter((w: any) => w.is_visible !== false).map((w: any) => w.widget_type);
          const missingKeys = ALL_KPI_KEYS.filter(k => !savedKeys.includes(k));
          setSelectedKpis([...missingKeys, ...savedKeys]);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    axios.get('/api/tickets/admin/categories', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setCategories(r.data || []))
      .catch(() => {});
    axios.get('/api/tickets/admin/groups', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setGroups(r.data || []))
      .catch(() => {});
    axios.get('/api/tickets/admin/technicians/available', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setTechnicians(r.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    axios.get('/api/tickets/ticket-stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const list = (r.data || [])
          .filter((x: any) => x.software_id && x.software_name)
          .map((x: any) => ({ id: x.software_id, name: x.software_name }));
        setSoftwares(list);
      })
      .catch(() => {});
  }, []);

  const loadKpiHistory = useCallback((days: number) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    axios.get(`/api/tickets/dashboard/kpi-history?days=${days}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setKpiHistory(r.data || []))
      .catch(() => {});
  }, []);

  const loadDailyMetrics = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    axios.get('/api/tickets/dashboard/daily-metrics', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setDailyMetrics(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    showResolvedRef.current = showResolved;
    loadData(activeFilter, activeUserFilter, 1, search, activeCategory, activeSubcategory, activeSoftware);
  }, [showResolved]);

  function handleCategoryFilter(categoryId: number | 'none' | null, subcategoryId: number | null) {
    setActiveCategory(categoryId);
    setActiveSubcategory(subcategoryId);
    setPage(1);
    loadData(activeFilter, activeUserFilter, 1, search, categoryId, subcategoryId, activeSoftware);
  }

  function handleGroupFilter(groupId: number | null) {
    setActiveGroup(groupId);
    activeGroupRef.current = groupId;
    setPage(1);
    loadData(activeFilter, activeUserFilter, 1, search, activeCategory, activeSubcategory, activeSoftware, activeRequesterEmail);
  }

  function handleTechnicianFilter(techId: number | null) {
    setActiveTechnician(techId);
    activeTechnicianRef.current = techId;
    setPage(1);
    loadData(activeFilter, activeUserFilter, 1, search, activeCategory, activeSubcategory, activeSoftware, activeRequesterEmail);
  }

  function handleSoftwareFilter(softwareId: number | null) {
    setActiveSoftware(softwareId);
    setPage(1);
    loadData(activeFilter, activeUserFilter, 1, search, activeCategory, activeSubcategory, softwareId);
  }

  async function handleRequesterSearch(q: string) {
    if (!q || q.length < 2) { setRequesterResults([]); return; }
    setRequesterSearching(true);
    try {
      const token = localStorage.getItem('token');
      // Recherche AD générique (évite le 403 de /tickets/users/search)
      const res = await axios.get(`/api/ad/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
      setRequesterResults(res.data || []);
    } catch { setRequesterResults([]); }
    finally { setRequesterSearching(false); }
  }

  function stopResetPolling() {
    if (resetPollRef.current) { clearInterval(resetPollRef.current); resetPollRef.current = null; }
  }

  async function pollResetProgress() {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/tickets/admin/sync-glpi/progress', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const p = res.data;
      setResetProgress(p);
      if (!p.active) {
        stopResetPolling();
        setResetRunning(false);
        loadData(activeFilter, activeUserFilter, page);
      }
    } catch {
      // On ignore les erreurs ponctuelles de polling ; le prochain tick réessaiera.
    }
  }

  async function startGlpiReset() {
    setResetRunning(true);
    setResetProgress({ active: true, phase: 'starting', percent: 0, message: 'Démarrage…', error: null, result: null });
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        '/api/tickets/admin/sync-glpi',
        { backup: backupBeforeReset },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Démarrer le polling de progression
      stopResetPolling();
      resetPollRef.current = setInterval(pollResetProgress, 1500);
      pollResetProgress();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Erreur au démarrage de la réinitialisation';
      setResetRunning(false);
      setResetProgress({
        active: false, phase: 'error', percent: 0,
        message: msg, error: msg, result: null,
      });
    }
  }

  // Nettoyage du polling au démontage
  useEffect(() => () => stopResetPolling(), []);

  useEffect(() => { loadKpiHistory(kpiDays); }, [kpiDays]);
  useEffect(() => { loadDailyMetrics(); }, []);

  // Live sessions socket listener — notif en temps réel pour les techs
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const socket = io({ auth: { token } });
    socket.on('connect', () => { socket.emit('tech_watch'); socket.emit('tickets_watch'); });
    socket.on('new_live_session', (session: any) => {
      if (session.chat_type && session.chat_type !== 'ville') return;
      setLiveNotif(prev => ({ count: (prev?.count || 0) + 1, lastSession: session }));
    });
    socket.on('session_closed', () => {
      setLiveNotif(prev => {
        if (!prev) return null;
        const c = prev.count - 1;
        return c <= 0 ? null : { ...prev, count: c };
      });
    });
    // Mise à jour temps réel de la liste/KPI sans rafraîchissement global
    const silentReload = () => {
      const args = lastLoadArgsRef.current;
      if (args && args.length) loadDataRef.current(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], true);
      else loadDataRef.current(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
    };
    socket.on('ticket_created', (payload: any) => {
      setLiveTickerMsg(`🎫 Nouveau ticket #${payload?.glpi_id ?? ''} : ${payload?.title || ''}`.trim());
      silentReload();
    });
    socket.on('ticket_updated', () => { silentReload(); });
    return () => { socket.disconnect(); };
  }, []);

  // Bandeau éphémère "mise à jour live"
  useEffect(() => {
    if (!liveTickerMsg) return;
    const t = setTimeout(() => setLiveTickerMsg(null), 6000);
    return () => clearTimeout(t);
  }, [liveTickerMsg]);

  function handleFilterClick(key: string) {
    setActiveLiveFilter(false);
    if (activeFilter === key) {
      setActiveFilter(null);
      setPage(1);
      loadData(null, activeUserFilter, 1, search, activeCategory, activeSubcategory, activeSoftware, null, false);
    } else {
      setActiveFilter(key);
      setPage(1);
      loadData(key, activeUserFilter, 1, search, activeCategory, activeSubcategory, activeSoftware, null, false);
    }
  }

  function handleUserFilterClick(key: string) {
    if (activeUserFilter === key) {
      setActiveUserFilter(null);
      setPage(1);
      loadData(activeFilter, null, 1, search, activeCategory, activeSubcategory, activeSoftware);
    } else {
      setActiveUserFilter(key);
      setPage(1);
      loadData(activeFilter, key, 1, search, activeCategory, activeSubcategory, activeSoftware);
    }
  }

  function goToPage(p: number) {
    if (p < 1 || p > totalPages) return;
    setPage(p);
    loadData(activeFilter, activeUserFilter, p, search, activeCategory, activeSubcategory, activeSoftware);
  }

  function showAll() {
    setActiveFilter(null);
    setActiveUserFilter(null);
    setSearch('');
    setActiveSoftware(null);
    setPage(1);
    loadData(null, null, 1, '', activeCategory, activeSubcategory, null);
  }

  function handleSort(key: string, dir: 'asc' | 'desc') {
    setSortKey(key);
    setSortDir(dir);
    setPage(1);
    loadData(activeFilter, activeUserFilter, 1, search, activeCategory, activeSubcategory, activeSoftware);
  }

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadData(activeFilter, activeUserFilter, 1, search, activeCategory, activeSubcategory, activeSoftware, activeRequesterEmail);
  }

  const getKpiValue = (key: string) =>
    key === 'open' ? stats?.open :
    key === 'in_progress' ? stats?.in_progress :
    key === 'waiting' ? stats?.waiting :
    key === 'critical' ? stats?.critical_open :
    stats?.resolved;

  const getTypeCounts = (key: string) => {
    const prefix = key === 'critical' ? 'critical' : key;
    return {
      incident: stats?.[`${prefix}_incident`] || 0,
      request: stats?.[`${prefix}_request`] || 0,
    };
  };

  function formatDuration(seconds: number) {
    if (!seconds || seconds <= 0) return '0j';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}j ${hours}h`;
    return `${hours}h`;
  }

  const getUserCount = (key: string) => {
    if (key === 'my') return stats?.user_counts?.assigned_to_me || 0;
    if (key === 'my_req') return stats?.user_counts?.requested_by_me || 0;
    if (key === 'vip') return stats?.user_counts?.vip || 0;
    return 0;
  };

  const style = document.createElement('style');
  style.textContent = `
    .tickets-dash { padding: 24px 12px; max-width: 100%; margin: 0 auto; font-family: system-ui, sans-serif; }
    .tickets-dash h1 { font-size: 24px; font-weight: 700; margin: 0 0 4px 0; display: flex; align-items: center; gap: 12px; }
    .tickets-dash .subtitle { color: #64748b; margin: 0 0 24px 0; font-size: 14px; }
    .tickets-dash .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .tickets-dash .view-tabs { display: flex; gap: 4px; background: #f1f5f9; padding: 3px; border-radius: 8px; }
    .tickets-dash .view-tab { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; background: transparent; color: #475569; }
    .tickets-dash .view-tab.active { background: #fff; color: #1e293b; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .tickets-dash .btn-new { background: #6366f1; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    .tickets-dash .btn-new:hover { background: #4f46e5; }
    .tickets-dash .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .tickets-dash .stat-card { background: #fff; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; }
    .tickets-dash .stat-card .label { font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
    .tickets-dash .stat-card .value { font-size: 28px; font-weight: 700; color: #1e293b; margin-top: 4px; }
    .tickets-dash .stat-card .value.red { color: #ef4444; }
    .tickets-dash .stat-card .value.amber { color: #f59e0b; }
    .tickets-dash .stat-card .value.green { color: #22c55e; }
    .tickets-dash .search-bar { display: flex; gap: 8px; margin-bottom: 16px; }
    .tickets-dash .search-bar input { flex: 1; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
    .tickets-dash .search-bar input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
    .tickets-dash .pagination { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 20px 0; }
    .tickets-dash .pagination button { padding: 8px 14px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; cursor: pointer; font-size: 13px; font-weight: 500; color: #475569; }
    .tickets-dash .pagination button:hover:not(:disabled) { background: #f1f5f9; border-color: #6366f1; color: #6366f1; }
    .tickets-dash .pagination button:disabled { opacity: 0.4; cursor: default; }
    .tickets-dash .pagination button.active { background: #6366f1; color: #fff; border-color: #6366f1; }
    .tickets-dash .pagination .info { font-size: 13px; color: #64748b; }
  `;
  document.head.appendChild(style);

  return (
    <>
      <Header />
      {liveTickerMsg && (
        <div style={{
          position: 'fixed', top: 70, right: 20, zIndex: 9999,
          background: '#1e293b', color: '#fff', padding: '10px 16px', borderRadius: 10,
          fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', gap: 8, maxWidth: 360,
          animation: 'slideInRight 0.25s ease',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.3)' }} />
          {liveTickerMsg}
        </div>
      )}
      <div className="tickets-dash">
      <div className="header">
        <div>
          <h1>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Support IT
            {(resolvedRole ?? user?.role) && (() => {
              const roleKey = (resolvedRole ?? user?.role ?? '').toLowerCase().trim();
              const cfg = ROLE_LABELS[roleKey] || { label: resolvedRole ?? user?.role, color: '#64748b', bg: '#f1f5f9' };
              return (
                <span style={{
                  fontSize: 12, fontWeight: 600, marginLeft: 10,
                  padding: '3px 10px', borderRadius: 20,
                  background: cfg.bg, color: cfg.color,
                  verticalAlign: 'middle', letterSpacing: '0.2px'
                }}>
                  {cfg.label}
                </span>
              );
            })()}
            <span style={{fontSize:14,fontWeight:400,color:'#64748b',marginLeft:8}}>
              {total} tickets · {stats && `${stats.open || 0} ouverts`}
            </span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="/tickets/new" className="btn-new">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nouveau ticket
          </a>
          {['superadmin','admin','supervisor','superviseur'].includes((resolvedRole ?? user?.role ?? '').toLowerCase().trim()) && (
            <a href="/tickets/stats" title="Statistiques du helpdesk"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '10px 18px', border: '1px solid #c7d2fe', borderRadius: 8, background: '#eef2ff', color: '#4338ca', fontWeight: 700, fontSize: 14, textDecoration: 'none', cursor: 'pointer' }}>
              📊 Statistiques
            </a>
          )}
          {['superadmin', 'admin', 'supervisor', 'superviseur'].includes((resolvedRole ?? user?.role ?? '').toLowerCase().trim()) && (
            <button onClick={() => setShowResetModal(true)} disabled={resetRunning}
              style={{
                padding: '10px 20px', border: '1px solid #7c3aed', borderRadius: 8,
                background: resetRunning ? '#f5f3ff' : '#fff', color: '#7c3aed',
                cursor: resetRunning ? 'default' : 'pointer', fontWeight: 600, fontSize: 14,
                display: 'inline-flex', alignItems: 'center', gap: 6, opacity: resetRunning ? 0.7 : 1
              }}>
              {resetRunning ? '⏳' : '🔄'} Récupérer GLPI
            </button>
          )}
        </div>
      </div>

      {/* ── Bannière live ── */}
      {liveNotif && liveNotif.count > 0 && (
        <div style={{
          marginBottom: 12, padding: '10px 16px',
          background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 12,
          animation: 'liveBannerIn 0.3s ease',
        }}>
          <style>{`@keyframes liveBannerIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }`}</style>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.3)', flexShrink: 0, display: 'inline-block' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>
            🟢 {liveNotif.count === 1 ? 'Une nouvelle session live' : `${liveNotif.count} sessions live`} en attente
            {liveNotif.lastSession?.user_display_name && ` — ${liveNotif.lastSession.user_display_name}`}
          </span>
          <button onClick={() => { setViewMode('live'); viewModeRef.current = 'live'; setLiveNotif(null); }}
            style={{ padding: '4px 14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
            Voir
          </button>
          <button onClick={() => setLiveNotif(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* ── Barre de filtres sur une ligne ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={showAll}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer',
            fontSize: 13, fontWeight: 500,
            background: !activeFilter && !activeUserFilter && !search && !requesterSearch ? '#6366f1' : '#f1f5f9',
            color: !activeFilter && !activeUserFilter && !search && !requesterSearch ? '#fff' : '#475569'
          }}>
          Tous
          <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: 'rgba(255,255,255,0.35)', color: 'inherit' }}>{stats?.total || 0}</span>
        </button>
        {Object.entries(USER_FILTERS).map(([key, cfg]) => (
          <button key={key} onClick={() => handleUserFilterClick(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: 13, fontWeight: 500,
              background: activeUserFilter === key ? (key === 'vip' ? '#fef3c7' : '#6366f1') : '#f1f5f9',
              color: activeUserFilter === key ? (key === 'vip' ? '#92400e' : '#fff') : '#475569',
              borderWidth: key === 'vip' && activeUserFilter === key ? 1 : 0,
              borderStyle: 'solid',
              borderColor: key === 'vip' ? '#fde68a' : 'transparent'
            }}>
            {cfg.icon ? <span style={{ fontSize: 14 }}>{cfg.icon}</span> : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            )}
            {cfg.label}
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
              background: activeUserFilter === key ? 'rgba(255,255,255,0.35)' : '#fff',
              color: 'inherit'
            }}>{getUserCount(key)}</span>
          </button>
        ))}
        <button onClick={() => { const newVal = !showResolved; showResolvedRef.current = newVal; setShowResolved(newVal); setActiveFilter(null); setActiveUserFilter(null); setPage(1); loadData(null, null, 1, search, activeCategory, activeSubcategory, activeSoftware); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer',
            fontSize: 13, fontWeight: 500, marginLeft: 8,
            background: showResolved ? '#f0fdf4' : '#f1f5f9',
            color: showResolved ? '#15803d' : '#475569'
          }}>
          {showResolved ? '🙈 Masquer résolus' : '👁️ Voir résolus'}
        </button>
        {['superadmin', 'admin', 'supervisor', 'superviseur'].includes((resolvedRole ?? user?.role ?? '').toLowerCase().trim()) && (
          <button onClick={() => { const newVal = !showRejected; showRejectedRef.current = newVal; setShowRejected(newVal); setActiveFilter(null); setActiveUserFilter(null); setPage(1); loadData(null, null, 1, search, activeCategory, activeSubcategory, activeSoftware); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: 13, fontWeight: 500, marginLeft: 8,
              background: showRejected ? '#fef2f2' : '#f1f5f9',
              color: showRejected ? '#dc2626' : '#475569'
            }}>
            {showRejected ? '🙈 Masquer les rejetés' : '👁️ Voir les rejetés'}
          </button>
        )}

        {/* Live filter button */}
        <button onClick={() => {
          const next = !activeLiveFilter;
          setActiveLiveFilter(next);
          setActiveFilter(null);
          setActiveUserFilter(null);
          setPage(1);
          loadData(null, null, 1, search, activeCategory, activeSubcategory, activeSoftware);
        }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', border: activeLiveFilter ? '1.5px solid #86efac' : 'none',
            borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: activeLiveFilter ? '#f0fdf4' : '#f1f5f9',
            color: activeLiveFilter ? '#15803d' : '#475569',
          }}>
          🟢 Live
        </button>

        <div style={{ flex: 1 }} />

        {/* Recherche */}
        <form onSubmit={runSearch} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, width: 200, outline: 'none' }} />
          {/* Demandeur autocomplete */}
          <div style={{ position: 'relative' }}>
            <input value={requesterSearch} onChange={e => { setRequesterSearch(e.target.value); handleRequesterSearch(e.target.value); }} placeholder="🔍 Demandeur..." style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, width: 180, outline: 'none' }} />
            {requesterSearching && <div style={{ position: 'absolute', right: 8, top: 8, fontSize: 12, color: '#94a3b8' }}>⏳</div>}
            {requesterResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 200, overflowY: 'auto' }}>
                {requesterResults.map((u, i) => (
                  <div key={u.username || u.email || i} onClick={() => { setRequesterSearch(u.displayName || u.username); setRequesterResults([]); setActiveRequesterEmail(u.email); setPage(1); loadData(activeFilter, activeUserFilter, 1, search, activeCategory, activeSubcategory, activeSoftware, u.email); }}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontWeight: 500 }}>{u.displayName || u.username}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.email}{u.service ? ` · ${u.service}` : ''}</div>
                  </div>
                ))}
              </div>
            )}
            {requesterSearch && (
              <button onClick={() => { setRequesterSearch(''); setRequesterResults([]); setActiveRequesterEmail(null); setPage(1); loadData(activeFilter, activeUserFilter, 1, search, activeCategory, activeSubcategory, activeSoftware, null); }} style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14 }}>×</button>
            )}
          </div>

          {categories.length > 0 && (
            <select
              value={activeCategory === 'none' ? 'none' : activeSubcategory ? `s${activeCategory}.${activeSubcategory}` : activeCategory ? `c${activeCategory}` : ''}
              onChange={e => {
                const v = e.target.value;
                if (!v) handleCategoryFilter(null, null);
                else if (v === 'none') handleCategoryFilter('none', null);
                else if (v[0] === 'c') handleCategoryFilter(parseInt(v.slice(1)), null);
                else { const [p, c] = v.slice(1).split('.'); handleCategoryFilter(parseInt(p), parseInt(c)); }
              }}
              style={{ padding: '7px 12px', border: `1px solid ${activeCategory ? '#6366f1' : '#e2e8f0'}`, borderRadius: 6, background: activeCategory ? '#eef2ff' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: activeCategory ? '#4f46e5' : '#64748b', outline: 'none', maxWidth: 240 }}>
              <option value="">📁 Catégorie</option>
              <option value="none">— Sans catégorie —</option>
              {categories.flatMap((cat: any) => [
                <option key={`c${cat.id}`} value={`c${cat.id}`}>{cat.name}</option>,
                ...((cat.children || []).map((sub: any) => (
                  <option key={`s${cat.id}.${sub.id}`} value={`s${cat.id}.${sub.id}`}>{'   └ '}{sub.name}</option>
                ))),
              ])}
            </select>
          )}
          {(activeCategory || activeSubcategory) && (
            <button onClick={() => handleCategoryFilter(null, null)} style={{ padding: '6px 10px', border: '1px solid #fecaca', borderRadius: 6, background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>✕</button>
          )}
          {softwares.length > 0 && (
            <select value={activeSoftware || ''} onChange={e => handleSoftwareFilter(e.target.value ? parseInt(e.target.value) : null)}
              style={{ padding: '7px 12px', border: `1px solid ${activeSoftware ? '#0891b2' : '#e2e8f0'}`, borderRadius: 6, background: activeSoftware ? '#f0f9ff' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: activeSoftware ? '#0369a1' : '#64748b', outline: 'none' }}>
              <option value="">💾 Logiciel</option>
              {softwares.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {activeSoftware && (
            <button onClick={() => handleSoftwareFilter(null)} style={{ padding: '6px 10px', border: '1px solid #fecaca', borderRadius: 6, background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>✕</button>
          )}
          {groups.length > 0 && (
            <select value={activeGroup || ''} onChange={e => handleGroupFilter(e.target.value ? parseInt(e.target.value) : null)}
              style={{ padding: '7px 12px', border: `1px solid ${activeGroup ? '#0d9488' : '#e2e8f0'}`, borderRadius: 6, background: activeGroup ? '#f0fdfa' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: activeGroup ? '#0f766e' : '#64748b', outline: 'none', maxWidth: 200 }}>
              <option value="">👥 Groupe</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          {activeGroup && (
            <button onClick={() => handleGroupFilter(null)} style={{ padding: '6px 10px', border: '1px solid #fecaca', borderRadius: 6, background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>✕</button>
          )}
          {technicians.length > 0 && (
            <select value={activeTechnician || ''} onChange={e => handleTechnicianFilter(e.target.value ? parseInt(e.target.value) : null)}
              style={{ padding: '7px 12px', border: `1px solid ${activeTechnician ? '#d97706' : '#e2e8f0'}`, borderRadius: 6, background: activeTechnician ? '#fffbeb' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: activeTechnician ? '#b45309' : '#64748b', outline: 'none', maxWidth: 200 }}>
              <option value="">🧑‍🔧 Technicien</option>
              {[...technicians]
                .sort((a: any, b: any) => (a.displayName || a.displayname || a.email || '').localeCompare(b.displayName || b.displayname || b.email || ''))
                .map((t: any) => {
                  const tid = t.user_id ?? t.id;
                  const tname = t.displayName || t.displayname || t.name || t.email || t.username || `#${tid}`;
                  return <option key={tid} value={tid}>{tname}</option>;
                })}
            </select>
          )}
          {activeTechnician && (
            <button onClick={() => handleTechnicianFilter(null)} style={{ padding: '6px 10px', border: '1px solid #fecaca', borderRadius: 6, background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>✕</button>
          )}
          <button type="submit" style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#475569' }}>🔍</button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="view-tabs">
            <button className={`view-tab ${viewMode === 'table' ? 'active' : ''}`} onClick={() => { setViewMode('table'); viewModeRef.current = 'table'; setSelectedInboxId(null); if (showResolved) { setShowResolved(false); showResolvedRef.current = false; } loadData(null, null, 1, search, activeCategory, activeSubcategory, activeSoftware); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:'middle',marginRight:4}}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
              Tableau
            </button>
            <button className={`view-tab ${viewMode === 'kanban' ? 'active' : ''}`} onClick={() => { setViewMode('kanban'); viewModeRef.current = 'kanban'; setSelectedInboxId(null); if (!showResolved) { setShowResolved(true); showResolvedRef.current = true; } loadData(null, null, 1, search, activeCategory, activeSubcategory, activeSoftware); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:'middle',marginRight:4}}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
              Kanban
            </button>
            <button className={`view-tab ${viewMode === 'inbox' ? 'active' : ''}`} onClick={() => { setViewMode('inbox'); viewModeRef.current = 'inbox'; if (!showResolved) { setShowResolved(true); showResolvedRef.current = true; } setSelectedInboxId(null); loadData(null, null, 1, search, activeCategory, activeSubcategory, activeSoftware); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:'middle',marginRight:4}}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 12h7l2-3 2 6 2-3h7"/></svg>
              Boîte
            </button>
            {['superadmin','admin','supervisor','superviseur','technician','technician','tech'].includes((resolvedRole ?? user?.role ?? '').toLowerCase().trim()) && (
              <button
                className={`view-tab ${viewMode === 'live' ? 'active' : ''}`}
                onClick={() => { setViewMode('live'); viewModeRef.current = 'live'; }}
                style={{ position: 'relative' }}
              >
                🟢 Live
                {liveNotif && liveNotif.count > 0 && (
                  <span style={{
                    position: 'absolute', top: 2, right: 2,
                    width: 8, height: 8, borderRadius: '50%',
                    background: '#ef4444', border: '1.5px solid #fff',
                  }} />
                )}
              </button>
            )}
          </div>
          {canViewKpi && ['superadmin','admin'].includes((resolvedRole ?? user?.role ?? '').toLowerCase()) && (
            <>
              <button disabled={!!kpiActionLoading} onClick={async () => {
                setKpiActionLoading('snapshot');
                try {
                  const token = localStorage.getItem('token');
                  await axios.post('/api/tickets/dashboard/kpi-snapshot/run', {}, { headers: { Authorization: `Bearer ${token}` } });
                  loadKpiHistory(kpiDays);
                } catch { /**/ } finally { setKpiActionLoading(null); }
              }} style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#475569', opacity: kpiActionLoading ? 0.5 : 1, marginLeft: 'auto' }}>
                {kpiActionLoading === 'snapshot' ? '⏳' : '📸'} Snapshot
              </button>
              <button disabled={!!kpiActionLoading} onClick={async () => {
                setKpiActionLoading('backfill');
                try {
                  const token = localStorage.getItem('token');
                  await axios.post(`/api/tickets/dashboard/kpi-backfill?days=${kpiDays}`, {}, { headers: { Authorization: `Bearer ${token}` } });
                  loadKpiHistory(kpiDays);
                } catch { /**/ } finally { setKpiActionLoading(null); }
              }} style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#7c3aed', opacity: kpiActionLoading ? 0.5 : 1 }}>
                {kpiActionLoading === 'backfill' ? '⏳' : '🔄'} Rétro-calculer
              </button>
            </>
          )}
        </div>
      </div>

      {activeFilter && (
        <div style={{marginBottom:12,fontSize:13,display:'flex',alignItems:'center',gap:8}}>
          <span style={{color:'#64748b'}}>Filtre :</span>
          <span style={{fontWeight:600,color:'#1e293b'}}>{KPI_FILTERS[activeFilter]?.label || activeFilter}</span>
          <span style={{color:'#94a3b8',fontSize:12}}>({total} tickets)</span>
          <button onClick={() => handleFilterClick(activeFilter)} style={{padding:'2px 10px',border:'1px solid #e2e8f0',borderRadius:6,background:'#fff',cursor:'pointer',fontSize:12,color:'#ef4444'}}>✕ Effacer</button>
        </div>
      )}
      {/* ── Ligne unique de KPI avec sparklines ── */}
      {canViewKpi && (() => {
        const isAdmin = ['superadmin','admin'].includes((resolvedRole ?? user?.role ?? '').toLowerCase());

        const saveKpiConfig = async (keys: string[]) => {
          setSelectedKpis(keys);
          try {
            const token = localStorage.getItem('token');
            await axios.post('/api/tickets/dashboard/widgets', {
              widgets: keys.map((k, i) => ({ widget_type: k, config: {}, position: i, is_visible: true }))
            }, { headers: { Authorization: `Bearer ${token}` } });
          } catch {}
        };

        const toggleKpi = (key: string) => {
          const next = selectedKpis.includes(key)
            ? selectedKpis.filter(k => k !== key)
            : [...selectedKpis, key];
          saveKpiConfig(next);
        };

        // Un filtre de liste est-il actif ? (pour afficher KPI filtrés + globaux)
        const hasActiveListFilters = !!(activeCategory || activeSubcategory || activeSoftware || activeGroup || activeTechnician || activeRequesterEmail || (search && search.trim()));

        // Config unifiée : statuts + temps dans le même tableau
        const allCards = [
          { key: 'open',         label: 'Ouverts',          color: '#6366f1', filterKey: 'open' as string|null,
            value: stats?.open || 0, histKey: 'open', fKey: 'open',
            sub: `${getTypeCounts('open').incident} inc · ${getTypeCounts('open').request} dem`,
            goodDown: true },
          { key: 'in_progress',  label: 'En cours',         color: '#f59e0b', filterKey: 'in_progress',
            value: stats?.in_progress || 0, histKey: 'in_progress', fKey: 'in_progress',
            sub: `${getTypeCounts('in_progress').incident} inc · ${getTypeCounts('in_progress').request} dem`,
            goodDown: true },
          { key: 'waiting',      label: 'En attente',       color: '#f97316', filterKey: 'waiting',
            value: stats?.waiting || 0, histKey: 'waiting', fKey: 'waiting',
            sub: `${getTypeCounts('waiting').incident} inc · ${getTypeCounts('waiting').request} dem`,
            goodDown: true },
          { key: 'critical',     label: 'Critiques',        color: '#ef4444', filterKey: 'critical',
            value: stats?.critical_open || 0, histKey: 'critical_open', fKey: 'critical_open',
            sub: `${getTypeCounts('critical').incident} inc · ${getTypeCounts('critical').request} dem`,
            goodDown: true },
          { key: 'resolved',     label: 'Résolus',          color: '#22c55e', filterKey: 'resolved',
            value: stats?.resolved || 0, histKey: 'resolved', fKey: 'resolved',
            sub: `${getTypeCounts('resolved').incident} inc · ${getTypeCounts('resolved').request} dem`,
            goodDown: false },
          { key: 'problems',     label: 'Problèmes',        color: '#7c3aed', filterKey: 'problems', onClick: () => handleFilterClick('problems'),
            value: stats?.problems || 0, histKey: 'problems', fKey: 'problems', sub: '', goodDown: true },
          { key: 'sla_breached', label: 'SLA dépassés',     color: '#ef4444', filterKey: 'sla_breached',
            value: stats?.sla_breached || 0, histKey: null, fKey: 'sla_breached',
            sub: `${stats?.sla_warning || 0} en alerte`, goodDown: true },
          { key: 'age',          label: 'Âge moy. ouverts', color: '#f97316', filterKey: null,
            value: (stats?.avg_age_open_seconds > 0) ? formatDuration(stats.avg_age_open_seconds) : '-',
            histKey: 'avg_age_open_seconds', sub: 'depuis création', goodDown: true, isTime: true },
          { key: 'wait_time',    label: 'Attente moy.',     color: '#f59e0b', filterKey: null,
            value: (stats?.avg_waiting_seconds_active > 0) ? formatDuration(stats.avg_waiting_seconds_active) : '-',
            histKey: 'avg_waiting_seconds_active', sub: 'tickets actifs', goodDown: true, isTime: true },
          { key: 'resolve_time', label: 'Tps actif résolus',color: '#0891b2', filterKey: null,
            value: (stats?.avg_active_seconds_resolved_week > 0) ? formatDuration(stats.avg_active_seconds_resolved_week) : '-',
            histKey: 'avg_active_seconds_week',
            sub: `${stats?.resolved_week_count || 0} cette semaine`, goodDown: false, isTime: true },
          { key: 'live_chat',    label: 'Chat live',        color: '#22c55e', filterKey: null,
            value: liveStats?.active || 0, histKey: null,
            sub: `${liveStats?.today || 0} aujourd'hui`, goodDown: false },
        ];

        const visibleCards = allCards.filter(c => selectedKpis.includes(c.key));
        const hiddenCards = allCards.filter(c => !selectedKpis.includes(c.key));

        const LIVE_TECH_ROLES = ['superadmin','admin','supervisor','superviseur','technician','tech'];
        const isLiveTech = LIVE_TECH_ROLES.includes((resolvedRole ?? user?.role ?? '').toLowerCase().trim());

        return (
          <div style={{ marginBottom: 24 }}>
            {/* En-tête avec bouton config */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Indicateurs {selectedKpis.length < allCards.length && `(${selectedKpis.length}/${allCards.length})`}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {isAdmin && (
                  <button onClick={() => setShowKpiConfig(!showKpiConfig)}
                    style={{ padding: '4px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: showKpiConfig ? '#eef2ff' : '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#6366f1' }}>
                    {showKpiConfig ? '✓ Terminé' : 'Configurer les KPI'}
                  </button>
                )}
              </div>
            </div>

            {/* Panneau de configuration KPI */}
            {showKpiConfig && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
                  Afficher / masquer les indicateurs
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {allCards.map(c => {
                    const active = selectedKpis.includes(c.key);
                    return (
                      <button key={c.key} onClick={() => toggleKpi(c.key)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                          border: `1.5px solid ${active ? c.color : '#e2e8f0'}`,
                          background: active ? `${c.color}15` : '#fff',
                          color: active ? c.color : '#94a3b8',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                        {active ? '✓' : '+'} {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Grille de cartes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 10 }}>
              {visibleCards.map(card => {
                const sparkData = kpiHistory.map(r => ({ v: (card.histKey ? r[card.histKey] : 0) || 0, d: new Date(r.snapshot_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) }));
                const first = sparkData[0]?.v ?? 0;
                const last  = sparkData[sparkData.length - 1]?.v ?? 0;
                const delta = last - first;
                const deltaPct = first > 0 ? Math.round(Math.abs(delta) / first * 100) : 0;
                const trendColor = delta === 0 ? '#94a3b8'
                  : (card.goodDown ? (delta < 0 ? '#22c55e' : '#ef4444')
                                   : (delta > 0 ? '#22c55e' : '#ef4444'));
                const trendIcon = delta === 0 ? '→' : delta > 0 ? '↑' : '↓';
                const isActive = card.filterKey && activeFilter === card.filterKey;

                return (
                  <div key={card.key}
                    onClick={card.onClick || (card.filterKey ? () => handleFilterClick(card.filterKey as string) : undefined)}
                    style={{
                      background: '#fff', border: `1px solid ${isActive ? card.color : '#e2e8f0'}`,
                      borderRadius: 12, padding: '12px 14px',
                      cursor: card.filterKey ? 'pointer' : 'default',
                      boxShadow: isActive ? `0 0 0 2px ${card.color}33` : 'none',
                      display: 'flex', flexDirection: 'column', gap: 0,
                      position: 'relative', overflow: 'hidden',
                    }}>
                    {/* Sparkline en fond */}
                    {sparkData.length >= 2 && (
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 44, opacity: 0.18, pointerEvents: 'none' }}>
                        <ResponsiveContainer width="100%" height={44}>
                          <LineChart data={sparkData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                            <Line type="monotone" dataKey="v" stroke={card.color} strokeWidth={2} dot={false} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {/* Contenu au premier plan */}
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      {/* En-tête label + trend */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{card.label}</span>
                        {sparkData.length > 1 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: trendColor }}>
                            {trendIcon}{deltaPct > 0 ? ` ${deltaPct}%` : ''}
                          </span>
                        )}
                      </div>
                      {/* Valeur principale (filtrée en gros + global en repère si filtre actif) */}
                      {(() => {
                        const hasFiltered = hasActiveListFilters && stats?.filtered && (card as any).fKey;
                        const fVal = hasFiltered ? (stats.filtered[(card as any).fKey] ?? 0) : null;
                        if (hasFiltered) {
                          return (
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                              <span style={{ fontSize: 24, fontWeight: 800, color: card.color, lineHeight: 1.1 }}>{fVal}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }} title="Total global (tous filtres ignorés)">/ {card.value}</span>
                            </div>
                          );
                        }
                        return <span style={{ fontSize: 24, fontWeight: 800, color: '#18181b', lineHeight: 1.1 }}>{card.value}</span>;
                      })()}
                      {card.sub && <div style={{ fontSize: 10, color: '#a1a1aa', marginTop: 2 }}>{card.sub}</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Carte KPI live chat ─────────────────────────────── */}
            {isLiveTech && liveStats && (
              <div
                onClick={() => { setViewMode('live'); viewModeRef.current = 'live'; }}
                style={{
                  marginTop: 10,
                  background: '#fff',
                  border: `1.5px solid ${liveStats.active > 0 ? '#86efac' : '#e2e8f0'}`,
                  borderRadius: 12, padding: '12px 16px',
                  cursor: 'pointer',
                  boxShadow: liveStats.active > 0 ? '0 0 0 2px rgba(34,197,94,0.12)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
                  position: 'relative', overflow: 'hidden',
                }}
              >
                {/* Mini area sparkline en fond */}
                {liveStats.daily?.length >= 2 && (
                  <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 180, opacity: 0.12, pointerEvents: 'none' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={liveStats.daily} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                        <Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Badge live */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
                    background: liveStats.active > 0 ? '#22c55e' : '#94a3b8',
                    boxShadow: liveStats.active > 0 ? '0 0 0 3px rgba(34,197,94,0.25)' : 'none',
                  }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Chat live
                  </span>
                </div>

                {/* Métriques */}
                {[
                  { label: 'En cours', value: liveStats.active,      color: liveStats.active > 0 ? '#22c55e' : '#94a3b8', big: true },
                  { label: "Auj.", value: liveStats.today,            color: '#6366f1' },
                  { label: 'Semaine', value: liveStats.this_week,     color: '#8b5cf6' },
                  { label: 'Mois',    value: liveStats.this_month,    color: '#3b82f6' },
                  { label: 'Durée moy.', value: liveStats.avg_duration_min ? `${liveStats.avg_duration_min}mn` : '—', color: '#f59e0b' },
                  { label: 'Rép. moy.',  value: liveStats.avg_response_min  ? `${liveStats.avg_response_min}mn` : '—', color: '#f97316' },
                ].map(m => (
                  <div key={m.label} style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: m.big ? 24 : 18, fontWeight: 800, color: m.color, lineHeight: 1 }}>{m.value}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{m.label}</div>
                  </div>
                ))}

                <div style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, position: 'relative', zIndex: 1 }}>
                  Voir les sessions →
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Live KPI card pour les rôles sans accès KPI mais avec accès live */}
      {!canViewKpi && liveStats && (() => {
        const LIVE_TECH_ROLES = ['superadmin','admin','supervisor','superviseur','technician','tech'];
        const isLiveTech = LIVE_TECH_ROLES.includes((resolvedRole ?? user?.role ?? '').toLowerCase().trim());
        if (!isLiveTech) return null;
        return (
          <div style={{ marginBottom: 24 }}>
            <div
              onClick={() => { setViewMode('live'); viewModeRef.current = 'live'; }}
              style={{
                background: '#fff',
                border: `1.5px solid ${liveStats.active > 0 ? '#86efac' : '#e2e8f0'}`,
                borderRadius: 12, padding: '12px 16px',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: liveStats.active > 0 ? '#22c55e' : '#94a3b8', display: 'inline-block' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Chat live</span>
              {[
                { label: 'En cours', value: liveStats.active, color: liveStats.active > 0 ? '#22c55e' : '#94a3b8' },
                { label: "Auj.", value: liveStats.today, color: '#6366f1' },
                { label: 'Semaine', value: liveStats.this_week, color: '#8b5cf6' },
                { label: 'Durée moy.', value: liveStats.avg_duration_min ? `${liveStats.avg_duration_min}mn` : '—', color: '#f59e0b' },
              ].map(m => (
                <div key={m.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: m.color }}>{m.value}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{m.label}</div>
                </div>
              ))}
              <div style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>Voir les sessions →</div>
            </div>
          </div>
        );
      })()}

      {viewMode === 'live' ? (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
          <div style={{ marginBottom: 14 }}>
            <button
              onClick={() => { setViewMode('table'); viewModeRef.current = 'table'; loadData(null, activeUserFilter, 1, search, activeCategory, activeSubcategory, activeSoftware); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569' }}
            >
              🏠 Retour aux tickets
            </button>
          </div>
          <LiveSessionsPanel />
        </div>
      ) : viewMode === 'table' ? (
        <TicketList
          tickets={tickets}
          loading={loading}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          categories={categories}
          activeCategory={typeof activeCategory === 'number' ? activeCategory : null}
          activeSubcategory={activeSubcategory}
          onCategoryFilter={handleCategoryFilter}
          activeFilter={activeFilter}
        />
      ) : viewMode === 'kanban' ? (
        <TicketKanban
          tickets={tickets}
          loading={loading}
          total={total}
          totalPages={totalPages}
          page={page}
          onPageChange={goToPage}
          onRefresh={() => loadData(activeFilter, activeUserFilter, page, search, activeCategory, activeSubcategory, activeSoftware)}
        />
      ) : (
        <TicketInbox
          baseParams={inboxParams}
          selectedId={selectedInboxId}
          onTicketClick={setSelectedInboxId}
        />
      )}

      {viewMode !== 'inbox' && viewMode !== 'live' && (
      <div className="pagination">
        <button disabled={page <= 1} onClick={() => goToPage(page - 1)}>←</button>
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          let p: number;
          if (totalPages <= 7) {
            p = i + 1;
          } else if (page <= 4) {
            p = i + 1;
          } else if (page >= totalPages - 3) {
            p = totalPages - 6 + i;
          } else {
            p = page - 3 + i;
          }
          return (
            <button key={p} className={page === p ? 'active' : ''} onClick={() => goToPage(p)}>{p}</button>
          );
        })}
        <button disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>→</button>
        <span className="info">{total} tickets · page {page}/{totalPages}</span>
      </div>
      )}
    </div>

    {/* ── Modale Récupérer GLPI : avertissement + sauvegarde + progression ── */}
    {showResetModal && (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}>
        <div style={{
          background: '#fff', borderRadius: 14, width: 'min(560px, 100%)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
        }}>
          {/* En-tête */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>⚠️</span>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#7c2d12' }}>
              Récupérer GLPI — Réinitialisation complète
            </h3>
          </div>

          <div style={{ padding: 24 }}>
            {/* Phase 1 : confirmation */}
            {!resetRunning && !(resetProgress && resetProgress.active === false) && (
              <>
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
                  padding: '12px 14px', color: '#991b1b', fontSize: 14, lineHeight: 1.5, marginBottom: 16,
                }}>
                  Cette opération <strong>efface définitivement</strong> tous les tickets, suivis,
                  observateurs, assignations, historiques, pièces jointes, liens, groupes/problèmes
                  et <strong>chats live</strong> du hub, puis réimporte tout depuis GLPI.
                  La base tickets devient un miroir exact de GLPI.
                  <br /><br />
                  La configuration (rôles, catégories, SLA, modèles, règles) et le niveau du
                  collecteur mail sont conservés.
                </div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 14, color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={backupBeforeReset}
                    onChange={(e) => setBackupBeforeReset(e.target.checked)}
                    style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <span>
                    <strong>Effectuer une sauvegarde complète avant la réinitialisation</strong>
                    <br />
                    <span style={{ color: '#64748b', fontSize: 13 }}>
                      Sauvegarde globale (SQLite + PostgreSQL + fichiers), comme dans Sécurité &amp; Sauvegarde.
                      Recommandé — peut prendre plusieurs minutes.
                    </span>
                  </span>
                </label>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                  <button
                    onClick={() => { setShowResetModal(false); setResetProgress(null); }}
                    style={{
                      padding: '10px 18px', border: '1px solid #cbd5e1', borderRadius: 8,
                      background: '#fff', color: '#475569', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                    }}>
                    Annuler
                  </button>
                  <button
                    onClick={startGlpiReset}
                    style={{
                      padding: '10px 18px', border: 'none', borderRadius: 8,
                      background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    }}>
                    Réinitialiser
                  </button>
                </div>
              </>
            )}

            {/* Phase 2 : progression */}
            {resetRunning && (
              <>
                <p style={{ margin: '0 0 14px', fontSize: 14, color: '#334155', minHeight: 20 }}>
                  {resetProgress?.message || 'Traitement en cours…'}
                </p>
                <div style={{ background: '#e2e8f0', borderRadius: 999, height: 12, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.max(3, resetProgress?.percent || 0)}%`, height: '100%',
                    background: 'linear-gradient(90deg, #7c3aed, #a855f7)', borderRadius: 999,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <div style={{ textAlign: 'right', marginTop: 6, fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>
                  {resetProgress?.percent || 0}%
                </div>
              </>
            )}

            {/* Phase 3 : résultat / erreur */}
            {!resetRunning && resetProgress && resetProgress.active === false && (
              <>
                <div style={{
                  background: resetProgress.error ? '#fef2f2' : '#f0fdf4',
                  border: `1px solid ${resetProgress.error ? '#fecaca' : '#bbf7d0'}`,
                  borderRadius: 10, padding: '12px 14px',
                  color: resetProgress.error ? '#991b1b' : '#166534', fontSize: 14, lineHeight: 1.5,
                }}>
                  <strong>{resetProgress.error ? '❌ Échec' : '✅ Terminé'}</strong>
                  <br />
                  {resetProgress.message}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                  <button
                    onClick={() => { setShowResetModal(false); setResetProgress(null); }}
                    style={{
                      padding: '10px 18px', border: 'none', borderRadius: 8,
                      background: '#7c3aed', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    }}>
                    Fermer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
