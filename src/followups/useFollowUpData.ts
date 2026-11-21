import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listFunnels } from '@/funnels/api'
import type { FunnelRow, StageRow } from '@/funnels/types'
import { listLeads, listMemberOptions } from '@/leads/api'
import type { LeadRow, MemberOption, Option } from '@/leads/types'
import { useBusiness } from '@/business/useBusiness'
import { useTenant } from '@/tenant/useTenant'
import { listFollowUps, listOutcomes } from './api'
import type { FollowUpRow } from './types'

/** Everything the Follow-ups and My Day pages read, filtered to the business (and sub-business) picked in the top bar. */
export function useFollowUpData() {
  const tenant = useTenant()
  const { inScope } = useBusiness()
  const [followUps, setFollowUps] = useState<FollowUpRow[] | null>(null)
  const [leads, setLeads] = useState<LeadRow[]>([])
  // opening the page reuses a lead list loaded in the last minute; a reload after a change gets a fresh one
  const leadsFirst = useRef(true)
  const [funnels, setFunnels] = useState<FunnelRow[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [outcomes, setOutcomes] = useState<Option[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([listFollowUps(tenant.id), listLeads(tenant.id, undefined, { cached: leadsFirst.current }).finally(() => (leadsFirst.current = false)), listFunnels(tenant.id), listMemberOptions(tenant.id), listOutcomes(tenant.id)])
      .then(([f, l, fn, m, o]) => {
        setFollowUps(f)
        setLeads(l)
        setFunnels(fn)
        setMembers(m)
        setOutcomes(o)
      })
      .catch((e: Error) => setError(e.message))
  }, [tenant.id])
  useEffect(load, [load])

  const stageById = useMemo(() => {
    const m = new Map<string, StageRow>()
    for (const f of funnels) for (const s of f.funnel_stages) m.set(s.id, s)
    return m
  }, [funnels])

  return {
    loading: followUps === null,
    error,
    reload: load,
    followUps: (followUps ?? []).filter((f) => inScope(f.leads?.business_id, f.leads?.sub_business_id)),
    leads: leads.filter((l) => !l.is_archived && inScope(l.business_id, l.sub_business_id)),
    funnels: funnels.filter((f) => inScope(f.business_id, f.sub_business_id)),
    members,
    outcomes,
    stageById,
  }
}
