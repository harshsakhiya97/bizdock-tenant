import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'
import { AuthContext, type Business, type Membership, type PermissionAction, type Profile, type SubBusiness } from './auth-context'

type MemberRow = {
  id: string
  all_businesses: boolean
  is_support: boolean
  permissions: Membership['permissions']
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
        .select('id, all_businesses, is_support, permissions, roles(name, permissions, is_system, level)')
        .eq('tenant_id', tenant.id)
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle<MemberRow>()

      if (!member || !member.roles) {
        setAccessError(`This account doesn't have access to ${tenant.app_name}.`)
        await db().auth.signOut()
        return clear()
      }

      const [{ data: prof }, { data: bizRows }, { data: allowed }, { data: subRows }] = await Promise.all([
        db().from('profiles').select('id, email, full_name, phone').eq('id', userId).maybeSingle<Profile>(),
        db().from('businesses').select('id, name, type').eq('tenant_id', tenant.id).eq('is_active', true).order('sort_order'),
        member.all_businesses
          ? Promise.resolve({ data: null })
          : db().from('member_businesses').select('business_id, sub_business_ids').eq('member_id', member.id),
        db().from('sub_businesses').select('id, business_id, name, type').eq('tenant_id', tenant.id).eq('is_active', true).order('sort_order'),
      ])

      // business → allowed sub-business ids (null = all of them)
      const allowedMap = allowed
        ? new Map((allowed as { business_id: string; sub_business_ids: string[] | null }[]).map((r) => [r.business_id, r.sub_business_ids?.length ? r.sub_business_ids : null]))
        : null
      const subs = (subRows ?? []) as SubBusiness[]
      const list: Business[] = ((bizRows ?? []) as { id: string; name: string; type: SubBusiness['type'] | null }[])
        .filter((b) => !allowedMap || allowedMap.has(b.id))
        .map((b) => {
          const only = allowedMap?.get(b.id)
          return { ...b, subs: subs.filter((s) => s.business_id === b.id && (!only || only.includes(s.id))) }
        })

      setAccessError(null)
      setProfile(prof ?? null)
      setMembership({
        id: member.id,
        all_businesses: member.all_businesses,
        is_support: member.is_support,
        permissions: member.permissions,
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
      // Tech Support Team, system roles and the Owner (level 1) can do everything
      if (membership.is_support || membership.role.is_system || membership.role.level <= 1) return true
      const p = membership.permissions ?? membership.role.permissions
      if (action !== 'view' && p?.mode?.view_only) return false
      return Boolean(p?.[module]?.[action])
    },
    [membership],
  )

  const scope = useCallback(
    (area: string) => {
      if (!membership) return 'none' as const
      if (membership.is_support || membership.role.is_system || membership.role.level <= 1) return 'all' as const
      const p = membership.permissions ?? membership.role.permissions
      return (p?.scope?.[area] as 'all' | 'team' | 'own' | 'none' | undefined) ?? 'none'
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
      scope,
      level: membership ? (membership.is_support ? 0 : membership.role.level) : Number.MAX_SAFE_INTEGER,
      signOut: async () => {
        await db().auth.signOut()
      },
    }),
    [session, profile, membership, businesses, loading, accessError, loadUser, can, scope],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
