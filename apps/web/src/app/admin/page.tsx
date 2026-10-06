'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Loader2 } from 'lucide-react'
import { adminApi, CuratorLoadCard } from '@/features/admin'
import type { CuratorLoad, AdminUser } from '@/features/admin'

import { t } from '@/shared/i18n'
export default function AdminDashboardPage() {
    const [curators, setCurators] = useState<CuratorLoad[]>([])
    const [users, setUsers] = useState<AdminUser[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        Promise.all([
            adminApi.getCurators(),
            // The dashboard shows counts and a recent slice, not the whole
            // table, so it asks for a page.
            adminApi.getUsers({ limit: 50 }),
        ])
            .then(([curatorsData, usersPage]) => {
                setCurators(curatorsData)
                setUsers(usersPage.items)
            })
            .catch(() => { /* errors handled per section */ })
            .finally(() => setLoading(false))
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-fg-subtle" />
            </div>
        )
    }

    const totalUsers = users.length
    const totalClients = users.filter((u) => u.role === 'client').length
    const totalCurators = curators.length

    return (
        <div className="px-4 py-6 space-y-6">
            <h1 className="text-xl font-semibold text-fg">{t('admin.dashboard.heading')}</h1>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-surface p-4 shadow-sm border border-line text-center">
                    <p className="text-2xl font-bold text-fg">{totalUsers}</p>
                    <p className="text-xs text-fg-muted">{t('admin.dashboard.users')}</p>
                </div>
                <div className="rounded-xl bg-surface p-4 shadow-sm border border-line text-center">
                    <p className="text-2xl font-bold text-primary">{totalCurators}</p>
                    <p className="text-xs text-fg-muted">{t('admin.dashboard.curators')}</p>
                </div>
                <div className="rounded-xl bg-surface p-4 shadow-sm border border-line text-center">
                    <p className="text-2xl font-bold text-success-fg">{totalClients}</p>
                    <p className="text-xs text-fg-muted">{t('admin.dashboard.clients')}</p>
                </div>
            </div>

            {/* Curator load */}
            <section>
                <h2 className="text-sm font-semibold text-fg mb-3">{t('admin.dashboard.curatorLoad')}</h2>
                {curators.length === 0 ? (
                    <p className="text-sm text-fg-muted">{t('admin.dashboard.noCurators')}</p>
                ) : (
                    <div className="space-y-2">
                        {curators.map((curator) => (
                            <CuratorLoadCard key={curator.id} curator={curator} />
                        ))}
                    </div>
                )}
            </section>

            {/* Фоновые задачи не в нижней навигации: сюда заходят редко и по
                поводу, а седьмая вкладка мешала бы шести ежедневным. */}
            <section>
                <Link
                    href="/admin/jobs"
                    className="flex items-center justify-between rounded-xl border border-line bg-surface p-4 shadow-sm hover:bg-canvas"
                >
                    <span className="text-sm font-medium text-fg">{t('admin.jobs.heading')}</span>
                    <ChevronRight className="h-4 w-4 text-fg-subtle" />
                </Link>
            </section>
        </div>
    )
}
