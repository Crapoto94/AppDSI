import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

type ChatState = 'idle' | 'open' | 'connecting' | 'waiting' | 'active' | 'rating' | 'ended';

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
}

const SESSION_KEY = 'live_session_id_magapp';
const PC = '#6366f1';
const SC = '#818cf8';

interface Props {
  liveEnabled: boolean;
}

export default function ChatWidget({ liveEnabled }: Props) {
  const [state, setState] = useState<ChatState>('idle');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [techName, setTechName] = useState('');
  const [checking, setChecking] = useState(true);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const token = localStorage.getItem('token');

  // Restore existing session on mount
  useEffect(() => {
    if (!liveEnabled) { setChecking(false); return; }
    const storedId = localStorage.getItem(SESSION_KEY);
    if (!storedId) { setChecking(false); return; }
    axios.get<LiveSession>(`/api/live/sessions/${storedId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      const session = res.data;
      if (session.status === 'closed') {
        localStorage.removeItem(SESSION_KEY);
      } else {
        setSessionId(session.id);
        if (session.status === 'active') {
          setTechName(session.tech_display_name || 'Technicien DSI');
          setState('active');
        } else {
          setState('waiting');
        }
      }
    }).catch(() => localStorage.removeItem(SESSION_KEY))
      .finally(() => setChecking(false));
  }, [liveEnabled]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Polling
  const startPolling = useCallback((sid: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const [msgRes, sessionRes] = await Promise.all([
          axios.get<LiveMessage[]>(`/api/live/sessions/${sid}/messages`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get<LiveSession>(`/api/live/sessions/${sid}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id));
          const newOnes = msgRes.data.filter(m => !ids.has(m.id));
          return newOnes.length ? [...prev, ...newOnes] : prev;
        });
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
        }
      } catch { /* ignore */ }
    };
    tick();
    pollRef.current = setInterval(tick, 3000);
  }, [token]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    if (sessionId) startPolling(sessionId);
    return () => stopPolling();
  }, [sessionId, startPolling, stopPolling]);

  // ── Actions ──────────────────────────────────────────────────────────

  const startSession = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    setSending(true);
    setState('connecting');
    try {
      const res = await axios.post('/api/live/sessions', {
        content: input.trim(),
      }, { headers: { Authorization: `Bearer ${token}` } });
      const sid = res.data.session?.id || res.data.session_id || res.data.id;
      localStorage.setItem(SESSION_KEY, String(sid));
      setSessionId(sid);
      setInput('');
      setState('waiting');
    } catch {
      setState('open');
    } finally {
      setSending(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !sessionId) return;
    const text = input.trim();
    setInput('');
    textareaRef.current?.focus();
    try {
      await axios.post(`/api/live/sessions/${sessionId}/messages`, { content: text }, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* ignore */ }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;
    e.target.value = '';
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await axios.post(`/api/live/sessions/${sessionId}/upload`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de l\'envoi du fichier');
    } finally {
      setUploading(false);
    }
  };

  const toggleDictation = () => {
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
  };

  const closeSession = async () => {
    stopPolling();
    if (sessionId) {
      try {
        await axios.post(`/api/live/sessions/${sessionId}/close`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch { /* ignore */ }
      localStorage.removeItem(SESSION_KEY);
    }
    setSessionId(null);
    setMessages([]);
    setState('rating');
  };

  const submitRating = async () => {
    try {
      if (sessionId && rating > 0) {
        await axios.post(`/api/live/sessions/${sessionId}/satisfaction`, { rating, comment: ratingComment.trim() || undefined }, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch { /* ignore */ }
    setRatingSubmitted(true);
    setState('ended');
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (state === 'open') startSession();
      else if (state === 'active') sendMessage();
    }
  };

  const closeWidget = () => {
    stopPolling();
    setState('idle');
    setMessages([]);
    setSessionId(null);
    setTechName('');
    setInput('');
    setRating(0);
    setRatingComment('');
    setRatingSubmitted(false);
  };

  // ── Guards ───────────────────────────────────────────────────────────
  if (!liveEnabled || checking) return null;

  // ── Shared styles ────────────────────────────────────────────────────
  const panelStyle: React.CSSProperties = {
    position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
    width: 360, background: '#fff', borderRadius: 20,
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    animation: 'chatSlideUp 0.2s ease',
  };

  const header = (title: string, subtitle?: string) => (
    <div style={{
      background: state === 'active'
        ? 'linear-gradient(135deg, #22c55e, #16a34a)'
        : `linear-gradient(135deg, ${PC}, ${SC})`,
      padding: '14px 16px', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderRadius: '20px 20px 0 0', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
          {state === 'active' ? '👨‍💻' : '💬'}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {title}
            <span style={{ marginLeft: 6, background: 'rgba(255,255,255,0.25)', fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: 4, letterSpacing: '0.05em' }}>BETA</span>
          </div>
          {subtitle && <div style={{ fontSize: 11, opacity: 0.85 }}>{subtitle}</div>}
        </div>
      </div>
      <button onClick={closeWidget} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', opacity: 0.7, fontSize: 20, lineHeight: 1, padding: 0 }}>✕</button>
    </div>
  );

  // ── Bubble ────────────────────────────────────────────────────────────
  if (state === 'idle' || state === 'ended') {
    return (
      <button
        onClick={() => setState(sessionId ? (state === 'ended' ? 'open' : 'waiting') : 'open')}
        title="Contacter le support DSI"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 56, height: 56, borderRadius: '50%',
          background: sessionId
            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
            : `linear-gradient(135deg, ${PC}, ${SC})`,
          border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(99,102,241,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', transition: 'transform 0.2s',
          fontSize: 24, position: 'fixed' as any,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
      >
        {sessionId ? '🟢' : '💬'}
        <span style={{
          position: 'absolute', top: -4, right: -4,
          background: '#f59e0b', color: '#1e293b',
          fontSize: '0.5rem', fontWeight: 900,
          padding: '2px 5px', borderRadius: 6,
          letterSpacing: '0.05em', lineHeight: 1.4,
        }}>BETA</span>
      </button>
    );
  }

  // ── Open / Connecting form ────────────────────────────────────────────
  if (state === 'open' || state === 'connecting') return (
    <div style={panelStyle}>
      <style>{`@keyframes chatSlideUp { from { opacity:0; transform:translateY(16px);} to { opacity:1; transform:translateY(0);} }`}</style>
      {header('Support DSI', 'Nous sommes là pour vous aider')}
      <div style={{ padding: 20, flex: 1 }}>
        <div style={{ marginBottom: 14, fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>👋</div>
          Décrivez votre problème et un technicien DSI vous répondra en direct.
        </div>
        <form onSubmit={startSession}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Décrivez votre problème…"
            rows={4}
            disabled={state === 'connecting'}
            autoFocus
            style={{
              width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0',
              borderRadius: 10, fontSize: 13, fontFamily: 'inherit',
              boxSizing: 'border-box', resize: 'none', outline: 'none', lineHeight: 1.5,
            }}
            onFocus={e => e.target.style.borderColor = PC}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, marginBottom: 2 }}>
            <button type="button" onClick={toggleDictation}
              title={listening ? 'Arrêter la dictée' : 'Dictée vocale'}
              style={{
                padding: '4px 10px', background: listening ? '#fef2f2' : 'transparent',
                color: listening ? '#dc2626' : '#94a3b8',
                border: `1px solid ${listening ? '#fca5a5' : '#e2e8f0'}`,
                borderRadius: 7, cursor: 'pointer', fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
              🎤 {listening ? 'Arrêter' : 'Dicter'}
            </button>
          </div>
          <button type="submit"
            disabled={state === 'connecting' || !input.trim()}
            style={{
              marginTop: 8, width: '100%', padding: 11,
              background: (state === 'connecting' || !input.trim()) ? '#a5b4fc' : PC,
              color: '#fff', border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 700,
              cursor: state === 'connecting' ? 'default' : 'pointer',
            }}>
            {state === 'connecting' ? '⏳ Connexion…' : '🚀 Démarrer le chat'}
          </button>
        </form>
        <p style={{ marginTop: 10, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
          Entrée pour envoyer · Maj+Entrée pour saut de ligne
        </p>
      </div>
    </div>
  );

  // ── Waiting ───────────────────────────────────────────────────────────
  if (state === 'waiting') return (
    <div style={{ ...panelStyle, height: 480 }}>
      <style>{`@keyframes chatSlideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      {header('Support DSI', 'En attente d\'un technicien…')}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', marginTop: 20 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>⏳</div>
            Un technicien va vous prendre en charge…
          </div>
        )}
        {messages.map(m => <MessageBubble key={m.id} msg={m} />)}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', background: '#fafafa', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: PC, fontSize: 13, fontWeight: 600 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, background: PC, borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
          Votre demande est en file d'attente
        </div>
      </div>
    </div>
  );

  // ── Active ────────────────────────────────────────────────────────────
  if (state === 'active') return (
    <div style={{ ...panelStyle, height: 520 }}>
      <style>{`@keyframes chatSlideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {header(techName || 'Technicien DSI', 'En ligne')}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', margin: '6px 0' }}>
          <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20 }}>
            ✅ {techName} a rejoint la conversation
          </span>
        </div>
        {messages.map(m => <MessageBubble key={m.id} msg={m} />)}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '10px 12px', borderTop: '1px solid #e2e8f0', background: '#fff' }}>
        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 8 }}>
          {/* Attach */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Envoyer un fichier"
            style={{
              padding: '7px 10px', background: '#f8fafc', color: '#475569',
              border: '1.5px solid #e2e8f0', borderRadius: 10, cursor: 'pointer',
              fontSize: 16, lineHeight: 1, opacity: uploading ? 0.5 : 1, flexShrink: 0,
            }}>
            {uploading ? '⏳' : '📎'}
          </button>
          {/* Mic */}
          <button onClick={toggleDictation} title={listening ? 'Arrêter la dictée' : 'Dictée vocale'}
            style={{
              padding: '7px 10px',
              background: listening ? '#fef2f2' : '#f8fafc',
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
            onKeyDown={handleKey}
            placeholder="Votre message…"
            rows={2}
            autoFocus
            style={{
              flex: 1, padding: '7px 10px', border: '1.5px solid #e2e8f0',
              borderRadius: 10, fontSize: 13, fontFamily: 'inherit',
              resize: 'none', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = PC}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          />
          {/* Send */}
          <button onClick={sendMessage} disabled={!input.trim() || sending}
            style={{
              padding: '7px 12px',
              background: input.trim() && !sending ? PC : '#e2e8f0',
              color: input.trim() && !sending ? '#fff' : '#94a3b8',
              border: 'none', borderRadius: 10,
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              fontSize: 18, flexShrink: 0,
            }}>
            ↑
          </button>
        </div>
        {/* Terminer */}
        <button
          onClick={closeSession}
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
  );

  // ── Rating ────────────────────────────────────────────────────────────
  if (state === 'rating') return (
    <div style={panelStyle}>
      <style>{`@keyframes chatSlideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {header('Support DSI')}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: '#18181b' }}>Votre avis nous intéresse</h3>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>Comment s'est passée votre session ?</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[1,2,3,4,5].map(star => (
            <button key={star} onClick={() => setRating(star)}
              style={{
                width: 40, height: 40, borderRadius: '50%', border: 'none',
                background: star <= rating ? PC : '#f1f5f9',
                color: star <= rating ? '#fff' : '#94a3b8',
                cursor: 'pointer', fontSize: 18, lineHeight: 1,
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={e => { if (star > rating) { (e.currentTarget as HTMLElement).style.background = '#e0e7ff'; (e.currentTarget as HTMLElement).style.color = PC; } }}
              onMouseLeave={e => { if (star > rating) { (e.currentTarget as HTMLElement).style.background = '#f1f5f9'; (e.currentTarget as HTMLElement).style.color = '#94a3b8'; } }}>
              ★
            </button>
          ))}
        </div>
        <textarea
          value={ratingComment}
          onChange={e => setRatingComment(e.target.value)}
          placeholder="Un commentaire ? (optionnel)"
          rows={2}
          style={{
            width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0',
            borderRadius: 10, fontSize: 12, fontFamily: 'inherit',
            boxSizing: 'border-box', resize: 'none', outline: 'none', lineHeight: 1.4,
          }}
          onFocus={e => e.target.style.borderColor = PC}
          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 14, width: '100%' }}>
          <button onClick={submitRating} disabled={rating < 1}
            style={{
              flex: 1, padding: 10, border: 'none', borderRadius: 10,
              background: rating < 1 ? '#a5b4fc' : PC,
              color: '#fff', fontWeight: 700,
              cursor: rating < 1 ? 'default' : 'pointer', fontSize: 13,
            }}>
            Envoyer
          </button>
          <button onClick={() => setState('ended')}
            style={{ padding: '10px 16px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            Passer
          </button>
        </div>
      </div>
    </div>
  );

  // ── Ended ─────────────────────────────────────────────────────────────
  return (
    <div style={panelStyle}>
      {header('Support DSI')}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#15803d' }}>Session terminée</h3>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
          Merci d'avoir contacté le support DSI.
        </p>
        <button onClick={closeWidget}
          style={{ padding: '10px 24px', background: PC, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          Fermer
        </button>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: LiveMessage }) {
  const isSelf = msg.sender_type === 'user';
  const time = new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return (
    <div style={{ display: 'flex', flexDirection: isSelf ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6 }}>
      <div style={{
        maxWidth: '78%',
        background: isSelf ? PC : '#fff',
        color: isSelf ? '#fff' : '#1e293b',
        borderRadius: isSelf ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        padding: '8px 13px', fontSize: 13, lineHeight: 1.5,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        border: isSelf ? 'none' : '1px solid #f1f5f9',
        wordBreak: 'break-word',
      }}>
        {!isSelf && (
          <div style={{ fontSize: 10, fontWeight: 700, color: PC, marginBottom: 2 }}>{msg.sender_name}</div>
        )}
        {msg.attachment_url ? (
          <a href={msg.attachment_url} target="_blank" rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: isSelf ? '#fff' : PC, textDecoration: 'none' }}>
            <span style={{ fontSize: 18 }}>{getFileIcon(msg.attachment_name || '')}</span>
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

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
  if (ext === 'pdf') return '📄';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
  return '📎';
}
