import { useSyncExternalStore } from 'react'
import type { StepKind } from './types'

/** a step copied from a workflow box, to paste into this or any other workflow (kept in this browser) */
export type CopiedStep = { type: Exclude<StepKind, 'trigger'>; data: Record<string, unknown>; from: string }

const KEY = 'bizdock.workflow.copied-step'
const listeners = new Set<() => void>()
let cache: CopiedStep | null | undefined
let raw: string | null = null

function read(): CopiedStep | null {
  let now: string | null = null
  try {
    now = localStorage.getItem(KEY)
  } catch {
    now = raw
  }
  if (cache !== undefined && now === raw) return cache
  raw = now
  try {
    cache = now ? (JSON.parse(now) as CopiedStep) : null
  } catch {
    cache = null
  }
  return cache
}

export function copyStep(step: CopiedStep) {
  const text = JSON.stringify(step)
  raw = text
  cache = step
  try {
    localStorage.setItem(KEY, text)
  } catch {
    /* kept for this tab only */
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  // copied in another tab
  const onStorage = (e: StorageEvent) => e.key === KEY && l()
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', onStorage)
  }
}

/** the copied step, or null when nothing has been copied */
export const useCopiedStep = () => useSyncExternalStore(subscribe, read, () => null)
