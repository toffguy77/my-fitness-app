'use client'

import { useEffect, useState } from 'react'
import { curatorApi } from '@/features/curator/api/curatorApi'
import { AnalyticsSummaryCards } from '@/features/curator/components/AnalyticsSummaryCards'
import { AttentionList } from '@/features/curator/components/AttentionList'
import { AnalyticsDynamicsChart } from '@/features/curator/components/AnalyticsDynamicsChart'
import { ClientList } from '@/features/curator/components/ClientList'
import type {
    AnalyticsSummary,
    AttentionItem,
    ClientCard as ClientCardType,
    BenchmarkData,
} from '@/features/curator/types'

import { t } from '@/shared/i18n'
import { Spinner } from '@/shared/components/ui/Spinner'
export default function CuratorHubPage() {
    const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
    const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([])
    const [clients, setClients] = useState<ClientCardType[]>([])
    const [benchmarkData, setBenchmarkData] = useState<BenchmarkData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        Promise.all([
            curatorApi.getAnalytics(),
            curatorApi.getAttentionList(),
            curatorApi.getClients(),
        ])
            .then(([analyticsData, attention, clientsData]) => {
                setAnalytics(analyticsData)
                setAttentionItems(attention)
                setClients(clientsData)
            })
            .catch(() => setError(t('curator.list.loadDataFailed')))
            .finally(() => setLoading(false))

        // Fetch benchmark data separately (non-blocking)
        curatorApi.getBenchmark(12).then(setBenchmarkData).catch(() => {})
    }, [])

    if (loading) {
        return (
            <Spinner label={t('common.loading')} />
        )
    }

    if (error) {
        return (
            <p className="py-8 text-center text-sm text-danger-fg" role="alert">{error}</p>
        )
    }

    return (
        <div className="mx-auto w-full max-w-5xl px-screen-x py-5 space-y-6">
            <h1 className="type-title-1 text-fg">{t('curator.navigation.clients')}</h1>

            {analytics && <AnalyticsSummaryCards analytics={analytics} />}

            {attentionItems.length > 0 && (
                <section>
                    <h2 className="type-overline mb-2 text-danger-fg">
                        {t('curator.list.needAttention')}
                    </h2>
                    <AttentionList items={attentionItems} />
                </section>
            )}

            {benchmarkData && (
                <AnalyticsDynamicsChart
                    ownSnapshots={benchmarkData.own_snapshots}
                    benchmarks={benchmarkData.platform_benchmarks}
                />
            )}

            <section>
                <h2 className="type-title-2 mb-3 text-fg">{t('curator.list.allClients')}</h2>
                <ClientList
                    clients={clients}
                    attentionClientIds={new Set(attentionItems.map((item) => item.client_id))}
                />
            </section>
        </div>
    )
}
