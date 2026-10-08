import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * The shared BizDock database. It holds the tenant registry, and — for now —
 * every tenant's data too.
 */
export const registry: SupabaseClient = createClient(url, key)

let active: SupabaseClient = registry

/** The database for the current tenant. Use this for all auth and data calls. */
export function db(): SupabaseClient {
  return active
}

/**
 * Called once the tenant is known. If the registry points this tenant to its own
 * Supabase project, switch to it; otherwise keep using the shared database.
 */
export function selectTenantDatabase(tenantUrl: string | null, tenantKey: string | null) {
  if (tenantUrl && tenantKey && tenantUrl !== url) {
    active = createClient(tenantUrl, tenantKey)
  }
}
