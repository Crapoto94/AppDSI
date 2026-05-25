import { useState, type FormEvent } from 'react'
import axios from 'axios'
import type { UserInfo } from './App'

interface Props {
  onLogin: (token: string, user: UserInfo, remember: boolean) => void
}

export default function LoginPage({ onLogin }: Props) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!displayName.trim() || !email.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await axios.post('/api/live/guest-login', {
        displayName: displayName.trim(),
        email: email.trim(),
      })
      onLogin(res.data.token as string, res.data.user as UserInfo, remember)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message : null
      setError(msg || 'Erreur lors de la connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 60%, #f0f9ff 100%)',
      padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: '#fff', borderRadius: 24,
        boxShadow: '0 20px 60px rgba(99,102,241,0.18)',
        padding: '44px 40px',
      }}>
        {/* Branding */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 72, height: 72,
            background: 'linear-gradient(135deg, #6366f1, #818cf8)',
            borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, margin: '0 auto 18px',
            boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
          }}>💬</div>
          <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#1e293b', letterSpacing: -0.5 }}>
            Support DSI
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
            Identifiez-vous pour démarrer le chat
          </p>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 10, padding: '10px 14px',
            color: '#dc2626', fontSize: 13, marginBottom: 22,
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
              Nom et prénom
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Jean Dupont"
              required
              autoFocus
              autoComplete="name"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = '#6366f1')}
              onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
              Adresse e-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="jean.dupont@exemple.fr"
              required
              autoComplete="email"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = '#6366f1')}
              onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#6366f1', flexShrink: 0 }}
              />
              <span style={{ fontSize: 14, color: '#475569' }}>Rester connecté</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !displayName.trim() || !email.trim()}
            style={{
              width: '100%', padding: '14px',
              background: loading || !displayName.trim() || !email.trim()
                ? '#a5b4fc'
                : 'linear-gradient(135deg, #6366f1, #818cf8)',
              color: '#fff', border: 'none', borderRadius: 12,
              fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
              boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
              transition: 'opacity 0.15s, transform 0.1s',
            }}
            onMouseEnter={e => { if (!loading) (e.currentTarget.style.opacity = '0.92') }}
            onMouseLeave={e => { (e.currentTarget.style.opacity = '1') }}
          >
            {loading ? '⏳ Connexion…' : '💬 Démarrer le chat'}
          </button>
        </form>

        <p style={{ marginTop: 22, fontSize: 11, color: '#94a3b8', textAlign: 'center', lineHeight: 1.6 }}>
          Vos informations sont utilisées uniquement pour identifier votre session de support.
        </p>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px',
  border: '1.5px solid #e2e8f0', borderRadius: 10,
  fontSize: 14, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box', transition: 'border-color 0.15s',
  color: '#1e293b', background: '#fff',
}
