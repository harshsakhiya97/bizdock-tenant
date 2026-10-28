import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, ChevronRight, FlaskConical, Loader2, Save, X } from 'lucide-react'
import { getWebhook, saveFieldMap, startWebhookTest, stopWebhookTest } from './api'
import { KNOWN_NAMES, guessTarget, targetLabel, targetsFor } from './fieldMap'
import { PickPerField, pickTargets } from './PickPerField'
import type { FunnelWebhook } from './types'

/**
 * Test mode + field mapping for one landing page:
 * "Test webhook" → the next form post is saved as a sample (no lead) → its fields are matched to lead fields.
 */
export function FieldMapping({
  hook: page,
  canEdit,
  onChanged,
  onError,
  actions,
}: {
  /** extra buttons next to Test (e.g. Workflow) */
  actions?: ReactNode
  hook: FunnelWebhook
  canEdit: boolean
  onChanged: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [sample, setSample] = useState(page.sample)
  const [sampleAt, setSampleAt] = useState(page.sample_at)
  const [until, setUntil] = useState<string | null>(
    page.test_mode_until && new Date(page.test_mode_until) > new Date() ? page.test_mode_until : null,
  )
  const [map, setMap] = useState<Record<string, string>>(page.field_map ?? {})
  const [dirty, setDirty] = useState(false)
  // collapsed once the form has been tested
  const [open, setOpen] = useState(!page.sample)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const startedAt = useRef<string | null>(page.sample_at)

  // while listening: check every 3 s whether the test arrived; stop at the deadline
  useEffect(() => {
    if (!until) return
    const t = setInterval(async () => {
      setNow(Date.now())
      if (new Date(until).getTime() <= Date.now()) {
        setUntil(null)
        return
      }
      try {
        const p = await getWebhook(page.id)
        if (p?.sample_at && p.sample_at !== startedAt.current) {
          setSample(p.sample)
          setSampleAt(p.sample_at)
          setUntil(null)
          // suggest a target for every new field, keep the ones already chosen
          setMap((m) => {
            const next = { ...m }
            for (const k of Object.keys(p.sample ?? {})) if (!next[k] && !k.includes('.')) next[k] = guessTarget(k, p.action)
            return next
          })
          setDirty(true)
        }
      } catch {
        /* try again on the next tick */
      }
    }, 3000)
    return () => clearInterval(t)
  }, [until, page.id])

  const keys = useMemo(() => [...new Set([...Object.keys(sample ?? {}), ...Object.keys(map)])], [sample, map])
  // fields inside an object (a.b.c) are used only when picked
  const target = (k: string) => map[k] ?? (k.includes('.') ? 'ignore' : guessTarget(k, page.action))
  const nested = keys.some((k) => k.includes('.'))
  const chosen = new Set(keys.map(target))
  // what a post must carry for this webhook's action
  const missing = (
    page.action === 'create_lead' || !page.action
      ? [!chosen.has('name') && !chosen.has('first_name') ? 'Name' : null, !chosen.has('phone') ? 'Phone' : null, !chosen.has('email') ? 'Email' : null]
      : [
          page.match_by === 'phone' && !chosen.has('phone') ? 'Phone' : null,
          page.match_by === 'email' && !chosen.has('email') ? 'Email' : null,
          page.match_by === 'both' && !chosen.has('phone') && !chosen.has('email') ? 'Phone or Email' : null,
          page.action === 'create_meeting' && !chosen.has('meeting_start') ? 'Meeting date & time' : null,
        ]
  ).filter(Boolean)
  const targets = targetsFor(page.action ?? 'create_lead')

  async function start() {
    setOpen(true)
    setBusy(true)
    try {
      startedAt.current = sampleAt
      setUntil(await startWebhookTest(page.id))
      setNow(Date.now())
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function stop() {
    setUntil(null)
    try {
      await stopWebhookTest(page.id)
    } catch {
      /* the test window ends by itself */
    }
  }
  async function save() {
    setBusy(true)
    try {
      // only keep what differs from the automatic guess, plus every field of the sample
      const out: Record<string, string> = {}
      for (const k of keys) {
        const t = target(k)
        // a request with objects inside: keep only what's picked
        if (k.includes('.') && t === 'ignore') continue
        out[k] = t
      }
      await saveFieldMap(page.id, out)
      setMap(out)
      setDirty(false)
      onChanged(`Field mapping for ${page.name} saved.`)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const left = until ? Math.max(0, Math.round((new Date(until).getTime() - now) / 1000)) : 0

  return (
    <div className="lp-block">
      <div className="row-between">
        <button type="button" className="fm-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open || !!until}>
          <ChevronRight size={15} className={open || until ? 'is-open' : undefined} />
          <span className="lp-label">Form fields</span>
          {!open && !until && (
            <span className="muted small">
              {keys.length ? `${keys.length} field${keys.length === 1 ? '' : 's'}` : 'not tested yet'}
              {sampleAt ? ` · test received ${new Date(sampleAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}
            </span>
          )}
        </button>
        <div className="row" style={{ gap: 6 }}>
        {actions}
        {canEdit &&
          (until ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={stop}>
              <X size={14} /> Stop test
            </button>
          ) : (
            <button type="button" className="btn btn-outline btn-sm" onClick={start} disabled={busy || !page.is_active}>
              <FlaskConical size={14} /> {sample ? 'Test again' : 'Test webhook'}
            </button>
          ))}
        </div>
      </div>
      {(open || until) && (
      <>

      {until && (
        <div className="fm-wait">
          <Loader2 size={16} className="spin" />
          <div>
            <b>Waiting for a test submission…</b>
            <div className="muted small">
              Submit the form on the landing page once (or send the cURL below). It is saved as a sample, no lead is made.{' '}
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left.
            </div>
          </div>
        </div>
      )}
      {!page.is_active && <div className="muted small">Turn the landing page on to test it.</div>}

      {keys.length === 0 ? (
        !until && (
          <div className="muted small">
            No test yet. Fields are recognised by their usual names (e.g. {KNOWN_NAMES.name.slice(0, 2).join(' / ')},{' '}
            {KNOWN_NAMES.phone.slice(1, 5).join(' / ')}, {KNOWN_NAMES.email.slice(0, 2).join(' / ')},{' '}
            {KNOWN_NAMES.company_name.slice(0, 2).join(' / ')}, {KNOWN_NAMES.purpose.slice(0, 2).join(' / ')},{' '}
            {KNOWN_NAMES.note.slice(0, 3).join(' / ')}). Test the webhook to see and match the page’s own fields.
          </div>
        )
      ) : (
        <>
          {sampleAt && (
            <div className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={14} className="tone-success" /> Test received{' '}
              {new Date(sampleAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
            </div>
          )}
          {nested ? (
            <PickPerField
              keys={keys}
              sample={sample}
              map={Object.fromEntries(keys.map((k) => [k, target(k)]).filter(([, t]) => t !== 'ignore'))}
              targets={pickTargets(targets)}
              canEdit={canEdit}
              onChange={(next) => {
                setMap(Object.fromEntries(keys.map((k) => [k, next[k] ?? 'ignore'])))
                setDirty(true)
              }}
            />
          ) : (
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Field sent by the form</th>
                  <th>Test value</th>
                  <th>{page.action === 'create_meeting' ? 'Used as' : page.action === 'purchase' ? 'Used as' : 'Saved on the lead as'}</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k}>
                    <td>
                      <code className="code-chip">{k}</code>
                    </td>
                    <td className="muted small">
                      <span className="cell-clip" style={{ maxWidth: 240 }}>
                        {sample?.[k] ?? '—'}
                      </span>
                    </td>
                    <td>
                      {canEdit ? (
                        <div className={target(k).startsWith('extra') ? 'fm-extra' : undefined}>
                          <select
                            className="input input-sm"
                            aria-label={`${k} saved as`}
                            value={target(k).startsWith('extra') ? 'extra' : target(k)}
                            onChange={(e) => {
                              setMap((m) => ({ ...m, [k]: e.target.value }))
                              setDirty(true)
                            }}
                          >
                            {targets.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.value === 'extra' ? 'Extra field, named…' : t.label}
                              </option>
                            ))}
                          </select>
                          {target(k).startsWith('extra') && (
                            <input
                              className="input input-sm"
                              aria-label={`Extra field name for ${k}`}
                              placeholder={k}
                              value={target(k).startsWith('extra:') ? target(k).slice(6) : k}
                              onChange={(e) => {
                                const name = e.target.value
                                // an empty name falls back to the form's field name
                                setMap((m) => ({ ...m, [k]: `extra:${name}` }))
                                setDirty(true)
                              }}
                            />
                          )}
                        </div>
                      ) : (
                        target(k).startsWith('extra:') ? `Extra field: ${target(k).slice(6).trim() || k}` : targetLabel(target(k))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          {page.action === 'create_meeting' && (
            <div className="muted small">
              The lead is found by its phone / email; the meeting runs from <b>Meeting date &amp; time</b> to <b>Meeting end time</b> (30 minutes if no end is sent;
              a time without a time zone is taken as India time). <b>Team member</b> is matched by name to someone in Team and shown on the meeting.
            </div>
          )}
          {page.action === 'purchase' && <div className="muted small">For now a payment is logged on the lead’s activity (amount, product, payment ID); bookings aren’t changed.</div>}
          {missing.length > 0 && (
            <div className="alert alert-warning small">
              <AlertTriangle size={14} /> Nothing is matched to {missing.join(', ')}. Form posts without {missing.length > 1 ? 'them' : 'it'} are
              rejected.
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
      </>
      )}
    </div>
  )
}
