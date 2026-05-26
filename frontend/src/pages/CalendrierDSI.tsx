import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { ChevronLeft, ChevronRight, Plus, Calendar, Settings, Mail, Cloud, Shield } from 'lucide-react';

const CATEGORIES = ['absence', 'teletravail', 'deploiement', 'reunion', 'hotline', 'maintenance'] as const;
type Categorie = typeof CATEGORIES[number];

const CATEGORY_COLORS: Record<Categorie, string> = {
  absence: '#E30613',
  teletravail: '#003366',
  deploiement: '#4CAF50',
  reunion: '#9C27B0',
  hotline: '#22c55e',
  maintenance: '#FF9800'
};

const CATEGORY_LABELS: Record<Categorie, string> = {
  absence: 'Absents',
  teletravail: 'Télétravailleurs',
  deploiement: 'Déploiements',
  reunion: 'Réunions importantes',
  hotline: 'Hotline',
  maintenance: 'Maintenance'
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
  source?: string;
  generated?: boolean;
  pending?: boolean;
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

function getMonthDays(year: number, month: number): Date[] {
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
  const { token, user } = useAuth();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [view, setView] = useState<'week' | 'week7' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<Evenement[]>([]);
  const [_loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<{ username: string; nom: string; service: string; email: string }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [readonly, setReadonly] = useState(false);
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

  const [showSendModal, setShowSendModal] = useState(false);
  const [sendDate, setSendDate] = useState(formatDate(new Date(Date.now() + 86400000)));
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [sendingCalendar, setSendingCalendar] = useState(false);

  const [showO365Modal, setShowO365Modal] = useState(false);
  const [o365Calendars, setO365Calendars] = useState<any[]>([]);
  const [o365Loading, setO365Loading] = useState(false);
  const [o365Syncing, setO365Syncing] = useState<number | null>(null);
  const [o365Available, setO365Available] = useState<any[]>([]);
  const [o365Searching, setO365Searching] = useState(false);
  const [o365SearchEmail, setO365SearchEmail] = useState('');

  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [hotlineCounts, setHotlineCounts] = useState<Record<string, { total: number; available: number }>>({});

  const [showManagerModal, setShowManagerModal] = useState(false);
  const [managerList, setManagerList] = useState<any[]>([]);
  const [managerLoading, setManagerLoading] = useState(false);
  const [managerSearch, setManagerSearch] = useState('');
  const [managerSearchResults, setManagerSearchResults] = useState<any[]>([]);
  const [managerSearching, setManagerSearching] = useState(false);
  const [isManager, setIsManager] = useState(false);
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setIsManager(data.est_manager || data.role === 'admin');
        }
      } catch {}
    })();
  }, [token]);

  const [showPrevModal, setShowPrevModal] = useState(false);
  const [prevAgent, setPrevAgent] = useState<{ username: string; nom: string; email: string } | null>(null);
  const [prevDate, setPrevDate] = useState('');
  const [prevPeriode, setPrevPeriode] = useState('');
  const [prevType, setPrevType] = useState('');
  const [prevDateDebut, setPrevDateDebut] = useState('');
  const [prevDateFin, setPrevDateFin] = useState('');
  const [prevPeriodeDebut, setPrevPeriodeDebut] = useState('');
  const [prevPeriodeFin, setPrevPeriodeFin] = useState('');
  const [prevSaving, setPrevSaving] = useState(false);


  // Vacances
  const [showVacancesModal, setShowVacancesModal] = useState(false);
  const [vacances, setVacances] = useState<{ id: number; date_debut: string; date_fin: string; label: string; type: string }[]>([]);
  const [vDateDebut, setVDateDebut] = useState('');
  const [vDateFin, setVDateFin] = useState('');
  const [vLabel, setVLabel] = useState('');
  const [vType, setVType] = useState('ferie');

  const fetchVacances = useCallback(async () => {
    try {
      const res = await fetch('/api/calendrier-dsi/vacances', { headers });
      if (res.ok) setVacances(await res.json());
    } catch {}
  }, [token]);

  useEffect(() => { if (token) fetchVacances(); }, [token, fetchVacances]);

  const isFerie = (dateStr: string) => vacances.some(v => v.type === 'ferie' && dateStr >= v.date_debut && dateStr <= v.date_fin);
  const getVacance = (dateStr: string) => vacances.find(v => v.type === 'vacances' && dateStr >= v.date_debut && dateStr <= v.date_fin);

  const fetchManagerList = async () => {
    setManagerLoading(true);
    try {
      const res = await fetch('/api/admin/manager/list', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setManagerList(Array.isArray(data) ? data : []);
    } catch (e) { console.error('[Manager] Error fetching list:', e); }
    finally { setManagerLoading(false); }
  };

  const toggleManager = async (username: string, isManagerFlag: boolean) => {
    try {
      await fetch('/api/admin/manager/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username, is_manager: isManagerFlag })
      });
      await fetchManagerList();
      // Refresh current user's manager status if they're the one being modified
      const userRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      if (userRes.ok) {
        const data = await userRes.json();
        setIsManager(data.est_manager || data.role === 'admin');
      }
    } catch (e) { console.error('[Manager] Error toggling:', e); }
  };

  useEffect(() => {
    if (managerSearch.trim().length < 2) { setManagerSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setManagerSearching(true);
      try {
        const res = await fetch(`/api/ad/search?q=${encodeURIComponent(managerSearch.trim())}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setManagerSearchResults(Array.isArray(data) ? data : []);
      } catch { setManagerSearchResults([]); } finally { setManagerSearching(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [managerSearch, token]);

  const openPrevModal = (agent: { username: string; nom: string; email: string }, date: string, periode: string) => {
    setReadonly(false);
    setEditingEvent(null);
    setPrevAgent(agent);
    setPrevDate(date);
    setPrevPeriode(periode);
    setPrevType('');
    setPrevDateDebut(date);
    setPrevDateFin(date);
    setPrevPeriodeDebut(periode);
    setPrevPeriodeFin(periode);
    setShowPrevModal(true);
  };

  const handlePrevSave = async () => {
    if (!prevAgent || !prevType) return;
    setPrevSaving(true);
    try {
      if (editingEvent && editingEvent.id > 0 && prevType !== 'hotline') {
        try {
          const titre = encodeURIComponent(editingEvent.titre || '');
          const username = encodeURIComponent(editingEvent.agent_username || '');
          await fetch(`/api/calendrier-dsi/evenements/${editingEvent.id}?deleteSeries=true&titre=${titre}&agent_username=${username}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        } catch (e) { console.error('[Prev] Error deleting old series:', e); }
      }
      const colors: Record<string, string> = { 'absence_justifier': CATEGORY_COLORS.absence, teletravail: CATEGORY_COLORS.teletravail, conge_previsionnel: '#f59e0b', asa: '#8b5cf6' };
      const labels: Record<string, string> = { absence_justifier: 'Absence à justifier', teletravail: 'Télétravail', conge_previsionnel: 'Congé prévisionnel', asa: 'ASA' };
      const catMap: Record<string, string> = { absence_justifier: 'absence', conge_previsionnel: 'absence', asa: 'absence', teletravail: 'teletravail' };
      const periodeLabel = (p: string) => p === 'matin' ? ' Matin' : p === 'apres-midi' ? ' Après-midi' : '';

      const createEvent = async (date: string, periode: string) => {
        await fetch('/api/calendrier-dsi/evenements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            date,
            categorie: catMap[prevType] || prevType,
            periode: periode,
            titre: labels[prevType] || prevType,
            description: `${labels[prevType] || prevType}${prevDateFin && prevDateFin !== prevDateDebut ? ` (du ${prevDateDebut}${periodeLabel(prevPeriodeDebut)} au ${prevDateFin}${periodeLabel(prevPeriodeFin)})` : periodeLabel(periode)}`,
            agent_username: prevAgent!.username,
            agent_nom: prevAgent!.nom,
            agent_email: prevAgent!.email,
            couleur: colors[prevType] || '#6366f1'
          })
        });
      };

      const toggleHL = async (date: string, currentlyOn: boolean, periode: string) => {
        await fetch('/api/calendrier-dsi/hotline/override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ agent_username: prevAgent!.username, date, active: currentlyOn ? false : true, periode })
        });
      };

      if (prevType === 'hotline') {
        const sameDay = prevDateFin === prevDateDebut || !prevDateFin;
        if (sameDay) {
          const pd = prevPeriodeDebut || '';
          const pf = prevPeriodeFin || pd;
          if (pd === 'matin') {
            const currentlyOn = events.some(e => {
              const eDate = e.date.split('T')[0];
              return eDate === prevDateDebut && e.agent_username === prevAgent!.username && e.categorie === 'hotline' && e.periode === 'matin';
            });
            await toggleHL(prevDateDebut, currentlyOn, 'matin');
            if (pf === 'apres-midi' || pf === '') {
              const currentlyOnPm = events.some(e => {
                const eDate = e.date.split('T')[0];
                return eDate === prevDateDebut && e.agent_username === prevAgent!.username && e.categorie === 'hotline' && (pf === 'apres-midi' ? e.periode === 'apres-midi' : e.periode === '');
              });
              await toggleHL(prevDateDebut, currentlyOnPm, pf === 'apres-midi' ? 'apres-midi' : '');
            }
          } else if (pd === 'apres-midi') {
            const currentlyOn = events.some(e => {
              const eDate = e.date.split('T')[0];
              return eDate === prevDateDebut && e.agent_username === prevAgent!.username && e.categorie === 'hotline' && e.periode === 'apres-midi';
            });
            await toggleHL(prevDateDebut, currentlyOn, 'apres-midi');
          } else {
            const currentlyOn = events.some(e => {
              const eDate = e.date.split('T')[0];
              return eDate === prevDateDebut && e.agent_username === prevAgent!.username && e.categorie === 'hotline' && (e.periode || '') === '';
            });
            await toggleHL(prevDateDebut, currentlyOn, '');
          }
        } else {
          const start = new Date(prevDateDebut);
          const end = new Date(prevDateFin);
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (d.getDay() === 0 || d.getDay() === 6) continue;
            const ds = formatDate(d);
            const isStart = ds === prevDateDebut;
            const isEnd = ds === prevDateFin;
            if (isStart) {
              const pd = prevPeriodeDebut || '';
              if (pd === 'matin') {
                const currentlyOn = events.some(e => {
                  const eDate = e.date.split('T')[0];
                  return eDate === ds && e.agent_username === prevAgent!.username && e.categorie === 'hotline' && e.periode === 'matin';
                });
                await toggleHL(ds, currentlyOn, 'matin');
                const pfEnd = prevPeriodeFin || 'apres-midi';
                if (prevDateFin === prevDateDebut) {
                  if (pfEnd === 'apres-midi' || pfEnd === '') {
                    const currentlyOnPm = events.some(e => {
                      const eDate = e.date.split('T')[0];
                      return eDate === ds && e.agent_username === prevAgent!.username && e.categorie === 'hotline' && (pfEnd === 'apres-midi' ? e.periode === 'apres-midi' : e.periode === '');
                    });
                    await toggleHL(ds, currentlyOnPm, pfEnd === 'apres-midi' ? 'apres-midi' : '');
                  }
                } else {
                  const currentlyOnPm = events.some(e => {
                    const eDate = e.date.split('T')[0];
                    return eDate === ds && e.agent_username === prevAgent!.username && e.categorie === 'hotline' && e.periode === 'apres-midi';
                  });
                  await toggleHL(ds, currentlyOnPm, 'apres-midi');
                }
              } else if (pd === 'apres-midi') {
                const currentlyOn = events.some(e => {
                  const eDate = e.date.split('T')[0];
                  return eDate === ds && e.agent_username === prevAgent!.username && e.categorie === 'hotline' && e.periode === 'apres-midi';
                });
                await toggleHL(ds, currentlyOn, 'apres-midi');
              } else {
                const currentlyOn = events.some(e => {
                  const eDate = e.date.split('T')[0];
                  return eDate === ds && e.agent_username === prevAgent!.username && e.categorie === 'hotline' && (e.periode || '') === '';
                });
                await toggleHL(ds, currentlyOn, '');
              }
            } else if (isEnd) {
              const pf = prevPeriodeFin || '';
              if (pf === 'matin') {
                const currentlyOn = events.some(e => {
                  const eDate = e.date.split('T')[0];
                  return eDate === ds && e.agent_username === prevAgent!.username && e.categorie === 'hotline' && e.periode === 'matin';
                });
                await toggleHL(ds, currentlyOn, 'matin');
              } else if (pf === 'apres-midi') {
                const currentlyOn = events.some(e => {
                  const eDate = e.date.split('T')[0];
                  return eDate === ds && e.agent_username === prevAgent!.username && e.categorie === 'hotline' && e.periode === 'apres-midi';
                });
                await toggleHL(ds, currentlyOn, 'apres-midi');
              } else {
                const currentlyOn = events.some(e => {
                  const eDate = e.date.split('T')[0];
                  return eDate === ds && e.agent_username === prevAgent!.username && e.categorie === 'hotline' && (e.periode || '') === '';
                });
                await toggleHL(ds, currentlyOn, '');
              }
            } else {
              const currentlyOn = events.some(e => {
                const eDate = e.date.split('T')[0];
                return eDate === ds && e.agent_username === prevAgent!.username && e.categorie === 'hotline' && (e.periode || '') === '';
              });
              await toggleHL(ds, currentlyOn, '');
            }
          }
        }
      } else {
        const sameDay = prevDateFin === prevDateDebut || !prevDateFin;
        if (sameDay) {
          const pd = prevPeriodeDebut || '';
          const pf = prevPeriodeFin || pd;
          if (pd === 'matin') {
            await createEvent(prevDateDebut, 'matin');
            if (pf === 'apres-midi' || pf === '') await createEvent(prevDateDebut, pf === 'apres-midi' ? 'apres-midi' : '');
          } else if (pd === 'apres-midi') {
            await createEvent(prevDateDebut, 'apres-midi');
          } else {
            await createEvent(prevDateDebut, '');
          }
        } else {
          const start = new Date(prevDateDebut);
          const end = new Date(prevDateFin);
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (d.getDay() === 0 || d.getDay() === 6) continue;
            const ds = formatDate(d);
            const isStart = ds === prevDateDebut;
            const isEnd = ds === prevDateFin;
            if (isStart) {
              const pd = prevPeriodeDebut || '';
              if (pd === 'matin') {
                await createEvent(ds, 'matin');
                const pfEnd = prevPeriodeFin || 'apres-midi';
                if (prevDateFin === prevDateDebut) {
                  if (pfEnd === 'apres-midi' || pfEnd === '') await createEvent(ds, 'apres-midi');
                } else {
                  await createEvent(ds, 'apres-midi');
                }
              } else if (pd === 'apres-midi') {
                await createEvent(ds, 'apres-midi');
              } else {
                await createEvent(ds, '');
              }
            } else if (isEnd) {
              const pf = prevPeriodeFin || '';
              if (pf === 'matin') {
                await createEvent(ds, 'matin');
              } else if (pf === 'apres-midi') {
                await createEvent(ds, 'apres-midi');
              } else {
                await createEvent(ds, '');
              }
            } else {
              await createEvent(ds, '');
            }
          }
        }
      }
      setShowPrevModal(false);
      if (view === 'week' || view === 'week7') {
        const { start } = getWeekRange(currentDate);
        const end = new Date(start);
        end.setDate(end.getDate() + (view === 'week7' ? 6 : 4));
        fetchEvents(formatDate(start), formatDate(end));
      } else {
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();
        fetchEvents(formatDate(new Date(y, m, 1)), formatDate(new Date(y, m + 2, 0)));
      }
    } catch (e) { console.error('Erreur prévisionnel:', e); }
    finally { setPrevSaving(false); }
  };

  const fetchO365Calendars = async () => {
    setO365Loading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/admin/o365-calendar/status', { headers: { Authorization: `Bearer ${token}` } });
      setO365Calendars(res.data);
    } catch (e) { console.error('[O365] Error fetching calendars:', e); }
    finally { setO365Loading(false); }
  };

  const syncO365 = async (id: number) => {
    setO365Syncing(id);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/admin/o365-calendar/${id}/sync`, {}, { headers: { Authorization: `Bearer ${token}` } });
      alert(res.data.message);
      fetchO365Calendars();
    } catch (e: any) { alert(e.response?.data?.error || e.response?.data?.message || 'Erreur de synchronisation'); }
    finally { setO365Syncing(null); }
  };

  const searchO365 = async () => {
    if (!o365SearchEmail) return;
    setO365Searching(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/admin/o365-calendar/available', { params: { email: o365SearchEmail }, headers: { Authorization: `Bearer ${token}` } });
      setO365Available(res.data);
    } catch (e: any) { alert(e.response?.data?.error || 'Erreur lors de la recherche'); }
    finally { setO365Searching(false); }
  };

  const addO365Calendar = async (cal: any) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/admin/o365-calendar', { name: cal.name, email: o365SearchEmail, calendar_id: cal.id }, { headers: { Authorization: `Bearer ${token}` } });
      fetchO365Calendars();
      setO365Available([]);
      setO365SearchEmail('');
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  };

  const deleteO365Calendar = async (id: number) => {
    if (!confirm('Supprimer ce calendrier Office 365 ?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/admin/o365-calendar/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchO365Calendars();
    } catch (e) { console.error(e); }
  };

  const toggleO365Enabled = async (cal: any) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/admin/o365-calendar/${cal.id}`, { ...cal, enabled: cal.enabled ? 0 : 1 }, { headers: { Authorization: `Bearer ${token}` } });
      fetchO365Calendars();
    } catch (e) { console.error(e); }
  };

  const fetchHotlineCounts = useCallback(async (debut: string, fin: string) => {
    try {
      const [y1, m1, d1] = debut.split('-').map(Number);
      const [y2, m2, d2] = fin.split('-').map(Number);
      const startDate = new Date(y1, m1 - 1, d1);
      const endDate = new Date(y2, m2 - 1, d2);

      const counts: Record<string, { total: number; available: number }> = {};
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = formatDate(d);
        for (const periode of ['matin', 'apres-midi']) {
          const key = `${dateStr}|${periode}`;
          try {
            const res = await fetch(`/api/calendrier-dsi/hotline/count/${dateStr}/${periode}`, { headers });
            if (res.ok) {
              const data = await res.json();
              counts[key] = { total: data.total, available: data.available };
            }
          } catch (e) {
            // Silent fail for individual counts
          }
        }
      }
      setHotlineCounts(counts);
    } catch (e: any) {
      console.error('Erreur chargement hotline counts', e);
    }
  }, [token]);

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
        setAgents(Array.isArray(agentsData) ? agentsData.map((a: any) => ({ username: a.username, nom: a.nom, service: a.service || '', email: a.email || '' })) : []);
      }
      setEvents(Array.isArray(eventsData) ? eventsData : []);
      // Fetch hotline counts
      fetchHotlineCounts(debut, fin);
    } catch (e: any) {
      console.error('Erreur chargement événements', e);
      setError(e.message || 'Erreur de chargement');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [token, fetchHotlineCounts]);

  useEffect(() => {
    if (!token) return;
    if (view === 'week' || view === 'week7') {
      const { start } = getWeekRange(currentDate);
      const end = new Date(start);
      end.setDate(end.getDate() + (view === 'week7' ? 6 : 4));
      fetchEvents(formatDate(start), formatDate(end));
    } else {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const first = formatDate(new Date(year, month, 1));
      const last = formatDate(new Date(year, month + 2, 0));
      fetchEvents(first, last);
    }
  }, [currentDate, view, fetchEvents, token]);

  const navPrev = () => {
    const d = new Date(currentDate);
    if (view === 'week' || view === 'week7') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };

  const navNext = () => {
    const d = new Date(currentDate);
    if (view === 'week' || view === 'week7') d.setDate(d.getDate() + 7);
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
      if (view === 'week' || view === 'week7') {
        const { start } = getWeekRange(currentDate);
        const end = new Date(start);
        end.setDate(end.getDate() + (view === 'week7' ? 6 : 4));
        await fetchEvents(formatDate(start), formatDate(end));
      } else {
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();
        await fetchEvents(formatDate(new Date(y, m, 1)), formatDate(new Date(y, m + 2, 0)));
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
    setReadonly(false);
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
    const readOnly = (evt.generated && evt.categorie !== 'hotline') || evt.source === 'maintenance-table' || evt.source === 'o365' || evt.created_by === 'auto-rh' || evt.created_by === 'auto-rh-pending';
    setReadonly(!!readOnly);
    const isOwnEvent = evt.agent_username?.toLowerCase() === user?.username?.toLowerCase();
    const isPublicCategory = evt.categorie === 'deploiement' || evt.categorie === 'reunion';
    if (!isManager && !isOwnEvent && !isPublicCategory) return;
    if (selectedService && isManager && (evt.categorie === 'absence' || evt.categorie === 'teletravail' || evt.categorie === 'hotline') && (evt.id > 0 || evt.categorie === 'hotline')) {
      setPrevAgent({ username: evt.agent_username || '', nom: evt.agent_nom || '', email: evt.agent_email || '' });
      setPrevDate(evt.date);
      setPrevPeriode(evt.periode || '');
      const titreLC = (evt.titre || '').toLowerCase();
      let mappedType: string = evt.categorie;
      if (evt.categorie === 'absence') {
        if (titreLC.includes('absence_justifier')) mappedType = 'absence_justifier';
        else if (titreLC.includes('conge_previsionnel')) mappedType = 'conge_previsionnel';
        else if (titreLC.includes('asa')) mappedType = 'asa';
        else mappedType = 'absence_justifier';
      }
      setPrevType(mappedType);
      setPrevDateDebut(evt.date);
      setPrevDateFin(evt.date);
      setPrevPeriodeDebut(evt.periode === 'matin' ? 'matin' : evt.periode === 'apres-midi' ? 'apres-midi' : '');
      setPrevPeriodeFin(evt.periode === 'matin' ? 'matin' : evt.periode === 'apres-midi' ? 'apres-midi' : '');
      setEditingEvent(evt);
      setShowPrevModal(true);
      return;
    }
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
      couleur: CATEGORY_COLORS[formCategorie],
      updateSeries: editingEvent?.agent_username ? true : undefined
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
      if (view === 'week' || view === 'week7') {
        const { start } = getWeekRange(currentDate);
        const end = new Date(start);
        end.setDate(end.getDate() + (view === 'week7' ? 6 : 4));
        await fetchEvents(formatDate(start), formatDate(end));
      } else {
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();
        await fetchEvents(formatDate(new Date(y, m, 1)), formatDate(new Date(y, m + 2, 0)));
      }
    } catch (e: any) {
      console.error('[Calendrier] Erreur sauvegarde', e);
      setError(e.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, series?: boolean, extra?: { titre?: string; agent_username?: string }) => {
    try {
      let url = series ? `/api/calendrier-dsi/evenements/${id}?deleteSeries=true` : `/api/calendrier-dsi/evenements/${id}`;
      if (series && extra?.titre) url += `&titre=${encodeURIComponent(extra.titre)}&agent_username=${encodeURIComponent(extra.agent_username || '')}`;
      await fetch(url, { method: 'DELETE', headers });
      setConfirmDelete(null);
      if (view === 'week' || view === 'week7') {
        const { start } = getWeekRange(currentDate);
        const end = new Date(start);
        end.setDate(end.getDate() + (view === 'week7' ? 6 : 4));
        fetchEvents(formatDate(start), formatDate(end));
      } else {
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();
        fetchEvents(formatDate(new Date(y, m, 1)), formatDate(new Date(y, m + 2, 0)));
      }
    } catch (e) {
      console.error('Erreur suppression', e);
    }
  };

  const handleSendCalendar = async () => {
    if (selectedRecipients.length === 0) {
      setError('Sélectionne au least un destinataire');
      return;
    }
    setSendingCalendar(true);
    setError(null);
    try {
      const res = await fetch('/api/calendrier-dsi/send-daily', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          date: sendDate,
          recipients: selectedRecipients
        })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `Erreur HTTP ${res.status}`);
      }
      const result = await res.json();
      setShowSendModal(false);
      setSelectedRecipients([]);
      setError(null);
      alert(result.message);
    } catch (e: any) {
      console.error('Erreur envoi calendrier', e);
      setError(e.message || 'Erreur lors de l\'envoi');
    } finally {
      setSendingCalendar(false);
    }
  };

  const eventsByDateAndCat = (dateStr: string, cat: Categorie): Evenement[] => {
    return events.filter(e => {
      const eDate = e.date.split('T')[0];
      return eDate === dateStr && e.categorie === cat;
    });
  };

  const weekDays: Date[] = [];
  if (view === 'week' || view === 'week7') {
    const { start } = getWeekRange(currentDate);
    const dayCount = view === 'week7' ? 7 : 5;
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      weekDays.push(d);
    }
    console.log('[Calendrier] weekDays:', weekDays.map(d => formatDate(d) + ' (' + d.toLocaleDateString('fr-FR') + ')'));
    console.log('[Calendrier] events state:', events.length, events.map(e => e.date + ' ' + e.categorie));
  }

  const monthDays = view === 'month' ? padMonth(getMonthDays(currentDate.getFullYear(), currentDate.getMonth())) : [];

  const weekLabel = view === 'week' || view === 'week7'
    ? (() => {
        const { start } = getWeekRange(currentDate);
        const end = new Date(start);
        end.setDate(end.getDate() + (view === 'week7' ? 6 : 4));
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
          padding: 20px 40px;
          margin-bottom: 24px;
        }
        .cal-header-content {
          max-width: 1600px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .cal-header h1 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 700;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .cal-nav {
          display: flex;
          align-items: center;
          gap: 8px;
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
          padding: 6px 12px;
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 0.8rem;
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
          padding: 6px 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
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
          min-width: 180px;
          text-align: center;
          font-size: 1rem;
          color: #0f172a;
        }
        .btn-add {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 6px 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
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
          min-height: 80px;
          display: flex;
          flex-direction: column;
          gap: 2px;
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
        .cell-period {
          display: flex;
          align-items: flex-start;
          gap: 4px;
          margin-bottom: 2px;
        }
        .period-label {
          font-size: 0.65rem;
          font-weight: 700;
          color: #94a3b8;
          min-width: 10px;
          padding-top: 2px;
        }
        .cell-refs {
          display: flex;
          flex-wrap: wrap;
          gap: 3px;
          align-items: flex-start;
        }
        .cell-refs-full {
          margin-top: 2px;
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
        .pastille-rh {
          outline: 2px solid #000;
          outline-offset: -1px;
        }
        .pastille-dot-rh {
          outline: 2px solid #000;
          outline-offset: -1px;
        }
        .pastille-dot-sm-rh {
          outline: 1.5px solid #000;
          outline-offset: -1px;
        }
        .pastille-rh-pending {
          outline: 2px dashed #000;
          outline-offset: -1px;
        }
        .pastille-dot-rh-pending {
          outline: 2px dashed #000;
          outline-offset: -1px;
        }
        .pastille-dot-sm-rh-pending {
          outline: 1.5px dashed #000;
          outline-offset: -1px;
        }
        .pastille-maint {
          outline: 2px solid #000;
          outline-offset: -1px;
        }
        .pastille-dot-maint {
          outline: 2px solid #000;
          outline-offset: -1px;
        }
        .pastille-dot-sm-maint {
          outline: 1.5px solid #000;
          outline-offset: -1px;
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
              <button className={view === 'week7' ? 'active' : ''} onClick={() => setView('week7')}>📅 Semaine 7</button>
              <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>📆 Mois</button>
            </div>
            <button onClick={navPrev}><ChevronLeft size={18} /></button>
            <span className="label">{weekLabel}</span>
            <button onClick={navNext}><ChevronRight size={18} /></button>
            <button onClick={navToday}>Aujourd'hui</button>
            <button className="btn-add" onClick={() => openCreateModal()}><Plus size={14} /> Ajouter</button>
            {isManager && (<>
              <button style={{ background: '#6c5ce7', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '600', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(108, 92, 231, 0.2)' }} onClick={() => { setSelectedRecipients([]); setSendDate(formatDate(new Date(Date.now() + 86400000))); setShowSendModal(true); }} onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)', e.currentTarget.style.boxShadow = '0 4px 12px rgba(108, 92, 231, 0.3)')} onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)', e.currentTarget.style.boxShadow = '0 2px 8px rgba(108, 92, 231, 0.2)')}><Mail size={14} /> Envoyer</button>
              <button style={{ background: '#0078d4', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '600', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0, 120, 212, 0.2)' }} onClick={() => { setShowO365Modal(true); fetchO365Calendars(); }} onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)', e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 120, 212, 0.3)')} onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)', e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 120, 212, 0.2)')}><Cloud size={14} /> O365</button>
              <a href="/calendrier-dsi/agents" style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '600', textDecoration: 'none', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.15)' }} onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)', e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.2)')} onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)', e.currentTarget.style.boxShadow = '0 2px 8px rgba(15, 23, 42, 0.15)')}><Settings size={14} /> Agents</a>
              <button style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '600', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(245, 158, 11, 0.2)' }} onClick={() => { setShowManagerModal(true); fetchManagerList(); }} onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)', e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.3)')} onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)', e.currentTarget.style.boxShadow = '0 2px 8px rgba(245, 158, 11, 0.2)')}><Shield size={14} /> Manager</button>
              <button style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '600', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(239, 68, 68, 0.2)' }} onClick={() => { setShowVacancesModal(true); }} onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)', e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)')} onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)', e.currentTarget.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.2)')}><span style={{ fontSize: '0.9rem' }}>🎉</span> Vacances</button>
            </>)}
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
            {selectedService && (
              <span className="legend-item" style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => setSelectedService(null)}>
                <span className="legend-dot" style={{ background: '#999' }} />← Toutes les catégories
              </span>
            )}
            {services.map(s => (
              <span key={s} className="legend-item" style={{ cursor: 'pointer', fontWeight: selectedService === s ? 800 : 400, opacity: selectedService && selectedService !== s ? 0.4 : 1 }} onClick={() => setSelectedService(selectedService === s ? null : s)}>
                <span className="legend-dot" style={{ background: getServiceColor(s) }} />
                {s}
              </span>
            ))}
          </div>
        );
      })()}

      {/* Week View - Category mode */}
      {(view === 'week' || view === 'week7') && !selectedService && (
        <div className="week-grid" style={{ gridTemplateColumns: `140px repeat(${weekDays.length}, 1fr)` }}>
          <div className="header-cell">Catégorie</div>
          {weekDays.map(d => {
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const ds = formatDate(d);
            const feria = isFerie(ds);
            const vac = getVacance(ds);
            return (
            <div key={ds} className={`header-cell${ds === formatDate(new Date()) ? ' today' : ''}`} style={{ ...(isWeekend || feria ? { background: '#e2e8f0', color: '#94a3b8' } : {}), ...(feria ? { borderTop: '3px solid #ef4444' } : {}), ...(vac ? { borderBottom: '2px solid #eab308' } : {}) }}>
              {d.toLocaleDateString('fr-FR', { weekday: 'short' }).charAt(0).toUpperCase() + d.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(1)}
              <div className="day-date">{d.getDate()}</div>
              {vac && <div style={{ fontSize: '0.5rem', color: '#eab308', fontWeight: 600, lineHeight: 1.1, marginTop: 1 }}>{vac.label}</div>}
            </div>
            );
          })}
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
                  const isRh = evt.source === 'demabs' || evt.created_by === 'auto-rh' || evt.created_by === 'auto-rh-pending';
                  const isMaint = evt.source === 'maintenance-table';
                  const isPending = evt.pending || evt.created_by === 'auto-rh-pending';
                  let rhClass = '';
                  if (isRh) {
                    if (isPending) rhClass = isAgent ? ' pastille-dot-rh-pending' : ' pastille-rh-pending';
                    else rhClass = isAgent ? ' pastille-dot-rh' : ' pastille-rh';
                  }
                  let maintClass = '';
                  if (isMaint) {
                    maintClass = isAgent ? ' pastille-dot-maint' : ' pastille-maint';
                  }
                  return isAgent ? (
                    <div key={evt.id} className={`pastille-dot${rhClass}${maintClass}`} style={{ background: bgColor }} onClick={(e) => { e.stopPropagation(); openEditModal(evt); }} title={evt.agent_nom || evt.description || ''}>
                      {getInitials(evt.agent_nom)}
                    </div>
                  ) : (
                    <div key={evt.id} className={`pastille${rhClass}${maintClass}`} style={{ background: bgColor }} onClick={(e) => { e.stopPropagation(); openEditModal(evt); }}>
                      {evt.titre}
                    </div>
                  );
                };
                return (
                  <div key={ds} className={`cell${formatDate(d) === formatDate(new Date()) ? ' today' : ''}`} style={d.getDay() === 0 || d.getDay() === 6 ? { background: '#f1f5f9' } : {}} onClick={() => { if (d.getDay() !== 0 && d.getDay() !== 6 && (cat === 'teletravail' || cat === 'absence')) { openAgentSelect(ds, cat); } else if (d.getDay() !== 0 && d.getDay() !== 6) { openCreateModal(ds); } }}>
                    {!hasAny ? (
                      <div className="empty-cell">+</div>
                    ) : (
                      <>
                        {amEvts.length > 0 && (
                          <div className="cell-period">
                            <span className="period-label">M</span>
                            <div className="cell-refs">{amEvts.map(renderPastille)}</div>
                          </div>
                        )}
                        {pmEvts.length > 0 && (
                          <div className="cell-period">
                            <span className="period-label">A</span>
                            <div className="cell-refs">{pmEvts.map(renderPastille)}</div>
                          </div>
                        )}
                        {fullEvts.length > 0 && (
                          <div className="cell-refs cell-refs-full">{fullEvts.map(renderPastille)}</div>
                        )}
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

      {/* Week View - Service/Agent mode */}
      {(view === 'week' || view === 'week7') && selectedService && (() => {
        const svcAgents = agents.filter(a => a.service === selectedService).sort((a, b) => a.nom.localeCompare(b.nom));
        const ABSENCE_TYPE_COLORS: Record<string, string> = {
absence: '#64748b',
          absence_justifier: '#E30613',
          sedit: '#7c3aed',
          sedit_pending: '#a78bfa',
          teletravail: '#003366',
          conge_previsionnel: '#f59e0b',
          asa: '#8b5cf6',
          deploiement: '#4CAF50',
          maintenance: '#FF9800',
          reunion: '#9C27B0',
        };
        const isSedit = (evt: Evenement) => evt.source === 'demabs' || evt.created_by === 'auto-rh' || evt.created_by === 'auto-rh-pending';
        const getAbsenceLabel = (evt: Evenement) => {
          if (isSedit(evt)) return evt.pending || evt.created_by === 'auto-rh-pending' ? 'Sedit (prov.)' : 'Sedit';
          const titre = (evt.titre || '').toLowerCase();
          if (titre.includes('asa')) return 'ASA';
          if (titre.includes('congé prévisionnel') || titre.includes('conge_previsionnel')) return 'Congé prév.';
          if (titre.includes('absence à justifier') || titre.includes('absence_justifier')) return 'Abs. à just.';
          if (evt.categorie === 'absence') return 'Absent';
          if (evt.categorie === 'teletravail') return 'TT';
          return evt.titre;
        };
        const getAbsenceColor = (evt: Evenement) => {
          if (isSedit(evt)) return evt.pending || evt.created_by === 'auto-rh-pending' ? ABSENCE_TYPE_COLORS.sedit_pending : ABSENCE_TYPE_COLORS.sedit;
          const titre = (evt.titre || '').toLowerCase();
          if (titre.includes('asa')) return ABSENCE_TYPE_COLORS.asa;
          if (titre.includes('congé prévisionnel') || titre.includes('conge_previsionnel')) return ABSENCE_TYPE_COLORS.conge_previsionnel;
          if (titre.includes('absence à justifier') || titre.includes('absence_justifier')) return ABSENCE_TYPE_COLORS.absence_justifier;
          return ABSENCE_TYPE_COLORS[evt.categorie] || '#6366f1';
        };
        const isAbsenceType = (evt: Evenement) => evt.categorie === 'absence' || evt.categorie === 'teletravail';
        return (
        <div className="week-grid" style={{ gridTemplateColumns: `140px repeat(${weekDays.length}, 1fr)` }}>
          <div className="header-cell" style={{ fontWeight: 700, background: getServiceColor(selectedService), color: '#fff' }}>{selectedService}</div>
          {weekDays.map(d => {
            const ds = formatDate(d);
            const isToday = ds === formatDate(new Date());
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const feria = isFerie(ds);
            const vac = getVacance(ds);
            return (
              <div key={ds} className={`header-cell${isToday ? ' today' : ''}`} style={{ ...(isWeekend || feria ? { background: '#e2e8f0', color: '#94a3b8' } : {}), ...(feria ? { borderTop: '3px solid #ef4444' } : {}), ...(vac ? { borderBottom: '2px solid #eab308' } : {}) }}>
                {d.toLocaleDateString('fr-FR', { weekday: 'short' }).charAt(0).toUpperCase() + d.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(1)}
                <div className="day-date">{d.getDate()}</div>
                {vac ? <div style={{ fontSize: '0.55rem', color: '#eab308', fontWeight: 600, lineHeight: 1.1 }}>{vac.label}</div> : (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 2, fontSize: '0.65rem', color: isToday ? '#7c3aed' : '#94a3b8' }}>
                  {(() => {
                    const mCount = hotlineCounts[`${ds}|matin`];
                    const aCount = hotlineCounts[`${ds}|apres-midi`];
                    const getHlStyle = (count: { total: number; available: number } | undefined) => {
                      if (!count) return { background: 'transparent', color: 'inherit', fontWeight: 'inherit' };
                      if (count.available === 0) return { background: '#ef4444', color: '#fff', fontWeight: 600 };
                      if (count.available === 1) return { background: '#f97316', color: '#fff', fontWeight: 600 };
                      return { background: 'transparent', color: 'inherit', fontWeight: 'inherit' };
                    };
                    return (
                      <>
                        <span style={{ ...getHlStyle(mCount), padding: mCount ? '0 2px' : 0, borderRadius: 2 }}>
                          {mCount ? mCount.available : 'M'}
                        </span>
                        <span style={{ opacity: 0.3 }}>|</span>
                        <span style={{ ...getHlStyle(aCount), padding: aCount ? '0 2px' : 0, borderRadius: 2 }}>
                          {aCount ? aCount.available : 'A'}
                        </span>
                      </>
                    );
                  })()}
                </div>)}
              </div>
            );
          })}
          {svcAgents.map(agent => {
            const agentEvts = (dateStr: string) => events.filter(e => {
              const eDate = e.date.split('T')[0];
              return eDate === dateStr && (e.agent_username === agent.username || (e.agent_email && e.agent_email.toLowerCase() === (agent.email || '').toLowerCase())) && (e.categorie === 'absence' || e.categorie === 'teletravail' || e.source === 'o365' || e.categorie === 'deploiement' || e.categorie === 'reunion' || e.categorie === 'hotline');
            });
            return (
              <React.Fragment key={agent.username}>
                <div className="cat-cell" style={{ background: agent.username?.toLowerCase() === user?.username?.toLowerCase() ? '#dbeafe' : '#f8fafc', padding: '4px 8px', minHeight: 'auto' }}>
                  <div className="cat-label" style={{ fontWeight: 600, fontSize: '0.75rem', color: agent.username?.toLowerCase() === user?.username?.toLowerCase() ? '#1e40af' : '#0f172a', lineHeight: 1.2 }}>
                    {agent.nom}
                  </div>
                </div>
                {weekDays.map(d => {
                  const ds = formatDate(d);
                  const feria = isFerie(ds);
                  const allEvts = agentEvts(ds);
                  const amEvts = allEvts.filter(e => e.periode === 'matin');
                  const pmEvts = allEvts.filter(e => e.periode === 'apres-midi');
                  const fullEvts = allEvts.filter(e => e.periode === '' || !e.periode);
                  const amAbs = amEvts.filter(e => isAbsenceType(e)).sort((a, b) => isSedit(b) ? 1 : isSedit(a) ? -1 : 0)[0];
                  const pmAbs = pmEvts.filter(e => isAbsenceType(e)).sort((a, b) => isSedit(b) ? 1 : isSedit(a) ? -1 : 0)[0];
                  const fullAbs = fullEvts.filter(e => isAbsenceType(e)).sort((a, b) => isSedit(b) ? 1 : isSedit(a) ? -1 : 0)[0];
                  const amOther = amEvts.filter(e => !isAbsenceType(e) && e.categorie !== 'hotline');
                  const pmOther = pmEvts.filter(e => !isAbsenceType(e) && e.categorie !== 'hotline');
                  const amHl = amEvts.filter(e => e.categorie === 'hotline')[0];
                  const pmHl = pmEvts.filter(e => e.categorie === 'hotline')[0];
                  const fullHl = fullEvts.filter(e => e.categorie === 'hotline')[0];
                  const isToday = ds === formatDate(new Date());
                  const isRh = (e: Evenement) => e.source === 'demabs' || e.created_by === 'auto-rh' || e.created_by === 'auto-rh-pending';
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const renderSmallPill = (evt: Evenement) => {
                    const seditStyle = isSedit(evt) ? { border: '2px solid #000', outline: '1px solid #000' } : {};
                    return <div key={evt.id} className="pastille" style={{ background: isSedit(evt) ? (evt.pending || evt.created_by === 'auto-rh-pending' ? ABSENCE_TYPE_COLORS.sedit_pending : ABSENCE_TYPE_COLORS.sedit) : ABSENCE_TYPE_COLORS[evt.categorie] || '#6366f1', fontSize: '0.65rem', padding: '1px 4px', ...seditStyle }} onClick={(e) => { e.stopPropagation(); openEditModal(evt); }}>{getAbsenceLabel(evt)}</div>;
                  };
                  const renderFilledHalf = (evt: Evenement) => {
                    const color = getAbsenceColor(evt);
                    const label = getAbsenceLabel(evt);
                    const seditBorder = isSedit(evt) ? '2px solid #000' : 'none';
                    const isTT = evt.categorie === 'teletravail' && !isSedit(evt);
                    const bgStyle = isTT
                      ? { background: `#ffffff repeating-linear-gradient(45deg, transparent, transparent 4px, ${color} 4px, ${color} 6px)`, color }
                      : { background: color, color: '#fff' };
                    return (
                      <div key={evt.id} style={{ width: '100%', height: '100%', ...bgStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer', borderRadius: 2, border: seditBorder }} onClick={(e) => { e.stopPropagation(); openEditModal(evt); }}>
                        {isTT ? <span style={{ background: 'rgba(255,255,255,0.85)', padding: '0 4px', borderRadius: 2, color }}>{label}</span> : label}
                      </div>
                    );
                  };
                  return (
                    <div key={ds} className={`cell${isToday ? ' today' : ''}`} style={{ minHeight: 44, padding: 0, display: 'flex', flexDirection: 'row', position: 'relative' }}>
                      {isWeekend || feria ? (
                        <div style={{ flex: 2, background: '#f1f5f9', minHeight: 44 }} />
                      ) : (
                      <><div style={{ flex: 1, padding: '2px 3px', display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 22, background: amAbs ? `${getAbsenceColor(amAbs)}22` : (fullAbs ? `${getAbsenceColor(fullAbs)}22` : ((amHl || fullHl) ? '#22c55e22' : 'transparent')) }}>
                        {amAbs ? renderFilledHalf(amAbs) : fullAbs ? null : (amOther.length > 0 ? amOther.map(renderSmallPill) : ((isManager || agent.username?.toLowerCase() === user?.username?.toLowerCase()) ? <div style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#cbd5e1', cursor: 'pointer', transition: 'all 0.15s' }} onClick={(e) => { e.stopPropagation(); openPrevModal(agent, ds, 'matin'); }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#64748b'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = '#f1f5f9'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#cbd5e1'; e.currentTarget.style.background = 'transparent'; }}>+</div> : null))}
                        {amHl && <div className="pastille" style={{ background: '#22c55e', color: '#fff', fontSize: '0.6rem', padding: '1px 3px', borderRadius: 2, lineHeight: 1.2, zIndex: 2, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); if (confirm('Supprimer la hotline du matin pour ' + agent.nom + ' le ' + ds + ' ?')) { fetch('/api/calendrier-dsi/hotline/override', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ agent_username: agent.username, date: ds, active: false, periode: 'matin' }) }).then(() => { if (view === 'week' || view === 'week7') { const { start } = getWeekRange(currentDate); const end = new Date(start); end.setDate(end.getDate() + (view === 'week7' ? 6 : 4)); fetchEvents(formatDate(start), formatDate(end)); } else { const y = currentDate.getFullYear(); const m = currentDate.getMonth(); fetchEvents(formatDate(new Date(y, m, 1)), formatDate(new Date(y, m + 2, 0))); } }); } }}>HL</div>}
                      </div>
                      <div style={{ flex: 1, padding: '2px 3px', display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 22, background: pmAbs ? `${getAbsenceColor(pmAbs)}22` : (fullAbs ? `${getAbsenceColor(fullAbs)}22` : ((pmHl || fullHl) ? '#22c55e22' : 'transparent')) }}>
                        {pmAbs ? renderFilledHalf(pmAbs) : (pmOther.length > 0 ? pmOther.map(renderSmallPill) : ((isManager || agent.username?.toLowerCase() === user?.username?.toLowerCase()) ? <div style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#cbd5e1', cursor: 'pointer', transition: 'all 0.15s' }} onClick={(e) => { e.stopPropagation(); openPrevModal(agent, ds, 'apres-midi'); }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#64748b'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = '#f1f5f9'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#cbd5e1'; e.currentTarget.style.background = 'transparent'; }}>+</div> : null))}
                        {pmHl && <div className="pastille" style={{ background: '#22c55e', color: '#fff', fontSize: '0.6rem', padding: '1px 3px', borderRadius: 2, lineHeight: 1.2, zIndex: 2, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); if (confirm('Supprimer la hotline de l\'après-midi pour ' + agent.nom + ' le ' + ds + ' ?')) { fetch('/api/calendrier-dsi/hotline/override', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ agent_username: agent.username, date: ds, active: false, periode: 'apres-midi' }) }).then(() => { if (view === 'week' || view === 'week7') { const { start } = getWeekRange(currentDate); const end = new Date(start); end.setDate(end.getDate() + (view === 'week7' ? 6 : 4)); fetchEvents(formatDate(start), formatDate(end)); } else { const y = currentDate.getFullYear(); const m = currentDate.getMonth(); fetchEvents(formatDate(new Date(y, m, 1)), formatDate(new Date(y, m + 2, 0))); } }); } }}>HL</div>}
                      </div></>
                      )}
                      {fullAbs && !amAbs && !pmAbs && (
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex' }}>
                          <div style={{ flex: 1, fontWeight: 700, fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRight: isRh(fullAbs) ? '2px solid #000' : 'none', color: fullAbs.categorie === 'teletravail' && !isSedit(fullAbs) ? getAbsenceColor(fullAbs) : '#fff', textShadow: fullAbs.categorie === 'teletravail' && !isSedit(fullAbs) ? 'none' : '0 1px 2px rgba(0,0,0,0.3)', background: fullAbs.categorie === 'teletravail' && !isSedit(fullAbs) ? `#ffffff repeating-linear-gradient(45deg, transparent, transparent 4px, ${getAbsenceColor(fullAbs)} 4px, ${getAbsenceColor(fullAbs)} 6px)` : getAbsenceColor(fullAbs) }} onClick={(e) => { e.stopPropagation(); openEditModal(fullAbs); }}>
                            {fullAbs.categorie === 'teletravail' && !isSedit(fullAbs) ? <span style={{ background: 'rgba(255,255,255,0.85)', padding: '0 4px', borderRadius: 2, color: getAbsenceColor(fullAbs) }}>{getAbsenceLabel(fullAbs)}</span> : getAbsenceLabel(fullAbs)}
                          </div>
                          <div style={{ flex: 1, fontWeight: 700, fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderLeft: isRh(fullAbs) ? '2px solid #000' : 'none', color: fullAbs.categorie === 'teletravail' && !isSedit(fullAbs) ? getAbsenceColor(fullAbs) : '#fff', textShadow: fullAbs.categorie === 'teletravail' && !isSedit(fullAbs) ? 'none' : '0 1px 2px rgba(0,0,0,0.3)', background: fullAbs.categorie === 'teletravail' && !isSedit(fullAbs) ? `#ffffff repeating-linear-gradient(45deg, transparent, transparent 4px, ${getAbsenceColor(fullAbs)} 4px, ${getAbsenceColor(fullAbs)} 6px)` : getAbsenceColor(fullAbs) }} onClick={(e) => { e.stopPropagation(); openEditModal(fullAbs); }}>
                            {fullAbs.categorie === 'teletravail' && !isSedit(fullAbs) ? <span style={{ background: 'rgba(255,255,255,0.85)', padding: '0 4px', borderRadius: 2, color: getAbsenceColor(fullAbs) }}>{getAbsenceLabel(fullAbs)}</span> : getAbsenceLabel(fullAbs)}
                          </div>
                        </div>
                      )}
                      {fullHl && !amHl && !pmHl && (() => {
                        const fs: React.CSSProperties = { background: '#22c55e', color: '#fff', fontSize: '0.55rem', padding: '1px 6px', borderRadius: 2, lineHeight: 1.2, zIndex: 2, position: 'absolute', bottom: 1, left: 1, right: 1, textAlign: 'center', cursor: 'pointer' };
                        return <><div style={{ ...fs, left: 1, right: '50%', marginRight: 0.5 } as React.CSSProperties} onClick={(e) => { e.stopPropagation(); if (confirm('Supprimer la hotline du matin pour ' + agent.nom + ' le ' + ds + ' ?')) { fetch('/api/calendrier-dsi/hotline/override', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ agent_username: agent.username, date: ds, active: false, periode: '' }) }).then(() => { if (view === 'week' || view === 'week7') { const { start } = getWeekRange(currentDate); const end = new Date(start); end.setDate(end.getDate() + (view === 'week7' ? 6 : 4)); fetchEvents(formatDate(start), formatDate(end)); } else { const y = currentDate.getFullYear(); const m = currentDate.getMonth(); fetchEvents(formatDate(new Date(y, m, 1)), formatDate(new Date(y, m + 2, 0))); } }); } }}>HL</div><div style={{ ...fs, left: '50%', right: 1, marginLeft: 0.5 } as React.CSSProperties} onClick={(e) => { e.stopPropagation(); if (confirm('Supprimer la hotline de l\'après-midi pour ' + agent.nom + ' le ' + ds + ' ?')) { fetch('/api/calendrier-dsi/hotline/override', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ agent_username: agent.username, date: ds, active: false, periode: '' }) }).then(() => { if (view === 'week' || view === 'week7') { const { start } = getWeekRange(currentDate); const end = new Date(start); end.setDate(end.getDate() + (view === 'week7' ? 6 : 4)); fetchEvents(formatDate(start), formatDate(end)); } else { const y = currentDate.getFullYear(); const m = currentDate.getMonth(); fetchEvents(formatDate(new Date(y, m, 1)), formatDate(new Date(y, m + 2, 0))); } }); } }}>HL</div></>;
                      })()}
                      {(isManager || agent.username?.toLowerCase() === user?.username?.toLowerCase()) && allEvts.length === 0 && (
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 20, height: 20, borderRadius: '50%', border: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#cbd5e1', cursor: 'pointer', zIndex: 10, background: 'transparent', transition: 'all 0.15s' }} onClick={(e) => { e.stopPropagation(); openPrevModal(agent, ds, ''); }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#64748b'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = '#f1f5f9'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#cbd5e1'; e.currentTarget.style.background = 'transparent'; }}>+</div>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
        );
      })()}

      {/* Month View - classic grid */}
      {view === 'month' && !selectedService && (
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
                      const isRh = evt.source === 'demabs' || evt.created_by === 'auto-rh' || evt.created_by === 'auto-rh-pending';
                      const isMaint = evt.source === 'maintenance-table';
                      const isPending = evt.pending || evt.created_by === 'auto-rh-pending';
                      let rhClass = '';
                      if (isRh) {
                        if (isPending) rhClass = isAgent ? ' pastille-dot-sm-rh-pending' : ' pastille-rh-pending';
                        else rhClass = isAgent ? ' pastille-dot-sm-rh' : ' pastille-rh';
                      }
                      let maintClass = '';
                      if (isMaint) {
                        maintClass = isAgent ? ' pastille-dot-sm-maint' : ' pastille-maint';
                      }
                      return isAgent ? (
                        <div key={evt.id} className={`pastille-dot-sm${rhClass}${maintClass}`} style={{ background: bgColor }} onClick={(e) => { e.stopPropagation(); openEditModal(evt); }} title={evt.description || evt.agent_nom || evt.titre}>
                          {evt.agent_nom ? getInitials(evt.agent_nom) : ''}
                        </div>
                      ) : (
                        <div key={evt.id} className={`pastille pastille-sm${rhClass}${maintClass}`} style={{ background: bgColor }} onClick={(e) => { e.stopPropagation(); openEditModal(evt); }}>
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

      {/* Month View - by service (agents) */}
      {view === 'month' && selectedService && (() => {
        const svcAgents = agents.filter(a => a.service === selectedService).sort((a, b) => a.nom.localeCompare(b.nom));
        const isSedit = (evt: Evenement) => evt.source === 'demabs' || evt.created_by === 'auto-rh' || evt.created_by === 'auto-rh-pending';
        const isTT = (evt: Evenement) => evt.categorie === 'teletravail' && !isSedit(evt);
        const cellColor = (evt: Evenement) => {
          if (isSedit(evt)) return evt.pending || evt.created_by === 'auto-rh-pending' ? '#a78bfa' : '#7c3aed';
          if (evt.categorie === 'teletravail') return '#003366';
          const t = (evt.titre || '').toLowerCase();
          if (t.includes('asa')) return '#8b5cf6';
          if (t.includes('congé prévisionnel') || t.includes('conge_previsionnel')) return '#f59e0b';
          if (t.includes('absence à justifier') || t.includes('absence_justifier')) return '#E30613';
          return '#64748b';
        };
        const cellBg = (evt: Evenement) => {
          const c = cellColor(evt);
          return isTT(evt) ? `#ffffff repeating-linear-gradient(45deg, transparent, transparent 4px, ${c} 4px, ${c} 6px)` : c;
        };
        const firstEvt = (list: Evenement[]) => list.sort((a, b) => (isSedit(b) ? 1 : 0) - (isSedit(a) ? 1 : 0))[0];
        const renderMonth = (year: number, month: number) => {
          const mDays = getMonthDays(year, month);
          return (
            <div className="week-grid" style={{ gridTemplateColumns: `100px repeat(${mDays.length}, 1fr)`, marginBottom: 8, fontSize: '0.7rem' }}>
              <div className="header-cell" style={{ fontWeight: 700, background: getServiceColor(selectedService), color: '#fff', fontSize: '0.75rem' }}>
                {new Date(year, month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </div>
              {mDays.map(d => {
                const ds = formatDate(d);
                const isToday = ds === formatDate(new Date());
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const feria = isFerie(ds);
                const vac = getVacance(ds);
                return (
                  <div key={ds} className={`header-cell${isToday ? ' today' : ''}`} style={{ padding: '2px 1px', fontSize: '0.6rem', ...(isWeekend || feria ? { background: '#e2e8f0', color: '#94a3b8' } : {}), ...(feria ? { borderTop: '3px solid #ef4444' } : {}), ...(vac ? { borderBottom: '2px solid #eab308' } : {}) }}>
                    {d.getDate()}
                    {vac && <div style={{ fontSize: '0.5rem', color: '#eab308', fontWeight: 600, lineHeight: 1.1 }}>{vac.label}</div>}
                  </div>
                );
              })}
              {svcAgents.map(agent => {
                const agentEvts = (dateStr: string) => events.filter(e => {
                  const eDate = e.date.split('T')[0];
                  return eDate === dateStr && (e.agent_username === agent.username || (e.agent_email && e.agent_email.toLowerCase() === (agent.email || '').toLowerCase()));
                });
                return (
                  <React.Fragment key={agent.username}>
                    <div className="cat-cell" style={{ background: '#f8fafc', padding: '1px 4px', minHeight: 'auto', fontSize: '0.6rem', fontWeight: 600, color: '#0f172a', lineHeight: 1.2, display: 'flex', alignItems: 'center' }}>
                      {agent.nom.split(' ').slice(0, 2).map((w, i) => i === 0 ? w.charAt(0) + '.' : w).join(' ')}
                    </div>
                    {mDays.map(d => {
                      const ds = formatDate(d);
                      const feria = isFerie(ds);
                      const allEvts = agentEvts(ds);
                      const amAbs = firstEvt(allEvts.filter(e => e.periode === 'matin' && (e.categorie === 'absence' || e.categorie === 'teletravail')));
                      const pmAbs = firstEvt(allEvts.filter(e => e.periode === 'apres-midi' && (e.categorie === 'absence' || e.categorie === 'teletravail')));
                      const fullAbs = firstEvt(allEvts.filter(e => (e.periode === '' || !e.periode) && (e.categorie === 'absence' || e.categorie === 'teletravail')));
                      const amHl = allEvts.filter(e => e.periode === 'matin' && e.categorie === 'hotline')[0];
                      const pmHl = allEvts.filter(e => e.periode === 'apres-midi' && e.categorie === 'hotline')[0];
                      const fullHl = allEvts.filter(e => (e.periode === '' || !e.periode) && e.categorie === 'hotline')[0];
                      const isToday = ds === formatDate(new Date());
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      const amHL = amHl || fullHl;
                      const pmHL = pmHl || fullHl;
                      const amDispEvt = amAbs || (!amAbs ? fullAbs : null);
                      const pmDispEvt = pmAbs || (!pmAbs ? fullAbs : null);
                      let amBg = 'transparent';
                      if (amDispEvt) {
                        if (amHL && isTT(amDispEvt)) {
                          amBg = `#22c55e repeating-linear-gradient(45deg, transparent, transparent 4px, ${cellColor(amDispEvt)} 4px, ${cellColor(amDispEvt)} 6px)`;
                        } else {
                          amBg = cellBg(amDispEvt);
                        }
                      } else if (amHL) {
                        amBg = '#22c55e';
                      }
                      let pmBg = 'transparent';
                      if (pmDispEvt) {
                        if (pmHL && isTT(pmDispEvt)) {
                          pmBg = `#22c55e repeating-linear-gradient(45deg, transparent, transparent 4px, ${cellColor(pmDispEvt)} 4px, ${cellColor(pmDispEvt)} 6px)`;
                        } else {
                          pmBg = cellBg(pmDispEvt);
                        }
                      } else if (pmHL) {
                        pmBg = '#22c55e';
                      }
                      return (
                        <div key={ds} className={`cell${isToday ? ' today' : ''}`} style={{ minHeight: 20, padding: 0, position: 'relative', background: isWeekend || feria ? '#f1f5f9' : `linear-gradient(to right, ${amBg} 50%, ${pmBg} 50%)` }} />
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>
          );
        };
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth() - 1); setCurrentDate(d); }} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '0.9rem' }}>&#9664;</button>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>
                {new Date(y, m).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                {` & `}
                {new Date(y, m + 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth() + 1); setCurrentDate(d); }} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '0.9rem' }}>&#9654;</button>
            </div>
            {renderMonth(y, m)}
            {renderMonth(y, m + 1)}
          </div>
        );
      })()}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{readonly ? 'Détail' : editingEvent ? 'Modifier' : 'Ajouter'} un événement</h2>

            <label>Date</label>
            <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} disabled={readonly} />

            <label>Catégorie</label>
            <select value={formCategorie} onChange={e => { const cat = e.target.value as Categorie; setFormCategorie(cat); if (cat !== 'absence' && cat !== 'teletravail') { setSelectedAgent(null); setAdQuery(''); } }} disabled={readonly}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>

            <label>Agent / Service</label>
            <div className="ad-search-wrapper">
              <input
                type="text" placeholder="Rechercher un agent (min 2 caractères)..."
                value={adQuery} onChange={e => searchAD(e.target.value)} disabled={readonly}
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
            <input type="text" value={formTitre} onChange={e => setFormTitre(e.target.value)} placeholder={formCategorie === 'absence' || formCategorie === 'teletravail' ? 'Nom de l\'agent' : 'Titre de l\'événement'} disabled={readonly} />

            <label>Description</label>
            <textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Optionnel" disabled={readonly} />

            <label>Période</label>
            <select value={formPeriode} onChange={e => setFormPeriode(e.target.value)} disabled={readonly}>
              <option value="">Journée entière</option>
              <option value="matin">Matin</option>
              <option value="apres-midi">Après-midi</option>
            </select>

            <div className="modal-actions">
              {editingEvent && !readonly && (
                <button className="btn-delete" onClick={() => { setShowModal(false); setConfirmDelete(editingEvent.id); }}>Supprimer</button>
              )}
              <button className="btn-cancel" onClick={() => setShowModal(false)}>{readonly ? 'Fermer' : 'Annuler'}</button>
              {!readonly && (
                <button className="btn-save" onClick={handleSave} disabled={!formDate || !formTitre || saving}>
                  {saving ? 'Enregistrement...' : editingEvent ? 'Enregistrer' : 'Ajouter'}
                </button>
              )}
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

      {/* Send calendar modal */}
      {showSendModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050, backdropFilter: 'blur(2px)' }} onClick={() => setShowSendModal(false)}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '32px', width: '500px', maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📧</div>
              <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#0f172a', fontWeight: 700 }}>Envoyer le calendrier</h2>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, color: '#0f172a' }}>Date:</label>
              <input type="date" value={sendDate} onChange={(e) => setSendDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.95rem', fontFamily: 'inherit' }} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <label style={{ fontWeight: 500, color: '#0f172a' }}>Destinataires ({selectedRecipients.length}):</label>
                {agents.length > 0 && (
                  <button onClick={() => setSelectedRecipients(selectedRecipients.length === agents.length ? [] : agents.map(a => a.email))} style={{ fontSize: '0.8rem', color: '#6c5ce7', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                    {selectedRecipients.length === agents.length ? 'Désélectionner tout' : 'Sélectionner tout'}
                  </button>
                )}
              </div>
              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '0' }}>
                {agents.length === 0 ? (
                  <p style={{ color: '#94a3b8', margin: 0, padding: '16px' }}>Aucun agent disponible</p>
                ) : (
                  agents.map((a, idx) => {
                    const isSelected = selectedRecipients.includes(a.email);
                    return (
                      <div key={a.username} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderBottom: idx < agents.length - 1 ? '1px solid #f1f5f9' : 'none', background: isSelected ? '#f0fdf4' : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }} onClick={() => {
                        console.log('[Send Modal] Clicking agent:', a.email, 'current isSelected:', isSelected, 'current selectedRecipients:', selectedRecipients);
                        if (isSelected) {
                          const newList = selectedRecipients.filter(e => e !== a.email);
                          console.log('[Send Modal] Removing, new list:', newList);
                          setSelectedRecipients(newList);
                        } else {
                          const newList = [...selectedRecipients, a.email];
                          console.log('[Send Modal] Adding, new list:', newList);
                          setSelectedRecipients(newList);
                        }
                      }}>
                        <input type="checkbox" checked={isSelected} onChange={() => {}} style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#16a34a' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.95rem', fontWeight: 500, color: '#0f172a' }}>{a.nom}</div>
                          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>{a.email}</div>
                        </div>
                        {isSelected && <span style={{ fontSize: '1.1rem', color: '#16a34a' }}>✓</span>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSendModal(false)} style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>Annuler</button>
              <button onClick={handleSendCalendar} disabled={sendingCalendar} style={{ padding: '10px 24px', borderRadius: '8px', background: '#6c5ce7', color: 'white', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.2s', opacity: sendingCalendar ? 0.7 : 1 }}>
                {sendingCalendar ? '⏳ Envoi...' : '✉️ Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* O365 Calendar Modal */}
      {showO365Modal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050, backdropFilter: 'blur(2px)' }} onClick={() => setShowO365Modal(false)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 30, width: '90%', maxWidth: 700, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>Calendriers Office 365</h2>
                <p style={{ color: '#64748b', marginTop: 4, fontSize: '0.9rem' }}>Connectez des calendriers Outlook pour afficher leurs événements.</p>
              </div>
              <button onClick={() => setShowO365Modal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            <h4 style={{ margin: '20px 0 10px', color: '#0f172a' }}>Ajouter un calendrier</h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={o365SearchEmail} onChange={e => setO365SearchEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') searchO365(); }} style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem' }} placeholder="Email du calendrier Outlook..." />
              <button onClick={searchO365} disabled={o365Searching} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #0078d4', background: o365Searching ? '#e2e8f0' : '#fff', color: '#0078d4', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
                {o365Searching ? '...' : 'Chercher'}
              </button>
            </div>

            {o365Available.length > 0 && (
              <div style={{ marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 10, maxHeight: 150, overflow: 'auto' }}>
                {o365Available.map((cal: any, i: number) => (
                  <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{cal.name}</div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{cal.owner}</div>
                    </div>
                    <button onClick={() => addO365Calendar(cal)} style={{ padding: '6px 14px', borderRadius: 8, background: '#0078d4', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Ajouter</button>
                  </div>
                ))}
              </div>
            )}

            <h4 style={{ margin: '20px 0 10px', color: '#0f172a' }}>Calendriers connectés</h4>
            {o365Loading ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>Chargement...</p>
            ) : o365Calendars.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>Aucun calendrier O365 connecté</p>
            ) : o365Calendars.map((cal: any) => (
              <div key={cal.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#f8fafc', borderRadius: 12, marginBottom: 8, border: '1px solid #e2e8f0' }}>
                <Cloud size={20} style={{ color: cal.enabled ? '#0078d4' : '#94a3b8' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{cal.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{cal.email}{cal.last_sync_at ? ` · Dernière synchro: ${new Date(cal.last_sync_at).toLocaleString('fr-FR')}` : ' · Jamais synchronisé'}{cal.event_count !== undefined ? ` · ${cal.event_count} événements` : ''}</div>
                </div>
                <button onClick={() => toggleO365Enabled(cal)} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${cal.enabled ? '#22c55e' : '#e2e8f0'}`, background: cal.enabled ? '#f0fdf4' : '#f8fafc', color: cal.enabled ? '#166534' : '#94a3b8', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                  {cal.enabled ? '✓ Actif' : 'Inactif'}
                </button>
                <button onClick={() => syncO365(cal.id)} disabled={o365Syncing === cal.id} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #0078d4', background: '#eff6ff', color: '#0078d4', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                  {o365Syncing === cal.id ? '...' : '↻ Synchro'}
                </button>
                <button onClick={() => deleteO365Calendar(cal.id)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #fecdd3', background: '#fff1f2', color: '#e11d48', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prévisionnel Modal */}
      {showPrevModal && prevAgent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050, backdropFilter: 'blur(2px)' }} onClick={() => setShowPrevModal(false)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, width: '90%', maxWidth: 420, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>Prévisionnel — {prevAgent.nom}</h2>
              <button onClick={() => setShowPrevModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: '0.85rem', color: '#475569' }}>
              {prevDate}{prevPeriode === 'matin' ? ' Matin' : prevPeriode === 'apres-midi' ? ' Après-midi' : ' Journée complète'}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: 8, color: '#0f172a' }}>Type</label>
              {[
                { key: 'absence_justifier', label: 'Absence à justifier', color: CATEGORY_COLORS.absence },
                { key: 'teletravail', label: 'Télétravail', color: CATEGORY_COLORS.teletravail },
                { key: 'conge_previsionnel', label: 'Congé prévisionnel', color: '#f59e0b' },
                { key: 'asa', label: 'ASA', color: '#8b5cf6' },
                ...(isManager ? [{ key: 'hotline', label: 'Hotline', color: '#22c55e' }] : []),
              ].map(opt => (
                <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', margin: '4px 0', borderRadius: 8, cursor: 'pointer', background: prevType === opt.key ? '#f0f9ff' : 'white', border: prevType === opt.key ? `2px solid ${opt.color}` : '1px solid #e2e8f0', transition: 'all 0.15s' }}>
                  <input type="radio" name="prevType" value={opt.key} checked={prevType === opt.key} onChange={() => setPrevType(opt.key)} style={{ accentColor: opt.color }} />
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                  <span style={{ fontWeight: prevType === opt.key ? 600 : 400, color: prevType === opt.key ? '#0f172a' : '#475569' }}>{opt.label}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 4, color: '#475569' }}>Date début</label>
                <input type="date" value={prevDateDebut} onChange={e => setPrevDateDebut(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.9rem' }} />
                <select value={prevPeriodeDebut} onChange={e => setPrevPeriodeDebut(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.8rem', marginTop: 4, background: '#fff' }}>
                  <option value="">Journée</option>
                  <option value="matin">Matin</option>
                  <option value="apres-midi">Après-midi</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 4, color: '#475569' }}>Date fin</label>
                <input type="date" value={prevDateFin} onChange={e => setPrevDateFin(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.9rem' }} />
                <select value={prevPeriodeFin} onChange={e => setPrevPeriodeFin(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.8rem', marginTop: 4, background: '#fff' }}>
                  <option value="">Journée</option>
                  <option value="matin">Matin</option>
                  <option value="apres-midi">Après-midi</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {editingEvent && <button onClick={() => { setShowPrevModal(false); setConfirmDelete(editingEvent!.id); }} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>🗑 Supprimer</button>}
              <button onClick={() => setShowPrevModal(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>Annuler</button>
              <button onClick={handlePrevSave} disabled={!prevType || prevSaving} style={{ padding: '10px 24px', borderRadius: 8, background: prevType ? ({ absence_justifier: CATEGORY_COLORS.absence, teletravail: CATEGORY_COLORS.teletravail, conge_previsionnel: '#f59e0b', asa: '#8b5cf6', hotline: '#22c55e' }[prevType] || '#6366f1') : '#cbd5e1', color: 'white', border: 'none', fontWeight: 600, cursor: prevType ? 'pointer' : 'not-allowed', fontSize: '0.9rem', transition: 'all 0.2s' }}>
                {prevSaving ? '⏳ Enregistrement...' : '✓ Valider'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete !== null && (() => {
        const evt = events.find(e => e.id === confirmDelete);
        const isSeries = evt && evt.agent_username;
        return (
        <div className="confirm-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <h3>Confirmer la suppression</h3>
            <p>Êtes-vous sûr de vouloir supprimer cet événement ?</p>
            <div className="actions">
              <button className="btn-no" onClick={() => setConfirmDelete(null)}>Annuler</button>
              <button className="btn-yes" onClick={() => handleDelete(confirmDelete)}>Supprimer</button>
              {isSeries && <button className="btn-yes" style={{ background: '#e17055' }} onClick={() => handleDelete(confirmDelete, true, { titre: evt.titre, agent_username: evt.agent_username || undefined })}>Supprimer la série</button>}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Manager Modal */}
      {showManagerModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050, backdropFilter: 'blur(2px)' }} onClick={() => setShowManagerModal(false)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 30, width: '90%', maxWidth: 500, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}><Shield size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />Gestion des Managers</h2>
                <p style={{ color: '#64748b', marginTop: 4, fontSize: '0.9rem' }}>Managers du calendrier DSI — peuvent envoyer, configurer O365 et gérer les agents.</p>
              </div>
              <button onClick={() => setShowManagerModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            <div style={{ marginBottom: 16, position: 'relative' }}>
              <input value={managerSearch} onChange={e => setManagerSearch(e.target.value)} placeholder="Rechercher un utilisateur AD..." style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.95rem', boxSizing: 'border-box' }} />
              {managerSearching && <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem' }}>...</span>}
              {managerSearchResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, marginTop: 4, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10 }}>
                  {managerSearchResults.map((u: any) => (
                    <div key={u.username} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{u.displayName || u.username}</div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{u.username}{u.email ? ` · ${u.email}` : ''}{u.service ? ` · ${u.service}` : ''}</div>
                      </div>
                      <button onClick={() => { toggleManager(u.username, true); setManagerSearch(''); setManagerSearchResults([]); }} style={{ padding: '6px 14px', borderRadius: 8, background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>+ Manager</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <h4 style={{ margin: '20px 0 10px', color: '#0f172a' }}>Managers actuels ({managerList.length})</h4>
            {managerLoading ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>Chargement...</p>
            ) : managerList.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>Aucun manager désigné.</p>
            ) : managerList.map((m: any) => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: '#f8fafc', borderRadius: 10, marginBottom: 6, border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{m.username}</div>
                </div>
                <button onClick={() => toggleManager(m.username, false)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #fecdd3', background: '#fff1f2', color: '#e11d48', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Retirer</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vacances Modal */}
      {showVacancesModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050, backdropFilter: 'blur(2px)' }} onClick={() => setShowVacancesModal(false)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, width: '90%', maxWidth: 480, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}><span style={{ fontSize: '1.4rem' }}>🎉</span> Vacances et jours fériés</h2>
              <button onClick={() => setShowVacancesModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <input type="date" value={vDateDebut} onChange={e => setVDateDebut(e.target.value)} style={{ flex: 1, minWidth: 120, padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem' }} />
              <input type="date" value={vDateFin} onChange={e => setVDateFin(e.target.value)} style={{ flex: 1, minWidth: 120, padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem' }} />
              <input type="text" value={vLabel} onChange={e => setVLabel(e.target.value)} placeholder="Label" style={{ flex: 2, minWidth: 140, padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem' }} />
              <select value={vType} onChange={e => setVType(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem', background: '#fff' }}>
                <option value="ferie">Férié</option>
                <option value="vacances">Vacances</option>
              </select>
              <button style={{ padding: '8px 16px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }} onClick={async () => {
                if (!vDateDebut || !vLabel) return;
                await fetch('/api/calendrier-dsi/vacances', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ date_debut: vDateDebut, date_fin: vDateFin || vDateDebut, label: vLabel, type: vType }) });
                setVDateDebut(''); setVDateFin(''); setVLabel(''); setVType('ferie');
                fetchVacances();
              }}>Ajouter</button>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {vacances.length === 0 ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>Aucune période enregistrée.</p> : vacances.map(v => (
                <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: 8, marginBottom: 4, border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{v.label}</span>
                    <span style={{ color: '#64748b', marginLeft: 8 }}>{v.date_debut}{v.date_fin !== v.date_debut ? ` → ${v.date_fin}` : ''}</span>
                    <span style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 4, fontSize: '0.7rem', background: v.type === 'ferie' ? '#fef2f2' : '#eff6ff', color: v.type === 'ferie' ? '#dc2626' : '#2563eb' }}>{v.type === 'ferie' ? 'Férié' : 'Vacances'}</span>
                  </div>
                  <button style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.85rem' }} onClick={async () => { await fetch(`/api/calendrier-dsi/vacances/${v.id}`, { method: 'DELETE', headers }); fetchVacances(); }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
