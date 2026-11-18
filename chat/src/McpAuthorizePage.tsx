import { useEffect, useState, type FormEvent, type CSSProperties } from 'react'
import axios from 'axios'

/**
 * Page d'autorisation d'un client MCP (Claude…) — /mcp/login?request=…
 *
 * Le serveur MCP (chat/mcp) redirige ici pendant le flux OAuth. La personne
 * fournit les DEUX facteurs exigés : sa clé API dataquery et ses identifiants
 * Windows (AD). Ils sont transmis au serveur MCP, qui les fait vérifier par le
 * backend puis renvoie l'adresse de retour vers le client MCP.
 */

interface RequestInfo { client_name: string; redirect_host: string; expires_at: string }
interface PublicConfig { chat_name?: string; chat_logo?: string; primary_color?: string; secondary_color?: string; ad_name?: string }

const errorOf = (e: unknown, fallback: string) =>
  (axios.isAxiosError(e) && (e.response?.data as { error?: string } | undefined)?.error) || fallback

export default function McpAuthorizePage() {
  const requestId = new URLSearchParams(window.location.search).get('request') || ''
  const [info, setInfo] = useState<RequestInfo | null>(null)
  const [config, setConfig] = useState<PublicConfig>({})
  const [loadError, setLoadError] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string>('')

  const primary = config.primary_color || '#6366f1'
  const secondary = config.secondary_color || '#8b5cf6'

  useEffect(() => {
    document.title = 'Autoriser un client MCP'
    axios.get<PublicConfig>('/api/live/public-config', { timeout: 5000 }).then(r => setConfig(r.data)).catch(() => {})
    if (!requestId) { setLoadError('Lien incomplet : relancez la connexion depuis votre client MCP.'); return }
    axios.get<RequestInfo>(`/mcp/oauth/request/${encodeURIComponent(requestId)}`)
      .then(r => setInfo(r.data))
      .catch(e => setLoadError(errorOf(e, 'Demande introuvable.')))
  }, [requestId])

  const canSubmit = !loading && username.trim() !== '' && password !== '' && apiKey.trim().startsWith('dsk_')

  async function authorize(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true); setError('')
    try {
      const r = await axios.post<{ redirect: string; user: { displayName: string } }>('/mcp/oauth/login', {
        request: requestId, username: username.trim(), password, api_key: apiKey.trim(),
      })
      setPassword(''); setApiKey('')
      setDone(`Accès autorisé pour ${r.data.user?.displayName || username}. Retour vers ${info?.client_name}…`)
      window.location.assign(r.data.redirect)
    } catch (err) {
      setPassword('')
      setError(errorOf(err, 'Échec de l\'authentification'))
      setLoading(false)
    }
  }

  async function deny() {
    setLoading(true)
    try {
      const r = await axios.post<{ redirect: string }>('/mcp/oauth/deny', { request: requestId })
      window.location.assign(r.data.redirect)
    } catch (err) {
      setError(errorOf(err, 'Impossible de refuser la demande'))
      setLoading(false)
    }
  }

  const input: CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '11px 14px', fontSize: 15,
    border: '1.5px solid #e2e8f0', borderRadius: 10, outline: 'none', background: '#f8fafc', color: '#0f172a',
  }
  const label: CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', margin: '14px 0 6px' }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 60%, #f0f9ff 100%)',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ background: '#fff', borderRadius: 24, boxShadow: '0 20px 60px rgba(15,23,42,0.12)', width: '100%', maxWidth: 440, padding: '28px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(135deg, ${primary}, ${secondary})`, color: '#fff', fontWeight: 900, fontSize: 18,
          }}>
            {config.chat_logo ? <img src={config.chat_logo} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} /> : 'MCP'}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Autoriser l'accès aux données</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{config.chat_name || 'DSI'} — connecteur MCP</div>
          </div>
        </div>

        {loadError ? (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', color: '#b91c1c', fontSize: 14 }}>
            {loadError}
          </div>
        ) : !info ? (
          <div style={{ color: '#64748b', fontSize: 14 }}>Chargement…</div>
        ) : done ? (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px', color: '#15803d', fontSize: 14 }}>
            {done}
          </div>
        ) : (
          <form onSubmit={authorize} autoComplete="off">
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
              <strong>{info.client_name}</strong> demande à interroger les données de l'application
              (retour vers <code style={{ fontSize: 13 }}>{info.redirect_host}</code>).
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#475569', fontSize: 13 }}>
                <li>lecture seule, données sensibles masquées ;</li>
                <li>chaque requête est tracée à votre nom ;</li>
                <li>accès valable au plus 8 heures.</li>
              </ul>
            </div>

            <label style={label} htmlFor="mcp-user">Identifiant Windows</label>
            <input id="mcp-user" style={input} value={username} onChange={e => setUsername(e.target.value)}
              autoComplete="username" placeholder="prenom.nom" autoFocus />

            <label style={label} htmlFor="mcp-pwd">Mot de passe {config.ad_name || 'Windows'}</label>
            <input id="mcp-pwd" style={input} type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete="current-password" />

            <label style={label} htmlFor="mcp-key">Clé API (dsk_…)</label>
            <input id="mcp-key" style={{ ...input, fontFamily: 'ui-monospace, monospace', fontSize: 13 }} type="password"
              value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" spellCheck={false} placeholder="dsk_…" />
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
              Clé de périmètre « Interrogation SQL lecture seule », fournie par la DSI.
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#b91c1c', fontSize: 14, marginTop: 14 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={deny} disabled={loading} style={{
                flex: 1, padding: '12px 0', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff',
                color: '#475569', fontWeight: 700, fontSize: 15, cursor: loading ? 'default' : 'pointer',
              }}>Refuser</button>
              <button type="submit" disabled={!canSubmit} style={{
                flex: 2, padding: '12px 0', borderRadius: 12, border: 'none', color: '#fff', fontWeight: 800, fontSize: 15,
                background: canSubmit ? `linear-gradient(135deg, ${primary}, ${secondary})` : '#cbd5e1',
                cursor: canSubmit ? 'pointer' : 'default',
              }}>{loading ? 'Vérification…' : 'Autoriser'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
