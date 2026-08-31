'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { curatorApi } from '../api/curatorApi'
import { ClientCard } from './ClientCard'
import type { ClientCard as ClientCardType } from '../types'

interface ClientListProps {
    clients?: ClientCardType[]
    /**
     * IDs already listed in the page's attention block. Those clients keep
     * their place in the roster below — they are only left out of the second,
     * duplicate "Требуют внимания" heading here.
     */
    attentionClientIds?: Set<number>
}

export function ClientList({ clients: externalClients, attentionClientIds }: ClientListProps = {}) {
    const [internalClients, setInternalClients] = useState<ClientCardType[]>([])
    const [loading, setLoading] = useState(!externalClients)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (externalClients) return
        curatorApi.getClients()
            .then(setInternalClients)
            .catch(() => setError('Не удалось загрузить клиентов'))
            .finally(() => setLoading(false))
    }, [externalClients])

    const clients = externalClients ?? internalClients

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

    const byName = (a: ClientCardType, b: ClientCardType) => a.name.localeCompare(b.name, 'ru')

    // Shown under the page's own attention block, so repeating them under a
    // second identical heading here would say the same thing twice.
    const alreadyFlagged = (c: ClientCardType) => attentionClientIds?.has(c.id) ?? false

    const needsAttention = clients
        .filter(
            (c) =>
                (c.alerts.some((a) => a.level === 'red' || a.level === 'yellow') ||
                    c.unread_count > 0) &&
                !alreadyFlagged(c)
        )
        .sort(byName)

    // Everyone else. A client the page already flagged still belongs in the
    // roster: excluding them from both groups emptied "Все клиенты" entirely
    // for a curator whose only client needed attention.
    const flagged = new Set(needsAttention.map((c) => c.id))
    const rest = clients.filter((c) => !flagged.has(c.id)).sort(byName)

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

            {rest.length > 0 && (
                <section>
                    {needsAttention.length > 0 && (
                        <h2 className="text-sm font-semibold text-gray-500 mb-2">
                            Остальные
                        </h2>
                    )}
                    <div className="space-y-3">
                        {rest.map((client) => (
                            <ClientCard key={client.id} client={client} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}
