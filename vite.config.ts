import { execSync } from 'node:child_process'
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
  // the git branch this app was built / started from (What's new → Git graph marks it as Current)
  let branch = ''
  try {
    branch = execSync('git branch --show-current', { cwd: import.meta.dirname }).toString().trim()
  } catch {
    branch = ''
  }
  // dev: the branch right now (after a git checkout, without restarting the dev server)
  const liveBranch = {
    name: 'bizdock-git-branch',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (s: string) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.split('?')[0].endsWith('/__git_branch')) return next()
        let b = ''
        try {
          b = execSync('git branch --show-current', { cwd: import.meta.dirname }).toString().trim()
        } catch {
          b = ''
        }
        res.setHeader('Content-Type', 'text/plain')
        res.end(b)
      })
    },
  }
  // dev: the tenant key of the branch checked out right now (deploy.config's TENANT_KEY on deploy/<client>),
  // so after a git checkout a page reload opens that client's workspace; empty = .env.local's VITE_TENANT_KEY
  const liveTenantKey = {
    name: 'bizdock-tenant-key',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (s: string) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.split('?')[0].endsWith('/__tenant_key')) return next()
        let key = ''
        try {
          const cfg = fs.readFileSync(path.resolve(import.meta.dirname, 'deploy.config'), 'utf8')
          key = /^TENANT_KEY="?([^"\s#]*)"?/m.exec(cfg)?.[1] ?? ''
        } catch {
          key = ''
        }
        res.setHeader('Content-Type', 'text/plain')
        res.setHeader('Cache-Control', 'no-store')
        res.end(key)
      })
    },
  }
  return {
    define: { __GIT_BRANCH__: JSON.stringify(branch) },
    // the app can live in a sub-folder, e.g. https://pride.viralsakhiya.com/pride/ (VITE_BASE_PATH=/pride/)
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss(), embedScripts, liveBranch, liveTenantKey],
    server: { port: 5174, proxy: api }, // owner app uses 5173
    preview: { proxy: api },
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
  }
})
