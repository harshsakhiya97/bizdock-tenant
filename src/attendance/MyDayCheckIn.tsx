import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { useTenant } from '@/tenant/useTenant'
import { getSettings, isoDay, listAttendance, type AttRow, type AttSettings } from './api'
import { TodayCard } from './TodayCard'

/** My Day: the check-in / out bar. */
export function MyDayCheckIn({ onNotice }: { onNotice: (msg: string) => void }) {
  const tenant = useTenant()
  const { membership } = useAuth()
  const [settings, setSettings] = useState<AttSettings | null>(null)
  const [row, setRow] = useState<AttRow | undefined>()
  const today = isoDay(new Date())
  const load = useCallback(() => {
    void Promise.all([getSettings(tenant.id), listAttendance(tenant.id, today, today)]).then(([s, r]) => {
      setSettings(s)
      setRow(r.find((x) => x.member_id === membership?.id))
    })
  }, [tenant.id, today, membership?.id])
  useEffect(load, [load])
  if (!settings || membership?.is_support) return null
  return (
    <div className="card card-pad myday-checkin">
      <div className="row-between">
        <b>Attendance</b>
        <Link to="/attendance" className="link small">
          My log →
        </Link>
      </div>
      <TodayCard
        compact
        row={row}
        settings={settings}
        onChanged={(m) => {
          onNotice(m)
          load()
        }}
        onError={onNotice}
      />
    </div>
  )
}
