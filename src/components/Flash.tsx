import { useEffect, useState } from 'react'

/** A green success message that hides itself after a few seconds (shows again for each new message). */
export function Flash({ msg, dep, ms = 3000 }: { msg: string | null | undefined; dep?: unknown; ms?: number }) {
  const [shown, setShown] = useState<string | null>(msg ?? null)
  useEffect(() => {
    setShown(msg ?? null)
    if (!msg) return
    const t = setTimeout(() => setShown(null), ms)
    return () => clearTimeout(t)
  }, [msg, dep, ms])
  return shown ? <div className="alert alert-info flash">{shown}</div> : null
}
