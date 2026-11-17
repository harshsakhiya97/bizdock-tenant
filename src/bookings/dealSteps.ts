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
