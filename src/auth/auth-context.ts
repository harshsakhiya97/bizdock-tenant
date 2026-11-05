import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Permissions } from '@/access/catalog'

export type Profile = {
  id: string
  email: string | null
  full_name: string | null
  phone: string | null
}


/** This user's membership in the current tenant. */
export type Membership = {
  id: string
  all_businesses: boolean
  is_support: boolean
  /** custom access for this person; null = follows the role */
  permissions: Permissions | null
  role: { name: string; permissions: Permissions; is_system: boolean; level: number }
}

/** a business type's code (Masters → Business types): set once, never changed; the app's rules go by it */
export type SubBusinessType = string
export type SubBusiness = { id: string; business_id: string; name: string; type: SubBusinessType }
/** the built-in codes the app works by */
export const BT = { EDITING: 'EDITING', PAID_PODCAST: 'PAID-PODCAST', STUDIO_RENTAL: 'STUDIO-RENTAL', WEBINAR: 'WEBINAR' } as const
/** a type stored before the codes (editing / podcast / studio_rental) → its code */
const LEGACY: Record<string, string> = { editing: BT.EDITING, podcast: BT.PAID_PODCAST, studio_rental: BT.STUDIO_RENTAL }
export const typeCode = <T extends string | null | undefined>(t: T): T => (t ? LEGACY[t] ?? t : t) as T
/** Masters → Business types: name (shown everywhere, editable) and code (fixed) */
export type BusinessType = { id: string; code: string; name: string; is_system: boolean; is_active: boolean; sort_order: number }
/** a business and its active sub-businesses */
export type Business = { id: string; name: string; subs: SubBusiness[]; /** its own type when it has no sub-businesses */ type: SubBusinessType | null }

export type PermissionAction = string

export type AuthState = {
  session: Session | null
  user: User | null
  profile: Profile | null
  membership: Membership | null
  /** businesses this user can work with in this tenant */
  businesses: Business[]
  /** Masters → Business types (active and not) */
  businessTypes: BusinessType[]
  /** a type's name by its code */
  typeName: (code: string | null | undefined) => string
  loading: boolean
  /** set when someone who isn't a member of this tenant tried to log in */
  accessError: string | null
  /** reloads profile, membership and the business list (e.g. after editing businesses) */
  refreshProfile: () => Promise<void>
  /** permission check for the current user in this tenant */
  can: (module: string, action: PermissionAction) => boolean
  /** whose records this user sees in an area (leads, customers, ...): all / team / own / none */
  scope: (area: string) => 'all' | 'team' | 'own' | 'none'
  /** this user's role level in the tenant (0 Tech Support, 1 Owner, ...). They manage levels above it. */
  level: number
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | undefined>(undefined)
