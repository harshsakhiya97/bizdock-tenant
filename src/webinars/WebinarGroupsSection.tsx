import { useEffect, useMemo, useState, type MutableRefObject } from 'react'
import { useTenant } from '@/tenant/useTenant'
import { listGroups, listWebinarDates, plannedDates, saveGroups, WA_GROUP_LINK, type WebinarGroup, type WebinarRow } from './api'

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
/** how many coming dates are listed */
const SHOWN = 15

/**
 * A webinar's WhatsApp groups (made on the phone and added to the community): one per coming date. Saved with the webinar (saveRef).
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

  return (
    <div className="stack" style={{ gap: 12 }}>
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
    </div>
  )
}
