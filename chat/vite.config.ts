import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      // Serveur MCP local (chat/mcp) — /mcp/login reste servi par Vite (page React).
      '^/mcp$': { target: 'http://127.0.0.1:5176', changeOrigin: true },
      '/mcp/oauth': { target: 'http://127.0.0.1:5176', changeOrigin: true },
      '/.well-known/oauth': { target: 'http://127.0.0.1:5176', changeOrigin: true },
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        ws: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    }
  }
})
