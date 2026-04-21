import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['po22038', 'PO22038', 'dsihub.ivry.local', 'magapp.ivry.local'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/img': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/file_commandes': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/file_factures': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/file_certif': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/file_telecom': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/file_reunions': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      }
    }
  }
})
