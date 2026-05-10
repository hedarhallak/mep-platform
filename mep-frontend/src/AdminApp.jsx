// src/AdminApp.jsx
//
// Phase 5 / 90-C — admin portal shell (placeholder).
//
// This is intentionally a minimal stub. 90-C's scope is limited to wiring
// the multi-entry Vite build + Nginx so the admin portal serves a real
// React shell instead of the static placeholder from 90-A. Real admin
// screens land in 90-D (companies list, basic search/sort) and 90-E
// (auth flow validation across portals).
//
// Visual: matches the 90-A static placeholder design (dark slate
// background, centered card) but is now React-driven. The badge text is
// updated from "90-A • Infrastructure ready" to "90-C • React shell
// live" so a quick visual diff confirms 90-C deployed correctly.

import { useEffect } from 'react'

export default function AdminApp() {
  useEffect(() => {
    document.title = 'Constrai Admin'
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-200">
      <div className="text-center px-8 py-12">
        <h1 className="text-4xl font-bold mb-4">Constrai Admin</h1>
        <p className="text-lg text-slate-400">Internal portal — under construction.</p>
        <div className="mt-6 inline-block px-4 py-1 bg-slate-800 border border-slate-700 rounded-full text-sm text-slate-300">
          Phase 5 / 90-C • React shell live
        </div>
      </div>
    </div>
  )
}
