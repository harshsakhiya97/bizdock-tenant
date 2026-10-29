import { useLocation } from 'react-router'

/** where the workflow builder's Back / Cancel go: the page that opened it (e.g. a funnel's Webhooks tab), else the list */
export type BackTo = { to: string; label: string }
export function useBackTo(): BackTo {
  const st = useLocation().state as { back?: BackTo } | null
  return st?.back?.to ? st.back : { to: '/workflows', label: 'All workflows' }
}
