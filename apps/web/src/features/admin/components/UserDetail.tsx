'use client'

import Image from 'next/image'
import { isApiError, messageForOr } from '@/shared/errors/apiErrors'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
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
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        )
    }

    if (error || !user) {
        return <p className="py-8 text-center text-sm text-red-500">{error || t('admin.user.notFound')}</p>
    }

    const initials = user.name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => router.push('/admin/users')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
                    aria-label={t('common.back')}
                >
                    <ArrowLeft className="h-5 w-5 text-gray-700" />
                </button>
                {user.avatar_url ? (
                    <Image
                        src={user.avatar_url}
                        alt={user.name}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-full object-cover"
                    />
                ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
                        {initials || '?'}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <p className="text-lg font-semibold text-gray-900 truncate">{user.name || user.email}</p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                </div>
            </div>

            {/* Info card */}
            <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100 space-y-3">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t('admin.user.role')}</span>
                    <span className="font-medium">{ROLE_LABELS[user.role] || user.role}</span>
                </div>
                {user.curator_name && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t('admin.user.curator')}</span>
                        <span className="font-medium">{user.curator_name}</span>
                    </div>
                )}
                {user.role === 'coordinator' && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t('admin.user.clientCount')}</span>
                        <span className="font-medium">{user.client_count}</span>
                    </div>
                )}
                <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t('admin.user.registered')}</span>
                    <span className="font-medium">{new Date(user.created_at).toLocaleDateString('ru-RU')}</span>
                </div>
                {user.last_login_at && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t('admin.user.lastLogin')}</span>
                        <span className="font-medium">{new Date(user.last_login_at).toLocaleDateString('ru-RU')}</span>
                    </div>
                )}
            </div>

            {/* Role management (not for super_admin) */}
            {user.role !== 'super_admin' && (
                <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900">{t('admin.user.roleManagement')}</h3>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={user.role === 'client' || actionLoading}
                            onClick={() => handleChangeRole('client')}
                            className={cn(
                                'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                user.role === 'client'
                                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            )}
                        >
                            {t('admin.roles.client')}
                        </button>
                        <button
                            type="button"
                            disabled={user.role === 'coordinator' || actionLoading}
                            onClick={() => handleChangeRole('coordinator')}
                            className={cn(
                                'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                user.role === 'coordinator'
                                    ? 'bg-blue-200 text-blue-700 cursor-not-allowed'
                                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            )}
                        >
                            {t('admin.roles.coordinator')}
                        </button>
                    </div>
                </div>
            )}

            {/* Доступ к куратору — платная услуга, поэтому срок виден всегда */}
            {user.role === 'client' && (
                <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900">{t('admin.user.accessTitle')}</h3>
                    <p className="text-sm text-gray-600">{accessSummary(user)}</p>

                    <label className="block space-y-1">
                        <span className="text-xs font-medium text-gray-500">{t('admin.user.accessDateLabel')}</span>
                        <input
                            type="date"
                            value={accessUntil}
                            onChange={(e) => setAccessUntil(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        />
                    </label>

                    {user.curator_id && (
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={actionLoading}
                                onClick={handleExtendAccess}
                                className="flex-1 rounded-lg bg-blue-100 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-200 disabled:opacity-50"
                            >
                                {t('admin.user.accessExtend')}
                            </button>
                            <button
                                type="button"
                                disabled={actionLoading}
                                onClick={handleRevokeAccess}
                                className="flex-1 rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
                            >
                                {t('admin.user.accessRevoke')}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Curator assignment (only for clients) */}
            {user.role === 'client' && (
                <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900">{t('admin.user.assignCurator')}</h3>
                    {curators.length === 0 ? (
                        <p className="text-sm text-gray-500">{t('admin.user.noCurators')}</p>
                    ) : (
                        <div className="space-y-2">
                            {curators.map((curator) => (
                                <button
                                    key={curator.id}
                                    type="button"
                                    disabled={actionLoading || curator.id === user.curator_id}
                                    onClick={() => handleAssignCurator(curator.id)}
                                    className={cn(
                                        'w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors',
                                        curator.id === user.curator_id
                                            ? 'bg-blue-50 border border-blue-200'
                                            : 'hover:bg-gray-50 border border-gray-100'
                                    )}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{curator.name}</p>
                                        <p className="text-xs text-gray-500">{t('admin.user.clientsOf', { count: curator.client_count })}</p>
                                    </div>
                                    {curator.id === user.curator_id && (
                                        <span className="text-xs font-medium text-blue-600">{t('admin.user.current')}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {dialog}
        </div>
    )
}
