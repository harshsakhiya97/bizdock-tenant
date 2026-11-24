import { useEffect, useMemo, useState } from 'react'
import { useBusiness } from '@/business/useBusiness'
import { SearchSelect } from '@/components/SearchSelect'
import { Empty, PageHead } from '@/components/ui'
import { listFunnelLeads, listMemberOptions } from '@/leads/api'
import type { LeadRow, MemberOption } from '@/leads/types'
import { listFunnelSubmissions, listFunnels } from '@/funnels/api'
import { FunnelOverviewReport } from '@/funnels/FunnelOverviewReport'
import type { FunnelRow, SubmissionRow } from '@/funnels/types'
import { useTenant } from '@/tenant/useTenant'

const KEY = (t: string) => `reports.funnel.${t}`

/** Reports → Funnel Report: a funnel's Overview report (the same component as Funnel → Overview), with a funnel picker */
export function FunnelReportPage() {
  const tenant = useTenant()
  const { selected, sub } = useBusiness()
  const [funnels, setFunnels] = useState<FunnelRow[] | null>(null)
  const [id, setId] = useState<string>(() => {
    try {
      return localStorage.getItem(KEY(tenant.id)) ?? ''
    } catch {
      return ''
    }
  })
  const [leads, setLeads] = useState<LeadRow[] | null>(null)
  const [subs, setSubs] = useState<SubmissionRow[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listFunnels(tenant.id).then(setFunnels, (e: Error) => setError(e.message))
    void listMemberOptions(tenant.id).then(setMembers)
  }, [tenant.id])
  // the funnels of the business picked at the top (all businesses: every funnel)
  const list = useMemo(
    () => (funnels ?? []).filter((f) => !selected || (f.business_id === selected.id && (!sub || f.sub_business_id === sub.id))),
    [funnels, selected, sub],
  )
  const funnel = list.find((f) => f.id === id) ?? list[0] ?? null
  useEffect(() => {
    if (!funnel) return
    try {
      localStorage.setItem(KEY(tenant.id), funnel.id)
    } catch {
      /* storage unavailable */
    }
    setLeads(null)
    setSubs([])
    listFunnelLeads(funnel.id).then(setLeads, () => setLeads([]))
    listFunnelSubmissions(funnel.id).then(setSubs, () => setSubs([]))
  }, [funnel?.id, tenant.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHead
        title="Funnel Report"
        subtitle="A funnel’s numbers: leads, forms, ad spend and every stage — the same report as the funnel’s Overview."
        actions={
          <SearchSelect
            ariaLabel="Funnel"
            className="filter-select"
            style={{ minWidth: 260 }}
            value={funnel?.id ?? null}
            placeholder={funnels ? 'Pick a funnel' : 'Loading…'}
            searchPlaceholder="Search funnels…"
            options={list.map((f) => ({ value: f.id, label: f.name }))}
            onChange={(v) => v && setId(v)}
          />
        }
      />
      {error && <div className="alert alert-error">{error}</div>}
      {funnels && !list.length ? (
        <Empty>No funnels{selected ? ` in ${selected.name}` : ''} yet.</Empty>
      ) : funnel ? (
        <div className="stack">
          <FunnelOverviewReport key={funnel.id} funnel={funnel} leads={leads} subs={subs} members={members} />
        </div>
      ) : (
        <div className="empty">Loading…</div>
      )}
    </>
  )
}
