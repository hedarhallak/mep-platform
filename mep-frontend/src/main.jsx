import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'  // initializes i18next before any component renders
import App from './App.jsx'
import { bootstrapBranding } from './lib/branding.js'

// Phase 5 / 90-D follow-up: vite-plugin-pwa auto-injection is disabled
// (vite.config.js → `injectRegister: false`) so the admin entry doesn't
// pick up PWA caching. The tenant entry registers the SW explicitly
// here. `virtual:pwa-register` is a virtual module provided by the
// plugin; safe to import unconditionally — in dev it's a no-op,
// in prod it returns the registerSW() helper.
import { registerSW } from 'virtual:pwa-register'
registerSW({ immediate: true })

// Phase 6-C (Section 99, May 14, 2026): load tenant branding from the
// subdomain BEFORE the React tree mounts. bootstrapBranding() resolves
// silently — success injects a <style> at :root, failure (no subdomain,
// 404, network error, 3s timeout) leaves the Constrai defaults from
// index.css in place. Either way, the first paint already has the
// correct brand color, so the login screen never flickers from
// Constrai-green to tenant-color on a fresh load.
bootstrapBranding().finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
