import { useState } from 'react'
import { Button } from '@/components/Button'
import { Hint, Label, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { useTenant } from '@/tenant/useTenant'
import { saveLandingPage } from './api'
import type { LandingPage, LandingPageInput } from './types'

/** Add / edit a landing page: its name and link. Its form fields are matched later with a test submission. */
export function LandingPageModal({
  funnelId,
  page,
  onClose,
  onSaved,
}: {
  funnelId: string
  /** null = new page */
  page: LandingPage | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const [input, setInput] = useState<LandingPageInput>({ name: page?.name ?? '', url: page?.url ?? '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof LandingPageInput) => (e: { target: { value: string } }) => setInput((d) => ({ ...d, [k]: e.target.value }))

  async function save() {
    if (!input.name.trim()) return setError('Give the landing page a name.')
    if (input.url.trim() && !/^https?:\/\/\S+\.\S+/.test(input.url.trim())) return setError('The page link should start with https://')
    setBusy(true)
    setError(null)
    try {
      await saveLandingPage(tenant.id, funnelId, page, input)
      onSaved(page ? `${input.name.trim()} saved.` : `${input.name.trim()} added. Copy its webhook URL, then use “Test webhook” to match its form fields.`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={page ? 'Edit landing page' : 'Add landing page'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : page ? 'Save changes' : 'Add & create webhook'}
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <div>
          <Label htmlFor="lp-name" required>
            Name
          </Label>
          <TextInput id="lp-name" placeholder="e.g. Webinar registration page" value={input.name} onChange={set('name')} autoFocus />
        </div>
        <div>
          <Label htmlFor="lp-url">Page link</Label>
          <TextInput id="lp-url" type="url" placeholder="https://…" value={input.url} onChange={set('url')} />
          <Hint>Used to build the UTM links.</Hint>
        </div>
        <Hint>
          No form fields to set up here: after adding, send one test submission from the page and match its fields to the lead fields.
        </Hint>
      </div>
    </Modal>
  )
}
