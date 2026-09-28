import { useState, useEffect } from 'react'
import axios from 'axios'
import LoginPage from './LoginPage'
import ChatPage from './ChatPage'

export interface UserInfo {
  displayName: string
  email: string
}

export interface AppConfig {
  live_enabled: boolean
  closing_message: string
  chat_name: string
  chat_logo: string
  primary_color: string
  secondary_color: string
  ad_name: string
  ad_default_username: string
}

const DEFAULT_CONFIG: AppConfig = {
  live_enabled: true,
  closing_message: '',
  chat_name: 'Support DSI',
  chat_logo: '💬',
  primary_color: '#6366f1',
  secondary_color: '#818cf8',
  ad_name: 'Active Directory',
  ad_default_username: 'prenom.nom',
}

const TOKEN_KEY = 'chat_dmz_token'
const USER_KEY = 'chat_dmz_user'

function loadAuth(): { token: string; user: UserInfo } | null {
  const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
  const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY)
  if (!token || !raw) return null
  try {
    return { token, user: JSON.parse(raw) as UserInfo }
  } catch {
    return null
  }
}

export type ApiStatus = 'checking' | 'online' | 'offline'

const API_CHECK_INTERVAL_MS = 15000

export default function App() {
  const [auth, setAuth] = useState<{ token: string; user: UserInfo } | null>(loadAuth)
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking')

  useEffect(() => {
    let cancelled = false
    function check() {
      axios.get<AppConfig>('/api/live/public-config', { timeout: 5000 })
        .then(r => {
          if (cancelled) return
          setConfig({ ...DEFAULT_CONFIG, ...r.data })
          setApiStatus('online')
        })
        .catch(() => { if (!cancelled) setApiStatus('offline') })
    }
    check()
    const interval = setInterval(check, API_CHECK_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  function handleLogin(token: string, user: UserInfo, remember: boolean) {
    const storage = remember ? localStorage : sessionStorage
    storage.setItem(TOKEN_KEY, token)
    storage.setItem(USER_KEY, JSON.stringify(user))
    setAuth({ token, user })
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
    setAuth(null)
  }

  if (!auth) return <LoginPage onLogin={handleLogin} config={config} apiStatus={apiStatus} />
  return <ChatPage token={auth.token} user={auth.user} onLogout={handleLogout} config={config} />
}
