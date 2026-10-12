import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { PageHead } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { listMembers, listRoles } from '@/team/api'
import { TeamPanel } from '@/team/TeamPanel'
import type { MemberRow, RoleRow } from '@/team/types'
import { RolesTab } from './RolesTab'

/** Access Control: the Team (people, logins, per-person access) and Roles (what each role sees and does). */
export function AccessControlPage() {
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const canTeam = can('team', 'view')
  const canRoles = can('access', 'edit')
  const tab = (params.get('tab') === 'roles' && canRoles) || !canTeam ? 'roles' : 'team'

  return (
    <>
      <PageHead
        title="Access Control"
        subtitle="Who sees what. Own = records they own · Team = theirs + people who report to them · All = everyone’s."
      />
      {canTeam && canRoles && (
        <div className="seg">
          <button type="button" className={cn(tab === 'team' && 'is-active')} onClick={() => setParams({})}>
            <Users size={15} /> Team
          </button>
          <button
            type="button"
            className={cn(tab === 'roles' && 'is-active')}
            onClick={() => setParams({ tab: 'roles' })}
          >
            <ShieldCheck size={15} /> Roles
          </button>
        </div>
      )}
      {tab === 'team' ? <TeamPanel /> : <RolesPanel />}
    </>
  )
}

function RolesPanel() {
  const tenant = useTenant()
  const { level } = useAuth()
  const [roles, setRoles] = useState<RoleRow[] | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

  const load = useCallback(() => {
    Promise.all([listRoles(tenant.id), listMembers(tenant.id)])
      .then(([r, m]) => {
        setRoles(r.filter((x) => !x.is_system))
        setMembers(m)
      })
      .catch((e: Error) => setNotice({ error: e.message }))
  }, [tenant.id])
  useEffect(load, [load])

  return (
    <>
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      {notice.ok && <div className="alert alert-info">{notice.ok}</div>}
      <div className="panel">
        <div className="panel-bar">
          <b>Roles</b>
          <span className="muted small">
            You can change roles below your level ({level === 0 ? 'Tech Support' : `level ${level}`}).
          </span>
        </div>
        {!roles ? (
          <div className="empty">Loading…</div>
        ) : (
          <RolesTab
            roles={roles}
            members={members}
            myLevel={level}
            tenantId={tenant.id}
            onSaved={(msg) => {
              setNotice({ ok: msg })
              load()
            }}
            onError={(msg) => setNotice({ error: msg })}
          />
        )}
      </div>
    </>
  )
}
