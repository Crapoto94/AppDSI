import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';

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
  chat_type?: string;
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

export default function ChatEcole() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [activeSession, setActiveSession] = useState<LiveSession | null>(null);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const [ticketType, setTicketType] = useState<string | null>(null);
  
  const [reformulationProposal, setReformulationProposal] = useState<string | null>(null);
  const [reformulating, setReformulating] = useState(false);

  // Mobile navigation state
  const [view, setView] = useState<'list' | 'chat'>('list');

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
  }, [messages, view]);

  // Socket and Initial fetch
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
      if (session.chat_type !== 'ecole') return;
      setSessions(prev => {
        if (prev.find(s => s.id === session.id)) return prev;
        return [session, ...prev];
      });
    });

    socket.on('session_updated', (update: Partial<LiveSession>) => {
      const effectiveId = update.id || (update as any).sessionId;
      if (!effectiveId) return;
      setSessions(prev => prev.map(s => s.id === effectiveId ? { ...s, ...update } : s));
      setActiveSession(prev => prev && prev.id === effectiveId ? { ...prev, ...update } : prev);
    });

    socket.on('session_claimed', ({ session }: { session: LiveSession }) => {
      if (session.chat_type !== 'ecole') return;
      setSessions(prev => prev.map(s => s.id === session.id ? session : s));
      setActiveSession(prev => prev?.id === session.id ? session : prev);
    });

    socket.on('session_closed', ({ sessionId }: { sessionId: number }) => {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      setActiveSession(prev => {
        if (prev?.id === sessionId) {
          setMessages([]);
          setView('list');
          return null;
        }
        return prev;
      });
    });

    socket.on('session_history', (msgs: LiveMessage[]) => {
      setMessages(msgs);
    });

    socket.on('new_message', (msg: LiveMessage) => {
      if (!msg) return;
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    axios.get('/api/live/sessions?chat_type=ecole', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setSessions(r.data))
      .catch(() => {});

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Poll messages for active session (fallback)
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
      axios.get(`/api/live/sessions/${activeSession.id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => setActiveSession(prev => prev?.id === r.data.id ? r.data : prev))
        .catch(() => {});
    }, 2500);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [activeSession?.id]);

  // Refresh sessions list
  useEffect(() => {
    const t = setInterval(() => {
      axios.get('/api/live/sessions?chat_type=ecole', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => setSessions(r.data)).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, []);

  async function claimSession(session: LiveSession, force = false) {
    try {
      const url = `/api/live/sessions/${session.id}/claim${force ? '?force=true' : ''}`;
      const r = await axios.post(url, {}, { headers: { Authorization: `Bearer ${token}` } });
      setActiveSession(r.data);
      setMessages([]);
      setTicketType(null);
      const msgs = await axios.get(`/api/live/sessions/${session.id}/messages`, { headers: { Authorization: `Bearer ${token}` } });
      setMessages(msgs.data);
      if (r.data.ticket_id) {
        axios.get(`/api/tickets/${r.data.ticket_id}`, { headers: { Authorization: `Bearer ${token}` } })
          .then(tr => {
            if (tr.data?.type) setTicketType(String(tr.data.type));
          }).catch(() => {});
      }
      if (socketRef.current) socketRef.current.emit('join_session', { sessionId: session.id });
      setView('chat');
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de la prise en charge');
    }
  }

  function openSession(session: LiveSession) {
    setActiveSession(session);
    setMessages([]);
    setTicketType(null);
    axios.get(`/api/live/sessions/${session.id}/messages`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setMessages(r.data)).catch(() => {});
    if (session.ticket_id) {
      axios.get(`/api/tickets/${session.ticket_id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(tr => {
          if (tr.data?.type) setTicketType(String(tr.data.type));
        }).catch(() => {});
    }
    if (socketRef.current) socketRef.current.emit('join_session', { sessionId: session.id });
    setView('chat');
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

  async function sendMessage() {
    const text = input.trim();
    if (!text || !activeSession) return;
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

  async function closeSession() {
    if (!activeSession) return;
    if (activeSession.status === 'active' && !ticketType) {
      alert('Veuillez classer le ticket (Incident ou Demande) avant de clôturer.');
      return;
    }
    if (!confirm('Clôturer cette conversation école ?')) return;
    try {
      await axios.post(
        `/api/live/sessions/${activeSession.id}/close`,
        { closeTicket: true },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (e) {
      if (socketRef.current) {
        socketRef.current.emit('close_session', { sessionId: activeSession.id });
      }
    }
    setActiveSession(null);
    setMessages([]);
    setView('list');
  }

  async function rejectSession(session: LiveSession) {
    if (!confirm(`Refuser la demande école de ${session.user_display_name} ?`)) return;
    try {
      await axios.post(`/api/live/sessions/${session.id}/reject`, {}, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors du refus');
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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeSession) return;
    e.target.value = '';
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await axios.post(
        `/api/live/sessions/${activeSession.id}/upload`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      );
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur d\'envoi');
    } finally {
      setUploading(false);
    }
  }

  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Dictée non supportée'); return; }
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const formatAge = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    return `${Math.floor(diff / 3600)}h`;
  };

  const isMySession = activeSession?.tech_username === me.username;
  const isLockedByOther = activeSession?.status === 'active' && !isMySession;

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: '#f8fafc', fontFamily: 'system-ui, sans-serif'
    }}>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      `}</style>

      {/* ── VIEW: LIST OF SESSIONS ──────────────────────────────────── */}
      {view === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <header style={{
            background: 'linear-gradient(135deg, #059669, #10b981)',
            color: '#fff', padding: '16px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(16,185,129,0.15)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>🏫</span>
              <div>
                <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Support Écoles</h1>
                <div style={{ fontSize: 11, opacity: 0.85 }}>Chat Live Mobile</div>
              </div>
            </div>
            <a href="/tickets" style={{
              background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '6px 12px',
              fontSize: 12, fontWeight: 700
            }}>
              Retour
            </a>
          </header>

          <main style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#475569', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Conversations en attente ou actives ({sessions.length})
            </h2>

            {sessions.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '48px 24px', color: '#94a3b8',
                background: '#fff', borderRadius: 16, border: '1px dashed #cbd5e1', marginTop: 12
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>💤</div>
                <div style={{ fontWeight: 600 }}>Aucune session école</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Les nouveaux messages apparaîtront ici.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sessions.map(s => {
                  const isWaiting = s.status === 'waiting';
                  const isMine = s.tech_username === me.username;
                  return (
                    <div
                      key={s.id}
                      onClick={() => { if (!isWaiting) openSession(s); }}
                      style={{
                        background: '#fff', borderRadius: 14, padding: '14px',
                        border: isWaiting ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                        cursor: isWaiting ? 'default' : 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                            {s.user_display_name || s.user_username}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            {s.user_email}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>
                          {formatAge(s.created_at)}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                          background: isWaiting ? '#fef3c7' : isMine ? '#dcfce7' : '#f1f5f9',
                          color: isWaiting ? '#b45309' : isMine ? '#15803d' : '#475569'
                        }}>
                          {isWaiting ? '⏳ En attente' : isMine ? '✅ Votre chat' : `🔒 ${s.tech_display_name}`}
                        </span>

                        {isWaiting ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); claimSession(s); }}
                              style={{
                                background: '#10b981', color: '#fff', border: 'none',
                                padding: '6px 12px', borderRadius: 8, fontSize: 12,
                                fontWeight: 700, cursor: 'pointer'
                              }}
                            >
                              🖐 Répondre
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); rejectSession(s); }}
                              style={{
                                background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                                padding: '6px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer'
                              }}
                            >
                              🚫
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>
                            Ouvrir →
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      )}

      {/* ── VIEW: CHAT ROOM ─────────────────────────────────────────── */}
      {view === 'chat' && activeSession && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <header style={{
            background: 'linear-gradient(135deg, #059669, #10b981)',
            color: '#fff', padding: '10px 14px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <button
              onClick={() => setView('list')}
              style={{
                background: 'none', border: 'none', color: '#fff', fontSize: 20,
                cursor: 'pointer', padding: '4px 8px'
              }}
            >
              ←
            </button>
            <div style={{ textAlign: 'center', flex: 1, minWidth: 0, padding: '0 8px' }}>
              <div style={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeSession.user_display_name}
              </div>
              <div style={{ fontSize: 10, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeSession.user_email}
              </div>
            </div>
            {isMySession && (
              <button
                onClick={closeSession}
                style={{
                  background: '#e11d48', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Clôturer
              </button>
            )}
          </header>

          {/* Ticket Classification Banner */}
          {isMySession && (
            <div style={{
              background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '8px 12px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Classement ticket :</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setTicketTypeApi('1')}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    border: ticketType === '1' ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                    background: ticketType === '1' ? '#fef2f2' : '#fff',
                    color: ticketType === '1' ? '#dc2626' : '#64748b'
                  }}
                >
                  Incident
                </button>
                <button
                  onClick={() => setTicketTypeApi('2')}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    border: ticketType === '2' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                    background: ticketType === '2' ? '#eff6ff' : '#fff',
                    color: ticketType === '2' ? '#2563eb' : '#64748b'
                  }}
                >
                  Demande
                </button>
              </div>
            </div>
          )}

          {isLockedByOther && (
            <div style={{ background: '#fef3c7', color: '#92400e', fontSize: 11, padding: '6px 12px', textAlign: 'center', borderBottom: '1px solid #fde68a' }}>
              🔒 Lecture seule — Session prise par <strong>{activeSession.tech_display_name}</strong>
            </div>
          )}

          {/* Messages container */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '12px', background: '#f1f5f9',
            display: 'flex', flexDirection: 'column', gap: 8
          }}>
            {messages.map(m => {
              const isTech = m.sender_type === 'tech';
              const isSelfMsg = isTech && m.sender_username === me.username;
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    flexDirection: isSelfMsg ? 'row-reverse' : 'row',
                    alignItems: 'flex-end',
                    gap: 6
                  }}
                >
                  {!isSelfMsg && (
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', background: isTech ? '#10b981' : '#6366f1',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, flexShrink: 0
                    }}>
                      {isTech ? 'T' : 'U'}
                    </div>
                  )}
                  <div style={{
                    maxWidth: '80%',
                    background: isSelfMsg ? '#10b981' : '#fff',
                    color: isSelfMsg ? '#fff' : '#1e293b',
                    borderRadius: isSelfMsg ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    padding: '8px 12px',
                    fontSize: 13,
                    lineHeight: 1.4,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    wordBreak: 'break-word'
                  }}>
                    {!isSelfMsg && !isTech && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', marginBottom: 2 }}>
                        {m.sender_name}
                      </div>
                    )}
                    {m.attachment_url ? (
                      <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{ color: isSelfMsg ? '#fff' : '#10b981', textDecoration: 'underline' }}>
                        📎 {m.attachment_name || m.content}
                      </a>
                    ) : (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                    )}
                    <div style={{ fontSize: 9, opacity: 0.6, marginTop: 4, textAlign: 'right' }}>
                      {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Saisie de message */}
          {isMySession ? (
            <div style={{ borderTop: '1px solid #e2e8f0', background: '#fff', padding: '8px' }}>
                {reformulationProposal !== null && (
                  <div style={{ padding: '8px 10px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', marginBottom: 8, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', marginBottom: 4 }}>✨ Proposition de reformulation :</div>
                    <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.4, whiteSpace: 'pre-wrap', marginBottom: 6, maxHeight: 100, overflowY: 'auto' }}>{reformulationProposal}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => { setInput(reformulationProposal); setReformulationProposal(null); inputRef.current?.focus(); }}
                        style={{ padding: '3px 10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        ✓ Utiliser
                      </button>
                      <button
                        onClick={() => setReformulationProposal(null)}
                        style={{ padding: '3px 10px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
                        Ignorer
                      </button>
                    </div>
                  </div>
                )}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 10,
                    padding: '8px 10px', cursor: 'pointer', fontSize: 14
                  }}
                >
                  {uploading ? '⏳' : '📎'}
                </button>

                <button
                  onClick={toggleDictation}
                  style={{
                    background: listening ? '#fef2f2' : '#f1f5f9',
                    color: listening ? '#dc2626' : '#475569',
                    border: `1px solid ${listening ? '#fca5a5' : '#cbd5e1'}`,
                    borderRadius: 10, padding: '8px 10px', cursor: 'pointer', fontSize: 14
                  }}
                >
                  🎤
                </button>

                <button
                  onClick={handleReformulate}
                  disabled={!input.trim() || reformulating}
                  title="Reformuler avec l'IA"
                  style={{
                    padding: '8px 10px', background: input.trim() ? '#f0fdf4' : '#f1f5f9',
                    color: input.trim() ? '#16a34a' : '#94a3b8',
                    border: `1px solid ${input.trim() ? '#bbf7d0' : '#cbd5e1'}`,
                    borderRadius: 10, cursor: input.trim() ? 'pointer' : 'default', fontSize: 14
                  }}>
                  {reformulating ? '⏳' : '✨'}
                </button>

                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Répondre..."
                  rows={1}
                  style={{
                    flex: 1, padding: '8px 10px', border: '1px solid #cbd5e1',
                    borderRadius: 10, fontSize: 13, resize: 'none', outline: 'none',
                    maxHeight: 60, fontFamily: 'inherit'
                  }}
                />

                <button
                  onClick={sendMessage}
                  disabled={!input.trim()}
                  style={{
                    background: input.trim() ? '#10b981' : '#e2e8f0',
                    color: input.trim() ? '#fff' : '#94a3b8',
                    border: 'none', borderRadius: 10, padding: '8px 14px',
                    fontWeight: 700, fontSize: 13, cursor: input.trim() ? 'pointer' : 'default'
                  }}
                >
                  Envoyer
                </button>
              </div>
            </div>
          ) : (
            activeSession.status === 'waiting' ? (
              <div style={{ padding: '12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                <button
                  onClick={() => claimSession(activeSession)}
                  style={{
                    background: '#10b981', color: '#fff', border: 'none',
                    borderRadius: 10, padding: '10px 24px', fontWeight: 700, fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  🖐 Prendre en charge
                </button>
              </div>
            ) : (
              <div style={{ padding: '10px', background: '#fef3c7', color: '#92400e', textAlign: 'center', fontSize: 12 }}>
                🔒 Lecture seule
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
