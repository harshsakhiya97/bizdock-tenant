import { useEffect, useMemo, useState, type MutableRefObject } from 'react'
import { Button } from '@/components/Button'
import { FormSection, TextArea } from '@/components/Field'
import { useTenant } from '@/tenant/useTenant'
import { listGroups, listWebinarDates, plannedDates, saveGroups, WA_GROUP_LINK, type WebinarGroup, type WebinarRow } from './api'

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
/** how many coming dates are listed */
const SHOWN = 15

/**
 * A webinar's WhatsApp groups (made on the phone and added to the community): one per coming date. Paste several links at
 * once and they fill the dates without a group, in order. Saved with the webinar (saveRef).
 */
export function WebinarGroupsSection({
  webinar,
  canEdit,
  saveRef,
}: {
  webinar: WebinarRow
  canEdit: boolean
  saveRef: MutableRefObject<((webinarId: string) => Promise<void>) | null>
}) {
  const tenant = useTenant()
  const [made, setMade] = useState<string[] | null>(null)
  const [before, setBefore] = useState<WebinarGroup[]>([])
  const [links, setLinks] = useState<Record<string, string>>({})
  const [paste, setPaste] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const today = todayIst()

  useEffect(() => {
    void listWebinarDates(tenant.id).then(
      (ds) => setMade(ds.filter((d) => d.webinar_id === webinar.id).map((d) => d.event_date)),
      () => setMade([]),
    )
    void listGroups(webinar.id).then(
      (gs) => {
        setBefore(gs)
        setLinks(Object.fromEntries(gs.map((g) => [g.group_date, g.invite_link])))
      },
      () => setBefore([]),
    )
  }, [tenant.id, webinar.id])

  // the coming dates: the ones made (from today) and the scheduled ones, plus any later date that already has a group
  const dates = useMemo(() => {
    if (!made) return []
    const coming = [...new Set([...made.filter((d) => d >= today), ...plannedDates(webinar, made, today)])].sort().slice(0, SHOWN)
    const extra = before.map((g) => g.group_date).filter((d) => d >= today && !coming.includes(d))
    return [...coming, ...extra].sort()
  }, [made, today, webinar, before])

  saveRef.current = async (webinarId: string) => {
    // only the coming dates shown are changed; past dates keep their groups
    const shown = Object.fromEntries(dates.map((d) => [d, links[d] ?? '']))
    await saveGroups(tenant.id, webinarId, before.filter((g) => dates.includes(g.group_date)), shown)
  }

  function fill() {
    const found: string[] = paste.match(/https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/gi) ?? []
    const fresh = found.filter((l, i) => found.indexOf(l) === i && !Object.values(links).includes(l))
    const empty = dates.filter((d) => !(links[d] ?? '').trim())
    const n = Math.min(fresh.length, empty.length)
    if (!found.length) return setNote('No WhatsApp group links found (https://chat.whatsapp.com/…).')
    setLinks((x) => ({ ...x, ...Object.fromEntries(empty.slice(0, n).map((d, i) => [d, fresh[i]])) }))
    setPaste('')
    setNote(
      `${n} group${n === 1 ? '' : 's'} added to the coming dates without one.` +
        (fresh.length > n ? ` ${fresh.length - n} more than the dates shown were left out.` : '') +
        (found.length > fresh.length ? ` ${found.length - fresh.length} already in use were skipped.` : '') +
        ' Save to keep them.',
    )
  }

  return (
    <FormSection title="WhatsApp groups" description="One group per date (make them on the phone and add them to the community). The WhatsApp group link opens the group of the date that’s on now, else the next one.">
      {canEdit && (
        <div className="stack" style={{ gap: 8 }}>
          <TextArea rows={3} value={paste} placeholder={'Paste several group invite links (one per line):\nhttps://chat.whatsapp.com/…'} onChange={(e) => setPaste(e.target.value)} />
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" disabled={!paste.trim()} onClick={fill}>
              Fill the coming dates
            </Button>
            {note && <span className="muted small">{note}</span>}
          </div>
        </div>
      )}
      {!made ? (
        <div className="muted small">Loading dates…</div>
      ) : !dates.length ? (
        <div className="muted small">No coming dates.</div>
      ) : (
        <div className="wb-groups">
          {dates.map((d) => {
            const v = links[d] ?? ''
            const bad = v.trim() && !WA_GROUP_LINK.test(v.trim())
            return (
              <div key={d} className="wb-group-row">
                <span className="wb-group-date">
                  {fmtDay(d)}
                  {made.includes(d) ? '' : <span className="muted small"> · scheduled</span>}
                </span>
                <input
                  className={bad ? 'input input-sm is-invalid' : 'input input-sm'}
                  value={v}
                  disabled={!canEdit}
                  placeholder="https://chat.whatsapp.com/…"
                  onChange={(e) => setLinks((x) => ({ ...x, [d]: e.target.value }))}
                />
              </div>
            )
          })}
        </div>
      )}
    </FormSection>
  )
}
