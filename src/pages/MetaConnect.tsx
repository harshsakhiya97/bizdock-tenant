import { useEffect, useState } from 'react'
import { db } from '@/lib/supabase'

type Result = { ok?: boolean; message?: string }

/** <app>/meta-connect?state=…: where the Continue with Facebook popup ends. Shows how it went and closes when connected. */
export function MetaConnectPage() {
  const state = new URLSearchParams(window.location.search).get('state') ?? ''
  const [r, setR] = useState<Result | null>(null)

  useEffect(() => {
    let tries = 0
    let stop = false
    const read = async () => {
      const { data } = await db().rpc('meta_oauth_result', { p_state: state })
      const res = (data ?? null) as Result | null
      if (stop) return
      if (res && typeof res.ok === 'boolean') {
        setR(res)
        if (res.ok) {
          try {
            window.opener?.postMessage({ source: 'bizdock-meta', ok: true, message: res.message }, window.location.origin)
          } catch {
            // the app also reads the result itself
          }
          window.setTimeout(() => window.close(), 1500)
        }
      } else if (++tries < 10) window.setTimeout(() => void read(), 800)
      else setR({ ok: false, message: 'Couldn’t read how it went: check System Connections → Facebook Ads.' })
    }
    void read()
    return () => {
      stop = true
    }
  }, [state])

  const icon = !r ? '⏳' : r.ok ? '✅' : '⚠️'
  const title = !r ? 'Connecting Facebook…' : r.ok ? 'Facebook connected' : 'Facebook not connected'
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg, #f6f7f9)', padding: 16 }}>
      <div className="card" style={{ maxWidth: 400, width: '100%', padding: '28px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>{icon}</div>
        <b>{title}</b>
        {r?.message && <div className="muted" style={{ marginTop: 6 }}>{r.message}</div>}
        {r?.ok && <div className="muted small" style={{ marginTop: 6 }}>This window closes by itself.</div>}
        {r && !r.ok && <div className="muted small" style={{ marginTop: 6 }}>You can close this window.</div>}
      </div>
    </div>
  )
}
