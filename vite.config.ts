import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // the landing page webhook lives at <this app>/api/lead-webhook and is passed on to the Supabase function
  // (the live host will need the same rewrite when we deploy)
  const api = {
    '/api/lead-webhook': {
      target: env.VITE_SUPABASE_URL,
      changeOrigin: true,
      rewrite: (p: string) => p.replace(/^\/api\/lead-webhook/, '/functions/v1/lead-webhook'),
    },
  }
  // embed/webinar-date.js (Widgets → Webinar date & time) is served as <app>/webinar-date.js with the Supabase address filled in
  const webinarDate = () =>
    fs
      .readFileSync(path.resolve(import.meta.dirname, 'embed/webinar-date.js'), 'utf8')
      .replace('__SUPABASE_URL__', env.VITE_SUPABASE_URL ?? '')
      .replace('__SUPABASE_ANON_KEY__', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '')
  const embedScripts = {
    name: 'bizdock-embed-scripts',
    generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
      this.emitFile({ type: 'asset', fileName: 'webinar-date.js', source: webinarDate() })
    },
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (s: string) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.split('?')[0].endsWith('/webinar-date.js')) return next()
        res.setHeader('Content-Type', 'application/javascript')
        res.end(webinarDate())
      })
    },
  }
  return {
    // the app can live in a sub-folder, e.g. https://pride.viralsakhiya.com/pride/ (VITE_BASE_PATH=/pride/)
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss(), embedScripts],
    server: { port: 5174, proxy: api }, // owner app uses 5173
    preview: { proxy: api },
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
  }
})
