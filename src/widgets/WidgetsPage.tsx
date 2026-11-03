import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { CalendarDays } from 'lucide-react'
import { PageHead } from '@/components/ui'
import { useTenant } from '@/tenant/useTenant'
import { listWidgets, type WidgetRow } from './api'

/** the kinds of widget there are (one card each, like System Connections) */
const KINDS = [
  {
    kind: 'booking_calendar' as const,
    to: '/widgets/booking-calendar',
    name: 'Booking Calendar',
    icon: CalendarDays,
    color: '#2563eb',
    description: 'A calendar of free slots to put on any page. Visitors pick a date and time, give their details, and the booking goes to your webhook.',
    usedFor: 'Call bookings on landing pages and websites',
  },
]

/** Widgets: things to embed on other sites, as cards with how many are active. */
export function WidgetsPage() {
  const tenant = useTenant()
  const navigate = useNavigate()
  const [rows, setRows] = useState<WidgetRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    listWidgets(tenant.id).then(setRows, (e: Error) => setError(e.message))
  }, [tenant.id])

  return (
    <>
      <PageHead title="Widgets" subtitle="Ready-made pieces to embed on your landing pages and websites." />
      {error && <div className="alert alert-error">{error}</div>}
      <div className="int-grid">
        {KINDS.map((k) => {
          const mine = (rows ?? []).filter((r) => r.kind === k.kind)
          const active = mine.filter((r) => r.is_active).length
          const Icon = k.icon
          return (
            <section key={k.kind} className="card int-card is-clickable" role="button" tabIndex={0} onClick={() => navigate(k.to)} onKeyDown={(e) => e.key === 'Enter' && navigate(k.to)}>
              <div className="int-top">
                <div className="int-icon" style={{ ['--c' as string]: k.color }}>
                  <Icon size={20} />
                </div>
                <div className="int-title">
                  <b>{k.name}</b>
                  <span className={active ? 'badge badge-success' : 'badge badge-muted'}>
                    {rows ? `${active} active${mine.length > active ? ` · ${mine.length - active} off` : ''}` : '…'}
                  </span>
                </div>
              </div>
              <p className="int-desc">{k.description}</p>
              <div className="int-used">
                <span>Used for</span> {k.usedFor}
              </div>
              <div>
                <button type="button" className="btn btn-outline btn-sm">
                  {mine.length ? 'Manage' : 'Create one'}
                </button>
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}
