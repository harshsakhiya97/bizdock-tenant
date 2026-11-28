import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'

type Watch = { title: string | null; recorded_at: string | null; duration_sec: number | null; video_url: string | null; audio_url: string | null }

/** <app>/zoom/<meeting-id>: a Zoom meeting's / webinar's recording, for anyone with the link (no login) */
export function ZoomWatchPage() {
  const tenant = useTenant()
  const { id = '' } = useParams()
  const [rec, setRec] = useState<Watch | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const { data, error: e } = await db().functions.invoke('zoom', { body: { action: 'watch', tenant_id: tenant.id, zoom_id: id } })
      let why = data?.error as string | undefined
      if (e && !why) {
        const ctx = (e as { context?: Response }).context
        why = (await ctx?.json?.().catch(() => null))?.error ?? 'Recording not found.'
      }
      if (why) setError(why)
      else setRec(data as Watch)
    })()
  }, [tenant.id, id])

  const when = rec?.recorded_at
    ? new Date(rec.recorded_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : ''
  return (
    <div className="watch-page">
      <div className="watch-card">
        {error ? (
          <p className="muted">{error}</p>
        ) : !rec ? (
          <p className="muted">Loading the recording…</p>
        ) : (
          <>
            <h1>{rec.title || 'Meeting recording'}</h1>
            <p className="muted small">
              {[when, rec.duration_sec ? `${Math.round(rec.duration_sec / 60)} min` : '', tenant.app_name || tenant.name].filter(Boolean).join(' · ')}
            </p>
            {rec.video_url ? (
              <video className="watch-media" src={rec.video_url} controls playsInline preload="metadata" />
            ) : rec.audio_url ? (
              <audio className="watch-media" src={rec.audio_url} controls preload="metadata" />
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
