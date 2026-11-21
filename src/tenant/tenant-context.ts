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
  /** menu pages turned off for this workspace (e.g. '/my-day', '/whatsapp' with everything under it): not in the menu, and opening one goes to the first page in the menu */
  hidden_pages?: string[] | null
  /** opt-in menu pages for this workspace (e.g. '/enrolled-courses'); pages marked optIn in the menu show only when listed here */
  extra_pages?: string[] | null
  /** words this workspace calls differently, e.g. { Product: 'Course' } (see useTerm) */
  labels?: Record<string, string> | null
  /** the workspace's address: primary domain + folder (no trailing /) */
  app_url?: string | null
}

export const TenantContext = createContext<Tenant | null>(null)
