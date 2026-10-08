/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  /** Local testing only: which tenant to load when there's no real domain (e.g. tk_9acf…). */
  readonly VITE_TENANT_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
