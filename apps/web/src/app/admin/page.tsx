'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { adminApi, CuratorLoadCard } from '@/features/admin'
import type { CuratorLoad, AdminUser } from '@/features/admin'

export default function AdminDashboardPage() {
    const [curators, setCurators] = useState<CuratorLoad[]>([])
    const [users, setUsers] = useState<AdminUser[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        Promise.all([
            adminApi.getCurators(),
            adminApi.getUsers(),
        ])
            .then(([curatorsData, usersData]) => {
                setCurators(curatorsData)
                setUsers(usersData)
            })
            .catch(() => { /* errors handled per section */ })
            .finally(() => setLoading(false))
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        )
    }

    const totalUsers = users.length
    const totalClients = users.filter((u) => u.role === 'client').length
    const totalCurators = curators.length

    return (
        <div className="px-4 py-6 space-y-6">
            <h1 className="text-xl font-semibold text-gray-900">Панель администратора</h1>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100 text-center">
                    <p className="text-2xl font-bold text-gray-900">{totalUsers}</p>
                    <p className="text-xs text-gray-500">Пользователей</p>
                </div>
                <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100 text-center">
                    <p className="text-2xl font-bold text-blue-600">{totalCurators}</p>
                    <p className="text-xs text-gray-500">Кураторов</p>
                </div>
                <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100 text-center">
                    <p className="text-2xl font-bold text-green-600">{totalClients}</p>
                    <p className="text-xs text-gray-500">Клиентов</p>
                </div>
            </div>

            {/* Curator load */}
            <section>
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Нагрузка кураторов</h2>
                {curators.length === 0 ? (
                    <p className="text-sm text-gray-500">Нет кураторов</p>
                ) : (
                    <div className="space-y-2">
                        {curators.map((curator) => (
                            <CuratorLoadCard key={curator.id} curator={curator} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}
