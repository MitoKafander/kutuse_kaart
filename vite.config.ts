import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' mode lets us show a user-facing "new version" banner via
      // the registerSW onNeedRefresh callback in main.tsx, instead of the
      // silent auto-reload of 'autoUpdate'. skipWaiting + clientsClaim stay
      // so the new SW still activates fast in the background — the banner
      // is just the UX nudge for users who keep a tab open for days.
      registerType: 'prompt',
      includeAssets: ['logo.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon.svg'],
      // skipWaiting + clientsClaim: when a new SW is downloaded, activate it
      // immediately and take over any open tabs instead of waiting for every
      // client to close (installed PWAs rarely fully close on mobile, so the
      // default "waiting" behaviour meant users sat on stale caches for days).
      // cleanupOutdatedCaches wipes the old precache entries on activation.
      // navigateFallback + NetworkFirst for the HTML shell ensures the latest
      // index.html reaches users within one launch.
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'kyts-html',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      manifest: {
        id: '/',
        name: 'Kyts — Kütusehinnad',
        short_name: 'Kyts',
        description: 'Eesti kütusehindade kaart',
        lang: 'et',
        start_url: '/',
        scope: '/',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      }
    })
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    chunkSizeWarningLimit: 1100,
  },
});
