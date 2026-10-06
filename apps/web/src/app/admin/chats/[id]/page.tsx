'use client'

import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ReadOnlyMessageList } from '@/features/admin/components/ReadOnlyMessageList'
import { IconButton } from '@/shared/components/ui/Button'

import { t } from '@/shared/i18n'
export default function AdminChatDetailPage() {
    const router = useRouter()
    const params = useParams()
    const conversationId = params.id as string

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)]">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
                <IconButton
                    variant="ghost"
                    onClick={() => router.push('/admin/chats')}
                    aria-label={t('common.back')}
                >
                    <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                </IconButton>
                <h1 className="type-title-3 text-fg">{t('admin.chats.viewHeading')}</h1>
                <span className="ml-auto rounded-full bg-subtle px-2.5 py-0.5 text-xs font-medium text-fg-muted">
                    {t('admin.chats.readOnly')}
                </span>
            </div>

            {/* Messages */}
            <ReadOnlyMessageList conversationId={conversationId} />
        </div>
    )
}
