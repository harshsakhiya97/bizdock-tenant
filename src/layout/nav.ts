import { Building2, CalendarClock, Sun, LayoutGrid, ShieldCheck, Sparkles, User, Users, Workflow, type LucideIcon } from 'lucide-react'

/** `module` (+ `action`, default view): only shown to people with that permission */
export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  module?: string
  action?: string
  /** shown when the person's visibility in this area isn't "none" */
  area?: string
  /** shown with either permission */
  or?: { module: string; action: string }
}

// Same groups and names as Happy OS; pages appear here as they are built.
export const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Workspace',
    items: [
      { to: '/my-day', label: 'My Day', icon: Sun },
      { to: '/dashboard', label: 'Dashboards', icon: LayoutGrid },
      { to: '/leads', label: 'Leads', icon: Users, area: 'leads' },
      { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock, area: 'leads' },
      { to: '/funnels', label: 'Funnels', icon: Workflow, module: 'funnels' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/businesses', label: 'Businesses', icon: Building2, module: 'businesses' },
      {
        to: '/access-control',
        label: 'Access Control',
        icon: ShieldCheck,
        module: 'team',
        or: { module: 'access', action: 'edit' },
      },
    ],
  },
]

/** Top bar title + breadcrumb for each page. */
export const pageMeta: Record<string, { title: string; crumb: string; icon: LucideIcon }> = {
  '/my-day': { title: 'My Day', crumb: 'Today', icon: Sun },
  '/dashboard': { title: 'Dashboards', crumb: 'Overview', icon: LayoutGrid },
  '/follow-ups': { title: 'Follow-ups', crumb: 'Calls & reminders', icon: CalendarClock },
  '/leads': { title: 'Leads', crumb: 'Pipeline', icon: Users },
  '/funnels': { title: 'Funnels', crumb: 'Funnels & stages', icon: Workflow },
  '/businesses': { title: 'Businesses', crumb: 'Overview', icon: Building2 },
  '/access-control': { title: 'Access Control', crumb: 'Team & roles', icon: ShieldCheck },
  '/profile': { title: 'My Profile', crumb: 'Overview', icon: User },
  '/whats-new': { title: "What's New", crumb: 'Version history', icon: Sparkles },
}

/** Phone tab bar: short names for the main pages. */
export const tabNames: Record<string, string> = {
  '/my-day': 'My Day',
  '/dashboard': 'Dashboards',
  '/follow-ups': 'Follow-ups',
  '/leads': 'Leads',
  '/access-control': 'Team',
  '/profile': 'Profile',
}
