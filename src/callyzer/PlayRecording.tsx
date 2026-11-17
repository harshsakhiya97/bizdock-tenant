import { useState } from 'react'
import { db } from '@/lib/supabase'

/** Play a call recording: our copy (bucket call-recordings, a 1-hour link), else Callyzer's link until it's copied */
export function PlayRecording({ path, url }: { path: string | null | undefined; url: string | null | undefined }) {
  const [busy, setBusy] = useState(false)
  if (!path && !url) return <span className="muted">—</span>
  async function play() {
    // open the tab first (popup blockers), then point it at the recording
    const tab = window.open('', '_blank')
    setBusy(true)
    let href = url ?? ''
    if (path) {
      const { data } = await db().storage.from('call-recordings').createSignedUrl(path, 3600)
      if (data?.signedUrl) href = data.signedUrl
    }
    setBusy(false)
    if (!href) return tab?.close()
    if (tab) tab.location.href = href
    else window.open(href, '_blank', 'noopener')
  }
  return (
    <button type="button" className="link-btn" onClick={(e) => (e.stopPropagation(), void play())} disabled={busy} title={path ? 'Our copy' : 'On Callyzer (not copied yet)'}>
      {busy ? 'Opening…' : 'Play'}
    </button>
  )
}
