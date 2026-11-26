import { BT } from '@/auth/auth-context'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { getFollowUp, listOutcomes, pendingFollowUpId, scheduleFollowUp } from '@/followups/api'
import { CompleteModal } from '@/followups/CompleteModal'
import type { FollowUpRow } from '@/followups/types'
import { MeetingDrawer } from '@/meetings/MeetingDrawer'
import { BadgeIndianRupee, CalendarCheck, CalendarClock, Download, KanbanSquare, Link2, List, Phone, X, Wallet, Plus, RotateCcw, Trash2, Trophy, Upload, UserPlus, Users } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { activeType } from '@/business/activeType'
import { POD_STEPS, listPodBoard, listPodFacts, type PodBoardFacts, type PodFacts } from '@/funnels/podSteps'
import { Kanban, useBoardView, type KanbanCol } from '@/components/Kanban'
import { useAiRows } from '@/ai/insights'
import { ConfirmModal, Empty, PageFoot, PageHead, SearchInput, StatCard } from '@/components/ui'
import { SearchSelect } from '@/components/SearchSelect'
import { listFunnels, listTenantSheets } from '@/funnels/api'
import type { FunnelRow, StageRow } from '@/funnels/types'
import { cn } from '@/lib/cn'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'
import { deleteLeads, listLeadExtras, listLeads, listLostReasons, listMemberOptions, listSources, logActivity, updateLeads, type LeadExtras } from './api'
import { QuickAddLead } from './QuickAddLead'
import { ImportLeadsModal } from './ImportLeadsModal'
import { TEMPERATURES, followUp, fullName, leadSource, money, tempOf } from './labels'
import { StageMoveModal } from './StageMoveModal'
import type { LeadRow, MemberOption, Option, Temperature } from './types'
import { Flash } from '@/components/Flash'
import { StatRecords, type StatShow } from '@/components/StatRecords'
import { leadCols } from './statCols'
import { ALL_DATES, DateRangePicker, isoDay, type Range } from '@/components/DateRange'
import { listCustomerRevenue, type Revenue } from './customers'
import { Select } from '@/components/Field'

type Filters = { q: string; funnel: string; sheet: string; source: string; temp: string; owner: string; followUp: string; form: string; step: string; archived: boolean; sort: string; range: Range }
/** Paid Podcast → Leads board */
const POD_COLS: KanbanCol[] = [
  { key: 'leads', label: 'Leads', color: '#94a3b8' },
  { key: 'followups', label: 'Follow-ups', color: '#0ea5e9' },
  { key: 'meetings', label: 'Meetings', color: '#8b5cf6' },
  { key: 'closed', label: 'Closed', color: '#22c55e' },
  { key: 'not_interested', label: 'Not Interested', color: '#ef4444' },
]
const EMPTY: Filters = { q: '', funnel: '', sheet: '', source: '', temp: '', owner: '', followUp: '', form: '', step: '', archived: false, sort: 'newest', range: ALL_DATES }
// the lead's creation date in the picked range
const inRange = (iso: string, r: Range) => r.key === 'all' || ((d) => d >= r.from && d <= r.to)(isoDay(new Date(iso)))

type PendingMove = { ids: string[]; stage: StageRow }
/** lead_stats: the Leads cards counted in the database */
type SrvStats = { total: number; new_week: number; due: number; overdue: number; won: number; temps: Record<string, number> }

/** ✕ on a lead in no funnel: it has no Lost stage, so this stands in for one (lost reason + Not interested) */
const NO_FUNNEL_LOST = { id: '', funnel_id: '', name: 'Lost', kind: 'lost', note_required: false, color: '#dc2626', position: 999 } as unknown as StageRow

/** an extra form field by name (any case / spacing) */
const extraOf = (l: LeadRow, key: string) => {
  const hit = Object.entries(l.extra ?? {}).find(([k]) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') === key)
  return hit && hit[1] != null ? String(hit[1]).trim() : ''
}
/** when the form was sent (its "submitted" field), else when the lead was added: "30 Oct 2026, 10:59 am" */
const leadDate = (l: LeadRow) => {
  const sent = ['submitted', 'submitted_at', 'submitted_at_utc', 'submitted_on', 'timestamp'].map((k) => extraOf(l, k)).find(Boolean)
  const t = sent && !Number.isNaN(Date.parse(sent)) ? Date.parse(sent) : Date.parse(l.created_at)
  return new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Paid Podcast's form steps: 1 opt-in form, 2 VSL form (business details), 3 a meeting (booking calendar) — then the meeting's status */
const MEETING_LABEL: Record<string, { label: string; tone: string }> = {
  scheduled: { label: 'Meeting upcoming', tone: 'badge-brand' },
  done: { label: 'Meeting done', tone: 'badge-success' },
  no_show: { label: 'No-show', tone: 'badge-danger' },
}
const FORM_STEPS = [
  { value: 'optin', label: 'Opt-in form only' },
  { value: 'vsl', label: 'VSL form filled' },
  { value: 'meeting', label: 'Meeting scheduled' },
] as const
/** how far the lead got through the forms */
const formStep = (l: LeadRow, x: LeadExtras | undefined): 'optin' | 'vsl' | 'meeting' =>
  x?.meeting_status ? 'meeting' : l.extra?.vsl_form_at || l.extra?.call_booked_at ? 'vsl' : 'optin'

/** Leads, or (customers) leads with a confirmed / completed booking and their revenue. */
export function LeadsPage({ customers = false }: { customers?: boolean }) {
  const tenant = useTenant()
  const { can, scope, membership, businesses } = useAuth()
  const { selected, sub, inScope } = useBusiness()
  const me = membership?.id
  // Studio Rental: Purpose, Time, Describes and the lead date (with time) instead of Temp / Funnel / Value
  const studio = activeType(selected, sub) === BT.STUDIO_RENTAL
  // Paid Podcast leads: the old CRM's columns (Received, Call booking, Last comment, Follow-ups done, Status) and row buttons
  const pp = !customers && !!sub && activeType(selected, sub) === BT.PAID_PODCAST
  // Paid Podcast (business or sub-business): the Funnel step filter (the Scorecard's steps) instead of Follow-up
  const pod = !customers && activeType(selected, sub) === BT.PAID_PODCAST

  const [allLeads, setLeads] = useState<LeadRow[] | null>(null)
  const first = useRef(true)
  // until every lead has arrived, the cards show the database's count (lead_stats)
  const [allLoaded, setAllLoaded] = useState(false)
  const [srvStats, setSrvStats] = useState<SrvStats | null>(null)
  const [revenue, setRevenue] = useState<Map<string, Revenue> | null>(null)
  // Leads: every lead (Closed ones too; Customers lists the Closed leads). customers mode: leads with a booking
  const leads = useMemo(
    () => (allLeads && (revenue || !customers) ? (customers ? allLeads.filter((l) => revenue!.has(l.id)) : allLeads) : null),
    [allLeads, revenue, customers],
  )
  const word = customers ? 'customer' : 'lead'
  const Word = customers ? 'Customer' : 'Lead'
  const [funnels, setFunnels] = useState<FunnelRow[]>([])
  const [sources, setSources] = useState<Option[]>([])
  // Google Sheets (Sheet filter and “Google Sheet · name” as the source)
  const [sheets, setSheets] = useState<{ id: string; name: string; funnel_id: string }[]>([])
  const [lostReasons, setLostReasons] = useState<Option[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [stageTab] = useState<string>('all')
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  // the list: 20 a page by default
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [bulk, setBulk] = useState({ owner: '', temp: '', followUp: '', stage: '', reason: '' })
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const [extras, setExtras] = useState<Map<string, LeadExtras>>(new Map())
  // other businesses' lists: Callyzer calls per lead (by number)
  const [outcomes, setOutcomes] = useState<Option[]>([])
  const [logFu, setLogFu] = useState<FollowUpRow | null>(null)
  const [meetFor, setMeetFor] = useState<LeadRow | null>(null)

  const load = useCallback(() => {
    // big workspaces: the cards come from one quick count, and the newest leads show first while the rest load;
    // opening the page reuses a list loaded in the last minute, a reload after a change gets a fresh one
    let done = false
    const wasFirst = first.current
    first.current = false
    setAllLoaded(false)
    Promise.all([listLeads(tenant.id, (part) => !done && setLeads(part), { cached: wasFirst }).finally(() => (done = true)), listFunnels(tenant.id), listSources(tenant.id), listLostReasons(tenant.id), listMemberOptions(tenant.id), listCustomerRevenue(tenant.id, businesses)])
      .then(([l, f, s, r, m, rv]) => {
        setLeads(l)
        setAllLoaded(true)
        setRevenue(rv)
        setFunnels(f)
        setSources(s)
        setLostReasons(r)
        setMembers(m)
      })
      .catch((e: Error) => setNotice({ error: e.message }))
  }, [tenant.id, businesses])
  useEffect(load, [load])
  useEffect(() => {
    listTenantSheets(tenant.id).then(setSheets, () => setSheets([]))
  }, [tenant.id])
  // the cards' quick count, for the business picked in the top bar
  useEffect(() => {
    if (customers) return
    setSrvStats(null)
    void db()
      .rpc('lead_stats', { p_tenant: tenant.id, p_business: selected?.id ?? null, p_sub: sub?.id ?? null })
      .then(({ data }) => setSrvStats((data as SrvStats | null) ?? null))
  }, [customers, tenant.id, selected?.id, sub?.id])
  // every business: last comment, follow-ups done (· connected calls), meeting
  const loadExtras = useCallback(() => {
    if (customers) return
    listLeadExtras(tenant.id, sub?.id ?? null)
      .then(setExtras)
      .catch((e: Error) => setNotice({ error: e.message }))
    listOutcomes(tenant.id).then(setOutcomes)
  }, [customers, sub, tenant.id])
  useEffect(loadExtras, [loadExtras])
  // Paid Podcast: each lead's VSL form / meetings, for the Funnel step filter
  const [podFacts, setPodFacts] = useState<Map<string, PodFacts>>(new Map())
  // Paid Podcast: List / Board (Leads → Follow-ups → Meetings → Closed / Not Interested)
  const [view, setView] = useBoardView('pod-leads')
  const [board, setBoard] = useState<Map<string, PodBoardFacts> | null>(null)
  const [closing, setClosing] = useState<LeadRow | null>(null)
  useEffect(() => {
    if (!pod) return
    listPodFacts(tenant.id).then(setPodFacts, () => setPodFacts(new Map()))
  }, [pod, tenant.id])

  /** the row's Follow-up button: mark the pending follow-up done (or record one done now) */
  async function openLogFollowUp(l: LeadRow) {
    const pendingId = pp ? extras.get(l.id)?.pending_fu_id : await pendingFollowUpId(l.id)
    const row = pendingId ? await getFollowUp(pendingId) : null
    setLogFu(
      row ?? {
        id: '',
        tenant_id: tenant.id,
        lead_id: l.id,
        assigned_to: l.owner_id,
        due_at: new Date().toISOString(),
        mode: 'call',
        purpose: null,
        status: 'pending',
        outcome_id: null,
        result_note: null,
        completed_at: null,
        completed_by: null,
        created_at: new Date().toISOString(),
        leads: { id: l.id, first_name: l.first_name, last_name: l.last_name, phone: l.phone, whatsapp: l.whatsapp, business_id: l.business_id, sub_business_id: l.sub_business_id, funnel_id: l.funnel_id ?? '', stage_id: l.stage_id ?? '', owner_id: l.owner_id },
      },
    )
  }
  // ✕ = Lost: the funnel's Lost stage; a lead in no funnel (e.g. Brand Deal) is marked lost with a reason instead
  const lostStageOf = (l: LeadRow): StageRow | null =>
    l.funnel_id ? (funnels.find((f) => f.id === l.funnel_id)?.funnel_stages.find((s) => s.kind === 'lost') ?? null) : NO_FUNNEL_LOST

  // /leads?open=<id> (from Follow-ups / My Day) opens that lead once the list is loaded
  const [importing, setImporting] = useState(false)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const [adding, setAdding] = useState(false)
  const openId = params.get('open')
  useEffect(() => {
    if (!openId) return
    navigate(`/leads/${openId}`, { replace: true })
  }, [openId, navigate])

  // funnels of the business picked in the top bar (or all businesses)
  const scopedFunnels = useMemo(
    () => funnels.filter((f) => !selected || (f.business_id === selected.id && (!sub || f.sub_business_id === sub.id))),
    [funnels, selected, sub],
  )
  // no Funnel / Source filter in any business: all funnels (Studio Rental with one funnel: that one)
  const funnel = studio && scopedFunnels.length === 1 ? scopedFunnels[0] : null
  // the Sheet filter: the sheets of the funnels in view (one funnel open: its sheets)
  const sheetOpts = useMemo(() => {
    const ids = new Set((funnel ? [funnel] : scopedFunnels).map((f) => f.id))
    return sheets.filter((x) => ids.has(x.funnel_id)).map((x) => ({ value: x.id, label: x.name }))
  }, [sheets, scopedFunnels, funnel])
  const stageById = useMemo(() => {
    const m = new Map<string, StageRow>()
    for (const f of funnels) for (const s of f.funnel_stages) m.set(s.id, s)
    return m
  }, [funnels])
  const funnelName = (id: string | null) => (id ? (funnels.find((f) => f.id === id)?.name ?? '—') : 'No funnel')
  const noFunnel = false
  const sheetName = (id: string | null) => (id ? sheets.find((x) => x.id === id)?.name : undefined)
  const sourceOf = (l: LeadRow) => leadSource(sources.find((s) => s.id === l.source_id)?.name, sheetName(l.sheet_id))
  const ownerName = (id: string | null) => members.find((m) => m.id === id)?.name
  const wonStages = useMemo(() => new Set([...stageById.values()].filter((x) => x.kind === 'won').map((x) => x.id)), [stageById])

  // leads before the stage tab (for tab counts)
  const base = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    const now = new Date()
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    // a sub-business narrows by the lead's own sub-business (below), so every funnel of the business counts here
    const scopedIds = new Set(funnels.filter((f) => !selected || f.business_id === selected.id).map((f) => f.id))
    // a lead of a funnel that's turned off (not in the list) still counts in its own business, as in the cards
    const known = new Set(funnels.map((f) => f.id))
    return (leads ?? [])
      .filter((l) => l.is_archived === filters.archived)
      // leads imported without a funnel: in "All funnels" (their business) and "No funnel"
      .filter((l) =>
        noFunnel
          ? !l.funnel_id && (!selected || l.business_id === selected.id)
          : funnel
            ? l.funnel_id === funnel.id
            : l.funnel_id && known.has(l.funnel_id)
              ? scopedIds.has(l.funnel_id)
              : !selected || l.business_id === selected.id,
      )
      // a sub-business picked in the top bar narrows to its leads
      .filter((l) => !sub || inScope(l.business_id, l.sub_business_id))
      .filter(
        (l) =>
          !q ||
          fullName(l).toLowerCase().includes(q) ||
          l.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '¤') ||
          (l.email ?? '').toLowerCase().includes(q) ||
          (l.city ?? '').toLowerCase().includes(q),
      )
      .filter((l) => !filters.funnel || (filters.funnel === 'none' ? !l.funnel_id : l.funnel_id === filters.funnel))
      .filter((l) => studio || !filters.source || l.source_id === filters.source)
      .filter((l) => !filters.sheet || (filters.sheet === 'none' ? !l.sheet_id : l.sheet_id === filters.sheet))
      .filter((l) => !filters.temp || l.temperature === filters.temp)
      .filter((l) => inRange(l.created_at, filters.range))
      .filter((l) => !pp || !filters.form || formStep(l, extras.get(l.id)) === filters.form)
      .filter((l) => !filters.owner || (filters.owner === 'none' ? !l.owner_id : l.owner_id === filters.owner))
      .filter((l) => {
        if (!pod || !filters.step) return true
        const st = POD_STEPS.find((x) => x.key === filters.step)
        return !st || st.pick(l, podFacts.get(l.id), wonStages)
      })
      .filter((l) => {
        if (pod || !filters.followUp) return true
        const d = l.next_follow_up_at ? new Date(l.next_follow_up_at) : null
        if (filters.followUp === 'none') return !d
        if (!d) return false
        if (filters.followUp === 'overdue') return d < now
        if (filters.followUp === 'today') return d >= now && d < endToday
        return d >= endToday
      })
      .sort((a, b) => {
        if (filters.sort === 'name') return fullName(a).localeCompare(fullName(b))
        if (filters.sort === 'updated') return b.updated_at.localeCompare(a.updated_at)
        if (filters.sort === 'follow_up')
          return (a.next_follow_up_at ?? '9999').localeCompare(b.next_follow_up_at ?? '9999')
        return b.created_at.localeCompare(a.created_at)
      })
  }, [leads, filters, funnel, funnels, noFunnel, selected, sub, inScope, pp, extras, pod, podFacts, wonStages])

  // Funnel step filter: how many of this business's leads are at each step
  const stepCounts = useMemo(() => {
    const m = new Map<string, number>()
    if (!pod) return m
    const mine = (leads ?? []).filter((l) => (!selected || l.business_id === selected.id) && (!sub || inScope(l.business_id, l.sub_business_id)))
    for (const st of POD_STEPS) m.set(st.key, mine.filter((l) => st.pick(l, podFacts.get(l.id), wonStages)).length)
    return m
  }, [pod, leads, selected, sub, inScope, podFacts, wonStages])
  const kindOf = (l: LeadRow) => stageById.get(l.stage_id ?? '')?.kind ?? 'open'
  const visible =
    stageTab === 'all'
      ? base
      : funnel
        ? base.filter((l) => l.stage_id === stageTab)
        : base.filter((l) => kindOf(l) === stageTab)
  useEffect(() => {
    if (!pod || view !== 'board') return
    let live = true
    listPodBoard(tenant.id).then(
      (m) => live && setBoard(m),
      (e: Error) => live && setNotice({ error: e.message }),
    )
    return () => {
      live = false
    }
  }, [pod, view, tenant.id, leads])
  const podCol = (l: LeadRow) => {
    const k = stageById.get(l.stage_id ?? '')?.kind
    if (l.temperature === 'not_interested' || k === 'lost') return 'not_interested'
    if (l.temperature === 'closed' || k === 'won') return 'closed'
    const b = board?.get(l.id)
    if (b && (b.m_booked || b.m_done || b.m_noshow)) return 'meetings'
    if (b && b.fu_done > 0) return 'followups'
    return 'leads'
  }
  const today = isoDay(new Date())
  const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  const dayOf = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const timeOf = (t: string) => new Date(`2000-01-01T${t}`).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  /** each column's order: Leads newest; Follow-ups today, overdue, upcoming, none; Meetings today, needs update,
   *  upcoming, then done / no-show; Closed by podcast date (upcoming first); Not Interested latest first */
  const podSort = (col: string, a: LeadRow, b: LeadRow) => {
    const fa = board?.get(a.id)
    const fb = board?.get(b.id)
    if (col === 'followups') {
      const rank = (l: LeadRow) => {
        if (!l.next_follow_up_at) return 3
        const d = isoDay(new Date(l.next_follow_up_at))
        return d === today ? 0 : d < today ? 1 : 2
      }
      return rank(a) - rank(b) || (a.next_follow_up_at ?? '').localeCompare(b.next_follow_up_at ?? '') || (fb?.last_fu_at ?? '').localeCompare(fa?.last_fu_at ?? '')
    }
    if (col === 'meetings') {
      const rank = (f: PodBoardFacts | undefined) => {
        const d = f?.meeting_on
        if (!d) return 4
        if (f.meeting_status === 'done' || f.meeting_status === 'no_show') return 3
        return d === today ? 0 : d < today ? 1 : 2
      }
      const ra = rank(fa)
      const key = (f: PodBoardFacts | undefined) => `${f?.meeting_on ?? ''} ${f?.meeting_at ?? ''}`
      return ra - rank(fb) || (ra === 3 ? key(fb).localeCompare(key(fa)) : key(fa).localeCompare(key(fb)))
    }
    if (col === 'closed') {
      const rank = (f: PodBoardFacts | undefined) => (!f?.shoot_on ? 2 : f.shoot_on >= today ? 0 : 1)
      const ra = rank(fa)
      return ra - rank(fb) || (ra === 0 ? (fa?.shoot_on ?? '').localeCompare(fb?.shoot_on ?? '') : (fb?.shoot_on ?? '').localeCompare(fa?.shoot_on ?? ''))
    }
    if (col === 'not_interested') return b.updated_at.localeCompare(a.updated_at)
    return b.created_at.localeCompare(a.created_at)
  }
  // a stat card's records
  const [statShow, setStatShow] = useState<StatShow<LeadRow> | null>(null)
  const showLeads = (title: string, f: (l: LeadRow) => boolean) => () => setStatShow({ title, rows: base.filter(f), cols: leadCols(members) })
  const stats = useMemo(() => {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString()
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const due = base.filter((l) => l.next_follow_up_at && new Date(l.next_follow_up_at) < endToday)
    return {
      total: base.length,
      newWeek: base.filter((l) => l.created_at >= weekAgo).length,
      due: due.length,
      overdue: due.filter((l) => new Date(l.next_follow_up_at!) < now).length,
      hot: base.filter((l) => l.temperature === 'hot').length,
      // per category (the Category filter's numbers)
      temps: Object.fromEntries(TEMPERATURES.map((t) => [t.value, base.filter((l) => l.temperature === t.value).length])) as Record<string, number>,
      // every category's count (the Leads card)
      cats: [...TEMPERATURES.map((t) => `${base.filter((l) => l.temperature === t.value).length} ${t.label.toLowerCase()}`), ...(base.some((l) => !l.temperature) ? [`${base.filter((l) => !l.temperature).length} no category`] : [])].join(' · '),
      won: base.filter((l) => kindOf(l) === 'won').length,
      bookings: base.reduce((n, l) => n + (revenue?.get(l.id)?.count ?? 0), 0),
      billed: base.reduce((n, l) => n + (revenue?.get(l.id)?.billed ?? 0), 0),
      paid: base.reduce((n, l) => n + (revenue?.get(l.id)?.paid ?? 0), 0),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, stageById, revenue])

  // while the list is still loading: the cards from lead_stats (filters apply once everything is in)
  const cards =
    !allLoaded && srvStats && !customers
      ? {
          ...stats,
          total: srvStats.total,
          newWeek: srvStats.new_week,
          due: srvStats.due,
          overdue: srvStats.overdue,
          hot: srvStats.temps.hot ?? 0,
          temps: Object.fromEntries(TEMPERATURES.map((t) => [t.value, srvStats.temps[t.value] ?? 0])) as Record<string, number>,
          won: srvStats.won,
          cats: [...TEMPERATURES.map((t) => `${srvStats.temps[t.value] ?? 0} ${t.label.toLowerCase()}`), ...(srvStats.temps.none ? [`${srvStats.temps.none} no category`] : [])].join(' · '),
        }
      : stats

  // back to page 1 when the list changes (tab, filters, funnel, business)
  useEffect(() => setPage(1), [stageTab, filters, selected, sub])
  const pages = Math.max(1, Math.ceil(visible.length / perPage))
  const current = Math.min(page, pages)
  // AI Insights reads every filtered lead, not only this page
  useAiRows(visible)
  const pageRows = visible.slice((current - 1) * perPage, current * perPage)

  const pickedIds = visible.filter((l) => picked.has(l.id)).map((l) => l.id)
  const allPicked = visible.length > 0 && pickedIds.length === visible.length
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  async function run(fn: () => Promise<void>, ok: string) {
    try {
      await fn()
      setNotice({ ok })
      setPicked(new Set())
      load()
      loadExtras()
      return true
    } catch (e) {
      setNotice({ error: (e as Error).message })
      return false
    }
  }

  /** move leads; asks for a note / lost reason first when the stage needs one */
  function requestMove(ids: string[], stage: StageRow) {
    if (stage.note_required || stage.kind === 'lost') setPendingMove({ ids, stage })
    else void doMove(ids, stage, '', null)
  }
  async function doMove(ids: string[], stage: StageRow, note: string, lostReasonId: string | null) {
    const from = new Map((leads ?? []).map((l) => [l.id, l.stage_id]))
    if (stage === NO_FUNNEL_LOST) {
      // no funnel: the lost reason, category Not interested, and a note in its activity
      const why = lostReasons.find((r) => r.id === lostReasonId)?.name
      await run(async () => {
        await updateLeads(ids, { lost_reason_id: lostReasonId, temperature: 'not_interested' })
        await logActivity(tenant.id, me, ids, { kind: 'note', note: ['Marked lost', why, note.trim()].filter(Boolean).join(' · ') })
      }, `${ids.length === 1 ? Word : `${ids.length} ${word}s`} marked lost.`)
      return
    }
    await run(async () => {
      await updateLeads(ids, { stage_id: stage.id, lost_reason_id: stage.kind === 'lost' ? lostReasonId : null })
      for (const id of ids)
        await logActivity(tenant.id, me, [id], { kind: 'stage', from_stage_id: from.get(id) ?? null, to_stage_id: stage.id, note: note.trim() || null })
    }, `${ids.length === 1 ? Word : `${ids.length} ${word}s`} moved to ${stage.name}.`)
  }

  function exportCsv() {
    const rows = [
      ['Name', 'Phone', 'WhatsApp', 'Email', 'City', 'Funnel', 'Stage', 'Category', 'Source', 'Owner', 'Estimated amount', 'Next follow-up', 'Tags', 'Created'],
      ...visible.map((l) => [
        fullName(l),
        l.phone,
        l.whatsapp ?? '',
        l.email ?? '',
        l.city ?? '',
        funnelName(l.funnel_id),
        stageById.get(l.stage_id ?? '')?.name ?? '',
        tempOf(l.temperature)?.label ?? '',
        sourceOf(l) ?? '',
        ownerName(l.owner_id) ?? '',
        l.estimated_amount ?? '',
        l.next_follow_up_at ? new Date(l.next_follow_up_at).toLocaleString('en-IN') : '',
        l.tags.join('; '),
        new Date(l.created_at).toLocaleDateString('en-IN'),
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `${word}s${funnel ? ` - ${funnel.name}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const setF = (k: keyof Filters, v: string | boolean | Range) => {
    setFilters((f) => ({ ...f, [k]: v }))
    setPicked(new Set())
  }
  const scopeText = { all: `all ${word}s`, team: `your and your team’s ${word}s`, own: `your own ${word}s`, none: `no ${word}s` }[scope('leads')]
  const openRow = (id: string) => navigate(customers ? `/customers/${id}` : `/leads/${id}`)

  return (
    <>
      <PageHead
        title={customers ? 'Customers' : 'Leads'}
        subtitle={`Showing ${scopeText}${selected ? ` in ${selected.name}${sub ? ` · ${sub.name}` : ''}` : ''}.`}
        actions={
          <>
            {can('leads', 'export') && (
              <button type="button" className="btn btn-outline" onClick={exportCsv} disabled={!visible.length}>
                <Download size={15} /> Export CSV
              </button>
            )}
            {can('leads', 'add') && !customers && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setImporting(true)}
              >
                <Upload size={15} /> Import
              </button>
            )}
            {can('leads', 'add') && !customers && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setAdding(true)}
              >
                <Plus size={16} /> Add lead
              </button>
            )}
          </>
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      {customers ? (
        <div className="stat-grid">
          <StatCard icon={Users} tone="brand" value={stats.total} label="Customers" hint={`${stats.newWeek} new this week`} onClick={showLeads('Customers', () => true)} />
          <StatCard icon={CalendarCheck} tone="info" value={stats.bookings} label="Bookings" hint="Confirmed & completed" onClick={showLeads('With bookings', (l) => !!revenue?.get(l.id)?.count)} />
          <StatCard icon={BadgeIndianRupee} tone="success" value={money(stats.billed)} label="Revenue" hint="Billed, with GST" onClick={showLeads('Revenue', (l) => !!revenue?.get(l.id)?.billed)} />
          <StatCard icon={Wallet} tone="warning" value={money(stats.paid)} label="Received" hint={`${money(Math.max(0, stats.billed - stats.paid))} balance`} onClick={showLeads('Received', (l) => !!revenue?.get(l.id)?.paid)} />
        </div>
      ) : (
      <div className="stat-grid">
        <StatCard icon={Users} tone="brand" value={cards.total} label="Leads" hint={cards.cats} onClick={showLeads('Leads', () => true)} />
        <StatCard icon={UserPlus} tone="info" value={cards.newWeek} label="New this week" onClick={showLeads('New this week', (l) => l.created_at >= new Date(Date.now() - 7 * 864e5).toISOString())} />
        <StatCard icon={CalendarClock} tone="warning" value={cards.due} label="Follow-ups due today" hint={cards.overdue ? `${cards.overdue} overdue` : undefined} onClick={showLeads('Follow-ups due today', (l) => !!l.next_follow_up_at && new Date(l.next_follow_up_at) < new Date(new Date().setHours(24, 0, 0, 0)))} />
        <StatCard icon={Trophy} tone="success" value={cards.won} label="Won" hint={cards.total ? `${Math.round((cards.won / cards.total) * 100)}% conversion` : undefined} onClick={showLeads('Won', (l) => kindOf(l) === 'won')} />
      </div>
      )}
      <StatRecords show={statShow} onClose={() => setStatShow(null)} rowKey={(l) => l.id} onRow={(l) => openRow(l.id)} />

      <div className="panel">
        <div className="panel-filters">
          <SearchInput placeholder="Name, phone, email or city" value={filters.q} onChange={(v) => setF('q', v)} width={230} />
          <div className="filter-ss">
            <SearchSelect
              value={filters.funnel || null}
              onChange={(v) => setF('funnel', v ?? '')}
              options={[{ value: '', label: 'All funnels' }, ...scopedFunnels.map((f) => ({ value: f.id, label: f.name })), { value: 'none', label: 'No funnel' }]}
              placeholder="Funnel"
              searchPlaceholder="Search funnels…"
            />
          </div>
          {sheetOpts.length > 0 && (
            <div className="filter-ss">
              <SearchSelect
                value={filters.sheet || null}
                onChange={(v) => setF('sheet', v ?? '')}
                options={[{ value: '', label: 'All sheets' }, ...sheetOpts, { value: 'none', label: 'Not from a sheet' }]}
                placeholder="Sheet"
                searchPlaceholder="Search sheets…"
                ariaLabel="Google Sheet"
              />
            </div>
          )}
          <Select className="input input-sm filter-select" value={filters.owner} onChange={(e) => setF('owner', e.target.value)} aria-label="Owner">
            <option value="">Owner</option>
            <option value="none">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          {/* customers are always Closed: no Category filter there */}
          {!customers && (
          <Select className="input input-sm filter-select" value={filters.temp} onChange={(e) => setF('temp', e.target.value)} aria-label="Category">
            <option value="">Category</option>
            {TEMPERATURES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} ({(cards.temps[t.value] ?? 0).toLocaleString('en-IN')})
              </option>
            ))}
          </Select>
          )}
          {pp && (
            <Select className="input input-sm filter-select" value={filters.form} onChange={(e) => setF('form', e.target.value)} aria-label="Form">
              <option value="">Form</option>
              {FORM_STEPS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          )}
          {pod ? (
            <Select className="input input-sm filter-select" value={filters.step} onChange={(e) => setF('step', e.target.value)} aria-label="Funnel step">
              <option value="">Funnel step</option>
              {POD_STEPS.filter((x) => x.key !== 'optin').map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label} ({(stepCounts.get(x.key) ?? 0).toLocaleString('en-IN')})
                </option>
              ))}
            </Select>
          ) : (
            <Select className="input input-sm filter-select" value={filters.followUp} onChange={(e) => setF('followUp', e.target.value)} aria-label="Follow-up">
              <option value="">Follow-up</option>
              <option value="overdue">Overdue</option>
              <option value="today">Today</option>
              <option value="upcoming">Upcoming</option>
              <option value="none">No follow-up set</option>
            </Select>
          )}
          <Select className="input input-sm filter-select" value={filters.sort} onChange={(e) => setF('sort', e.target.value)} aria-label="Sort">
            <option value="newest">Newest</option>
            <option value="follow_up">Follow-up date</option>
            <option value="updated">Recently updated</option>
            <option value="name">Name</option>
          </Select>
          <DateRangePicker value={filters.range} onChange={(r) => setF('range', r)} allDates />
          {pod && (
            <div className="seg" role="group" aria-label="View">
              <button type="button" className={view === 'list' ? 'is-active' : undefined} onClick={() => setView('list')} title="List">
                <List size={15} /> List
              </button>
              <button type="button" className={view === 'board' ? 'is-active' : undefined} onClick={() => setView('board')} title="Board">
                <KanbanSquare size={15} /> Board
              </button>
            </div>
          )}
          {JSON.stringify({ ...filters, sort: 'newest' }) !== JSON.stringify(EMPTY) && (
            <button type="button" className="clear-btn" onClick={() => setFilters(EMPTY)}>
              Reset
            </button>
          )}
        </div>

        {pickedIds.length > 0 && (
          <div className="bulk-bar">
            <b>{pickedIds.length} selected</b>
            {can('leads', 'assign') && (
              <span className="bulk-group">
                <Select className="input input-sm" value={bulk.owner} onChange={(e) => setBulk((b) => ({ ...b, owner: e.target.value }))} aria-label="Assign to">
                  <option value="">Assign to…</option>
                  <option value="none">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={!bulk.owner}
                  onClick={() =>
                    run(async () => {
                      await updateLeads(pickedIds, { owner_id: bulk.owner === 'none' ? null : bulk.owner })
                      await logActivity(tenant.id, me, pickedIds, { kind: 'assigned' })
                    }, 'Owner updated.')
                  }
                >
                  Assign
                </button>
              </span>
            )}
            {can('leads', 'edit') && !customers && (
              <span className="bulk-group">
                <Select className="input input-sm" value={bulk.temp} onChange={(e) => setBulk((b) => ({ ...b, temp: e.target.value }))} aria-label="Category">
                  <option value="">Category…</option>
                  {TEMPERATURES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={!bulk.temp}
                  onClick={() =>
                    run(async () => {
                      await updateLeads(pickedIds, { temperature: bulk.temp as Temperature })
                      await logActivity(tenant.id, me, pickedIds, { kind: 'temperature', note: tempOf(bulk.temp as Temperature)?.label })
                    }, 'Category updated.')
                  }
                >
                  Set
                </button>
              </span>
            )}
            {(can('follow_ups', 'add') || can('leads', 'edit')) && (
              <span className="bulk-group">
                <input
                  type="datetime-local"
                  className="input input-sm"
                  value={bulk.followUp}
                  onChange={(e) => setBulk((b) => ({ ...b, followUp: e.target.value }))}
                  aria-label="Follow-up date and time"
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={!bulk.followUp}
                  onClick={() =>
                    run(async () => {
                      for (const id of pickedIds) {
                        const l = (leads ?? []).find((x) => x.id === id)
                        await scheduleFollowUp(tenant.id, me, { lead_id: id, due_at: bulk.followUp, mode: 'call', purpose: '', assigned_to: l?.owner_id ?? '' })
                      }
                    }, 'Follow-up scheduled.')
                  }
                >
                  Schedule follow-up
                </button>
              </span>
            )}
            {funnel && can('leads', 'edit') && (
              <span className="bulk-group">
                <Select className="input input-sm" value={bulk.stage} onChange={(e) => setBulk((b) => ({ ...b, stage: e.target.value }))} aria-label="Move to stage">
                  <option value="">Move to…</option>
                  {funnel.funnel_stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={!bulk.stage}
                  onClick={() => {
                    const s = stageById.get(bulk.stage)
                    if (s) requestMove(pickedIds, s)
                  }}
                >
                  Move
                </button>
              </span>
            )}
            {can('leads', 'delete') &&
              (filters.archived ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() =>
                    run(async () => {
                      await updateLeads(pickedIds, { is_archived: false, archive_reason: null, archived_at: null })
                      await logActivity(tenant.id, me, pickedIds, { kind: 'restored' })
                    }, 'Leads restored.')
                  }
                >
                  <RotateCcw size={14} /> Restore
                </button>
              ) : (
                <button type="button" className="btn btn-outline btn-sm danger-text" onClick={() => setDeleting(true)}>
                  <Trash2 size={14} /> Delete
                </button>
              ))}
          </div>
        )}

        {!leads ? (
          <div className="empty">Loading {word}s…</div>
        ) : scope('leads') === 'none' ? (
          <Empty icon={Users}>Your access doesn’t include {word}s.</Empty>
        ) : visible.length === 0 ? (
          <Empty icon={Users}>{filters.archived ? `No archived ${word}s.` : customers ? 'No customers yet. A lead becomes a customer once a booking is confirmed (Paid Podcast: once a payment is received).' : 'No leads here yet.'}</Empty>
        ) : pod && view === 'board' ? (
          !board ? (
            <div className="empty">Loading the board…</div>
          ) : (
            <Kanban
              cols={POD_COLS}
              items={visible}
              keyOf={(l) => l.id}
              colOf={podCol}
              emptyText="No leads here"
              onOpen={(l) => openRow(l.id)}
              canDrop={(l, to) =>
                to === 'followups'
                  ? can('follow_ups', 'add') || can('leads', 'edit')
                  : to === 'meetings'
                    ? can('meetings', 'add')
                    : to === 'not_interested'
                      ? can('leads', 'edit') && !!lostStageOf(l)
                      : to === 'closed' && can('leads', 'edit')
              }
              onDrop={(l, to) => {
                if (to === 'followups') void openLogFollowUp(l)
                else if (to === 'meetings') setMeetFor(l)
                else if (to === 'closed') setClosing(l)
                else if (to === 'not_interested') {
                  const st = lostStageOf(l)
                  if (st) requestMove([l.id], st)
                }
              }}
              sortIn={podSort}
              card={(l, col) => {
                const t = tempOf(l.temperature)
                const fu = followUp(l.next_follow_up_at)
                const b = board.get(l.id)
                const ms = b?.meeting_status ?? ''
                return (
                  <>
                    <div className="row-between" style={{ gap: 6 }}>
                      <b className="cell-clip">{fullName(l)}</b>
                      {t && <span className={cn('badge', t.tone)}>{t.label}</span>}
                    </div>
                    <small className="muted">
                      {l.phone} · {ownerName(l.owner_id) ?? 'Unassigned'}
                    </small>
                    {col === 'leads' && <small>Lead date {when(l.created_at)}</small>}
                    {col === 'followups' && (
                      <>
                        {b?.last_fu_at && (
                          <small className="muted cell-clip">
                            Last {when(b.last_fu_at)}
                            {b.last_fu_outcome ? ` · ${b.last_fu_outcome}` : ''}
                          </small>
                        )}
                        <span className={cn('small fu', `fu-${fu.state}`)}>{fu.state === 'none' ? 'No next follow-up' : `Next ${fu.text}`}</span>
                      </>
                    )}
                    {col === 'meetings' && b?.meeting_on && (
                      <div className="row-between small" style={{ gap: 6 }}>
                        <span>
                          {dayOf(b.meeting_on)}
                          {b.meeting_at ? `, ${timeOf(b.meeting_at)}` : ''}
                        </span>
                        <span className={cn('badge', ms === 'done' ? 'badge-success' : ms === 'no_show' ? 'badge-danger' : b.meeting_on < today ? 'badge-warning' : 'badge-info')}>
                          {ms === 'done' ? 'Done' : ms === 'no_show' ? 'No-show' : b.meeting_on < today ? 'Needs update' : b.meeting_on === today ? 'Today' : 'Booked'}
                        </span>
                      </div>
                    )}
                    {col === 'closed' &&
                      (b?.shoot_on ? (
                        <>
                          <small>Podcast {dayOf(b.shoot_on)}</small>
                          {b.billed > 0 && (
                            <div className="row-between small" style={{ gap: 6 }}>
                              <span className="tone-success">{money(b.paid)} paid</span>
                              {b.billed - b.paid > 0.01 ? <b className="tone-danger">{money(b.billed - b.paid)} due</b> : <span className="badge badge-success">Paid ✓</span>}
                            </div>
                          )}
                        </>
                      ) : (
                        <small className="muted">No podcast booked yet</small>
                      ))}
                    {col === 'not_interested' && (
                      <small className="muted cell-clip">
                        {lostReasons.find((r) => r.id === l.lost_reason_id)?.name ?? 'No reason'} · {when(l.updated_at)}
                      </small>
                    )}
                  </>
                )
              }}
            />
          )
        ) : (
          <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      className="am-check"
                      aria-label="Select all"
                      checked={allPicked}
                      onChange={() => setPicked(allPicked ? new Set() : new Set(visible.map((l) => l.id)))}
                    />
                  </th>
                  <th>{Word}</th>
                  {!customers ? (
                    // the same columns in every business, plus Form (Paid Podcast) or Purpose / Time / Description (Studio Rental)
                    <>
                      <th>Category</th>
                      <th>Source</th>
                      <th>Funnel</th>
                      <th>Owner</th>
                      {pp && <th>Form</th>}
                      {studio && (
                        <>
                          <th>Purpose</th>
                          <th>Time</th>
                          <th>Description</th>
                        </>
                      )}
                      <th>Last comment</th>
                      <th>Follow-ups done</th>
                      <th>Next follow-up</th>
                      <th>Lead date</th>
                      <th />
                    </>
                  ) : (
                  <>
                  <th>Source</th>
                  {!funnel && !studio && <th>Funnel</th>}
                  <th>Owner</th>
                  <th>Next follow-up</th>
                  <th style={{ textAlign: 'right' }}>Bookings</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                  <th>{studio ? 'Lead date' : 'Created'}</th>
                  </>
                  )}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((l) => {
                  const fu = followUp(l.next_follow_up_at)
                  return (
                    <tr key={l.id} className="is-clickable" onClick={() => openRow(l.id)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="am-check" aria-label={`Select ${fullName(l)}`} checked={picked.has(l.id)} onChange={() => toggle(l.id)} />
                      </td>
                      <td>
                        <span className="strong">{fullName(l)}</span>
                        <div className="muted small">
                          {l.phone}
                          {l.city ? ` · ${l.city}` : ''}
                        </div>
                        {l.tags.length > 0 && (
                          <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                            {l.tags.map((t) => (
                              <span key={t} className="tag-chip tag-chip-sm">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      {!customers ? (
                        <LeadCells
                          kind={pp ? 'pp' : studio ? 'studio' : 'default'}
                          l={l}
                          x={extras.get(l.id)}
                          source={sourceOf(l)}
                          funnel={funnelName(l.funnel_id)}
                          owner={ownerName(l.owner_id)}
                          stage={stageById.get(l.stage_id ?? '') ?? null}
                          fu={fu}
                          canFollowUp={can('follow_ups', 'add') || can('leads', 'edit')}
                          canMeet={pp && can('meetings', 'add')}
                          canLose={can('leads', 'edit') && !!lostStageOf(l)}
                          onFollowUp={() => void openLogFollowUp(l)}
                          onMeeting={() => setMeetFor(l)}
                          onLose={() => {
                            const st = lostStageOf(l)
                            if (st) requestMove([l.id], st)
                          }}
                        />
                      ) : (
                      <>
                      <td>{sourceOf(l) ?? <span className="muted">—</span>}</td>
                      {!funnel && !studio && <td className="muted">{funnelName(l.funnel_id)}</td>}
                      <td className="nowrap">{ownerName(l.owner_id) ?? <span className="muted">Unassigned</span>}</td>
                      <td className={cn('nowrap', `fu-${fu.state}`)}>{fu.text}</td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {revenue?.get(l.id)?.count ?? 0}
                      </td>
                      <td className="num nowrap" style={{ textAlign: 'right' }}>
                        {money(revenue?.get(l.id)?.billed ?? 0)}
                      </td>
                      <td className="num nowrap" style={{ textAlign: 'right' }}>
                        {money(Math.max(0, (revenue?.get(l.id)?.billed ?? 0) - (revenue?.get(l.id)?.paid ?? 0)))}
                      </td>
                      <td className="muted nowrap">
                        {studio
                          ? leadDate(l)
                          : new Date(l.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
            <PageFoot
              total={visible.length}
              page={current}
              perPage={perPage}
              onPage={setPage}
              onPerPage={(n) => {
                setPerPage(n)
                setPage(1)
              }}
            />
          </>
        )}
      </div>

      {importing && (
        <ImportLeadsModal
          funnels={scopedFunnels}
          defaultFunnelId={funnel?.id ?? null}
          defaultBusinessId={selected?.id ?? null}
          onClose={() => setImporting(false)}
          onDone={(msg) => {
            setImporting(false)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}
      {adding && (
        <QuickAddLead
          funnels={scopedFunnels.length ? scopedFunnels : funnels}
          defaultFunnelId={funnel?.id ?? null}
          sources={sources}
          onClose={() => setAdding(false)}
          onAdded={(id) => navigate(`/leads/${id}`)}
        />
      )}

      {logFu && (
        <CompleteModal
          followUp={logFu}
          outcomes={outcomes}
          onClose={() => setLogFu(null)}
          onSaved={(msg) => {
            setLogFu(null)
            setNotice({ ok: msg })
            load()
            loadExtras()
          }}
        />
      )}
      {meetFor && (
        <MeetingDrawer
          meeting={null}
          lead={meetFor}
          leads={[meetFor]}
          members={members}
          onClose={() => setMeetFor(null)}
          onSaved={(msg) => {
            setMeetFor(null)
            setNotice({ ok: msg })
            load()
            loadExtras()
          }}
        />
      )}
      {pendingMove && (
        <StageMoveModal
          stage={pendingMove.stage}
          count={pendingMove.ids.length}
          lostReasons={lostReasons}
          onCancel={() => setPendingMove(null)}
          onConfirm={(note, reason) => {
            const m = pendingMove
            setPendingMove(null)
            void doMove(m.ids, m.stage, note, reason)
          }}
        />
      )}
      <ConfirmModal
        open={!!closing}
        icon={Trophy}
        title={`Mark ${closing ? fullName(closing) : ''} Closed?`}
        message="The category becomes Closed and the lead shows in Customers."
        confirmLabel="Mark Closed"
        onCancel={() => setClosing(null)}
        onConfirm={() => {
          const l = closing
          setClosing(null)
          if (l)
            void run(async () => {
              await updateLeads([l.id], { temperature: 'closed' })
              await logActivity(tenant.id, me, [l.id], { kind: 'temperature', note: tempOf('closed')?.label })
            }, `${fullName(l)} marked Closed.`)
        }}
      />
      <ConfirmModal
        open={deleting}
        danger
        icon={Trash2}
        title={`Delete ${pickedIds.length} ${word}${pickedIds.length === 1 ? '' : 's'}?`}
        message="They are removed for good, with their follow-ups, activity and form submissions, and their bookings / orders / brand deals with those invoices and payments. This can’t be undone."
        confirmLabel="Delete"
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false)
          const n = pickedIds.length
          void run(() => deleteLeads(pickedIds), `${n} ${word}${n === 1 ? '' : 's'} deleted.`)
        }}
      />
    </>
  )
}

/** A lead row (every business): Category, Source, Owner, then Form (Paid Podcast) or Purpose / Time / Description
 *  (Studio Rental), Last comment, Follow-ups done, Next follow-up, Lead date and the Follow-up / Meeting / ✕ buttons */
export function LeadCells({
  kind,
  l,
  x,
  source,
  funnel,
  owner,
  stage,
  fu,
  canFollowUp,
  canMeet,
  canLose,
  onFollowUp,
  onMeeting,
  onLose,
}: {
  kind: 'pp' | 'studio' | 'default'
  l: LeadRow
  x: LeadExtras | undefined
  source: string | undefined
  /** the Leads list shows the funnel's name (a funnel's own table doesn't) */
  funnel?: string
  owner: string | undefined
  stage: StageRow | null
  fu: { text: string; state: string }
  canFollowUp: boolean
  canMeet: boolean
  canLose: boolean
  onFollowUp: () => void
  onMeeting: () => void
  onLose: () => void
}) {
  const m = x?.meeting_status ? MEETING_LABEL[x.meeting_status] : null
  const step = formStep(l, x)
  const t = tempOf(l.temperature)
  const comment = x?.last_note || l.notes || ''
  // closed: Won / Lost stage, or (no funnel) already marked lost
  const closed = stage?.kind === 'won' || stage?.kind === 'lost' || (!l.funnel_id && !!l.lost_reason_id)
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  return (
    <>
      <td>{t ? <span className={cn('badge', t.tone)}>{t.label}</span> : <span className="muted">—</span>}</td>
      <td>{source ?? <span className="muted">—</span>}</td>
      {funnel !== undefined && <td>{l.funnel_id ? funnel : <span className="muted">No funnel</span>}</td>}
      <td className="nowrap">{owner ?? <span className="muted">Unassigned</span>}</td>
      {kind === 'studio' && (
        <>
          <td>{l.purpose || extraOf(l, 'purpose') || <span className="muted">—</span>}</td>
          <td className="nowrap">{extraOf(l, 'time') || <span className="muted">—</span>}</td>
          <td>{extraOf(l, 'describes') || <span className="muted">—</span>}</td>
        </>
      )}
      {kind === 'pp' && <td className="nowrap">
        {m ? (
          <span className="row" style={{ gap: 4 }}>
            <span className={cn('badge', m.tone)}>{m.label}</span>
            {x?.meeting_status === 'scheduled' && x.meeting_link && (
              <a href={x.meeting_link} target="_blank" rel="noreferrer" onClick={stop} title="Open the meeting link" aria-label="Open the meeting link">
                <Link2 size={14} />
              </a>
            )}
          </span>
        ) : step === 'vsl' ? (
          <span className="badge badge-warning">VSL form filled</span>
        ) : (
          <span className="badge badge-muted">Opt-in form</span>
        )}
      </td>}
      <td style={{ maxWidth: 220 }}>
        {comment ? (
          <span className="clamp-2" title={comment}>
            {comment}
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="nowrap">
        <b>{x?.fu_done ?? 0}</b> <span className="muted small">· {x?.connected ?? 0} connected</span>
      </td>
      <td className={cn('nowrap', `fu-${fu.state}`)}>{fu.state === 'none' ? 'No follow-up' : fu.text}</td>
      <td className="muted nowrap">{leadDate(l)}</td>
      <RowActions closed={closed} canFollowUp={canFollowUp} canMeet={canMeet} canLose={canLose} onFollowUp={onFollowUp} onMeeting={onMeeting} onLose={onLose} />
    </>
  )
}

/** a row's buttons (Paid Podcast, Studio Rental): Follow-up, Meeting (Paid Podcast), ✕ = mark Lost */
function RowActions({
  closed,
  canFollowUp,
  canMeet,
  canLose,
  onFollowUp,
  onMeeting,
  onLose,
}: {
  closed: boolean
  canFollowUp: boolean
  canMeet: boolean
  canLose: boolean
  onFollowUp: () => void
  onMeeting?: () => void
  onLose: () => void
}) {
  return (
    <td className="nowrap" onClick={(e) => e.stopPropagation()}>
      <span className="row" style={{ gap: 6 }}>
        {canFollowUp && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onFollowUp}>
            <Phone size={13} /> Follow-up
          </button>
        )}
        {canMeet && onMeeting && (
          <button type="button" className="btn btn-outline btn-sm" onClick={onMeeting}>
            <CalendarCheck size={13} /> Meeting
          </button>
        )}
        {canLose && !closed && (
          <button type="button" className="btn btn-outline btn-sm danger-text" onClick={onLose} title="Mark Lost" aria-label="Mark Lost">
            <X size={14} />
          </button>
        )}
      </span>
    </td>
  )
}
