import { db } from '@/lib/supabase'

/** a Zoom account the workspace has connected (names only — keys stay in System Connections) */
export type ZoomOption = { id: string; name: string; is_default: boolean; status: string }

export type ZoomAttendee = {
  id: string
  lead_id: string | null
  name: string | null
  email: string | null
  join_time: string | null
  leave_time: string | null
  minutes: number
  sessions: number
}
export type ZoomComment = {
  id: string
  lead_id: string | null
  kind: 'qa' | 'chat'
  name: string | null
  email: string | null
  body: string
  answer: string | null
  said_at: string | null
}
export type ZoomTarget = { kind: 'meeting' | 'event'; id: string }

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().functions.invoke('zoom', { body })
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

export async function listZoomOptions(tenantId: string): Promise<ZoomOption[]> {
  const { data, error } = await db().rpc('zoom_account_options', { p_tenant: tenantId })
  if (error) throw new Error(error.message)
  return (data ?? []) as ZoomOption[]
}

export const testZoom = (id: string) => call<{ ok: true; user: { name: string; email: string } }>({ action: 'test', id }).then((d) => d.user)

/** create the Zoom meeting again (after an error) */
export const retryZoom = (t: ZoomTarget) => call<{ ok: true }>({ action: 'sync', ...t })

/** fetch attendance, Q&A and chat now */
export const pullZoom = (t: ZoomTarget) =>
  call<{ attendees: number; questions: number; chat: number; chat_found: boolean; notes: string[] }>({ action: 'pull', ...t })

export async function listZoomData(t: ZoomTarget) {
  const col = t.kind === 'meeting' ? 'meeting_id' : 'event_id'
  const [a, c] = await Promise.all([
    db().from('zoom_attendance').select('*').eq(col, t.id).order('join_time'),
    db().from('zoom_comments').select('*').eq(col, t.id).order('said_at'),
  ])
  if (a.error) throw new Error(a.error.message)
  if (c.error) throw new Error(c.error.message)
  return { attendees: (a.data ?? []) as ZoomAttendee[], comments: (c.data ?? []) as ZoomComment[] }
}
