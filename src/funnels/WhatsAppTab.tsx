import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Copy, ExternalLink, FileSpreadsheet, Pencil, Plus, Power, RefreshCw, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Hint, Label, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { ConfirmModal, Empty } from '@/components/ui'
import { cn } from '@/lib/cn'
import { ago } from '@/team/time'
import { useTenant } from '@/tenant/useTenant'
import { deleteSheet, parseSheetUrl, saveSheet, saveSheetMap, setSheetActive, sheetsAccount, syncSheetNow } from './api'
import { LEAD_TARGETS, guessTarget, targetLabel } from './fieldMap'
import type { FunnelSheet, SheetInput } from './types'
import { useCopy } from './useCopy'

/** A funnel's WhatsApp tab: Google Sheet links; new rows become leads every minute. */
export function WhatsAppTab({
  funnelId,
  sheets,
  canEdit,
  onChanged,
  onError,
}: {
  funnelId: string
  sheets: FunnelSheet[] | null
  canEdit: boolean
  onChanged: (msg: string) => void
  onError: (msg: string) => void
}) {
  const tenant = useTenant()
  const [editing, setEditing] = useState<{ sheet: FunnelSheet | null } | null>(null)
  const [removing, setRemoving] = useState<FunnelSheet | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [account, setAccount] = useState<string | null | undefined>(undefined)
  const { copied, copy } = useCopy()

  useEffect(() => {
    sheetsAccount()
      .then((r) => setAccount(r.email))
      .catch(() => setAccount(null))
  }, [])

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key)
    try {
      onChanged(await fn())
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const syncNow = (s: FunnelSheet) =>
    run(`sync-${s.id}`, async () => {
      const r = await syncSheetNow(s.id)
      return `${s.name} synced: ${r.added} new lead${r.added === 1 ? '' : 's'}, ${r.updated} updated${r.skipped ? `, ${r.skipped} row${r.skipped === 1 ? '' : 's'} skipped` : ''}.`
    })

  if (!sheets) return <div className="empty">Loading sheets…</div>

  return (
    <>
      <div className="row-between" style={{ marginBottom: 14 }}>
        <p className="muted small" style={{ margin: 0 }}>
          Google Sheets your WhatsApp leads are written to. Every minute new rows become leads in the funnel’s first stage (source WhatsApp, with the funnel’s tags). Row 1 must hold
          the column names. The same phone again updates that lead.
        </p>
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ sheet: null })}>
            <Plus size={16} /> Add sheet
          </button>
        )}
      </div>

      <div className={cn('alert', account ? 'alert-info' : 'alert-warning', 'small')}>
        {account === undefined ? (
          'Checking the Google connection…'
        ) : account ? (
          <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            Share each sheet with <b>{account}</b> as <b>Viewer</b> (Share → add this email).
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy('sa', account)}>
              {copied === 'sa' ? <Check size={14} /> : <Copy size={14} />} {copied === 'sa' ? 'Copied' : 'Copy email'}
            </button>
          </span>
        ) : (
          <span>
            <AlertTriangle size={14} /> The Google service account isn’t set up yet, so sheets can’t be read. Sheets you add start syncing once it is.
          </span>
        )}
      </div>

      {sheets.length === 0 ? (
        <Empty icon={FileSpreadsheet}>No sheets yet. Add a Google Sheet link to bring its rows in as leads.</Empty>
      ) : (
        <div className="stack">
          {sheets.map((s) => (
            <section key={s.id} className={cn('card lp-card', !s.is_active && 'is-off')}>
              <div className="lp-head">
                <div className="lp-title">
                  <FileSpreadsheet size={16} />
                  <b>{s.name}</b>
                  <span className={cn('badge', s.is_active ? 'badge-success' : 'badge-muted')}>{s.is_active ? 'Syncing' : 'Off'}</span>
                  <a href={s.sheet_url} target="_blank" rel="noreferrer" className="link small lp-url">
                    Open sheet <ExternalLink size={12} />
                  </a>
                </div>
                <div className="lp-counts">
                  <span>
                    <b>{s.leads_added}</b> new lead{s.leads_added === 1 ? '' : 's'}
                  </span>
                  <span>
                    <b>{s.leads_updated}</b> updated
                  </span>
                  {s.rows_skipped > 0 && (
                    <span>
                      <b>{s.rows_skipped}</b> skipped
                    </span>
                  )}
                </div>
                {canEdit && (
                  <div className="row-actions">
                    <button type="button" className="btn btn-ghost btn-icon" title="Sync now" aria-label={`Sync ${s.name} now`} disabled={!!busy} onClick={() => syncNow(s)}>
                      <RefreshCw size={15} className={cn(busy === `sync-${s.id}` && 'spin')} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-icon" title="Edit" aria-label={`Edit ${s.name}`} onClick={() => setEditing({ sheet: s })}>
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      title={s.is_active ? 'Turn off (stop syncing)' : 'Turn on'}
                      aria-label={s.is_active ? `Turn off ${s.name}` : `Turn on ${s.name}`}
                      disabled={!!busy}
                      onClick={() => run(`p-${s.id}`, async () => (await setSheetActive(s.id, !s.is_active), s.is_active ? `${s.name} turned off.` : `${s.name} turned on.`))}
                    >
                      <Power size={15} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-icon danger-text" title="Delete" aria-label={`Delete ${s.name}`} onClick={() => setRemoving(s)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>

              <div className="muted small">
                {s.synced_rows == null
                  ? `Waiting for the first sync · ${s.import_existing ? 'rows already in the sheet will be imported' : 'only rows added from now come in'}`
                  : `${s.synced_rows} row${s.synced_rows === 1 ? '' : 's'} handled · last checked ${s.last_synced_at ? ago(s.last_synced_at) : '—'}`}
              </div>
              {s.last_error && (
                <div className="alert alert-warning small">
                  <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <AlertTriangle size={14} /> {s.last_error}
                  </span>
                </div>
              )}

              <SheetColumns key={`${s.id}-${(s.headers ?? []).join('|')}`} sheet={s} canEdit={canEdit} onChanged={onChanged} onError={onError} />
            </section>
          ))}
        </div>
      )}

      {editing && (
        <SheetModal
          sheet={editing.sheet}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const isNew = !editing.sheet
            const id = await saveSheet(tenant.id, funnelId, editing.sheet, input)
            setEditing(null)
            // read the columns straight away (quietly; the minute sync tries again)
            let note = ''
            try {
              await syncSheetNow(id)
            } catch (e) {
              note = ` ${(e as Error).message}`
            }
            onChanged(`${input.name.trim()} ${isNew ? 'added' : 'saved'}.${note}`)
          }}
        />
      )}
      <ConfirmModal
        open={!!removing}
        icon={Trash2}
        danger
        title={`Delete ${removing?.name ?? ''}?`}
        message="It stops syncing. Leads that already came from this sheet are kept."
        confirmLabel="Delete"
        busy={!!busy}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const s = removing
          setRemoving(null)
          if (s) void run(`d-${s.id}`, async () => (await deleteSheet(s.id), `${s.name} deleted.`))
        }}
      />
    </>
  )
}

/** sheet columns → lead fields */
function SheetColumns({ sheet, canEdit, onChanged, onError }: { sheet: FunnelSheet; canEdit: boolean; onChanged: (m: string) => void; onError: (m: string) => void }) {
  const [map, setMap] = useState<Record<string, string>>(sheet.field_map ?? {})
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const cols = useMemo(() => sheet.headers ?? [], [sheet.headers])
  // "Full Name" / "WhatsApp Number" are guessed like full_name / whatsapp_number (same as the sync)
  const norm = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const target = (k: string) => map[k] ?? guessTarget(norm(k))
  const chosen = new Set(cols.map(target))
  const missing = [!chosen.has('name') && !chosen.has('first_name') ? 'Name' : null, !chosen.has('phone') ? 'Phone' : null, !chosen.has('email') ? 'Email' : null].filter(Boolean)

  if (!cols.length) return <div className="muted small">Columns show here after the first sync (Sync now, or within a minute once the sheet is shared).</div>

  async function save() {
    setBusy(true)
    try {
      const out: Record<string, string> = {}
      for (const k of cols) out[k] = target(k)
      await saveSheetMap(sheet.id, out)
      setMap(out)
      setDirty(false)
      onChanged(`Columns of ${sheet.name} saved.`)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lp-block">
      <span className="lp-label">Columns</span>
      <div className="table-wrap">
        <table className="table table-compact">
          <thead>
            <tr>
              <th>Sheet column</th>
              <th>Example</th>
              <th>Saved on the lead as</th>
            </tr>
          </thead>
          <tbody>
            {cols.map((k) => (
              <tr key={k}>
                <td>
                  <code className="code-chip">{k}</code>
                </td>
                <td className="muted small">
                  <span className="cell-clip" style={{ maxWidth: 240 }}>
                    {sheet.sample?.[k] || '—'}
                  </span>
                </td>
                <td>
                  {canEdit ? (
                    <select
                      className="input input-sm"
                      aria-label={`${k} saved as`}
                      value={target(k)}
                      onChange={(e) => {
                        setMap((m) => ({ ...m, [k]: e.target.value }))
                        setDirty(true)
                      }}
                    >
                      {LEAD_TARGETS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.value === 'extra' ? `Extra field (${k})` : t.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    targetLabel(target(k))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {missing.length > 0 && (
        <div className="alert alert-warning small">
          <AlertTriangle size={14} /> No column is matched to {missing.join(', ')}. Rows without {missing.length > 1 ? 'them' : 'it'} are skipped.
        </div>
      )}
      {canEdit && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {dirty && <span className="muted small">Unsaved columns</span>}
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy || !dirty}>
            <Save size={14} /> Save columns
          </button>
        </div>
      )}
    </div>
  )
}

function SheetModal({ sheet, onClose, onSave }: { sheet: FunnelSheet | null; onClose: () => void; onSave: (input: SheetInput) => Promise<void> }) {
  const [f, setF] = useState<SheetInput>({ name: sheet?.name ?? '', sheet_url: sheet?.sheet_url ?? '', import_existing: sheet?.import_existing ?? false })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const linkChanged = !!sheet && f.sheet_url.trim() !== sheet.sheet_url

  async function submit() {
    if (!f.name.trim()) return setError('Give the sheet a name.')
    if (!parseSheetUrl(f.sheet_url)) return setError('Paste the full Google Sheet link (https://docs.google.com/spreadsheets/d/…).')
    setBusy(true)
    setError(null)
    try {
      await onSave(f)
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
      title={sheet ? 'Edit sheet' : 'Add Google Sheet'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : sheet ? 'Save' : 'Add sheet'}
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <div>
          <Label htmlFor="sh-name" required>
            Name
          </Label>
          <TextInput id="sh-name" autoFocus placeholder="e.g. WhatsApp ads – October" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="sh-url" required>
            Google Sheet link
          </Label>
          <TextInput id="sh-url" placeholder="https://docs.google.com/spreadsheets/d/…" value={f.sheet_url} onChange={(e) => setF({ ...f, sheet_url: e.target.value })} />
          <Hint>Open the tab with the leads and copy the link from the address bar; that tab is read.</Hint>
        </div>
        {(!sheet || linkChanged) && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="field-label">Rows already in the sheet</span>
            <label className="check-inline">
              <input type="radio" name="sh-old" checked={!f.import_existing} onChange={() => setF({ ...f, import_existing: false })} /> Skip them, only bring in rows added from now
            </label>
            <label className="check-inline">
              <input type="radio" name="sh-old" checked={f.import_existing} onChange={() => setF({ ...f, import_existing: true })} /> Import them too
            </label>
          </div>
        )}
      </div>
    </Modal>
  )
}
