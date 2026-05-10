/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Phase 5 / 90-D follow-up: disable auto-injection of the SW
      // registration so the admin entry (admin.html → admin-main.jsx) does
      // NOT register a service worker. The tenant entry (main.jsx) opts
      // back in by importing 'virtual:pwa-register' explicitly. Without
      // this, the auto-injected SW on admin.constrai.ca pre-caches the
      // tenant entry index.html and serves it as the navigation fallback
      // for unknown admin routes — visible bug: visiting /login on
      // admin.constrai.ca rendered the tenant login UI instead of the
      // admin React Router NotFound page.
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'MEP Platform',
        short_name: 'MEP',
        description: 'MEP Construction & Workforce Management Platform',
        theme_color: '#1e3a5f',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-72.png',
            sizes: '72x72',
            type: 'image/png',
          },
          {
            src: '/icons/icon-96.png',
            sizes: '96x96',
            type: 'image/png',
          },
          {
            src: '/icons/icon-128.png',
            sizes: '128x128',
            type: 'image/png',
          },
          {
            src: '/icons/icon-144.png',
            sizes: '144x144',
            type: 'image/png',
          },
          {
            src: '/icons/icon-152.png',
            sizes: '152x152',
            type: 'image/png',
          },
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon-384.png',
            sizes: '384x384',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Task Request',
            url: '/task-request',
            description: 'Send tasks to workers',
          },
          {
            name: 'My Hub',
            url: '/my-hub',
            description: 'View your tasks and requests',
          },
          {
            name: 'Attendance',
            url: '/attendance',
            description: 'Manage attendance',
          },
        ],
        categories: ['business', 'productivity'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache API calls for offline support
            urlPattern: /^https?:\/\/localhost:3000\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5, // 5 minutes
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Cache Mapbox tiles
            urlPattern: /^https:\/\/api\.mapbox\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mapbox-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true, // Enable PWA in dev mode for testing
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Phase 5 / 90-C — multi-entry build (Decision B2 from DECISIONS.md
  // Section 90). Both entries share the same Tailwind theme, i18n setup,
  // and shared component library; only the root <App> differs. Vite
  // outputs:
  //   dist/index.html   → tenant entry (loaded by app.constrai.ca)
  //   dist/admin.html   → admin entry  (loaded by admin.constrai.ca)
  //   dist/assets/...   → shared chunks + per-entry chunks
  //
  // Nginx server blocks pick the right index per Host:
  //   - /etc/nginx/sites-available/constrai           → try_files … /index.html
  //   - /etc/nginx/sites-available/admin-constrai     → try_files … /admin.html
  //
  // First-match-wins matters here: do NOT add a wildcard input that could
  // shadow either explicit name. Future entries (e.g., a separate '/preview'
  // build) should be added by name, not pattern.
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        admin: path.resolve(__dirname, 'admin.html'),
      },
    },
  },
  // Vitest config (Phase 68, May 2026, Section 22 hardening week).
  // Co-located with the Vite config so the test runner picks up the same
  // alias + plugin pipeline as the dev server. Overrides only what tests
  // need to be different (jsdom for the DOM, globals for terser tests,
  // setup file for jest-dom matchers, css: false to skip Tailwind compile
  // during tests since assertions don't depend on styles).
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{js,jsx,ts,tsx}',
        'src/test/**',
        'src/main.jsx',
      ],
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
