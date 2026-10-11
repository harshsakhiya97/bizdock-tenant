import { Building2, LayoutGrid, ShieldCheck, Sparkles, User, Users, type LucideIcon } from 'lucide-react'

/** `module` (+ `action`, default view): only shown to people with that permission */
export type NavItem = { to: string; label: string; icon: LucideIcon; module?: string; action?: string }

// Same groups and names as Happy OS; pages appear here as they are built.
export const navSections: { title: string; items: NavItem[] }[] = [
  { title: 'Workspace', items: [{ to: '/dashboard', label: 'Dashboards', icon: LayoutGrid }] },
  { title: 'Company', items: [{ to: '/team', label: 'Team', icon: Users, module: 'team' }] },
  {
    title: 'Admin',
    items: [
      { to: '/businesses', label: 'Businesses', icon: Building2, module: 'businesses' },
      { to: '/access-control', label: 'Access Control', icon: ShieldCheck, module: 'access', action: 'edit' },
    ],
  },
]

/** Top bar title + breadcrumb for each page. */
export const pageMeta: Record<string, { title: string; crumb: string; icon: LucideIcon }> = {
  '/dashboard': { title: 'Dashboards', crumb: 'Overview', icon: LayoutGrid },
  '/team': { title: 'Team', crumb: 'Members & logins', icon: Users },
  '/businesses': { title: 'Businesses', crumb: 'Overview', icon: Building2 },
  '/access-control': { title: 'Access Control', crumb: 'People & roles', icon: ShieldCheck },
  '/profile': { title: 'My Profile', crumb: 'Overview', icon: User },
  '/whats-new': { title: "What's New", crumb: 'Version history', icon: Sparkles },
}

/** Phone tab bar: short names for the main pages. */
export const tabNames: Record<string, string> = {
  '/dashboard': 'Dashboards',
  '/team': 'Team',
  '/businesses': 'Businesses',
  '/profile': 'Profile',
}
