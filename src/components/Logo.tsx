import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'

/** The tenant's logo, or a letter badge in the tenant colour when no logo is uploaded. */
export function TenantLogo({ size = 34, className }: { size?: number; className?: string }) {
  const tenant = useTenant()
  if (tenant.logo_url) {
    return (
      <img
        src={tenant.logo_url}
        alt={tenant.app_name}
        className={cn('shrink-0 rounded-[22%] object-contain', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      aria-label={tenant.app_name}
      className={cn('grid shrink-0 place-items-center rounded-[22%] bg-brand font-bold text-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.46 }}
    >
      {tenant.app_name.trim().charAt(0).toUpperCase()}
    </div>
  )
}

/** Logo + app name, for the sidebar header. */
export function TenantLockup({ size = 34 }: { size?: number }) {
  const tenant = useTenant()
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <TenantLogo size={size} />
      <div className="truncate text-[15px] leading-tight font-extrabold tracking-tight text-gray-900 uppercase">
        {tenant.app_name}
      </div>
    </div>
  )
}
