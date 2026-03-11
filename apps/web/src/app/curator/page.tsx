'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
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
            .catch(() => setError('Не удалось загрузить данные'))
            .finally(() => setLoading(false))

        // Fetch benchmark data separately (non-blocking)
        curatorApi.getBenchmark(12).then(setBenchmarkData).catch(() => {})
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        )
    }

    if (error) {
        return (
            <p className="py-8 text-center text-sm text-red-500">{error}</p>
        )
    }

    return (
        <div className="px-4 py-6 space-y-6">
            {analytics && <AnalyticsSummaryCards analytics={analytics} />}

            {attentionItems.length > 0 && (
                <section>
                    <h2 className="text-sm font-semibold text-red-600 mb-2">
                        Требуют внимания
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
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-gray-900">Все клиенты</h2>
                </div>
                <ClientList
                    clients={clients}
                    attentionClientIds={new Set(attentionItems.map((item) => item.client_id))}
                />
            </section>
        </div>
    )
}
