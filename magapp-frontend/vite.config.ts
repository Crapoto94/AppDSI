import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.PORT || '5174', 10),
    strictPort: false,
    host: true,
    allowedHosts: ['po22038', 'PO22038', 'magapp-dev.ivry.local', 'magapp.ivry.local'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/img': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      }
    }
  }
})
