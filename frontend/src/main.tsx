import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './index.css'
import { authRequired, getToken, installAuthFetch, verifySession } from './services/auth'
import { LoginScreen } from './components/auth/LoginScreen'

installAuthFetch()
try {
  if (localStorage.getItem('theme') === 'light') document.documentElement.classList.add('light')
} catch { /* default theme */ }

const root = createRoot(document.getElementById('root')!)

// Sign-in is settled before the Studio loads: its stores restore the signed-in user's own history.
const start = async () => {
  if (await authRequired() && !(getToken() && await verifySession())) {
    root.render(<StrictMode><LoginScreen /></StrictMode>)
    return
  }
  const { default: App } = await import('./App.tsx')
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

start()
