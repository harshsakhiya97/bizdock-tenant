import type { Tenant } from './tenant-context'

/** Small square letter icon in the tenant colour, used when no logo/favicon is uploaded. */
export function letterIcon(tenant: Pick<Tenant, 'app_name' | 'primary_color'>) {
  const letter = (tenant.app_name.trim()[0] ?? '?').toUpperCase()
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="14" fill="${tenant.primary_color}"/>` +
    `<text x="32" y="43" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="700" ` +
    `text-anchor="middle" fill="#fff">${letter}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** Puts the tenant's colour, name and icon on the page. */
export function applyBranding(tenant: Tenant) {
  document.documentElement.style.setProperty('--color-brand', tenant.primary_color)
  document.title = tenant.app_name

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = tenant.favicon_url || tenant.logo_url || letterIcon(tenant)
}
