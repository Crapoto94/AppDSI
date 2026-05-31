import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import EmojiPicker from './EmojiPicker';
import AddTaskModal from '../AddTaskModal';
import CreateTicketModal from '../tickets/CreateTicketModal';
import { useAuth } from '../../contexts/AuthContext';
import { Ticket, CheckCircle, MessageSquare, X, Send, Mic, Paperclip } from 'lucide-react';

type ChatState = 'idle' | 'open' | 'connecting' | 'waiting' | 'active' | 'renaming' | 'rating' | 'ended';

interface LiveMessage {
  id: number;
  session_id: number;
  sender_type: 'user' | 'tech';
  sender_name: string;
  content: string;
  attachment_url?: string;
  attachment_name?: string;
  created_at: string;
}

interface LiveSession {
  id: number;
  status: 'waiting' | 'active' | 'closed';
  tech_display_name: string | null;
  ticket_id: number;
}

const SESSION_KEY = 'live_session_id';

export default function ChatWidget() {
  const { user } = useAuth();
  const [state, setState] = useState<ChatState>('idle');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [techName, setTechName] = useState('');
  const [error, setError] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [checking, setChecking] = useState(true); // checking for existing session on mount
  const [liveEnabled, setLiveEnabled] = useState<boolean | null>(null); // null = loading
  const [closingMessage, setClosingMessage] = useState(''); // message affiché quand le chat est fermé
  const [chatConfig, setChatConfig] = useState<{ primary_color: string; secondary_color: string; chat_name: string; chat_logo: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [activeSessionsCount, setActiveSessionsCount] = useState(0);

  const token = localStorage.getItem('token');
  const PC = chatConfig?.primary_color || '#6366f1';
  const SC = chatConfig?.secondary_color || '#818cf8';
  const CN = chatConfig?.chat_name || 'Support DSI';

  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'technician' || user?.role === 'tech' || user?.role === 'supervisor' || user?.role === 'superviseur';

  // ── On mount: check live_enabled config + listen for changes ─────────
  useEffect(() => {
    if (!token) { setLiveEnabled(false); return; }
    axios.get('/api/live/public-config', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        setLiveEnabled(r.data.live_enabled);
        setClosingMessage(r.data.closing_message || '');
        setChatConfig({ primary_color: r.data.primary_color || '#6366f1', secondary_color: r.data.secondary_color || '#818cf8', chat_name: r.data.chat_name || 'Support DSI', chat_logo: r.data.chat_logo || '💬' });
      })
      .catch(() => setLiveEnabled(true)); // fail open

    // Transport par défaut (polling -> upgrade websocket). Forcer le websocket
    // en premier ouvre une WS « brute » qui, lors du démontage StrictMode en dev
    // (cleanup immédiat), est fermée avant la fin du handshake -> warning
    // « WebSocket is closed before the connection is established ».
    const cfgSocket = io({ auth: { token } });
    cfgSocket.on('live_config', ({ live_enabled }: { live_enabled: boolean }) => {
      setLiveEnabled(live_enabled);
      if (!live_enabled) setState('idle');
    });

    let countTimer: ReturnType<typeof setInterval> | null = null;
    if (isAdmin) {
      // Rejoindre la room des techs de façon fiable : à la connexion ET
      // immédiatement si le socket est déjà connecté (évite de rater l'event
      // si « connect » a déjà eu lieu avant l'attachement du handler).
      const joinTechs = () => { cfgSocket.emit('tech_watch'); fetchActiveCount(); };
      cfgSocket.on('connect', joinTechs);
      if (cfgSocket.connected) joinTechs();
      // Toute évolution de la file d'attente doit rafraîchir le compteur :
      // nouvelle session, prise en charge (waiting->active) et fermeture.
      cfgSocket.on('new_live_session', fetchActiveCount);
      cfgSocket.on('session_updated', fetchActiveCount);
      cfgSocket.on('session_closed', fetchActiveCount);
      fetchActiveCount();
      // Filet de sécurité : si un événement socket est manqué, le compteur se
      // remet à jour tout seul sous 10 s (plus besoin de rafraîchir la page).
      countTimer = setInterval(fetchActiveCount, 10000);
    }

    return () => {
      if (countTimer) clearInterval(countTimer);
      cfgSocket.removeAllListeners();
      cfgSocket.disconnect();
    };
  }, [token, isAdmin]);

  const fetchActiveCount = async () => {
    try {
      const res = await axios.get('/api/live/count', { headers: { Authorization: `Bearer ${token}` } });
      setActiveSessionsCount(res.data.count || 0);
    } catch (e) {}
  };

  // ── On mount: restore existing open session ────────────────────────
  useEffect(() => {
    if (isAdmin) { setChecking(false); return; }
    const storedId = localStorage.getItem(SESSION_KEY);
    if (!storedId) { setChecking(false); return; }

    axios.get<LiveSession>(`/api/live/sessions/${storedId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      const session = res.data;
      if (session.status === 'closed') {
        localStorage.removeItem(SESSION_KEY);
        setChecking(false);
        return;
      }
      const sid = session.id;
      setSessionId(sid);
      if (session.status === 'active') {
        setTechName(session.tech_display_name || 'Technicien DSI');
        setState('active');
      } else {
        setState('waiting');
      }
      setChecking(false);
    }).catch(() => {
      localStorage.removeItem(SESSION_KEY);
      setChecking(false);
    });
  }, [isAdmin]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── REST polling: messages + session status ────────────────────────
  const startPolling = useCallback((sid: number) => {
    if (pollRef.current) clearInterval(pollRef.current);

    const tick = async () => {
      try {
        // Fetch messages
        const [msgRes, sessionRes] = await Promise.all([
          axios.get<LiveMessage[]>(`/api/live/sessions/${sid}/messages`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get<LiveSession>(`/api/live/sessions/${sid}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        // Update messages (dedup by id)
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id));
          const newOnes = msgRes.data.filter(m => !ids.has(m.id));
          return newOnes.length ? [...prev, ...newOnes] : prev;
        });

        // React to session status changes
        const session = sessionRes.data;
        if (session.status === 'active') {
          setState(prev => {
            if (prev === 'waiting') {
              setTechName(session.tech_display_name || 'Technicien DSI');
              return 'active';
            }
            return prev;
          });
        } else if (session.status === 'closed') {
          stopPolling();
          setState('rating');
          localStorage.removeItem(SESSION_KEY);
          socketRef.current?.disconnect();
        }
      } catch (e) { /* ignore */ }
    };

    tick(); // immediate first tick
    pollRef.current = setInterval(tick, 2500);
  }, [token]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // ── Socket connection when sessionId is set ────────────────────────
  useEffect(() => {
    if (!sessionId) return;

    startPolling(sessionId);

    const socket = io({ auth: { token } });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_session', { sessionId });
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

    socket.on('session_claimed', ({ tech }: { tech: { displayName: string } }) => {
      setTechName(tech.displayName);
      setState('active');
    });

    socket.on('session_closed', () => {
      stopPolling();
      localStorage.removeItem(SESSION_KEY);
      setState('rating');
      socket.disconnect();
    });

    socket.on('connect_error', (err) => {
      console.error('[ChatWidget] socket error:', err.message);
    });

    return () => {
      stopPolling();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionId]);

  // ── Actions ────────────────────────────────────────────────────────
  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setError('');
    setState('connecting');
    try {
      const res = await axios.post('/api/live/sessions',
        { content: input.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const sid = res.data.session.id;
      localStorage.setItem(SESSION_KEY, String(sid));
      setSessionId(sid);
      setInput('');
      setState('waiting');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la connexion.');
      setState('open');
    }
  }

  function sendMessage() {
    const text = input.trim();
    if (!text || !socketRef.current || !sessionId) return;
    socketRef.current.emit('send_message', { sessionId, content: text });
    setInput('');
    textareaRef.current?.focus();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;
    e.target.value = '';
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await axios.post(
        `/api/live/sessions/${sessionId}/upload`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      );
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de l\'envoi du fichier');
    } finally {
      setUploading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (state === 'open') handleStart(e as any);
      else if (state === 'active') sendMessage();
    }
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

  function closeWidget() {
    stopPolling();
    if (socketRef.current) socketRef.current.disconnect();
    setState('idle');
    setMessages([]);
    setSessionId(null);
    setTechName('');
    setInput('');
    setNewTitle('');
    setError('');
    setRating(0);
    setRatingComment('');
    setRatingSubmitted(false);
    // Note: don't clear SESSION_KEY here — user might want to reopen
  }

  async function confirmEnd(title?: string) {
    stopPolling();
    localStorage.removeItem(SESSION_KEY);
    try {
      await axios.post(
        `/api/live/sessions/${sessionId}/close`,
        { newTitle: title?.trim() || undefined },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch {
      if (sessionId && socketRef.current) {
        socketRef.current.emit('close_session', { sessionId });
      }
    }
    setState('rating');
  }

  async function submitRating() {
    if (rating < 1 || rating > 5 || !sessionId) return;
    try {
      await axios.post(
        `/api/live/sessions/${sessionId}/satisfaction`,
        { rating, comment: ratingComment.trim() || undefined },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch {}
    setRatingSubmitted(true);
    setState('ended');
  }

  function skipRating() {
    setState('ended');
  }

  // ── Render ─────────────────────────────────────────────────────────
  if (checking) return null;

  const floatingButtons = (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
      
      {/* Create Task Bubble */}
      <button
        onClick={() => setShowTaskModal(true)}
        title="Créer une nouvelle tâche"
        style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#6366f1', transition: 'transform 0.2s'
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
      >
        <CheckCircle size={24} />
      </button>

      {/* Create Ticket Bubble */}
      <button
        onClick={() => setShowTicketModal(true)}
        title="Créer un nouveau ticket"
        style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#6366f1', transition: 'transform 0.2s'
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
      >
        <Ticket size={24} />
      </button>

      {/* Chat Bubble (Standard or Admin) */}
      {isAdmin ? (
        <button
          onClick={() => window.location.href = '/tickets?view=live'}
          title="Accéder aux sessions live"
          style={{
            width: 56, height: 56, borderRadius: '50%',
            background: activeSessionsCount > 0 ? '#22c55e' : '#94a3b8',
            border: 'none', cursor: 'pointer',
            boxShadow: activeSessionsCount > 0 ? '0 4px 20px rgba(34,197,94,0.5)' : '0 4px 20px rgba(0,0,0,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 800, position: 'relative',
            transition: 'transform 0.2s, background 0.2s'
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
        >
          {activeSessionsCount > 0 && (
            <span style={{
              position: 'absolute', top: -5, right: -5,
              background: '#ef4444', color: '#fff',
              fontSize: 12, fontWeight: 700, padding: '2px 6px',
              borderRadius: 10, border: '2px solid #fff'
            }}>
              {activeSessionsCount}
            </span>
          )}
          <MessageSquare size={24} />
        </button>
      ) : liveEnabled === false ? (
        // Chat fermé (désactivé manuellement OU hors horaires) : bulle grise barrée.
        <button
          disabled
          title={closingMessage || 'Chat indisponible pour le moment'}
          style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, #94a3b8, #64748b)',
            border: 'none', cursor: 'not-allowed', boxShadow: '0 4px 20px rgba(100,116,139,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', opacity: 0.85,
          }}
        >
          <X size={24} />
        </button>
      ) : (
        liveEnabled !== null && (
          <button
            onClick={() => setState(sessionId ? (state === 'active' ? 'active' : 'waiting') : 'open')}
            title="Contacter le support DSI"
            style={{
              width: 56, height: 56, borderRadius: '50%',
              background: sessionId
                ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                : `linear-gradient(135deg, ${PC}, ${SC})`,
              border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(99,102,241,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
          >
            {sessionId ? <div style={{width:12, height:12, borderRadius:'50%', background:'#fff'}} /> : <MessageSquare size={24} />}
          </button>
        )
      )}
    </div>
  );

  const panelStyle: React.CSSProperties = {
    position: 'fixed', bottom: 24, right: 24, zIndex: 10000,
    width: 370, height: (state === 'active' || state === 'waiting') ? 520 : 'auto',
    background: '#fff', borderRadius: 20,
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    animation: 'slideUp 0.2s ease',
  };

  const header = (title: string, subtitle?: string) => (
    <div style={{
      background: `linear-gradient(135deg, ${PC}, ${SC})`,
      padding: '16px 18px', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderRadius: '20px 20px 0 0', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.25)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {state === 'active' ? '👨‍💻' : <MessageSquare size={20} />}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, opacity: 0.85 }}>{subtitle}</div>}
        </div>
      </div>
      <button onClick={closeWidget} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', opacity: 0.7, fontSize: 20, lineHeight: 1, padding: 0 }}><X size={20} /></button>
    </div>
  );

  return (
    <>
      {floatingButtons}
      
      {showTaskModal && (
        <AddTaskModal onClose={() => setShowTaskModal(false)} token={token || ''} onCreated={() => setShowTaskModal(false)} />
      )}

      {showTicketModal && (
        <CreateTicketModal onClose={() => setShowTicketModal(false)} />
      )}

      {state !== 'idle' && (
        <div style={panelStyle}>
          <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
          
          {(state === 'open' || state === 'connecting') && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {header(CN, 'Nous sommes là pour vous aider')}
              <div style={{ padding: 20, flex: 1 }}>
                <div style={{ marginBottom: 16, fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>👋</div>
                  Bonjour <strong>{user?.username}</strong> !<br />
                  Décrivez votre problème et un technicien DSI vous répondra en direct.
                </div>
                {error && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 12 }}>
                    {error}
                  </div>
                )}
                <form onSubmit={handleStart}>
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Décrivez votre problème..."
                    rows={4}
                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'none', outline: 'none', lineHeight: 1.5 }}
                    onFocus={e => e.target.style.borderColor = PC}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                    disabled={state === 'connecting'}
                    autoFocus
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4, marginBottom: 2 }}>
                    <EmojiPicker onEmojiSelect={e => setInput(prev => prev + e)} />
                    <button type="button" onClick={toggleDictation}
                      title={listening ? 'Arrêter la dictée' : 'Dictée vocale'}
                      style={{ padding: '4px 10px', background: listening ? '#fef2f2' : 'transparent', color: listening ? '#dc2626' : '#94a3b8', border: `1px solid ${listening ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 7, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Mic size={14} /> {listening ? 'Arrêter' : 'Dicter'}
                    </button>
                  </div>
                  <button type="submit"
                    disabled={state === 'connecting' || !input.trim()}
                    style={{ marginTop: 10, width: '100%', padding: '11px', background: (state === 'connecting' || !input.trim()) ? '#a5b4fc' : PC, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: state === 'connecting' ? 'default' : 'pointer' }}>
                    {state === 'connecting' ? '⏳ Connexion...' : '🚀 Démarrer le chat'}
                  </button>
                </form>
                <p style={{ marginTop: 10, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>Appuyez sur Entrée pour envoyer • Maj+Entrée pour saut de ligne</p>
              </div>
            </div>
          )}

          {state === 'waiting' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {header(CN, 'En attente d\'un technicien...')}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {messages.map(msg => (
                  <MessageBubble key={msg.id} msg={msg} isSelf={msg.sender_type === 'user'} />
                ))}
                <div ref={bottomRef} />
              </div>
              <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', background: '#fafafa', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: PC, fontSize: 13, fontWeight: 600 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, background: PC, borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
                  En attente d'un technicien…
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>Votre demande est en file d'attente</p>
              </div>
            </div>
          )}

          {state === 'active' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {header(techName || 'Technicien DSI', 'En ligne')}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, background: '#f8fafc' }}>
                <div style={{ textAlign: 'center', margin: '8px 0' }}>
                  <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20 }}>
                    ✅ {techName} a rejoint la conversation
                  </span>
                </div>
                {messages.map(msg => (
                  <MessageBubble key={msg.id} msg={msg} isSelf={msg.sender_type === 'user'} />
                ))}
                <div ref={bottomRef} />
              </div>
              <div style={{ padding: '10px 12px', borderTop: '1px solid #e2e8f0', background: '#fff' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Envoyer un fichier"
                    style={{ padding: '8px 10px', background: '#f8fafc', color: '#475569', border: '1.5px solid #e2e8f0', borderRadius: 10, cursor: 'pointer', fontSize: 16, lineHeight: 1, opacity: uploading ? 0.5 : 1, flexShrink: 0 }}>
                    <Paperclip size={18} />
                  </button>
                  <button onClick={toggleDictation} title={listening ? 'Arrêter la dictée' : 'Dictée vocale'}
                    style={{ padding: '8px 10px', background: listening ? '#fef2f2' : '#f8fafc', color: listening ? '#dc2626' : '#475569', border: `1px solid ${listening ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 10, cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>
                    <Mic size={18} />
                  </button>
                  <EmojiPicker onEmojiSelect={e => setInput(prev => prev + e)} />
                  <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Votre message..." rows={2}
                    style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'none', outline: 'none' }}
                    onFocus={e => e.target.style.borderColor = PC} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                  <button onClick={sendMessage} disabled={!input.trim()}
                    style={{ padding: '8px 14px', background: input.trim() ? PC : '#e2e8f0', color: input.trim() ? '#fff' : '#94a3b8', border: 'none', borderRadius: 10, fontWeight: 700, cursor: input.trim() ? 'pointer' : 'default', fontSize: 16 }}>
                    <Send size={18} />
                  </button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <button onClick={() => confirmEnd()} style={{ width: '100%', padding: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    ✕ Terminer le chat
                  </button>
                </div>
              </div>
            </div>
          )}

          {state === 'rating' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {header(CN)}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
                <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: '#18181b' }}>Votre avis nous intéresse</h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>Comment s'est passée votre session ?</p>
                <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                  {[1,2,3,4,5].map(star => (
                    <button key={star} onClick={() => setRating(star)}
                      style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: star <= rating ? PC : '#f1f5f9', color: star <= rating ? '#fff' : '#94a3b8', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      ★
                    </button>
                  ))}
                </div>
                <textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder="Un commentaire ? (optionnel)" rows={2}
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'none', outline: 'none' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 14, width: '100%' }}>
                  <button onClick={submitRating} disabled={rating < 1} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 10, background: rating < 1 ? '#a5b4fc' : PC, color: '#fff', fontWeight: 700, cursor: rating < 1 ? 'default' : 'pointer', fontSize: 13 }}>Envoyer</button>
                  <button onClick={skipRating} style={{ padding: '10px 16px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Passer</button>
                </div>
              </div>
            </div>
          )}

          {state === 'ended' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {header(CN)}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
                <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#15803d' }}>Session terminée</h3>
                <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>Merci d'avoir contacté le support DSI.<br />Un récapitulatif vous sera envoyé par e-mail.</p>
                <button onClick={closeWidget} style={{ padding: '10px 24px', background: PC, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Fermer</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function MessageBubble({ msg, isSelf }: { msg: LiveMessage; isSelf: boolean }) {
  const time = new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return (
    <div style={{ display: 'flex', flexDirection: isSelf ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6 }}>
      <div style={{
        maxWidth: '78%',
        background: isSelf ? '#6366f1' : '#fff',
        color: isSelf ? '#fff' : '#1e293b',
        borderRadius: isSelf ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        padding: '8px 13px', fontSize: 13, lineHeight: 1.5,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        border: isSelf ? 'none' : '1px solid #f1f5f9',
        wordBreak: 'break-word',
      }}>
        {!isSelf && (
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', marginBottom: 2 }}>
            {msg.sender_name}
          </div>
        )}
        {msg.attachment_url ? (
          <a href={msg.attachment_url} target="_blank" rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: isSelf ? '#fff' : '#6366f1', textDecoration: 'none' }}>
            <span style={{ fontSize: 18 }}>{getFileIconWidget(msg.attachment_name || '')}</span>
            <span style={{ textDecoration: 'underline', wordBreak: 'break-all', fontSize: 13 }}>{msg.attachment_name || msg.content}</span>
          </a>
        ) : (
          <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
        )}
        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 3, textAlign: 'right' }}>{time}</div>
      </div>
    </div>
  );
}

function getFileIconWidget(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
  if (['pdf'].includes(ext)) return '📄';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
  return '📎';
}
