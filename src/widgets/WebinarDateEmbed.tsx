import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Hint } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { listWebinarDates, listWebinars, type WebinarDate } from '@/webinars/api'
import { shortBase } from '@/workflows/api'
import { WEBINAR_SHOWS, type WebinarShow, type WebinarWidget } from './api'

/** the script on the workspace's own domain: <app>/webinar-date.js */
export const webinarScriptUrl = () => `${shortBase()}/webinar-date.js`
/** the line to paste: a <span> (to style it: class webinar-date / webinar-time / webinar-time-timezone / webinar-countdown) with the script in it */
export const oneLine = (code: string, show: WebinarShow) =>
  `<span class="webinar-${show}"><script src="${webinarScriptUrl()}" data-webinar="${code}" data-show="${show}" async></script></span>`

// the same text the script shows (India time)
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const clock = (hm: string) => {
  const [h, m] = hm.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}
const day = (d: string) => {
  const [y, mo, dd] = d.split('-').map(Number)
  return `${DAYS[new Date(Date.UTC(y, mo - 1, dd)).getUTCDay()]}, ${dd} ${MONTHS[mo - 1]} ${y}`
}
const two = (n: number) => String(n).padStart(2, '0')
/** what a tag shows now for this date (empty: no date) */
export function showText(d: WebinarDate | null, show: WebinarShow, now = Date.now()) {
  if (!d) return ''
  const t = d.start_time.slice(0, 5)
  if (show === 'date') return day(d.event_date)
  if (show === 'time') return clock(t)
  if (show === 'time-timezone') return `${clock(t)} IST`
  const s = Date.parse(`${d.event_date}T${t}:00+05:30`)
  const e = Date.parse(`${d.event_date}T${(d.end_time ?? d.start_time).slice(0, 5)}:00+05:30`)
  if (now >= s && now < e) return 'Live now'
  if (now >= e) return ''
  const x = Math.floor((s - now) / 1000)
  const dd = Math.floor(x / 86400)
  return `${dd ? `${dd}d ` : ''}${two(Math.floor((x % 86400) / 3600))}h ${two(Math.floor((x % 3600) / 60))}m ${two(x % 60)}s`
}
/** the webinar's date open for registration: the first whose start minus the cutoff is still ahead */
export const currentDate = (dates: WebinarDate[], webinarId: string, now = Date.now(), closeMinutes = 15) =>
  dates
    .filter((d) => d.webinar_id === webinarId && Date.parse(`${d.event_date}T${d.start_time.slice(0, 5)}:00+05:30`) - closeMinutes * 60_000 > now)
    .sort((a, b) => `${a.event_date}${a.start_time}`.localeCompare(`${b.event_date}${b.start_time}`))[0] ?? null

/** the embed code (one line per thing to show), with what each shows now */
export function WebinarDateEmbed({ widget, onClose }: { widget: WebinarWidget; onClose: () => void }) {
  const tenant = useTenant()
  const [dates, setDates] = useState<WebinarDate[]>([])
  const [close, setClose] = useState(15)
  const [now, setNow] = useState(Date.now())
  const [copied, setCopied] = useState('')
  const [show, setShow] = useState<WebinarShow>('date')
  useEffect(() => {
    void listWebinarDates(tenant.id).then(setDates, () => setDates([]))
    void listWebinars(tenant.id).then((ws) => setClose(ws.find((w) => w.id === widget.config.webinar_id)?.reg_close_minutes ?? 15), () => undefined)
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [tenant.id, widget.config.webinar_id])
  const cur = currentDate(dates, widget.config.webinar_id, now, close)
  const copy = (k: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(k)
      window.setTimeout(() => setCopied(''), 1500)
    })
  }
  const code = oneLine(widget.code, show)

  return (
    <Modal open onClose={onClose} title={`Embed · ${widget.name}`} width={720}>
      <div className="stack" style={{ gap: 14 }}>
        <Hint>
          Pick what to show, then paste the line where the text should show (one line per thing). It shows the webinar’s date open for registration, in India time: it moves to the next date when registration closes. It takes your page’s style; to style it on its own, use its span’s class (e.g. .webinar-{show}).
          {widget.is_active ? '' : ' The widget is off: it stays empty until you turn it on.'}
        </Hint>
        <div className="wd-code">
          <pre className="embed-code">{code}</pre>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => copy('code', code)}>
            {copied === 'code' ? <Check size={14} /> : <Copy size={14} />} {copied === 'code' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="wd-shows" role="radiogroup" aria-label="What it shows">
          {WEBINAR_SHOWS.map((s) => (
            <button key={s.show} type="button" role="radio" aria-checked={show === s.show} className={cn('wd-show', show === s.show && 'is-on')} onClick={() => setShow(s.show)}>
              <b>{s.label}</b>
              <code className="small">data-show=&quot;{s.show}&quot;</code>
              <span className="muted small">Shows now: {showText(cur, s.show, now) || '— (no coming date)'}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
