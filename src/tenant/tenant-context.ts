import { createContext } from 'react'

export type Tenant = {
  id: string
  name: string
  app_name: string
  logo_url: string | null
  favicon_url: string | null
  primary_color: string
  /** sidebar look: 'light' (default) or 'dark' */
  sidebar_style?: string | null
  /** hide the "Version · What's new" link and "Developed by BizDock" */
  hide_bizdock_branding?: boolean | null
  /** the workspace's address: primary domain + folder (no trailing /) */
  app_url?: string | null
}

export const TenantContext = createContext<Tenant | null>(null)
