import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Loader2, User } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { bookSlot, publicWidget, widgetSlots, type PublicWidget, type Slot } from './api'

const TZ = 'Asia/Kolkata'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** India date of a moment: 2026-11-04 */
const istDay = (iso: string | number) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
const istTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toLowerCase()}`)
/** a slot as a range: "10:00 – 10:30 am", "11:30 am – 12:00 pm" */
function range(a: string, b: string) {
  const [s, e] = [istTime(a), istTime(b)]
  const [st, sp] = s.split(' ')
  const [et, ep] = e.split(' ')
  return sp === ep ? `${st} – ${et} ${ep}` : `${s} – ${e}`
}
const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const niceDay = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  const wd = WEEK[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7]
  return `${wd}, ${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`
}
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

/** <app>/embed/<code>: the public booking calendar shown in the iframe (no login). India time throughout. */
export function EmbedPage() {
  const { code = '' } = useParams()
  const tenant = useTenant()
  const [w, setW] = useState<PublicWidget | null | undefined>(undefined)
  const today = istDay(Date.now())
  const [ty, tm] = today.split('-').map(Number)
  const [view, setView] = useState({ y: ty, m: tm - 1 })
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [day, setDay] = useState<string | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  // Your Details filled in from the address (?name= / fname & lname, email, phone / mobile), e.g. passed on by the page it's embedded in
  const [who, setWho] = useState(() => {
    const q = new URLSearchParams(window.location.search)
    // also the host page's own address (sent as the referrer: the embed code asks for the full one)
    let host = new URLSearchParams()
    try {
      host = new URL(document.referrer).searchParams
    } catch {
      /* no referrer */
    }
    const get = (...keys: string[]) => keys.map((k) => q.get(k)?.trim() || host.get(k)?.trim() || '').find(Boolean) ?? ''
    const first = get('first_name', 'fname', 'firstname')
    const last = get('last_name', 'lname', 'lastname')
    return {
      name: get('name', 'full_name', 'fullname') || [first, last].filter(Boolean).join(' '),
      phone: get('phone', 'mobile', 'whatsapp', 'number'),
      email: get('email', 'mail'),
    }
  })
  // all three already given: start at Date & Time (Back still shows them)
  const [step, setStep] = useState<1 | 2 | 3>(() =>
    who.name.trim() && who.phone.replace(/\D/g, '').length >= 10 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(who.email.trim()) ? 2 : 1,
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  // a page for an iframe: no app background
  useEffect(() => {
    document.documentElement.classList.add('embed-mode')
    return () => document.documentElement.classList.remove('embed-mode')
  }, [])
  useEffect(() => {
    publicWidget(code).then(setW, () => setW(null))
  }, [code])

  // the months people can book in
  const lastBookable = useMemo(() => {
    const t = new Date(`${today}T00:00:00Z`)
    t.setUTCDate(t.getUTCDate() + (w?.days_ahead ?? 30))
    return t.toISOString().slice(0, 10)
  }, [today, w?.days_ahead])
  const [ly, lm] = lastBookable.split('-').map(Number)
  const canPrev = view.y > ty || (view.y === ty && view.m > tm - 1)
  const canNext = view.y < ly || (view.y === ly && view.m < lm - 1)
  const years = Array.from({ length: ly - ty + 1 }, (_, i) => ty + i)

  useEffect(() => {
    if (!w) return
    setLoading(true)
    widgetSlots(code, ymd(view.y, view.m, 1), ymd(view.y, view.m, lastDay(view.y, view.m))).then(
      (s) => {
        setSlots(s)
        setLoading(false)
      },
      () => {
        setSlots([])
        setLoading(false)
      },
    )
  }, [code, w, view, reload])

  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>()
    for (const s of slots ?? []) {
      const k = istDay(s.starts_at)
      m.set(k, [...(m.get(k) ?? []), s])
    }
    return m
  }, [slots])
  const open = (s: Slot) => s.total === 0 || s.free > 0
  /** how full a day / slot is (0–1): only when a team is picked */
  const fullness = (list: Slot[]) => {
    const t = list.reduce((a, s) => a + s.total, 0)
    return t ? 1 - list.reduce((a, s) => a + s.free, 0) / t : 0
  }

  const color = w?.color || tenant.primary_color
  const style = { ['--bk' as string]: color }

  if (w === undefined)
    return (
      <div className="bk-wrap" style={style}>
        <div className="bk-center">
          <Loader2 size={22} className="spin" />
        </div>
      </div>
    )
  if (!w)
    return (
      <div className="bk-wrap" style={style}>
        <div className="bk-center muted">This booking calendar isn’t available.</div>
      </div>
    )

  // the month grid, Monday first
  const first = (new Date(Date.UTC(view.y, view.m, 1)).getUTCDay() + 6) % 7
  const n = lastDay(view.y, view.m)
  const cells: { day: string; num: number; inMonth: boolean }[] = []
  for (let i = 0; i < first; i++) {
    const d = new Date(Date.UTC(view.y, view.m, i - first + 1))
    cells.push({ day: d.toISOString().slice(0, 10), num: d.getUTCDate(), inMonth: false })
  }
  for (let d = 1; d <= n; d++) cells.push({ day: ymd(view.y, view.m, d), num: d, inMonth: true })
  while (cells.length % 7) {
    const d = new Date(Date.UTC(view.y, view.m + 1, cells.length - first - n + 1))
    cells.push({ day: d.toISOString().slice(0, 10), num: d.getUTCDate(), inMonth: false })
  }
  const daySlots = day ? (byDay.get(day) ?? []) : []

  /** step 1 (Your Details) → step 2 (Date & Time) */
  function detailsProblem() {
    if (!who.name.trim()) return 'Please enter your name.'
    if (who.phone.replace(/\D/g, '').length < 10) return 'Please enter a valid phone number.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(who.email.trim())) return 'Please enter a valid email.'
    return null
  }

  async function book() {
    if (!slot) return
    setError(null)
    const p = detailsProblem()
    if (p) {
      setStep(1)
      return setError(p)
    }
    setBusy(true)
    try {
      const r = await bookSlot(code, slot.starts_at, { name: who.name.trim(), phone: who.phone.trim(), email: who.email.trim() })
      if (r.redirect_url) {
        // leave the iframe for the thank-you page
        try {
          window.top!.location.href = r.redirect_url
        } catch {
          window.location.href = r.redirect_url
        }
        return
      }
      setDone(r.thank_you)
      setStep(3)
    } catch (e) {
      setError((e as Error).message)
      // the slot may have just gone: show the fresh slots
      if (/just booked|can.t be booked/i.test((e as Error).message)) {
        setSlot(null)
        setReload((x) => x + 1)
      }
    }
    setBusy(false)
  }

  return (
    <div className="bk-wrap" style={style}>
      <div className="bk-card">
        <aside className="bk-side">
          <div className={cn('bk-step', step === 1 && 'is-on', step > 1 && 'is-done')}>
            <User size={16} /> <span>Your Details</span>
            <i>{step > 1 ? <Check size={12} /> : null}</i>
          </div>
          <div className={cn('bk-step', step === 2 && 'is-on', step > 2 && 'is-done')}>
            <CalendarDays size={16} /> <span>Date &amp; Time</span>
            <i>{step > 2 ? <Check size={12} /> : null}</i>
          </div>
          {slot && (
            <div className="bk-picked">
              <b>{w.name}</b>
              <span>
                <CalendarDays size={13} /> {niceDay(istDay(slot.starts_at))}
              </span>
              <span>
                <Clock size={13} /> {istTime(slot.starts_at)} – {istTime(slot.ends_at)}
              </span>
            </div>
          )}
        </aside>

        <main className="bk-main">
          {step === 2 && (
            <>
              <div className="bk-head">Date &amp; Time</div>
              <div className="bk-body">
                <div className="bk-nav">
                  <select
                    aria-label="Month"
                    value={view.m}
                    onChange={(e) => {
                      setView({ ...view, m: Number(e.target.value) })
                      setDay(null)
                      setSlot(null)
                    }}
                  >
                    {MONTHS.map((mn, i) => (
                      <option key={mn} value={i} disabled={(view.y === ty && i < tm - 1) || (view.y === ly && i > lm - 1)}>
                        {mn}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Year"
                    value={view.y}
                    onChange={(e) => {
                      const y = Number(e.target.value)
                      setView({ y, m: y === ty ? Math.max(view.m, tm - 1) : y === ly ? Math.min(view.m, lm - 1) : view.m })
                      setDay(null)
                      setSlot(null)
                    }}
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <div className="bk-arrows">
                    <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => setView(view.m === 0 ? { y: view.y - 1, m: 11 } : { ...view, m: view.m - 1 })}>
                      <ChevronLeft size={16} />
                    </button>
                    <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => setView(view.m === 11 ? { y: view.y + 1, m: 0 } : { ...view, m: view.m + 1 })}>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  {loading && <Loader2 size={16} className="spin bk-load" />}
                </div>

                <div className="bk-grid">
                  {WEEK.map((d) => (
                    <div key={d} className="bk-wd">
                      {d}
                    </div>
                  ))}
                  {cells.map((c) => {
                    const list = c.inMonth ? (byDay.get(c.day) ?? []) : []
                    const any = list.some(open)
                    const fill = list.length ? fullness(list) : 0
                    return (
                      <button
                        key={c.day}
                        type="button"
                        className={cn('bk-day', !c.inMonth && 'is-out', any && 'is-open', list.length > 0 && !any && 'is-full', day === c.day && 'is-picked', c.day === today && 'is-today')}
                        disabled={!any}
                        title={list.length && !any ? 'Fully booked' : undefined}
                        onClick={() => {
                          setDay(c.day)
                          setSlot(null)
                        }}
                      >
                        {c.num}
                        {any && w.team > 0 && <span className="bk-fill" style={{ width: `${Math.round(fill * 100)}%` }} />}
                      </button>
                    )
                  })}
                </div>

                {day && (
                  <div className="bk-slots">
                    <div className="bk-slots-head">{niceDay(day)}</div>
                    <div className="bk-slot-list">
                      {daySlots.map((s) => {
                        const ok = open(s)
                        return (
                          <button key={s.starts_at} type="button" className={cn('bk-slot', !ok && 'is-booked', slot?.starts_at === s.starts_at && 'is-picked')} disabled={!ok} onClick={() => setSlot(s)}>
                            <b>{range(s.starts_at, s.ends_at)}</b>
                            {!ok ? <small>Booked</small> : s.total > 1 ? <small>{s.free} slot{s.free === 1 ? '' : 's'} available</small> : null}
                            {ok && s.total > 1 && <span className="bk-fill" style={{ width: `${Math.round((1 - s.free / s.total) * 100)}%` }} />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {!loading && slots && !slots.length && <div className="bk-none">No free slots this month.</div>}
                {error && <div className="bk-error">{error}</div>}
              </div>
              <div className="bk-foot">
                <button type="button" className="bk-btn is-ghost" onClick={() => setStep(1)} disabled={busy}>
                  Back
                </button>
                <button type="button" className="bk-btn" disabled={!slot || busy} onClick={() => void book()}>
                  {busy ? 'Booking…' : 'Submit'}
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="bk-head">Your Details</div>
              <div className="bk-body bk-form">
                <label>
                  <span>Full name *</span>
                  <input value={who.name} onChange={(e) => setWho({ ...who, name: e.target.value })} autoComplete="name" />
                </label>
                <label>
                  <span>Phone *</span>
                  <input type="tel" value={who.phone} onChange={(e) => setWho({ ...who, phone: e.target.value })} autoComplete="tel" placeholder="10-digit mobile number" />
                </label>
                <label>
                  <span>Email *</span>
                  <input type="email" value={who.email} onChange={(e) => setWho({ ...who, email: e.target.value })} autoComplete="email" />
                </label>
                {error && <div className="bk-error">{error}</div>}
              </div>
              <div className="bk-foot">
                <button
                  type="button"
                  className="bk-btn"
                  onClick={() => {
                    const p = detailsProblem()
                    setError(p)
                    if (!p) setStep(2)
                  }}
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="bk-done">
              <span className="bk-done-icon">
                <Check size={28} />
              </span>
              <b>You’re booked!</b>
              <p>{done}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
