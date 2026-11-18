import type { StatCol } from '@/components/StatRecords'
import { cn } from '@/lib/cn'
import { followUp, fullName, tempOf } from './labels'
import type { LeadRow, MemberOption } from './types'

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/** the columns for a list of leads in a stat's records */
export function leadCols(members: MemberOption[] = []): StatCol<LeadRow>[] {
  return [
    {
      label: 'Lead',
      render: (l) => (
        <>
          <b>{fullName(l)}</b>
          <div className="muted small">{[l.phone, l.city].filter(Boolean).join(' · ')}</div>
        </>
      ),
    },
    {
      label: 'Category',
      render: (l) => {
        const t = tempOf(l.temperature)
        return t ? <span className={cn('badge', t.tone)}>{t.label}</span> : <span className="muted">—</span>
      },
    },
    { label: 'Owner', render: (l) => members.find((m) => m.id === l.owner_id)?.name ?? <span className="muted">—</span> },
    { label: 'Next follow-up', render: (l) => followUp(l.next_follow_up_at).text },
    { label: 'Lead date', render: (l) => <span className="nowrap">{when(l.created_at)}</span> },
  ]
}
