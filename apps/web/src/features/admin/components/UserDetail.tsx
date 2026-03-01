'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { adminApi } from '../api/adminApi'
import type { AdminUser, CuratorLoad } from '../types'
import toast from 'react-hot-toast'

const ROLE_LABELS: Record<string, string> = {
    client: 'Клиент',
    coordinator: 'Куратор',
    super_admin: 'Админ',
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
            adminApi.getUsers(),
            adminApi.getCurators(),
        ])
            .then(([users, curatorsData]) => {
                const found = users.find((u) => u.id === userId)
                if (!found) {
                    setError('Пользователь не найден')
                } else {
                    setUser(found)
                }
                setCurators(curatorsData)
            })
            .catch(() => setError('Не удалось загрузить данные'))
            .finally(() => setLoading(false))
    }, [userId])

    const handleChangeRole = async (newRole: string) => {
        if (!user) return
        if (user.role === newRole) return

        const confirmMsg = newRole === 'client'
            ? 'Снять роль куратора? Все клиенты будут перераспределены.'
            : 'Назначить пользователя куратором?'

        if (!confirm(confirmMsg)) return

        setActionLoading(true)
        try {
            await adminApi.changeRole(user.id, newRole)
            toast.success('Роль изменена')
            // Refresh data
            const users = await adminApi.getUsers()
            const found = users.find((u) => u.id === userId)
            if (found) setUser(found)
            const curatorsData = await adminApi.getCurators()
            setCurators(curatorsData)
        } catch {
            toast.error('Не удалось изменить роль')
        } finally {
            setActionLoading(false)
        }
    }

    const handleAssignCurator = async (curatorId: number) => {
        if (!user) return

        setActionLoading(true)
        try {
            await adminApi.assignCurator(user.id, curatorId)
            toast.success('Куратор назначен')
            // Refresh data
            const users = await adminApi.getUsers()
            const found = users.find((u) => u.id === userId)
            if (found) setUser(found)
        } catch {
            toast.error('Не удалось назначить куратора')
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
        return <p className="py-8 text-center text-sm text-red-500">{error || 'Пользователь не найден'}</p>
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
                    aria-label="Назад"
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
                    <span className="text-gray-500">Роль</span>
                    <span className="font-medium">{ROLE_LABELS[user.role] || user.role}</span>
                </div>
                {user.curator_name && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Куратор</span>
                        <span className="font-medium">{user.curator_name}</span>
                    </div>
                )}
                {user.role === 'coordinator' && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Клиентов</span>
                        <span className="font-medium">{user.client_count}</span>
                    </div>
                )}
                <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Регистрация</span>
                    <span className="font-medium">{new Date(user.created_at).toLocaleDateString('ru-RU')}</span>
                </div>
                {user.last_login_at && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Последний вход</span>
                        <span className="font-medium">{new Date(user.last_login_at).toLocaleDateString('ru-RU')}</span>
                    </div>
                )}
            </div>

            {/* Role management (not for super_admin) */}
            {user.role !== 'super_admin' && (
                <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900">Управление ролью</h3>
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
                            Клиент
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
                            Куратор
                        </button>
                    </div>
                </div>
            )}

            {/* Curator assignment (only for clients) */}
            {user.role === 'client' && (
                <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900">Назначить куратора</h3>
                    {curators.length === 0 ? (
                        <p className="text-sm text-gray-500">Нет доступных кураторов</p>
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
                                        <p className="text-xs text-gray-500">{curator.client_count} клиентов</p>
                                    </div>
                                    {curator.id === user.curator_id && (
                                        <span className="text-xs font-medium text-blue-600">Текущий</span>
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
