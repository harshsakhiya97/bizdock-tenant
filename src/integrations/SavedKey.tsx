import { useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import { Button } from '@/components/Button'
import { Hint, Label, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { db } from '@/lib/supabase'

async function fetchKey(integrationId: string, key: string, password: string): Promise<string> {
  const { data, error } = await db().functions.invoke('integration-key', { body: { integration_id: integrationId, key, password } })
  if (data?.error) throw new Error(String(data.error))
  if (error) {
    const ctx = (error as { context?: unknown }).context
    const p = ctx && typeof (ctx as Response).json === 'function' ? await (ctx as Response).json().catch(() => null) : null
    throw new Error(p?.error ? String(p.error) : error.name === 'FunctionsFetchError' ? 'Copy isn’t reachable right now. Try again in a minute.' : error.message)
  }
  if (!data?.value) throw new Error('No saved key to copy.')
  return String(data.value)
}

/**
 * A saved key / secret / token: shown masked (AB••••••••YZ, as the server sends it) with Copy. Copy asks for the
 * person's own password, then the key goes straight to the clipboard; it is never shown on screen.
 */
export function SavedKey({ integrationId, field, masked }: { integrationId: string; field: string; masked: string | null | undefined }) {
  const [asking, setAsking] = useState(false)
  const [done, setDone] = useState(false)
  if (!masked) return null
  return (
    <>
      <div className="saved-key">
        <KeyRound size={14} className="muted" />
        <code>{masked}</code>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setAsking(true)}>
          {done ? <Check size={13} /> : <Copy size={13} />} {done ? 'Copied' : 'Copy'}
        </button>
      </div>
      {asking && (
        <CopyKeyModal
          integrationId={integrationId}
          field={field}
          onClose={() => setAsking(false)}
          onCopied={() => {
            setAsking(false)
            setDone(true)
            window.setTimeout(() => setDone(false), 3000)
          }}
        />
      )}
    </>
  )
}

function CopyKeyModal({ integrationId, field, onClose, onCopied }: { integrationId: string; field: string; onClose: () => void; onCopied: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function copy() {
    if (!password) return setError('Enter your password.')
    setBusy(true)
    setError(null)
    const got = fetchKey(integrationId, field, password)
    try {
      // Safari only allows the clipboard inside the click, so the key is handed over as a promise
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': got.then((v) => new Blob([v], { type: 'text/plain' })) })])
      } else {
        await navigator.clipboard.writeText(await got)
      }
      onCopied()
    } catch (e) {
      // the key's own error (wrong password…) first, else the clipboard's
      const why = await got.then(
        () => null,
        (x: Error) => x.message,
      )
      setError(why ?? `Couldn’t copy: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} width={380}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          void copy()
        }}
      >
        <div>
          <b>Copy the key</b>
          <div className="muted small">Enter your BizDock password. The key goes straight to your clipboard; it isn’t shown.</div>
        </div>
        <div>
          <Label htmlFor="copy-key-pw" required>
            Your password
          </Label>
          <TextInput id="copy-key-pw" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <Hint>{<span className="err-text">{error}</span>}</Hint>}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            <Copy size={14} /> {busy ? 'Copying…' : 'Copy'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
