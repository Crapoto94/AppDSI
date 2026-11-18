import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import McpAuthorizePage from './McpAuthorizePage'

// /mcp/login : page d'autorisation d'un client MCP (flux OAuth du serveur chat/mcp).
const isMcpLogin = window.location.pathname.replace(/\/+$/, '') === '/mcp/login'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isMcpLogin ? <McpAuthorizePage /> : <App />}
  </StrictMode>,
)
