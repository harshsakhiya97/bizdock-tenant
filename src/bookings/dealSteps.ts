import { db } from '@/lib/supabase'

/** Brand Deals: a deal's steps, in order */
export const DEAL_STEPS = [
  'Deal aayi',
  'Script writer ke paas',
  'Script brand ke approval me',
  'Shoot',
  'Editor ke paas',
  'Video brand ke approval me',
  'Live ho gaya · Payment baaki',
  'Payment aa gaya',
] as const

/** a ticked step: its number (1…8), when, by whom */
export type DealStep = { step: number; at: string; by?: string | null }

/** the latest ticked step (the highest number), or null */
export const latestStep = (steps: DealStep[] | null | undefined) =>
  (steps ?? []).reduce<DealStep | null>((m, s) => (!m || s.step > m.step ? s : m), null)

export async function saveDealSteps(bookingId: string, steps: DealStep[]) {
  const { error } = await db()
    .from('bookings')
    .update({ deal_steps: [...steps].sort((a, b) => a.step - b.step) })
    .eq('id', bookingId)
  if (error) throw new Error(error.message)
}

/**
 * Tick a step: it and every step before it are done (the ones already ticked keep their date).
 * Untick a step: it and every step after it are undone.
 */
export function toggleStep(steps: DealStep[], n: number, me: string | null): DealStep[] {
  const on = steps.some((s) => s.step === n)
  if (on) return steps.filter((s) => s.step < n)
  const at = new Date().toISOString()
  const have = new Map(steps.map((s) => [s.step, s]))
  return Array.from({ length: n }, (_, i) => have.get(i + 1) ?? { step: i + 1, at, by: me }).concat(steps.filter((s) => s.step > n))
}
