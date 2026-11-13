import { useState } from 'react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Hint, Label, TextInput } from '@/components/Field'
import type { IntegrationRow } from '@/integrations/api'
import { updateAdAccount, type AdAccount } from './api'

/** a Facebook connection's settings: the GST % added to its ad accounts' spend (Meta India charges 18%) */
export function MetaSettingsDrawer({ row, accounts, onClose, onSaved }: { row: IntegrationRow; accounts: AdAccount[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [rates, setRates] = useState<Record<string, string>>(() => Object.fromEntries(accounts.map((a) => [a.id, String(a.gst_rate)])))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    for (const a of accounts) {
      const v = Number(rates[a.id])
      if (!Number.isFinite(v) || v < 0 || v > 50) return setError(`GST for ${a.name ?? a.act_id} must be between 0 and 50.`)
    }
    setBusy(true)
    try {
      for (const a of accounts) if (Number(rates[a.id]) !== Number(a.gst_rate)) await updateAdAccount(a.id, { gst_rate: Number(rates[a.id]) })
      onSaved('Facebook settings saved.')
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      width={480}
      title={`${row.label || 'Facebook'} · Settings`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <Hint>Reports show ad spend with GST added (hover a number to see both). Meta India charges 18%.</Hint>
        {accounts.map((a) => (
          <div key={a.id}>
            <Label htmlFor={`gst-${a.id}`}>GST % · {a.name || a.act_id}</Label>
            <TextInput id={`gst-${a.id}`} type="number" min={0} max={50} step="0.01" value={rates[a.id] ?? ''} onChange={(e) => setRates((r) => ({ ...r, [a.id]: e.target.value }))} />
          </div>
        ))}
        {!accounts.length && <div className="muted small">No ad accounts in this connection.</div>}
      </div>
    </Drawer>
  )
}
