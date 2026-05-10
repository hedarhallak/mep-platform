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
// 90-D follow-up: PWA registration is disabled for the admin entry. The
// vite-plugin-pwa setting `injectRegister: false` (see vite.config.js)
// stops auto-injection on admin.html; the tenant entry (main.jsx) opts
// back in explicitly. We also UNREGISTER any pre-existing service worker
// on this origin on every page load — that takes care of the SW that was
// auto-installed by 90-C before this fix shipped. Without that cleanup,
// a stale 90-C-era SW would keep serving cached tenant index.html as the
// navigation fallback for admin routes, causing the visible bug we hit:
// /login on admin.constrai.ca rendered the tenant login UI instead of
// the admin React Router NotFound page.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import AdminApp from './AdminApp.jsx'

// One-shot cleanup of any SW left behind by the 90-C build. Idempotent:
// once the SW is gone (typically after one reload), getRegistrations()
// returns an empty list and this is a no-op. Safe to keep indefinitely.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {
      // ignore — best-effort cleanup
    })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
)
