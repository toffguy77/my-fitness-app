'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { adminApi } from '../api/adminApi'
import type { AdminConversation } from '../types'

export function AdminConversationList() {
    const router = useRouter()
    const [conversations, setConversations] = useState<AdminConversation[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        adminApi.getConversations()
            .then(setConversations)
            .catch(() => setError('Не удалось загрузить чаты'))
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

    if (conversations.length === 0) {
        return <p className="py-8 text-center text-sm text-gray-500">Нет чатов</p>
    }

    return (
        <div className="space-y-2">
            {conversations.map((conv) => (
                <button
                    key={conv.id}
                    type="button"
                    onClick={() => router.push(`/admin/chats/${conv.id}`)}
                    className={cn(
                        'w-full rounded-xl bg-white p-4 shadow-sm border border-gray-100',
                        'text-left transition-shadow hover:shadow-md',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2'
                    )}
                >
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-gray-900">
                            {conv.client_name} — {conv.curator_name}
                        </p>
                        <span className="text-xs text-gray-400">
                            {new Date(conv.updated_at).toLocaleDateString('ru-RU')}
                        </span>
                    </div>
                    <p className="text-xs text-gray-500">
                        {conv.message_count} сообщений
                    </p>
                </button>
            ))}
        </div>
    )
}
