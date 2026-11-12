import { useState } from 'react'
import { CheckCircle2, PhoneCall } from 'lucide-react'
import { Button } from '@/components/Button'
import { Hint, Label, TextInput } from '@/components/Field'
import { Drawer } from '@/components/Drawer'
import { useTenant } from '@/tenant/useTenant'
import { connectCallyzer, testCallyzer } from './api'

const STEPS = ['Get the key', 'Paste the key', 'Allow']

/** Connect Callyzer: a 3-step side panel — where to get the API key, paste it (checked), allow BizDock to read the call logs. */
export function CallyzerConnect({ reconnect, onClose, onDone }: { reconnect: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const tenant = useTenant()
  const [step, setStep] = useState(0)
  const [key, setKey] = useState('')
  const [checked, setChecked] = useState<{ total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function check() {
    if (!key.trim()) return setError('Paste the API access key.')
    setBusy(true)
    setError(null)
    try {
      const r = await testCallyzer(tenant.id, key.trim())
      setChecked({ total: r.total ?? 0 })
      setStep(2)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function allow() {
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
      title={reconnect ? 'Change Callyzer key' : 'Connect Callyzer'}
      footer={
        <>
          <Button variant="outline" onClick={step === 0 ? onClose : () => (setError(null), setStep(step - 1))}>
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            {step === 0 && <Button onClick={() => setStep(1)}>Next</Button>}
            {step === 1 && (
              <Button onClick={check} disabled={busy}>
                {busy ? 'Checking…' : 'Next'}
              </Button>
            )}
            {step === 2 && (
              <Button onClick={allow} disabled={busy}>
                {busy ? 'Connecting…' : 'Allow'}
              </Button>
            )}
          </div>
        </>
      }
    >
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
        <ol className="cz-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'is-now' : i < step ? 'is-done' : ''}>
              <span>{i < step ? <CheckCircle2 size={14} /> : i + 1}</span> {s}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="int-guide">
            <b>Get your Callyzer API access key</b>
            <ol>
              <li>Log in to the Callyzer web dashboard (app.callyzer.co) as an <b>admin</b>.</li>
              <li>
                Go to <b>Connectors → API &amp; Webhook → API Config</b>.
              </li>
              <li>
                Click <b>Generate API Access Key</b>, enter your Callyzer login again and click <b>Generate Token</b>.
              </li>
              <li>Copy the key. You’ll paste it on the next step.</li>
            </ol>
            <Hint>The API needs Callyzer’s API add-on on your plan. If you don’t see API Config, ask Callyzer to turn it on.</Hint>
          </div>
        )}

        {step === 1 && (
          <div>
            <Label htmlFor="cz-key" required>
              API access key
            </Label>
            <TextInput id="cz-key" type="password" autoComplete="off" placeholder="Paste the key from Callyzer" value={key} onChange={(e) => (setKey(e.target.value), setChecked(null))} autoFocus />
            <Hint>BizDock checks the key with Callyzer before going on.</Hint>
          </div>
        )}

        {step === 2 && (
          <div className="stack" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              <CheckCircle2 size={16} className="text-success" />
              <span>
                Key works{checked ? ` · ${checked.total} phone call${checked.total === 1 ? '' : 's'} in the last 7 days` : ''}.
              </span>
            </div>
            <div className="int-guide">
              <b>
                <PhoneCall size={14} /> Allow BizDock to:
              </b>
              <ul>
                <li>Read your team’s call logs from Callyzer: phone calls and WhatsApp calls, with duration and recording link.</li>
                <li>Check for new calls every 5 minutes{reconnect ? '' : ', and bring in the last 180 days now'}.</li>
                <li>Keep only calls whose number is a lead’s number. Other calls (personal, vendors) are skipped.</li>
                <li>Show them on the lead: Follow-ups → Callyzer.</li>
              </ul>
              <Hint>BizDock only reads. It never changes or deletes anything in Callyzer.</Hint>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}
