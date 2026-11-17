import { useEffect, useState } from 'react'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'

/** Masters → Brand deal steps: one step, in order */
export type StepDef = { id: string; name: string; sort_order: number; is_active: boolean }
/** a ticked step of a deal: which, when, by whom */
export type DealStep = { step_id: string; at: string; by?: string | null }

/** the workspace's active steps, in order (loaded once per page) */
export function useDealSteps(): StepDef[] {
  const tenant = useTenant()
  const [defs, setDefs] = useState<StepDef[]>([])
  useEffect(() => {
    db()
      .from('deal_steps')
      .select('id, name, sort_order, is_active')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setDefs((data ?? []) as StepDef[]))
  }, [tenant.id])
  return defs
}

/** the latest ticked step (the furthest in the order): its place (1…n) and the tick */
export function latestStep(steps: DealStep[] | null | undefined, defs: StepDef[]) {
  const done = new Map((steps ?? []).map((s) => [s.step_id, s]))
  for (let i = defs.length - 1; i >= 0; i--) {
    const s = done.get(defs[i].id)
    if (s) return { n: i + 1, def: defs[i], tick: s }
  }
  return null
}

/**
 * Tick a step: it and every step before it are done (the ones already ticked keep their date).
 * Untick a step: it and every step after it are undone.
 */
export function toggleStep(steps: DealStep[], defs: StepDef[], id: string, me: string | null): DealStep[] {
  const at = new Date().toISOString()
  const i = defs.findIndex((d) => d.id === id)
  const have = new Map(steps.map((s) => [s.step_id, s]))
  const later = new Set(defs.slice(i).map((d) => d.id))
  if (have.has(id)) return steps.filter((s) => !later.has(s.step_id))
  const upTo = defs.slice(0, i + 1).map((d) => have.get(d.id) ?? { step_id: d.id, at, by: me })
  return [...upTo, ...steps.filter((s) => !upTo.some((u) => u.step_id === s.step_id))]
}

export async function saveDealSteps(bookingId: string, steps: DealStep[]) {
  const { error } = await db().from('bookings').update({ deal_steps: steps }).eq('id', bookingId)
  if (error) throw new Error(error.message)
}
