import { useState } from 'react'
import { Button } from '@/components/Button'
import { Hint, Label, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { useTenant } from '@/tenant/useTenant'
import { addUtmLink, utmUrl } from './api'
import type { LandingPage, UtmInput } from './types'

/** Add a tracking link (Facebook ad 1, Instagram story…) for one landing page. */
export function UtmModal({ page, onClose, onSaved }: { page: LandingPage; onClose: () => void; onSaved: (msg: string) => void }) {
  const tenant = useTenant()
  const [u, setU] = useState<UtmInput>({
    label: '',
    utm_source: '',
    utm_medium: '',
    utm_campaign: page.utm_campaign ?? '',
    utm_term: '',
    utm_content: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof UtmInput) => (e: { target: { value: string } }) => setU((d) => ({ ...d, [k]: e.target.value }))
  const link = utmUrl(page.url, u)

  async function save() {
    if (!u.label.trim()) return setError('Give the link a name, e.g. Facebook ad 1.')
    if (!u.utm_source.trim()) return setError('utm_source is required, e.g. facebook.')
    setBusy(true)
    setError(null)
    try {
      await addUtmLink(tenant.id, page.id, u)
      onSaved(`${u.label.trim()} added.`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={600}
      title={`UTM link · ${page.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Add link'}
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <div>
          <Label htmlFor="u-label" required>
            Name
          </Label>
          <TextInput id="u-label" placeholder="e.g. Facebook ad 1" value={u.label} onChange={set('label')} autoFocus />
        </div>
        <div className="form-grid">
          <div>
            <Label htmlFor="u-src" required>
              utm_source
            </Label>
            <TextInput id="u-src" placeholder="facebook" value={u.utm_source} onChange={set('utm_source')} />
          </div>
          <div>
            <Label htmlFor="u-med">utm_medium</Label>
            <TextInput id="u-med" placeholder="paid" value={u.utm_medium} onChange={set('utm_medium')} />
          </div>
          <div>
            <Label htmlFor="u-camp">utm_campaign</Label>
            <TextInput id="u-camp" placeholder="diwali-offer" value={u.utm_campaign} onChange={set('utm_campaign')} />
          </div>
          <div>
            <Label htmlFor="u-content">utm_content</Label>
            <TextInput id="u-content" placeholder="ad-1" value={u.utm_content} onChange={set('utm_content')} />
          </div>
          <div>
            <Label htmlFor="u-term">utm_term</Label>
            <TextInput id="u-term" placeholder="optional" value={u.utm_term} onChange={set('utm_term')} />
          </div>
        </div>
        <div>
          <span className="field-label">Link to use in the ad / post</span>
          <div className="code-line">{link || <span className="muted">Add the page link to the landing page first.</span>}</div>
          <Hint>Leads that arrive through this link are counted against it.</Hint>
        </div>
      </div>
    </Modal>
  )
}
