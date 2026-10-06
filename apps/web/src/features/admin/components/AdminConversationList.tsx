'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { adminApi } from '../api/adminApi'
import type { AdminConversation } from '../types'

import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'
export function AdminConversationList() {
    const router = useRouter()
    const [conversations, setConversations] = useState<AdminConversation[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function load() {
            try {
                const page = await adminApi.getConversations()
                setConversations(page.items)
            } catch (err) {
                setError(messageForOr(err, t('admin.chats.loadFailed')))
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-fg-subtle" />
            </div>
        )
    }

    if (error) {
        return <p className="py-8 text-center text-sm text-danger-fg">{error}</p>
    }

    if (conversations.length === 0) {
        return <p className="py-8 text-center text-sm text-fg-muted">{t('admin.chats.empty')}</p>
    }

    return (
        <div className="space-y-2">
            {conversations.map((conv) => (
                <button
                    key={conv.id}
                    type="button"
                    onClick={() => router.push(`/admin/chats/${conv.id}`)}
                    className={cn(
                        'w-full rounded-xl bg-surface p-4 shadow-sm border border-line',
                        'text-left transition-shadow hover:shadow-md',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2'
                    )}
                >
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-fg">
                            {conv.client_name} — {conv.curator_name}
                        </p>
                        <span className="text-xs text-fg-subtle">
                            {new Date(conv.updated_at).toLocaleDateString('ru-RU')}
                        </span>
                    </div>
                    <p className="text-xs text-fg-muted">
                        {t('admin.chats.messageCount', { count: conv.message_count })}
                    </p>
                </button>
            ))}
        </div>
    )
}
