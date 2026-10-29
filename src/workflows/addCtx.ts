import { createContext } from 'react'

/** the builder's "+" actions: add a step under an exit, or add a Switch path */
export const AddCtx = createContext<{ canEdit: boolean; used: Set<string>; onAdd: (source: string, handle: string | null) => void; onAddPath: (id: string) => void }>({
  canEdit: false,
  used: new Set(),
  onAdd: () => {},
  onAddPath: () => {},
})

