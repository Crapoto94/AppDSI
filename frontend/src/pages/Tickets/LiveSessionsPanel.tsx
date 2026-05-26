import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import AddTaskModal from '../../components/AddTaskModal';

interface LiveSession {
  id: number;
  ticket_id: number;
  user_username: string;
  user_display_name: string;
  user_email: string;
  tech_username: string | null;
  tech_display_name: string | null;
  status: 'waiting' | 'active' | 'closed' | 'pre_closed';
  created_at: string;
  claimed_at: string | null;
  auth_method?: string;
  app_id?: number | null;
}

interface LiveMessage {
  id: number;
  session_id: number;
  sender_type: 'user' | 'tech';
  sender_name: string;
  sender_username?: string;
  content: string;
  attachment_url?: string;
  attachment_name?: string;
  created_at: string;
}

export default function LiveSessionsPanel() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [activeSession, setActiveSession] = useState<LiveSession | null>(null);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [input, setInput] = useState('');
  // Rename dialog
  const [showRename, setShowRename] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const [closeTicketOnEnd, setCloseTicketOnEnd] = useState(true);
  // Takeover confirmation
  const [showTakeover, setShowTakeover] = useState(false);
  // Dictée vocale
  const [listening, setListening] = useState(false);
  // Reformulation IA
  const [reformulating, setReformulating] = useState(false);
  const [reformulationProposal, setReformulationProposal] = useState<string | null>(null);
  // File upload
  const [uploading, setUploading] = useState(false);
  // Requester ticket history
  const [showRequesterTickets, setShowRequesterTickets] = useState(false);
  const [requesterTickets, setRequesterTickets] = useState<any[]>([]);
  const [loadingReqTickets, setLoadingReqTickets] = useState(false);
  const [openerMessage, setOpenerMessage] = useState<{ content: string; sender_name: string } | null>(null);
  // Ticket type classification
  const [ticketType, setTicketType] = useState<string | null>(null);
  // Task creation modal
  const [showTaskModal, setShowTaskModal] = useState(false);
  // App association picker
  const [apps, setApps] = useState<any[]>([]);
  const [showAppPicker, setShowAppPicker] = useState(false);
  const [appSearch, setAppSearch] = useState('');
  const [appSaving, setAppSaving] = useState(false);
  // Emergency message
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyMsg, setEmergencyMsg] = useState('');
  const [emergencySending, setEmergencySending] = useState(false);
  const [emergencyResult, setEmergencyResult] = useState<{ sent: boolean; detail: string } | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user') || '{}';
  let me: any = {};
  try { me = JSON.parse(userStr); } catch (e) {}

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Socket + initial load
  useEffect(() => {
    const socket = io({ auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('tech_watch');
      if (activeSession) {
        socket.emit('join_session', { sessionId: activeSession.id });
      }
    });

    socket.on('new_live_session', (session: LiveSession) => {
      setSessions(prev => {
        if (prev.find(s => s.id === session.id)) return prev;
        return [session, ...prev];
      });
    });

    socket.on('session_updated', (session: LiveSession) => {
      setSessions(prev => prev.map(s => s.id === session.id ? session : s));
      setActiveSession(prev => prev?.id === session.id ? session : prev);
    });

    socket.on('session_claimed', ({ session }: { session: LiveSession }) => {
      setSessions(prev => prev.map(s => s.id === session.id ? session : s));
      setActiveSession(prev => prev?.id === session.id ? session : prev);
    });

    socket.on('session_closed', ({ sessionId }: { sessionId: number }) => {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      setActiveSession(prev => {
        if (prev?.id === sessionId) {
          setMessages([]);
          setShowRename(false);
          setShowTakeover(false);
          return null;
        }
        return prev;
      });
    });

    socket.on('session_history', (msgs: LiveMessage[]) => {
      setMessages(msgs);
    });

    socket.on('new_message', (msg: LiveMessage) => {
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    axios.get('/api/live/sessions', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setSessions(r.data))
      .catch(() => {});

    // Load MagApp apps for association picker
    axios.get('/api/magapp/apps', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setApps((r.data || []).filter((a: any) => a.present_magapp === 'oui' || a.is_active)))
      .catch(() => {});

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Re-join session room when active session changes
  useEffect(() => {
    if (activeSession && socketRef.current) {
      socketRef.current.emit('join_session', { sessionId: activeSession.id });
    }
  }, [activeSession?.id]);

  // REST polling — messages for active session (2.5s), sessions list (5s)
  useEffect(() => {
    if (!activeSession) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      axios.get(`/api/live/sessions/${activeSession.id}/messages`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => {
          setMessages(prev => {
            const ids = new Set(prev.map((m: LiveMessage) => m.id));
            const fresh = (r.data as LiveMessage[]).filter(m => !ids.has(m.id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
        }).catch(() => {});
      // Also refresh session status
      axios.get(`/api/live/sessions/${activeSession.id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => setActiveSession(prev => prev?.id === r.data.id ? r.data : prev))
        .catch(() => {});
    }, 2500);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [activeSession?.id]);

  // Sessions list refresh every 5s (fallback for when socket not connected)
  useEffect(() => {
    const t = setInterval(() => {
      axios.get('/api/live/sessions', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => setSessions(r.data)).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, []);

  async function claimSession(session: LiveSession, force = false) {
    try {
      const url = `/api/live/sessions/${session.id}/claim${force ? '?force=true' : ''}`;
      const r = await axios.post(url, {}, { headers: { Authorization: `Bearer ${token}` } });
      setActiveSession(r.data);
      setShowTakeover(false);
      setShowRequesterTickets(false);
      setRequesterTickets([]);
      setMessages([]);
      setOpenerMessage(null);
      setTicketType(null);
      // Load history via REST immediately
      const msgs = await axios.get(`/api/live/sessions/${session.id}/messages`, { headers: { Authorization: `Bearer ${token}` } });
      setMessages(msgs.data);
      // Load ticket opener message + type
      if (r.data.ticket_id) {
        axios.get(`/api/tickets/${r.data.ticket_id}`, { headers: { Authorization: `Bearer ${token}` } })
          .then(tr => {
            const t = tr.data;
            if (t?.content) setOpenerMessage({ content: t.content, sender_name: t.requester_name || r.data.user_display_name || r.data.user_username });
            if (t?.type) setTicketType(String(t.type));
          }).catch(() => {});
      }
      // Also join via socket for real-time updates
      if (socketRef.current) socketRef.current.emit('join_session', { sessionId: session.id });
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de la prise en charge');
    }
  }

  async function loadRequesterTickets() {
    if (!activeSession?.user_email) return;
    setLoadingReqTickets(true);
    try {
      const r = await axios.get('/api/tickets', {
        params: { requester_email: activeSession.user_email, limit: 10, sort: 'date_creation', order: 'desc' },
        headers: { Authorization: `Bearer ${token}` },
      });
      setRequesterTickets(Array.isArray(r.data) ? r.data : (r.data.data || r.data.tickets || []));
    } catch {
      setRequesterTickets([]);
    } finally {
      setLoadingReqTickets(false);
    }
  }

  function openSession(session: LiveSession) {
    setActiveSession(session);
    setMessages([]);
    setOpenerMessage(null);
    setTicketType(null);
    setShowRename(false);
    setShowTakeover(false);
    setShowRequesterTickets(false);
    setRequesterTickets([]);
    // Load messages via REST immediately (works even without socket)
    axios.get(`/api/live/sessions/${session.id}/messages`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setMessages(r.data)).catch(() => {});
    // Load ticket opener message + type
    if (session.ticket_id) {
      axios.get(`/api/tickets/${session.ticket_id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(tr => {
          const t = tr.data;
          if (t?.content) setOpenerMessage({ content: t.content, sender_name: t.requester_name || session.user_display_name || session.user_username });
          if (t?.type) setTicketType(String(t.type));
        }).catch(() => {});
    }
    // Also join via socket for real-time
    if (socketRef.current) socketRef.current.emit('join_session', { sessionId: session.id });
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || !activeSession) return;
    // Try socket first (instant delivery), fall back to REST
    if (socketRef.current?.connected) {
      socketRef.current.emit('send_message', { sessionId: activeSession.id, content: text });
      setInput('');
    } else {
      try {
        const r = await axios.post(
          `/api/live/sessions/${activeSession.id}/messages`,
          { content: text },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setMessages(prev => prev.find(m => m.id === r.data.id) ? prev : [...prev, r.data]);
        setInput('');
      } catch (e: any) {
        alert(e.response?.data?.message || 'Erreur lors de l\'envoi');
      }
    }
    inputRef.current?.focus();
  }

  // Open rename dialog before closing
  function requestClose() {
    setRenameTitle('');
    setCloseTicketOnEnd(true);
    setShowRename(true);
  }

  async function rejectSession(session: LiveSession) {
    if (!confirm(`Refuser la demande de ${session.user_display_name || session.user_username} ? Aucun ticket ne sera conservé.`)) return;
    try {
      await axios.post(`/api/live/sessions/${session.id}/reject`, {}, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors du refus');
    }
  }

  async function setSessionAppApi(appId: number | null) {
    if (!activeSession) return;
    setAppSaving(true);
    try {
      await axios.patch(
        `/api/live/sessions/${activeSession.id}/app`,
        { app_id: appId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setActiveSession(prev => prev ? { ...prev, app_id: appId } : prev);
      setSessions(prev => prev.map(s => s.id === activeSession.id ? { ...s, app_id: appId } : s));
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de l\'association');
    } finally {
      setAppSaving(false);
      setShowAppPicker(false);
      setAppSearch('');
    }
  }

  async function sendEmergencyMessageApi() {
    if (!activeSession || !emergencyMsg.trim()) return;
    setEmergencySending(true);
    setEmergencyResult(null);
    try {
      const r = await axios.post(
        `/api/live/sessions/${activeSession.id}/emergency`,
        { message: emergencyMsg.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const d = r.data;
      const parts: string[] = [];
      if (d.results?.email?.length) parts.push(`📧 ${d.results.email.length} email(s)`);
      if (d.results?.sms?.length) parts.push(`📱 ${d.results.sms.length} SMS`);
      if (d.results?.whatsapp?.length) parts.push(`💬 ${d.results.whatsapp.length} WhatsApp`);
      setEmergencyResult({ sent: true, detail: parts.length ? parts.join(', ') : `${d.contacts} contact(s) notifié(s)` });
      setEmergencyMsg('');
    } catch (e: any) {
      setEmergencyResult({ sent: false, detail: e.response?.data?.message || 'Erreur lors de l\'envoi' });
    } finally {
      setEmergencySending(false);
    }
  }

  async function setTicketTypeApi(type: string) {
    if (!activeSession) return;
    try {
      await axios.patch(
        `/api/live/sessions/${activeSession.id}/type`,
        { type },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTicketType(type);
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors du classement');
    }
  }

  async function confirmClose(title?: string, closeTicket = true) {
    if (!activeSession) return;
    setShowRename(false);
    try {
      await axios.post(
        `/api/live/sessions/${activeSession.id}/close`,
        { newTitle: title?.trim() || undefined, closeTicket },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (e) {
      if (socketRef.current) {
        socketRef.current.emit('close_session', { sessionId: activeSession.id });
      }
    }
    setActiveSession(null);
    setMessages([]);
  }

  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Dictée vocale non supportée par ce navigateur'); return; }
    const rec = new SR();
    rec.lang = 'fr-FR';
    rec.continuous = true;
    rec.interimResults = false;
    recognitionRef.current = rec;
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).slice(e.resultIndex).map((r: any) => r[0].transcript).join(' ');
      setInput(prev => prev + (prev ? ' ' : '') + t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  }

  async function handleReformulate() {
    if (!input.trim()) return;
    setReformulating(true);
    try {
      const res = await axios.post('/api/tickets/ai/reformulate',
        { text: input.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReformulationProposal(res.data.result);
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de la reformulation');
    } finally {
      setReformulating(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeSession) return;
    e.target.value = ''; // reset input
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await axios.post(
        `/api/live/sessions/${activeSession.id}/upload`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      );
      // message will arrive via socket new_message
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de l\'envoi du fichier');
    } finally {
      setUploading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const waitingCount = sessions.filter(s => s.status === 'waiting').length;
  const isMySession = activeSession?.tech_username === me.username;
  const isLockedByOther = activeSession?.status === 'active' && !isMySession;

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatAge(iso: string) {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}min`;
    return `${Math.floor(diff / 3600)}h`;
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 240px)', minHeight: 480, gap: 16 }}>
      <style>{`
        @keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @keyframes slideIn { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }
      `}</style>

      {/* ── Rename dialog overlay ─────────────────────────────────────── */}
      {showRename && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 28, width: 420,
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)', fontFamily: 'system-ui, sans-serif',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#1e293b' }}>
              📝 Renommer le ticket
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
              Donnez un titre parlant à ce ticket avant de clôturer la session.
              Laissez vide pour garder le titre par défaut.
            </div>
            <input
              type="text"
              value={renameTitle}
              onChange={e => setRenameTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmClose(renameTitle, closeTicketOnEnd); if (e.key === 'Escape') setShowRename(false); }}
              placeholder="Ex : Problème VPN accès distant…"
              autoFocus
              style={{
                width: '100%', padding: '10px 12px',
                border: '1.5px solid #e2e8f0', borderRadius: 10,
                fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
                outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#6366f1'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />

            {/* Ticket close option */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={closeTicketOnEnd}
                onChange={e => setCloseTicketOnEnd(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#6366f1' }}
              />
              <span style={{ fontSize: 13, color: '#374151' }}>Clôturer le ticket associé</span>
            </label>
            {!closeTicketOnEnd && (
              <div style={{ marginTop: 6, padding: '6px 10px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                Le ticket restera ouvert — le technicien pourra continuer à le traiter depuis la liste.
              </div>
            )}
            {closeTicketOnEnd && !ticketType && (
              <div style={{ marginTop: 6, padding: '6px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                ⚠️ Classez le ticket (Incident ou Demande) avant de clôturer.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                onClick={() => confirmClose(renameTitle, closeTicketOnEnd)}
                disabled={closeTicketOnEnd && !ticketType}
                style={{
                  flex: 1, padding: '10px',
                  background: closeTicketOnEnd && !ticketType ? '#d4d4d8' : closeTicketOnEnd ? '#6366f1' : '#f59e0b',
                  color: '#fff',
                  border: 'none', borderRadius: 10, fontWeight: 700, cursor: closeTicketOnEnd && !ticketType ? 'not-allowed' : 'pointer', fontSize: 14,
                }}>
                {closeTicketOnEnd ? '✅ Clôturer' : '📋 Terminer le chat'}
              </button>
              <button
                onClick={() => setShowRename(false)}
                style={{
                  padding: '10px 20px', background: '#f1f5f9', color: '#475569',
                  border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 14,
                }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Takeover confirmation overlay ─────────────────────────────── */}
      {showTakeover && activeSession && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 28, width: 400,
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)', fontFamily: 'system-ui, sans-serif',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#dc2626' }}>
              ⚠️ Prendre la main ?
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
              Cette session est actuellement gérée par{' '}
              <strong>{activeSession.tech_display_name}</strong>.
              En prenant la main, vous devenez le technicien référent et l'autre technicien perdra l'accès en écriture.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => claimSession(activeSession, true)}
                style={{
                  flex: 1, padding: '10px', background: '#dc2626', color: '#fff',
                  border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14,
                }}>
                🔓 Prendre la main
              </button>
              <button
                onClick={() => setShowTakeover(false)}
                style={{
                  padding: '10px 20px', background: '#f1f5f9', color: '#475569',
                  border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 14,
                }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Task creation modal (AddTaskModal) ───────────────────────── */}
      {showTaskModal && activeSession && (
        <AddTaskModal
          token={token}
          contextSource="ticket"
          contextId={activeSession.ticket_id}
          contextTitle={`Chat live — Ticket #${activeSession.ticket_id}`}
          title="Créer une tâche"
          onCreated={() => setShowTaskModal(false)}
          onClose={() => setShowTaskModal(false)}
        />
      )}

      {/* ── App association picker ───────────────────────────────────── */}
      {showAppPicker && activeSession && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 24, width: 440,
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)', fontFamily: 'system-ui, sans-serif',
            display: 'flex', flexDirection: 'column', maxHeight: '80vh',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#1e293b' }}>
              🔧 Associer une application
            </div>
            {activeSession.app_id && (() => {
              const cur = apps.find(a => a.id === activeSession.app_id);
              return cur ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '6px 10px', background: '#eef2ff', borderRadius: 8, fontSize: 13 }}>
                  <span style={{ color: '#6366f1', fontWeight: 600 }}>Actuel : {cur.name}</span>
                  <button onClick={() => setSessionAppApi(null)} disabled={appSaving} style={{ marginLeft: 'auto', padding: '2px 8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                    Retirer
                  </button>
                </div>
              ) : null;
            })()}
            <input
              type="text"
              value={appSearch}
              onChange={e => setAppSearch(e.target.value)}
              placeholder="Rechercher une application…"
              autoFocus
              style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', marginBottom: 10 }}
              onFocus={e => (e.target.style.borderColor = '#6366f1')}
              onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
            />
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320 }}>
              {apps
                .filter(a => !appSearch || a.name?.toLowerCase().includes(appSearch.toLowerCase()) || a.category_name?.toLowerCase().includes(appSearch.toLowerCase()))
                .map(app => (
                  <div
                    key={app.id}
                    onClick={() => setSessionAppApi(app.id)}
                    style={{
                      padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                      background: activeSession.app_id === app.id ? '#eef2ff' : '#f8fafc',
                      border: activeSession.app_id === app.id ? '1.5px solid #c7d2fe' : '1px solid #f1f5f9',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                    onMouseEnter={e => { if (activeSession.app_id !== app.id) (e.currentTarget as HTMLElement).style.background = '#f0f4ff'; }}
                    onMouseLeave={e => { if (activeSession.app_id !== app.id) (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                  >
                    {app.icon_url && <img src={app.icon_url} alt="" style={{ width: 20, height: 20, objectFit: 'contain', borderRadius: 4 }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{app.name}</div>
                      {app.category_name && <div style={{ fontSize: 11, color: '#94a3b8' }}>{app.category_name}</div>}
                    </div>
                    {activeSession.app_id === app.id && <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 700 }}>✓</span>}
                  </div>
                ))
              }
              {apps.filter(a => !appSearch || a.name?.toLowerCase().includes(appSearch.toLowerCase())).length === 0 && (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 20 }}>Aucune application trouvée</div>
              )}
            </div>
            <button
              onClick={() => { setShowAppPicker(false); setAppSearch(''); }}
              style={{ marginTop: 12, padding: '8px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ── Emergency message modal ─────────────────────────────────── */}
      {showEmergencyModal && activeSession && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 28, width: 460,
            boxShadow: '0 8px 40px rgba(0,0,0,0.22)', fontFamily: 'system-ui, sans-serif',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 24 }}>🚨</span>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>Message d'urgence</div>
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14, lineHeight: 1.5 }}>
              Ce message sera envoyé par <strong>email</strong>, <strong>SMS</strong> et <strong>WhatsApp</strong> à tous les membres de l'équipe marqués comme contacts d'urgence.
            </div>
            <textarea
              value={emergencyMsg}
              onChange={e => setEmergencyMsg(e.target.value)}
              placeholder="Décrivez la situation d'urgence…"
              rows={4}
              autoFocus
              style={{
                width: '100%', padding: '10px 12px',
                border: '1.5px solid #fecaca', borderRadius: 10,
                fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                boxSizing: 'border-box', background: '#fff7f7',
              }}
              onFocus={e => e.target.style.borderColor = '#dc2626'}
              onBlur={e => e.target.style.borderColor = '#fecaca'}
            />
            {emergencyResult && (
              <div style={{
                marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: emergencyResult.sent ? '#f0fdf4' : '#fef2f2',
                color: emergencyResult.sent ? '#15803d' : '#dc2626',
                border: `1px solid ${emergencyResult.sent ? '#86efac' : '#fecaca'}`,
              }}>
                {emergencyResult.sent ? `✅ Envoyé — ${emergencyResult.detail}` : `❌ ${emergencyResult.detail}`}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                onClick={sendEmergencyMessageApi}
                disabled={!emergencyMsg.trim() || emergencySending}
                style={{
                  flex: 1, padding: '10px',
                  background: emergencyMsg.trim() && !emergencySending ? '#dc2626' : '#d4d4d8',
                  color: '#fff', border: 'none', borderRadius: 10,
                  fontWeight: 700, cursor: emergencyMsg.trim() && !emergencySending ? 'pointer' : 'not-allowed',
                  fontSize: 14,
                }}>
                {emergencySending ? '⏳ Envoi…' : '🚨 Envoyer le message d\'urgence'}
              </button>
              <button
                onClick={() => { setShowEmergencyModal(false); setEmergencyMsg(''); setEmergencyResult(null); }}
                style={{
                  padding: '10px 20px', background: '#f1f5f9', color: '#475569',
                  border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 14,
                }}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Session List (left panel) ──────────────────────────────────── */}
      <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
            Sessions live
            {waitingCount > 0 && (
              <span style={{
                marginLeft: 8, background: '#ef4444', color: '#fff',
                borderRadius: 12, padding: '1px 8px', fontSize: 11, fontWeight: 700,
                animation: 'livePulse 2s infinite',
              }}>
                {waitingCount} en attente
              </span>
            )}
          </div>
        </div>

        {sessions.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', color: '#94a3b8', fontSize: 13, textAlign: 'center', gap: 8,
          }}>
            <div style={{ fontSize: 32 }}>💤</div>
            <div>Aucune session live active</div>
            <div style={{ fontSize: 11 }}>Les demandes apparaîtront ici en temps réel</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
            {sessions.map(s => {
              const isSelected = activeSession?.id === s.id;
              const isWaiting = s.status === 'waiting';
              const isMine = s.tech_username === me.username;
              return (
                <div
                  key={s.id}
                  onClick={() => openSession(s)}
                  style={{
                    background: isSelected ? '#eef2ff' : '#fff',
                    border: isSelected ? '2px solid #6366f1' : isWaiting ? '2px solid #fbbf24' : '1px solid #e2e8f0',
                    borderRadius: 12, padding: '10px 14px', cursor: 'pointer',
                    animation: 'slideIn 0.2s ease',
                    transition: 'box-shadow 0.15s',
                    boxShadow: isSelected ? '0 0 0 3px rgba(99,102,241,0.1)' : 'none',
                  }}
                  onMouseEnter={e => !isSelected && ((e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)')}
                  onMouseLeave={e => !isSelected && ((e.currentTarget as HTMLElement).style.boxShadow = 'none')}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: isWaiting ? '#f59e0b' : '#22c55e',
                          boxShadow: isWaiting ? '0 0 0 3px rgba(245,158,11,0.25)' : '0 0 0 3px rgba(34,197,94,0.25)',
                        }} />
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.user_display_name || s.user_username}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {isWaiting ? '⏳ En attente'
                          : isMine ? '✅ Vous gérez'
                          : `🔒 ${s.tech_display_name}`}
                      </div>
                      {s.auth_method && (
                        <div style={{ marginTop: 3 }}>{renderAuthBadge(s.auth_method, 'small')}</div>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>
                      {formatAge(s.created_at)}
                    </div>
                  </div>

                  {isWaiting && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        onClick={e => { e.stopPropagation(); claimSession(s); }}
                        style={{
                          flex: 1, padding: '6px',
                          background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8,
                          fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        🖐 Prendre en charge
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); rejectSession(s); }}
                        style={{
                          padding: '6px 10px',
                          background: '#fef2f2', color: '#dc2626',
                          border: '1px solid #fecaca', borderRadius: 8,
                          fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        }}
                        title="Refuser (pas de ticket)"
                      >
                        🚫
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Chat area (right panel) ────────────────────────────────────── */}
      <div style={{ flex: 1, background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!activeSession ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, textAlign: 'center', gap: 8 }}>
            <div style={{ fontSize: 40 }}>💬</div>
            <div style={{ fontWeight: 600, color: '#64748b' }}>Sélectionnez une session</div>
            <div style={{ fontSize: 12 }}>Ou cliquez sur "Prendre en charge" pour gérer une demande en attente</div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={{
              padding: '12px 18px', borderBottom: '1px solid #f1f5f9',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#f8fafc', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, background: '#e0e7ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>👤</div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                      {activeSession.user_display_name || activeSession.user_username}
                    </span>
                    {activeSession.auth_method && renderAuthBadge(activeSession.auth_method, 'normal')}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <span>{activeSession.user_email}</span>
                    {activeSession.ticket_id && (
                      <a href={`/tickets/${activeSession.ticket_id}`} target="_blank" rel="noreferrer"
                        style={{ color: '#6366f1', textDecoration: 'none' }}>
                        → Ticket #{activeSession.ticket_id}
                      </a>
                    )}
                    {activeSession.app_id && (() => {
                      const app = apps.find(a => a.id === activeSession.app_id);
                      return app ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
                          🔧 {app.name}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Requester ticket history button */}
                <button
                  onClick={() => { setShowRequesterTickets(v => { if (!v) loadRequesterTickets(); return !v; }); }}
                  title="Derniers tickets du demandeur"
                  style={{
                    padding: '4px 10px', background: showRequesterTickets ? '#eef2ff' : '#f8fafc',
                    color: showRequesterTickets ? '#6366f1' : '#64748b',
                    border: `1px solid ${showRequesterTickets ? '#c7d2fe' : '#e2e8f0'}`,
                    borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}>
                  📋 Tickets
                </button>
                {/* Ticket type classifier */}
                {activeSession.status !== 'closed' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <button
                      onClick={() => ticketType !== '1' && setTicketTypeApi('1')}
                      title="Incident"
                      style={{
                        padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        border: ticketType === '1' ? '1.5px solid #dc2626' : '1px solid #e2e8f0',
                        background: ticketType === '1' ? '#fef2f2' : '#f8fafc',
                        color: ticketType === '1' ? '#dc2626' : '#71717a',
                      }}>
                      🔴 Incident
                    </button>
                    <button
                      onClick={() => ticketType !== '2' && setTicketTypeApi('2')}
                      title="Demande"
                      style={{
                        padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        border: ticketType === '2' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                        background: ticketType === '2' ? '#eff6ff' : '#f8fafc',
                        color: ticketType === '2' ? '#2563eb' : '#71717a',
                      }}>
                      🔵 Demande
                    </button>
                    {!ticketType && (
                      <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>⚠ à classer</span>
                    )}
                  </div>
                )}
                {/* Status badge */}
                <span style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: activeSession.status === 'waiting' ? '#fef3c7'
                    : activeSession.status === 'pre_closed' ? '#fef9c3'
                    : isLockedByOther ? '#fce7f3' : '#dcfce7',
                  color: activeSession.status === 'waiting' ? '#92400e'
                    : activeSession.status === 'pre_closed' ? '#854d0e'
                    : isLockedByOther ? '#9d174d' : '#15803d',
                }}>
                  {activeSession.status === 'waiting' ? '⏳ En attente'
                    : activeSession.status === 'pre_closed' ? '📤 Demandeur parti'
                    : isLockedByOther ? `🔒 ${activeSession.tech_display_name}`
                    : '🟢 Actif'}
                </span>

                {/* My session: close button */}
                {(activeSession.status === 'active' || activeSession.status === 'pre_closed') && isMySession && (
                  <button onClick={requestClose} style={{
                    padding: '4px 12px', background: '#fef2f2', color: '#dc2626',
                    border: '1px solid #fecaca', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}>
                    ✕ Clôturer
                  </button>
                )}

                {/* Locked by other: takeover button */}
                {isLockedByOther && (
                  <button
                    onClick={() => setShowTakeover(true)}
                    style={{
                      padding: '4px 12px', background: '#fef9c3', color: '#854d0e',
                      border: '1px solid #fde68a', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}>
                    🔓 Prendre la main
                  </button>
                )}
              </div>
            </div>

            {/* Lock banner for read-only view */}
            {isLockedByOther && (
              <div style={{
                background: '#fef9c3', borderBottom: '1px solid #fde68a',
                padding: '8px 18px', fontSize: 12, color: '#854d0e',
                display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
              }}>
                🔒 Session en lecture seule — gérée par <strong>{activeSession.tech_display_name}</strong>
              </div>
            )}

            {/* Auth warning banner */}
            {activeSession.auth_method === 'guest' && (
              <div style={{
                background: '#fff7ed', borderBottom: '1px solid #fed7aa',
                padding: '8px 18px', fontSize: 12, color: '#9a3412',
                display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
              }}>
                ⚠️ <strong>Identité non vérifiée</strong> — ce demandeur s'est connecté sans authentification.
              </div>
            )}

            {/* Requester ticket history panel */}
            {showRequesterTickets && (
              <div style={{ borderBottom: '1px solid #e2e8f0', background: '#fff', padding: '10px 18px', maxHeight: 210, overflowY: 'auto', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                    📋 10 derniers tickets de {activeSession.user_display_name || activeSession.user_username}
                  </div>
                  <button onClick={() => setShowRequesterTickets(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, lineHeight: 1 }}>✕</button>
                </div>
                {loadingReqTickets ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '8px 0' }}>Chargement…</div>
                ) : requesterTickets.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>Aucun ticket trouvé</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {requesterTickets.map((t: any) => {
                      const tid = t.glpi_id || t.id;
                      const sid = typeof t.status === 'object' ? t.status.id : t.status;
                      const slabel = typeof t.status === 'object' ? t.status.label : null;
                      const statusColors: Record<number, string> = { 1: '#6366f1', 2: '#8b5cf6', 3: '#f59e0b', 4: '#f97316', 5: '#22c55e', 6: '#64748b', 7: '#475569', 8: '#ef4444' };
                      const statusLabels: Record<number, string> = { 1: 'Nouveau', 2: 'En cours (attribué)', 3: 'Planifié', 4: 'En attente utilisateur', 5: 'En attente fournisseur', 6: 'Résolu', 7: 'Clos', 8: 'Rejeté' };
                      const label = slabel || statusLabels[sid] || `#${sid}`;
                      return (
                        <a key={tid} href={`/tickets/${tid}`} target="_blank" rel="noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, background: '#f8fafc', textDecoration: 'none', color: '#1e293b', transition: 'background 0.1s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#eef2ff')}
                          onMouseLeave={e => (e.currentTarget.style.background = '#f8fafc')}>
                          <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, flexShrink: 0 }}>#{tid}</span>
                          <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || t.name || '—'}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, flexShrink: 0, color: statusColors[sid] || '#64748b', background: `${statusColors[sid] || '#64748b'}18`, padding: '1px 6px', borderRadius: 8 }}>
                            {label}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8, background: '#f8fafc' }}>
              {openerMessage && (
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                  <div style={{
                    maxWidth: '72%',
                    background: '#fff',
                    color: '#1e293b',
                    borderRadius: '18px 18px 18px 4px',
                    padding: '8px 13px', fontSize: 13, lineHeight: 1.5,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    border: '1px solid #f1f5f9',
                    wordBreak: 'break-word',
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', marginBottom: 2 }}>
                      {openerMessage.sender_name}
                    </div>
                    {openerMessage.content}
                  </div>
                </div>
              )}
              {!openerMessage && messages.length === 0 && (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 16 }}>
                  Début de la conversation
                </div>
              )}
              {messages.map(msg => {
                const isTechMsg = msg.sender_type === 'tech';
                const isMyMsg = isTechMsg && msg.sender_username === me.username;
                return (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: isTechMsg ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6 }}>
                    <div style={{
                      maxWidth: '72%',
                      background: isTechMsg ? '#6366f1' : '#fff',
                      color: isTechMsg ? '#fff' : '#1e293b',
                      borderRadius: isTechMsg ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      padding: '8px 13px', fontSize: 13, lineHeight: 1.5,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                      border: isTechMsg ? 'none' : '1px solid #f1f5f9',
                      wordBreak: 'break-word',
                    }}>
                      {!isTechMsg && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', marginBottom: 2 }}>
                          {msg.sender_name}
                        </div>
                      )}
                      {msg.attachment_url ? (
                        <a href={msg.attachment_url} target="_blank" rel="noreferrer"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            color: isTechMsg ? '#fff' : '#6366f1',
                            textDecoration: 'none', fontSize: 13,
                          }}>
                          <span style={{ fontSize: 16 }}>{getFileIcon(msg.attachment_name || '')}</span>
                          <span style={{ textDecoration: 'underline', wordBreak: 'break-all' }}>{msg.attachment_name || msg.content}</span>
                        </a>
                      ) : (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                      )}
                      <div style={{ fontSize: 10, opacity: 0.6, marginTop: 3, textAlign: 'right' }}>
                        {isTechMsg && !isMyMsg && <span style={{ marginRight: 4 }}>{msg.sender_name} · </span>}
                        {formatTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input area */}
            {activeSession.status === 'active' && isMySession ? (
              <div style={{ borderTop: '1px solid #e2e8f0', background: '#fff' }}>
                {/* Reformulation proposal */}
                {reformulationProposal !== null && (
                  <div style={{ padding: '10px 14px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', marginBottom: 6 }}>✨ Proposition de reformulation :</div>
                    <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 8, maxHeight: 150, overflowY: 'auto' }}>{reformulationProposal}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { setInput(reformulationProposal); setReformulationProposal(null); inputRef.current?.focus(); }}
                        style={{ padding: '4px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        ✓ Utiliser
                      </button>
                      <button
                        onClick={() => setReformulationProposal(null)}
                        style={{ padding: '4px 12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                        Ignorer
                      </button>
                    </div>
                  </div>
                )}
                <div style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  {/* Hidden file input */}
                  <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
                  {/* Attach button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    title="Envoyer un fichier"
                    style={{
                      padding: '8px 10px', background: '#f1f5f9', color: '#475569',
                      border: '1.5px solid #e2e8f0', borderRadius: 10, cursor: 'pointer',
                      fontSize: 16, lineHeight: 1, opacity: uploading ? 0.5 : 1, flexShrink: 0,
                    }}>
                    {uploading ? '⏳' : '📎'}
                  </button>
                  {/* Task button */}
                  <button
                    onClick={() => setShowTaskModal(true)}
                    title="Créer une tâche (privée)"
                    style={{
                      padding: '8px 10px', background: '#f1f5f9', color: '#475569',
                      border: '1.5px solid #e2e8f0', borderRadius: 10,
                      cursor: 'pointer', fontSize: 15, lineHeight: 1, flexShrink: 0,
                    }}>
                    ✅
                  </button>
                  {/* App picker button */}
                  <button
                    onClick={() => { setShowAppPicker(true); setAppSearch(''); }}
                    title={activeSession.app_id ? `Application associée : ${apps.find(a => a.id === activeSession.app_id)?.name || '#' + activeSession.app_id}` : 'Associer une application'}
                    style={{
                      padding: '8px 10px',
                      background: activeSession.app_id ? '#f0fdf4' : '#f1f5f9',
                      color: activeSession.app_id ? '#15803d' : '#475569',
                      border: `1.5px solid ${activeSession.app_id ? '#86efac' : '#e2e8f0'}`,
                      borderRadius: 10, cursor: 'pointer', fontSize: 15, lineHeight: 1, flexShrink: 0,
                    }}>
                    🔧
                  </button>
                  {/* Emergency button */}
                  <button
                    onClick={() => { setShowEmergencyModal(true); setEmergencyResult(null); }}
                    title="Envoyer un message d'urgence aux contacts d'astreinte"
                    style={{
                      padding: '8px 10px', background: '#fef2f2', color: '#dc2626',
                      border: '1.5px solid #fecaca', borderRadius: 10,
                      cursor: 'pointer', fontSize: 15, lineHeight: 1, flexShrink: 0,
                    }}>
                    🚨
                  </button>
                  {/* Mic button */}
                  <button onClick={toggleDictation} title={listening ? 'Arrêter la dictée' : 'Dictée vocale'}
                    style={{
                      padding: '8px 10px',
                      background: listening ? '#fef2f2' : '#f1f5f9',
                      color: listening ? '#dc2626' : '#475569',
                      border: `1.5px solid ${listening ? '#fca5a5' : '#e2e8f0'}`,
                      borderRadius: 10, cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0,
                    }}>
                    🎤
                  </button>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Répondre… (Entrée pour envoyer)"
                    rows={2}
                    style={{
                      flex: 1, padding: '8px 12px',
                      border: '1.5px solid #e2e8f0', borderRadius: 10,
                      fontSize: 13, fontFamily: 'inherit', resize: 'none', outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = '#6366f1'}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                    autoFocus
                  />
                  {/* Reformulate button */}
                  <button
                    onClick={handleReformulate}
                    disabled={!input.trim() || reformulating}
                    title="Reformuler avec l'IA"
                    style={{
                      padding: '8px 10px', background: input.trim() ? '#f0fdf4' : '#f1f5f9',
                      color: input.trim() ? '#16a34a' : '#94a3b8',
                      border: `1.5px solid ${input.trim() ? '#bbf7d0' : '#e2e8f0'}`,
                      borderRadius: 10, cursor: input.trim() ? 'pointer' : 'default',
                      fontSize: 14, lineHeight: 1, flexShrink: 0,
                    }}>
                    {reformulating ? '⏳' : '✨'}
                  </button>
                  {/* Send button */}
                  <button onClick={sendMessage}
                    disabled={!input.trim()}
                    style={{
                      padding: '8px 16px', background: input.trim() ? '#6366f1' : '#e2e8f0',
                      color: input.trim() ? '#fff' : '#94a3b8', border: 'none', borderRadius: 10,
                      fontWeight: 700, cursor: input.trim() ? 'pointer' : 'default', fontSize: 16,
                    }}>
                    ↑
                  </button>
                </div>
              </div>
            ) : activeSession.status === 'waiting' ? (
              <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                <button onClick={() => claimSession(activeSession)} style={{
                  padding: '10px 28px', background: '#6366f1', color: '#fff',
                  border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14,
                }}>
                  🖐 Prendre en charge cette session
                </button>
              </div>
            ) : (
              // Read-only footer (locked by another tech)
              <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', background: '#fef9c3', textAlign: 'center', color: '#92400e', fontSize: 12 }}>
                🔒 Lecture seule — session gérée par <strong>{activeSession.tech_display_name}</strong>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function renderAuthBadge(method: string, size: 'small' | 'normal') {
  const cfg: Record<string, { bg: string; color: string; border: string; label: string }> = {
    ad:       { bg: '#dcfce7', color: '#15803d', border: '#86efac', label: '✅ Authentifié AD' },
    otp:      { bg: '#ccfbf1', color: '#0f766e', border: '#5eead4', label: '✅ Identifié email' },
    guest:    { bg: '#fef3c7', color: '#92400e', border: '#fcd34d', label: '⚠️ Non authentifié' },
    internal: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', label: '🏠 Interne' },
  };
  const c = cfg[method] || cfg.internal;
  const fs = size === 'small' ? 10 : 11;
  return (
    <span style={{
      display: 'inline-block', padding: size === 'small' ? '1px 6px' : '2px 8px',
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      borderRadius: 20, fontSize: fs, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  );
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
  if (['pdf'].includes(ext)) return '📄';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️';
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return '🎬';
  return '📎';
}
