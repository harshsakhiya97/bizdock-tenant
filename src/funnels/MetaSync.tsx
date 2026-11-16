import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { metaRefreshedAt, syncMeta } from '@/meta/api'

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

/** "Sync from Facebook" + when the numbers were last brought in; calls onDone once fresh numbers have arrived */
export function MetaSync({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const [at, setAt] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, tick] = useState(0)
  const timer = useRef<number | null>(null)
  const load = useCallback(() => metaRefreshedAt(tenantId).then(setAt, () => setAt(null)), [tenantId])
  useEffect(() => {
    void load()
    const t = window.setInterval(() => tick((n) => n + 1), 30000)
    return () => {
      window.clearInterval(t)
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [load])

  async function sync() {
    setSyncing(true)
    setError(null)
    const started = new Date().toISOString()
    try {
      await syncMeta(tenantId)
    } catch (e) {
      setError((e as Error).message)
      setSyncing(false)
      return
    }
    // Facebook is read in the background: check every 10 s for up to 3 minutes
    let n = 0
    timer.current = window.setInterval(async () => {
      n++
      const now = await metaRefreshedAt(tenantId).catch(() => null)
      if ((now && now > started) || n >= 18) {
        if (timer.current) window.clearInterval(timer.current)
        timer.current = null
        if (now) setAt(now)
        // a few more seconds for the rest of the rows
        window.setTimeout(() => {
          setSyncing(false)
          void load()
          onDone()
        }, 8000)
      }
    }, 10000)
  }

  return (
    <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
      <span className="muted small nowrap" title={error ?? undefined}>
        {error ? <span className="tone-danger">Sync failed</span> : syncing ? 'Syncing with Facebook…' : at ? `Data refreshed ${ago(at)}` : 'Not synced yet'}
      </span>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => void sync()} disabled={syncing}>
        <RefreshCw size={14} className={syncing ? 'spin' : undefined} /> Sync
      </button>
    </span>
  )
}
