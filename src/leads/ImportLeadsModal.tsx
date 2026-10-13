import { useEffect, useMemo, useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import { Button } from '@/components/Button'
import { Hint, Label, Select } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { listLandingPages } from '@/funnels/api'
import type { FunnelRow, LandingPage } from '@/funnels/types'
import { useAuth } from '@/auth/useAuth'
import { cn } from '@/lib/cn'
import { importLeads } from './api'

/** RFC-4180-ish CSV: quotes, "" escapes, commas / newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  const t = text.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"' && t[i + 1] === '"') (cell += '"', i++)
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') (row.push(cell), (cell = ''))
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) (row.push(cell), rows.push(row))
  return rows.filter((r) => r.some((x) => x.trim()))
}

const TARGETS = [
  { value: 'name', label: 'Full name' },
  { value: 'first_name', label: 'First name' },
  { value: 'last_name', label: 'Last name' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'city', label: 'City' },
  { value: 'utm_source', label: 'utm_source' },
  { value: 'utm_medium', label: 'utm_medium' },
  { value: 'utm_campaign', label: 'utm_campaign' },
  { value: 'utm_term', label: 'utm_term' },
  { value: 'utm_content', label: 'utm_content' },
  { value: '@extra', label: 'Keep as extra field' },
  { value: '', label: 'Skip this column' },
]
const keyOf = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
const GUESS: Record<string, string> = {
  name: 'name', full_name: 'name', fullname: 'name', lead_name: 'name', customer_name: 'name',
  first_name: 'first_name', firstname: 'first_name', last_name: 'last_name', lastname: 'last_name', surname: 'last_name',
  phone: 'phone', mobile: 'phone', contact: 'phone', phone_number: 'phone', mobile_number: 'phone', contact_number: 'phone', whatsapp: 'phone',
  email: 'email', email_address: 'email', e_mail: 'email', city: 'city', town: 'city',
  utm_source: 'utm_source', utm_medium: 'utm_medium', utm_campaign: 'utm_campaign', utm_term: 'utm_term', utm_content: 'utm_content',
}
const SAMPLE = 'Name,Phone,Email,City,Company name,utm_source\nRiya Shah,9876543210,riya@example.com,Ahmedabad,Riya Designs,instagram\n'

type Result = { created: number; updated: number; skipped: number; errors: { row: number; error: string }[] }

/** Leads → Import: CSV with column mapping; asks whether the list came from a funnel. */
export function ImportLeadsModal({
  funnels,
  defaultFunnelId,
  defaultBusinessId,
  onClose,
  onDone,
}: {
  funnels: FunnelRow[]
  defaultFunnelId: string | null
  defaultBusinessId: string | null
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const file = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [head, setHead] = useState<string[]>([])
  const [body, setBody] = useState<string[][]>([])
  const [map, setMap] = useState<string[]>([])
  const [fromFunnel, setFromFunnel] = useState<boolean | null>(null)
  const { businesses } = useAuth()
  const [funnelId, setFunnelId] = useState(defaultFunnelId ?? '')
  // only when the list is not from a funnel: put them in a funnel anyway?
  const [addToFunnel, setAddToFunnel] = useState<boolean | null>(null)
  const [businessId, setBusinessId] = useState(defaultBusinessId ?? (businesses.length === 1 ? businesses[0].id : ''))
  const [pages, setPages] = useState<LandingPage[]>([])
  const [pageId, setPageId] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    setPageId('')
    if (!funnelId || !fromFunnel) return setPages([])
    listLandingPages(funnelId).then(setPages).catch(() => setPages([]))
  }, [funnelId, fromFunnel])

  async function pick(f: File) {
    setError(null)
    setResult(null)
    if (f.size > 5 * 1024 * 1024) return setError('The file is larger than 5 MB. Split it into smaller files.')
    const rows = parseCsv(await f.text())
    if (rows.length < 2) return setError('The file has no rows under the header.')
    const h = rows[0].map((x) => x.trim())
    setFileName(f.name)
    setHead(h)
    setBody(rows.slice(1))
    setMap(h.map((x) => GUESS[keyOf(x)] ?? '@extra'))
  }

  const records = useMemo(
    () =>
      body.map((r) => {
        const o: Record<string, string> = {}
        map.forEach((m, i) => {
          const v = (r[i] ?? '').trim()
          if (!m || !v) return
          const k = m === '@extra' ? keyOf(head[i]) : m
          if (k) o[k] = v
        })
        return o
      }),
    [body, map, head],
  )
  const funnel = funnels.find((f) => f.id === funnelId)

  async function run() {
    if (!head.length) return setError('Choose a CSV file.')
    if (!map.includes('phone')) return setError('Match one column to Phone.')
    if (!map.includes('name') && !map.includes('first_name')) return setError('Match a column to Full name or First name.')
    if (fromFunnel === null) return setError('Answer: are these leads from a funnel?')
    const useFunnel = fromFunnel || addToFunnel === true
    if (!fromFunnel && addToFunnel === null) return setError('Answer: do you want to add them to a funnel?')
    if (useFunnel && !funnelId) return setError(fromFunnel ? 'Pick the funnel they came from.' : 'Pick the funnel to add them to.')
    if (!useFunnel && !businessId) return setError('Pick the business they belong to.')
    const target = useFunnel
      ? { businessId: funnels.find((f) => f.id === funnelId)!.business_id, funnelId }
      : { businessId, funnelId: null }
    setBusy(true)
    setError(null)
    const total: Result = { created: 0, updated: 0, skipped: 0, errors: [] }
    try {
      for (let i = 0; i < records.length; i += 500) {
        setProgress(`Importing ${Math.min(i + 500, records.length)} of ${records.length}…`)
        const r = await importLeads(target, fromFunnel && pageId ? pageId : null, fromFunnel, records.slice(i, i + 500))
        total.created += r.created
        total.updated += r.updated
        total.skipped += r.skipped
        total.errors.push(...r.errors.map((e) => ({ ...e, row: e.row + i + 1 })))
      }
      setResult(total)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  const finish = () =>
    result
      ? onDone(`Import done: ${result.created} added, ${result.updated} updated${result.skipped ? `, ${result.skipped} skipped` : ''}.`)
      : onClose()

  return (
    <Modal
      open
      onClose={result ? finish : onClose}
      width={780}
      title="Import leads"
      footer={
        result ? (
          <div className="foot-end">
            <Button onClick={finish}>Done</Button>
          </div>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <div className="foot-end">
              {error && <p className="err-text">{error}</p>}
              {progress && <span className="muted small">{progress}</span>}
              <Button onClick={run} disabled={busy || !records.length}>
                {busy ? 'Importing…' : `Import ${records.length || ''} lead${records.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </>
        )
      }
    >
      {result ? (
        <div className="stack">
          <div className="pl-tiles fp-tiles" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <div className="pl-tile">
              <div className="pl-tile-label">Added</div>
              <div className="pl-tile-value tone-success">{result.created}</div>
            </div>
            <div className="pl-tile">
              <div className="pl-tile-label">Updated (same phone)</div>
              <div className="pl-tile-value">{result.updated}</div>
            </div>
            <div className="pl-tile">
              <div className="pl-tile-label">Skipped</div>
              <div className="pl-tile-value">{result.skipped}</div>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div>
              <span className="field-label">Skipped rows</span>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {result.errors.slice(0, 15).map((e) => (
                  <li key={e.row}>
                    Row {e.row + 1}: {e.error}
                  </li>
                ))}
                {result.errors.length > 15 && <li className="muted">…and {result.errors.length - 15} more</li>}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="stack">
          <div className="row">
            <input
              ref={file}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void pick(f)
              }}
            />
            <Button variant="outline" onClick={() => file.current?.click()}>
              <FileUp size={15} /> {fileName ? 'Choose another file' : 'Choose CSV file'}
            </Button>
            {fileName ? (
              <span className="small">
                <b>{fileName}</b> · {body.length} row{body.length === 1 ? '' : 's'}
              </span>
            ) : (
              <a
                className="link-btn"
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE)}`}
                download="leads-sample.csv"
              >
                Download a sample CSV
              </a>
            )}
          </div>

          {head.length > 0 && (
            <div>
              <span className="field-label">Match the columns</span>
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Column in your file</th>
                      <th>Saved as</th>
                      <th>First rows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {head.map((h, i) => (
                      <tr key={i}>
                        <td className="strong">{h || `Column ${i + 1}`}</td>
                        <td>
                          <select
                            className="input input-sm"
                            aria-label={`Save ${h} as`}
                            value={map[i] ?? ''}
                            onChange={(e) => setMap((m) => m.map((x, j) => (j === i ? e.target.value : x)))}
                          >
                            {TARGETS.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.value === '@extra' ? `Extra field (${keyOf(h) || '—'})` : t.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="muted small">
                          <span className="cell-clip" style={{ maxWidth: 260 }}>
                            {body
                              .slice(0, 3)
                              .map((r) => r[i])
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Hint>Phone and a name are required. A phone that is already there (in the chosen funnel, or in the business when there is no funnel) updates that lead instead of adding a new one.</Hint>
            </div>
          )}

          <div className="check-box">
            <span className="field-label" style={{ margin: 0 }}>
              Are these leads from a funnel?
            </span>
            <div className="seg seg-sm">
              <button type="button" className={cn(fromFunnel === true && 'is-active')} onClick={() => setFromFunnel(true)}>
                Yes
              </button>
              <button type="button" className={cn(fromFunnel === false && 'is-active')} onClick={() => setFromFunnel(false)}>
                No
              </button>
            </div>
            {fromFunnel === false && (
              <>
                <span className="field-label" style={{ margin: '4px 0 0' }}>
                  Do you want to add them to a funnel?
                </span>
                <div className="seg seg-sm">
                  <button type="button" className={cn(addToFunnel === true && 'is-active')} onClick={() => setAddToFunnel(true)}>
                    Yes
                  </button>
                  <button type="button" className={cn(addToFunnel === false && 'is-active')} onClick={() => setAddToFunnel(false)}>
                    No
                  </button>
                </div>
              </>
            )}
            {(fromFunnel === true || (fromFunnel === false && addToFunnel === true)) && (
              <div className="form-grid">
                <div>
                  <Label htmlFor="imp-funnel" required>
                    {fromFunnel ? 'Funnel' : 'Add them to funnel'}
                  </Label>
                  <Select id="imp-funnel" value={funnelId} onChange={(e) => setFunnelId(e.target.value)}>
                    <option value="">— select —</option>
                    {funnels.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                </div>
                {fromFunnel && (
                  <div>
                    <Label htmlFor="imp-page">Landing page</Label>
                    <Select id="imp-page" value={pageId} onChange={(e) => setPageId(e.target.value)} disabled={!pages.length}>
                      <option value="">{pages.length ? '— optional —' : 'No landing pages'}</option>
                      {pages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
                <div className="span-2">
                  <Hint>
                    {fromFunnel
                      ? `They are tagged with the funnel${funnel?.tags.length ? ` (${funnel.tags.join(', ')})` : ''} and start in its first stage. Importing doesn’t start the communication chain.`
                      : 'They start in the funnel’s first stage. The funnel’s tags are not added.'}
                  </Hint>
                </div>
              </div>
            )}
            {fromFunnel === false && addToFunnel === false && (
              <div className="form-grid">
                <div>
                  <Label htmlFor="imp-business" required>
                    Business
                  </Label>
                  <Select id="imp-business" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
                    <option value="">— select —</option>
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="span-2">
                  <Hint>They are saved without a funnel (no stage). Find them under Leads → “No funnel” and move them into a funnel any time.</Hint>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
