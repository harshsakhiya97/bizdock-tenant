import { PackageCheck, Phone, PhoneCall, Users2, MessageCircle, MessagesSquare, Megaphone, ScrollText, MessageSquareText, Blocks, Building2, Contact, FileText, CalendarClock, Clock3, Database, Sun, LayoutGrid, ShieldCheck, Sparkles, User, Users, Workflow, Network, CalendarCheck, Plug, Handshake, type LucideIcon } from 'lucide-react'
import { BT, type SubBusinessType } from '@/auth/auth-context'

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
  /** shown only when this type of (sub-)business is picked in the top bar */
  onlyType?: SubBusinessType | SubBusinessType[]
  /** hidden when this type of (sub-)business is picked in the top bar */
  hideType?: SubBusinessType | SubBusinessType[]
  /** an accordion: these open under it (it shows when one of them does) */
  children?: NavItem[]
}

// Same groups and names as Happy OS; pages appear here as they are built.
export const navSections: { title: string; /** no heading shown in the side menu */ hideTitle?: boolean; items: NavItem[] }[] = [
  {
    title: 'Workspace',
    hideTitle: true,
    items: [
      { to: '/my-day', label: 'My Day', icon: Sun },
      { to: '/dashboard', label: 'Dashboards', icon: LayoutGrid, area: 'dashboards' },
      { to: '/leads', label: 'Leads', icon: Users, area: 'leads' },
      { to: '/customers', label: 'Customers', icon: Contact, area: 'leads' },
      { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock, area: 'leads' },
      { to: '/meetings', label: 'Meetings', icon: Handshake },
      { to: '/bookings', label: 'Booking Calendar', icon: CalendarCheck, module: 'bookings', hideType: [BT.DEFAULT, BT.BRAND_DEALS] },
      { to: '/orders', label: 'Orders', icon: PackageCheck, module: 'bookings', onlyType: [BT.DEFAULT, BT.BRAND_DEALS] },
      { to: '/booking-list', label: 'Bookings', icon: PackageCheck, module: 'bookings', hideType: [BT.DEFAULT, BT.BRAND_DEALS] },
      { to: '/invoices', label: 'Invoices', icon: FileText, module: 'bookings' },
      { to: '/funnels', label: 'Funnels', icon: Workflow, module: 'funnels' },
      { to: '/workflows', label: 'Workflows', icon: Network, module: 'workflows' },
      {
        to: '/whatsapp',
        label: 'WhatsApp',
        icon: MessageCircle,
        children: [
          { to: '/whatsapp/chats', label: 'Individual chat', icon: MessagesSquare, area: 'whatsapp' },
          { to: '/whatsapp/campaigns', label: 'Campaign', icon: Megaphone, module: 'whatsapp', action: 'campaign' },
          { to: '/whatsapp/logs', label: 'History logs', icon: ScrollText, area: 'whatsapp' },
          { to: '/whatsapp/templates', label: 'Templates', icon: MessageSquareText, module: 'whatsapp', action: 'templates', or: { module: 'whatsapp', action: 'campaign' } },
        ],
      },
      {
        to: '/callyzer',
        label: 'Callyzer',
        icon: Phone,
        children: [
          { to: '/callyzer/logs', label: 'History logs', icon: PhoneCall, module: 'call_logs', or: { module: 'settings', action: 'edit' } },
          { to: '/callyzer/team', label: 'Team numbers', icon: Users2, module: 'call_logs', or: { module: 'settings', action: 'edit' } },
        ],
      },
    ],
  },
  {
    title: 'Company',
    hideTitle: true,
    items: [
      { to: '/attendance', label: 'Attendance', icon: Clock3, area: 'attendance' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/businesses', label: 'Businesses', icon: Building2, module: 'businesses' },
      { to: '/masters', label: 'Masters', icon: Database, module: 'masters', action: 'edit' },
      { to: '/widgets', label: 'Widgets', icon: Blocks, module: 'widgets' },
      {
        to: '/access-control',
        label: 'Access Control',
        icon: ShieldCheck,
        module: 'team',
        or: { module: 'access', action: 'edit' },
      },
      { to: '/integrations', label: 'System Connections', icon: Plug, module: 'settings', action: 'edit' },
    ],
  },
]

/** Top bar title + breadcrumb for each page. */
export const pageMeta: Record<string, { title: string; crumb: string; icon: LucideIcon }> = {
  '/my-day': { title: 'My Day', crumb: 'Today', icon: Sun },
  '/dashboard': { title: 'Dashboards', crumb: 'Overview', icon: LayoutGrid },
  '/follow-ups': { title: 'Follow-ups', crumb: 'Calls & reminders', icon: CalendarClock },
  '/bookings': { title: 'Booking Calendar', crumb: 'Slots & bookings', icon: CalendarCheck },
  '/meetings': { title: 'Meetings', crumb: 'My meetings', icon: Handshake },
  '/attendance': { title: 'Attendance', crumb: 'Check in & discipline', icon: Clock3 },
  '/masters': { title: 'Masters', crumb: 'Lists & settings', icon: Database },
  '/widgets': { title: 'Widgets', crumb: 'Overview', icon: Blocks },
  '/leads': { title: 'Leads', crumb: 'Pipeline', icon: Users },
  '/customers': { title: 'Customers', crumb: 'Booked clients & revenue', icon: Contact },
  '/invoices': { title: 'Invoices', crumb: 'Invoices & payments', icon: FileText },
  '/orders': { title: 'Orders', crumb: 'Orders, invoices & payments', icon: PackageCheck },
  '/booking-list': { title: 'Bookings', crumb: 'Bookings, invoices & payments', icon: PackageCheck },
  '/funnels': { title: 'Funnels', crumb: 'Funnels & stages', icon: Workflow },
  '/workflows': { title: 'Workflows', crumb: 'Automatic messages & calls', icon: Network },
  '/whatsapp/chats': { title: 'WhatsApp', crumb: 'Individual chat', icon: MessagesSquare },
  '/whatsapp/campaigns': { title: 'WhatsApp', crumb: 'Campaigns', icon: Megaphone },
  '/whatsapp/logs': { title: 'WhatsApp', crumb: 'History logs', icon: ScrollText },
  '/whatsapp/templates': { title: 'WhatsApp', crumb: 'Templates', icon: MessageSquareText },
  '/callyzer/logs': { title: 'Callyzer', crumb: 'History logs', icon: PhoneCall },
  '/callyzer/team': { title: 'Callyzer', crumb: 'Team numbers', icon: Users2 },
  '/whatsapp': { title: 'WhatsApp', crumb: 'Chats & campaigns', icon: MessageCircle },
  '/businesses': { title: 'Businesses', crumb: 'Overview', icon: Building2 },
  '/integrations': { title: 'System Connections', crumb: 'Third-party integrations', icon: Plug },
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
