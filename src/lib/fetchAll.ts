/**
 * Every row of a query, past the API's 1,000-rows-per-request cap: asks for pages of 1,000 (four at a time)
 * until a page comes back short. `make` builds the query fresh for each page (keep an .order() on it so pages don't overlap).
 */
type Page<T> = { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }

export async function fetchAll<T>(make: () => Page<T>, size = 1000, parallel = 4): Promise<T[]> {
  const out: T[] = []
  for (let start = 0; ; start += size * parallel) {
    const pages = await Promise.all(Array.from({ length: parallel }, (_, i) => make().range(start + i * size, start + (i + 1) * size - 1)))
    for (const p of pages) {
      if (p.error) throw new Error(p.error.message)
      out.push(...(p.data ?? []))
    }
    if (pages.some((p) => (p.data?.length ?? 0) < size)) return out
  }
}

/**
 * Every row of a paged RPC that takes p_offset / p_limit (1,000 at most per call), four pages at a time.
 * Used where the table's row-by-row access checks are too slow for big workspaces (list_leads, list_purchases).
 */
export async function rpcAll<T>(call: (offset: number, limit: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, size = 1000, parallel = 4): Promise<T[]> {
  const out: T[] = []
  for (let start = 0; ; start += size * parallel) {
    const pages = await Promise.all(Array.from({ length: parallel }, (_, i) => call(start + i * size, size)))
    for (const p of pages) {
      if (p.error) throw new Error(p.error.message)
      out.push(...((p.data as T[] | null) ?? []))
    }
    if (pages.some((p) => ((p.data as unknown[] | null)?.length ?? 0) < size)) return out
  }
}
