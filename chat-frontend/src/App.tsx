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
}

const DEFAULT_CONFIG: AppConfig = {
  live_enabled: true,
  closing_message: '',
  chat_name: 'Support DSI',
  chat_logo: '💬',
  primary_color: '#6366f1',
  secondary_color: '#818cf8',
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

export default function App() {
  const [auth, setAuth] = useState<{ token: string; user: UserInfo } | null>(loadAuth)
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)

  useEffect(() => {
    axios.get<AppConfig>('/api/live/public-config')
      .then(r => setConfig({ ...DEFAULT_CONFIG, ...r.data }))
      .catch(() => {})
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

  if (!auth) return <LoginPage onLogin={handleLogin} config={config} />
  return <ChatPage token={auth.token} user={auth.user} onLogout={handleLogout} config={config} />
}
