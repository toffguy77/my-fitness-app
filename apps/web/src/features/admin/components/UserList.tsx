'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { adminApi } from '../api/adminApi'
import type { AdminUser } from '../types'

const ROLE_LABELS: Record<string, string> = {
    client: 'Клиент',
    coordinator: 'Куратор',
    super_admin: 'Админ',
}

const ROLE_COLORS: Record<string, string> = {
    client: 'bg-gray-100 text-gray-700',
    coordinator: 'bg-blue-100 text-blue-700',
    super_admin: 'bg-purple-100 text-purple-700',
}

export function UserList() {
    const router = useRouter()
    const [users, setUsers] = useState<AdminUser[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [roleFilter, setRoleFilter] = useState<string>('all')

    useEffect(() => {
        adminApi.getUsers()
            .then(setUsers)
            .catch(() => setError('Не удалось загрузить пользователей'))
            .finally(() => setLoading(false))
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        )
    }

    if (error) {
        return <p className="py-8 text-center text-sm text-red-500">{error}</p>
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
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Поиск по имени или email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                </div>
                <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                    <option value="all">Все роли</option>
                    <option value="client">Клиенты</option>
                    <option value="coordinator">Кураторы</option>
                    <option value="super_admin">Админы</option>
                </select>
            </div>

            <p className="text-xs text-gray-500">{filtered.length} из {users.length} пользователей</p>

            {/* User list */}
            {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">Пользователи не найдены</p>
            ) : (
                <div className="space-y-2">
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
                                className={cn(
                                    'w-full rounded-xl bg-white p-4 shadow-sm border border-gray-100',
                                    'text-left transition-shadow hover:shadow-md',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2'
                                )}
                            >
                                <div className="flex items-center gap-3">
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
                                        <p className="text-sm font-semibold text-gray-900 truncate">
                                            {user.name || user.email}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                                    </div>
                                    <span className={cn(
                                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                        ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-700'
                                    )}>
                                        {ROLE_LABELS[user.role] || user.role}
                                    </span>
                                </div>
                                {user.curator_name && (
                                    <p className="mt-2 text-xs text-gray-500">
                                        Куратор: {user.curator_name}
                                    </p>
                                )}
                                {user.role === 'coordinator' && user.client_count > 0 && (
                                    <p className="mt-2 text-xs text-gray-500">
                                        Клиентов: {user.client_count}
                                    </p>
                                )}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
