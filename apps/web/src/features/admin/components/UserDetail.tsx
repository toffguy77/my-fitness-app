'use client'

import Image from 'next/image'
import { isApiError, messageForOr } from '@/shared/errors/apiErrors'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { Button, IconButton } from '@/shared/components/ui/Button'
import { Card, CardTitle } from '@/shared/components/ui/Card'
import { ADMIN_FIELD_CLASS, ADMIN_ROW_CLASS, AdminSpinner } from './adminUi'
import { adminApi } from '../api/adminApi'
import type { AdminUser, CuratorLoad } from '../types'
import toast from 'react-hot-toast'

import { t } from '@/shared/i18n'
import { useConfirm } from '@/shared/components/ui'
const ROLE_LABELS: Record<string, string> = {
    client: t('admin.roles.client'),
    coordinator: t('admin.roles.coordinator'),
    super_admin: t('admin.roles.super_admin'),
}

export interface UserDetailProps {
    userId: number
}

/** Месяц вперёд — то, что продаётся; вводится как ГГГГ-ММ-ДД. */
function defaultAccessUntil(): string {
    const day = new Date()
    day.setDate(day.getDate() + 30)
    return day.toISOString().slice(0, 10)
}

/**
 * Три состояния называются прямо. Бессрочное право у живого клиента — признак
 * ошибки выдачи, и молчание о нём скрыло бы именно её.
 */
function accessSummary(user: AdminUser): string {
    if (!user.curator_id) return t('admin.user.accessNone')
    if (!user.curator_access_expires_at) return t('admin.user.accessPerpetual')
    return t('admin.user.accessUntil', { date: user.curator_access_expires_at })
}

export function UserDetail({ userId }: UserDetailProps) {
    const router = useRouter()
    const [user, setUser] = useState<AdminUser | null>(null)
    const [curators, setCurators] = useState<CuratorLoad[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const { confirm, dialog } = useConfirm()
    const [actionLoading, setActionLoading] = useState(false)
    // Дата по умолчанию — месяц вперёд: месячный срок и есть то, что продаётся.
    // Поле обязательно: сервер отвергает выдачу без даты, потому что бессрочное
    // право у живого клиента неотличимо от забытой даты.
    const [accessUntil, setAccessUntil] = useState(defaultAccessUntil)

    useEffect(() => {
        Promise.all([
            adminApi.getUser(userId),
            adminApi.getCurators(),
        ])
            .then(([found, curatorsData]) => {
                setUser(found)
                setCurators(curatorsData)
            })
            .catch((err) => {
                // A missing user is a different situation from a failed load,
                // and the operator needs to be able to tell them apart.
                // Ненайденный пользователь — не то же самое, что неудавшаяся
                // загрузка, и отличить их администратору нужно. Всё остальное
                // сервер объясняет сам.
                setError(isApiError(err) && err.status === 404
                    ? t('admin.user.notFound')
                    : messageForOr(err, t('admin.user.loadFailed')))
            })
            .finally(() => setLoading(false))
    }, [userId])

    const handleChangeRole = (newRole: string) => {
        if (!user) return
        if (user.role === newRole) return

        const demoting = newRole === 'client'

        confirm({
            title: demoting ? t('admin.user.demoteTitle') : t('admin.user.promoteTitle'),
            description: demoting
                ? t('admin.user.demoteConfirm')
                : t('admin.user.promoteConfirm'),
            confirmLabel: demoting ? t('admin.user.demoteAction') : t('admin.user.promoteAction'),
            onConfirm: async () => {
                setActionLoading(true)
                try {
                    await adminApi.changeRole(user.id, newRole)
                    toast.success(t('admin.user.roleChanged'))
                    // Refresh data
                    setUser(await adminApi.getUser(userId))
                    setCurators(await adminApi.getCurators())
                } catch (err) {
                    toast.error(messageForOr(err, t('admin.user.roleChangeFailed')))
                } finally {
                    setActionLoading(false)
                }
            },
        })
    }

    const handleAssignCurator = async (curatorId: number) => {
        if (!user) return
        if (!accessUntil) {
            toast.error(t('admin.user.accessDateRequired'))
            return
        }

        setActionLoading(true)
        try {
            await adminApi.assignCurator(user.id, curatorId, accessUntil)
            toast.success(t('admin.user.curatorAssigned'))
            // Refresh data
            setUser(await adminApi.getUser(userId))
        } catch (err) {
            toast.error(messageForOr(err, t('admin.user.curatorAssignFailed')))
        } finally {
            setActionLoading(false)
        }
    }

    // Продление меняет только дату: куратор и переписка сохраняются, поэтому это
    // отдельная операция, а не повторное назначение того же куратора.
    const handleExtendAccess = async () => {
        if (!user) return
        if (!accessUntil) {
            toast.error(t('admin.user.accessDateRequired'))
            return
        }

        setActionLoading(true)
        try {
            await adminApi.setCuratorAccessExpiry(user.id, accessUntil)
            toast.success(t('admin.user.accessExtended'))
            setUser(await adminApi.getUser(userId))
        } catch (err) {
            toast.error(messageForOr(err, t('admin.user.accessExtendFailed')))
        } finally {
            setActionLoading(false)
        }
    }

    const handleRevokeAccess = () => {
        if (!user) return

        confirm({
            title: t('admin.user.accessRevokeTitle'),
            description: t('admin.user.accessRevokeConfirm'),
            confirmLabel: t('admin.user.accessRevokeAction'),
            onConfirm: async () => {
                setActionLoading(true)
                try {
                    await adminApi.revokeCuratorAccess(user.id)
                    toast.success(t('admin.user.accessRevoked'))
                    setUser(await adminApi.getUser(userId))
                } catch (err) {
                    toast.error(messageForOr(err, t('admin.user.accessRevokeFailed')))
                } finally {
                    setActionLoading(false)
                }
            },
        })
    }

    if (loading) {
        return <AdminSpinner />
    }

    if (error || !user) {
        return <p className="py-8 text-center text-sm text-danger-fg">{error || t('admin.user.notFound')}</p>
    }

    const initials = user.name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()

    const ROLE_OPTIONS = [
        { value: 'client', label: t('admin.roles.client') },
        { value: 'coordinator', label: t('admin.roles.coordinator') },
    ] as const

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3">
                <IconButton
                    variant="ghost"
                    onClick={() => router.push('/admin/users')}
                    aria-label={t('common.back')}
                    className="-ml-2"
                >
                    <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                </IconButton>
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
                    <h1 className="type-title-2 truncate text-fg">{user.name || user.email}</h1>
                    <p className="truncate text-sm text-fg-muted">{user.email}</p>
                </div>
            </div>

            {/* Info card */}
            <Card className="py-2">
                <dl className="divide-y divide-line text-sm">
                    <div className="flex min-h-11 items-center justify-between gap-3">
                        <dt className="text-fg-muted">{t('admin.user.role')}</dt>
                        <dd className="font-medium text-fg">{ROLE_LABELS[user.role] || user.role}</dd>
                    </div>
                    {user.curator_name && (
                        <div className="flex min-h-11 items-center justify-between gap-3">
                            <dt className="text-fg-muted">{t('admin.user.curator')}</dt>
                            <dd className="font-medium text-fg">{user.curator_name}</dd>
                        </div>
                    )}
                    {user.role === 'coordinator' && (
                        <div className="flex min-h-11 items-center justify-between gap-3">
                            <dt className="text-fg-muted">{t('admin.user.clientCount')}</dt>
                            <dd className="font-medium tabular-nums text-fg">{user.client_count}</dd>
                        </div>
                    )}
                    <div className="flex min-h-11 items-center justify-between gap-3">
                        <dt className="text-fg-muted">{t('admin.user.registered')}</dt>
                        <dd className="font-medium tabular-nums text-fg">{new Date(user.created_at).toLocaleDateString('ru-RU')}</dd>
                    </div>
                    {user.last_login_at && (
                        <div className="flex min-h-11 items-center justify-between gap-3">
                            <dt className="text-fg-muted">{t('admin.user.lastLogin')}</dt>
                            <dd className="font-medium tabular-nums text-fg">{new Date(user.last_login_at).toLocaleDateString('ru-RU')}</dd>
                        </div>
                    )}
                </dl>
            </Card>

            {/* Role management (not for super_admin) */}
            {user.role !== 'super_admin' && (
                <Card className="space-y-3">
                    <CardTitle>{t('admin.user.roleManagement')}</CardTitle>
                    {/* Переключатель из двух вариантов — сегменты; текущая роль —
                        инверсия чернилами и не нажимается. */}
                    <div className="flex rounded-full border border-line p-1" role="group">
                        {ROLE_OPTIONS.map((option) => {
                            const current = user.role === option.value
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    disabled={current || actionLoading}
                                    aria-pressed={current}
                                    onClick={() => handleChangeRole(option.value)}
                                    className={cn(
                                        'h-10 flex-1 rounded-full px-4 text-sm font-medium transition-colors',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                                        current
                                            ? 'bg-fg text-fg-inverse'
                                            : 'text-fg-muted hover:text-fg disabled:opacity-50'
                                    )}
                                >
                                    {option.label}
                                </button>
                            )
                        })}
                    </div>
                </Card>
            )}

            {/* Доступ к куратору — платная услуга, поэтому срок виден всегда */}
            {user.role === 'client' && (
                <Card className="space-y-4">
                    <div>
                        <CardTitle>{t('admin.user.accessTitle')}</CardTitle>
                        <p className="mt-1 text-sm tabular-nums text-fg-muted">{accessSummary(user)}</p>
                    </div>

                    <label className="block">
                        <span className="mb-1.5 block text-sm font-medium text-fg-muted">{t('admin.user.accessDateLabel')}</span>
                        <input
                            type="date"
                            value={accessUntil}
                            onChange={(e) => setAccessUntil(e.target.value)}
                            className={ADMIN_FIELD_CLASS}
                        />
                    </label>

                    {user.curator_id && (
                        <div className="flex flex-wrap gap-3">
                            <Button
                                type="button"
                                disabled={actionLoading}
                                onClick={handleExtendAccess}
                                className="flex-1"
                            >
                                {t('admin.user.accessExtend')}
                            </Button>
                            {/* Снятие — после подтверждения; сама кнопка — без подложки. */}
                            <Button
                                type="button"
                                variant="ghost"
                                disabled={actionLoading}
                                onClick={handleRevokeAccess}
                                className="flex-1 text-danger-fg hover:bg-danger-soft"
                            >
                                {t('admin.user.accessRevoke')}
                            </Button>
                        </div>
                    )}
                </Card>
            )}

            {/* Curator assignment (only for clients) */}
            {user.role === 'client' && (
                <section className="space-y-3">
                    <h2 className="type-title-3 text-fg">{t('admin.user.assignCurator')}</h2>
                    {curators.length === 0 ? (
                        <p className="text-sm text-fg-muted">{t('admin.user.noCurators')}</p>
                    ) : (
                        <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                            {curators.map((curator) => {
                                const current = curator.id === user.curator_id
                                return (
                                    <button
                                        key={curator.id}
                                        type="button"
                                        disabled={actionLoading || current}
                                        onClick={() => handleAssignCurator(curator.id)}
                                        className={cn(ADMIN_ROW_CLASS, 'disabled:cursor-default', current && 'bg-subtle hover:bg-subtle')}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="type-headline truncate text-fg">{curator.name}</p>
                                            <p className="text-sm tabular-nums text-fg-muted">{t('admin.user.clientsOf', { count: curator.client_count })}</p>
                                        </div>
                                        {current && (
                                            <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-fg">
                                                <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                                                {t('admin.user.current')}
                                            </span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </section>
            )}

            {dialog}
        </div>
    )
}
