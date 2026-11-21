import { useContext } from 'react'
import { TenantContext } from './tenant-context'

/**
 * A word as this workspace calls it (tenants.labels), e.g. BGR: Product → Course.
 * Keys are exact words ('Product', 'products'…); a word without an entry stays as it is.
 */
export function useTerm() {
  const labels = useContext(TenantContext)?.labels ?? {}
  return (word: string) => labels[word] ?? word
}
