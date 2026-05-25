import { useState, useRef, type FormEvent } from 'react'
import axios from 'axios'
import type { UserInfo } from './App'

interface Props {
  onLogin: (token: string, user: UserInfo, remember: boolean) => void
}

type Tab = 'ad' | 'otp' | 'guest'

export default function LoginPage({ onLogin }: Props) {
  const [tab, setTab] = useState<Tab>('otp')
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // AD fields
  const [adUsername, setAdUsername] = useState('')
  const [adPassword, setAdPassword] = useState('')

  // OTP fields
  const [otpUsername, setOtpUsername] = useState('')
  const [otpEmailHint, setOtpEmailHint] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request')
  const otpInputRef = useRef<HTMLInputElement>(null)

  // Guest fields
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')

  function switchTab(t: Tab) {
    setTab(t)
    setError('')
  }

  const canSubmit = !loading && (() => {
    if (tab === 'ad') return adUsername.trim().length > 0 && adPassword.length > 0
    if (tab === 'otp') return otpStep === 'request'
      ? otpUsername.trim().length > 0
      : otpCode.trim().length === 4
    return guestName.trim().length > 0 && guestEmail.trim().length > 0
  })()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setLoading(true)
    try {
      if (tab === 'ad') {
        const res = await axios.post('/api/live/auth/ad', { username: adUsername.trim(), password: adPassword })
        onLogin(res.data.token as string, res.data.user as UserInfo, remember)
      } else if (tab === 'otp') {
        if (otpStep === 'request') {
          const res = await axios.post('/api/live/auth/otp/request', { username: otpUsername.trim() })
          setOtpEmailHint(res.data.emailHint || '')
          setOtpStep('verify')
          setOtpCode('')
          setTimeout(() => otpInputRef.current?.focus(), 100)
        } else {
          const res = await axios.post('/api/live/auth/otp/verify', { username: otpUsername.trim(), code: otpCode.trim() })
          onLogin(res.data.token as string, res.data.user as UserInfo, remember)
        }
      } else {
        const res = await axios.post('/api/live/guest-login', { displayName: guestName.trim(), email: guestEmail.trim() })
        onLogin(res.data.token as string, res.data.user as UserInfo, remember)
      }
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message : null
      setError(msg || 'Erreur lors de la connexion')
    } finally {
      setLoading(false)
    }
  }

  const tabs: { id: Tab; label: string; desc: string }[] = [
    { id: 'ad',    label: '🏢 Active Directory', desc: 'Connexion avec vos identifiants réseau' },
    { id: 'otp',   label: '✉️ Code par email',   desc: 'Réception d\'un code à 4 chiffres par email' },
    { id: 'guest', label: '👤 Sans vérification', desc: 'Nom et email sans authentification' },
  ]

  const submitLabel = loading ? '⏳ …'
    : tab === 'ad' ? '🔐 Se connecter'
    : tab === 'otp' && otpStep === 'request' ? '✉️ Recevoir le code'
    : tab === 'otp' ? '✅ Vérifier le code'
    : '💬 Démarrer le chat'

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 60%, #f0f9ff 100%)',
      padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 480,
        background: '#fff', borderRadius: 24,
        boxShadow: '0 20px 60px rgba(99,102,241,0.18)',
        padding: '40px 40px 36px',
      }}>
        {/* Branding */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 64, height: 64,
            background: 'linear-gradient(135deg, #6366f1, #818cf8)',
            borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, margin: '0 auto 14px',
            boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
          }}>💬</div>
          <h1 style={{ margin: '0 0 5px', fontSize: 22, fontWeight: 800, color: '#1e293b', letterSpacing: -0.5 }}>
            Support DSI
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Choisissez votre mode d'identification
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f1f5f9', borderRadius: 12, padding: 4 }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              type="button"
              style={{
                flex: 1, padding: '8px 4px',
                background: tab === t.id ? '#fff' : 'transparent',
                border: 'none', borderRadius: 9, cursor: 'pointer',
                fontSize: 11, fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? '#6366f1' : '#64748b',
                boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s', lineHeight: 1.4,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab description */}
        <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginBottom: 20 }}>
          {tabs.find(t => t.id === tab)?.desc}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 10, padding: '10px 14px',
            color: '#dc2626', fontSize: 13, marginBottom: 20,
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>

          {/* ── AD tab ─────────────────────────────────────────── */}
          {tab === 'ad' && (
            <>
              <Field label="Identifiant réseau">
                <input
                  type="text" value={adUsername} onChange={e => setAdUsername(e.target.value)}
                  placeholder="prenom.nom" required autoFocus autoComplete="username"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = '#6366f1')}
                  onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                />
              </Field>
              <Field label="Mot de passe">
                <input
                  type="password" value={adPassword} onChange={e => setAdPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="current-password"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = '#6366f1')}
                  onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                />
              </Field>
            </>
          )}

          {/* ── OTP tab ─────────────────────────────────────────── */}
          {tab === 'otp' && otpStep === 'request' && (
            <Field label="Identifiant Windows">
              <input
                type="text" value={otpUsername} onChange={e => setOtpUsername(e.target.value)}
                placeholder="prenom.nom" required autoFocus autoComplete="username"
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = '#6366f1')}
                onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
              />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5 }}>
                Réservé aux comptes <strong>@ivry94.fr</strong>
              </div>
            </Field>
          )}

          {tab === 'otp' && otpStep === 'verify' && (
            <>
              <div style={{
                background: '#f0fdf4', border: '1px solid #bbf7d0',
                borderRadius: 10, padding: '10px 14px', marginBottom: 18,
                fontSize: 13, color: '#166534',
              }}>
                ✅ Code envoyé à <strong>{otpEmailHint}</strong> — vérifiez votre boîte mail.
              </div>
              <Field label="Code à 4 chiffres">
                <input
                  ref={otpInputRef}
                  type="text" inputMode="numeric" pattern="[0-9]*" maxLength={4}
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1234" required autoFocus autoComplete="one-time-code"
                  style={{ ...inputStyle, textAlign: 'center', fontSize: 28, fontWeight: 800, letterSpacing: 14 }}
                  onFocus={e => (e.target.style.borderColor = '#6366f1')}
                  onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                />
              </Field>
              <button
                type="button"
                onClick={() => { setOtpStep('request'); setOtpCode(''); setError('') }}
                style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 12, cursor: 'pointer', padding: '0 0 14px', textDecoration: 'underline' }}
              >
                ← Modifier l'identifiant
              </button>
            </>
          )}

          {/* ── Guest tab ─────────────────────────────────────── */}
          {tab === 'guest' && (
            <>
              <div style={{
                background: '#fef9c3', border: '1px solid #fde68a',
                borderRadius: 10, padding: '8px 12px', marginBottom: 16,
                fontSize: 12, color: '#92400e',
              }}>
                ⚠️ Mode non authentifié — le technicien sera informé que votre identité n'est pas vérifiée.
              </div>
              <Field label="Nom et prénom">
                <input
                  type="text" value={guestName} onChange={e => setGuestName(e.target.value)}
                  placeholder="Jean Dupont" required autoFocus autoComplete="name"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = '#6366f1')}
                  onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                />
              </Field>
              <Field label="Adresse e-mail">
                <input
                  type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)}
                  placeholder="jean.dupont@exemple.fr" required autoComplete="email"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = '#6366f1')}
                  onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                />
              </Field>
            </>
          )}

          {/* Remember me */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#6366f1', flexShrink: 0 }}
              />
              <span style={{ fontSize: 14, color: '#475569' }}>Rester connecté</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: '100%', padding: '13px',
              background: canSubmit ? 'linear-gradient(135deg, #6366f1, #818cf8)' : '#a5b4fc',
              color: '#fff', border: 'none', borderRadius: 12,
              fontSize: 15, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default',
              boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { if (canSubmit) e.currentTarget.style.opacity = '0.92' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            {submitLabel}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 11, color: '#94a3b8', textAlign: 'center', lineHeight: 1.6 }}>
          Vos informations sont utilisées uniquement pour votre session de support.
        </p>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 13px',
  border: '1.5px solid #e2e8f0', borderRadius: 10,
  fontSize: 14, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box', transition: 'border-color 0.15s',
  color: '#1e293b', background: '#fff',
}
