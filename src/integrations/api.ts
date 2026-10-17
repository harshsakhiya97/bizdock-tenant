import { db } from '@/lib/supabase'
import type { ProviderId } from './providers'

export type IntegrationRow = {
  id: string
  tenant_id: string
  provider: ProviderId
  is_enabled: boolean
  config: Record<string, string>
  status: 'connected' | 'error' | 'disconnected'
  last_error: string | null
  connected_by: string | null
  connected_at: string
  updated_at: string
}

export async function listIntegrations(tenantId: string): Promise<IntegrationRow[]> {
  const { data, error } = await db().from('integrations').select('*').eq('tenant_id', tenantId)
  if (error) throw error
  return (data ?? []) as IntegrationRow[]
}

export async function saveIntegration(tenantId: string, memberId: string | undefined, existing: IntegrationRow | null, provider: ProviderId, config: Record<string, string>) {
  const row = { config, status: 'connected', last_error: null, is_enabled: true }
  const { error } = existing
    ? await db().from('integrations').update(row).eq('id', existing.id)
    : await db().from('integrations').insert({ ...row, tenant_id: tenantId, provider, connected_by: memberId ?? null })
  if (error) throw new Error(error.message)
}

export async function setIntegrationEnabled(id: string, on: boolean) {
  const { error } = await db().from('integrations').update({ is_enabled: on }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function disconnectIntegration(id: string) {
  const { error } = await db().from('integrations').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
