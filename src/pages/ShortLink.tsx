import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { db } from '@/lib/supabase'

/** <app>/<code>: opens the long URL of a short link made by a workflow (no login). */
export function ShortLinkPage() {
  const { code = '' } = useParams()
  const valid = /^[A-Za-z0-9]{7}$/.test(code)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!valid) return
    db()
      .rpc('short_link_open', { p_code: code })
      .then(({ data }) => {
        if (typeof data === 'string' && /^https?:\/\//i.test(data)) window.location.replace(data)
        else setMissing(true)
      }, () => setMissing(true))
  }, [code, valid])

  // not a short link: the app's own pages
  if (!valid) return <Navigate to="/my-day" replace />
  return (
    <div className="empty" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      {missing ? 'This link doesn’t exist or has expired.' : 'Opening…'}
    </div>
  )
}
