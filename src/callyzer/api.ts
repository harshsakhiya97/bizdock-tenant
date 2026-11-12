import { db } from '@/lib/supabase'

/** the callyzer function (it keeps the key on the server side and pulls the calls) */
async function call(body: Record<string, unknown>) {
  const { data, error } = await db().functions.invoke('callyzer', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const payload = await ctx.json().catch(() => null)
      if (payload?.error) throw new Error(payload.error)
    }
    throw new Error(error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data as { ok: boolean; total?: number }
}

/** checks a Callyzer API key: phone calls in the last 7 days */
export const testCallyzer = (tenantId: string, apiKey: string) => call({ action: 'test', tenant_id: tenantId, api_key: apiKey })
/** saves the key and starts pulling the last 180 days */
export const connectCallyzer = (tenantId: string, apiKey: string) => call({ action: 'connect', tenant_id: tenantId, api_key: apiKey })
/** pull now (normally every 5 minutes) */
export const syncCallyzer = (tenantId: string) => call({ action: 'sync', tenant_id: tenantId })
