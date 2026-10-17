import { db } from '@/lib/supabase'

/** A template as WATI lists it (GET /api/v2/getMessageTemplates) */
export type WatiTemplate = {
  id: string
  wabaId: string | null
  elementName: string
  category: string
  subCategory?: string
  status: string
  language: { key: string; value: string; text: string } | null
  lastModified: string
  header: { typeString?: string; headerTypeString?: string; text?: string | null; link?: string } | null
  body: string
  bodyOriginal?: string
  footer: string | null
  buttons: { type: string; parameter: { text?: string; url?: string; phoneNumber?: string; copyOfferCode?: string | null } }[] | null
  customParams: { paramName: string; paramValue: string }[] | null
}

/** Body sent to WATI's create template (POST /api/v1/whatsApp/templates) */
export type WatiTemplateInput = {
  type: 'template'
  category: string
  subCategory: 'STANDARD'
  buttonsType: string
  buttons: { type: string; parameter: Record<string, string> }[]
  footer: string
  elementName: string
  language: string
  header: { type: string; text?: string; link: string; mediaFromPC: string; mediaHeaderId: string }
  body: string
  customParams: { paramName: string; paramValue: string }[]
  creationMethod: 0
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().functions.invoke('whatsapp-templates', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const payload = await ctx.json().catch(() => null)
      if (payload?.error) throw new Error(payload.error)
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return data as T
}

export const listWatiTemplates = (tenantId: string) =>
  call<{ templates: WatiTemplate[] }>({ tenant_id: tenantId, action: 'list' }).then((d) => d.templates ?? [])

export const createWatiTemplate = (tenantId: string, template: WatiTemplateInput) => call({ tenant_id: tenantId, action: 'create', template })

export const deleteWatiTemplate = (tenantId: string, t: WatiTemplate) =>
  call({ tenant_id: tenantId, action: 'delete', waba_id: t.wabaId, name: t.elementName, language: t.language?.value })
