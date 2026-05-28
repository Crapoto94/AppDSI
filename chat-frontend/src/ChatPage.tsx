import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react'
import { io, type Socket } from 'socket.io-client'
import axios from 'axios'
import type { UserInfo, AppConfig } from './App'
import EmojiPicker from './EmojiPicker'

interface Message {
  id: number
  session_id: number
  sender_type: 'user' | 'tech'
  sender_name: string
  content: string
  attachment_url?: string
  attachment_name?: string
  created_at: string
}

interface Session {
  id: number
  status: 'waiting' | 'active' | 'closed'
  tech_display_name: string | null
}

type ChatState = 'checking' | 'idle' | 'starting' | 'waiting' | 'active' | 'survey' | 'ended'

const SESSION_KEY = 'chat_dmz_session_id'

interface Props {
  token: string
  user: UserInfo
  onLogout: () => void
  config: AppConfig
}

export default function ChatPage({ token, user, onLogout, config }: Props) {
  const { chat_name, chat_logo, primary_color, secondary_color, live_enabled: liveEnabled, closing_message: closingMessage } = config
  const gradient = `linear-gradient(135deg, ${primary_color}, ${secondary_color})`

  const [state, setState] = useState<ChatState>('checking')
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [initMsg, setInitMsg] = useState('')
  const [techName, setTechName] = useState('')
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const [closeReason, setCloseReason] = useState<'normal' | 'rejected' | 'inactivity'>('normal')
  // Satisfaction survey
  const [surveyRating, setSurveyRating] = useState(0)
  const [surveyHover, setSurveyHover] = useState(0)
  const [surveyComment, setSurveyComment] = useState('')
  const [surveySubmitting, setSurveySubmitting] = useState(false)

  const socketRef = useRef<Socket | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const initRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<unknown>(null)

  const headers = { Authorization: `Bearer ${token}` }

  // Auto-scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const startPolling = useCallback((sid: number) => {
    stopPolling()
    const tick = async () => {
      try {
        const [msgRes, sessRes] = await Promise.all([
          axios.get<Message[]>(`/api/live/sessions/${sid}/messages`, { headers }),
          axios.get<Session>(`/api/live/sessions/${sid}`, { headers }),
        ])
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id))
          const fresh = msgRes.data.filter(m => !ids.has(m.id))
          return fresh.length ? [...prev, ...fresh] : prev
        })
        const s = sessRes.data
        if (s.status === 'active') {
          setState(prev => {
            if (prev === 'waiting') { setTechName(s.tech_display_name || 'Technicien DSI'); return 'active' }
            return prev
          })
        } else if (s.status === 'closed') {
          stopPolling(); localStorage.removeItem(SESSION_KEY); setState('ended')
        }
      } catch { /* ignore */ }
    }
    tick()
    pollRef.current = setInterval(tick, 2500)
  }, [token, stopPolling]) // eslint-disable-line react-hooks/exhaustive-deps

  // Restore session on mount
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY)
    if (!stored) { setState('idle'); return }
    axios.get<Session>(`/api/live/sessions/${stored}`, { headers })
      .then(res => {
        const s = res.data
        if (s.status === 'closed') { localStorage.removeItem(SESSION_KEY); setState('idle'); return }
        setSessionId(s.id)
        if (s.status === 'active') { setTechName(s.tech_display_name || 'Technicien DSI'); setState('active') }
        else setState('waiting')
      })
      .catch(() => { localStorage.removeItem(SESSION_KEY); setState('idle') })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Socket — mount once
  useEffect(() => {
    const socket = io({ auth: { token }, transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('new_message', (msg: Message) => {
      if (!msg) return
      setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg])
    })
    socket.on('session_history', (msgs: Message[]) => setMessages(msgs))
    socket.on('session_claimed', ({ tech }: { tech: { displayName: string } }) => {
      setTechName(tech.displayName); setState('active')
    })
    socket.on('session_closed', ({ reason }: { reason?: string } = {}) => {
      stopPolling()
      localStorage.removeItem(SESSION_KEY)
      const r = reason === 'rejected' ? 'rejected' : reason === 'inactivity' ? 'inactivity' : 'normal'
      setCloseReason(r)
      if (r === 'rejected') {
        setState('ended')
      } else {
        setSurveyRating(0); setSurveyHover(0); setSurveyComment('')
        setState('survey')
      }
    })

    return () => { stopPolling(); socket.disconnect(); socketRef.current = null }
  }, [token, stopPolling])

  // Join room + polling when sessionId changes
  useEffect(() => {
    if (!sessionId) return
    socketRef.current?.emit('join_session', { sessionId })
    startPolling(sessionId)
    return stopPolling
  }, [sessionId, startPolling, stopPolling])

  async function startChat(e: FormEvent) {
    e.preventDefault()
    if (!initMsg.trim()) return
    setError('')
    setState('starting')
    try {
      const res = await axios.post('/api/live/sessions', { content: initMsg.trim() }, { headers })
      const sid = res.data.session.id as number
      localStorage.setItem(SESSION_KEY, String(sid))
      setSessionId(sid)
      setInitMsg('')
      setState('waiting')
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message : null
      setError(msg || 'Erreur lors du démarrage du chat')
      setState('idle')
    }
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || !sessionId) return
    if (socketRef.current?.connected) {
      socketRef.current.emit('send_message', { sessionId, content: text })
      setInput('')
    } else {
      try {
        const r = await axios.post(`/api/live/sessions/${sessionId}/messages`, { content: text }, { headers })
        setMessages(prev => prev.find(m => m.id === (r.data as Message).id) ? prev : [...prev, r.data as Message])
        setInput('')
      } catch (err: unknown) {
        const msg = axios.isAxiosError(err) ? err.response?.data?.message : null
        alert(msg || 'Erreur lors de l\'envoi')
      }
    }
    inputRef.current?.focus()
  }

  async function endChat() {
    if (!sessionId) return
    stopPolling()
    localStorage.removeItem(SESSION_KEY)
    try { await axios.post(`/api/live/sessions/${sessionId}/close`, {}, { headers }) } catch { /* ignore */ }
    setCloseReason('normal')
    setSurveyRating(0); setSurveyHover(0); setSurveyComment('')
    setState('survey')
  }

  async function submitSurvey() {
    if (!surveyRating || !sessionId) return
    setSurveySubmitting(true)
    try {
      await axios.post(`/api/live/sessions/${sessionId}/satisfaction`, { rating: surveyRating, comment: surveyComment }, { headers })
    } catch { /* ignore */ }
    setSurveySubmitting(false)
    setState('ended')
  }

  function startNew() {
    setSessionId(null); setMessages([]); setInput(''); setInitMsg(''); setTechName(''); setState('idle')
  }

  function toggleDictation(setter: React.Dispatch<React.SetStateAction<string>>) {
    if (listening) {
      (recognitionRef.current as { stop(): void } | null)?.stop()
      setListening(false)
      return
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Dictée vocale non supportée par ce navigateur'); return }
    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.continuous = true
    rec.interimResults = false
    recognitionRef.current = rec
    rec.onresult = (e: any) => {
      const t = Array.from(e.results as any[]).slice(e.resultIndex).map((r: any) => r[0].transcript).join(' ')
      setter(prev => prev + (prev ? ' ' : '') + t)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    rec.start()
    setListening(true)
  }

  const logoContent = (chat_logo.startsWith('http') || chat_logo.startsWith('/'))
    ? <img src={chat_logo} alt="" style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 4 }} />
    : <span style={{ fontSize: 20 }}>{chat_logo}</span>

  // ── Layout ────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f0f4ff' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        * { box-sizing: border-box; }
      `}</style>

      {/* Header */}
      <header style={{
        background: gradient,
        padding: '0 24px', height: 64, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0,
        boxShadow: `0 2px 16px ${primary_color}4d`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, background: 'rgba(255,255,255,0.2)',
            borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{logoContent}</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', letterSpacing: -0.3 }}>{chat_name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>
              {state === 'active' ? `En ligne · ${techName}` : state === 'waiting' ? 'En attente d\'un technicien…' : 'Chat en direct'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>👤 {user.displayName}</span>
          <button onClick={onLogout} style={{
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
            color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
            fontSize: 12, fontWeight: 600,
          }}>
            Déconnexion
          </button>
        </div>
      </header>

      {/* Body */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: 740, height: '100%', display: 'flex', flexDirection: 'column', padding: '20px 16px 0' }}>

          {state === 'checking' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 36, height: 36, border: `4px solid ${primary_color}33`, borderTopColor: primary_color, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          )}

          {state === 'idle' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: 'slideUp 0.3s ease' }}>
              {!liveEnabled && closingMessage && (
                <div style={{
                  width: '100%', maxWidth: 520, marginBottom: 16,
                  background: '#fff7ed', border: '1px solid #fed7aa',
                  borderRadius: 12, padding: '12px 18px',
                  fontSize: 14, color: '#92400e', lineHeight: 1.6,
                }}>
                  ⏰ {closingMessage}
                </div>
              )}
              <div style={{
                background: '#fff', borderRadius: 20, padding: '36px 32px', width: '100%', maxWidth: 520,
                boxShadow: `0 8px 32px ${primary_color}1f`,
              }}>
                <div style={{ fontSize: 40, marginBottom: 12, textAlign: 'center' }}>👋</div>
                <h2 style={{ margin: '0 0 8px', textAlign: 'center', fontSize: 20, fontWeight: 800, color: '#1e293b' }}>
                  Bonjour, {user.displayName.split(' ')[0]} !
                </h2>
                <p style={{ margin: '0 0 24px', textAlign: 'center', fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
                  Décrivez votre problème ci-dessous et un technicien DSI vous répondra en direct.
                </p>
                {error && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
                    ⚠️ {error}
                  </div>
                )}
                <form onSubmit={startChat}>
                  <div style={{ position: 'relative', marginBottom: 12 }}>
                    <textarea
                      ref={initRef}
                      value={initMsg}
                      onChange={e => setInitMsg(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void startChat(e as unknown as FormEvent) } }}
                      placeholder="Décrivez votre problème… (Ex : Je n'arrive pas à me connecter au VPN)"
                      rows={4}
                      style={{
                        width: '100%', padding: '12px 14px', border: '1.5px solid #e2e8f0',
                        borderRadius: 12, fontSize: 14, fontFamily: 'inherit', resize: 'none', outline: 'none',
                      }}
                      onFocus={e => (e.target.style.borderColor = primary_color)}
                      onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                      autoFocus
                    />
                    <button type="button" onClick={() => toggleDictation(setInitMsg)}
                      title={listening ? 'Arrêter la dictée' : 'Dicter'}
                      style={{
                        position: 'absolute', bottom: 10, right: 10,
                        background: listening ? '#fef2f2' : '#f8fafc',
                        color: listening ? '#dc2626' : '#94a3b8',
                        border: `1px solid ${listening ? '#fca5a5' : '#e2e8f0'}`,
                        borderRadius: 7, padding: '4px 8px', cursor: 'pointer', fontSize: 13,
                      }}>
                      🎤
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                    <EmojiPicker onEmojiSelect={e => setInitMsg(prev => prev + e)} />
                  </div>
                  <button type="submit" disabled={!initMsg.trim()}
                    style={{
                      width: '100%', padding: '13px',
                      background: initMsg.trim() ? gradient : '#a5b4fc',
                      color: '#fff', border: 'none', borderRadius: 12,
                      fontSize: 15, fontWeight: 700, cursor: initMsg.trim() ? 'pointer' : 'default',
                      boxShadow: `0 4px 14px ${primary_color}4d`,
                    }}>
                    🚀 Démarrer le chat
                  </button>
                </form>
                <p style={{ margin: '12px 0 0', fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
                  Entrée pour envoyer · Maj+Entrée pour saut de ligne
                </p>
              </div>
            </div>
          )}

          {state === 'starting' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', color: primary_color }}>
                <div style={{ width: 36, height: 36, border: `4px solid ${primary_color}33`, borderTopColor: primary_color, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                <div style={{ fontSize: 14, fontWeight: 600 }}>Connexion en cours…</div>
              </div>
            </div>
          )}

          {(state === 'waiting' || state === 'active') && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '16px 16px 0 0', boxShadow: '0 -4px 24px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              {/* Status bar */}
              <div style={{
                padding: '10px 18px', borderBottom: '1px solid #f1f5f9',
                background: state === 'active' ? '#f0fdf4' : '#fefce8',
                display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: state === 'active' ? '#22c55e' : '#f59e0b',
                  animation: state === 'waiting' ? 'pulse 1.5s infinite' : 'none',
                }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: state === 'active' ? '#15803d' : '#92400e' }}>
                  {state === 'active' ? `✅ ${techName} a rejoint la conversation` : '⏳ En attente d\'un technicien disponible…'}
                </span>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 20 }}>
                    Début de la conversation
                  </div>
                )}
                {messages.map(msg => (
                  <MessageBubble key={msg.id} msg={msg} isSelf={msg.sender_type === 'user'} primaryColor={primary_color} />
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              {state === 'active' ? (
                <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 16px', background: '#fff', flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <button onClick={() => toggleDictation(setInput)}
                      title={listening ? 'Arrêter la dictée' : 'Dictée vocale'}
                      style={{
                        padding: '9px 11px',
                        background: listening ? '#fef2f2' : '#f8fafc',
                        color: listening ? '#dc2626' : '#64748b',
                        border: `1.5px solid ${listening ? '#fca5a5' : '#e2e8f0'}`,
                        borderRadius: 10, cursor: 'pointer', fontSize: 16, flexShrink: 0,
                      }}>
                      🎤
                    </button>
                    <EmojiPicker onEmojiSelect={e => setInput(prev => prev + e)} />
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() } }}
                      placeholder="Votre message… (Entrée pour envoyer)"
                      rows={2}
                      style={{
                        flex: 1, padding: '9px 13px', border: '1.5px solid #e2e8f0',
                        borderRadius: 10, fontSize: 14, fontFamily: 'inherit', resize: 'none', outline: 'none',
                      }}
                      onFocus={e => (e.target.style.borderColor = primary_color)}
                      onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                      autoFocus
                    />
                    <button onClick={() => void sendMessage()} disabled={!input.trim()}
                      style={{
                        padding: '9px 18px',
                        background: input.trim() ? primary_color : '#e2e8f0',
                        color: input.trim() ? '#fff' : '#94a3b8',
                        border: 'none', borderRadius: 10, fontWeight: 700,
                        cursor: input.trim() ? 'pointer' : 'default', fontSize: 18, flexShrink: 0,
                      }}>
                      ↑
                    </button>
                  </div>
                  <div style={{ marginTop: 10, textAlign: 'center' }}>
                    <button onClick={() => void endChat()} style={{
                      background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
                      fontSize: 12, textDecoration: 'underline',
                    }}>
                      Terminer la conversation
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', background: '#fefce8', flexShrink: 0, textAlign: 'center' }}>
                  <span style={{ fontSize: 12, color: '#92400e' }}>
                    Un technicien va prendre en charge votre demande…
                  </span>
                </div>
              )}
            </div>
          )}

          {state === 'survey' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'slideUp 0.3s ease' }}>
              <div style={{
                background: '#fff', borderRadius: 20, padding: '36px 32px', textAlign: 'center',
                boxShadow: '0 8px 32px rgba(0,0,0,0.08)', maxWidth: 440, width: '100%',
              }}>
                <div style={{ fontSize: 48, marginBottom: 10 }}>
                  {closeReason === 'inactivity' ? '⏱️' : '⭐'}
                </div>
                <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: '#1e293b' }}>
                  {closeReason === 'inactivity' ? 'Session expirée' : 'Session terminée'}
                </h2>
                <p style={{ margin: '0 0 24px', fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
                  Comment évaluez-vous la qualité du support reçu ?
                </p>

                {/* Stars */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
                  {[1, 2, 3, 4, 5].map(i => (
                    <button
                      key={i}
                      onClick={() => setSurveyRating(i)}
                      onMouseEnter={() => setSurveyHover(i)}
                      onMouseLeave={() => setSurveyHover(0)}
                      style={{
                        fontSize: 36, background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                        opacity: i <= (surveyHover || surveyRating) ? 1 : 0.2,
                        transform: i <= (surveyHover || surveyRating) ? 'scale(1.15)' : 'scale(1)',
                        transition: 'all 0.15s',
                        filter: i <= (surveyHover || surveyRating) ? 'drop-shadow(0 0 4px rgba(250,204,21,0.6))' : 'none',
                      }}
                    >⭐</button>
                  ))}
                </div>

                {surveyRating > 0 && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: primary_color, marginBottom: 16 }}>
                    {['', 'Très insatisfait 😞', 'Insatisfait 😕', 'Correct 😐', 'Satisfait 🙂', 'Très satisfait 😄'][surveyRating]}
                  </div>
                )}

                {/* Comment */}
                <textarea
                  value={surveyComment}
                  onChange={e => setSurveyComment(e.target.value)}
                  placeholder="Commentaire optionnel — partagez votre expérience…"
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 14px',
                    border: '1.5px solid #e2e8f0', borderRadius: 10,
                    fontSize: 13, fontFamily: 'inherit', resize: 'none', outline: 'none',
                    marginBottom: 16, boxSizing: 'border-box',
                  }}
                  onFocus={e => (e.target.style.borderColor = primary_color)}
                  onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                />

                <button
                  onClick={() => void submitSurvey()}
                  disabled={surveyRating === 0 || surveySubmitting}
                  style={{
                    width: '100%', padding: '12px',
                    background: surveyRating ? primary_color : '#a5b4fc',
                    color: '#fff', border: 'none', borderRadius: 12,
                    fontSize: 14, fontWeight: 700,
                    cursor: surveyRating ? 'pointer' : 'default',
                    marginBottom: 10,
                    boxShadow: surveyRating ? `0 4px 14px ${primary_color}4d` : 'none',
                  }}
                >
                  {surveySubmitting ? '⏳ Envoi…' : '📤 Envoyer mon avis'}
                </button>
                <button
                  onClick={() => setState('ended')}
                  style={{
                    background: 'none', border: 'none', color: '#94a3b8',
                    cursor: 'pointer', fontSize: 13, textDecoration: 'underline',
                  }}
                >
                  Passer
                </button>
              </div>
            </div>
          )}

          {state === 'ended' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'slideUp 0.3s ease' }}>
              <div style={{
                background: '#fff', borderRadius: 20, padding: '40px 32px', textAlign: 'center',
                boxShadow: '0 8px 32px rgba(0,0,0,0.08)', maxWidth: 400, width: '100%',
              }}>
                {closeReason === 'rejected' ? (
                  <>
                    <div style={{ fontSize: 52, marginBottom: 16 }}>🚫</div>
                    <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800, color: '#dc2626' }}>Demande refusée</h2>
                    <p style={{ margin: '0 0 28px', fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
                      Votre demande n'a pas pu être prise en charge pour le moment.<br />
                      Aucun ticket n'a été créé.
                    </p>
                  </>
                ) : closeReason === 'inactivity' ? (
                  <>
                    <div style={{ fontSize: 52, marginBottom: 16 }}>⏱️</div>
                    <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800, color: '#92400e' }}>Session expirée</h2>
                    <p style={{ margin: '0 0 28px', fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
                      La session a été fermée après 15 minutes d'inactivité.
                    </p>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
                    <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800, color: '#15803d' }}>Session terminée</h2>
                    <p style={{ margin: '0 0 28px', fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
                      Merci d'avoir contacté le support DSI.<br />
                      Un récapitulatif a été créé dans notre système.
                    </p>
                  </>
                )}
                <button onClick={startNew} style={{
                  padding: '12px 28px', background: primary_color, color: '#fff',
                  border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  boxShadow: `0 4px 14px ${primary_color}4d`,
                }}>
                  Nouvelle conversation
                </button>
                <div style={{ marginTop: 12 }}>
                  <button onClick={onLogout} style={{
                    background: 'none', border: 'none', color: '#94a3b8',
                    cursor: 'pointer', fontSize: 13, textDecoration: 'underline',
                  }}>
                    Se déconnecter
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

function MessageBubble({ msg, isSelf, primaryColor }: { msg: Message; isSelf: boolean; primaryColor: string }) {
  const time = new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return (
    <div style={{ display: 'flex', flexDirection: isSelf ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6 }}>
      {!isSelf && (
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
          👨‍💻
        </div>
      )}
      <div style={{
        maxWidth: '75%',
        background: isSelf ? primaryColor : '#fff',
        color: isSelf ? '#fff' : '#1e293b',
        borderRadius: isSelf ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        padding: '9px 14px', fontSize: 14, lineHeight: 1.5,
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        border: isSelf ? 'none' : '1px solid #f1f5f9',
        wordBreak: 'break-word',
      }}>
        {!isSelf && (
          <div style={{ fontSize: 11, fontWeight: 700, color: primaryColor, marginBottom: 3 }}>{msg.sender_name}</div>
        )}
        {msg.attachment_url ? (
          <a href={msg.attachment_url} target="_blank" rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: isSelf ? '#fff' : primaryColor, textDecoration: 'none' }}>
            <span>📎</span>
            <span style={{ textDecoration: 'underline', wordBreak: 'break-all', fontSize: 13 }}>{msg.attachment_name || msg.content}</span>
          </a>
        ) : (
          <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
        )}
        <div style={{ fontSize: 10, opacity: 0.55, marginTop: 4, textAlign: 'right' }}>{time}</div>
      </div>
    </div>
  )
}
