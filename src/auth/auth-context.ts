import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type Profile = {
  id: string
  email: string | null
  full_name: string | null
  phone: string | null
}

export type Permissions = Record<string, { view?: boolean; add?: boolean; edit?: boolean; delete?: boolean }>

/** This user's membership in the current tenant. */
export type Membership = {
  id: string
  all_businesses: boolean
  is_support: boolean
  role: { name: string; permissions: Permissions; is_system: boolean }
}

export type Business = { id: string; name: string }

export type PermissionAction = 'view' | 'add' | 'edit' | 'delete'

export type AuthState = {
  session: Session | null
  user: User | null
  profile: Profile | null
  membership: Membership | null
  /** businesses this user can work with in this tenant */
  businesses: Business[]
  loading: boolean
  /** set when someone who isn't a member of this tenant tried to log in */
  accessError: string | null
  /** reloads profile, membership and the business list (e.g. after editing businesses) */
  refreshProfile: () => Promise<void>
  /** permission check for the current user in this tenant */
  can: (module: string, action: PermissionAction) => boolean
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | undefined>(undefined)
