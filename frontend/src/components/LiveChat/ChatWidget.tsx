import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';

type ChatState = 'idle' | 'open' | 'connecting' | 'waiting' | 'active' | 'renaming' | 'ended';

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
  const [state, setState] = useState<ChatState>('idle');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [techName, setTechName] = useState('');
  const [error, setError] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [checking, setChecking] = useState(true); // checking for existing session on mount
  const [liveEnabled, setLiveEnabled] = useState<boolean | null>(null); // null = loading
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user') || '{}';
  let user: any = {};
  try { user = JSON.parse(userStr); } catch (e) {}

  // ── On mount: check live_enabled config + listen for changes ─────────
  useEffect(() => {
    if (!token) { setLiveEnabled(false); return; }
    axios.get('/api/live/config', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setLiveEnabled(r.data.live_enabled))
      .catch(() => setLiveEnabled(true)); // fail open

    const cfgSocket = io({ auth: { token }, transports: ['websocket', 'polling'] });
    cfgSocket.on('live_config', ({ live_enabled }: { live_enabled: boolean }) => {
      setLiveEnabled(live_enabled);
      if (!live_enabled) setState('idle');
    });
    return () => { cfgSocket.disconnect(); };
  }, [token]);

  // ── On mount: restore existing open session ────────────────────────
  useEffect(() => {
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
  }, []);

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
          setState('ended');
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

    const socket = io({ auth: { token }, transports: ['websocket', 'polling'] });
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
      setState('ended');
      socket.disconnect();
    });

    socket.on('connect_error', (err) => {
      console.error('[ChatWidget] socket error:', err.message);
    });

    return () => {
      stopPolling();
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
    // Note: don't clear SESSION_KEY here — user might want to reopen
  }

  function requestEnd() {
    setNewTitle('');
    setState('renaming');
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
    setState('ended');
  }

  // ── Render ─────────────────────────────────────────────────────────
  // Guard: admins/techs don't see the widget (they use the panel in /tickets)
  if (user.role === 'superadmin' || user.role === 'admin') return null;
  // Guard: wait for config load, or hide when disabled
  if (checking || liveEnabled === null || liveEnabled === false) return null;

  const bubble = (
    <button
      onClick={() => setState(sessionId ? (state === 'active' ? 'active' : 'waiting') : 'open')}
      title="Contacter le support DSI"
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        width: 56, height: 56, borderRadius: '50%',
        background: sessionId
          ? 'linear-gradient(135deg, #22c55e, #16a34a)'
          : 'linear-gradient(135deg, #6366f1, #818cf8)',
        border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(99,102,241,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24, color: '#fff',
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
    >
      {sessionId ? '🟢' : '💬'}
    </button>
  );

  const panelStyle: React.CSSProperties = {
    position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
    width: 370, height: (state === 'active' || state === 'waiting') ? 520 : 'auto',
    background: '#fff', borderRadius: 20,
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    animation: 'slideUp 0.2s ease',
  };

  const header = (title: string, subtitle?: string) => (
    <div style={{
      background: 'linear-gradient(135deg, #6366f1, #818cf8)',
      padding: '16px 18px', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderRadius: '20px 20px 0 0', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.25)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
          {state === 'active' ? '👨‍💻' : '💬'}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, opacity: 0.85 }}>{subtitle}</div>}
        </div>
      </div>
      <button onClick={closeWidget} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', opacity: 0.7, fontSize: 20, lineHeight: 1, padding: 0 }}>✕</button>
    </div>
  );

  if (state === 'idle') return bubble;

  if (state === 'open' || state === 'connecting') return (
    <div style={panelStyle}>
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      {header('Support DSI', 'Nous sommes là pour vous aider')}
      <div style={{ padding: 20, flex: 1 }}>
        <div style={{ marginBottom: 16, fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>👋</div>
          Bonjour <strong>{user.displayName || user.username}</strong> !<br />
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
            onFocus={e => e.target.style.borderColor = '#6366f1'}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            disabled={state === 'connecting'}
            autoFocus
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, marginBottom: 2 }}>
            <button type="button" onClick={toggleDictation}
              title={listening ? 'Arrêter la dictée' : 'Dictée vocale'}
              style={{ padding: '4px 10px', background: listening ? '#fef2f2' : 'transparent', color: listening ? '#dc2626' : '#94a3b8', border: `1px solid ${listening ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 7, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              🎤 {listening ? 'Arrêter' : 'Dicter'}
            </button>
          </div>
          <button type="submit"
            disabled={state === 'connecting' || !input.trim()}
            style={{ marginTop: 10, width: '100%', padding: '11px', background: (state === 'connecting' || !input.trim()) ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: state === 'connecting' ? 'default' : 'pointer' }}>
            {state === 'connecting' ? '⏳ Connexion...' : '🚀 Démarrer le chat'}
          </button>
        </form>
        <p style={{ marginTop: 10, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>Appuyez sur Entrée pour envoyer • Maj+Entrée pour saut de ligne</p>
      </div>
    </div>
  );

  if (state === 'waiting') return (
    <div style={panelStyle}>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      {header('Support DSI', 'En attente d\'un technicien...')}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} isSelf={msg.sender_type === 'user'} />
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', background: '#fafafa', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#6366f1', fontSize: 13, fontWeight: 600 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, background: '#6366f1', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
          En attente d'un technicien…
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>Votre demande est en file d'attente</p>
      </div>
    </div>
  );

  if (state === 'active') return (
    <div style={panelStyle}>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
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
          {/* Hidden file input */}
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
          {/* Attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Envoyer un fichier"
            style={{
              padding: '8px 10px', background: '#f8fafc', color: '#475569',
              border: '1.5px solid #e2e8f0', borderRadius: 10, cursor: 'pointer',
              fontSize: 16, lineHeight: 1, opacity: uploading ? 0.5 : 1, flexShrink: 0,
            }}>
            {uploading ? '⏳' : '📎'}
          </button>
          {/* Mic button */}
          <button onClick={toggleDictation} title={listening ? 'Arrêter la dictée' : 'Dictée vocale'}
            style={{
              padding: '8px 10px', background: listening ? '#fef2f2' : '#f8fafc',
              color: listening ? '#dc2626' : '#475569',
              border: `1.5px solid ${listening ? '#fca5a5' : '#e2e8f0'}`,
              borderRadius: 10, cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0,
            }}>
            🎤
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Votre message..."
            rows={2}
            style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'none', outline: 'none' }}
            onFocus={e => e.target.style.borderColor = '#6366f1'}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          />
          <button onClick={sendMessage}
            disabled={!input.trim()}
            style={{ padding: '8px 14px', background: input.trim() ? '#6366f1' : '#e2e8f0', color: input.trim() ? '#fff' : '#94a3b8', border: 'none', borderRadius: 10, fontWeight: 700, cursor: input.trim() ? 'pointer' : 'default', fontSize: 16 }}>
            ↑
          </button>
        </div>
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => confirmEnd()}
            style={{
              width: '100%', padding: '8px',
              background: '#fef2f2', color: '#dc2626',
              border: '1px solid #fecaca', borderRadius: 10,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fee2e2')}
            onMouseLeave={e => (e.currentTarget.style.background = '#fef2f2')}
          >
            ✕ Terminer le chat
          </button>
        </div>
      </div>
    </div>
  );

  if (state === 'renaming') return (
    <div style={{ ...panelStyle, height: 'auto' }}>
      {header('Terminer la session')}
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 14, color: '#374151', marginBottom: 16, lineHeight: 1.6 }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>📝</div>
          Souhaitez-vous renommer ce ticket ?<br />
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Laissez vide pour garder le titre par défaut.</span>
        </div>
        <input
          type="text"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="Ex : Problème imprimante bureau 3..."
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') confirmEnd(newTitle); }}
          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
          onFocus={e => e.target.style.borderColor = '#6366f1'}
          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={() => confirmEnd(newTitle)} style={{ flex: 1, padding: '10px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            ✅ Clôturer
          </button>
          <button onClick={() => setState('active')} style={{ padding: '10px 16px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );

  if (state === 'ended') return (
    <div style={panelStyle}>
      {header('Support DSI')}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#15803d' }}>Session terminée</h3>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
          Merci d'avoir contacté le support DSI.<br />
          Un récapitulatif vous sera envoyé par e-mail.
        </p>
        <button onClick={closeWidget} style={{ padding: '10px 24px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          Fermer
        </button>
      </div>
    </div>
  );

  return null;
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
