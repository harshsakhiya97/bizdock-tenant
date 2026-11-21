import { useEffect, useRef, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { ChevronDown, LayoutGrid, LogOut, Menu, PanelLeft, User } from 'lucide-react'
import { displayName, useAuth } from '@/auth/useAuth'
import { BusinessProvider } from '@/business/BusinessProvider'
import { BusinessSwitcher } from '@/business/BusinessSwitcher'
import { useBusiness } from '@/business/useBusiness'
import { activeType } from '@/business/activeType'
import { Avatar } from '@/components/Avatar'
import { DevelopedBy } from '@/components/DevelopedBy'
import { TenantLockup } from '@/components/Logo'
import { LogoutDialog } from '@/components/LogoutDialog'
import { APP_VERSION } from '@/config'
import { cn } from '@/lib/cn'
import { AiInsights } from '@/ai/AiInsights'
import { NotificationBell } from './NotificationBell'
import { navSections, pageMeta, tabNames, type NavItem } from './nav'
import { useTenant } from '@/tenant/useTenant'

const STORAGE_KEY = 'bizdock.sidebarCollapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** Theme-kit app shell: sidebar, top bar with crumbs, page area and the phone tab bar. */
export function AppLayout() {
  return (
    <BusinessProvider>
      <Shell />
    </BusinessProvider>
  )
}

function Shell() {
  const { pathname } = useLocation()
  const { profile, user, can, scope } = useAuth()
  const tenant = useTenant()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const { switches, selected, sub } = useBusiness()
  const base = pageMeta[pathname] ?? pageMeta[`/${pathname.split('/')[1]}`] ?? { title: 'Dashboard', crumb: 'Overview', icon: LayoutGrid }
  const meta = base
  const Icon = meta.icon
  const name = displayName(profile?.full_name, user?.email)
  const email = profile?.email ?? user?.email ?? ''

  // pages turned off for this workspace: listed in hidden_pages, or opt-in pages it doesn't list in extra_pages
  const hiddenPages = [
    ...(tenant.hidden_pages ?? []),
    ...navSections.flatMap((s) => s.items.flatMap((i) => [i, ...(i.children ?? [])])).filter((i) => i.optIn && !(tenant.extra_pages ?? []).includes(i.to)).map((i) => i.to),
  ]
  // onlyType: shown when that type of business is picked in the top bar, or when all businesses are shown
  const type = activeType(selected, sub)
  // a hidden page hides what's under it too ('/whatsapp' → '/whatsapp/chats')
  const isHidden = (to: string) => hiddenPages.some((p) => to === p || to.startsWith(`${p}/`))
  const shows = (i: NavItem) =>
    !isHidden(i.to) &&
    (!i.onlyType || !type || [i.onlyType].flat().includes(type)) &&
    (i.area ? scope(i.area) !== 'none' : true) &&
    (!i.module || can(i.module, i.action ?? 'view') || Boolean(i.or && can(i.or.module, i.or.action)))
  const sections = navSections
    .map((s) => ({
      ...s,
      items: s.items
        .map((i) => (i.children ? { ...i, children: i.children.filter(shows) } : i))
        .filter((i) => (i.children ? i.children.length > 0 : shows(i))),
    }))
    .filter((s) => s.items.length > 0)
  // accordions: the one holding the open page starts open
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  // a group holds the open page when the path is under it or under one of its items (Funnels & Workflows)
  const inGroup = (to: string) =>
    pathname.startsWith(`${to}/`) ||
    !!navSections.flatMap((s) => s.items).find((i) => i.to === to)?.children?.some((c) => pathname === c.to || pathname.startsWith(`${c.to}/`))
  const groupOpen = (to: string) => openGroups[to] ?? inGroup(to)
  const tabs = [...sections.flatMap((s) => s.items.flatMap((i) => i.children ?? [i])), { to: '/profile', label: 'My Profile', icon: User }].filter(
    (i) => tabNames[i.to],
  )

  // switching the business in the top bar: a page that isn't in the new one's menu goes to Dashboards,
  // and a detail page (a funnel, a lead, a workflow…) goes back to its list (it belongs to the old business)
  const navigate = useNavigate()
  const lastSwitch = useRef(switches)
  useEffect(() => {
    if (lastSwitch.current === switches) return
    lastSwitch.current = switches
    const items = sections.flatMap((s) => s.items.flatMap((i) => i.children ?? [i]))
    const match = items
      .filter((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))
      .sort((a, b) => b.to.length - a.to.length)[0]
    if (match) {
      if (pathname !== match.to) navigate(match.to, { replace: true })
      return
    }
    // a menu page hidden in this business → Dashboards (or the first page it has)
    const all = navSections.flatMap((s) => s.items.flatMap((i) => [i, ...(i.children ?? [])]))
    const isMenuPage = all.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))
    if (isMenuPage) navigate(items.find((i) => i.to === '/dashboard')?.to ?? items[0]?.to ?? '/my-day', { replace: true })
  }, [switches]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? '0' : '1')
      } catch {
        /* storage unavailable */
      }
      return !c
    })
  }

  // a page turned off for this workspace (e.g. My Day, the default landing page) → the first page in its menu
  const firstPage = sections.flatMap((s) => s.items.flatMap((i) => i.children ?? [i]))[0]?.to
  if (firstPage && isHidden(pathname)) return <Navigate to={firstPage} replace />

  return (
      <div className="shell">
        <aside className={cn('sidebar', collapsed && 'is-collapsed', mobileOpen && 'is-open')}>
          <div className="sidebar-brand">
            <TenantLockup />
            <button type="button" className="btn btn-ghost btn-icon" onClick={toggle} aria-label="Toggle sidebar">
              <PanelLeft size={18} />
            </button>
          </div>

          <nav className="sidebar-nav">
            {sections.map((section) => (
              <div key={section.title}>
                {!section.hideTitle && <div className="nav-section-label">{section.title}</div>}
                {section.items.map(({ to, label, icon: I, children }) =>
                  children ? (
                    <div key={to} className={cn('nav-group', groupOpen(to) && 'is-open')}>
                      <button
                        type="button"
                        className={cn('nav-item nav-group-head', inGroup(to) && 'is-current')}
                        title={label}
                        aria-expanded={groupOpen(to)}
                        onClick={() => setOpenGroups((g) => ({ ...g, [to]: !groupOpen(to) }))}
                      >
                        <I size={17} strokeWidth={1.9} />
                        <span className="nav-text">{label}</span>
                        <ChevronDown size={15} className="nav-chevron" />
                      </button>
                      {groupOpen(to) && (
                        <div className="nav-subs">
                          {children.map((c) => (
                            <NavLink key={c.to} to={c.to} className="nav-item nav-sub" title={c.label} onClick={() => setMobileOpen(false)}>
                              <c.icon size={16} strokeWidth={1.9} />
                              <span className="nav-text">{c.label}</span>
                            </NavLink>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <NavLink key={to} to={to} className="nav-item" title={label} onClick={() => setMobileOpen(false)}>
                      <I size={17} strokeWidth={1.9} />
                      <span className="nav-text">{label}</span>
                    </NavLink>
                  ),
                )}
              </div>
            ))}
          </nav>

          <div className="sidebar-user">
            <NavLink to="/profile" className="user-link" title="My Profile" onClick={() => setMobileOpen(false)}>
              <Avatar name={name} size={32} />
              <div className="user-meta">
                <b>{name}</b>
                <small>{email}</small>
              </div>
            </NavLink>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => setLogoutOpen(true)}
              aria-label="Log out"
            >
              <LogOut size={16} />
            </button>
          </div>
          {!tenant.hide_bizdock_branding && (
            <NavLink to="/whats-new" className="sidebar-version" onClick={() => setMobileOpen(false)}>
              Version {APP_VERSION} · What’s new
            </NavLink>
          )}
          <DevelopedBy className="sidebar-dev" />
        </aside>

        {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}

        <div className="main">
          <header className="topbar">
            <div className="crumbs">
              <button
                type="button"
                className="btn btn-ghost btn-icon menu-btn"
                onClick={() => setMobileOpen((o) => !o)}
                aria-label="Menu"
              >
                <Menu size={18} />
              </button>
              <Icon size={19} />
              <h1>{meta.title}</h1>
              <span className="sep">/</span>
              <small>{meta.crumb}</small>
            </div>
            <div className="topbar-right">
              <BusinessSwitcher />
              <NotificationBell />
            </div>
          </header>

          <main className="page">
            <Outlet />
          </main>
        </div>

        {/* phone: app-style tab bar */}
        <nav className="tabbar" aria-label="Main" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map(({ to, icon: I }) => (
            <NavLink key={to} to={to} className="tabbar-item">
              <I size={21} />
              <span>{tabNames[to]}</span>
            </NavLink>
          ))}
        </nav>

        <AiInsights page={`${meta.title} / ${meta.crumb}`} />
        <LogoutDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} />
      </div>
  )
}
