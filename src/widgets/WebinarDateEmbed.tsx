import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Hint } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { listWebinarDates, type WebinarDate } from '@/webinars/api'
import { shortBase } from '@/workflows/api'
import { WEBINAR_SHOWS, type WebinarShow, type WebinarWidget } from './api'

/** the script on the workspace's own domain: <app>/webinar-date.js */
export const webinarScriptUrl = () => `${shortBase()}/webinar-date.js`
export const oneLine = (code: string, show: WebinarShow) => `<script src="${webinarScriptUrl()}" data-webinar="${code}" data-show="${show}" async></script>`
export const tagOnly = (code: string, show: WebinarShow) => `<span data-bizdock-webinar="${code}" data-show="${show}"></span>`

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
/** the webinar's current date: on now, else the next one */
export const currentDate = (dates: WebinarDate[], webinarId: string, now = Date.now()) =>
  dates
    .filter((d) => d.webinar_id === webinarId && Date.parse(`${d.event_date}T${(d.end_time ?? d.start_time).slice(0, 5)}:00+05:30`) > now)
    .sort((a, b) => `${a.event_date}${a.start_time}`.localeCompare(`${b.event_date}${b.start_time}`))[0] ?? null

/** the embed codes (one line per thing to show, or tags + the script once), with what each shows now */
export function WebinarDateEmbed({ widget, onClose }: { widget: WebinarWidget; onClose: () => void }) {
  const tenant = useTenant()
  const [form, setForm] = useState<'line' | 'tag'>('line')
  const [dates, setDates] = useState<WebinarDate[]>([])
  const [now, setNow] = useState(Date.now())
  const [copied, setCopied] = useState('')
  useEffect(() => {
    void listWebinarDates(tenant.id).then(setDates, () => setDates([]))
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [tenant.id])
  const cur = currentDate(dates, widget.config.webinar_id, now)
  const copy = (k: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(k)
      window.setTimeout(() => setCopied(''), 1500)
    })
  }
  const script = `<script src="${webinarScriptUrl()}" async></script>`

  return (
    <Modal open onClose={onClose} title={`Embed · ${widget.name}`} width={720}>
      <div className="stack" style={{ gap: 14 }}>
        <div className="tabs">
          <button type="button" className={cn('tab', form === 'line' && 'is-active')} onClick={() => setForm('line')}>
            One line
          </button>
          <button type="button" className={cn('tab', form === 'tag' && 'is-active')} onClick={() => setForm('tag')}>
            Tag + script
          </button>
        </div>
        <Hint>
          {form === 'line'
            ? 'Paste a line where the text should show (one line per thing). Each shows the webinar’s current date in India time: the one on now, else the next one.'
            : 'For page builders that remove scripts from text: paste the tags where the text should show, and the script once anywhere on the page (e.g. the footer).'}
          {widget.is_active ? '' : ' The widget is off: the tags stay empty until you turn it on.'}
        </Hint>
        {WEBINAR_SHOWS.map((s) => {
          const code = form === 'line' ? oneLine(widget.code, s.show) : tagOnly(widget.code, s.show)
          const now_ = showText(cur, s.show, now)
          return (
            <div key={s.show} className="wd-embed">
              <div className="row-between">
                <span>
                  <b>{s.label}</b> <code className="muted small">data-show=&quot;{s.show}&quot;</code>
                </span>
                <span className="muted small">
                  Shows now: <b>{now_ || '— (no coming date)'}</b>
                </span>
              </div>
              <div className="wd-code">
                <pre className="embed-code">{code}</pre>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => copy(s.show, code)}>
                  {copied === s.show ? <Check size={14} /> : <Copy size={14} />} {copied === s.show ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="muted small">e.g. {s.example}</div>
            </div>
          )
        })}
        {form === 'tag' && (
          <div className="wd-embed">
            <b>The script (once per page)</b>
            <div className="wd-code">
              <pre className="embed-code">{script}</pre>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => copy('script', script)}>
                {copied === 'script' ? <Check size={14} /> : <Copy size={14} />} {copied === 'script' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
