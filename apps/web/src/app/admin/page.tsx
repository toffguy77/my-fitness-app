'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { adminApi, CuratorLoadCard } from '@/features/admin'
import type { CuratorLoad, AdminUser } from '@/features/admin'

import { t } from '@/shared/i18n'
import { Spinner } from '@/shared/components/ui/Spinner'
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
            <Spinner label={t('common.loading')} />
        )
    }

    const totalUsers = users.length
    const totalClients = users.filter((u) => u.role === 'client').length
    const totalCurators = curators.length

    return (
        <div className="mx-auto w-full max-w-5xl px-screen-x py-5 space-y-6">
            <h1 className="type-title-1 text-fg">{t('admin.dashboard.heading')}</h1>

            {/* Stats — счётчики, а не состояния: чернилами, без оценочного цвета. */}
            <dl className="grid grid-cols-3 gap-3">
                <div className="flex min-w-0 flex-col-reverse rounded-card border border-line bg-surface px-3 py-4">
                    <dt className="hyphens-auto text-[13px] text-fg-muted">{t('admin.dashboard.users')}</dt>
                    <dd className="type-num-l tabular-nums text-fg">{totalUsers}</dd>
                </div>
                <div className="flex min-w-0 flex-col-reverse rounded-card border border-line bg-surface px-3 py-4">
                    <dt className="hyphens-auto text-[13px] text-fg-muted">{t('admin.dashboard.curators')}</dt>
                    <dd className="type-num-l tabular-nums text-fg">{totalCurators}</dd>
                </div>
                <div className="flex min-w-0 flex-col-reverse rounded-card border border-line bg-surface px-3 py-4">
                    <dt className="hyphens-auto text-[13px] text-fg-muted">{t('admin.dashboard.clients')}</dt>
                    <dd className="type-num-l tabular-nums text-fg">{totalClients}</dd>
                </div>
            </dl>

            {/* Curator load */}
            <section>
                <h2 className="type-title-2 mb-3 text-fg">{t('admin.dashboard.curatorLoad')}</h2>
                {curators.length === 0 ? (
                    <p className="text-sm text-fg-muted">{t('admin.dashboard.noCurators')}</p>
                ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                    className="flex min-h-14 items-center justify-between rounded-card border border-line bg-surface px-4 transition-colors hover:bg-subtle/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                    <span className="text-base text-fg">{t('admin.jobs.heading')}</span>
                    <ChevronRight className="h-5 w-5 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                </Link>
            </section>
        </div>
    )
}
