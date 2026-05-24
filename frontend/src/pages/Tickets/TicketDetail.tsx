import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import Header from '../../components/Header';
import CreateTaskModal from '../../components/CreateTaskModal';
import { useAuth } from '../../contexts/AuthContext';

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
  1: [{ to: 2, label: 'Assigner', color: '#8b5cf6' }, { to: 3, label: 'Prendre en charge', color: '#f59e0b' }],
  2: [{ to: 3, label: 'Prendre en charge', color: '#f59e0b' }, { to: 1, label: 'Réinitialiser', color: '#64748b' }],
  3: [{ to: 4, label: 'En attente', color: '#f97316' }, { to: 5, label: 'Résoudre', color: '#22c55e' }, { to: 2, label: 'Réassigner', color: '#8b5cf6' }],
  4: [{ to: 3, label: 'Reprendre', color: '#f59e0b' }, { to: 5, label: 'Résoudre', color: '#22c55e' }],
  5: [{ to: 6, label: 'Fermer', color: '#64748b' }, { to: 3, label: 'Réouvrir', color: '#f59e0b' }],
  6: [{ to: 3, label: 'Réouvrir', color: '#f59e0b' }],
};

export default function TicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();
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
  // Groupe de tickets
  const [ticketGroup, setTicketGroup] = useState<any>(null);
  const [showAddToGroup, setShowAddToGroup] = useState(false);
  const [addTicketId, setAddTicketId] = useState('');
  const [groupActionLoading, setGroupActionLoading] = useState(false);
  const [showProblemModal, setShowProblemModal] = useState(false);
  const [showWaitingModal, setShowWaitingModal] = useState(false);
  const [waitingComment, setWaitingComment] = useState('');
  const [showSolutionModal, setShowSolutionModal] = useState(false);
  const [solutionText, setSolutionText] = useState('');
  const [observers, setObservers] = useState<any[]>([]);
  const [showAddObserver, setShowAddObserver] = useState(false);
  const [observerSearch, setObserverSearch] = useState('');
  const [observerResults, setObserverResults] = useState<any[]>([]);
  const [observerSearching, setObserverSearching] = useState(false);

  // Edition des informations
  const [editingInfo, setEditingInfo] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [editForm, setEditForm] = useState<any>({});

  useEffect(() => { loadTicket(); loadGroup(); loadCategoriesAndApps(); }, [id]);

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
      const [ticketRes, commentsRes, historyRes, tasksRes, observersRes] = await Promise.all([
        axios.get(`/api/tickets/${id}`, { headers }),
        axios.get(`/api/tickets/${id}/comments`, { headers }),
        axios.get(`/api/tickets/${id}/history`, { headers }),
        axios.get(`/api/tasks/by-context?source=ticket&id=${id}`, { headers }).catch(() => ({ data: [] })),
        axios.get(`/api/tickets/${id}/observers`, { headers }).catch(() => ({ data: [] })),
      ]);
      const t = ticketRes.data;
      setTicket(t);
      setEditForm({
        priority: t.priority?.id || t.priority,
        impact: t.impact?.id || t.impact,
        category_id: t.category_id || null,
        subcategory_id: t.subcategory_id || null,
        software_id: t.software_id || null
      });
      setComments(commentsRes.data);
      setHistory(historyRes.data);
      setTicketTasks(tasksRes.data || []);
      setObservers(observersRes.data || []);
      if (t.requester?.email) {
        loadRequesterTickets(t.requester.email);
      }
    } catch (e) {
      console.error('Failed to load ticket:', e);
    } finally {
      setLoading(false);
    }
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
      if (editForm.category_id !== undefined) updateData.category_id = editForm.category_id;
      if (editForm.subcategory_id !== undefined) updateData.subcategory_id = editForm.subcategory_id;
      if (editForm.software_id !== undefined) updateData.software_id = editForm.software_id;

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
    if (newStatus === 3) {
      try {
        const token = localStorage.getItem('token');
        if (user?.id) {
          await axios.post(`/api/tickets/${id}/assign`, { technician_id: user.id }, { headers: { Authorization: `Bearer ${token}` } });
        }
        await doChangeStatus(3);
        loadTicket();
      } catch (err: any) {
        alert(err.response?.data?.message || 'Erreur');
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
      loadTicket();
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
        const res = await axios.get(`/api/tickets/users/search?q=${encodeURIComponent(observerSearch)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setObserverResults(res.data);
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
        is_private: 0
      }, { headers: { Authorization: `Bearer ${token}` } });
      setNewComment('');
      setCommentFile(null);
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
      const res = await axios.get('/api/tickets/admin/technicians/available', { headers: { Authorization: `Bearer ${token}` } });
      setTechnicians(res.data);
      setShowAssignModal(true);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur');
    }
  }

  async function assignTechnician(userId: number) {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/tickets/${id}/assign`, { technician_id: userId }, { headers: { Authorization: `Bearer ${token}` } });
      setShowAssignModal(false);
      loadTicket();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur');
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

  const SL: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 };

  return (
    <>
      <Header />
      <div style={{
        display: 'flex', flexDirection: 'column',
        height: 'calc(100vh - 80px)',
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
          <a href="/tickets" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#71717a', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            Retour
          </a>
          <span style={{ color: '#d4d4d8', fontSize: 16 }}>·</span>
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
        </div>

        {/* ── TITLE AREA ── */}
        <div style={{ flexShrink: 0, padding: '14px 20px 12px', borderBottom: '1px solid #f4f4f5', background: '#fff' }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', lineHeight: 1.3 }}>
            {ticket.is_vip && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', padding: '2px 7px', borderRadius: 10 }}>⭐ VIP</span>
            )}
            {ticket.title}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: (STATUS_COLORS[ticket.status?.id] || '#64748b') + '18',
              color: STATUS_COLORS[ticket.status?.id] || '#64748b',
              cursor: ticket.status?.id === 4 && ticket.waiting_reason ? 'help' : 'default'
            }} title={ticket.status?.id === 4 && ticket.waiting_reason ? `Motif : ${ticket.waiting_reason}` : undefined}>
              {ticket.status?.label || 'Inconnu'}
              {ticket.status?.id === 4 && ticket.waiting_reason && <span style={{ fontSize: 10, opacity: 0.75 }}>💬</span>}
            </span>
            <span style={{
              display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: (PRIORITY_COLORS[ticket.priority?.id] || '#64748b') + '18',
              color: PRIORITY_COLORS[ticket.priority?.id] || '#64748b'
            }}>
              {ticket.priority?.label || 'Normale'}
            </span>
            <span style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
              background: String(ticket.type) === '3' ? '#ede9fe' : String(ticket.type) === '2' ? '#e0f2fe' : '#fef3c7',
              color: String(ticket.type) === '3' ? '#7c3aed' : String(ticket.type) === '2' ? '#0369a1' : '#92400e'
            }}>
              {ticket.type_label || 'Incident'}
            </span>
            {(ticket.category_name || ticket.software_name) && (
              <>
                <span style={{ color: '#d4d4d8' }}>·</span>
                <span style={{ fontSize: 12, color: '#71717a' }}>
                  {ticket.category_name}
                  {ticket.subcategory_name && ` / ${ticket.subcategory_name}`}
                  {ticket.software_name && `${ticket.category_name ? ' · ' : ''}💾 ${ticket.software_name}`}
                </span>
              </>
            )}
          </div>
          {transitions.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              {transitions.map(t => (
                <button key={t.to} onClick={() => handleStatusChange(t.to)}
                  style={{ padding: '5px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12, color: '#fff', background: t.color }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── BODY ── */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 272px', overflow: 'hidden' }}>

          {/* ── LEFT PANE ── */}
          <div style={{ overflowY: 'auto', padding: '0 20px 20px', borderRight: '1px solid #f4f4f5' }}>

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
                {comments.map((c: any, i: number) => (
                  <div key={c.id || i} style={{ display: 'flex', gap: 10 }}>
                    <div style={{
                      flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                      background: avatarColor(c.author_name || ''),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: '#fff'
                    }}>{getInitials(c.author_name || '')}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#18181b' }}>{c.author_name || 'Inconnu'}</span>
                        {c.is_private && <span style={{ fontSize: 10, color: '#d97706', background: '#fef3c7', padding: '1px 5px', borderRadius: 8, fontWeight: 600 }}>🔒 Interne</span>}
                        <span style={{ fontSize: 11, color: '#a1a1aa', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                          {c.date_creation ? new Date(c.date_creation).toLocaleString('fr-FR') : ''}
                        </span>
                      </div>
                      <div style={{
                        fontSize: 13, color: '#3f3f46', lineHeight: 1.5,
                        background: c.is_private ? '#fffbeb' : '#f9f9fb',
                        border: `1px solid ${c.is_private ? '#fde68a' : '#f4f4f5'}`,
                        borderRadius: 8, padding: '8px 12px'
                      }} dangerouslySetInnerHTML={{ __html: decodeHtml(c.content) }} />
                    </div>
                  </div>
                ))}
                {comments.length === 0 && <p style={{ fontSize: 12, color: '#a1a1aa', fontStyle: 'italic', margin: 0 }}>Aucun commentaire</p>}
              </div>
            </div>
          </div>
          {/* end left pane */}



          {/* ── RIGHT SIDEBAR ── */}
          <div style={{ overflowY: 'auto', padding: '0 14px 20px' }}>

            {/* Edit toggle */}
            <div style={{ padding: '12px 0 8px', borderBottom: '1px solid #f4f4f5', display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              {!editingInfo ? (
                <button onClick={() => { setEditingInfo(true); setEditForm({ priority: ticket.priority?.id || ticket.priority, impact: ticket.impact?.id || ticket.impact, category_id: ticket.category_id, subcategory_id: ticket.subcategory_id, software_id: ticket.software_id }); }}
                  style={{ padding: '4px 10px', background: 'transparent', border: '1px solid #e4e4e7', borderRadius: 6, color: '#6366f1', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  ✏️ Éditer
                </button>
              ) : (
                <>
                  <button onClick={saveInfo} style={{ padding: '4px 10px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✓ Enregistrer</button>
                  <button onClick={() => setEditingInfo(false)} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid #e4e4e7', color: '#ef4444', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>✕</button>
                </>
              )}
            </div>

            {/* STATUT */}
            <div style={{ borderBottom: '1px solid #f4f4f5', padding: '10px 0' }}>
              <span style={SL}>Statut</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: (STATUS_COLORS[ticket.status?.id] || '#64748b') + '18', color: STATUS_COLORS[ticket.status?.id] || '#64748b', cursor: ticket.status?.id === 4 && ticket.waiting_reason ? 'help' : 'default' }}
                title={ticket.status?.id === 4 && ticket.waiting_reason ? `Motif : ${ticket.waiting_reason}` : undefined}>
                {ticket.status?.label || 'Inconnu'}
                {ticket.status?.id === 4 && ticket.waiting_reason && <span style={{ fontSize: 10 }}>💬</span>}
              </span>
              {ticket.status?.id === 4 && ticket.waiting_reason && (
                <div style={{ marginTop: 5, fontSize: 11, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 5, padding: '4px 8px', lineHeight: 1.4 }}>
                  {ticket.waiting_reason}
                </div>
              )}
            </div>

            {/* PRIORITÉ */}
            <div style={{ borderBottom: '1px solid #f4f4f5', padding: '10px 0' }}>
              <span style={SL}>Priorité</span>
              {editingInfo ? (
                <select value={editForm.priority || 3} onChange={e => setEditForm({...editForm, priority: parseInt(e.target.value)})}
                  style={{ width: '100%', padding: '5px 7px', border: '1px solid #e4e4e7', borderRadius: 6, fontSize: 12, background: '#fff' }}>
                  <option value={2}>Basse</option><option value={3}>Normale</option><option value={4}>Haute</option><option value={5}>Très haute</option>
                </select>
              ) : (
                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: (PRIORITY_COLORS[ticket.priority?.id] || '#64748b') + '18', color: PRIORITY_COLORS[ticket.priority?.id] || '#64748b' }}>
                  {ticket.priority?.label || 'Normale'}
                </span>
              )}
            </div>

            {/* IMPACT */}
            <div style={{ borderBottom: '1px solid #f4f4f5', padding: '10px 0' }}>
              <span style={SL}>Impact</span>
              {editingInfo ? (
                <select value={editForm.impact || 2} onChange={e => setEditForm({...editForm, impact: parseInt(e.target.value)})}
                  style={{ width: '100%', padding: '5px 7px', border: '1px solid #e4e4e7', borderRadius: 6, fontSize: 12, background: '#fff' }}>
                  <option value={2}>1 utilisateur</option><option value={3}>Groupe de travail</option><option value={4}>Service / Direction</option><option value={5}>Global</option>
                </select>
              ) : (
                <span style={{ fontSize: 12, color: '#3f3f46' }}>
                  {ticket.impact?.id && IMPACT_INFO[ticket.impact.id] ? `${IMPACT_INFO[ticket.impact.id].icon} ${IMPACT_INFO[ticket.impact.id].label}` : '—'}
                </span>
              )}
            </div>

            {/* TYPE */}
            <div style={{ borderBottom: '1px solid #f4f4f5', padding: '10px 0' }}>
              <span style={SL}>Type</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: String(ticket.type) === '3' ? '#7c3aed' : '#3f3f46' }}>{ticket.type_label || '—'}</span>
            </div>

            {/* ASSIGNÉ */}
            <div style={{ borderBottom: '1px solid #f4f4f5', padding: '10px 0' }}>
              <span style={SL}>Assigné</span>
              {ticket.technician_name ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: avatarColor(ticket.technician_name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>{getInitials(ticket.technician_name)}</div>
                  <span style={{ fontSize: 12, color: '#18181b' }}>{ticket.technician_name}</span>
                </div>
              ) : (
                <span style={{ fontSize: 12, color: '#a1a1aa', fontStyle: 'italic' }}>Non assigné</span>
              )}
            </div>

            {/* CATÉGORIE */}
            <div style={{ borderBottom: '1px solid #f4f4f5', padding: '10px 0' }}>
              <span style={SL}>Catégorie</span>
              {editingInfo ? (
                <select value={editForm.category_id || ''} onChange={e => setEditForm({...editForm, category_id: e.target.value ? parseInt(e.target.value) : null, subcategory_id: null})}
                  style={{ width: '100%', padding: '5px 7px', border: '1px solid #e4e4e7', borderRadius: 6, fontSize: 12, background: '#fff' }}>
                  <option value="">— Non défini —</option>
                  {categories.filter(c => !c.parent_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <span style={{ fontSize: 12, color: '#3f3f46' }}>{ticket.category_name || '—'}</span>
              )}
            </div>

            {/* SOUS-CATÉGORIE */}
            {(editForm.category_id || ticket.subcategory_id) ? (
              <div style={{ borderBottom: '1px solid #f4f4f5', padding: '10px 0' }}>
                <span style={SL}>Sous-catégorie</span>
                {editingInfo ? (
                  <select value={editForm.subcategory_id || ''} onChange={e => setEditForm({...editForm, subcategory_id: e.target.value ? parseInt(e.target.value) : null})}
                    disabled={!editForm.category_id}
                    style={{ width: '100%', padding: '5px 7px', border: '1px solid #e4e4e7', borderRadius: 6, fontSize: 12, background: '#fff', opacity: !editForm.category_id ? 0.5 : 1 }}>
                    <option value="">— Non défini —</option>
                    {categories.filter(c => c.parent_id === parseInt(editForm.category_id || '0')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: 12, color: '#3f3f46' }}>{ticket.subcategory_name || '—'}</span>
                )}
              </div>
            ) : null}

            {/* LOGICIEL */}
            {(editForm.software_id || ticket.software_id || (editingInfo && editForm.category_id && categories.find(c => c.id === parseInt(editForm.category_id || '0'))?.name.toLowerCase().includes('logiciel'))) ? (
              <div style={{ borderBottom: '1px solid #f4f4f5', padding: '10px 0' }}>
                <span style={SL}>Logiciel</span>
                {editingInfo ? (
                  <select value={editForm.software_id || ''} onChange={e => setEditForm({...editForm, software_id: e.target.value ? parseInt(e.target.value) : null})}
                    style={{ width: '100%', padding: '5px 7px', border: '1px solid #e4e4e7', borderRadius: 6, fontSize: 12, background: '#fff' }}>
                    <option value="">— Non défini —</option>
                    {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: 12, color: '#3f3f46' }}>{ticket.software_name || '—'}</span>
                )}
              </div>
            ) : null}

            {/* DEMANDEUR */}
            <div style={{ borderBottom: '1px solid #f4f4f5', padding: '10px 0' }}>
              <span style={SL}>Demandeur</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: ticket.requester?.email ? 4 : 0 }}>
                <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: avatarColor(ticket.requester?.name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>{getInitials(ticket.requester?.name || '')}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.requester?.name || 'Anonyme'}</div>
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

            {/* CRÉÉ LE */}
            <div style={{ borderBottom: '1px solid #f4f4f5', padding: '10px 0' }}>
              <span style={SL}>Créé le</span>
              <span style={{ fontSize: 12, color: '#3f3f46' }}>{ticket.date_creation ? new Date(ticket.date_creation).toLocaleString('fr-FR') : '—'}</span>
              {ticket.active_days != null && (
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: '#a1a1aa' }}>Temps actif : </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: ticket.active_days > 7 ? '#dc2626' : ticket.active_days > 3 ? '#f59e0b' : '#16a34a' }}>
                    {ticket.active_days > 1 ? `${Math.round(ticket.active_days)} jours` : ticket.active_days === 1 ? '1 jour' : '< 1 jour'}
                  </span>
                </div>
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
                      <span style={{ color: '#3f3f46', flex: 1 }}>{o.name || o.login}</span>
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
                      {observerResults.filter(u => !observers.some(o => o.user_id === u.id)).map(u => (
                        <div key={u.id} onClick={() => handleAddObserver(u)}
                          style={{ padding: '5px 8px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f9f9fb', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{u.name}</span><span style={{ color: '#6366f1', fontSize: 10 }}>{u.email}</span>
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

            {/* GROUPE */}
            {ticketGroup && (
              <div style={{ borderBottom: '1px solid #f4f4f5', padding: '10px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={SL}>🔗 Groupe</span>
                  <button onClick={dissolveGroup} disabled={groupActionLoading}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 10, padding: 0 }}>Dissoudre</button>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{ticketGroup.name}</div>
                <div style={{ background: '#eef2ff', borderRadius: 5, padding: '4px 8px', marginBottom: 8, fontSize: 11, color: '#4f46e5' }}>ℹ️ Actions propagées à tous les membres.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {ticketGroup.members?.map((m: any) => {
                    const isCurrent = String(m.ticket_id) === String(id);
                    return (
                      <div key={m.ticket_id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 7px', borderRadius: 5, background: isCurrent ? '#eef2ff' : '#f9f9fb', border: `1px solid ${isCurrent ? '#c7d2fe' : '#f4f4f5'}` }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#6366f1', minWidth: 34 }}>#{m.ticket_id}</span>
                        <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#3f3f46' }}>{m.title}</span>
                        {!isCurrent && <button onClick={() => window.location.href = `/tickets/${m.ticket_id}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 11, padding: '0 2px' }}>→</button>}
                        {!isCurrent && <button onClick={() => removeFromGroup(m.ticket_id)} disabled={groupActionLoading} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 12, padding: '0 2px' }}>✕</button>}
                      </div>
                    );
                  })}
                </div>
                {showAddToGroup ? (
                  <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                    <input type="number" value={addTicketId} onChange={e => setAddTicketId(e.target.value)} placeholder="N° ticket" autoFocus
                      style={{ flex: 1, padding: '4px 7px', border: '1px solid #6366f1', borderRadius: 5, fontSize: 12 }}
                      onKeyDown={e => { if (e.key === 'Enter') addToGroup(); if (e.key === 'Escape') { setShowAddToGroup(false); setAddTicketId(''); }}} />
                    <button onClick={addToGroup} disabled={groupActionLoading || !addTicketId} style={{ padding: '4px 10px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>+</button>
                    <button onClick={() => { setShowAddToGroup(false); setAddTicketId(''); }} style={{ padding: '4px 8px', background: '#f4f4f5', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12 }}>✕</button>
                  </div>
                ) : (
                  <button onClick={() => setShowAddToGroup(true)}
                    style={{ width: '100%', padding: '5px 0', border: '1px dashed #c7d2fe', borderRadius: 5, background: 'transparent', color: '#6366f1', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
                    + Ajouter un ticket
                  </button>
                )}
                {!ticketGroup.problem_ticket_id ? (
                  <button onClick={() => setShowProblemModal(true)}
                    style={{ width: '100%', marginTop: 8, padding: '6px 0', border: '1px solid #7c3aed', borderRadius: 6, background: '#faf5ff', color: '#7c3aed', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    ⚠️ Transformer en Problème
                  </button>
                ) : (
                  <div style={{ marginTop: 8, padding: '6px 10px', background: '#faf5ff', borderRadius: 6, border: '1px solid #d8b4fe', textAlign: 'center' }}>
                    <span style={{ fontSize: 11, color: '#7c3aed' }}>⚠️ Problème lié : </span>
                    <a href={`/tickets/${ticketGroup.problem_ticket_id}`} style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', textDecoration: 'none' }}>#{ticketGroup.problem_ticket_id}</a>
                  </div>
                )}
              </div>
            )}

            {/* JOURNAL */}
            <div style={{ padding: '10px 0 20px' }}>
              <span style={SL}>Journal</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.map((h: any, i: number) => (
                  <div key={h.id || i} style={{ fontSize: 11, color: '#71717a', borderLeft: '2px solid #f4f4f5', paddingLeft: 8 }}>
                    <div style={{ fontWeight: 500, color: '#3f3f46', lineHeight: 1.3 }}>
                      {h.action === 'created' && '🎫 Créé'}
                      {h.action === 'status_changed' && `🔄 → ${STATUS_NAMES[parseInt(h.new_value)] || h.new_value}`}
                      {h.action === 'assigned' && '👤 Assigné'}
                      {h.action === 'assigned_group' && '👥 Groupe assigné'}
                      {h.action === 'comment_added' && '💬 Commentaire'}
                      {h.action === 'comment_sent_to_requester' && '✉️ Envoyé demandeur'}
                      {h.action === 'task_created' && '📋 Tâche créée'}
                      {h.action === 'task_status_changed' && '📋 Statut tâche'}
                      {h.action === 'sla_breached' && '⚠️ SLA dépassé'}
                      {h.action === 'vip_set' && '⭐ VIP'}
                      {h.action === 'vip_unset' && '☆ Retiré VIP'}
                      {h.action === 'deleted' && '🗑️ Supprimé'}
                      {h.action === 'grouped' && '🔗 Ajouté groupe'}
                      {h.action === 'ungrouped' && '🔓 Retiré groupe'}
                      {h.action === 'problem_created' && `⚠️ Problème #${h.new_value}`}
                      {h.action === 'comment_propagated' && '💬 Propagé'}
                      {h.action === 'solved' && '✅ Résolu'}
                      {h.action === 'updated' && `✏️ ${h.field_name || 'Modifié'}`}
                      {!['created','status_changed','assigned','assigned_group','comment_added','comment_propagated','comment_sent_to_requester','task_created','task_status_changed','sla_breached','vip_set','vip_unset','deleted','grouped','ungrouped','problem_created','solved','updated'].includes(h.action) && h.action}
                    </div>
                    {h.created_at && (
                      <div style={{ fontSize: 10, color: '#a1a1aa', marginTop: 1 }}>
                        {h.user_name && <span>{h.user_name} · </span>}
                        {new Date(h.created_at).toLocaleString('fr-FR')}
                      </div>
                    )}
                    {h.comment && h.action === 'status_changed' && h.new_value === '4' ? (
                      <div style={{ marginTop: 3, fontSize: 10, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4, padding: '2px 6px', lineHeight: 1.4 }}>
                        💬 <strong>Motif :</strong> {h.comment}
                      </div>
                    ) : h.comment ? (
                      <div style={{ color: '#71717a', marginTop: 2, fontSize: 10 }}>{h.comment}</div>
                    ) : null}
                  </div>
                ))}
                {history.length === 0 && <div style={{ color: '#a1a1aa', fontStyle: 'italic', fontSize: 11 }}>Aucun événement</div>}
              </div>
            </div>

          </div>
          {/* end right sidebar */}
        </div>
        {/* end body grid */}

        {/* ── BOTTOM REPLY BAR ── */}
        <div style={{ flexShrink: 0, borderTop: '1px solid #f4f4f5', background: '#fff', padding: '10px 20px' }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, color: '#71717a', cursor: 'pointer' }}>
                <input type="checkbox" checked={commentPrivate} onChange={e => setCommentPrivate(e.target.checked)} />
                Commentaire interne
              </label>
              <button onClick={() => fileInputRef.current?.click()} title="Joindre un fichier"
                style={{ background: 'none', border: '1px solid #e4e4e7', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#71717a', display: 'flex', alignItems: 'center', gap: 3 }}>
                📎 Fichier
              </button>
              <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                onChange={e => setCommentFile(e.target.files?.[0] || null)}
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.zip,.txt" />
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

      {showAssignModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowAssignModal(false)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 420, maxHeight: '70vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600 }}>Assigner un technicien</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {technicians.map((t: any) => (
                <div key={t.user_id} onClick={() => assignTechnician(t.user_id)}
                  style={{
                    padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer',
                    background: '#fff', transition: 'background 0.1s', display: 'flex', alignItems: 'center', gap: 12
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.status === 'active' ? '#22c55e' : t.status === 'paused' ? '#f59e0b' : '#ef4444', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.displayname || t.displayName}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{t.email}</div>
                  </div>
                  <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>{t.active_tickets || 0} ticket(s)</span>
                </div>
              ))}
              {technicians.length === 0 && (
                <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Aucun technicien disponible</div>
              )}
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
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL : Transformer un groupe en Problème
// ─────────────────────────────────────────────────────────────────────────────
function ProblemModal({ groupId, groupName, members, onClose, onCreated }: {
  groupId: number;
  groupName: string;
  members: any[];
  onClose: () => void;
  onCreated: (problemId: number) => void;
}) {
  const [title, setTitle] = useState(`Problème : ${groupName}`);
  const [content, setContent] = useState('');
  const [resolutionMethod, setResolutionMethod] = useState('');
  const [knowledgeArticle, setKnowledgeArticle] = useState('');
  const [priority, setPriority] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    if (!resolutionMethod.trim()) {
      setError('La méthode de résolution est requise pour un ticket Problème.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/tickets/groups/${groupId}/transform-to-problem`, {
        title: title.trim(),
        content,
        resolution_method: resolutionMethod,
        knowledge_article: knowledgeArticle,
        priority,
      }, { headers: { Authorization: `Bearer ${token}` } });
      onCreated(res.data.problem_ticket_id);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur lors de la création du problème');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 28, width: 580, maxHeight: '90vh',
        overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 24 }}>⚠️</span>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#7c3aed' }}>Transformer en Problème</h3>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              Crée un ticket maître de type Problème lié aux {members.length} tickets du groupe
            </p>
          </div>
        </div>

        {/* Tickets associés */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>TICKETS DU GROUPE</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {members.map((m: any) => (
              <span key={m.ticket_id} style={{
                padding: '3px 10px', borderRadius: 20, background: '#ede9fe',
                color: '#7c3aed', fontSize: 12, fontWeight: 600
              }}>#{m.ticket_id}</span>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {/* Titre */}
          <div>
            <label style={labelStyle}>Titre du problème *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              style={inputStyle} />
          </div>

          {/* Priorité */}
          <div>
            <label style={labelStyle}>Priorité</label>
            <select value={priority} onChange={e => setPriority(Number(e.target.value))} style={inputStyle}>
              <option value={2}>Basse</option>
              <option value={3}>Normale</option>
              <option value={4}>Haute</option>
              <option value={5}>Très haute</option>
            </select>
          </div>

          {/* Méthode de résolution — OBLIGATOIRE */}
          <div>
            <label style={{ ...labelStyle, color: '#7c3aed' }}>
              Méthode de résolution <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 6px' }}>
              Décrivez la stratégie d'arbitrage pour résoudre ce problème.
            </p>
            <textarea
              value={resolutionMethod}
              onChange={e => setResolutionMethod(e.target.value)}
              rows={4}
              placeholder="Ex: Identifier la cause racine → Tester le correctif en environnement de validation → Déploiement en production..."
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description complémentaire</label>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              rows={3}
              placeholder="Contexte, observations, impact..."
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Article de connaissance */}
          <div>
            <label style={labelStyle}>Article de connaissance <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optionnel)</span></label>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 6px' }}>
              Documentation interne, procédures ou liens utiles à la résolution.
            </p>
            <textarea
              value={knowledgeArticle}
              onChange={e => setKnowledgeArticle(e.target.value)}
              rows={3}
              placeholder="Documentation, liens Wiki, procédures..."
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 16, color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
          <button onClick={onClose}
            style={{ padding: '10px 22px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }}>
            Annuler
          </button>
          <button onClick={create} disabled={loading}
            style={{
              padding: '10px 24px', border: 'none', borderRadius: 8, cursor: loading ? 'default' : 'pointer',
              background: '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 14, opacity: loading ? 0.7 : 1
            }}>
            {loading ? 'Création...' : '⚠️ Créer le Problème'}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0',
  borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none', background: '#fff'
};
