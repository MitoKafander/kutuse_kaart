import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png'],
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
            src: 'logo.png',
            sizes: '512x512',
            type: 'image/png'
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
