import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'  // initializes i18next before any component renders
import App from './App.jsx'

// Phase 5 / 90-D follow-up: vite-plugin-pwa auto-injection is disabled
// (vite.config.js → `injectRegister: false`) so the admin entry doesn't
// pick up PWA caching. The tenant entry registers the SW explicitly
// here. `virtual:pwa-register` is a virtual module provided by the
// plugin; safe to import unconditionally — in dev it's a no-op,
// in prod it returns the registerSW() helper.
import { registerSW } from 'virtual:pwa-register'
registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
