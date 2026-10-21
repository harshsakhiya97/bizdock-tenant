import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bot, Check, ChevronDown, ChevronRight, Columns3, Copy, ExternalLink, FileSpreadsheet, Pencil, Plus, Power, RefreshCw, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Hint, Label, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { ConfirmModal, Empty } from '@/components/ui'
import { cn } from '@/lib/cn'
import { ago } from '@/team/time'
import { useTenant } from '@/tenant/useTenant'
import { deleteSheet, parseSheetUrl, savePerisclaw, saveSheet, saveSheetMap, setSheetActive, sheetsAccount, syncSheetNow } from './api'
import { SHEET_COLUMNS, SHEET_FIELD_MAP, guessColumn, parseExample, perisclawMessage } from './perisclaw'
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
      <p className="muted small" style={{ margin: '0 0 12px' }}>
        Google Sheets your WhatsApp leads are written to. Every minute new rows become leads in the funnel’s first stage (source WhatsApp, with the funnel’s tags). Row 1 must hold the
        column names. The same phone again updates that lead.
      </p>
      <div className="row-between" style={{ marginBottom: 14, alignItems: 'center', gap: 12 }}>
        {canEdit ? (
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ sheet: null })}>
            <Plus size={16} /> Add sheet
          </button>
        ) : (
          <span />
        )}
        <div className={cn('alert', account ? 'alert-info' : 'alert-warning', 'small')} style={{ margin: 0, marginLeft: 'auto', textAlign: 'right' }}>
          {account === undefined ? (
            'Checking the Google connection…'
          ) : account ? (
            <span className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              Share each sheet with <b>{account}</b> as <b>Viewer</b>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy('sa', account)}>
                {copied === 'sa' ? <Check size={14} /> : <Copy size={14} />} {copied === 'sa' ? 'Copied' : 'Copy email'}
              </button>
            </span>
          ) : (
            <span className="row" style={{ gap: 6 }}>
              <AlertTriangle size={14} /> The Google service account isn’t set up yet, so sheets can’t be read.
            </span>
          )}
        </div>
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

              <PerisclawSetupBlock key={`p-${s.id}`} sheet={s} canEdit={canEdit} onChanged={onChanged} onError={onError} />
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
  const [open, setOpen] = useState<boolean | null>(null)
  const cols = useMemo(() => sheet.headers ?? [], [sheet.headers])
  // "Full Name" / "WhatsApp Number" are guessed like full_name / whatsapp_number (same as the sync)
  const norm = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const target = (k: string) => map[k] ?? SHEET_FIELD_MAP[k] ?? guessTarget(norm(k))
  const chosen = new Set(cols.map(target))
  const missing = [!chosen.has('name') && !chosen.has('first_name') ? 'Name' : null, !chosen.has('phone') ? 'Phone' : null, !chosen.has('email') ? 'Email' : null].filter(Boolean)

  if (!cols.length) return <div className="muted small">The column mapping shows here after the first sync (Sync now, or within a minute once the sheet is shared).</div>

  async function save() {
    setBusy(true)
    try {
      const out: Record<string, string> = {}
      for (const k of cols) out[k] = target(k)
      await saveSheetMap(sheet.id, out)
      setMap(out)
      setDirty(false)
      onChanged(`Column mapping of ${sheet.name} saved.`)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // closed once every needed field is matched; open when something is missing
  const isOpen = open ?? missing.length > 0
  return (
    <div className="lp-block">
      <button type="button" className="link-btn lp-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setOpen(!isOpen)}>
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} <Columns3 size={14} /> Column mapping
        {missing.length ? <span className="badge badge-warning">{missing.join(', ')} missing</span> : <span className="badge badge-success">Done</span>}
      </button>
      {isOpen && (
        <>
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
          {dirty && <span className="muted small">Unsaved mapping</span>}
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy || !dirty}>
            <Save size={14} /> Save mapping
          </button>
        </div>
      )}
        </>
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

/** Perisclaw setup: paste one example lead message, match its parts to our columns, copy the message for Perisclaw. */
function PerisclawSetupBlock({ sheet, canEdit, onChanged, onError }: { sheet: FunnelSheet; canEdit: boolean; onChanged: (m: string) => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(!sheet.perisclaw)
  const [example, setExample] = useState(sheet.perisclaw?.example ?? '')
  const [map, setMap] = useState<Record<string, string>>(sheet.perisclaw?.map ?? {})
  const [busy, setBusy] = useState(false)
  const { copied, copy } = useCopy()
  const parts = useMemo(() => parseExample(example), [example])
  const col = (label: string) => (label in map ? map[label] : guessColumn(label))
  const fullMap = Object.fromEntries(parts.map((p) => [p.label, col(p.label)]))
  const message = parts.length ? perisclawMessage(sheet.sheet_url, parts, fullMap, example) : ''
  // compare key by key (the saved map comes back with its keys in another order)
  const savedMap = sheet.perisclaw?.map ?? {}
  const dirty =
    example.trim() !== (sheet.perisclaw?.example ?? '').trim() ||
    Object.keys(fullMap).length !== Object.keys(savedMap).length ||
    Object.entries(fullMap).some(([k, v]) => savedMap[k] !== v)
  const missing = ['Name', 'Email', 'Contact No'].filter((c) => !Object.values(fullMap).includes(c))

  async function save() {
    setBusy(true)
    try {
      await savePerisclaw(sheet.id, { example: example.trim(), map: fullMap })
      onChanged(`Perisclaw setup for ${sheet.name} saved.`)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lp-block">
      <button type="button" className="link-btn lp-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} <Bot size={14} /> Perisclaw setup
        {sheet.perisclaw && <span className="badge badge-success">Done</span>}
      </button>
      {open && (
        <div className="stack" style={{ gap: 10 }}>
          <div>
            <Label htmlFor={`pc-ex-${sheet.id}`}>1. Paste one lead message exactly as you get it on WhatsApp</Label>
            <textarea
              id={`pc-ex-${sheet.id}`}
              className="input"
              rows={6}
              disabled={!canEdit}
              placeholder={'e.g.\nName: Rahul Mehta\nMobile: 98250 41002\nEmail: rahul@example.com\nCity: Surat\nRequirement: Podcast shoot'}
              value={example}
              onChange={(e) => setExample(e.target.value)}
            />
            <Hint>Each detail on its own line as “Label: value”.</Hint>
          </div>

          {example.trim() && !parts.length && <div className="alert alert-warning small">No “Label: value” lines found in this message.</div>}

          {parts.length > 0 && (
            <>
              <span className="field-label">2. Match each part to our sheet column</span>
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>In the message</th>
                      <th>Example</th>
                      <th>Sheet column</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((p) => (
                      <tr key={p.label}>
                        <td>
                          <code className="code-chip">{p.label}</code>
                        </td>
                        <td className="muted small">
                          <span className="cell-clip" style={{ maxWidth: 240 }}>
                            {p.value}
                          </span>
                        </td>
                        <td>
                          <select className="input input-sm" aria-label={`${p.label} goes to`} disabled={!canEdit} value={col(p.label)} onChange={(e) => setMap((m) => ({ ...m, [p.label]: e.target.value }))}>
                            <option value="">— leave out —</option>
                            {SHEET_COLUMNS.filter((c) => c.name !== 'Sr No').map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {missing.length > 0 && (
                <div className="alert alert-warning small">
                  <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <AlertTriangle size={14} /> Nothing goes to {missing.join(', ')}. Rows without {missing.length > 1 ? 'them' : 'it'} are skipped.
                  </span>
                </div>
              )}

              <div className="row-between">
                <span className="field-label">3. Send this to Perisclaw on WhatsApp</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => copy(`pc-${sheet.id}`, message)}>
                  {copied === `pc-${sheet.id}` ? <Check size={14} /> : <Copy size={14} />} {copied === `pc-${sheet.id}` ? 'Copied' : 'Copy message'}
                </button>
              </div>
              <div className="snippet">
                <pre style={{ whiteSpace: 'pre-wrap' }}>{message}</pre>
              </div>
              <Hint>
                Put these column names in row 1 of the sheet first: <b>{SHEET_COLUMNS.map((c) => c.name).join(' | ')}</b>
              </Hint>
              {canEdit && (
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  {dirty && <span className="muted small">Not saved</span>}
                  <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy || !dirty}>
                    <Save size={14} /> Save setup
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
