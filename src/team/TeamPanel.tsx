import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, KeyRound, Pencil, Plus, Power, ShieldCheck } from 'lucide-react'
import { PersonAccessDrawer } from '@/access/PersonAccessDrawer'
import { useAuth } from '@/auth/useAuth'
import { Avatar } from '@/components/Avatar'
import { PasswordInput } from '@/components/Field'
import { ConfirmModal, DataTable, SearchInput, type Column } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import {
  getDefaultPassword,
  listBusinessOptions,
  listMembers,
  listRoles,
  resetMemberPassword,
  saveDefaultPassword,
  setMemberStatus,
} from './api'
import { MemberDrawer } from './MemberDrawer'
import { ago, fmtDate } from './time'
import type { BusinessOption, MemberRow, RoleRow } from './types'
import { Flash } from '@/components/Flash'

const TABS = ['Active', 'Inactive', 'All'] as const
type Tab = (typeof TABS)[number]

type Confirm = { kind: 'reset' | 'status'; member: MemberRow }

/** The Team tab of Access Control: members, logins, role, businesses and per-person access. */
export function TeamPanel() {
  const tenant = useTenant()
  const { can, level, membership } = useAuth()
  const [members, setMembers] = useState<MemberRow[] | null>(null)
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [businesses, setBusinesses] = useState<BusinessOption[]>([])
  const [defaultPassword, setDefaultPassword] = useState('')
  const [pwDraft, setPwDraft] = useState('')
  const [tab, setTab] = useState<Tab>('Active')
  const [query, setQuery] = useState('')
  const [drawer, setDrawer] = useState<{ member: MemberRow | null } | null>(null)
  const [accessFor, setAccessFor] = useState<MemberRow | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const [busy, setBusy] = useState(false)

  const canAdd = can('team', 'add')
  const canEdit = can('team', 'edit')
  const canAccess = can('access', 'edit')

  const load = useCallback(() => {
    Promise.all([listMembers(tenant.id), listRoles(tenant.id), listBusinessOptions(tenant.id)])
      .then(([m, r, b]) => {
        setMembers(m)
        setRoles(r)
        setBusinesses(b)
      })
      .catch((e: Error) => setNotice({ error: e.message }))
  }, [tenant.id])
  useEffect(load, [load])

  useEffect(() => {
    if (!canAdd) return
    void getDefaultPassword(tenant.id).then((p) => {
      setDefaultPassword(p)
      setPwDraft(p)
    })
  }, [tenant.id, canAdd])

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])
  const memberById = useMemo(() => new Map((members ?? []).map((m) => [m.id, m])), [members])
  const businessById = useMemo(() => new Map(businesses.map((b) => [b.id, b])), [businesses])

  const counts = {
    Active: members?.filter((m) => m.status === 'active').length ?? 0,
    Inactive: members?.filter((m) => m.status !== 'active').length ?? 0,
    All: members?.length ?? 0,
  }
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (members ?? [])
      .filter((m) => (tab === 'All' ? true : tab === 'Active' ? m.status === 'active' : m.status !== 'active'))
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.phone ?? '').includes(q))
  }, [members, tab, query])

  /** I can change people whose role sits below my level (never myself). */
  const below = (m: MemberRow) => m.id !== membership?.id && (roleById.get(m.role_id)?.level ?? 0) > level
  const canManage = (m: MemberRow) => canEdit && below(m)

  function businessText(m: MemberRow) {
    if (m.all_businesses) return <span className="badge badge-muted">All businesses</span>
    if (!m.member_businesses.length) return <span className="muted">—</span>
    return (
      <div className="stack" style={{ gap: 2 }}>
        {m.member_businesses.map((mb) => {
          const b = businessById.get(mb.business_id)
          return (
            <span key={mb.business_id} className="nowrap">
              {b?.name ?? 'Archived business'}
              {mb.sub_business_ids?.length ? (
                <span className="muted small"> · {mb.sub_business_ids.map((id) => b?.subs.find((x) => x.id === id)?.name).filter(Boolean).join(', ')}</span>
              ) : null}
            </span>
          )
        })}
      </div>
    )
  }

  const columns: Column<MemberRow>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (m) => (
        <div className="cell-main">
          <Avatar name={m.name} size={32} />
          <div>
            <span className="strong">{m.name}</span>
            <small>{m.email}</small>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      render: (m) => {
        const r = roleById.get(m.role_id)
        return (
          <>
            <span className="badge badge-brand">{r?.name ?? '—'}</span>
            {m.permissions && <span className="chip-tag badge-warning">Custom</span>}
            {(m.department || m.designation) && (
              <div className="muted small" style={{ marginTop: 3 }}>
                {[m.department, m.designation].filter(Boolean).join(' / ')}
              </div>
            )}
          </>
        )
      },
    },
    { key: 'biz', label: 'Businesses', render: businessText },
    {
      key: 'reports',
      label: 'Reports to',
      render: (m) => (m.reports_to ? (memberById.get(m.reports_to)?.name ?? '—') : <span className="muted">—</span>),
    },
    { key: 'phone', label: 'Phone', render: (m) => <span className="nowrap">{m.phone || '—'}</span> },
    { key: 'joined', label: 'Joined', render: (m) => <span className="muted nowrap">{fmtDate(m.joined_on)}</span> },
    { key: 'login', label: 'Last login', render: (m) => <span className="muted nowrap">{ago(m.last_login)}</span> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (m) =>
        canManage(m) || (canAccess && below(m)) ? (
          <div className="row-actions">
            {canAccess && below(m) && (
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                title="Access (role, reports to, custom access)"
                aria-label={`Access for ${m.name}`}
                onClick={() => setAccessFor(m)}
              >
                <ShieldCheck size={15} />
              </button>
            )}
            {canManage(m) && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  title="Edit"
                  aria-label={`Edit ${m.name}`}
                  onClick={() => setDrawer({ member: m })}
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  title="Reset password to default"
                  aria-label={`Reset password for ${m.name}`}
                  onClick={() => setConfirm({ kind: 'reset', member: m })}
                >
                  <KeyRound size={15} />
                </button>
                <button
                  type="button"
                  className={cn('btn btn-ghost btn-icon', m.status === 'active' && 'danger-text')}
                  title={m.status === 'active' ? 'Deactivate' : 'Activate'}
                  aria-label={`${m.status === 'active' ? 'Deactivate' : 'Activate'} ${m.name}`}
                  onClick={() => setConfirm({ kind: 'status', member: m })}
                >
                  <Power size={15} />
                </button>
              </>
            )}
          </div>
        ) : null,
    },
  ]

  function exportCsv() {
    const rows = [
      ['Name', 'Email', 'Phone', 'Role', 'Department', 'Designation', 'Reports to', 'Status', 'Joined'],
      ...visible.map((m) => [
        m.name,
        m.email,
        m.phone ?? '',
        roleById.get(m.role_id)?.name ?? '',
        m.department ?? '',
        m.designation ?? '',
        m.reports_to ? (memberById.get(m.reports_to)?.name ?? '') : '',
        m.status === 'active' ? 'Active' : 'Inactive',
        m.joined_on ?? '',
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `${tenant.app_name} team.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function runConfirm() {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm.kind === 'reset') {
        await resetMemberPassword(tenant.id, confirm.member.id)
        setNotice({ ok: `${confirm.member.name}'s password is now the default password.` })
      } else {
        const next = confirm.member.status === 'active' ? 'disabled' : 'active'
        await setMemberStatus(confirm.member.id, next)
        setNotice({ ok: `${confirm.member.name} ${next === 'active' ? 'activated' : 'deactivated'}.` })
        load()
      }
    } catch (e) {
      setNotice({ error: (e as Error).message })
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  async function savePassword() {
    if (pwDraft.length < 6) return setNotice({ error: 'The default password must be at least 6 characters.' })
    try {
      await saveDefaultPassword(tenant.id, pwDraft)
      setDefaultPassword(pwDraft)
      setNotice({ ok: 'Default password saved.' })
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }

  return (
    <>
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      <div className="panel">
        <div className="panel-bar">
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t} type="button" className={cn('tab', tab === t && 'is-active')} onClick={() => setTab(t)}>
                {t} <span className="muted small">{counts[t]}</span>
              </button>
            ))}
          </div>
          <div className="row">
            <SearchInput placeholder="Search name, email, phone" value={query} onChange={setQuery} width={230} />
            <button type="button" className="btn btn-outline" onClick={exportCsv} disabled={!visible.length}>
              <Download size={15} /> Login list (CSV)
            </button>
            {canAdd && (
              <button type="button" className="btn btn-primary" onClick={() => setDrawer({ member: null })}>
                <Plus size={16} /> Add team member
              </button>
            )}
          </div>
        </div>
        {!members ? (
          <div className="empty">Loading team…</div>
        ) : (
          <DataTable
            bare
            columns={columns}
            rows={visible}
            empty={
              query ? (
                'No one matches your search.'
              ) : tab === 'Inactive' ? (
                'No inactive members.'
              ) : (
                'No team members yet. Add your first one.'
              )
            }
          />
        )}
      </div>

      {canAdd && (
        <div className="card card-pad stack" style={{ gap: 10 }}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <span className="field-label" style={{ margin: 0 }}>
              Default password for new logins
            </span>
            <div style={{ width: 220 }}>
              <PasswordInput value={pwDraft} onChange={(e) => setPwDraft(e.target.value)} placeholder="At least 6 characters" />
            </div>
            <button
              type="button"
              className="btn btn-dark"
              onClick={savePassword}
              disabled={!pwDraft || pwDraft === defaultPassword}
            >
              Save
            </button>
          </div>
          <p className="muted small" style={{ lineHeight: 1.5 }}>
            New members log in with their email and this password, and are asked to change it on My Profile. Use the
            key button on a row to set someone’s password back to this one. Roles decide what each person can see; use
            the shield button to change one person’s access.
          </p>
        </div>
      )}

      {accessFor && (
        <PersonAccessDrawer
          member={accessFor}
          roles={roles.filter((r) => !r.is_system && r.level > level)}
          members={members ?? []}
          onClose={() => setAccessFor(null)}
          onSaved={() => {
            setNotice({ ok: `${accessFor.name}'s access saved.` })
            setAccessFor(null)
            load()
          }}
        />
      )}

      {drawer && (
        <MemberDrawer
          member={drawer.member}
          roles={roles}
          members={members ?? []}
          businesses={businesses}
          defaultPassword={defaultPassword}
          onClose={() => setDrawer(null)}
          onSaved={(msg) => {
            setDrawer(null)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}

      <ConfirmModal
        open={!!confirm}
        icon={confirm?.kind === 'reset' ? KeyRound : Power}
        danger={confirm?.kind === 'status' && confirm.member.status === 'active'}
        title={
          confirm?.kind === 'reset'
            ? `Reset ${confirm.member.name}'s password?`
            : confirm?.member.status === 'active'
              ? `Deactivate ${confirm.member.name}?`
              : `Activate ${confirm?.member.name ?? ''}?`
        }
        message={
          confirm?.kind === 'reset'
            ? 'Their password becomes the default password for new logins. They’ll be asked to change it.'
            : confirm?.member.status === 'active'
              ? 'They can no longer log in to this workspace. Their records stay; you can activate them again.'
              : 'They can log in to this workspace again.'
        }
        confirmLabel={
          busy ? 'Please wait…' : confirm?.kind === 'reset' ? 'Reset password' : confirm?.member.status === 'active' ? 'Deactivate' : 'Activate'
        }
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirm}
      />
    </>
  )
}
