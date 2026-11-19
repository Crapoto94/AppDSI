import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import MaintenanceGate from './components/MaintenanceGate.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <MaintenanceGate>
        <App />
      </MaintenanceGate>
    </ThemeProvider>
  </StrictMode>,
)
