import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const ENABLE_STRICT_MODE = true

createRoot(document.getElementById('root')!).render(
  ENABLE_STRICT_MODE ? (
    <StrictMode>
      <App />
    </StrictMode>
  ) : (
    <App />
  )
)
