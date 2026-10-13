import type { Permissions } from '@/access/catalog'

export type RoleRow = {
  id: string
  name: string
  description: string | null
  level: number
  is_system: boolean
  permissions: Permissions
}

export type MemberRow = {
  id: string
  user_id: string
  role_id: string
  status: 'active' | 'disabled'
  is_support: boolean
  all_businesses: boolean
  reports_to: string | null
  department: string | null
  designation: string | null
  joined_on: string | null
  permissions: Permissions | null
  created_at: string
  member_businesses: { business_id: string; branch_id: string | null }[]
  // joined in by the api
  name: string
  email: string
  phone: string | null
  last_login: string | null
}

export type BusinessOption = {
  id: string
  name: string
}

export type MemberInput = {
  full_name: string
  email: string
  phone: string
  role_id: string
  reports_to: string | null
  department: string
  designation: string
  joined_on: string
  all_businesses: boolean
  businesses: { business_id: string; branch_id: string | null }[]
}
