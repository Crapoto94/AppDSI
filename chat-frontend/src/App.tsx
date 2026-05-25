import { useState } from 'react'
import LoginPage from './LoginPage'
import ChatPage from './ChatPage'

export interface UserInfo {
  displayName: string
  email: string
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

  if (!auth) return <LoginPage onLogin={handleLogin} />
  return <ChatPage token={auth.token} user={auth.user} onLogout={handleLogout} />
}
