import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { ChevronDown, LayoutGrid, LogOut, Menu, PanelLeft, User } from 'lucide-react'
import { displayName, useAuth } from '@/auth/useAuth'
import { BusinessProvider } from '@/business/BusinessProvider'
import { BusinessSwitcher } from '@/business/BusinessSwitcher'
import { useBusiness } from '@/business/useBusiness'
import { activeType, calendarName, orderNoun } from '@/business/activeType'
import { Avatar } from '@/components/Avatar'
import { DevelopedBy } from '@/components/DevelopedBy'
import { TenantLockup } from '@/components/Logo'
import { LogoutDialog } from '@/components/LogoutDialog'
import { APP_VERSION } from '@/config'
import { cn } from '@/lib/cn'
import { NotificationBell } from './NotificationBell'
import { navSections, pageMeta, tabNames, type NavItem } from './nav'

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
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const { selected, sub } = useBusiness()
  const type = activeType(selected, sub)
  const base = pageMeta[pathname] ?? pageMeta[`/${pathname.split('/')[1]}`] ?? { title: 'Dashboard', crumb: 'Overview', icon: LayoutGrid }
  const meta = pathname === '/bookings' ? { ...base, title: calendarName(type) } : pathname === '/orders' ? { ...base, title: orderNoun(type).many } : base
  const Icon = meta.icon
  const name = displayName(profile?.full_name, user?.email)
  const email = profile?.email ?? user?.email ?? ''

  const shows = (i: NavItem) =>
    (!i.onlyType || [i.onlyType].flat().includes(type ?? '')) &&
    (!i.hideType || ![i.hideType].flat().includes(type ?? '')) &&
    (i.area ? scope(i.area) !== 'none' : true) &&
    (!i.module || can(i.module, i.action ?? 'view') || Boolean(i.or && can(i.or.module, i.or.action)))
  const sections = navSections
    .map((s) => ({
      ...s,
      items: s.items
        .map((i) => (i.children ? { ...i, children: i.children.filter(shows) } : i))
        .filter((i) => (i.children ? i.children.length > 0 : shows(i)))
        .map((i) => (i.to === '/bookings' ? { ...i, label: calendarName(type) } : i.to === '/orders' ? { ...i, label: orderNoun(type).many } : i)),
    }))
    .filter((s) => s.items.length > 0)
  // accordions: the one holding the open page starts open
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const groupOpen = (to: string) => openGroups[to] ?? pathname.startsWith(`${to}/`)
  const tabs = [...sections.flatMap((s) => s.items.flatMap((i) => i.children ?? [i])), { to: '/profile', label: 'My Profile', icon: User }].filter(
    (i) => tabNames[i.to],
  )

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
                        className={cn('nav-item nav-group-head', pathname.startsWith(`${to}/`) && 'is-current')}
                        title={label}
                        aria-expanded={groupOpen(to)}
                        onClick={() => setOpenGroups((g) => ({ ...g, [to]: !groupOpen(to) }))}
                      >
                        <I size={17} strokeWidth={1.9} />
                        <span className="nav-text">{label}</span>
                        <ChevronDown size={15} className="nav-chevron" />
                      </button>
                      {groupOpen(to) &&
                        children.map((c) => (
                          <NavLink key={c.to} to={c.to} className="nav-item nav-sub" title={c.label} onClick={() => setMobileOpen(false)}>
                            <c.icon size={16} strokeWidth={1.9} />
                            <span className="nav-text">{c.label}</span>
                          </NavLink>
                        ))}
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
          <NavLink to="/whats-new" className="sidebar-version" onClick={() => setMobileOpen(false)}>
            Version {APP_VERSION} · What’s new
          </NavLink>
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

        <LogoutDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} />
      </div>
  )
}
