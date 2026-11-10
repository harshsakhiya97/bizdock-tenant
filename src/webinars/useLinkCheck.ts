import { useEffect, useState } from 'react'
import { db } from '@/lib/supabase'
import { slugify } from './api'

export type LinkCheck = 'idle' | 'checking' | 'ok' | 'taken' | 'short'

/**
 * While a webinar's link is typed (checked 400 ms after the last key): free, or already used (another webinar's join /
 * WhatsApp link, the other link of this form, or an app page). The saved link itself is 'idle'.
 */
export function useLinkCheck(tenantId: string, value: string, saved: string | null | undefined, exceptId: string | null, other: string): LinkCheck {
  const v = slugify(value)
  const [state, setState] = useState<{ v: string; s: LinkCheck }>({ v: '', s: 'idle' })
  const unchanged = !v || v === (saved ?? '')
  useEffect(() => {
    if (unchanged || v.length < 3 || v === slugify(other)) return
    let live = true
    const t = window.setTimeout(() => {
      void db()
        .rpc('webinar_link_taken', { p_tenant: tenantId, p_slug: v, p_except: exceptId })
        .then(({ data, error }) => live && setState({ v, s: error ? 'idle' : data ? 'taken' : 'ok' }))
    }, 400)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [tenantId, v, unchanged, exceptId, other])
  if (unchanged) return 'idle'
  if (v.length < 3) return 'short'
  if (v === slugify(other)) return 'taken'
  return state.v === v ? state.s : 'checking'
}
