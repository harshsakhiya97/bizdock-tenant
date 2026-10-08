import { createContext } from 'react'

export type Tenant = {
  id: string
  name: string
  app_name: string
  logo_url: string | null
  favicon_url: string | null
  primary_color: string
}

export const TenantContext = createContext<Tenant | null>(null)
