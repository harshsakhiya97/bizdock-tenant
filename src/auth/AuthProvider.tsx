import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'
import { AuthContext, type Business, type Membership, type PermissionAction, type Profile } from './auth-context'

type MemberRow = {
  id: string
  all_businesses: boolean
  is_support: boolean
  roles: Membership['role'] | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const tenant = useTenant()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState<string | null>(null)

  const clear = useCallback(() => {
    setSession(null)
    setProfile(null)
    setMembership(null)
    setBusinesses([])
  }, [])

  /** Loads profile, membership and businesses. Signs out anyone who isn't a member of this tenant. */
  const loadUser = useCallback(
    async (next: Session | null) => {
      if (!next) return clear()
      const userId = next.user.id

      const { data: member } = await db()
        .from('tenant_members')
        .select('id, all_businesses, is_support, roles(name, permissions, is_system)')
        .eq('tenant_id', tenant.id)
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle<MemberRow>()

      if (!member || !member.roles) {
        setAccessError(`This account doesn't have access to ${tenant.app_name}.`)
        await db().auth.signOut()
        return clear()
      }

      const [{ data: prof }, { data: bizRows }, { data: allowed }] = await Promise.all([
        db().from('profiles').select('id, email, full_name, phone').eq('id', userId).maybeSingle<Profile>(),
        db().from('businesses').select('id, name').eq('tenant_id', tenant.id).eq('is_active', true).order('sort_order'),
        member.all_businesses
          ? Promise.resolve({ data: null })
          : db().from('member_businesses').select('business_id').eq('member_id', member.id),
      ])

      const allowedIds = allowed ? new Set(allowed.map((r: { business_id: string }) => r.business_id)) : null
      const list = ((bizRows ?? []) as Business[]).filter((b) => !allowedIds || allowedIds.has(b.id))

      setAccessError(null)
      setProfile(prof ?? null)
      setMembership({
        id: member.id,
        all_businesses: member.all_businesses,
        is_support: member.is_support,
        role: member.roles,
      })
      setBusinesses(list)
      setSession(next)
    },
    [tenant.id, tenant.app_name, clear],
  )

  useEffect(() => {
    db()
      .auth.getSession()
      .then(async ({ data }) => {
        await loadUser(data.session)
        setLoading(false)
      })
    const { data: sub } = db().auth.onAuthStateChange((event, next) => {
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (next) setSession(next)
        return
      }
      // run outside the auth callback (Supabase recommendation)
      setTimeout(() => void loadUser(next), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadUser])

  const can = useCallback(
    (module: string, action: PermissionAction) => {
      if (!membership) return false
      // Tech Support Team (and other system roles) can do everything
      if (membership.is_support || membership.role.is_system) return true
      return Boolean(membership.role.permissions?.[module]?.[action])
    },
    [membership],
  )

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      membership,
      businesses,
      loading,
      accessError,
      refreshProfile: () => loadUser(session),
      can,
      signOut: async () => {
        await db().auth.signOut()
      },
    }),
    [session, profile, membership, businesses, loading, accessError, loadUser, can],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
