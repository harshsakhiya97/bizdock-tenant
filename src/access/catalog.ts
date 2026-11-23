/**
 * What a role (or one person) can see and do. Stored as jsonb on roles.permissions
 * and tenant_members.permissions (null = follows the role):
 *   { scope: { leads: 'all' | 'team' | 'own' | 'none', ... }, leads: { add: true }, ..., mode: { view_only: true } }
 * The list follows the side menu: each item says who can open it, then what they can do there.
 */

export type Scope = 'all' | 'team' | 'own' | 'none'
export type Permissions = {
  scope?: Partial<Record<string, Scope>>
  mode?: { view_only?: boolean }
} & Record<string, Record<string, unknown> | undefined>

export const SCOPES: { value: Scope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'team', label: 'Team' },
  { value: 'own', label: 'Own' },
  { value: 'none', label: 'None' },
]

export type ActionRow = { module: string; action: string; label: string; hint?: string }

/**
 * Who can open a page (the side menu item shows only for them):
 * - scope: their visibility in this area (All / Team / Own); None hides it
 * - action: a permission checkbox
 * - always: everyone · with: opens together with another item
 */
export type OpenRule =
  | { kind: 'scope'; area: string; hint: string }
  | { kind: 'action'; module: string; action: string; hint?: string }
  | { kind: 'always'; note: string }
  | { kind: 'with'; note: string }

export type ModuleDef = { key: string; label: string; open: OpenRule; extraScopes?: { area: string; label: string; hint: string }[]; actions: ActionRow[] }

/** Same sections, names and order as the side menu. */
export const MODULE_SECTIONS: { title: string; modules: ModuleDef[] }[] = [
  {
    title: 'Workspace',
    modules: [
      { key: 'my_day', label: 'My Day', open: { kind: 'always', note: 'Everyone' }, actions: [] },
      { key: 'dashboards', label: 'Dashboards', open: { kind: 'scope', area: 'dashboards', hint: 'Whose numbers their dashboards show' }, actions: [] },
      {
        key: 'leads',
        label: 'Leads',
        open: { kind: 'scope', area: 'leads', hint: 'Which leads they can see and work on' },
        actions: [
          { module: 'leads', action: 'add', label: 'Add leads' },
          { module: 'leads', action: 'edit', label: 'Edit leads' },
          { module: 'leads', action: 'delete', label: 'Delete leads', hint: 'Removes them for good, with their follow-ups and activity' },
          { module: 'leads', action: 'assign', label: 'Assign / transfer leads', hint: 'Change the owner (within the leads they can see)' },
          { module: 'leads', action: 'export', label: 'Export CSV', hint: 'Download leads' },
        ],
      },
      { key: 'customers', label: 'Customers', open: { kind: 'with', note: 'With Leads' }, actions: [] },
      {
        key: 'follow_ups',
        label: 'Follow-ups',
        open: { kind: 'with', note: 'With Leads' },
        actions: [{ module: 'follow_ups', action: 'add', label: 'Add follow-ups', hint: 'Schedule and log follow-ups' }],
      },
      {
        key: 'calendar',
        label: 'My Calendar',
        open: { kind: 'action', module: 'calendar', action: 'view', hint: 'Their own meetings and the webinars they host' },
        actions: [
          { module: 'meetings', action: 'view', label: 'See team members’ calendars', hint: 'The team member dropdown (All team members, or one), and every lead meeting on lead pages and dashboards' },
          { module: 'meetings', action: 'edit', label: 'Edit others’ lead meetings', hint: 'Reschedule, mark done / no-show' },
          { module: 'meetings', action: 'delete', label: 'Delete others’ meetings' },
          { module: 'bookings', action: 'add', label: 'Add and edit webinars', hint: 'Schedule → Webinar: its setup, dates and Zoom' },
        ],
      },
      {
        key: 'bookings',
        label: 'Studio Schedule',
        open: { kind: 'action', module: 'bookings', action: 'view', hint: 'Bookings of the businesses they work in' },
        actions: [
          { module: 'bookings', action: 'add', label: 'Book slots', hint: 'New bookings, services and payment plan' },
          { module: 'bookings', action: 'edit', label: 'Edit bookings', hint: 'Change, cancel, mark payment parts paid' },
          { module: 'bookings', action: 'delete', label: 'Delete bookings', hint: 'Delete a booking / order / brand deal (and its own invoice)' },
        ],
      },

      { key: 'booking_list', label: 'Bookings', open: { kind: 'action', module: 'booking_list', action: 'view', hint: 'The list of bookings (add / edit / delete as in Studio Schedule)' }, actions: [] },
      { key: 'invoices', label: 'Invoices', open: { kind: 'with', note: 'With Studio Schedule' }, actions: [] },
      {
        key: 'funnels',
        label: 'Funnels',
        open: { kind: 'action', module: 'funnels', action: 'view' },
        actions: [
          { module: 'funnels', action: 'add', label: 'Add funnels' },
          { module: 'funnels', action: 'edit', label: 'Edit funnels', hint: 'Landing pages, webhooks, WhatsApp sheets' },
          { module: 'funnels', action: 'delete', label: 'Delete funnels' },
        ],
      },
      {
        key: 'workflows',
        label: 'Workflows',
        open: { kind: 'action', module: 'workflows', action: 'view' },
        actions: [
          { module: 'workflows', action: 'add', label: 'Create workflows' },
          { module: 'workflows', action: 'edit', label: 'Edit workflows', hint: 'Steps, trigger, turn on / off' },
          { module: 'workflows', action: 'delete', label: 'Delete workflows' },
        ],
      },
      {
        key: 'ai_calling',
        label: 'AI Calling',
        open: { kind: 'action', module: 'ai_calling', action: 'view', hint: 'Individual call, Call from AI on a lead (HelloRix)' },
        extraScopes: [{ area: 'ai_calls', label: 'Call history', hint: 'Whose AI calls they see in Call history (Own: the calls they placed)' }],
        actions: [{ module: 'ai_calling', action: 'templates', label: 'Manage templates', hint: 'Make, edit and delete the call scripts (also Write with AI)' }],
      },
      {
        key: 'expenses',
        label: 'Expenses',
        open: { kind: 'action', module: 'expenses', action: 'view', hint: 'Expenses: what the business spends, and net profit' },
        actions: [{ module: 'expenses', action: 'edit', label: 'Add / edit / delete expenses' }],
      },
      {
        key: 'payments',
        label: 'Payments',
        open: { kind: 'action', module: 'payments', action: 'view', hint: 'Payments → History logs: Razorpay payments' },
        actions: [],
      },
      {
        key: 'whatsapp',
        label: 'WhatsApp',
        open: { kind: 'scope', area: 'whatsapp', hint: 'Whose chats and history logs they see (Own: messages they sent or to their own leads)' },
        actions: [
          { module: 'whatsapp', action: 'campaign', label: 'Send campaigns', hint: 'Campaign menu: send a template to many numbers and see the reports' },
          { module: 'whatsapp', action: 'templates', label: 'Manage templates', hint: 'Templates menu: add, duplicate and delete templates' },
        ],
      },
    ],
  },
  {
    title: 'Company',
    modules: [
      {
        key: 'attendance',
        label: 'Attendance',
        open: { kind: 'scope', area: 'attendance', hint: 'Whose attendance they can see' },
        actions: [{ module: 'attendance', action: 'edit', label: 'Correct attendance', hint: 'Fix check-in / out, weekly offs and attendance rules' }],
      },
    ],
  },
  {
    title: 'Admin',
    modules: [
      {
        key: 'businesses',
        label: 'Businesses',
        open: { kind: 'action', module: 'businesses', action: 'view' },
        actions: [
          { module: 'businesses', action: 'add', label: 'Add businesses' },
          { module: 'businesses', action: 'edit', label: 'Edit businesses' },
          { module: 'businesses', action: 'delete', label: 'Delete businesses' },
        ],
      },
      { key: 'masters', label: 'Masters', open: { kind: 'action', module: 'masters', action: 'edit', hint: 'Services, payment modes, sources, outcomes, WhatsApp messages' }, actions: [] },
      {
        key: 'widgets',
        label: 'Widgets',
        open: { kind: 'action', module: 'widgets', action: 'view' },
        actions: [
          { module: 'widgets', action: 'add', label: 'Add widgets' },
          { module: 'widgets', action: 'edit', label: 'Edit widgets' },
          { module: 'widgets', action: 'delete', label: 'Delete widgets' },
        ],
      },
      {
        key: 'access',
        label: 'Access Control',
        open: { kind: 'action', module: 'team', action: 'view', hint: 'See the team' },
        actions: [
          { module: 'team', action: 'add', label: 'Add team members' },
          { module: 'team', action: 'edit', label: 'Edit team members', hint: 'Role, businesses, reset password, deactivate' },
          { module: 'access', action: 'edit', label: 'Change roles & access', hint: 'Also opens Access Control on its own' },
        ],
      },
      { key: 'integrations', label: 'System Connections', open: { kind: 'action', module: 'settings', action: 'edit', hint: 'WhatsApp, Facebook ads and other connections' }, actions: [] },
      { key: 'ai_insights', label: 'AI Insights', open: { kind: 'action', module: 'ai_insights', action: 'view', hint: 'The AI button on every page: a summary of the screen and a chat about it (Gemini AI)' }, actions: [] },
      { key: 'team_report', label: 'Team Report', open: { kind: 'action', module: 'team_report', action: 'view', hint: 'Reports → Team Report: each day’s calls (Callyzer) and follow-ups of the whole team' }, actions: [] },
      { key: 'call_logs', label: 'Call logs', open: { kind: 'action', module: 'call_logs', action: 'view', hint: 'Callyzer call logs of every lead (System Connections people see them too)' }, actions: [] },
    ],
  },
]

export const MODE_ROW: ActionRow = {
  module: 'mode',
  action: 'view_only',
  label: 'View-only',
  hint: 'Can open everything allowed above but cannot add or change anything',
}

export function getScope(p: Permissions | null | undefined, area: string): Scope {
  return (p?.scope?.[area] as Scope | undefined) ?? 'none'
}

export function getAction(p: Permissions | null | undefined, module: string, action: string): boolean {
  return Boolean(p?.[module]?.[action])
}

export function setScope(p: Permissions, area: string, value: Scope): Permissions {
  return { ...p, scope: { ...(p.scope ?? {}), [area]: value } }
}

export function setAction(p: Permissions, module: string, action: string, value: boolean): Permissions {
  return { ...p, [module]: { ...(p[module] ?? {}), [action]: value } }
}

/** Everything on: shown for the Owner and Tech Support columns. */
export const FULL_ACCESS: Permissions = (() => {
  let p: Permissions = {}
  for (const sec of MODULE_SECTIONS)
    for (const m of sec.modules) {
      if (m.open.kind === 'scope') p = setScope(p, m.open.area, 'all')
      if (m.open.kind === 'action') p = setAction(p, m.open.module, m.open.action, true)
      for (const x of m.extraScopes ?? []) p = setScope(p, x.area, 'all')
      for (const r of m.actions) p = setAction(p, r.module, r.action, true)
    }
  return p
})()

export const scopeTone: Record<Scope, string> = {
  all: 'badge-success',
  team: 'badge-info',
  own: 'badge-brand',
  none: 'badge-muted',
}
