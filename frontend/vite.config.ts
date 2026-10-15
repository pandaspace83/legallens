import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Shown under Settings → About (FE-8.1).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    // node_modules is a link to node_modules.nosync, which iCloud doesn't sync (INT-0.2). Keeping the linked
    // path means tools that look for "/node_modules/" still recognise dependencies.
    preserveSymlinks: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/node_modules.nosync/**'] },
    // VITE_API=http: the browser calls /api on this origin and Vite passes it to the backend (INT-0.3). One origin
    // means the SameSite=Strict session cookie works and there is no CORS. The proxy streams responses as they
    // arrive, so Server-Sent Events are not buffered.
    proxy: {
      '/api': {
        // The `real` Playwright project points this at its own throw-away backend (INT-4.1).
        target: process.env.API_TARGET ?? 'http://127.0.0.1:8000',
        configure: (proxy) => {
          proxy.on('proxyRes', (response) => {
            if (response.headers['content-type']?.startsWith('text/event-stream')) {
              response.headers['cache-control'] = 'no-cache, no-transform'
            }
          })
        },
      },
    },
  },
})
