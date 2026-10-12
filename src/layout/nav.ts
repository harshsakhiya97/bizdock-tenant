import { BookOpen, Building2, CalendarClock, CalendarDays, Database, HandCoins, Wallet, Star, Sun, LayoutGrid, ShieldCheck, Sparkles, User, Users, Workflow, type LucideIcon } from 'lucide-react'

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
      { to: '/customers', label: 'Customers', icon: Star, area: 'customers' },
      { to: '/funnels', label: 'Funnels', icon: Workflow, module: 'funnels' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/collections', label: 'Collections & EMI', icon: HandCoins, module: 'collections', area: 'sales' },
      { to: '/payments', label: 'Payments', icon: Wallet, module: 'payments', area: 'sales' },
      { to: '/ledger', label: 'Ledger', icon: BookOpen, module: 'finance', area: 'sales' },
    ],
  },
  {
    title: 'Company',
    items: [{ to: '/calendar', label: 'Calendar & Webinars', icon: CalendarDays, area: 'calendars' }],
  },
  {
    title: 'Admin',
    items: [
      { to: '/businesses', label: 'Businesses', icon: Building2, module: 'businesses' },
      { to: '/masters', label: 'Masters', icon: Database, module: 'masters', action: 'edit' },
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
  '/customers': { title: 'Customers', crumb: 'Customers & sales', icon: Star },
  '/collections': { title: 'Collections & EMI', crumb: 'Dues & instalments', icon: HandCoins },
  '/payments': { title: 'Payments', crumb: 'Money received', icon: Wallet },
  '/ledger': { title: 'Ledger', crumb: 'Accounts & GST', icon: BookOpen },
  '/calendar': { title: 'Calendar & Webinars', crumb: 'Events & leaves', icon: CalendarDays },
  '/masters': { title: 'Masters', crumb: 'Lists & settings', icon: Database },
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
