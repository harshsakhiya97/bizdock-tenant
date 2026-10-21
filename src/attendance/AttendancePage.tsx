import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Label, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { PageHead } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import {
  clock,
  correct,
  dayStatus,
  getSettings,
  hm,
  isoDay,
  listAttendance,
  listDaysOff,
  listPeople,
  longBreaks,
  mins,
  saveSettings,
  setWeeklyOff,
  STATUS_LABEL,
  WEEKDAY_SHORT,
  workedMinutes,
  type AttRow,
  type AttSettings,
  type DayOff,
  type Person,
} from './api'
import { TodayCard } from './TodayCard'
import { Flash } from '@/components/Flash'

const monthDays = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)
}

/** Attendance: my day (check in / breaks / out), my log, monthly discipline, team today, corrections and rules. */
export function AttendancePage() {
  const tenant = useTenant()
  const { can, membership } = useAuth()
  const me = membership?.id ?? ''
  const canEdit = can('attendance', 'edit')
  const today = isoDay(new Date())
  const [month, setMonth] = useState(today.slice(0, 7))
  const [settings, setSettings] = useState<AttSettings | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [rows, setRows] = useState<AttRow[]>([])
  const [offs, setOffs] = useState<DayOff[]>([])
  const [logPerson, setLogPerson] = useState(me)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const [weeklyFor, setWeeklyFor] = useState<Person | null>(null)

  const load = useCallback(() => {
    const days = monthDays(month)
    // the month shown, plus today (for the Today card and Team today)
    const from = days[0] < today ? days[0] : today
    const to = days[days.length - 1] > today ? days[days.length - 1] : today
    Promise.all([getSettings(tenant.id), listPeople(tenant.id), listAttendance(tenant.id, from, to), listDaysOff(tenant.id, from, to)])
      .then(([s, p, r, o]) => {
        setSettings(s)
        setPeople(p)
        setRows(r)
        setOffs(o)
      })
      .catch((e: Error) => setNotice({ error: e.message }))
  }, [tenant.id, month, today])
  useEffect(load, [load])

  // hidden support logins don't keep attendance: show the first team member's log instead
  const isSupport = !!membership?.is_support
  useEffect(() => {
    if (people.length && !people.some((p) => p.id === logPerson)) setLogPerson(people[0].id)
  }, [people, logPerson])

  const done = (msg: string) => {
    setNotice({ ok: msg })
    load()
  }
  const rowOf = useCallback((member: string, day: string) => rows.find((r) => r.member_id === member && r.work_date === day), [rows])
  const myRow = rowOf(me, today)
  const meAsPerson: Person = people.find((p) => p.id === me) ?? { id: me, name: 'Me', weekly_off: settings?.weekly_off ?? [0] }
  const todayOff = offs.find((o) => o.from <= today && o.to >= today && (o.kind === 'holiday' ? !o.members.length || o.members.includes(me) : o.members.includes(me)))
  const dayNote = todayOff
    ? todayOff.kind === 'holiday'
      ? `Today is a holiday (${todayOff.title}).`
      : 'You are on leave today.'
    : meAsPerson.weekly_off.includes(new Date().getDay())
      ? 'Today is your weekly off.'
      : null

  // ---- monthly numbers per person ----
  const days = monthDays(month)
  const stats = useMemo(() => {
    if (!settings) return []
    return people.map((p) => {
      let working = 0, present = 0, late = 0, lateMin = 0, half = 0, leave = 0, absent = 0, breaksBad = 0
      for (const d of days) {
        if (d > today) break
        const r = rowOf(p.id, d)
        const st = dayStatus(d, today, p, r, offs, settings)
        if (st === 'holiday' || st === 'off') continue
        working++
        if (st === 'leave') leave++
        else if (st === 'absent') absent++
        else {
          present++
          if (r?.is_late) {
            late++
            lateMin += r.late_minutes
          }
          if (st === 'half') half++
          if (r) breaksBad += longBreaks(r, settings)
        }
      }
      const base = working - leave
      const score = base > 0 ? Math.max(0, Math.round(((present - late / 2 - breaksBad / 4 - half / 2) / base) * 100)) : null
      return { p, working, present, late, lateMin, half, leave, absent, breaksBad, score }
    })
  }, [people, days, today, rowOf, offs, settings])

  if (!settings) return <div className="empty">Loading…</div>

  const logOf = people.find((p) => p.id === logPerson) ?? meAsPerson
  const myStats = stats.find((x) => x.p.id === logOf.id)
  const logDays = days.filter((d) => d <= today).reverse()
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const upcomingHolidays = offs.filter((o) => o.kind === 'holiday' && o.to >= today).slice(0, 6)

  return (
    <>
      <PageHead title="Attendance" subtitle="Check in and out, breaks, late marks and the monthly discipline report." />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      <div className="att-grid">
        <div className="stack">
          {!isSupport && <TodayCard row={myRow} settings={settings} dayNote={dayNote} onChanged={done} onError={(m) => setNotice({ error: m })} />}

          <div className="panel">
            <div className="panel-bar">
              <b>
                {logOf.id === me ? 'My log' : `${logOf.name}’s log`} · {monthLabel}
              </b>
              <div className="row">
                {people.length > 1 && (
                  <select className="input input-sm filter-select" value={logPerson} onChange={(e) => setLogPerson(e.target.value)} aria-label="Person">
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
                <input type="month" className="input input-sm" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
              </div>
            </div>
            {myStats && (
              <div className="att-summary muted small">
                {myStats.working} working days · {myStats.present} present · {myStats.late} late · {myStats.half} half day · {myStats.leave} leave · {myStats.absent} absent · weekly off{' '}
                {logOf.weekly_off.map((d) => WEEKDAY_SHORT[d]).join(', ') || 'none'}
              </div>
            )}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>In</th>
                    <th>Out</th>
                    <th>Breaks</th>
                    <th>Work</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logDays.map((d) => {
                    const r = rowOf(logOf.id, d)
                    const st = dayStatus(d, today, logOf, r, offs, settings)
                    const s = STATUS_LABEL[st]
                    return (
                      <tr key={d} className={st === 'off' || st === 'holiday' ? 'is-off' : undefined}>
                        <td className="nowrap">{new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                        <td className={cn('nowrap', r?.is_late && 'text-danger')}>
                          {clock(r?.check_in ?? null)}
                          {r?.is_late ? <span className="muted small"> +{r.late_minutes}m</span> : null}
                        </td>
                        <td className="nowrap">{clock(r?.check_out ?? null)}</td>
                        <td className="small">
                          {r?.attendance_breaks.length
                            ? r.attendance_breaks
                                .map((b) => `${b.kind === 'lunch' ? 'Lunch' : b.kind === 'tea' ? 'Tea' : 'Break'} ${mins(b.started_at, b.ended_at)}m`)
                                .join(' · ')
                            : '—'}
                        </td>
                        <td className="nowrap">{r ? hm(workedMinutes(r)) : '—'}</td>
                        <td>
                          <span className={cn('badge', s.tone)}>{s.label}</span>
                          {r?.correction_reason && <span className="muted small" title={r.correction_reason}> · corrected</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {people.length > 1 && (
            <div className="panel">
              <div className="panel-bar">
                <b>Monthly discipline · {monthLabel}</b>
              </div>
              <div className="table-wrap">
                <table className="table disc-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th className="right">Working days</th>
                      <th className="right">Present</th>
                      <th className="right">On time</th>
                      <th className="right">Late</th>
                      <th className="right">Late min</th>
                      <th className="right">Half days</th>
                      <th className="right">Leave</th>
                      <th className="right">Absent</th>
                      <th className="right">Break issues</th>
                      <th className="right">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((x) => (
                      <tr key={x.p.id}>
                        <td>
                          <button type="button" className="link-btn" onClick={() => setLogPerson(x.p.id)}>
                            {x.p.name}
                          </button>
                          <div className="muted small">
                            Off: {x.p.weekly_off.map((d) => WEEKDAY_SHORT[d]).join(', ') || 'none'}
                            {canEdit && (
                              <button type="button" className="link-btn small" style={{ marginLeft: 6 }} onClick={() => setWeeklyFor(x.p)}>
                                change
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="right">{x.working}</td>
                        <td className="right">{x.present}</td>
                        <td className="right">{x.present - x.late}</td>
                        <td className={cn('right', x.late > 0 && 'text-warning')}>{x.late}</td>
                        <td className="right">{x.lateMin || '—'}</td>
                        <td className="right">{x.half || '—'}</td>
                        <td className="right">{x.leave || '—'}</td>
                        <td className={cn('right', x.absent > 0 && 'text-danger')}>{x.absent || '—'}</td>
                        <td className="right">{x.breaksBad || '—'}</td>
                        <td className="right">
                          <b className={x.score == null ? 'muted' : x.score >= 90 ? 'text-success' : x.score >= 75 ? 'text-warning' : 'text-danger'}>
                            {x.score == null ? '—' : `${x.score}%`}
                          </b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted small att-foot">
                Working days skip each person’s weekly off and holidays. Half day = worked under {settings.half_day_hours} h. Break issue = a tea break over{' '}
                {settings.tea_break_min + 5} min or lunch over {settings.lunch_break_min + 5} min. Score = (present − ½ late − ¼ break issues − ½ half days) ÷ working
                days excluding leave.
              </p>
            </div>
          )}
        </div>

        <aside className="stack">
          {people.length > 1 && (
            <div className="panel">
              <div className="panel-bar">
                <b>Team today</b>
                <span className="muted small">
                  {people.filter((p) => rowOf(p.id, today)?.check_in).length} of {people.length} in ·{' '}
                  {people.filter((p) => rowOf(p.id, today)?.is_late).length} late
                </span>
              </div>
              <table className="table table-split">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>In</th>
                    <th>Out</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => {
                    const r = rowOf(p.id, today)
                    const st = dayStatus(today, today, p, r, offs, settings)
                    const onBreak = r?.attendance_breaks.some((b) => !b.ended_at)
                    return (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td className={cn('nowrap', r?.is_late && 'text-danger')}>{clock(r?.check_in ?? null)}</td>
                        <td className="nowrap">{clock(r?.check_out ?? null)}</td>
                        <td>
                          {onBreak ? (
                            <span className="badge badge-warning">On break</span>
                          ) : st === 'absent' ? (
                            <span className="badge badge-muted">Not in</span>
                          ) : (
                            <span className={cn('badge', st === 'in' && r?.is_late ? 'badge-warning' : STATUS_LABEL[st].tone)}>
                              {st === 'in' ? (r?.is_late ? 'In · late' : 'In') : r?.check_out ? 'Out' : STATUS_LABEL[st].label}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {canEdit && <CorrectCard people={people} onDone={done} onError={(m) => setNotice({ error: m })} />}
          {canEdit && <RulesCard settings={settings} onDone={done} onError={(m) => setNotice({ error: m })} />}

          <div className="card card-pad stack" style={{ gap: 8 }}>
            <b>Holidays</b>
            {upcomingHolidays.length === 0 ? (
              <span className="muted small">No upcoming holidays.</span>
            ) : (
              upcomingHolidays.map((h) => (
                <div key={`${h.from}-${h.title}`} className="row-between small">
                  <span>{h.title}</span>
                  <span className="muted">{new Date(`${h.from}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              ))
            )}
            <span className="muted small">
              Nobody is marked absent on holidays and leaves.
            </span>
          </div>
        </aside>
      </div>

      {weeklyFor && (
        <WeeklyOffModal
          person={weeklyFor}
          fallback={settings.weekly_off}
          onClose={() => setWeeklyFor(null)}
          onSaved={(msg) => {
            setWeeklyFor(null)
            done(msg)
          }}
          onError={(m) => setNotice({ error: m })}
        />
      )}
    </>
  )
}

function CorrectCard({ people, onDone, onError }: { people: Person[]; onDone: (m: string) => void; onError: (m: string) => void }) {
  const tenant = useTenant()
  const [f, setF] = useState({ member: people[0]?.id ?? '', date: isoDay(new Date()), in: '', out: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const at = (t: string) => (t ? new Date(`${f.date}T${t}:00`).toISOString() : null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.member) return onError('Pick a team member.')
    if (!f.reason.trim()) return onError('Give a reason for the correction.')
    setBusy(true)
    try {
      await correct(tenant.id, f.member, f.date, at(f.in), at(f.out), f.reason)
      onDone(f.in || f.out ? 'Attendance corrected.' : 'That day’s attendance was cleared.')
      setF((d) => ({ ...d, in: '', out: '', reason: '' }))
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="card card-pad stack" style={{ gap: 10 }} onSubmit={submit}>
      <b>Correct attendance</b>
      <select className="input input-sm" value={f.member} onChange={(e) => setF((d) => ({ ...d, member: e.target.value }))} aria-label="Member">
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input type="date" className="input input-sm" max={isoDay(new Date())} value={f.date} onChange={(e) => setF((d) => ({ ...d, date: e.target.value }))} aria-label="Date" />
      <div className="row" style={{ gap: 8 }}>
        <input type="time" className="input input-sm" value={f.in} onChange={(e) => setF((d) => ({ ...d, in: e.target.value }))} aria-label="Check-in" title="Check-in" />
        <input type="time" className="input input-sm" value={f.out} onChange={(e) => setF((d) => ({ ...d, out: e.target.value }))} aria-label="Check-out" title="Check-out" />
      </div>
      <input className="input input-sm" placeholder="Reason" value={f.reason} onChange={(e) => setF((d) => ({ ...d, reason: e.target.value }))} aria-label="Reason" />
      <span className="muted small">Leave both times empty to clear the day.</span>
      <div>
        <Button type="submit" size="sm" disabled={busy}>
          Save
        </Button>
      </div>
    </form>
  )
}

function RulesCard({ settings, onDone, onError }: { settings: AttSettings; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [s, setS] = useState(settings)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof AttSettings>(k: K, v: AttSettings[K]) => setS((d) => ({ ...d, [k]: v }))
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (s.checkin_end < s.checkin_start) return onError('The window must end after it starts.')
    setBusy(true)
    try {
      await saveSettings(s)
      onDone('Attendance rules saved.')
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="card card-pad stack" style={{ gap: 10 }} onSubmit={submit}>
      <b>Rules</b>
      <div className="form-grid att-rules">
        <div>
          <Label htmlFor="ar-start">Window from</Label>
          <TextInput id="ar-start" type="time" value={s.checkin_start} onChange={(e) => set('checkin_start', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ar-end">Late after</Label>
          <TextInput id="ar-end" type="time" value={s.checkin_end} onChange={(e) => set('checkin_end', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ar-half">Half day under (h)</Label>
          <TextInput id="ar-half" type="number" min={1} max={12} step="0.5" value={s.half_day_hours} onChange={(e) => set('half_day_hours', Number(e.target.value))} />
        </div>
        <div>
          <Label htmlFor="ar-tea">Tea break (min)</Label>
          <TextInput id="ar-tea" type="number" min={0} value={s.tea_break_min} onChange={(e) => set('tea_break_min', Number(e.target.value))} />
        </div>
        <div>
          <Label htmlFor="ar-lunch">Lunch (min)</Label>
          <TextInput id="ar-lunch" type="number" min={0} value={s.lunch_break_min} onChange={(e) => set('lunch_break_min', Number(e.target.value))} />
        </div>
      </div>
      <span className="field-label">Weekly off (everyone, unless set per person)</span>
      <WeekdayPicks value={s.weekly_off} onChange={(v) => set('weekly_off', v)} />
      <div>
        <Button type="submit" size="sm" disabled={busy}>
          Save rules
        </Button>
      </div>
    </form>
  )
}

function WeekdayPicks({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="member-picks">
      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
        <label key={d} className={cn('member-pick', value.includes(d) && 'is-on')}>
          <input type="checkbox" checked={value.includes(d)} onChange={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort())} />
          {WEEKDAY_SHORT[d]}
        </label>
      ))}
    </div>
  )
}

function WeeklyOffModal({
  person,
  fallback,
  onClose,
  onSaved,
  onError,
}: {
  person: Person
  fallback: number[]
  onClose: () => void
  onSaved: (m: string) => void
  onError: (m: string) => void
}) {
  const tenant = useTenant()
  const [days, setDays] = useState(person.weekly_off)
  const [busy, setBusy] = useState(false)
  async function save(v: number[] | null) {
    setBusy(true)
    try {
      await setWeeklyOff(tenant.id, person.id, v)
      onSaved(`Weekly off for ${person.name} saved.`)
    } catch (e) {
      onError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Weekly off · ${person.name}`}
      width={480}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={() => save(null)}>
            Use the default ({fallback.map((d) => WEEKDAY_SHORT[d]).join(', ') || 'none'})
          </Button>
          <Button disabled={busy} onClick={() => save(days)}>
            Save
          </Button>
        </>
      }
    >
      <WeekdayPicks value={days} onChange={setDays} />
    </Modal>
  )
}

