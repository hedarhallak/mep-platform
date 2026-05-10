// src/admin-main.jsx
//
// Phase 5 / 90-C — admin portal entry point.
//
// Mounted at admin.html (via vite.config.js's rollupOptions.input). Loads
// the same shared infrastructure as the tenant entry:
//   - Tailwind tokens via index.css
//   - i18next setup (English + French; admin defaults to English for now,
//     can be changed via the same `mep_language` localStorage key)
// then renders <AdminApp /> instead of the tenant <App />.
//
// NOTE: PWA service-worker registration is auto-injected by vite-plugin-pwa
// into both index.html and admin.html. For the admin entry that's slightly
// over-eager — admin is an internal-only tool that doesn't need offline
// caching. The SW caches /api/* paths under NetworkFirst (5min TTL). Under
// the vhost split (90-B), /api/super calls on tenant domain are 404'd
// before they can be cached, so there's no cross-domain SW poisoning.
// Tightening this is on the 90-E / Phase 6 follow-up list.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import AdminApp from './AdminApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
)
