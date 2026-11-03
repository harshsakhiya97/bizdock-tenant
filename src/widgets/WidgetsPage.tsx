import { Blocks } from 'lucide-react'
import { PageHead } from '@/components/ui'

/** Widgets: the module is set up (menu, route, access); its screens come next. */
export function WidgetsPage() {
  return (
    <>
      <PageHead title="Widgets" />
      <div className="panel">
        <div className="empty">
          <Blocks size={22} className="muted" />
          <div>No widgets yet.</div>
        </div>
      </div>
    </>
  )
}
