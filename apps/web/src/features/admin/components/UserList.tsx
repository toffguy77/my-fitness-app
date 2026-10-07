'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Search } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { ADMIN_FIELD_CLASS, ADMIN_ROW_CLASS, AdminSpinner } from './adminUi'
import { adminApi } from '../api/adminApi'
import type { AdminUser } from '../types'

import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'
const ROLE_LABELS: Record<string, string> = {
    client: t('admin.roles.client'),
    coordinator: t('admin.roles.coordinator'),
    super_admin: t('admin.roles.super_admin'),
}

/**
 * Роль — категория, а не оценка: клиент нейтрален, куратор — сведение,
 * администратор — предупреждение о повышенных правах.
 */
const ROLE_COLORS: Record<string, string> = {
    client: 'bg-subtle text-fg-muted',
    coordinator: 'bg-info-soft text-info-fg',
    super_admin: 'bg-warning-soft text-warning-fg',
}

const PAGE_SIZE = 50

export function UserList() {
    const router = useRouter()
    const [users, setUsers] = useState<AdminUser[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [roleFilter, setRoleFilter] = useState<string>('all')

    const [total, setTotal] = useState(0)
    const [loadingMore, setLoadingMore] = useState(false)

    useEffect(() => {
        adminApi.getUsers({ limit: PAGE_SIZE, offset: 0 })
            .then((page) => {
                setUsers(page.items)
                setTotal(page.total)
            })
            .catch((err) => setError(messageForOr(err, t('admin.users.loadFailed'))))
            .finally(() => setLoading(false))
    }, [])

    // The list is paginated now: it used to load every user at once, joined
    // against an aggregate over every refresh token ever issued.
    const loadMore = async () => {
        setLoadingMore(true)
        try {
            const page = await adminApi.getUsers({ limit: PAGE_SIZE, offset: users.length })
            setUsers((current) => [...current, ...page.items])
            setTotal(page.total)
        } catch (err) {
            setError(messageForOr(err, t('admin.users.loadFailed')))
        } finally {
            setLoadingMore(false)
        }
    }

    if (loading) {
        return <AdminSpinner />
    }

    if (error) {
        return <p className="py-8 text-center text-sm text-danger-fg">{error}</p>
    }

    const filtered = users.filter((u) => {
        const matchesSearch = search === '' ||
            u.name.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase())
        const matchesRole = roleFilter === 'all' || u.role === roleFilter
        return matchesSearch && matchesRole
    })

    return (
        <div className="space-y-4">
            {/* Search and filter */}
            <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                    <Input
                        type="search"
                        placeholder={t('admin.users.searchPlaceholder')}
                        aria-label={t('admin.users.searchPlaceholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-11"
                    />
                </div>
                <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className={cn(ADMIN_FIELD_CLASS, 'sm:w-48')}
                >
                    <option value="all">{t('admin.users.allRoles')}</option>
                    <option value="client">{t('admin.users.clients')}</option>
                    <option value="coordinator">{t('admin.users.curators')}</option>
                    <option value="super_admin">{t('admin.users.admins')}</option>
                </select>
            </div>

            <p className="text-sm tabular-nums text-fg-muted">{t('admin.users.countOf', { shown: filtered.length, total: users.length })}</p>

            {/* User list */}
            {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-fg-muted">{t('admin.users.notFound')}</p>
            ) : (
                <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                    {filtered.map((user) => {
                        const initials = user.name
                            .split(' ')
                            .map((p) => p[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()

                        return (
                            <button
                                key={user.id}
                                type="button"
                                onClick={() => router.push(`/admin/users/${user.id}`)}
                                className={ADMIN_ROW_CLASS}
                            >
                                {user.avatar_url ? (
                                    <Image
                                        src={user.avatar_url}
                                        alt={user.name}
                                        width={40}
                                        height={40}
                                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-subtle text-sm font-semibold text-fg-muted" aria-hidden="true">
                                        {initials || '?'}
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="type-headline truncate text-fg">
                                        {user.name || user.email}
                                    </p>
                                    <p className="truncate text-sm text-fg-muted">{user.email}</p>
                                    {user.curator_name && (
                                        <p className="text-[13px] text-fg-subtle">
                                            {t('admin.users.curatorOf', { name: user.curator_name })}
                                        </p>
                                    )}
                                    {user.role === 'coordinator' && user.client_count > 0 && (
                                        <p className="text-[13px] tabular-nums text-fg-subtle">
                                            {t('admin.users.clientCount', { count: user.client_count })}
                                        </p>
                                    )}
                                </div>
                                <span className={cn(
                                    'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                                    ROLE_COLORS[user.role] || 'bg-subtle text-fg-muted'
                                )}>
                                    {ROLE_LABELS[user.role] || user.role}
                                </span>
                                <ChevronRight className="h-5 w-5 shrink-0 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                            </button>
                        )
                    })}
                </div>
            )}

            {users.length < total && (
                <div className="mt-6 text-center">
                    <p className="mb-2 text-sm tabular-nums text-fg-muted">
                        {t('admin.users.shownOf', { shown: users.length, total })}
                    </p>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={loadMore}
                        disabled={loadingMore}
                    >
                        {loadingMore ? t('admin.users.loadingMore') : t('admin.users.showMore')}
                    </Button>
                </div>
            )}
        </div>
    )
}
