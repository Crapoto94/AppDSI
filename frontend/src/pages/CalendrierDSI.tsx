import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { ChevronLeft, ChevronRight, Plus, X, Edit3, Trash2, Calendar, Users, HardHat, Wrench, Megaphone, Settings } from 'lucide-react';

const CATEGORIES = ['absence', 'teletravail', 'deploiement', 'maintenance', 'reunion'] as const;
type Categorie = typeof CATEGORIES[number];

const CATEGORY_COLORS: Record<Categorie, string> = {
  absence: '#E30613',
  teletravail: '#003366',
  deploiement: '#4CAF50',
  maintenance: '#FF9800',
  reunion: '#9C27B0'
};

const CATEGORY_LABELS: Record<Categorie, string> = {
  absence: 'Absents',
  teletravail: 'Télétravailleurs',
  deploiement: 'Déploiements',
  maintenance: 'Maintenances',
  reunion: 'Réunions importantes'
};

const CATEGORY_ICONS: Record<Categorie, React.ReactNode> = {
  absence: <Users size={14} />,
  teletravail: <Users size={14} />,
  deploiement: <HardHat size={14} />,
  maintenance: <Wrench size={14} />,
  reunion: <Megaphone size={14} />
};

interface Evenement {
  id: number;
  date: string;
  categorie: Categorie;
  periode: string;
  titre: string;
  description: string;
  agent_username: string | null;
  agent_nom: string | null;
  agent_email: string | null;
  couleur: string;
  created_by: string;
  created_at: string;
}

interface ADUser {
  username: string;
  displayName: string;
  email: string;
  service?: string;
  direction?: string;
}

function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d.setDate(diff));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 4);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatFrench(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatFrenchShort(d: Date): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
}

function getMonthDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days: Date[] = [];
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  return days;
}

function padMonth(days: Date[]): (Date | null)[] {
  const result: (Date | null)[] = [];
  const firstDay = days[0].getDay();
  const emptyBefore = firstDay === 0 ? 6 : firstDay - 1;
  for (let i = 0; i < emptyBefore; i++) result.push(null);
  for (const d of days) result.push(d);
  const remaining = (7 - (result.length % 7)) % 7;
  for (let i = 0; i < remaining; i++) result.push(null);
  return result;
}

const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function getInitials(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[1][0] + parts[0][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

const SERVICE_COLORS = [
  '#e17055', '#00b894', '#0984e3', '#6c5ce7', '#fdcb6e',
  '#00cec9', '#e84393', '#636e72', '#55a3e8', '#a29bfe',
  '#fd79a8', '#74b9ff', '#f8a5c2', '#81ecec', '#ffb347',
];

// Fixed service color mapping for consistency
const SERVICE_COLOR_MAP: Record<string, string> = {
  'Bureau Des Projets': '#e17055',
  'Service Infrastructure Reseaux Systemes': '#27ae60',
  'Service Support Déploiement': '#3498db',
  'Direction des Systemes d\'Information': '#6c5ce7',
  'Tous': '#636e72'
};

function getServiceColor(service: string): string {
  if (!service) return '#666';
  // Check if service has a fixed color mapping
  if (SERVICE_COLOR_MAP[service]) {
    return SERVICE_COLOR_MAP[service];
  }
  // Fallback to hash-based color
  let hash = 0;
  for (let i = 0; i < service.length; i++) {
    hash = ((hash << 5) - hash) + service.charCodeAt(i);
    hash |= 0;
  }
  return SERVICE_COLORS[Math.abs(hash) % SERVICE_COLORS.length];
}

export default function CalendrierDSI() {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [view, setView] = useState<'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<Evenement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<{ username: string; nom: string; service: string }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Evenement | null>(null);
  const [saving, setSaving] = useState(false);

  const [formDate, setFormDate] = useState(formatDate(new Date()));
  const [formCategorie, setFormCategorie] = useState<Categorie>('absence');
  const [formTitre, setFormTitre] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPeriode, setFormPeriode] = useState('');

  const [adQuery, setAdQuery] = useState('');
  const [adResults, setAdResults] = useState<ADUser[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<ADUser | null>(null);
  const [searchingAD, setSearchingAD] = useState(false);
  const adTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const fetchEvents = useCallback(async (debut: string, fin: string) => {
    console.log('[Calendrier] fetchEvents:', debut, fin);
    setLoading(true);
    setError(null);
    try {
      const [eventsRes, agentsRes] = await Promise.all([
        fetch(`/api/calendrier-dsi/evenements?debut=${debut}&fin=${fin}`, { headers }),
        fetch(`/api/calendrier-dsi/agents`, { headers })
      ]);
      if (!eventsRes.ok) {
        const errBody = await eventsRes.json().catch(() => ({}));
        throw new Error(errBody.message || `Erreur HTTP ${eventsRes.status}`);
      }
      const eventsData = await eventsRes.json();
      if (agentsRes.ok) {
        const agentsData = await agentsRes.json();
        setAgents(Array.isArray(agentsData) ? agentsData.map((a: any) => ({ username: a.username, nom: a.nom, service: a.service || '' })) : []);
      }
      setEvents(Array.isArray(eventsData) ? eventsData : []);
    } catch (e: any) {
      console.error('Erreur chargement événements', e);
      setError(e.message || 'Erreur de chargement');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (view === 'week') {
      const { start, end } = getWeekRange(currentDate);
      fetchEvents(formatDate(start), formatDate(end));
    } else {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const first = formatDate(new Date(year, month, 1));
      const last = formatDate(new Date(year, month + 1, 0));
      fetchEvents(first, last);
    }
  }, [currentDate, view, fetchEvents, token]);

  const navPrev = () => {
    const d = new Date(currentDate);
    if (view === 'week') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };

  const navNext = () => {
    const d = new Date(currentDate);
    if (view === 'week') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };

  const navToday = () => setCurrentDate(new Date());

  // Agent quick-select for TT/absence
  const [showAgentSelect, setShowAgentSelect] = useState(false);
  const [agentSelectDate, setAgentSelectDate] = useState('');
  const [agentSelectCat, setAgentSelectCat] = useState<Categorie>('teletravail');
  const [agentToggles, setAgentToggles] = useState<Record<string, boolean>>({});
  const [savingAgent, setSavingAgent] = useState(false);
  const [agentServiceFilter, setAgentServiceFilter] = useState('');
  const [agentPeriode, setAgentPeriode] = useState('');

  const openAgentSelect = (date: string, cat: Categorie) => {
    setAgentSelectDate(date);
    setAgentSelectCat(cat);
    const toggles: Record<string, boolean> = {};
    const dateStr = date.split('T')[0];
    for (const a of agents) {
      toggles[a.username] = events.some(e => e.date.split('T')[0] === dateStr && e.categorie === cat && e.agent_username === a.username);
    }
    setAgentToggles(toggles);
    setAgentServiceFilter('');
    setAgentPeriode('');
    setShowAgentSelect(true);
  };

  const handleAgentSelectSave = async () => {
    setSavingAgent(true);
    setError(null);
    try {
      const dateStr = agentSelectDate.split('T')[0];
      const cellEvents = events.filter(e => e.date.split('T')[0] === dateStr && e.categorie === agentSelectCat);
      const periodeEvents = agentPeriode ? cellEvents.filter(e => e.periode === agentPeriode) : cellEvents;
      const manualEvts = periodeEvents.filter(e => e.id > 0);
      const agentInCell = new Set(periodeEvents.map(e => e.agent_username));
      // Delete un-toggled manual events (per periode if selected)
      for (const evt of manualEvts) {
        if (!agentToggles[evt.agent_username || '']) {
          await fetch(`/api/calendrier-dsi/evenements/${evt.id}`, { method: 'DELETE', headers });
        }
      }
      // Create events for newly toggled agents
      for (const a of agents) {
        if (agentToggles[a.username] && !agentInCell.has(a.username)) {
          const catColor = agentSelectCat === 'teletravail' ? '#003366' : '#E30613';
          await fetch(`/api/calendrier-dsi/evenements`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              date: dateStr,
              categorie: agentSelectCat,
              periode: agentPeriode,
              titre: a.nom,
              description: '',
              agent_username: a.username,
              agent_nom: a.nom,
              agent_email: '',
              couleur: catColor
            })
          });
        }
      }
      setShowAgentSelect(false);
      // Refresh events
      if (view === 'week') {
        const { start, end } = getWeekRange(currentDate);
        await fetchEvents(formatDate(start), formatDate(end));
      } else {
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();
        await fetchEvents(formatDate(new Date(y, m, 1)), formatDate(new Date(y, m + 1, 0)));
      }
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la sélection');
    } finally {
      setSavingAgent(false);
    }
  };

  const searchAD = useCallback((q: string) => {
    setAdQuery(q);
    if (adTimerRef.current !== null) clearTimeout(adTimerRef.current);
    if (q.length < 2) { setAdResults([]); return; }
    setSearchingAD(true);
    adTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ad/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setAdResults(Array.isArray(data) ? data : []);
      } catch { setAdResults([]); }
      setSearchingAD(false);
    }, 400);
  }, [token]);

  const selectAgent = (agent: ADUser) => {
    setSelectedAgent(agent);
    setAdQuery(agent.displayName);
    setAdResults([]);
    setFormTitre(agent.displayName);
  };

  const openCreateModal = (date?: string) => {
    setEditingEvent(null);
    setFormDate(date || formatDate(currentDate));
    setFormCategorie('absence');
    setFormTitre('');
    setFormDescription('');
    setFormPeriode('');
    setSelectedAgent(null);
    setAdQuery('');
    setAdResults([]);
    setShowModal(true);
  };

  const openEditModal = (evt: Evenement) => {
    setEditingEvent(evt);
    setFormDate(evt.date);
    setFormCategorie(evt.categorie);
    setFormTitre(evt.titre);
    setFormDescription(evt.description || '');
    setFormPeriode(evt.periode || '');
    if (evt.agent_nom) {
      setSelectedAgent({
        username: evt.agent_username || '',
        displayName: evt.agent_nom,
        email: evt.agent_email || ''
      });
      setAdQuery(evt.agent_nom);
    } else {
      setSelectedAgent(null);
      setAdQuery('');
    }
    setAdResults([]);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formDate || !formTitre) {
      setError('Veuillez remplir la date et le titre');
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      date: formDate,
      categorie: formCategorie,
      periode: formPeriode,
      titre: formTitre,
      description: formDescription,
      agent_username: selectedAgent?.username || null,
      agent_nom: selectedAgent?.displayName || null,
      agent_email: selectedAgent?.email || null,
      couleur: CATEGORY_COLORS[formCategorie]
    };
    console.log('[Calendrier] Saving event:', body);
    try {
      const url = editingEvent
        ? `/api/calendrier-dsi/evenements/${editingEvent.id}`
        : '/api/calendrier-dsi/evenements';
      const method = editingEvent ? 'PUT' : 'POST';
      console.log('[Calendrier] Fetch:', method, url);
      const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `Erreur HTTP ${res.status}`);
      }
      console.log('[Calendrier] Save OK');
      setShowModal(false);
      if (view === 'week') {
        const { start, end } = getWeekRange(currentDate);
        await fetchEvents(formatDate(start), formatDate(end));
      } else {
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();
        await fetchEvents(formatDate(new Date(y, m, 1)), formatDate(new Date(y, m + 1, 0)));
      }
    } catch (e: any) {
      console.error('[Calendrier] Erreur sauvegarde', e);
      setError(e.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/calendrier-dsi/evenements/${id}`, { method: 'DELETE', headers });
      setConfirmDelete(null);
      if (view === 'week') {
        const { start, end } = getWeekRange(currentDate);
        fetchEvents(formatDate(start), formatDate(end));
      } else {
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();
        fetchEvents(formatDate(new Date(y, m, 1)), formatDate(new Date(y, m + 1, 0)));
      }
    } catch (e) {
      console.error('Erreur suppression', e);
    }
  };

  const eventsByDateAndCat = (dateStr: string, cat: Categorie): Evenement[] => {
    return events.filter(e => {
      const eDate = e.date.split('T')[0];
      return eDate === dateStr && e.categorie === cat;
    });
  };

  const weekDays: Date[] = [];
  if (view === 'week') {
    const { start } = getWeekRange(currentDate);
    for (let i = 0; i < 5; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      weekDays.push(d);
    }
    console.log('[Calendrier] weekDays:', weekDays.map(d => formatDate(d) + ' (' + d.toLocaleDateString('fr-FR') + ')'));
    console.log('[Calendrier] events state:', events.length, events.map(e => e.date + ' ' + e.categorie));
  }

  const monthDays = view === 'month' ? padMonth(getMonthDays(currentDate.getFullYear(), currentDate.getMonth())) : [];

  const weekLabel = view === 'week'
    ? (() => {
        const { start, end } = getWeekRange(currentDate);
        return `Semaine du ${start.getDate()} au ${end.getDate()} ${end.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
      })()
    : currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="calendrier-container">
      <Header />
      <style>{`
        .calendrier-container {
          min-height: 100vh;
          background: #f8fafc;
          padding-bottom: 40px;
        }

        /* Header Section */
        .cal-header {
          background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
          border-bottom: 1px solid #e2e8f0;
          padding: 32px 40px;
          margin-bottom: 32px;
        }
        .cal-header-content {
          max-width: 1600px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 24px;
        }
        .cal-header h1 {
          margin: 0;
          font-size: 2rem;
          font-weight: 700;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .cal-nav {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        /* View Toggle */
        .view-toggle {
          display: flex;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          overflow: hidden;
          padding: 4px;
        }
        .view-toggle button {
          padding: 8px 20px;
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 600;
          color: #64748b;
          transition: all 0.2s;
          border-radius: 8px;
        }
        .view-toggle button.active {
          background: #0f172a;
          color: #fff;
        }
        .view-toggle button:not(.active):hover {
          background: #f1f5f9;
        }

        /* Navigation Buttons */
        .cal-nav button {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 8px 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.9rem;
          font-weight: 500;
          color: #475569;
          transition: all 0.2s;
        }
        .cal-nav button:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        .cal-nav .label {
          font-weight: 700;
          min-width: 280px;
          text-align: center;
          font-size: 1.1rem;
          color: #0f172a;
        }
        .btn-add {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 10px 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.95rem;
          font-weight: 600;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
        }
        .btn-add:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(15, 23, 42, 0.2);
        }

        /* Main Content */
        .calendrier-main {
          max-width: 1600px;
          margin: 0 auto;
          padding: 0 40px;
        }

        /* Legend */
        .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 32px;
          padding: 20px;
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          align-items: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        .legend-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: #0f172a;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .legend-item {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          color: #475569;
          font-weight: 500;
        }
        .legend-dot {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          flex-shrink: 0;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        /* Week Grid */
        .week-grid {
          display: grid;
          grid-template-columns: 140px repeat(5, 1fr);
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
          background: #ffffff;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          margin-bottom: 32px;
        }
        .week-grid .header-cell {
          background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
          border-right: 1px solid #e2e8f0;
          border-bottom: 2px solid #0f172a;
          padding: 16px 12px;
          font-weight: 700;
          font-size: 0.85rem;
          color: #0f172a;
          text-align: center;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 6px;
        }
        .week-grid .header-cell.today {
          background: linear-gradient(135deg, #efe9ff 0%, #ddd6fe 100%);
          color: #7c3aed;
        }
        .week-grid .header-cell:last-child {
          border-right: none;
        }
        .week-grid .day-date {
          font-size: 1.1rem;
          font-weight: 700;
        }
        .week-grid .cat-cell {
          background: #f8fafc;
          border-right: 1px solid #e2e8f0;
          border-bottom: 1px solid #e2e8f0;
          padding: 12px;
          font-weight: 600;
          font-size: 0.8rem;
          color: #475569;
          display: flex;
          align-items: center;
        }
        .week-grid .cat-cell:last-of-type {
          border-right: none;
        }
        .cat-label {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cat-label .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .week-grid .cell {
          border-right: 1px solid #e2e8f0;
          border-bottom: 1px solid #e2e8f0;
          padding: 8px;
          min-height: 120px;
          display: flex;
          gap: 6px;
          background: #ffffff;
          transition: background 0.15s;
          cursor: pointer;
          position: relative;
        }
        .week-grid .cell:hover {
          background: #f8fafc;
        }
        .week-grid .cell.today {
          background: #fffbf0;
        }
        .week-grid .cell:last-child {
          border-right: none;
        }
        .cell-left {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
          border-right: 1px dashed #e2e8f0;
          padding-right: 6px;
          min-width: 0;
        }
        .cell-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .cell-am, .cell-pm {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          gap: 4px;
          min-height: 24px;
          padding: 2px 0;
        }
        .cell-am {
          border-bottom: 1px dashed #e2e8f0;
          padding-bottom: 4px;
        }
        .empty-cell {
          color: #cbd5e1;
          font-size: 1.4rem;
          text-align: center;
          padding: 10px 0;
          width: 100%;
        }

        /* Pastilles */
        .pastille {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 16px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          color: #fff;
          border: none;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          transition: all 0.15s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .pastille:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        .pastille .initials {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgba(255,255,255,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.6rem;
          font-weight: 700;
          flex-shrink: 0;
          backdrop-filter: blur(4px);
        }
        .pastille-dot {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          cursor: pointer;
          border: none;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 0.7rem;
          font-weight: 700;
          transition: all 0.15s;
          box-shadow: 0 2px 6px rgba(0,0,0,0.12);
        }
        .pastille-dot:hover {
          transform: scale(1.08);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        /* Month Grid */
        .month-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
          background: #ffffff;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }
        .month-grid .day-header {
          background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
          font-weight: 700;
          text-align: center;
          padding: 16px 8px;
          border-bottom: 2px solid #0f172a;
          border-right: 1px solid #e2e8f0;
          font-size: 0.85rem;
          color: #0f172a;
        }
        .month-grid .day-header:last-child {
          border-right: none;
        }
        .month-grid .day-cell {
          min-height: 120px;
          border-right: 1px solid #e2e8f0;
          border-bottom: 1px solid #e2e8f0;
          padding: 8px;
          position: relative;
          background: #ffffff;
          transition: background 0.15s;
        }
        .month-grid .day-cell:hover {
          background: #f8fafc;
        }
        .month-grid .day-cell:nth-child(7n) {
          border-right: none;
        }
        .month-grid .day-cell.other-month {
          background: #f8fafc;
        }
        .month-grid .day-cell.today {
          background: #fffbf0;
        }
        .month-grid .day-num {
          font-size: 0.9rem;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 4px;
        }
        .month-grid .day-cell.other-month .day-num {
          color: #cbd5e1;
        }
        .month-grid .day-events {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-height: 30px;
        }
        .month-grid .month-left {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          border-right: 1px dashed #e2e8f0;
          padding-right: 4px;
        }
        .month-grid .month-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .month-grid .month-am, .month-grid .month-pm {
          display: flex;
          flex-wrap: wrap;
          gap: 2px;
        }

        /* Modal */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(2px);
        }
        .modal-content {
          background: #fff;
          border-radius: 16px;
          padding: 32px;
          width: 520px;
          max-width: 90vw;
          max-height: 85vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        }
        .modal-content h2 {
          margin: 0 0 20px;
          font-size: 1.4rem;
          font-weight: 700;
          color: #0f172a;
        }
        .modal-content label {
          display: block;
          font-size: 0.9rem;
          font-weight: 600;
          color: #475569;
          margin-bottom: 6px;
          margin-top: 16px;
        }
        .modal-content input, .modal-content select, .modal-content textarea {
          width: 100%;
          padding: 10px 12px;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          font-size: 0.95rem;
          box-sizing: border-box;
          transition: all 0.2s;
        }
        .modal-content input:focus, .modal-content select:focus, .modal-content textarea:focus {
          outline: none;
          border-color: #0f172a;
          box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.1);
        }
        .modal-content textarea {
          min-height: 80px;
          resize: vertical;
          font-family: inherit;
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid #e2e8f0;
        }
        .modal-actions button {
          padding: 10px 24px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.95rem;
          border: none;
          font-weight: 600;
          transition: all 0.2s;
        }
        .modal-actions .btn-cancel {
          background: #f1f5f9;
          color: #475569;
        }
        .modal-actions .btn-cancel:hover {
          background: #e2e8f0;
        }
        .modal-actions .btn-save {
          background: #0f172a;
          color: #fff;
        }
        .modal-actions .btn-save:hover {
          background: #1e293b;
        }
        .modal-actions .btn-delete {
          background: #fff;
          color: #dc2626;
          border: 1px solid #fecaca;
        }
        .modal-actions .btn-delete:hover {
          background: #fee2e2;
        }

        /* AD Search */
        .ad-search-wrapper {
          position: relative;
        }
        .ad-results {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 0 0 10px 10px;
          border-top: none;
          max-height: 220px;
          overflow-y: auto;
          z-index: 10;
          box-shadow: 0 8px 16px rgba(0,0,0,0.1);
        }
        .ad-result-item {
          padding: 10px 14px;
          cursor: pointer;
          font-size: 0.85rem;
          border-bottom: 1px solid #f1f5f9;
          transition: background 0.15s;
        }
        .ad-result-item:hover {
          background: #f8fafc;
        }
        .ad-result-item .ad-name {
          font-weight: 600;
          color: #0f172a;
        }
        .ad-result-item .ad-detail {
          font-size: 0.8rem;
          color: #94a3b8;
          margin-top: 2px;
        }
        .ad-selected {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #f0fdf4;
          border: 1.5px solid #22c55e;
          border-radius: 20px;
          padding: 6px 14px;
          font-size: 0.85rem;
          margin-top: 6px;
          font-weight: 500;
          color: #166534;
        }
        .ad-selected .remove {
          cursor: pointer;
          color: #dc2626;
          font-weight: 700;
          margin-left: 4px;
        }

        /* Confirm Delete */
        .confirm-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1100;
          backdrop-filter: blur(2px);
        }
        .confirm-box {
          background: #fff;
          border-radius: 16px;
          padding: 32px;
          width: 400px;
          max-width: 90vw;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        }
        .confirm-box h3 {
          margin: 0 0 12px;
          color: #dc2626;
          font-size: 1.2rem;
        }
        .confirm-box p {
          color: #64748b;
          margin-bottom: 24px;
        }
        .confirm-box .actions {
          display: flex;
          justify-content: center;
          gap: 12px;
        }
        .confirm-box button {
          padding: 10px 24px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.95rem;
          border: none;
          font-weight: 600;
          transition: all 0.2s;
        }
        .confirm-box .btn-yes {
          background: #dc2626;
          color: #fff;
        }
        .confirm-box .btn-yes:hover {
          background: #b91c1c;
        }
        .confirm-box .btn-no {
          background: #f1f5f9;
          color: #475569;
        }
        .confirm-box .btn-no:hover {
          background: #e2e8f0;
        }

        @media (max-width: 900px) {
          .week-grid { grid-template-columns: 100px repeat(5, 1fr); }
          .week-grid .cell { min-height: 70px; padding: 6px; }
          .cal-header { padding: 24px 20px; }
          .calendrier-main { padding: 0 20px; }
        }
      `}</style>

      {/* Header */}
      <div className="cal-header">
        <div className="cal-header-content">
          <h1><Calendar size={28} /> Calendrier DSI</h1>
          <div className="cal-nav">
            <div className="view-toggle">
              <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>📅 Semaine</button>
              <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>📆 Mois</button>
            </div>
            <button onClick={navPrev}><ChevronLeft size={18} /></button>
            <span className="label">{weekLabel}</span>
            <button onClick={navNext}><ChevronRight size={18} /></button>
            <button onClick={navToday}>Aujourd'hui</button>
            <button className="btn-add" onClick={() => openCreateModal()}><Plus size={16} /> Ajouter</button>
            <a href="/calendrier-dsi/agents" style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', fontWeight: '600', textDecoration: 'none', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.15)' }} onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)', e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.2)')} onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)', e.currentTarget.style.boxShadow = '0 2px 8px rgba(15, 23, 42, 0.15)')}><Settings size={16} /> Agents DSI</a>
          </div>
        </div>
      </div>

      <div className="calendrier-main">
        {/* Error */}
        {error && (
          <div style={{ background: '#fee2e2', border: '1.5px solid #dc2626', borderRadius: '10px', padding: '14px 16px', marginBottom: '24px', color: '#991b1b', fontSize: '0.95rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            {error}
          </div>
        )}

      {/* Service color legend */}
      {(() => {
        const services = [...new Set(agents.map(a => a.service).filter(Boolean))].sort();
        if (services.length === 0) return null;
        return (
          <div className="legend">
            <span className="legend-title">Services :</span>
            {services.map(s => (
              <span key={s} className="legend-item">
                <span className="legend-dot" style={{ background: getServiceColor(s) }} />
                {s}
              </span>
            ))}
          </div>
        );
      })()}

      {/* Week View */}
      {view === 'week' && (
        <div className="week-grid">
          <div className="header-cell">Catégorie</div>
          {weekDays.map(d => (
            <div key={formatDate(d)} className={`header-cell${formatDate(d) === formatDate(new Date()) ? ' today' : ''}`}>
              {d.toLocaleDateString('fr-FR', { weekday: 'short' }).charAt(0).toUpperCase() + d.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(1)}
              <div className="day-date">{d.getDate()}</div>
            </div>
          ))}
          {CATEGORIES.map(cat => {
            const serviceMap = new Map(agents.map(a => [a.username, a.service]));
            return (
            <React.Fragment key={cat}>
              <div className="cat-cell">
                <div className="cat-label">
                  <span className="dot" style={{ background: CATEGORY_COLORS[cat] }} />
                  {CATEGORY_LABELS[cat]}
                </div>
              </div>
              {weekDays.map(d => {
                const ds = formatDate(d);
                const evts = eventsByDateAndCat(ds, cat);
                const fullEvts = evts.filter(e => e.periode === '');
                const amEvts = evts.filter(e => e.periode === 'matin');
                const pmEvts = evts.filter(e => e.periode === 'apres-midi');
                const hasAny = evts.length > 0;
                const renderPastille = (evt: Evenement) => {
                  const bgColor = evt.agent_username && serviceMap.has(evt.agent_username)
                    ? getServiceColor(serviceMap.get(evt.agent_username)!)
                    : CATEGORY_COLORS[cat];
                  const isAgent = evt.agent_username != null;
                  return isAgent ? (
                    <div key={evt.id} className="pastille-dot" style={{ background: bgColor }} onClick={(e) => { e.stopPropagation(); openEditModal(evt); }} title={evt.agent_nom || ''}>
                      {getInitials(evt.agent_nom)}
                    </div>
                  ) : (
                    <div key={evt.id} className="pastille" style={{ background: bgColor }} onClick={(e) => { e.stopPropagation(); openEditModal(evt); }}>
                      {evt.titre}
                    </div>
                  );
                };
                return (
                  <div key={ds} className={`cell${formatDate(d) === formatDate(new Date()) ? ' today' : ''}`} onClick={() => { if (cat === 'teletravail' || cat === 'absence') { openAgentSelect(ds, cat); } else { openCreateModal(ds); } }}>
                    {!hasAny ? (
                      <div className="empty-cell">+</div>
                    ) : (
                      <>
                        <div className="cell-left">
                          <div className="cell-am">
                            {amEvts.length > 0 ? amEvts.map(renderPastille) : null}
                          </div>
                          <div className="cell-pm">
                            {pmEvts.length > 0 ? pmEvts.map(renderPastille) : null}
                          </div>
                        </div>
                        <div className="cell-right">
                          {fullEvts.length > 0 && fullEvts.map(renderPastille)}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Month View */}
      {view === 'month' && (
        <div className="month-grid">
          {DAY_LABELS.map(d => <div key={d} className="day-header">{d}</div>)}
          {monthDays.map((d, idx) => {
            if (!d) return <div key={`e${idx}`} className="day-cell other-month" />;
            const ds = formatDate(d);
            const today = formatDate(new Date());
            const isToday = ds === today;
            const isCurrentMonth = d.getMonth() === currentDate.getMonth();
            const serviceMap = new Map(agents.map(a => [a.username, a.service]));
            return (
              <div key={ds} className={`day-cell${isToday ? ' today' : ''}${!isCurrentMonth ? ' other-month' : ''}`} onClick={() => { if (isCurrentMonth) { setCurrentDate(d); setView('week'); } }}>
                <div className="day-num">{d.getDate()}</div>
                <div className="day-events">
                  {(() => {
                    const fullEvts = CATEGORIES.flatMap(cat => eventsByDateAndCat(ds, cat).filter(e => e.periode === ''));
                    const amEvts = CATEGORIES.flatMap(cat => eventsByDateAndCat(ds, cat).filter(e => e.periode === 'matin'));
                    const pmEvts = CATEGORIES.flatMap(cat => eventsByDateAndCat(ds, cat).filter(e => e.periode === 'apres-midi'));
                    const renderDot = (evt: Evenement) => {
                      const bgColor = evt.agent_username && serviceMap.has(evt.agent_username)
                        ? getServiceColor(serviceMap.get(evt.agent_username)!)
                        : CATEGORY_COLORS[evt.categorie];
                      const isAgent = evt.agent_username != null;
                      return isAgent ? (
                        <div key={evt.id} className="pastille-dot-sm" style={{ background: bgColor }} onClick={(e) => { e.stopPropagation(); openEditModal(evt); }} title={evt.agent_nom || evt.titre}>
                          {evt.agent_nom ? getInitials(evt.agent_nom) : ''}
                        </div>
                      ) : (
                        <div key={evt.id} className="pastille pastille-sm" style={{ background: bgColor }} onClick={(e) => { e.stopPropagation(); openEditModal(evt); }}>
                          {evt.titre}
                        </div>
                      );
                    };
                    return (
                      <>
                        <div className="month-left">
                          <div className="month-am">{amEvts.map(renderDot)}</div>
                          <div className="month-pm">{pmEvts.map(renderDot)}</div>
                        </div>
                        <div className="month-right">{fullEvts.map(renderDot)}</div>
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{editingEvent ? 'Modifier' : 'Ajouter'} un événement</h2>

            <label>Date</label>
            <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />

            <label>Catégorie</label>
            <select value={formCategorie} onChange={e => { const cat = e.target.value as Categorie; setFormCategorie(cat); if (cat !== 'absence' && cat !== 'teletravail') { setSelectedAgent(null); setAdQuery(''); } }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>

            <label>Agent / Service</label>
            <div className="ad-search-wrapper">
              <input
                type="text" placeholder="Rechercher un agent (min 2 caractères)..."
                value={adQuery} onChange={e => searchAD(e.target.value)}
              />
              {adResults.length > 0 && (
                <div className="ad-results">
                  {adResults.map(u => (
                    <div key={u.username} className="ad-result-item" onClick={() => selectAgent(u)}>
                      <div className="ad-name">{u.displayName}</div>
                      <div className="ad-detail">{u.email} {u.service ? `- ${u.service}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
              {searchingAD && <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 2 }}>Recherche...</div>}
            </div>
            {selectedAgent && (
              <div className="ad-selected">
                <strong>{selectedAgent.displayName}</strong>
                {selectedAgent.service && <span style={{ fontSize: '0.75rem', color: '#666', marginLeft: 4 }}>({selectedAgent.service})</span>}
                <span className="remove" onClick={() => { setSelectedAgent(null); setAdQuery(''); setFormTitre(''); }}>✕</span>
              </div>
            )}

            <label>Titre</label>
            <input type="text" value={formTitre} onChange={e => setFormTitre(e.target.value)} placeholder={formCategorie === 'absence' || formCategorie === 'teletravail' ? 'Nom de l\'agent' : 'Titre de l\'événement'} />

            <label>Description</label>
            <textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Optionnel" />

            <label>Période</label>
            <select value={formPeriode} onChange={e => setFormPeriode(e.target.value)}>
              <option value="">Journée entière</option>
              <option value="matin">Matin</option>
              <option value="apres-midi">Après-midi</option>
            </select>

            <div className="modal-actions">
              {editingEvent && (
                <button className="btn-delete" onClick={() => { setShowModal(false); setConfirmDelete(editingEvent.id); }}>Supprimer</button>
              )}
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn-save" onClick={handleSave} disabled={!formDate || !formTitre || saving}>
                {saving ? 'Enregistrement...' : editingEvent ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent quick-select modal */}
      {showAgentSelect && (
        <div className="modal-overlay" onClick={() => setShowAgentSelect(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: 560, maxHeight: '90vh', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            {/* Header */}
            <div style={{ padding: '28px 28px 20px', borderBottom: '1px solid #e2e8f0', background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ margin: '0 0 8px 0', fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>{CATEGORY_LABELS[agentSelectCat]}</h2>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>📅 {agentSelectDate}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Période:</span>
                    {['', 'matin', 'apres-midi'].map(p => (
                      <button key={p} onClick={() => setAgentPeriode(p)}
                        style={{ padding: '4px 14px', borderRadius: '16px', border: agentPeriode === p ? '2px solid #0f172a' : '1px solid #cbd5e1', background: agentPeriode === p ? '#0f172a' : 'white', color: agentPeriode === p ? 'white' : '#475569', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer' }}>
                        {p === '' ? 'Journée' : p === 'matin' ? 'Matin' : 'Après-midi'}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => setShowAgentSelect(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', color: '#94a3b8', fontSize: '1.4rem' }}>×</button>
              </div>
            </div>

            {/* Filter pills */}
            {(() => {
              const services = [...new Set(agents.map(a => a.service).filter(Boolean))].sort();
              return (
                <div style={{ padding: '16px 28px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🔍 Filtrer:</span>
                  <button onClick={() => setAgentServiceFilter('')} style={{ padding: '6px 14px', borderRadius: '20px', border: !agentServiceFilter ? '2px solid #0f172a' : '1px solid #cbd5e1', background: !agentServiceFilter ? '#0f172a' : 'white', color: !agentServiceFilter ? 'white' : '#475569', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}>Tous ({agents.length})</button>
                  {services.map(s => {
                    const count = agents.filter(a => a.service === s).length;
                    return (
                      <button key={s} onClick={() => setAgentServiceFilter(s)} style={{ padding: '6px 14px', borderRadius: '20px', border: agentServiceFilter === s ? '2px solid #0f172a' : '1px solid #cbd5e1', background: agentServiceFilter === s ? '#0f172a' : 'white', color: agentServiceFilter === s ? 'white' : '#475569', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}>{s} ({count})</button>
                    );
                  })}
                </div>
              );
            })()}

            {/* Agent list */}
            <div style={{ maxHeight: 'calc(90vh - 300px)', overflowY: 'auto', padding: '16px 0' }}>
              {(() => {
                const filtered = agentServiceFilter ? agents.filter(a => a.service === agentServiceFilter) : agents;
                const grouped: Record<string, typeof agents> = {};
                for (const a of filtered) {
                  const s = a.service || 'Sans service';
                  if (!grouped[s]) grouped[s] = [];
                  grouped[s].push(a);
                }
                return Object.keys(grouped).sort().map(svc => (
                  <div key={svc}>
                    {/* Service header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 28px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>{svc}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', background: '#e2e8f0', padding: '2px 8px', borderRadius: '12px' }}>{grouped[svc].length}</span>
                      </div>
                      <label style={{ fontSize: '0.8rem', cursor: 'pointer', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                        <input type="checkbox" checked={grouped[svc].every(a => agentToggles[a.username])} onChange={() => {
                          const allOn = grouped[svc].every(a => agentToggles[a.username]);
                          setAgentToggles(prev => {
                            const next = { ...prev };
                            for (const a of grouped[svc]) next[a.username] = !allOn;
                            return next;
                          });
                        }} style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#0f172a' }} />
                        {grouped[svc].every(a => agentToggles[a.username]) ? '✓ Tous cochés' : 'Tout cocher'}
                      </label>
                    </div>

                    {/* Agents in service */}
                    <div>
                      {grouped[svc].map(a => {
                        const on = agentToggles[a.username] || false;
                        const svcColor = a.service ? getServiceColor(a.service) : '#666';
                        return (
                          <label key={a.username} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 28px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: on ? '#f0fdf4' : 'transparent', transition: 'all 0.15s' }}>
                            <input type="checkbox" checked={on} onChange={() => setAgentToggles(prev => ({ ...prev, [a.username]: !prev[a.username] }))} style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#16a34a' }} />
                            <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: svcColor, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                              {getInitials(a.nom)}
                            </span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.95rem', fontWeight: 500, color: '#0f172a' }}>{a.nom}</div>
                              {a.service && <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>{a.service}</div>}
                            </div>
                            {on && <span style={{ fontSize: '1.2rem', color: '#16a34a' }}>✓</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Footer */}
            <div style={{ borderTop: '1px solid #e2e8f0', padding: '16px 28px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '0 0 16px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>{Object.values(agentToggles).filter(Boolean).length}</span>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>sélectionné(s)</span>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn-cancel" onClick={() => setShowAgentSelect(false)} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>Annuler</button>
                <button className="btn-save" onClick={handleAgentSelectSave} disabled={savingAgent} style={{ padding: '10px 24px', borderRadius: '8px', background: CATEGORY_COLORS[agentSelectCat], color: 'white', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.2s', opacity: savingAgent ? 0.7 : 1 }}>
                  {savingAgent ? '⏳ Enregistrement...' : '✓ Appliquer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete !== null && (
        <div className="confirm-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <h3>Confirmer la suppression</h3>
            <p>Êtes-vous sûr de vouloir supprimer cet événement ?</p>
            <div className="actions">
              <button className="btn-no" onClick={() => setConfirmDelete(null)}>Annuler</button>
              <button className="btn-yes" onClick={() => handleDelete(confirmDelete)}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
