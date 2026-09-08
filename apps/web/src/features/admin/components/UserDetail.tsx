'use client'

import { isApiError } from '@/shared/errors/apiErrors'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { adminApi } from '../api/adminApi'
import type { AdminUser, CuratorLoad } from '../types'
import toast from 'react-hot-toast'

import { t } from '@/shared/i18n'
const ROLE_LABELS: Record<string, string> = {
    client: t('admin.roles.client'),
    coordinator: t('admin.roles.coordinator'),
    super_admin: t('admin.roles.super_admin'),
}

export interface UserDetailProps {
    userId: number
}

export function UserDetail({ userId }: UserDetailProps) {
    const router = useRouter()
    const [user, setUser] = useState<AdminUser | null>(null)
    const [curators, setCurators] = useState<CuratorLoad[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState(false)

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
                setError(isApiError(err) && err.status === 404
                    ? t('admin.user.notFound')
                    : t('admin.user.loadFailed'))
            })
            .finally(() => setLoading(false))
    }, [userId])

    const handleChangeRole = async (newRole: string) => {
        if (!user) return
        if (user.role === newRole) return

        const confirmMsg = newRole === 'client'
            ? t('admin.user.demoteConfirm')
            : t('admin.user.promoteConfirm')

        if (!confirm(confirmMsg)) return

        setActionLoading(true)
        try {
            await adminApi.changeRole(user.id, newRole)
            toast.success(t('admin.user.roleChanged'))
            // Refresh data
            setUser(await adminApi.getUser(userId))
            setCurators(await adminApi.getCurators())
        } catch {
            toast.error(t('admin.user.roleChangeFailed'))
        } finally {
            setActionLoading(false)
        }
    }

    const handleAssignCurator = async (curatorId: number) => {
        if (!user) return

        setActionLoading(true)
        try {
            await adminApi.assignCurator(user.id, curatorId)
            toast.success(t('admin.user.curatorAssigned'))
            // Refresh data
            setUser(await adminApi.getUser(userId))
        } catch {
            toast.error(t('admin.user.curatorAssignFailed'))
        } finally {
            setActionLoading(false)
        }
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
                    <img
                        src={user.avatar_url}
                        alt={user.name}
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
        </div>
    )
}
