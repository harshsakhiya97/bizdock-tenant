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

/**
 * "Connect with Zoom": opens Zoom's login and Allow page in a popup (BizDock's Zoom app); the account is saved by the
 * server when Zoom sends the popup back. Resolves when it's done (the popup tells us, or the result is read every 2 s),
 * or when cancel() is called. integrationId: Reconnect that account.
 */
export function connectZoom(tenantId: string, integrationId?: string | null) {
  let stop = () => {}
  const cancel = () => stop()
  // opened straight from the click, so the browser doesn't block it
  const win = window.open('about:blank', 'bizdock-zoom', 'width=520,height=720')
  const done = new Promise<{ ok: boolean; message: string }>((resolve, reject) => {
    if (!win) return reject(new Error('Your browser blocked the Zoom window: allow pop-ups for this site and try again.'))
    let finished = false
    let timer = 0
    const end = (r: { ok: boolean; message: string }) => {
      if (finished) return
      finished = true
      window.clearInterval(timer)
      window.removeEventListener('message', onMsg)
      try {
        if (!win.closed) win.close()
      } catch {
        // already gone
      }
      resolve(r)
    }
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { source?: string; ok?: boolean; message?: string } | null
      if (d?.source === 'bizdock-zoom') end({ ok: !!d.ok, message: String(d.message ?? '') })
    }
    stop = () => end({ ok: false, message: 'Cancelled.' })
    window.addEventListener('message', onMsg)
    db()
      .functions.invoke('zoom-oauth', { body: { action: 'start', tenant_id: tenantId, integration_id: integrationId ?? null, origin: window.location.origin } })
      .then(async ({ data, error }) => {
        if (error || data?.error) {
          const ctx = (error as { context?: Response } | null)?.context
          const payload = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
          throw new Error(payload?.error ?? data?.error ?? error?.message ?? 'Could not start')
        }
        win.location.href = data.url
        const startedAt = Date.now()
        timer = window.setInterval(async () => {
          const { data: r } = await db().rpc('zoom_oauth_result', { p_state: data.state })
          const res = r as { ok?: boolean; message?: string } | null
          if (res && typeof res.ok === 'boolean') end({ ok: res.ok, message: String(res.message ?? '') })
          else if (Date.now() - startedAt > 15 * 60_000) end({ ok: false, message: 'This took too long: try again.' })
        }, 2000)
      })
      .catch((e: Error) => {
        finished = true
        window.removeEventListener('message', onMsg)
        try {
          win.close()
        } catch {
          // already gone
        }
        reject(e)
      })
  })
  return { done, cancel }
}
