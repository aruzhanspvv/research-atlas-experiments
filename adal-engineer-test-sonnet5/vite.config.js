import { defineConfig } from 'vite'

// Dev-only proxy: frontend calls fetch('/api/...'), Vite forwards to the
// local Express server (server/index.mjs). The target port matches PORT in
// server/.env (default 8788; changed from 8787 to avoid colliding with an
// unrelated local dev server that was already bound to 8787). In production
// the same Express server also serves the built static files
// (see server/index.mjs), so no proxy is needed there.
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.BACKEND_PORT || 8788}`,
        changeOrigin: true
      }
    }
  }
})
