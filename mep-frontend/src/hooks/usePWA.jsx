// src/hooks/usePWA.jsx
// Manages PWA install prompt and SW updates

import { useState, useEffect } from 'react'

export function usePWA() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstalled, setIsInstalled]     = useState(false)
  const [isOnline, setIsOnline]           = useState(navigator.onLine)
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true
    setIsInstalled(standalone)

    // Capture install prompt
    const onBeforeInstall = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
    }

    // App installed
    const onAppInstalled = () => {
      setIsInstalled(true)
      setInstallPrompt(null)
    }

    // Online/offline
    const onOnline  = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onAppInstalled)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // Listen for SW update
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateAvailable(true)
            }
          })
        })
      })
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onAppInstalled)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const promptInstall = async () => {
    if (!installPrompt) return false
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    setInstallPrompt(null)
    return outcome === 'accepted'
  }

  const applyUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.waiting?.postMessage({ type: 'SKIP_WAITING' })
        window.location.reload()
      })
    }
  }

  return { installPrompt, isInstalled, isOnline, updateAvailable, promptInstall, applyUpdate }
}
