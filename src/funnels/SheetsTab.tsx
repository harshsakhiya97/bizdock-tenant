import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Columns3, Copy, ExternalLink, FileSpreadsheet, Pencil, Plus, Power, RefreshCw, Save, ScanSearch, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Hint, Label, TextInput } from '@/components/Field'
import { SearchSelect } from '@/components/SearchSelect'
import { Modal } from '@/components/Modal'
import { ConfirmModal, Empty } from '@/components/ui'
import { cn } from '@/lib/cn'
import { ago } from '@/team/time'
import { useTenant } from '@/tenant/useTenant'
import { deleteSheet, listAdCampaignOptions, listSkippedRows, type AdCampaignOption, parseSheetUrl, recheckSheet, retrySheetRows, saveSheet, saveSheetMap, setSheetActive, sheetsAccount, syncSheetNow } from './api'
import { LEAD_TARGETS, guessTarget, targetLabel } from './fieldMap'
import type { FunnelSheet, SheetInput, SkippedRow } from './types'
import { useCopy } from './useCopy'

/** the lead fields a sheet column can go into: the form fields, and Lead date (a new lead's date, India time) */
const SHEET_TARGETS: { value: string; label: string }[] = LEAD_TARGETS.flatMap((t) => (t.value === 'email' ? [t, { value: 'lead_date', label: 'Lead date' }] : [t]))

/** A funnel's Sheets tab: Google Sheet links; new rows become leads every minute (only the phone is needed). */
export function SheetsTab({
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
  const [skippedOf, setSkippedOf] = useState<FunnelSheet | null>(null)
  const [rechecking, setRechecking] = useState<FunnelSheet | null>(null)
  const { copied, copy } = useCopy()
  // Ad campaign names (the sheet cards, the edit pop-up)
  const [camps, setCamps] = useState<AdCampaignOption[]>([])
  useEffect(() => {
    listAdCampaignOptions(tenant.id, funnelId).then(setCamps, () => setCamps([]))
  }, [tenant.id, funnelId])
  const campOf = (s: FunnelSheet) => (s.ad_campaign_id ? camps.find((c) => c.platform === s.ad_platform && c.id === s.ad_campaign_id) : undefined)

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
  const recheck = (s: FunnelSheet) =>
    run(`re-${s.id}`, async () => {
      const r = await recheckSheet(s.id)
      return `${s.name} checked again (${r.rows} rows): ${r.added} new lead${r.added === 1 ? '' : 's'}, ${r.existing} already leads${r.skipped ? `, ${r.skipped} skipped` : ''}.`
    })

  if (!sheets) return <div className="empty">Loading sheets…</div>

  return (
    <>
      <p className="muted small" style={{ margin: '0 0 12px' }}>
        Google Sheets with leads. Every minute new rows become leads in the funnel’s first stage (source Google Sheet, with the funnel’s tags). Row 1 must hold the column names;
        only the phone number is needed. The same phone again updates that lead.
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
                  {s.ad_campaign_id && (
                    <span className="badge badge-info" title="Its leads: this campaign, Source Facebook / Google">
                      {s.ad_platform === 'google' ? 'Google' : 'Facebook'} · {campOf(s)?.name ?? s.ad_campaign_id}
                    </span>
                  )}
                </div>
                {canEdit && (
                  <div className="row-actions">
                    {waitingOf(s) > 0 ? (
                      <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => syncNow(s)}>
                        <RefreshCw size={14} className={cn(busy === `sync-${s.id}` && 'spin')} /> Sync now
                      </button>
                    ) : (
                      <button type="button" className="btn btn-ghost btn-icon" title="Sync now" aria-label={`Sync ${s.name} now`} disabled={!!busy} onClick={() => syncNow(s)}>
                        <RefreshCw size={15} className={cn(busy === `sync-${s.id}` && 'spin')} />
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost btn-icon" title="Re-check sheet: add rows whose phone isn’t a lead yet" aria-label={`Re-check ${s.name}`} disabled={!!busy || s.synced_rows == null} onClick={() => setRechecking(s)}>
                      <ScanSearch size={15} className={cn(busy === `re-${s.id}` && 'spin')} />
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

              <SheetStats sheet={s} onSkipped={() => setSkippedOf(s)} />
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
          camps={camps}
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
      {skippedOf && <SkippedModal sheet={skippedOf} canEdit={canEdit} onClose={() => setSkippedOf(null)} onChanged={onChanged} onError={onError} />}
      <ConfirmModal
        open={!!rechecking}
        icon={ScanSearch}
        title={`Re-check ${rechecking?.name ?? ''}?`}
        message="Every row already handled is read again. Rows whose phone isn’t a lead of this funnel yet are added; existing leads aren’t changed or duplicated."
        confirmLabel="Re-check"
        busy={!!busy}
        onCancel={() => setRechecking(null)}
        onConfirm={() => {
          const s = rechecking
          setRechecking(null)
          if (s) void recheck(s)
        }}
      />
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
  const target = (k: string) => map[k] ?? guessTarget(norm(k))
  const chosen = new Set(cols.map(target))
  const missing = [!chosen.has('phone') ? 'Phone' : null].filter(Boolean)

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
                    <SearchSelect
                      className="input-sm"
                      ariaLabel={`${k} saved as`}
                      value={target(k)}
                      options={SHEET_TARGETS.map((t) => ({ value: t.value, label: t.value === 'extra' ? `Extra field (${k})` : t.label }))}
                      onChange={(v) => {
                        if (!v) return
                        setMap((m) => ({ ...m, [k]: v }))
                        setDirty(true)
                      }}
                    />
                  ) : (
                    (SHEET_TARGETS.find((t) => t.value === target(k))?.label ?? targetLabel(target(k)))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {missing.length > 0 && (
        <div className="alert alert-warning small">
          <AlertTriangle size={14} /> No column is matched to the phone number: every row is skipped until one is.
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

function SheetModal({ sheet, camps, onClose, onSave }: { sheet: FunnelSheet | null; camps: AdCampaignOption[]; onClose: () => void; onSave: (input: SheetInput) => Promise<void> }) {
  const [f, setF] = useState<SheetInput>({
    name: sheet?.name ?? '',
    sheet_url: sheet?.sheet_url ?? '',
    import_existing: sheet?.import_existing ?? false,
    ad_platform: sheet?.ad_platform ?? null,
    ad_campaign_id: sheet?.ad_campaign_id ?? null,
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const linkChanged = !!sheet && f.sheet_url.trim() !== sheet.sheet_url

  async function submit() {
    if (!f.name.trim()) return setError('Give the sheet a name.')
    if (f.ad_platform && !f.ad_campaign_id) return setError('Pick the campaign, or choose None.')
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
          <TextInput id="sh-name" autoFocus placeholder="e.g. Ads leads – October" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="sh-url" required>
            Google Sheet link
          </Label>
          <TextInput id="sh-url" placeholder="https://docs.google.com/spreadsheets/d/…" value={f.sheet_url} onChange={(e) => setF({ ...f, sheet_url: e.target.value })} />
          <Hint>Open the tab with the leads and copy the link from the address bar; that tab is read.</Hint>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="field-label">Leads come from ads on</span>
          <div className="seg" role="group" aria-label="Ad platform">
            {([
              [null, 'None'],
              ['meta', 'Facebook'],
              ['google', 'Google'],
            ] as const).map(([p, label]) => (
              <button key={label} type="button" className={f.ad_platform === p ? 'is-active' : undefined} onClick={() => setF({ ...f, ad_platform: p, ad_campaign_id: p === f.ad_platform ? f.ad_campaign_id : null })}>
                {label}
              </button>
            ))}
          </div>
          {f.ad_platform && (
            <div>
              <Label htmlFor="sh-camp" required>
                {f.ad_platform === 'google' ? 'Google' : 'Facebook'} campaign
              </Label>
              <SearchSelect
                id="sh-camp"
                value={f.ad_campaign_id}
                onChange={(v) => setF({ ...f, ad_campaign_id: v || null })}
                options={camps.filter((c) => c.platform === f.ad_platform).map((c) => ({ value: c.id, label: c.account ? `${c.account} · ${c.name}` : c.name }))}
                placeholder="Select a campaign"
              />
              {!camps.some((c) => c.platform === f.ad_platform) && (
                <Hint>No {f.ad_platform === 'google' ? 'Google' : 'Facebook'} campaigns on this funnel yet — add its campaign tags on the {f.ad_platform === 'google' ? 'Google Ads' : 'Facebook Ads'} tab.</Hint>
              )}
            </div>
          )}
          <Hint>The sheet’s leads (the ones already in and new rows) get this campaign as Campaign Name and Source Facebook / Google. None: Source Google Sheet.</Hint>
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

/** rows that haven't been synced yet */
const waitingOf = (s: FunnelSheet) => (s.total_rows != null && s.synced_rows != null ? Math.max(0, s.total_rows - s.synced_rows) : 0)

/** the sheet's numbers: rows in the sheet, synced, waiting, new leads, updated, skipped (opens the list) */
function SheetStats({ sheet: s, onSkipped }: { sheet: FunnelSheet; onSkipped: () => void }) {
  if (s.synced_rows == null)
    return <div className="muted small">Waiting for the first sync · {s.import_existing ? 'rows already in the sheet will be imported' : 'only rows added from now come in'}</div>
  const waiting = waitingOf(s)
  const tiles: { label: string; value: number | string; tone?: string; onClick?: () => void }[] = [
    { label: 'Rows in sheet', value: s.total_rows ?? '—' },
    { label: 'Synced', value: s.synced_rows },
    { label: 'Waiting', value: waiting, tone: waiting ? 'is-warn' : undefined },
    { label: 'New leads', value: s.leads_added, tone: 'is-good' },
    { label: 'Updated', value: s.leads_updated },
    { label: 'Skipped', value: s.rows_skipped, tone: s.rows_skipped ? 'is-bad' : undefined, onClick: s.rows_skipped ? onSkipped : undefined },
  ]
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="sheet-stats">
        {tiles.map((t) =>
          t.onClick ? (
            <button key={t.label} type="button" className={cn('sheet-stat is-link', t.tone)} onClick={t.onClick} title="See the skipped rows">
              <b>{t.value}</b>
              <span>{t.label}</span>
            </button>
          ) : (
            <div key={t.label} className={cn('sheet-stat', t.tone)}>
              <b>{t.value}</b>
              <span>{t.label}</span>
            </div>
          ),
        )}
      </div>
      <div className="muted small">Last checked {s.last_synced_at ? ago(s.last_synced_at) : '—'}</div>
    </div>
  )
}

/** the rows that didn't become a lead: row number, its data, why; sync them again (after fixing the sheet) */
function SkippedModal({ sheet, canEdit, onClose, onChanged, onError }: { sheet: FunnelSheet; canEdit: boolean; onClose: () => void; onChanged: (m: string) => void; onError: (m: string) => void }) {
  const [rows, setRows] = useState<SkippedRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = () =>
    listSkippedRows(sheet.id).then(setRows, (e: Error) => {
      onError(e.message)
      setRows([])
    })
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.id])
  const cols = (sheet.headers ?? []).filter((h) => (rows ?? []).some((r) => r.data?.[h]))

  async function again(nos?: number[]) {
    setBusy(nos ? `r-${nos[0]}` : 'all')
    try {
      const r = await retrySheetRows(sheet.id, nos)
      onChanged(`${r.rows} row${r.rows === 1 ? '' : 's'} synced again: ${r.added} new lead${r.added === 1 ? '' : 's'}, ${r.updated} updated${r.skipped ? `, ${r.skipped} still skipped` : ''}.`)
      await load()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={980}
      title={`Skipped rows · ${sheet.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {canEdit && !!rows?.length && (
            <div className="foot-end">
              <Button onClick={() => void again()} disabled={!!busy}>
                <RefreshCw size={14} className={cn(busy === 'all' && 'spin')} /> Sync all again
              </Button>
            </div>
          )}
        </>
      }
    >
      <p className="muted small" style={{ marginTop: 0 }}>
        These rows didn’t become a lead. Fix them in the sheet (e.g. add the phone number), then sync them again.
      </p>
      {!rows ? (
        <Empty>Loading…</Empty>
      ) : !rows.length ? (
        <Empty>No skipped rows.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Row</th>
                <th>Why</th>
                {cols.map((c) => (
                  <th key={c}>{c}</th>
                ))}
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.row_no}</b>
                  </td>
                  <td className="danger-text small">{r.reason ?? '—'}</td>
                  {cols.map((c) => (
                    <td key={c} className="small">
                      <span className="cell-clip" style={{ maxWidth: 180 }}>
                        {r.data?.[c] || '—'}
                      </span>
                    </td>
                  ))}
                  {canEdit && (
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void again([r.row_no])}>
                        <RefreshCw size={13} className={cn(busy === `r-${r.row_no}` && 'spin')} /> Sync again
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
