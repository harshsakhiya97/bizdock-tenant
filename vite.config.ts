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
  return {
    // the app can live in a sub-folder, e.g. https://pride.viralsakhiya.com/pride/ (VITE_BASE_PATH=/pride/)
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    server: { port: 5174, proxy: api }, // owner app uses 5173
    preview: { proxy: api },
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
  }
})
