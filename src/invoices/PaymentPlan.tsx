import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Select, TextInput } from '@/components/Field'
import { money } from '@/leads/labels'
import { partState, type PartDraft } from '@/bookings/types'

const today = () => new Date().toISOString().slice(0, 10)
const key = () => Math.random().toString(36).slice(2)
export const num = (v: string) => Math.max(0, Number(v) || 0)
/** payment parts offered as labels (any text can be typed) */
const PART_LABELS = ['Advance', 'Pre-shoot', 'After shoot', 'After service', 'Final payment']

/** a new payment part: the next unused label, due today, the amount still unplanned */
export function newPart(parts: PartDraft[], total: number, k = key()): PartDraft {
  const planned = parts.reduce((s, p) => s + num(p.amount), 0)
  const left = Math.max(0, Math.round((total - planned) * 100) / 100)
  const used = new Set(parts.map((p) => p.label))
  return { key: k, label: PART_LABELS.find((l) => !used.has(l)) ?? 'Payment', due_on: today(), amount: left ? String(left) : '', mode: '', note: '', status: 'pending', paid_on: '' }
}

/** The payment parts of an invoice: label, due date, amount, Pending / Paid (received on, mode, comment). */
export function PaymentPlan({
  parts,
  onChange,
  total,
  canEdit,
  modes,
}: {
  parts: PartDraft[]
  onChange: (parts: PartDraft[]) => void
  total: number
  canEdit: boolean
  modes: { id: string; name: string }[]
}) {
  const setPart = (k: string, patch: Partial<PartDraft>) => onChange(parts.map((p) => (p.key === k ? { ...p, ...patch } : p)))
  const planned = parts.reduce((s, p) => s + num(p.amount), 0)
  const paidSum = parts.filter((p) => p.status === 'paid').reduce((s, p) => s + num(p.amount), 0)
  function addPart() {
    onChange([...parts, newPart(parts, total)])
  }
  return (
    <>
      {parts.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {parts.map((p) => {
            const st = partState({ status: p.status, due_on: p.due_on || null })
            return (
              <div key={p.key} className={`bk-part is-${st}`}>
                <div className="bk-part-row">
                  <label className="bk-cell">
                    <span>Part</span>
                    <TextInput placeholder="e.g. Advance" value={p.label} onChange={(e) => setPart(p.key, { label: e.target.value })} disabled={!canEdit} />
                  </label>
                  <label className="bk-cell">
                    <span>Due date</span>
                    <TextInput type="date" value={p.due_on} onChange={(e) => setPart(p.key, { due_on: e.target.value })} disabled={!canEdit} />
                  </label>
                  <label className="bk-cell">
                    <span>Amount (₹)</span>
                    <TextInput type="number" min={0} placeholder="Amount" value={p.amount} onChange={(e) => setPart(p.key, { amount: e.target.value })} disabled={!canEdit} />
                  </label>
                  <label className="bk-cell">
                    <span>Status</span>
                    <Select
                      className={st === 'overdue' ? 'is-overdue' : undefined}
                      value={p.status}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const v = e.target.value as PartDraft['status']
                        setPart(p.key, v === 'paid' ? { status: v, paid_on: p.paid_on || today(), mode: p.mode || modes[0]?.id || '' } : { status: v, paid_on: '', mode: '' })
                      }}
                    >
                      <option value="pending">{st === 'overdue' ? 'Overdue' : 'Pending'}</option>
                      <option value="paid">Paid</option>
                    </Select>
                  </label>
                  {canEdit ? (
                    <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove part" onClick={() => onChange(parts.filter((x) => x.key !== p.key))}>
                      <Trash2 size={15} />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
                {p.status === 'paid' ? (
                  <div className="bk-part-row2">
                    <label className="bk-cell">
                      <span>Received on</span>
                      <TextInput type="date" value={p.paid_on} onChange={(e) => setPart(p.key, { paid_on: e.target.value })} disabled={!canEdit} />
                    </label>
                    <label className="bk-cell">
                      <span>Mode</span>
                      <Select value={p.mode} onChange={(e) => setPart(p.key, { mode: e.target.value })} disabled={!canEdit}>
                        <option value="">—</option>
                        {modes.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="bk-cell">
                      <span>Comment</span>
                      <TextInput placeholder="UTR, who paid…" value={p.note} onChange={(e) => setPart(p.key, { note: e.target.value })} disabled={!canEdit} />
                    </label>
                  </div>
                ) : (
                  <label className="bk-cell">
                    <span>Comment</span>
                    <TextInput placeholder="e.g. after delivery" value={p.note} onChange={(e) => setPart(p.key, { note: e.target.value })} disabled={!canEdit} />
                  </label>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="row-between">
        {canEdit ? (
          <Button variant="outline" size="sm" onClick={addPart}>
            <Plus /> Add payment part
          </Button>
        ) : (
          <span />
        )}
        <span className="small muted">
          Planned {money(planned)} of {money(total)} · paid <b className="tone-success">{money(paidSum)}</b> · balance <b>{money(Math.max(0, total - paidSum))}</b>
          {total - planned > 0.01 && parts.length > 0 && <span className="tone-warning"> · {money(total - planned)} not planned yet</span>}
        </span>
      </div>
    </>
  )
}

/** the plan check before saving: every part has an amount, and the parts don't add up to more than the total */
export function planError(parts: PartDraft[], total: number) {
  if (parts.some((p) => !(num(p.amount) > 0))) return 'Enter an amount for every payment part, or remove it.'
  const planned = parts.reduce((s, p) => s + num(p.amount), 0)
  if (planned > total + 0.01) return `The payment parts add up to ${money(planned)}, more than the total ${money(total)}.`
  return null
}
