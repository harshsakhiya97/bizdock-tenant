import { useEffect, useState, type ReactNode } from 'react'
import { registry, selectTenantDatabase } from '@/lib/supabase'
import { applyBranding } from './branding'
import { TenantContext, type Tenant } from './tenant-context'

type State = { status: 'loading' } | { status: 'not-found' } | { status: 'ready'; tenant: Tenant }

/**
 * Works out which tenant this app is for:
 * - production: from the domain (e.g. admin.viralsakhiya.com)
 * - local testing: from VITE_TENANT_KEY in .env.local
 */
async function resolveTenant() {
  const devKey = import.meta.env.VITE_TENANT_KEY?.trim()
  const { data, error } = await registry.rpc('resolve_tenant', {
    p_domain: devKey ? null : window.location.hostname,
    p_key: devKey || null,
  })
  if (error) throw error
  return (data as (Tenant & { supabase_url: string | null; supabase_key: string | null })[])[0] ?? null
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    resolveTenant()
      .then((row) => {
        if (!row) return setState({ status: 'not-found' })
        const { supabase_url, supabase_key, ...tenant } = row
        selectTenantDatabase(supabase_url, supabase_key)
        applyBranding(tenant)
        setState({ status: 'ready', tenant })
      })
      .catch(() => setState({ status: 'not-found' }))
  }, [])

  if (state.status === 'loading') {
    return (
      <div className="grid min-h-svh place-items-center bg-gray-50">
        <div className="size-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
      </div>
    )
  }
  if (state.status === 'not-found') {
    return (
      <div className="grid min-h-svh place-items-center bg-gray-50 p-6 text-center">
        <div>
          <h1 className="text-xl font-bold">Workspace not found</h1>
          <p className="mt-2 text-sm text-gray-600">
            This address isn&apos;t linked to an active workspace. Please check the link you were given.
          </p>
        </div>
      </div>
    )
  }
  return <TenantContext.Provider value={state.tenant}>{children}</TenantContext.Provider>
}
