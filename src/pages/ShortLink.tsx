import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'

/**
 * <app>/<code>: opens the URL of a link made by a workflow's Generate link step (no login);
 * <app>/<webinar-link>: a webinar's common join link → the Zoom meeting of its current date (on now, else the next one).
 */
export function ShortLinkPage() {
  const tenant = useTenant()
  const { code = '' } = useParams()
  const isCode = /^[A-Za-z0-9]{6,16}$/.test(code)
  const isSlug = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(code) && code.length >= 3 && code.length <= 60
  const [missing, setMissing] = useState<string | null>(null)

  useEffect(() => {
    if (!isCode && !isSlug) return
    const go = (url: unknown) => typeof url === 'string' && /^https?:\/\//i.test(url) && (window.location.replace(url), true)
    void (async () => {
      try {
        if (isCode) {
          const { data } = await db().rpc('short_link_open', { p_code: code })
          if (go(data)) return
        }
        if (isSlug) {
          const { data } = await db().rpc('webinar_link_open', { p_tenant: tenant.id, p_slug: code })
          if (go(data)) return
          setMissing('There’s no coming date for this webinar yet. Please check again later.')
          return
        }
        setMissing('This link doesn’t exist or has expired.')
      } catch {
        setMissing('This link doesn’t exist or has expired.')
      }
    })()
  }, [code, isCode, isSlug, tenant.id])

  // not a link: the app's own pages
  if (!isCode && !isSlug) return <Navigate to="/my-day" replace />
  return (
    <div className="empty" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 16 }}>
      {missing ?? 'Opening…'}
    </div>
  )
}
