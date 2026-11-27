import { useEffect, useState } from 'react'
import { presetRange, type Range } from '@/components/DateRange'

/**
 * useState that is kept for this browser tab (sessionStorage): a list's filters come back when you open a record and
 * press Back. `key` names the list (and the workspace). Nothing kept / storage blocked: `initial`.
 */
export function useKept<T>(key: string, initial: T | (() => T), revive: (v: T) => T = (v) => v) {
  const k = `bz.keep.${key}`
  const [v, setV] = useState<T>(() => {
    const base = typeof initial === 'function' ? (initial as () => T)() : initial
    try {
      const raw = sessionStorage.getItem(k)
      if (raw == null) return base
      const got = JSON.parse(raw) as T
      // an object (e.g. a list's filters): new filter fields keep their defaults
      return revive(base && typeof base === 'object' && !Array.isArray(base) && got && typeof got === 'object' ? ({ ...base, ...got } as T) : got)
    } catch {
      return base
    }
  })
  useEffect(() => {
    try {
      sessionStorage.setItem(k, JSON.stringify(v))
    } catch {
      /* storage blocked: the filters just aren't kept */
    }
  }, [k, v])
  return [v, setV] as const
}

/** a kept date range: a preset (Today, This month…) is worked out again for today's date */
export const freshRange = (r: Range): Range => (r.key === 'custom' || r.key === 'all' ? r : presetRange(r.key))
