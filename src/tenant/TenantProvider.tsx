import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, TriangleAlert } from 'lucide-react'
import { registry, selectTenantDatabase } from '@/lib/supabase'
import { applyBranding } from './branding'
import { setShortBase } from '@/workflows/api'
import { TenantContext, type Tenant } from './tenant-context'

type State = { status: 'loading' } | { status: 'not-found' } | { status: 'ready'; tenant: Tenant }

/**
 * Works out which tenant this app is for:
 * - production: from the domain (e.g. admin.viralsakhiya.com)
 * - local testing: the checked-out deploy/<client> branch's TENANT_KEY (deploy.config), else VITE_TENANT_KEY in .env.local
 */
async function devTenantKey() {
  if (!import.meta.env.DEV) return import.meta.env.VITE_TENANT_KEY?.trim()
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}__tenant_key`, { cache: 'no-store' })
    const k = r.ok ? (await r.text()).trim() : ''
    if (/^tk_[a-z0-9]+$/i.test(k)) return k
  } catch {
    /* falls back to .env.local */
  }
  return import.meta.env.VITE_TENANT_KEY?.trim()
}

async function resolveTenant() {
  const devKey = await devTenantKey()
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
        setShortBase(tenant.app_url)
        setState({ status: 'ready', tenant })
      })
      .catch(() => setState({ status: 'not-found' }))
  }, [])

  if (state.status === 'loading') {
    return (
      <div className="center-screen">
        <Loader2 size={28} className="spin muted" />
      </div>
    )
  }
  if (state.status === 'not-found') {
    return (
      <div className="center-screen">
        <div className="card card-pad center-card">
          <div className="modal-icon">
            <TriangleAlert size={22} />
          </div>
          <h2>Workspace not found</h2>
          <p className="muted">
            This address isn&apos;t linked to an active workspace. Please check the link you were given.
          </p>
        </div>
      </div>
    )
  }
  return <TenantContext.Provider value={state.tenant}>{children}</TenantContext.Provider>
}
