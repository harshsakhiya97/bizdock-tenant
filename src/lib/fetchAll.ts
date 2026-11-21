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
