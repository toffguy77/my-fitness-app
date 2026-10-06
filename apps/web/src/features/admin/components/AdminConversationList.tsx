'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { adminApi } from '../api/adminApi'
import type { AdminConversation } from '../types'

import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'
import { ADMIN_ROW_CLASS, AdminSpinner } from './adminUi'
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
        return <AdminSpinner />
    }

    if (error) {
        return <p className="py-8 text-center text-sm text-danger-fg">{error}</p>
    }

    if (conversations.length === 0) {
        return <p className="py-8 text-center text-sm text-fg-muted">{t('admin.chats.empty')}</p>
    }

    return (
        <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {conversations.map((conv) => (
                <button
                    key={conv.id}
                    type="button"
                    onClick={() => router.push(`/admin/chats/${conv.id}`)}
                    className={ADMIN_ROW_CLASS}
                >
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-3">
                            <span className="type-headline truncate text-fg">
                                {conv.client_name} — {conv.curator_name}
                            </span>
                            <span className="shrink-0 text-[13px] tabular-nums text-fg-subtle">
                                {new Date(conv.updated_at).toLocaleDateString('ru-RU')}
                            </span>
                        </span>
                        <span className="block text-sm tabular-nums text-fg-muted">
                            {t('admin.chats.messageCount', { count: conv.message_count })}
                        </span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                </button>
            ))}
        </div>
    )
}
