import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import MaintenanceGate from './components/MaintenanceGate.tsx'
import AppDialogHost from './components/AppDialogs.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <MaintenanceGate>
        <App />
      </MaintenanceGate>
      <AppDialogHost />
    </ThemeProvider>
  </StrictMode>,
)
