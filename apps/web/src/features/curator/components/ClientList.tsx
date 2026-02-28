'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { curatorApi } from '../api/curatorApi'
import { ClientCard } from './ClientCard'
import type { ClientCard as ClientCardType } from '../types'

export function ClientList() {
    const [clients, setClients] = useState<ClientCardType[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        curatorApi.getClients()
            .then(setClients)
            .catch(() => setError('Не удалось загрузить клиентов'))
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
        return (
            <p className="py-8 text-center text-sm text-red-500">{error}</p>
        )
    }

    if (clients.length === 0) {
        return (
            <p className="py-8 text-center text-sm text-gray-500">
                Нет закреплённых клиентов
            </p>
        )
    }

    const needsAttention = clients
        .filter(
            (c) =>
                c.alerts.some((a) => a.level === 'red' || a.level === 'yellow') ||
                c.unread_count > 0
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    const normal = clients
        .filter(
            (c) =>
                !c.alerts.some((a) => a.level === 'red' || a.level === 'yellow') &&
                c.unread_count === 0
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    return (
        <div className="space-y-6">
            {needsAttention.length > 0 && (
                <section>
                    <h2 className="text-sm font-semibold text-red-600 mb-2">
                        Требуют внимания
                    </h2>
                    <div className="space-y-3">
                        {needsAttention.map((client) => (
                            <ClientCard key={client.id} client={client} />
                        ))}
                    </div>
                </section>
            )}

            {normal.length > 0 && (
                <section>
                    <h2 className="text-sm font-semibold text-gray-500 mb-2">
                        В норме
                    </h2>
                    <div className="space-y-3">
                        {normal.map((client) => (
                            <ClientCard key={client.id} client={client} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}
