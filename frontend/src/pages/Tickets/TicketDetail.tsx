import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import Header from '../../components/Header';
import CreateTaskModal from '../../components/CreateTaskModal';
import { useAuth } from '../../contexts/AuthContext';
import { useADSearch } from '../../utils/useADSearch';
import AssociateProblemModal from './AssociateProblemModal';
import ProblemModal from './ProblemModal';

function decodeHtml(str: string) {
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

const STATUS_COLORS: Record<number, string> = {
  1: '#6366f1', 2: '#8b5cf6', 3: '#f59e0b',
  4: '#f97316', 5: '#22c55e', 6: '#64748b'
};

const PRIORITY_COLORS: Record<number, string> = {
  2: '#22c55e', 3: '#f59e0b', 4: '#f97316', 5: '#ef4444',
};
const PRIORITY_LABELS: Record<number, string> = {
  2: 'Basse', 3: 'Normale', 4: 'Haute', 5: 'Très haute',
};
const IMPACT_INFO: Record<number, { icon: string; label: string }> = {
  2: { icon: '👤', label: '1 utilisateur' },
  3: { icon: '👥', label: 'Groupe de travail' },
  4: { icon: '🏢', label: 'Service / Direction' },
  5: { icon: '🌍', label: 'Global' },
};

const STATUS_NAMES: Record<number, string> = {
  1: 'Nouveau', 2: 'En cours (Attribué)', 3: 'En cours (Planifié)',
  4: 'En attente', 5: 'Résolu', 6: 'Clos'
};

const VALID_TRANSITIONS: Record<number, { to: number; label: string; color: string }[]> = {
  1: [{ to: 3, label: 'Prendre en charge', color: '#f59e0b' }],
  2: [{ to: 3, label: 'Prendre en charge', color: '#f59e0b' }, { to: 1, label: 'Réinitialiser', color: '#64748b' }],
  3: [{ to: 3, label: 'Prendre en charge', color: '#f59e0b' }, { to: 4, label: 'Mettre en pause', color: '#f97316' }, { to: 5, label: 'Résoudre', color: '#22c55e' }],
  4: [{ to: 3, label: 'Reprendre', color: '#f59e0b' }, { to: 5, label: 'Résoudre', color: '#22c55e' }],
  5: [{ to: 6, label: 'Fermer', color: '#64748b' }, { to: 3, label: 'Réouvrir', color: '#f59e0b' }],
  6: [{ to: 3, label: 'Réouvrir', color: '#f59e0b' }],
};

export default function TicketDetail() {
  const { id } = useParams();
  const { user, token } = useAuth();
  const isEmbedded = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embedded') === '1';
  const [ticket, setTicket] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [ticketTasks, setTicketTasks] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentPrivate, setCommentPrivate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requesterTickets, setRequesterTickets] = useState<any>(null);
  const [showRequesterTickets, setShowRequesterTickets] = useState(false);
  const [glpiTicketUrl, setGlpiTicketUrl] = useState<string | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [commentFile, setCommentFile] = useState<File | null>(null);
  const [sendingToUser, setSendingToUser] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  // Groupe de tickets
  const [ticketGroup, setTicketGroup] = useState<any>(null);
  const [showAddToGroup, setShowAddToGroup] = useState(false);
  const [addTicketId, setAddTicketId] = useState('');
  const [groupActionLoading, setGroupActionLoading] = useState(false);
  const [showProblemModal, setShowProblemModal] = useState(false);
  const [showAssociateProblemModal, setShowAssociateProblemModal] = useState(false);
  const [showWaitingModal, setShowWaitingModal] = useState(false);
  const [waitingComment, setWaitingComment] = useState('');
  const [showSolutionModal, setShowSolutionModal] = useState(false);
  const [solutionText, setSolutionText] = useState('');
  const [observers, setObservers] = useState<any[]>([]);
  const [showAddObserver, setShowAddObserver] = useState(false);
  const [observerSearch, setObserverSearch] = useState('');
  const [observerResults, setObserverResults] = useState<any[]>([]);
  const [observerSearching, setObserverSearching] = useState(false);
  const [escaladeTargets, setEscaladeTargets] = useState<any[]>([]);
  const [assignees, setAssignees] = useState<any[]>([]);
  const [assignTab, setAssignTab] = useState<'tech' | 'escalade'>('tech');

  // Panels latéraux
  const [showJournalPanel, setShowJournalPanel] = useState(false);

  // Edition des informations
  const [editingInfo, setEditingInfo] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [editForm, setEditForm] = useState<any>({});
  const [sites, setSites] = useState<any[]>([]);
  const [locationSearch, setLocationSearch] = useState('');
  const [locationOpen, setLocationOpen] = useState(false);

  // Resize panneau gauche/droite
  const [paneRatio, setPaneRatio] = useState<number>(() => {
    const v = localStorage.getItem('ticket-pane-ratio');
    return v ? Math.min(0.85, Math.max(0.3, parseFloat(v))) : 0.667;
  });
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartRatio = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Reformule
  const [reformulating, setReformulating] = useState(false);
  const [reformulationProposal, setReformulationProposal] = useState<string | null>(null);
  const [aiReformulationEnabled, setAiReformulationEnabled] = useState(true);

  // CC observateurs à l'envoi
  const [ccObservers, setCcObservers] = useState(false);

  // Résolution en cascade
  const [showCascadeModal, setShowCascadeModal] = useState(false);
  const [cascadeSolution, setCascadeSolution] = useState('');

  // Dictée vocale commentaire
  const [listenComment, setListenComment] = useState(false);
  const commentRecognitionRef = useRef<any>(null);

  // Tickets liés (Problème/Groupe)
  const [linkedTickets, setLinkedTickets] = useState<any[]>([]);

  // Arbitrage
  const [showArbitrageModal, setShowArbitrageModal] = useState(false);
  const arbitreAd = useADSearch(token);
  const [selectedArbitre, setSelectedArbitre] = useState<any>(null);
  const [arbitreMotif, setArbitreMotif] = useState('');
  const [arbitreSubmitting, setArbitreSubmitting] = useState(false);

  useEffect(() => {
    loadTicket(); loadGroup(); loadCategoriesAndApps(); loadSites();
    const token = localStorage.getItem('token');
    axios.get('/api/tickets/config/public', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setAiReformulationEnabled(r.data.ai_reformulation_enabled !== false))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    const id = 'ticket-html-content-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .ticket-html-content { word-break: break-word; }
      .ticket-html-content p { margin: 0 0 8px 0; }
      .ticket-html-content p:last-child { margin-bottom: 0; }
      .ticket-html-content ul, .ticket-html-content ol { margin: 0 0 8px 16px; padding: 0; }
      .ticket-html-content li { margin-bottom: 2px; }
      .ticket-html-content a { color: #2563eb; text-decoration: underline; }
      .ticket-html-content a:hover { color: #1d4ed8; }
      .ticket-html-content strong, .ticket-html-content b { font-weight: 600; }
      .ticket-html-content em, .ticket-html-content i { font-style: italic; }
      .ticket-html-content table { border-collapse: collapse; width: 100%; margin-bottom: 8px; font-size: 13px; }
      .ticket-html-content th, .ticket-html-content td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
      .ticket-html-content th { background: #f8fafc; font-weight: 600; }
      .ticket-html-content blockquote { border-left: 3px solid #cbd5e1; margin: 0 0 8px 0; padding: 4px 12px; color: #64748b; }
      .ticket-html-content img { max-width: 100%; height: auto; border-radius: 4px; }
      .ticket-html-content pre, .ticket-html-content code { background: #f1f5f9; border-radius: 4px; padding: 2px 6px; font-family: monospace; font-size: 12px; }
      .ticket-html-content pre { padding: 10px 14px; overflow-x: auto; }
      .ticket-html-content hr { border: none; border-top: 1px solid #e2e8f0; margin: 10px 0; }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get('/api/tickets/admin/glpi-url', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setGlpiTicketUrl(r.data.ticketUrl))
      .catch(() => {});
  }, []);

  async function loadCategoriesAndApps() {
    try {
      const token = localStorage.getItem('token');
      const [catRes, appRes] = await Promise.all([
        axios.get('/api/tickets/admin/categories', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/magapp/apps', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setCategories(catRes.data || []);
      setApps((appRes.data || []).filter((a: any) => a.present_magapp === 'oui'));
    } catch (e) { console.error('Failed to load categories/apps:', e); }
  }

  async function loadSites() {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/ville/sites/list', { headers: { Authorization: `Bearer ${token}` } });
      setSites(res.data || []);
    } catch (e) { console.error('Failed to load sites:', e); }
  }

  async function loadRequesterTickets(email: string) {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/tickets/requester/${encodeURIComponent(email)}?exclude_id=${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRequesterTickets(res.data);
    } catch (e) { console.error(e); }
  }

  async function loadTicket() {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [ticketRes, commentsRes, historyRes, tasksRes, observersRes, attachmentsRes] = await Promise.all([
        axios.get(`/api/tickets/${id}`, { headers }),
        axios.get(`/api/tickets/${id}/comments`, { headers }),
        axios.get(`/api/tickets/${id}/history`, { headers }),
        axios.get(`/api/tasks/by-context?source=ticket&id=${id}`, { headers }).catch(() => ({ data: [] })),
        axios.get(`/api/tickets/${id}/observers`, { headers }).catch(e => { console.error('[OBSERVERS] fetch error:', e?.response?.status, e?.message); return { data: [] }; }),
        axios.get(`/api/tickets/${id}/attachments`, { headers }).catch(() => ({ data: [] })),
      ]);
      // Load assignees in parallel
      axios.get(`/api/tickets/${id}/assignees`, { headers }).then(r => setAssignees(r.data || [])).catch(() => setAssignees([]));
      const t = ticketRes.data;
      setTicket(t);
      setEditForm({
        priority: t.priority?.id || t.priority,
        impact: t.impact?.id || t.impact,
        category_id: t.category_id?.toString() || '',
        subcategory_id: t.subcategory_id?.toString() || '',
        software_id: t.software_id?.toString() || '',
        location: t.location || ''
      });
      setLocationSearch(t.location || '');
      setComments(commentsRes.data);
      setHistory(historyRes.data);
      setTicketTasks(tasksRes.data || []);
      setObservers(observersRes.data || []);
      setAttachments(attachmentsRes.data || []);
      if (t.requester?.email) {
        loadRequesterTickets(t.requester.email);
      }
      if (String(t.type) === '3') {
        await fetchLinkedTickets();
      }
    } catch (e) {
      console.error('Failed to load ticket:', e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLinkedTickets() {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/tickets/problem/${id}/tickets`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLinkedTickets(res.data || []);
    } catch (e) { setLinkedTickets([]); }
  }

  async function loadGroup() {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/tickets/groups/by-ticket/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTicketGroup(res.data);
    } catch (e) { setTicketGroup(null); }
  }

  async function saveInfo() {
    try {
      const token = localStorage.getItem('token');
      const updateData: any = {};
      if (editForm.priority !== undefined) updateData.priority = editForm.priority;
      if (editForm.impact !== undefined) updateData.impact = editForm.impact;
      updateData.category_id = editForm.category_id ? parseInt(editForm.category_id.toString()) : null;
      updateData.subcategory_id = editForm.subcategory_id ? parseInt(editForm.subcategory_id.toString()) : null;
      updateData.software_id = editForm.software_id ? parseInt(editForm.software_id.toString()) : null;
      updateData.location = editForm.location || '';

      await axios.patch(`/api/tickets/${id}`, updateData, { headers: { Authorization: `Bearer ${token}` } });
      setEditingInfo(false);
      loadTicket();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de la sauvegarde');
    }
  }

  async function removeFromGroup(ticketIdToRemove: number) {
    if (!ticketGroup) return;
    if (!confirm(`Retirer le ticket #${ticketIdToRemove} du groupe ?`)) return;
    setGroupActionLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.delete(
        `/api/tickets/groups/${ticketGroup.id}/members/${ticketIdToRemove}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.dissolved) {
        setTicketGroup(null);
      } else {
        await loadGroup();
      }
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    finally { setGroupActionLoading(false); }
  }

  async function dissolveGroup() {
    if (!ticketGroup) return;
    if (!confirm(`Dissoudre le groupe "${ticketGroup.name}" ? Les tickets ne seront plus liés.`)) return;
    setGroupActionLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/tickets/groups/${ticketGroup.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTicketGroup(null);
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    finally { setGroupActionLoading(false); }
  }

  async function addToGroup() {
    const tid = parseInt(addTicketId);
    if (!tid || isNaN(tid)) return;
    setGroupActionLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/tickets/groups/${ticketGroup.id}/members`, { ticket_id: tid }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAddTicketId('');
      setShowAddToGroup(false);
      await loadGroup();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    finally { setGroupActionLoading(false); }
  }

  async function handleTaskStatusCycle(taskId: number, currentStatut: string) {
    const next = currentStatut === 'a_faire' ? 'en_cours' : currentStatut === 'en_cours' ? 'terminé' : 'a_faire';
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`/api/tasks/personal/${taskId}`, { statut: next }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTicketTasks(prev => prev.map(t => t.id === taskId ? { ...t, statut: next } : t));
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de la mise à jour de la tâche');
    }
  }

  async function doChangeStatus(newStatus: number, comment?: string) {
    const token = localStorage.getItem('token');
    await axios.post(`/api/tickets/${id}/status`, { status: newStatus, comment }, { headers: { Authorization: `Bearer ${token}` } });
  }

  async function handleStatusChange(newStatus: number) {
    if (newStatus === 6 && String(ticket.type) === '3') {
        const isAdminOrSupervisor = ['superadmin','admin','supervisor','superviseur'].includes((user?.role ?? '').toLowerCase().trim());
        if (!isAdminOrSupervisor) {
            alert('Seuls les superviseurs peuvent clore un ticket Problème.');
            return;
        }
    }
    if (newStatus === 3) {
      try {
        const token = localStorage.getItem('token');
        if (user?.username) {
          await axios.post(`/api/tickets/${id}/assign`, { technician_username: user.username }, { headers: { Authorization: `Bearer ${token}` } });
        }
        // Ne change le statut que si différent (évite 3→3 refusé par le backend)
        if (ticket.status?.id !== 3) {
          await doChangeStatus(3);
        }
        loadTicket();
      } catch (err: any) {
        console.error('[STATUS_CHANGE]', err.response?.status, err.response?.data, err.message);
        alert('Erreur: ' + (err.response?.data?.message || err.message || 'Erreur'));
      }
      return;
    }
    if (newStatus === 4) {
      setWaitingComment('');
      setShowWaitingModal(true);
      return;
    }
    if (newStatus === 5) {
      setSolutionText('');
      setShowSolutionModal(true);
      return;
    }
    try {
      await doChangeStatus(newStatus);
      loadTicket();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur');
    }
  }

  async function handleWaitingSubmit() {
    setShowWaitingModal(false);
    try {
      await doChangeStatus(4, waitingComment);
      loadTicket();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur');
    }
  }

  async function handleSolutionSubmit() {
    setShowSolutionModal(false);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/tickets/${id}/solution`, { solution: solutionText }, { headers: { Authorization: `Bearer ${token}` } });
      await loadTicket();
      // Proposer résolution en cascade si groupe avec d'autres tickets ou problème lié
      const groupOthers = ticketGroup?.members?.filter((m: any) => m.ticket_id !== parseInt(id || '0')) || [];
      const linked = linkedTickets.filter((t: any) => t.id !== parseInt(id || '0'));
      if (groupOthers.length > 0 || linked.length > 0) {
        setCascadeSolution(solutionText);
        setShowCascadeModal(true);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur');
    }
  }

  async function handleAddObserver(user: any) {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/tickets/${id}/observers`, {
        user_id: user.id, name: user.name, email: user.email, username: user.username
      }, { headers: { Authorization: `Bearer ${token}` } });
      setShowAddObserver(false);
      setObserverSearch('');
      setObserverResults([]);
      loadTicket();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur');
    }
  }

  async function handleRemoveObserver(userId: number) {
    if (!confirm('Retirer cet observateur ?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/tickets/${id}/observers/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      loadTicket();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur');
    }
  }

  useEffect(() => {
    if (!observerSearch || observerSearch.length < 2) { setObserverResults([]); return; }
    const timer = setTimeout(async () => {
      setObserverSearching(true);
      try {
        const token = localStorage.getItem('token');
        const [hubRes, adRes] = await Promise.all([
          axios.get(`/api/tickets/users/search?q=${encodeURIComponent(observerSearch)}`, {
            headers: { Authorization: `Bearer ${token}` }
          }).catch(() => ({ data: [] })),
          axios.get(`/api/ad/search?q=${encodeURIComponent(observerSearch)}`, {
            headers: { Authorization: `Bearer ${token}` }
          }).catch(() => ({ data: [] })),
        ]);
        const hubUsers: any[] = (hubRes.data || []).map((u: any) => ({ id: u.id, name: u.name, email: u.email, username: u.username, service: u.service }));
        const adUsers: any[] = (adRes.data || []).map((u: any) => ({ id: u.id || null, name: u.displayName, email: u.email, username: u.username, service: u.service }));
        const seen = new Set(hubUsers.map(u => u.username?.toLowerCase()));
        const merged = [...hubUsers, ...adUsers.filter(u => !seen.has(u.username?.toLowerCase()))];
        setObserverResults(merged);
      } catch { setObserverResults([]); }
      finally { setObserverSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [observerSearch]);

  function isCommentEmpty(html: string) {
    return !html || html === '<p><br></p>' || html.replace(/<[^>]*>/g, '').trim() === '';
  }

  async function uploadFileAndGetLink(): Promise<string> {
    if (!commentFile) return '';
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', commentFile);
    const res = await axios.post(`/api/tickets/${id}/attachments`, formData, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
    });
    const att = res.data;
    return `<br><a href="/api/tickets/${id}/attachments/${att.id}" target="_blank" rel="noopener noreferrer">📎 ${att.original_name}</a>`;
  }

  async function handleAddComment() {
    if (isCommentEmpty(newComment)) return;
    try {
      const token = localStorage.getItem('token');
      let content = newComment;
      if (commentFile) {
        content += await uploadFileAndGetLink();
      }
      await axios.post(`/api/tickets/${id}/comments`, {
        content,
        is_private: commentPrivate ? 1 : 0
      }, { headers: { Authorization: `Bearer ${token}` } });
      setNewComment('');
      setCommentFile(null);
      loadTicket();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur');
    }
  }

  async function handleSendToUser() {
    if (isCommentEmpty(newComment)) return;
    setSendingToUser(true);
    try {
      const token = localStorage.getItem('token');
      let content = newComment;
      if (commentFile) {
        content += await uploadFileAndGetLink();
      }
      await axios.post(`/api/tickets/${id}/comments/send`, {
        content,
        is_private: 0,
        cc_observers: ccObservers
      }, { headers: { Authorization: `Bearer ${token}` } });
      setNewComment('');
      setCommentFile(null);
      setCcObservers(false);
      loadTicket();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur envoi email');
    } finally {
      setSendingToUser(false);
    }
  }

  async function handleToggleVip() {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/tickets/${id}/vip`, {}, { headers: { Authorization: `Bearer ${token}` } });
      loadTicket();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur');
    }
  }

  async function openAssignModal() {
    try {
      const token = localStorage.getItem('token');
      const h = { Authorization: `Bearer ${token}` };
      const techRes = await axios.get('/api/tickets/admin/technicians/available', { headers: h });
      setTechnicians(techRes.data);
      try {
        const escRes = await axios.get('/api/tickets/escalade/targets', { headers: h });
        const escData = escRes.data || {};
        const agents = escData.agents || [];
        const groups = escData.groups || [];
        setEscaladeTargets([...agents, ...groups.map((g: any) => ({ ...g, target_type: 'group' }))]);
      } catch (e: any) {
        console.warn('[OPEN_ASSIGN] Escalade targets failed, continuing without them:', e.message);
        setEscaladeTargets([]);
      }
      setAssignTab('tech');
      setShowAssignModal(true);
    } catch (err: any) {
      console.error('[OPEN_ASSIGN]', err.response?.status, err.response?.data, err.message);
      alert('Erreur chargement techniciens: ' + (err.response?.data?.message || err.message || 'Erreur'));
    }
  }

  async function assignTechnician(userId: number) {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/tickets/${id}/assign`, { technician_id: userId }, { headers: { Authorization: `Bearer ${token}` } });
      setShowAssignModal(false);
      loadTicket();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Erreur inconnue';
      const status = err.response?.status;
      console.error('[ASSIGN] Error:', status, msg, err);
      alert(`Erreur assignation (${status || '?'}): ${msg}`);
    }
  }

  function startDrag(e: React.MouseEvent) {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartRatio.current = paneRatio;
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current || !bodyRef.current) return;
      const totalW = bodyRef.current.offsetWidth;
      if (!totalW) return;
      const dx = ev.clientX - dragStartX.current;
      const newRatio = Math.min(0.85, Math.max(0.3, dragStartRatio.current + dx / totalW));
      setPaneRatio(newRatio);
    };
    const onUp = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const totalW = bodyRef.current?.offsetWidth || 1;
      const dx = ev.clientX - dragStartX.current;
      const newRatio = Math.min(0.85, Math.max(0.3, dragStartRatio.current + dx / totalW));
      localStorage.setItem('ticket-pane-ratio', String(newRatio));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function toggleCommentDictation() {
    if (listenComment) {
      commentRecognitionRef.current?.stop();
      setListenComment(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Dictée vocale non supportée par ce navigateur'); return; }
    const rec = new SR();
    rec.lang = 'fr-FR';
    rec.continuous = true;
    rec.interimResults = false;
    commentRecognitionRef.current = rec;
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).slice(e.resultIndex).map((r: any) => r[0].transcript).join(' ');
      setNewComment(prev => {
        if (!prev || prev === '<p><br></p>') return '<p>' + t + '</p>';
        if (prev.endsWith('</p>')) return prev.slice(0, -4) + ' ' + t + '</p>';
        return prev + ' ' + t;
      });
    };
    rec.onend = () => setListenComment(false);
    rec.onerror = () => setListenComment(false);
    rec.start();
    setListenComment(true);
  }

  async function handleReformulate() {
    const plainText = newComment.replace(/<[^>]*>/g, '').trim();
    if (!plainText) return;
    setReformulating(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/tickets/ai/reformulate', { text: plainText }, { headers: { Authorization: `Bearer ${token}` } });
      setReformulationProposal(res.data.result);
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de la reformulation');
    } finally {
      setReformulating(false);
    }
  }

  async function handleArbitrage() {
    if (!selectedArbitre || !arbitreMotif.trim()) return;
    setArbitreSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      if (ticket.status?.id !== 4) {
        await doChangeStatus(4, arbitreMotif);
      }
      await axios.post('/api/tasks', {
        description: `Arbitrage : ${arbitreMotif}`,
        assignees: [selectedArbitre.username],
        context_source: 'ticket',
        context_id: parseInt(id || '0'),
        statut: 'a_faire'
      }, { headers: { Authorization: `Bearer ${token}` } });
      setShowArbitrageModal(false);
      arbitreAd.setQuery('');
      arbitreAd.clearResults();
      setSelectedArbitre(null);
      setArbitreMotif('');
      loadTicket();
    } catch (e: any) {
      alert(e.response?.data?.message || "Erreur lors de la création de la demande d'arbitrage");
    } finally {
      setArbitreSubmitting(false);
    }
  }

  async function handleCascadeResolve() {
    if (!id) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/tickets/${id}/resolve`,
        { solution: cascadeSolution, auto_resolve_linked: true },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowCascadeModal(false);
      loadTicket();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de la résolution');
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#64748b', fontFamily: 'system-ui, sans-serif' }}>Chargement...</div>;
  if (!ticket) return <div style={{ textAlign: 'center', padding: 60, color: '#ef4444', fontFamily: 'system-ui, sans-serif' }}>Ticket non trouvé</div>;

  const transitions = VALID_TRANSITIONS[ticket.status?.id] || [];

  function getInitials(name: string) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return (parts[0][0] || '?').toUpperCase();
    return ((parts[0][0] || '') + (parts[parts.length - 1][0] || '')).toUpperCase();
  }
  function avatarColor(name: string) {
    const palette = ['#6366f1','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#10b981','#3b82f6','#f97316'];
    if (!name) return palette[0];
    let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return palette[Math.abs(h) % palette.length];
  }

   const SL: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 80, flexShrink: 0 };
   const SF: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #f4f4f5', padding: '6px 0' };
   const SV: React.CSSProperties = { fontSize: 12, color: '#18181b', fontWeight: 600 };

  return (
    <>
      {!isEmbedded && <Header />}
      <div style={{
        display: 'flex', flexDirection: 'column',
        height: isEmbedded ? '100vh' : 'calc(100vh - 80px)',
        background: '#fafaf9',
        fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif',
        overflow: 'hidden', fontSize: 13, color: '#18181b'
      }}>

        {/* ── TOPBAR ── */}
        <div style={{
          height: 46, flexShrink: 0,
          borderBottom: '1px solid #f4f4f5', background: '#fff',
          display: 'flex', alignItems: 'center', padding: '0 20px', gap: 8
        }}>
          {!isEmbedded && (<a href="/tickets" title="Retour aux tickets" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#dc2626', textDecoration: 'none', fontSize: 13, fontWeight: 600, padding: '2px 8px', borderRadius: 5, border: '1px solid #fca5a5', background: '#fef2f2' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            Accueil
          </a>)}
          {!isEmbedded && <span style={{ color: '#d4d4d8', fontSize: 16 }}>·</span>}
          <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#6366f1' }}>#{ticket.id}</span>
          {glpiTicketUrl && (
            <a href={`${glpiTicketUrl}${ticket.id}`} target="_blank" rel="noopener noreferrer"
              title="Ouvrir dans GLPI"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#a1a1aa', textDecoration: 'none', padding: '2px 6px', border: '1px solid #e4e4e7', borderRadius: 5 }}>
              GLPI
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={handleToggleVip}
            title={ticket.is_vip ? 'Retirer le statut VIP' : 'Marquer comme VIP'}
            style={{ padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, border: ticket.is_vip ? '1px solid #fde68a' : '1px solid #e4e4e7', background: ticket.is_vip ? '#fef3c7' : 'transparent', color: ticket.is_vip ? '#92400e' : '#71717a' }}>
            {ticket.is_vip ? '⭐ VIP' : '☆ VIP'}
          </button>
          <button onClick={() => loadTicket()} title="Rafraîchir"
            style={{ padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 14, border: '1px solid #e4e4e7', background: 'transparent', color: '#71717a' }}>↻</button>
          <button onClick={openAssignModal}
            style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e4e4e7', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#18181b' }}>
            Assigner
          </button>
          <button onClick={() => setShowTaskModal(true)}
            style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e4e4e7', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#18181b' }}>
            📋 Tâche
          </button>
          {transitions.length > 0 && (
            <>
              <span style={{ color: '#e4e4e7', fontSize: 18, margin: '0 2px' }}>|</span>
              {transitions.map(t => (
                <button key={t.to} onClick={() => handleStatusChange(t.to)}
                  style={{ padding: '5px 13px', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12, color: '#fff', background: t.color, whiteSpace: 'nowrap' }}>
                  {t.label}
                </button>
              ))}
            </>
          )}
        </div>

        {/* ── TITLE AREA ── */}
        <div style={{ flexShrink: 0, padding: '11px 20px 10px', borderBottom: '1px solid #f4f4f5', background: '#fff' }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: '#18181b', margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', lineHeight: 1.4 }}>
            {ticket.is_vip && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', padding: '2px 7px', borderRadius: 10, flexShrink: 0 }}>⭐ VIP</span>
            )}
            <span>{ticket.title}</span>
            {ticket.category_name && (
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#f1f5f9', color: '#64748b', flexShrink: 0 }}>
                {ticket.category_name}{ticket.subcategory_name ? ` / ${ticket.subcategory_name}` : ''}
              </span>
            )}
            {ticket.software_name && (
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#f0fdf4', color: '#16a34a', flexShrink: 0 }}>
                💾 {ticket.software_name}
              </span>
            )}
            {/* Pills inline avec le titre */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
              padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: (STATUS_COLORS[ticket.status?.id] || '#64748b') + '18',
              color: STATUS_COLORS[ticket.status?.id] || '#64748b',
              cursor: ticket.status?.id === 4 && ticket.waiting_reason ? 'help' : 'default'
            }} title={ticket.status?.id === 4 && ticket.waiting_reason ? `Motif : ${ticket.waiting_reason}` : undefined}>
              {ticket.status?.label || 'Inconnu'}
              {ticket.status?.id === 4 && ticket.waiting_reason && <span style={{ fontSize: 10, opacity: 0.75 }}>💬</span>}
            </span>
            <span style={{
              display: 'inline-block', flexShrink: 0,
              padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: (PRIORITY_COLORS[ticket.priority?.id] || '#64748b') + '18',
              color: PRIORITY_COLORS[ticket.priority?.id] || '#64748b'
            }}>
              {ticket.priority?.label || 'Normale'}
            </span>
            <span style={{
              display: 'inline-block', flexShrink: 0,
              padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
              background: String(ticket.type) === '3' ? '#ede9fe' : String(ticket.type) === '2' ? '#e0f2fe' : '#fef3c7',
              color: String(ticket.type) === '3' ? '#7c3aed' : String(ticket.type) === '2' ? '#0369a1' : '#92400e'
            }}>
              {ticket.type_label || 'Incident'}
            </span>
          </h1>
        </div>

        {/* ── BODY ── */}
        <div ref={bodyRef} style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* ── LEFT PANE ── */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', width: `${paneRatio * 100}%`, flexShrink: 0, background: '#fff' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>

            {/* DESCRIPTION */}
            <div style={{ borderBottom: '1px solid #f4f4f5', paddingBottom: 20 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', padding: '16px 0 8px' }}>Description</span>
              {ticket.content
                ? <div className="ticket-html-content" style={{ fontSize: 13, color: '#3f3f46', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: decodeHtml(ticket.content) }} />
                : <p style={{ fontSize: 13, color: '#a1a1aa', margin: 0, fontStyle: 'italic' }}>Aucune description</p>
              }
            </div>

            {/* PROBLÈME */}
            {String(ticket.type) === '3' && (
              <div style={{ borderBottom: '1px solid #f4f4f5', paddingBottom: 20 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', padding: '16px 0 8px' }}>Ticket Problème</span>
                <div style={{ background: '#faf5ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: 14 }}>
                  <h4 style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed', margin: '0 0 6px' }}>Méthode de résolution</h4>
                  {ticket.resolution_method
                    ? <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{ticket.resolution_method}</p>
                    : <p style={{ fontSize: 12, color: '#a1a1aa', margin: 0, fontStyle: 'italic' }}>Non définie</p>
                  }
                  {ticket.knowledge_article && (
                    <div style={{ marginTop: 12 }}>
                      <h4 style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed', margin: '0 0 6px' }}>Article de connaissance</h4>
                      <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{ticket.knowledge_article}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SOLUTION */}
            {ticket.solution && (
              <div style={{ borderBottom: '1px solid #f4f4f5', paddingBottom: 20 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', padding: '16px 0 8px' }}>Solution</span>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: decodeHtml(ticket.solution) }} />
                </div>
              </div>
            )}


            {/* TÂCHES */}
            <div style={{ borderBottom: '1px solid #f4f4f5', paddingBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0 8px' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Tâches{ticketTasks.length > 0 ? ` (${ticketTasks.length})` : ''}
                </span>
                <button onClick={() => setShowTaskModal(true)}
                  style={{ padding: '3px 10px', border: '1px dashed #c7d2fe', borderRadius: 6, background: 'transparent', color: '#6366f1', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
                  + Ajouter
                </button>
              </div>
              {ticketTasks.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {ticketTasks.map((task: any) => {
                    const statut = task.statut || 'a_faire';
                    const done = statut === 'terminé';
                    const inprog = statut === 'en_cours';
                    return (
                      <div key={task.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 7,
                        background: done ? '#f0fdf4' : '#fff',
                        border: `1px solid ${done ? '#bbf7d0' : '#f4f4f5'}`,
                        opacity: done ? 0.75 : 1
                      }}>
                        <button onClick={() => handleTaskStatusCycle(task.id, statut)}
                          style={{
                            flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
                            border: `2px solid ${done ? '#22c55e' : inprog ? '#3b82f6' : '#d4d4d8'}`,
                            background: done ? '#22c55e' : inprog ? '#dbeafe' : 'transparent',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 0, color: '#fff', fontSize: 9
                          }}>
                          {done ? '✓' : inprog ? '⟳' : ''}
                        </button>
                        <span style={{ flex: 1, fontSize: 13, color: done ? '#94a3b8' : '#18181b', textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {task.description}
                        </span>
                        {task.username && <span style={{ fontSize: 11, color: '#a1a1aa', flexShrink: 0 }}>{task.username}</span>}
                        {task.echeance && (
                          <span style={{ fontSize: 11, color: new Date(task.echeance) < new Date() && !done ? '#ef4444' : '#a1a1aa', flexShrink: 0 }}>
                            📅 {new Date(task.echeance).toLocaleDateString('fr-FR')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: '#a1a1aa', fontStyle: 'italic', margin: '0 0 4px' }}>Aucune tâche</p>
              )}
            </div>

            {/* ACTIVITÉ */}
            <div>
              <div style={{ padding: '16px 0 8px' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Activité{comments.length > 0 ? ` (${comments.length})` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {comments.map((c: any, i: number) => {
                  const requesterEmails = [
                    ticket?.requester?.email,
                    ticket?.email_alt,
                    ticket?.requester_email_22,
                  ].filter(Boolean).map((e: string) => e.toLowerCase());
                  const isFromRequester = c.author_email && requesterEmails.includes(c.author_email.toLowerCase());
                  const isSentToUser = c.sent_to_user === 1 || c.sent_to_user === true;

                  // Sent-to-user: blue tint; requester reply: green tint; private: yellow; normal: grey
                  const bgColor = (isSentToUser || isFromRequester) ? '#f0fdf4' : c.is_private ? '#fffbeb' : '#f9f9fb';
                  const borderColor = (isSentToUser || isFromRequester) ? '#bbf7d0' : c.is_private ? '#fde68a' : '#f4f4f5';

                  return (
                    <div key={c.id || i} style={{ display: 'flex', gap: 10, marginLeft: isFromRequester ? 20 : 0 }}>
                      <div style={{
                        flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                        background: isFromRequester ? '#16a34a' : isSentToUser ? '#2563eb' : avatarColor(c.author_name || ''),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: '#fff'
                      }}>{isFromRequester ? '↩' : getInitials(c.author_name || '')}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#18181b' }}>{c.author_name || 'Inconnu'}</span>
                          {isSentToUser && <span style={{ fontSize: 10, color: '#1d4ed8', background: '#dbeafe', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>✉️ Envoyé</span>}
                          {isFromRequester && <span style={{ fontSize: 10, color: '#15803d', background: '#dcfce7', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>↩ Réponse</span>}
                          {c.is_private && <span style={{ fontSize: 10, color: '#d97706', background: '#fef3c7', padding: '1px 5px', borderRadius: 8, fontWeight: 600 }}>🔒 Interne</span>}
                          <span style={{ fontSize: 11, color: '#a1a1aa', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                            {c.date_creation ? new Date(c.date_creation).toLocaleString('fr-FR') : ''}
                          </span>
                        </div>
                        <div style={{
                          fontSize: 13, color: '#3f3f46', lineHeight: 1.5,
                          background: bgColor,
                          border: `1px solid ${borderColor}`,
                          borderRadius: 8, padding: '8px 12px'
                        }} dangerouslySetInnerHTML={{ __html: decodeHtml(c.content) }} />
                      </div>
                    </div>
                  );
                })}
                {comments.length === 0 && <p style={{ fontSize: 12, color: '#a1a1aa', fontStyle: 'italic', margin: 0 }}>Aucun commentaire</p>}
              </div>
            </div>
          </div>
          {/* end scrollable content */}

          {/* ── REPLY BAR (inside left pane) ── */}
          <div style={{ flexShrink: 0, borderTop: '1px solid #f4f4f5', background: '#fff', padding: '10px 20px' }}>
            {/* Reformulation proposal */}
            {reformulationProposal !== null && (
              <div style={{ marginBottom: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#15803d', marginBottom: 6 }}>✨ Proposition de reformulation :</div>
                <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{reformulationProposal}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { setNewComment(reformulationProposal); setReformulationProposal(null); }}
                    style={{ padding: '4px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                    ✓ Accepter
                  </button>
                  <button onClick={() => setReformulationProposal(null)}
                    style={{ padding: '4px 12px', background: 'transparent', color: '#6b7280', border: '1px solid #e4e4e7', borderRadius: 5, cursor: 'pointer', fontSize: 11 }}>
                    ✕ Ignorer
                  </button>
                </div>
              </div>
            )}
            <div style={{ border: '1px solid #e4e4e7', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
              <ReactQuill value={newComment} onChange={setNewComment} placeholder="Ajouter un commentaire..."
                modules={{ toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link'], ['clean']] }}
                style={{ fontFamily: 'inherit', fontSize: 13 }}
              />
            </div>
            {commentFile && (
              <div style={{ marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#71717a', background: '#f9f9fb', padding: '3px 8px', borderRadius: 5, border: '1px solid #f4f4f5' }}>
                <span>📎 {commentFile.name}</span>
                <button onClick={() => setCommentFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: 0, fontSize: 13 }}>✕</button>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, color: '#71717a', cursor: 'pointer' }}>
                  <input type="checkbox" checked={commentPrivate} onChange={e => setCommentPrivate(e.target.checked)} />
                  Interne
                </label>
                {ticket.requester?.email && !commentPrivate && observers.length > 0 && (
                  <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, color: '#71717a', cursor: 'pointer' }}>
                    <input type="checkbox" checked={ccObservers} onChange={e => setCcObservers(e.target.checked)} />
                    CC observateurs
                  </label>
                )}
                <button onClick={() => fileInputRef.current?.click()} title="Joindre un fichier"
                  style={{ background: 'none', border: '1px solid #e4e4e7', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#71717a', display: 'flex', alignItems: 'center', gap: 3 }}>
                  📎 Fichier
                </button>
                <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                  onChange={e => setCommentFile(e.target.files?.[0] || null)}
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.zip,.txt" />
                <button onClick={toggleCommentDictation}
                  title={listenComment ? 'Arrêter la dictée' : 'Dictée vocale'}
                  style={{ background: listenComment ? '#fef2f2' : 'none', border: `1px solid ${listenComment ? '#fca5a5' : '#e4e4e7'}`, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: listenComment ? '#dc2626' : '#71717a', display: 'flex', alignItems: 'center', gap: 3 }}>
                  🎤 {listenComment ? 'Arrêter' : 'Dicter'}
                </button>
                {aiReformulationEnabled && (
                  <button onClick={handleReformulate} disabled={isCommentEmpty(newComment) || reformulating}
                    title="Reformuler avec l'IA"
                    style={{ background: 'none', border: '1px solid #e4e4e7', borderRadius: 5, padding: '3px 8px', cursor: isCommentEmpty(newComment) ? 'default' : 'pointer', fontSize: 11, color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 3, opacity: isCommentEmpty(newComment) ? 0.4 : 1 }}>
                    {reformulating ? '⏳' : '✨'} Reformuler
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                {ticket.requester?.email && !commentPrivate && (
                  <button onClick={handleSendToUser} disabled={isCommentEmpty(newComment) || sendingToUser}
                    title={`Envoyer par email à ${ticket.requester.email}`}
                    style={{ padding: '6px 14px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: 'pointer', opacity: isCommentEmpty(newComment) || sendingToUser ? 0.5 : 1 }}>
                    {sendingToUser ? 'Envoi...' : '✉️ Enregistrer & envoyer'}
                  </button>
                )}
                <button onClick={handleAddComment} disabled={isCommentEmpty(newComment)}
                  style={{ padding: '6px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: 'pointer', opacity: isCommentEmpty(newComment) ? 0.5 : 1 }}>
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
          </div>
          {/* end left pane */}

          {/* ── DRAG HANDLE ── */}
          <div onMouseDown={startDrag} style={{
            width: 5, flexShrink: 0, cursor: 'col-resize', background: 'transparent',
            borderLeft: '1px solid #f4f4f5', borderRight: '1px solid #f4f4f5',
            transition: 'background 0.15s'
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#e0e7ff')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          />

          {/* ── RIGHT SIDEBAR ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 20px', minWidth: 0, background: '#fff' }}>

            {/* Sidebar top bar: Edit + Journal */}
            <div style={{ padding: '10px 0 8px', borderBottom: '1px solid #f4f4f5', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {/* Journal button */}
              <button onClick={() => { setShowJournalPanel(v => !v); }}
                style={{
                  padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  border: showJournalPanel ? '1px solid #a5b4fc' : '1px solid #e4e4e7',
                  background: showJournalPanel ? '#eef2ff' : 'transparent',
                  color: showJournalPanel ? '#4f46e5' : '#71717a',
                  display: 'flex', alignItems: 'center', gap: 4
                }}>
                📋 Journal
                {history.length > 0 && (
                  <span style={{ background: '#a1a1aa', color: '#fff', borderRadius: 10, fontSize: 9, padding: '0 4px', lineHeight: '14px' }}>
                    {history.length}
                  </span>
                )}
              </button>
              <div style={{ flex: 1 }} />
              <button onClick={() => { setShowArbitrageModal(true); setSelectedArbitre(null); arbitreAd.setQuery(''); setArbitreMotif(''); }}
                style={{ padding: '3px 9px', background: 'transparent', border: '1px solid #fbbf24', borderRadius: 6, color: '#b45309', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                ⚖️ Arbitrage
              </button>
              {!editingInfo ? (
                <button onClick={() => { 
                  setEditingInfo(true); 
                  setEditForm({ 
                    priority: ticket.priority?.id || ticket.priority, 
                    impact: ticket.impact?.id || ticket.impact, 
                    category_id: ticket.category_id?.toString() || '', 
                    subcategory_id: ticket.subcategory_id?.toString() || '', 
                    software_id: ticket.software_id?.toString() || '',
                    location: ticket.location || ''
                  }); 
                  setLocationSearch(ticket.location || '');
                }}
                  style={{ padding: '3px 9px', background: 'transparent', border: '1px solid #e4e4e7', borderRadius: 6, color: '#6366f1', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  ✏️ Éditer
                </button>
              ) : (
                <>
                  <button onClick={saveInfo} style={{ padding: '3px 9px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✓</button>
                  <button onClick={() => setEditingInfo(false)} style={{ padding: '3px 9px', background: 'transparent', border: '1px solid #e4e4e7', color: '#ef4444', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>✕</button>
                </>
              )}
            </div>

            {/* STATUT */}
            <div style={SF}>
              <span style={SL}>Statut</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: (STATUS_COLORS[ticket.status?.id] || '#64748b') + '18', color: STATUS_COLORS[ticket.status?.id] || '#64748b', flexShrink: 0 }}>
                  {ticket.status?.label || 'Inconnu'}
                </span>
                {ticket.status?.id === 4 && ticket.waiting_reason && (
                  <span style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4, padding: '2px 6px', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                    💬 {ticket.waiting_reason}
                  </span>
                )}
              </div>
            </div>

            {/* PRIORITÉ + IMPACT */}
            <div style={SF}>
              <span style={SL}>Priorité</span>
              {editingInfo ? (
                <select value={editForm.priority || 3} onChange={e => setEditForm({...editForm, priority: parseInt(e.target.value)})}
                  style={{ padding: '4px 6px', border: '1px solid #e4e4e7', borderRadius: 5, fontSize: 11, background: '#fff' }}>
                  <option value={2}>Basse</option><option value={3}>Normale</option><option value={4}>Haute</option><option value={5}>Très haute</option>
                </select>
              ) : (
                <span style={{ padding: '2px 7px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: (PRIORITY_COLORS[ticket.priority?.id] || '#64748b') + '18', color: PRIORITY_COLORS[ticket.priority?.id] || '#64748b' }}>
                  {ticket.priority?.label || 'Normale'}
                </span>
              )}
              <span style={SL}>Impact</span>
              {editingInfo ? (
                <select value={editForm.impact || 2} onChange={e => setEditForm({...editForm, impact: parseInt(e.target.value)})}
                  style={{ padding: '4px 6px', border: '1px solid #e4e4e7', borderRadius: 5, fontSize: 11, background: '#fff' }}>
                  <option value={2}>1 utilisateur</option><option value={3}>Groupe de travail</option><option value={4}>Service / Direction</option><option value={5}>Global</option>
                </select>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#3f3f46' }}>
                  {ticket.impact?.id && IMPACT_INFO[ticket.impact.id] ? `${IMPACT_INFO[ticket.impact.id].icon} ${IMPACT_INFO[ticket.impact.id].label}` : '—'}
                </span>
              )}
            </div>

            {/* ASSIGNÉ */}
            <div style={SF}>
              <span style={SL}>Assigné</span>
              {assignees.length > 0 && assignees[0].group_name ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff' }}>👥</div>
                  <div>
                    <span style={{ ...SV, fontWeight: 600 }}>{assignees[0].group_name}</span>
                    <span style={{ fontSize: 10, color: '#71717a', marginLeft: 6 }}>{assignees.length} membre{assignees.length > 1 ? 's' : ''}</span>
                  </div>
                </div>
              ) : assignees.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: avatarColor(assignees[0].technician_name || '?'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>{getInitials(assignees[0].technician_name || '?')}</div>
                  <span style={SV}>{assignees[0].technician_name || '?'}</span>
                </div>
              ) : ticket.technician_name ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: avatarColor(ticket.technician_name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>{getInitials(ticket.technician_name)}</div>
                  <span style={SV}>{ticket.technician_name}</span>
                </div>
              ) : (
                <span style={{ fontSize: 12, color: '#a1a1aa', fontStyle: 'italic' }}>Non assigné</span>
              )}
            </div>

            {/* CATÉGORIE */}
            <div style={SF}>
              <span style={SL}>Catégorie</span>
              {editingInfo ? (
                <select value={editForm.category_id || ''} onChange={e => setEditForm({...editForm, category_id: e.target.value, subcategory_id: ''})}
                  style={{ padding: '5px 7px', border: '1px solid #e4e4e7', borderRadius: 6, fontSize: 12, background: '#fff', width: '100%', maxWidth: 180 }}>
                  <option value="">— Non défini —</option>
                  {categories.filter(c => !c.parent_id).map(c => <option key={c.id} value={c.id.toString()}>{c.name}</option>)}
                </select>
              ) : (
                <span style={SV}>{ticket.category_name || '—'}</span>
              )}
            </div>

            {/* SOUS-CATÉGORIE */}
            {(editForm.category_id || ticket.subcategory_id) ? (
              <div style={SF}>
                <span style={SL}>Sous-catégorie</span>
                {editingInfo ? (
                  <select value={editForm.subcategory_id || ''} onChange={e => setEditForm({...editForm, subcategory_id: e.target.value})}
                    disabled={!editForm.category_id}
                    style={{ padding: '5px 7px', border: '1px solid #e4e4e7', borderRadius: 6, fontSize: 12, background: '#fff', opacity: !editForm.category_id ? 0.5 : 1, width: '100%', maxWidth: 180 }}>
                    <option value="">— Non défini —</option>
                    {categories.filter(c => c.parent_id === parseInt(editForm.category_id || '0')).map(c => <option key={c.id} value={c.id.toString()}>{c.name}</option>)}
                  </select>
                ) : (
                  <span style={SV}>{ticket.subcategory_name || '—'}</span>
                )}
              </div>
            ) : null}

            {/* LOGICIEL */}
            {(editForm.software_id || ticket.software_id || (editingInfo && editForm.category_id && categories.find(c => c.id === parseInt(editForm.category_id || '0'))?.name.toLowerCase().includes('logiciel'))) ? (
              <div style={SF}>
                <span style={SL}>Logiciel</span>
                {editingInfo ? (
                  <select value={editForm.software_id || ''} onChange={e => setEditForm({...editForm, software_id: e.target.value})}
                    style={{ padding: '5px 7px', border: '1px solid #e4e4e7', borderRadius: 6, fontSize: 12, background: '#fff', width: '100%', maxWidth: 180 }}>
                    <option value="">— Non défini —</option>
                    {apps.map(a => <option key={a.id} value={a.id.toString()}>{a.name}</option>)}
                  </select>
                ) : (
                  <span style={SV}>{ticket.software_name || '—'}</span>
                )}
              </div>
            ) : null}

            {/* DEMANDEUR */}
            <div style={SF}>
              <span style={SL}>Demandeur</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: ticket.requester?.email ? 4 : 0 }}>
                <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: avatarColor(ticket.requester?.name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>{getInitials(ticket.requester?.name || '')}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.requester?.name || 'Anonyme'}</div>
                  {ticket.requester?.email && (
                    <a href={`mailto:${ticket.requester.email}`} style={{ fontSize: 11, color: '#6366f1', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.requester.email}</a>
                  )}
                </div>
              </div>
              {ticket.requester?.email && requesterTickets && (
                <div>
                  <span onClick={() => setShowRequesterTickets(!showRequesterTickets)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: requesterTickets.count > 0 ? 'pointer' : 'default', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: requesterTickets.count > 0 ? '#fef2f2' : '#f0fdf4', color: requesterTickets.count > 0 ? '#dc2626' : '#16a34a' }}>
                    {requesterTickets.count > 0 ? '🔴' : '🟢'} {requesterTickets.count} ticket(s)
                  </span>
                  {showRequesterTickets && requesterTickets.tickets.length > 0 && (
                    <div style={{ marginTop: 5, border: '1px solid #f4f4f5', borderRadius: 6, overflow: 'hidden' }}>
                      {requesterTickets.tickets.map((t: any) => (
                        <div key={t.id} onClick={() => window.location.href = `/tickets/${t.id}`}
                          style={{ padding: '5px 8px', cursor: 'pointer', borderBottom: '1px solid #f9f9fb', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f9f9fb'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#6366f1', flexShrink: 0 }}>#{t.id}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#18181b' }}>{t.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SOURCE */}
            <div style={SF}>
              <span style={SL}>Source</span>
              <span style={SV}>
                {(ticket.source === 'glpi')
                  ? <span style={{ color: '#6366f1', fontWeight: 600 }}>GLPI</span>
                  : ticket.source === 'email' || ticket.source === 'mail'
                    ? <span style={{ color: '#16a34a', fontWeight: 600 }}>Email</span>
                    : ticket.source === 'magapp'
                      ? <span style={{ color: '#d946ef', fontWeight: 600 }}>Magapp</span>
                      : ticket.source === 'hub'
                        ? <span style={{ color: '#64748b', fontWeight: 600 }}>Hub</span>
                        : ticket.source
                          ? <span>{ticket.source}</span>
                          : <span style={{ color: '#94a3b8' }}>—</span>
                }
              </span>
            </div>

            {/* LIEU */}
            <div style={SF}>
              <span style={SL}>Lieu</span>
              {editingInfo ? (
                <div style={{ position: 'relative', width: '100%', maxWidth: 180 }}>
                  <input value={locationSearch} 
                    onChange={e => { setLocationSearch(e.target.value); setEditForm({...editForm, location: e.target.value}); setLocationOpen(true); }}
                    onFocus={() => setLocationOpen(true)}
                    onBlur={() => setTimeout(() => setLocationOpen(false), 200)}
                    placeholder="Chercher..."
                    style={{ width: '100%', padding: '5px 8px', border: '1px solid #e4e4e7', borderRadius: 6, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                  {locationOpen && sites.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '1px solid #e4e4e7', borderRadius: 6, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto' }}>
                      {sites.filter(s => (s.nom||'').toLowerCase().includes(locationSearch.toLowerCase()) || (s.code_bien||'').toLowerCase().includes(locationSearch.toLowerCase())).slice(0, 20).map(s => (
                        <div key={s.id} onMouseDown={() => { const l = s.code_bien ? `${s.code_bien} — ${s.nom}` : s.nom; setEditForm({...editForm, location: l}); setLocationSearch(l); setLocationOpen(false); }}
                          style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f4f4f5', fontSize: 11 }}>
                          {s.code_bien} — {s.nom}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span style={{ ...SV, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>📍</span>
                  <span>{ticket.location || 'Non renseigné'}</span>
                </span>
              )}
            </div>

            {/* PIÈCES JOINTES */}
            {attachments.length > 0 && (
              <div style={SF}>
                <span style={SL}>Pièces jointes ({attachments.length})</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  {attachments.map((att: any) => (
                    <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {att.is_image ? (
                        <a href={`/api/tickets/${id}/attachments/${att.id}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6366f1', textDecoration: 'none' }}>
                          <span>🖼️</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{att.original_name || att.filename}</span>
                        </a>
                      ) : (
                        <a href={`/api/tickets/${id}/attachments/${att.id}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6366f1', textDecoration: 'none' }}>
                          <span>📎</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{att.original_name || att.filename}</span>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CRÉÉ LE */}
            <div style={SF}>
              <span style={SL}>Créé le</span>
              <span style={SV}>{ticket.date_creation ? new Date(ticket.date_creation).toLocaleString('fr-FR') : '—'}</span>
              {ticket.active_days != null && (
                <span style={{ fontSize: 11, fontWeight: 600, color: ticket.active_days > 7 ? '#dc2626' : ticket.active_days > 3 ? '#f59e0b' : '#16a34a', marginLeft: 'auto' }}>
                  {ticket.active_days > 1 ? `${Math.round(ticket.active_days)}j` : ticket.active_days === 1 ? '1j' : '<1j'}
                </span>
              )}
            </div>

            {/* OBSERVATEURS */}
            <div style={{ borderBottom: '1px solid #f4f4f5', padding: '10px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={SL}>Observateurs ({observers.length})</span>
                <button onClick={() => setShowAddObserver(!showAddObserver)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 11, fontWeight: 600, padding: 0 }}>+ Ajouter</button>
              </div>
              {observers.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {observers.map(o => (
                    <div key={o.user_id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                      <span style={{ color: '#3f3f46', flex: 1 }}>{o.display_name || o.name || o.login || o.email || `#${o.user_id}`}</span>
                      <span onClick={() => handleRemoveObserver(o.user_id)} style={{ cursor: 'pointer', color: '#a1a1aa', fontSize: 14 }}>×</span>
                    </div>
                  ))}
                </div>
              )}
              {showAddObserver && (
                <div style={{ marginTop: 6 }}>
                  <input value={observerSearch} onChange={e => setObserverSearch(e.target.value)} placeholder="Rechercher..."
                    style={{ width: '100%', padding: '5px 8px', border: '1px solid #e4e4e7', borderRadius: 5, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                  {observerSearching && <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 3 }}>Recherche...</div>}
                  {observerResults.length > 0 && (
                    <div style={{ marginTop: 3, border: '1px solid #f4f4f5', borderRadius: 5, overflow: 'hidden' }}>
                      {observerResults.filter(u => !observers.some(o => (o.login || '').toLowerCase() === (u.username || '').toLowerCase())).map(u => (
                        <div key={u.username || u.email || u.id} onClick={() => handleAddObserver(u)}
                          style={{ padding: '5px 8px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f9f9fb', display: 'flex', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontWeight: 500 }}>{u.name}</div>
                            <div style={{ fontSize: 10, color: '#71717a' }}>{u.email}{u.service ? ` · ${u.service}` : ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {observerSearch.length >= 2 && observerResults.length === 0 && !observerSearching && (
                    <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 3 }}>Aucun utilisateur trouvé</div>
                  )}
                </div>
              )}
            </div>
            {/* GROUPES & ASSOCIATIONS */}
            <div style={{ borderBottom: '1px solid #f4f4f5', padding: '10px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Associations</div>
              
              {/* Groupe */}
              {ticketGroup && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    🔗 Groupe : {ticketGroup.name}
                    <span style={{ background: '#e4e4e7', borderRadius: 10, fontSize: 10, padding: '0 5px', marginLeft: 5, color: '#52525b' }}>{ticketGroup.members?.length || ''}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {(ticketGroup.members || []).map((m: any) => (
                        <div key={m.ticket_id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                           <a href={`/tickets/${m.ticket_id}`} style={{ color: '#6366f1', textDecoration: 'none' }}>#{m.ticket_id}</a>
                           <span style={{ color: '#374151' }}>{m.title || 'Sans titre'}</span>
                           <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>({m.requester_name || 'Anonyme'})</span>
                        </div>
                      ))}
                  </div>
                  
                  {/* Transformer en problème (Si groupe mais pas problème lié) */}
                  {!ticketGroup.problem_ticket_id && String(ticket.type) !== '3' && (
                    <button onClick={() => setShowProblemModal(true)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontSize: 11, fontWeight: 600, padding: '4px 0', textDecoration: 'underline' }}>
                        ⚠️ Transformer en problème
                    </button>
                  )}
                </div>
              )}

              {/* Problème */}
              {String(ticket.type) === '3' ? (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed', marginBottom: 4 }}>⚠️ Tickets liés à ce problème</div>
                  {linkedTickets.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {linkedTickets.map(t => (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                           <a href={`/tickets/${t.id}`} style={{ color: '#6366f1', textDecoration: 'none' }}>#{t.id}</a>
                           <span style={{ color: '#374151' }}>{t.title}</span>
                           <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>({t.requester_name || 'Anonyme'})</span>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ fontSize: 11, color: '#a1a1aa', fontStyle: 'italic' }}>Aucun ticket lié</div>}
                </div>
              ) : !ticketGroup ? (
                /* Associer à un problème */
                <button onClick={() => setShowAssociateProblemModal(true)} style={{ background: 'none', border: '1px dashed #c4b5fd', borderRadius: 6, padding: '4px 8px', color: '#7c3aed', fontSize: 11, cursor: 'pointer', width: '100%' }}>
                  + Associer à un problème
                </button>
              ) : null}
            </div>

          </div>
          {/* end right sidebar */}
        </div>
        {/* end body grid */}
        {/* ── PANEL : JOURNAL ── */}
        {showJournalPanel && (
          <div style={{ position: 'fixed', top: 80, right: 0, width: 340, height: 'calc(100vh - 80px)', background: '#fff', borderLeft: '1px solid #e4e4e7', boxShadow: '-4px 0 16px rgba(0,0,0,0.06)', zIndex: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '1px solid #f4f4f5', flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#18181b' }}>📋 Journal des événements</span>
              <button onClick={() => setShowJournalPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.map((h: any, i: number) => (
                  <div key={h.id || i} style={{ fontSize: 12, color: '#71717a', borderLeft: '2px solid #f4f4f5', paddingLeft: 10 }}>
                    <div style={{ fontWeight: 500, color: '#3f3f46', lineHeight: 1.3 }}>
                      {h.action === 'created' && '🎫 Ticket créé'}
                      {h.action === 'status_changed' && `🔄 Statut → ${STATUS_NAMES[parseInt(h.new_value)] || h.new_value}`}
{h.action === 'assigned' && `👤 Assigné${h.new_value_label ? ' à ' + h.new_value_label : ''}`}
                       {h.action === 'assigned_group' && `⬆️ Escaladé au groupe${h.new_value_label ? ' ' + h.new_value_label : ''}`}
                      {h.action === 'comment_added' && '💬 Commentaire ajouté'}
                      {h.action === 'comment_sent_to_requester' && '✉️ Envoyé au demandeur'}
                      {h.action === 'task_created' && '📋 Tâche créée'}
                      {h.action === 'task_status_changed' && '📋 Statut tâche mis à jour'}
                      {h.action === 'sla_breached' && '⚠️ Dépassement SLA'}
                      {h.action === 'vip_set' && '⭐ Marqué VIP'}
                      {h.action === 'vip_unset' && '☆ Retiré VIP'}
                      {h.action === 'deleted' && '🗑️ Supprimé'}
                      {h.action === 'grouped' && '🔗 Ajouté à un groupe'}
                      {h.action === 'ungrouped' && '🔓 Retiré du groupe'}
                      {h.action === 'problem_created' && `⚠️ Problème #${h.new_value} créé`}
                      {h.action === 'comment_propagated' && '💬 Commentaire propagé (groupe)'}
                      {h.action === 'solved' && '✅ Ticket résolu'}
                      {h.action === 'updated' && `✏️ ${h.field_name || 'Champ modifié'}`}
                      {!['created','status_changed','assigned','assigned_group','comment_added','comment_propagated','comment_sent_to_requester','task_created','task_status_changed','sla_breached','vip_set','vip_unset','deleted','grouped','ungrouped','problem_created','solved','updated'].includes(h.action) && h.action}
                    </div>
                    {h.created_at && (
                      <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 2 }}>
                        {h.user_name && <span>{h.user_name} · </span>}
                        {new Date(h.created_at).toLocaleString('fr-FR')}
                      </div>
                    )}
                    {h.comment && h.action === 'status_changed' && h.new_value === '4' ? (
                      <div style={{ marginTop: 4, fontSize: 11, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 5, padding: '3px 8px', lineHeight: 1.4 }}>
                        💬 <strong>Motif :</strong> {h.comment}
                      </div>
                    ) : h.comment ? (
                      <div style={{ color: '#71717a', marginTop: 2, fontSize: 11 }}>{h.comment}</div>
                    ) : null}
                  </div>
                ))}
                {history.length === 0 && <div style={{ color: '#a1a1aa', fontStyle: 'italic', fontSize: 12 }}>Aucun événement</div>}
              </div>
            </div>
          </div>
        )}

      </div>

      {showTaskModal && (
        <CreateTaskModal
          ticketId={ticket.id}
          ticketTitle={ticket.title}
          onClose={() => setShowTaskModal(false)}
          onCreated={async (taskTitle?: string) => {
            try {
              const token = localStorage.getItem('token');
              await axios.post(`/api/tickets/${id}/log-activity`, {
                action: 'task_created',
                comment: `Tâche créée${taskTitle ? ` : ${taskTitle}` : ''}`
              }, { headers: { Authorization: `Bearer ${token}` } });
              loadTicket();
            } catch (e) {}
          }}
        />
      )}

      {/* ── Modal : Transformer en Problème ──────────────────────── */}
{showProblemModal && ticketGroup && (
        <ProblemModal
          groupId={ticketGroup.id}
          groupName={ticketGroup.name}
          members={ticketGroup.members || []}
          onClose={() => setShowProblemModal(false)}
          onCreated={(problemId: number) => {
            setShowProblemModal(false);
            setTicketGroup((g: any) => g ? { ...g, problem_ticket_id: problemId } : g);
            loadGroup();
          }}
        />
      )}

      {/* ── Modal : Associer à un problème ─────────────────────────── */}
      {showAssociateProblemModal && (
        <AssociateProblemModal
          ticketId={parseInt(id || '0')}
          onClose={() => setShowAssociateProblemModal(false)}
          onAssociated={() => {
            setShowAssociateProblemModal(false);
            loadTicket();
            loadGroup();
          }}
        />
      )}

      {showAssignModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowAssignModal(false)}>
          <div style={{ background: '#fff', borderRadius: 16, width: 440, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === 'Escape') setShowAssignModal(false); if (e.key === 'Enter' && technicians.length > 0) assignTechnician(technicians[0].user_id); }}>
            {/* Header */}
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f4f4f5', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#18181b' }}>+ Assigner ce ticket</div>
                  <div style={{ fontSize: 11, color: '#71717a', marginTop: 2 }}>#{ticket.id} · {(ticket.title || '').substring(0, 48)}{(ticket.title || '').length > 48 ? '…' : ''}</div>
                </div>
                <button onClick={() => setShowAssignModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 20, lineHeight: 1, padding: '0 0 0 8px', flexShrink: 0 }}>×</button>
              </div>
            </div>
            {/* Content */}
            <div style={{ overflowY: 'auto', padding: '16px 20px 12px', flex: 1 }}>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
                <button onClick={() => setAssignTab('tech')}
                  style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 11, background: assignTab === 'tech' ? '#6366f1' : '#f1f5f9', color: assignTab === 'tech' ? '#fff' : '#475569' }}>
                  🔧 Techniciens
                </button>
                <button onClick={() => setAssignTab('escalade')}
                  style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 11, background: assignTab === 'escalade' ? '#8b5cf6' : '#f1f5f9', color: assignTab === 'escalade' ? '#fff' : '#475569' }}>
                  ⬆️ Escalade
                </button>
              </div>

              {assignTab === 'tech' ? (
                technicians.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 13 }}>Aucun technicien disponible</div>
                ) : (
                  <>
                    {/* Suggéré */}
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Suggéré</div>
                    {(() => {
                      const best = technicians[0];
                      const load = parseInt(best.active_tickets || '0');
                      const loadColor = load === 0 ? '#22c55e' : load <= 3 ? '#f59e0b' : '#ef4444';
                      return (
                        <div style={{ border: '2px solid #fca5a5', borderRadius: 12, padding: '14px 16px', marginBottom: 16, background: '#fff5f5' }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Moins chargé de l'équipe</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 38, height: 38, borderRadius: '50%', background: avatarColor(best.displayname || best.displayName || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                              {getInitials(best.displayname || best.displayName || '')}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#18181b' }}>{best.displayname || best.displayName}</div>
                              <div style={{ fontSize: 11, color: '#71717a', marginTop: 1 }}>{best.module_role || 'technicien'} · {load} ticket{load !== 1 ? 's' : ''} actif{load !== 1 ? 's' : ''}</div>
                            </div>
                            <button onClick={() => assignTechnician(best.user_id)}
                              style={{ padding: '7px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
                              Assigner
                            </button>
                          </div>
                          <div style={{ height: 4, background: '#fee2e2', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${Math.min(100, load * 12.5)}%`, background: loadColor, borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })()}
                    {/* Disponibles */}
                    {technicians.length > 1 && (
                      <>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Disponibles</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {technicians.slice(1).map((t: any) => {
                            const load = parseInt(t.active_tickets || '0');
                            const loadColor = load === 0 ? '#22c55e' : load <= 3 ? '#f59e0b' : '#ef4444';
                            return (
                              <div key={t.user_id}
                                className="assign-row"
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1px solid #f4f4f5', background: '#fff', cursor: 'pointer', position: 'relative' }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#f9f9fb'; (e.currentTarget.querySelector('.assign-hover-btn') as HTMLElement).style.opacity = '1'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; (e.currentTarget.querySelector('.assign-hover-btn') as HTMLElement).style.opacity = '0'; }}>
                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: avatarColor(t.displayname || t.displayName || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                  {getInitials(t.displayname || t.displayName || '')}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>{t.displayname || t.displayName}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
                                    <span style={{ fontSize: 10, color: '#a1a1aa' }}>{t.module_role || 'technicien'}</span>
                                    <div style={{ width: 50, height: 3, background: '#f4f4f5', borderRadius: 2 }}>
                                      <div style={{ height: '100%', width: `${Math.min(100, load * 12.5)}%`, background: loadColor, borderRadius: 2 }} />
                                    </div>
                                    <span style={{ fontSize: 10, color: '#71717a' }}>{load}</span>
                                  </div>
                                </div>
                                <button className="assign-hover-btn" onClick={() => assignTechnician(t.user_id)}
                                  style={{ padding: '5px 12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 11, cursor: 'pointer', flexShrink: 0, opacity: 0, transition: 'opacity 0.15s' }}>
                                  Assigner
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </>
                )
              ) : (
                <>
                  {(() => {
                    const agents = escaladeTargets.filter((t: any) => t.target_type === 'agent');
                    const groups = escaladeTargets.filter((t: any) => t.target_type === 'group');
                    return (
                      <>
                        <div style={{ fontSize: 11, color: '#71717a', marginBottom: 10, lineHeight: 1.5 }}>
                          Escalader vers un agent ou un groupe. Le ticket sera assigné au technicien le moins occupé du groupe.
                        </div>
                        {agents.length > 0 && (
                          <>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>👤 Agents d'escalade</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: agents.length > 0 && groups.length > 0 ? 12 : 0 }}>
                              {agents.map((t: any) => (
                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1px solid #c4b5fd', background: '#faf5ff' }}>
                                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff', flexShrink: 0, fontWeight: 700 }}>
                                    {(t.display_name || t.username || '?')[0].toUpperCase()}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e1b4b' }}>{t.display_name || t.username}</div>
                                    <div style={{ fontSize: 11, color: '#7c3aed' }}>{t.email || t.username}</div>
                                  </div>
                                  <button onClick={() => { assignTechnician(t.user_id); }}
                                    style={{ padding: '5px 12px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                                    Escalader
                                  </button>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                        {groups.length > 0 && (
                          <>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>👥 Groupes d'escalade</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {groups.map((g: any) => (
                                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1px solid #86efac', background: '#f0fdf4' }}>
                                  <div style={{ width: 28, height: 28, borderRadius: 6, background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#fff', flexShrink: 0 }}>
                                    👥
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#14532d' }}>{g.name}</div>
                                    <div style={{ fontSize: 11, color: '#16a34a' }}>{(g.members || []).length} membre{(g.members || []).length !== 1 ? 's' : ''} · Assignation automatique au technicien le moins occupé</div>
                                  </div>
                                  <button onClick={async () => {
                                    try {
                                      const token = localStorage.getItem('token');
                                      await axios.post(`/api/tickets/${id}/assign-to-group`, { group_id: g.id }, { headers: { Authorization: `Bearer ${token}` } });
                                      setShowAssignModal(false);
                                      loadTicket();
                                    } catch (err: any) {
                                      alert('Erreur escalation: ' + (err.response?.data?.message || err.message));
                                    }
                                  }}
                                    style={{ padding: '5px 12px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                                    Escalader
                                  </button>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                        {agents.length === 0 && groups.length === 0 && (
                          <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 13 }}>Aucune cible d'escalade configurée.<br /><span style={{ fontSize: 11 }}>Configurez des groupes dans Admin → Groupes.</span></div>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </div>
            {/* Footer */}
            <div style={{ padding: '10px 20px', borderTop: '1px solid #f4f4f5', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#a1a1aa' }}>
                {ticket.category_name ? `Auto-assign : ${ticket.category_name}` : ''}
              </span>
              <span style={{ fontSize: 11, color: '#a1a1aa', fontFamily: 'monospace' }}>esc: annuler</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Waiting Reason Modal ─────────────────────────────────────────── */}
      {showWaitingModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowWaitingModal(false)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 460 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 600 }}>Mettre en attente</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#64748b' }}>
              Indiquez le motif de la mise en attente
            </p>
            <textarea
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', minHeight: 80 }}
              placeholder="Motif..."
              value={waitingComment}
              onChange={e => setWaitingComment(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setShowWaitingModal(false)}
                style={{ padding: '10px 20px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleWaitingSubmit} disabled={!waitingComment.trim()}
                style={{ padding: '10px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Solution Modal ──────────────────────────────────────────────── */}
      {showSolutionModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowSolutionModal(false)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 460 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 600 }}>Résoudre le ticket</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#64748b' }}>
              Décrivez la solution apportée
            </p>
            <textarea
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', minHeight: 80 }}
              placeholder="Solution..."
              value={solutionText}
              onChange={e => setSolutionText(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setShowSolutionModal(false)}
                style={{ padding: '10px 20px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleSolutionSubmit} disabled={!solutionText.trim()}
                style={{ padding: '10px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Résoudre
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Arbitrage Modal ─────────────────────────────────────────────── */}
      {showArbitrageModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowArbitrageModal(false)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 460 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 17, fontWeight: 700 }}>⚖️ Demander un arbitrage</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#64748b' }}>
              Le ticket sera mis en attente et une tâche d'arbitrage sera attribuée à l'arbitre choisi.
            </p>
            {/* Arbitre */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Arbitre</label>
              {selectedArbitre ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid #c7d2fe', borderRadius: 8, background: '#eef2ff' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#4f46e5', flex: 1 }}>{selectedArbitre.displayName}</span>
                  <button onClick={() => setSelectedArbitre(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 16, padding: 0 }}>×</button>
                </div>
              ) : (
                <>
                  <input value={arbitreAd.query} onChange={e => arbitreAd.setQuery(e.target.value)} placeholder="Rechercher un utilisateur..."
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #e4e4e7', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} autoFocus />
                  {arbitreAd.searching && <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 3 }}>Recherche...</div>}
                  {arbitreAd.results.length > 0 && (
                    <div style={{ border: '1px solid #f4f4f5', borderRadius: 8, overflow: 'hidden', marginTop: 3 }}>
                      {arbitreAd.results.map((u: any) => (
                        <div key={u.username || u.email} onClick={() => { setSelectedArbitre(u); arbitreAd.setQuery(''); arbitreAd.clearResults(); }}
                          style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f9f9fb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f9f9fb')}
                          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                          <div>
                            <div style={{ fontWeight: 500 }}>{u.displayName}</div>
                            <div style={{ fontSize: 11, color: '#71717a' }}>{u.email}{u.service ? ` · ${u.service}` : ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Motif */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Motif de l'arbitrage</label>
              <textarea
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e4e4e7', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', minHeight: 80, outline: 'none' }}
                placeholder="Décrivez le motif de l'arbitrage..."
                value={arbitreMotif}
                onChange={e => setArbitreMotif(e.target.value)}
              />
            </div>
            {ticket.status?.id !== 4 && (
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#c2410c' }}>
                ⚠️ Le ticket sera automatiquement mis en attente.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowArbitrageModal(false)}
                style={{ padding: '9px 20px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleArbitrage} disabled={!selectedArbitre || !arbitreMotif.trim() || arbitreSubmitting}
                style={{ padding: '9px 20px', background: (!selectedArbitre || !arbitreMotif.trim()) ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {arbitreSubmitting ? 'Envoi...' : "⚖️ Demander l'arbitrage"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cascade Resolution Modal ────────────────────────────────────── */}
      {showCascadeModal && (ticketGroup || linkedTickets.length > 0) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500 }}
          onClick={() => setShowCascadeModal(false)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 500 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 17, fontWeight: 700 }}>✅ Résolution en cascade</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#64748b' }}>
              {String(ticket?.type) === '3'
                ? 'Ce problème a des tickets associés. Voulez-vous les résoudre automatiquement avec la même solution ?'
                : 'Ce ticket fait partie d\'un groupe. Voulez-vous résoudre les tickets liés avec la même solution ?'}
            </p>
            <div style={{ background: '#f9f9fb', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
              {(linkedTickets.length > 0 ? linkedTickets : ticketGroup?.members?.filter((m: any) => m.ticket_id !== parseInt(id || '0')) || []).map((m: any) => (
                <div key={m.id || m.ticket_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#6366f1' }}>#{m.id || m.ticket_id}</span>
                  <span style={{ color: '#3f3f46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Solution à appliquer</label>
              <textarea value={cascadeSolution} onChange={e => setCascadeSolution(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', minHeight: 60 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCascadeModal(false)}
                style={{ padding: '9px 20px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>
                Non, ignorer
              </button>
              <button onClick={handleCascadeResolve}
                style={{ padding: '9px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                ✓ Résoudre tous les tickets liés
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL : Transformer un groupe en Problème

