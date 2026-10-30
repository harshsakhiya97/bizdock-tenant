import { WorkflowsPage } from '@/workflows/WorkflowsPage'

/** A funnel's Workflows tab: the Workflows list (runs, test run, on / off, delete, new) for this funnel. */
export function FunnelWorkflowsTab({ funnelId, eventId }: { funnelId: string; eventId: string | null }) {
  return <WorkflowsPage funnelId={funnelId} eventId={eventId} />
}
