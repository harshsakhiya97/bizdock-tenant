import { useEffect, useState } from 'react'
import { Drawer } from '@/components/Drawer'
import { useTenant } from '@/tenant/useTenant'
import { adPreview } from './api'

const FORMATS = [
  ['MOBILE_FEED_STANDARD', 'Facebook feed (mobile)'],
  ['DESKTOP_FEED_STANDARD', 'Facebook feed (desktop)'],
  ['FACEBOOK_STORY_MOBILE', 'Facebook story'],
  ['FACEBOOK_REELS_MOBILE', 'Facebook reels'],
  ['INSTAGRAM_STANDARD', 'Instagram feed'],
  ['INSTAGRAM_STORY', 'Instagram story'],
  ['INSTAGRAM_REELS', 'Instagram reels'],
] as const

/** Facebook Ads logs → an ad: its preview as Facebook draws it, per placement */
export function AdPreviewDrawer({ ad, onClose }: { ad: { id: string; name: string | null; sub: string }; onClose: () => void }) {
  const tenant = useTenant()
  const [format, setFormat] = useState<string>('MOBILE_FEED_STANDARD')
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSrc(null)
    setError(null)
    adPreview(tenant.id, ad.id, format).then(setSrc, (e: Error) => setError(e.message))
  }, [tenant.id, ad.id, format])

  return (
    <Drawer open onClose={onClose} width={560} title={ad.name ?? ad.id}>
      <div className="stack">
        <div className="muted small">{ad.sub}</div>
        <select className="input" aria-label="Placement" value={format} onChange={(e) => setFormat(e.target.value)}>
          {FORMATS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        {error && <div className="alert alert-error">{error}</div>}
        {!src && !error && <div className="muted small">Loading the preview from Facebook…</div>}
        {src && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <iframe
              key={src}
              src={src}
              title="Ad preview"
              style={{ width: format === 'DESKTOP_FEED_STANDARD' ? 502 : 340, height: format.includes('STORY') || format.includes('REELS') ? 640 : 560, border: 0, borderRadius: 8, background: '#fff' }}
              sandbox="allow-scripts allow-same-origin allow-popups"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
        <div className="muted small">Facebook draws this preview; a placement the ad doesn’t run on may look empty.</div>
      </div>
    </Drawer>
  )
}
