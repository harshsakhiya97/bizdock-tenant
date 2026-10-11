import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'

/** The client's logo, or a letter badge in the client's colour when no logo is uploaded. */
export function TenantLogo({ size = 34, className }: { size?: number; className?: string }) {
  const tenant = useTenant()
  if (tenant.logo_url) {
    return (
      <img
        src={tenant.logo_url}
        alt={tenant.app_name}
        className={cn('logo-img', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      aria-label={tenant.app_name}
      className={cn('logo-letter', className)}
      style={{ width: size, height: size, fontSize: size * 0.46 }}
    >
      {tenant.app_name.trim().charAt(0).toUpperCase()}
    </div>
  )
}

/** Theme-kit brand lockup: logo + app name, for the sidebar header. */
export function TenantLockup() {
  const tenant = useTenant()
  return (
    <div className="brand-lockup">
      <TenantLogo size={34} />
      <div className="brand-name">{tenant.app_name}</div>
    </div>
  )
}
