import { BarChart3, BadgeIndianRupee, Zap, Blocks, GraduationCap, TrendingUp, Wallet, Building2, CalendarCheck, CalendarClock, Clock3, Contact, CreditCard, Database, FileText, Handshake, LayoutGrid, Megaphone, MessageCircle, MessageSquareText, MessagesSquare, Network, PackageCheck, Phone, PhoneCall, PhoneOutgoing, Plug, ScrollText, ShieldCheck, Sparkles, Sun, User, Users, Users2, Workflow, type LucideIcon } from 'lucide-react'
import { type SubBusinessType } from '@/auth/auth-context'

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
  /** shown only in workspaces that list this page in tenants.extra_pages */
  optIn?: boolean
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
      { to: '/meetings', label: 'My Calendar', icon: Handshake, module: 'calendar' },
      { to: '/bookings', label: 'Studio Schedule', icon: CalendarCheck, module: 'bookings' },
      // Orders: hidden for now (the page stays at /orders)
      { to: '/booking-list', label: 'Bookings', icon: PackageCheck, module: 'booking_list' },
      { to: '/enrolled-courses', label: 'Enrolled Courses', icon: GraduationCap, area: 'leads', onlyType: 'WEBINAR', optIn: true },
      { to: '/upsell', label: 'Upsell', icon: TrendingUp, area: 'leads', onlyType: 'WEBINAR', optIn: true },
      {
        to: '/billing',
        label: 'Payments',
        icon: CreditCard,
        children: [
          { to: '/invoices', label: 'Invoices', icon: FileText, module: 'bookings' },
          { to: '/invoice-payments', label: 'Payments', icon: BadgeIndianRupee, module: 'bookings' },
          { to: '/payments/logs', label: 'Razorpay', icon: ScrollText, module: 'payments' },
        ],
      },
      {
        to: '/reports',
        label: 'Reports',
        icon: BarChart3,
        children: [
          { to: '/reports/team', label: 'Team Report', icon: Users2, module: 'team_report' },
          { to: '/reports/funnel', label: 'Funnel Report', icon: Workflow, module: 'funnel_report' },
        ],
      },
      { to: '/expenses', label: 'Expenses', icon: Wallet, module: 'expenses', optIn: true },
      {
        to: '/automation',
        label: 'Automation',
        icon: Zap,
        children: [
          { to: '/funnels', label: 'Funnels', icon: Workflow, module: 'funnels' },
          { to: '/workflows', label: 'Workflows', icon: Network, module: 'workflows' },
        ],
      },
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
        to: '/ai-calling',
        label: 'AI Calling',
        icon: PhoneOutgoing,
        children: [
          { to: '/ai-calling/call', label: 'Individual call', icon: PhoneOutgoing, module: 'ai_calling' },
          { to: '/ai-calling/logs', label: 'Call history', icon: ScrollText, area: 'ai_calls' },
          { to: '/ai-calling/templates', label: 'Templates', icon: MessageSquareText, module: 'ai_calling', or: { module: 'ai_calling', action: 'templates' } },
        ],
      },
      {
        to: '/callyzer',
        label: 'Callyzer',
        icon: Phone,
        children: [
          { to: '/callyzer/logs', label: 'History logs', icon: PhoneCall, module: 'call_logs', or: { module: 'settings', action: 'edit' } },
          { to: '/callyzer/team', label: 'Team numbers', icon: Users2, module: 'call_logs', or: { module: 'settings', action: 'edit' } },
          { to: '/callyzer/report', label: 'Report', icon: BarChart3, module: 'call_logs', or: { module: 'settings', action: 'edit' } },
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
  '/bookings': { title: 'Studio Schedule', crumb: 'Slots & bookings', icon: CalendarCheck },
  '/meetings': { title: 'My Calendar', crumb: 'Meetings & webinars', icon: Handshake },
  '/attendance': { title: 'Attendance', crumb: 'Check in & discipline', icon: Clock3 },
  '/masters': { title: 'Masters', crumb: 'Lists & settings', icon: Database },
  '/widgets': { title: 'Widgets', crumb: 'Overview', icon: Blocks },
  '/leads': { title: 'Leads', crumb: 'Pipeline', icon: Users },
  '/customers': { title: 'Customers', crumb: 'Closed leads & revenue', icon: Contact },
  '/invoices': { title: 'Payments', crumb: 'Invoices', icon: FileText },
  '/orders': { title: 'Orders', crumb: 'Orders, invoices & payments', icon: PackageCheck },
  '/enrolled-courses': { title: 'Enrolled Courses', crumb: 'Course purchases & payments', icon: GraduationCap },
  '/upsell': { title: 'Upsell', crumb: 'Who to sell the next course to', icon: TrendingUp },
  '/reports/team': { title: 'Reports', crumb: 'Team Report', icon: BarChart3 },
  '/reports/funnel': { title: 'Reports', crumb: 'Funnel Report', icon: BarChart3 },
  '/invoice-payments': { title: 'Payments', crumb: 'Payments', icon: BadgeIndianRupee },
  '/expenses': { title: 'Expenses', crumb: 'Spending & net profit', icon: Wallet },
  '/booking-list': { title: 'Bookings', crumb: 'Bookings, invoices & payments', icon: PackageCheck },
  '/funnels': { title: 'Funnels', crumb: 'Funnels & stages', icon: Workflow },
  '/workflows': { title: 'Workflows', crumb: 'Automatic messages & calls', icon: Network },
  '/whatsapp/chats': { title: 'WhatsApp', crumb: 'Individual chat', icon: MessagesSquare },
  '/whatsapp/campaigns': { title: 'WhatsApp', crumb: 'Campaigns', icon: Megaphone },
  '/whatsapp/logs': { title: 'WhatsApp', crumb: 'History logs', icon: ScrollText },
  '/whatsapp/templates': { title: 'WhatsApp', crumb: 'Templates', icon: MessageSquareText },
  '/ai-calling/call': { title: 'AI Calling', crumb: 'Individual call', icon: PhoneOutgoing },
  '/ai-calling/logs': { title: 'AI Calling', crumb: 'Call history', icon: ScrollText },
  '/ai-calling/templates': { title: 'AI Calling', crumb: 'Templates', icon: MessageSquareText },
  '/payments/logs': { title: 'Payments', crumb: 'Razorpay', icon: CreditCard },
  '/callyzer/logs': { title: 'Callyzer', crumb: 'History logs', icon: PhoneCall },
  '/callyzer/team': { title: 'Callyzer', crumb: 'Team numbers', icon: Users2 },
  '/callyzer/report': { title: 'Callyzer', crumb: 'Report', icon: BarChart3 },
  '/whatsapp': { title: 'WhatsApp', crumb: 'Chats & campaigns', icon: MessageCircle },
  '/businesses': { title: 'Businesses', crumb: 'Overview', icon: Building2 },
  '/integrations': { title: 'System Connections', crumb: 'Third-party integrations', icon: Plug },
  '/access-control': { title: 'Access Control', crumb: 'Team & roles', icon: ShieldCheck },
  '/profile': { title: 'My Profile', crumb: 'Overview', icon: User },
  '/whats-new': { title: "What's New", crumb: 'Version history', icon: Sparkles },
  '/whats-new/git': { title: "What's New", crumb: 'Git graph', icon: Sparkles },
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
