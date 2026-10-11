/**
 * What a role (or one person) can see and do. Stored as jsonb on roles.permissions
 * and tenant_members.permissions (null = follows the role):
 *   { scope: { leads: 'all' | 'team' | 'own' | 'none', ... }, leads: { add: true }, ..., mode: { view_only: true } }
 * Modules that aren't built yet are listed too, so roles can be set up once.
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

/** Data visibility: whose records a person sees in each area. */
export const SCOPE_AREAS: { key: string; label: string; hint: string }[] = [
  { key: 'leads', label: 'Leads', hint: 'Which leads they can see and work on' },
  { key: 'customers', label: 'Customers', hint: 'Which customers they can see' },
  { key: 'sales', label: 'Sales, payments & collections', hint: 'Sales, payments and dues they can see' },
  { key: 'dashboards', label: 'Dashboards', hint: 'Whose numbers their dashboards show' },
  { key: 'calendars', label: 'Staff calendars', hint: 'Whose week-offs, leaves and events they see' },
  { key: 'attendance', label: 'Attendance', hint: 'Whose attendance they can see' },
]

export type ActionRow = { module: string; action: string; label: string; hint?: string }

export const ACTION_GROUPS: { title: string; rows: ActionRow[] }[] = [
  {
    title: 'Leads & follow-ups',
    rows: [
      { module: 'leads', action: 'add', label: 'Add leads' },
      { module: 'leads', action: 'edit', label: 'Edit leads' },
      { module: 'leads', action: 'delete', label: 'Delete leads' },
      { module: 'leads', action: 'assign', label: 'Assign / transfer leads', hint: 'Change the owner (within the leads they can see)' },
      { module: 'follow_ups', action: 'add', label: 'Add follow-ups', hint: 'Schedule and log follow-ups' },
      { module: 'leads', action: 'export', label: 'Export CSV', hint: 'Download leads, deals and payments' },
    ],
  },
  {
    title: 'Sales & payments',
    rows: [
      { module: 'deals', action: 'add', label: 'Create deals / new sale' },
      { module: 'deals', action: 'edit', label: 'Edit or cancel deals' },
      { module: 'payments', action: 'view', label: 'Payments list', hint: 'Payments on deals they can see' },
      { module: 'payments', action: 'add', label: 'Record payments' },
      { module: 'payments', action: 'verify', label: 'Verify payments', hint: 'Only verified payments count as revenue' },
      { module: 'collections', action: 'view', label: 'Collections & EMI', hint: 'Dues on deals they can see' },
      { module: 'finance', action: 'view', label: 'Ledger & finance reports', hint: 'Invoices, payments, balances, GST' },
    ],
  },
  {
    title: 'Customers',
    rows: [{ module: 'customers', action: 'edit', label: 'Edit customers', hint: 'Profile, journey status, products' }],
  },
  {
    title: 'Work & team',
    rows: [
      { module: 'tasks', action: 'view', label: 'Tasks' },
      { module: 'calendar', action: 'add', label: 'Create company events', hint: 'Add / edit events, holidays and assign people' },
      { module: 'team', action: 'view', label: 'See the team' },
      { module: 'team', action: 'add', label: 'Add team members' },
      { module: 'team', action: 'edit', label: 'Edit team members', hint: 'Role, businesses, reset password, deactivate' },
    ],
  },
  {
    title: 'Admin',
    rows: [
      { module: 'businesses', action: 'view', label: 'See businesses' },
      { module: 'businesses', action: 'add', label: 'Add businesses' },
      { module: 'businesses', action: 'edit', label: 'Edit businesses & branches' },
      { module: 'businesses', action: 'delete', label: 'Delete businesses' },
      { module: 'masters', action: 'edit', label: 'Masters', hint: 'Products, sources, statuses, billing companies' },
      { module: 'settings', action: 'edit', label: 'Settings & integrations' },
      { module: 'activity', action: 'view', label: 'Activity log', hint: 'Full audit trail' },
      { module: 'access', action: 'edit', label: 'Access control', hint: 'Roles and what each person can see' },
    ],
  },
  {
    title: 'Mode',
    rows: [
      {
        module: 'mode',
        action: 'view_only',
        label: 'View-only',
        hint: 'Can look at everything allowed above but cannot add or change anything',
      },
    ],
  },
]

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
  for (const a of SCOPE_AREAS) p = setScope(p, a.key, 'all')
  for (const g of ACTION_GROUPS)
    for (const r of g.rows) if (r.module !== 'mode') p = setAction(p, r.module, r.action, true)
  return p
})()

export const scopeTone: Record<Scope, string> = {
  all: 'badge-success',
  team: 'badge-info',
  own: 'badge-brand',
  none: 'badge-muted',
}
