import { Building2, LayoutGrid, Sparkles, User, type LucideIcon } from 'lucide-react'

/** `module`: only shown to people with View permission on that module */
export type NavItem = { to: string; label: string; icon: LucideIcon; module?: string }

export const navSections: { title: string; items: NavItem[] }[] = [
  { title: 'General', items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutGrid }] },
  { title: 'Manage', items: [{ to: '/businesses', label: 'Businesses', icon: Building2, module: 'businesses' }] },
  { title: 'Account', items: [{ to: '/profile', label: 'My Profile', icon: User }] },
]

/** Top bar title + breadcrumb for each page. */
export const pageMeta: Record<string, { title: string; crumb: string; icon: LucideIcon }> = {
  '/dashboard': { title: 'Dashboard', crumb: 'Overview', icon: LayoutGrid },
  '/businesses': { title: 'Businesses', crumb: 'Overview', icon: Building2 },
  '/profile': { title: 'My Profile', crumb: 'Overview', icon: User },
  '/whats-new': { title: "What's New", crumb: 'Version history', icon: Sparkles },
}
