import { useEffect, useState } from 'react'
import { db } from '@/lib/supabase'

type Result = { ok?: boolean; already?: boolean; message?: string; retry?: string }

/**
 * <app>/zoom-connect?state=…: where the Connect with Zoom popup ends. Shows how it went (and closes when connected);
 * a Zoom login already connected here → "Use a different Zoom account" (Zoom is signed out in a small window, then
 * its login page opens here) or Done.
 */
export function ZoomConnectPage() {
  const state = new URLSearchParams(window.location.search).get('state') ?? ''
  const [r, setR] = useState<Result | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    let tries = 0
    let stop = false
    const read = async () => {
      const { data } = await db().rpc('zoom_oauth_result', { p_state: state })
      const res = (data ?? null) as Result | null
      if (stop) return
      if (res && (typeof res.ok === 'boolean' || res.already)) {
        setR(res)
        if (res.ok) {
          try {
            window.opener?.postMessage({ source: 'bizdock-zoom', ok: true, message: res.message }, window.location.origin)
          } catch {
            // the app also reads the result itself
          }
          window.setTimeout(() => window.close(), 1500)
        }
      } else if (++tries < 10) window.setTimeout(() => void read(), 800)
      else setR({ ok: false, message: 'Couldn’t read how it went: check System Connections → Zoom.' })
    }
    void read()
    return () => {
      stop = true
    }
  }, [state])

  async function call(action: 'again' | 'done') {
    const { data, error } = await db().functions.invoke('zoom-oauth', { body: { action, state } })
    if (error || data?.error) {
      const ctx = (error as { context?: Response } | null)?.context
      const payload = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
      throw new Error(payload?.error ?? data?.error ?? error?.message ?? 'Try again from BizDock.')
    }
    return data as { url?: string }
  }
  async function other() {
    setBusy('Signing out of Zoom…')
    setErr('')
    // Zoom is signed out in a small window (it can't be done from here), then its login page opens in this one
    const lo = window.open('https://zoom.us/logout', 'bizdock-zoom-logout', 'width=420,height=480')
    try {
      const d = await call('again')
      window.setTimeout(() => {
        try {
          lo?.close()
        } catch {
          // already closed
        }
        if (d.url) window.location.href = d.url
      }, 2500)
    } catch (e) {
      lo?.close()
      setBusy('')
      setErr((e as Error).message)
    }
  }
  async function done() {
    setBusy('…')
    try {
      await call('done')
    } catch {
      // the app stops waiting anyway after a while
    }
    window.close()
  }

  const icon = !r ? '⏳' : r.ok ? '✅' : r.already ? 'ℹ️' : '⚠️'
  const title = !r ? 'Connecting Zoom…' : r.ok ? 'Zoom connected' : r.already ? 'Already connected' : 'Zoom not connected'
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg, #f6f7f9)', padding: 16 }}>
      <div className="card" style={{ maxWidth: 400, width: '100%', padding: '28px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>{icon}</div>
        <b>{title}</b>
        {r?.message && <div className="muted" style={{ marginTop: 6 }}>{r.message}</div>}
        {r?.ok && <div className="muted small" style={{ marginTop: 6 }}>This window closes by itself.</div>}
        {r && !r.ok && !r.already && <div className="muted small" style={{ marginTop: 6 }}>You can close this window.</div>}
        {r?.already && (
          <>
            <div className="muted small" style={{ marginTop: 10 }}>{busy || 'Want to connect a different Zoom account?'}</div>
            {err && <div className="err-text" style={{ marginTop: 6 }}>{err}</div>}
            <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 14 }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => void other()}>
                Use a different Zoom account
              </button>
              <button type="button" className="btn btn-outline btn-sm" disabled={!!busy} onClick={() => void done()}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
