import { useState } from 'react'
import { PhoneCall } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Hint, Label, TextInput } from '@/components/Field'
import { useTenant } from '@/tenant/useTenant'
import { FormPromptTabs, PromptBox } from '@/integrations/PromptBox'
import { connectCallyzer } from './api'

/** a prompt for Claude in Chrome that opens Callyzer's API key page (the person is logged in to Callyzer as an admin) */
const callyzerPrompt = () => `In Chrome I'm logged in to the Callyzer web dashboard (web.callyzer.co) as an admin. I want an API access key for BizDock. Don't change or delete anything else in Callyzer. Never read out or copy the API key into this chat; I'll copy it myself. Never type my password: when Callyzer asks for it, stop and let me type it. If something on screen doesn't match, stop and tell me what you see.

1. In the left menu open Connectors → API & Webhook → API Config.
   (If there's no API Config, stop and tell me: the API add-on may not be on our plan.)
2. If a key is already shown there, don't generate a new one: tell me "A key already exists" and stop.
3. Otherwise click "Generate API Access Key". When it asks for the login, stop and tell me "Enter your Callyzer login and press Generate Token".
4. After I've done that, tell me only: "The key is on screen — copy it into BizDock".`

/** Connect Callyzer (or change its key): Claude in Chrome prompt, the steps, and the key. BizDock checks the key with Callyzer on Connect. */
export function CallyzerConnect({ reconnect, onClose, onDone }: { reconnect: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const tenant = useTenant()
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'key' | 'prompt'>('key')

  async function save() {
    if (!key.trim()) return setError('API access key is required.')
    setBusy(true)
    setError(null)
    try {
      await connectCallyzer(tenant.id, key.trim())
      onDone(reconnect ? 'Callyzer key updated.' : 'Callyzer connected. Past calls (last 180 days) are being brought in; they appear on leads within a few minutes.')
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={520}
      title={reconnect ? 'Callyzer settings' : 'Connect Callyzer'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={save} disabled={busy}>
              {busy ? 'Checking…' : reconnect ? 'Save' : 'Connect'}
            </Button>
          </div>
        </>
      }
    >
      <FormPromptTabs
        tabs={[
          ['key', 'Key'],
          ['prompt', 'Prompt & steps'],
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'key' && (
        <div className="stack">
          <div className="int-top">
            <div className="int-icon" style={{ ['--c' as string]: '#2563eb' }}>
              <PhoneCall size={20} />
            </div>
            <div>
              <b>Callyzer</b>
              <div className="muted small">Call logs from your team’s phones, matched to leads by phone number.</div>
            </div>
          </div>
          <div>
            <Label htmlFor="cz-key" required>
              API access key
            </Label>
            <TextInput id="cz-key" type="password" autoComplete="off" placeholder={reconnect ? 'Saved — paste a new key to replace it' : 'Paste the key from Callyzer'} value={key} onChange={(e) => setKey(e.target.value)} />
            <Hint>
              No key yet? See Prompt &amp; steps. BizDock only reads calls (phone and WhatsApp calls) every 5 minutes{reconnect ? '' : ', and brings in the last 180 days on connect'}. Only calls to a lead’s number are kept; they show on the lead under Follow-ups →
              Callyzer.
            </Hint>
          </div>
        </div>
      )}
      {tab === 'prompt' && (
        <div className="stack">
          <PromptBox
            title="Let Claude in Chrome open the key page"
            note="Log in to Callyzer as an admin, open Claude in Chrome, paste this, and it takes you to the API key. You type your login and copy the key yourself."
            text={callyzerPrompt()}
          />
          <div className="int-guide">
            <b>How to get the key</b>
            <ol>
              <li>Log in to the Callyzer web dashboard (web.callyzer.co) as an admin.</li>
              <li>Left menu: Connectors → API &amp; Webhook → API Config. (Not there? Callyzer’s API add-on needs to be on your plan — ask Callyzer.)</li>
              <li>Click “Generate API Access Key”, enter your Callyzer login again and click “Generate Token”.</li>
              <li>Paste the key in the Key tab and press {reconnect ? 'Save' : 'Connect'}: BizDock checks it with Callyzer straight away.</li>
            </ol>
          </div>
        </div>
      )}
    </Drawer>
  )
}
