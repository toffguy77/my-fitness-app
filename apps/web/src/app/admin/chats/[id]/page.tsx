'use client'

import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ReadOnlyMessageList } from '@/features/admin/components/ReadOnlyMessageList'

export default function AdminChatDetailPage() {
    const router = useRouter()
    const params = useParams()
    const conversationId = params.id as string

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)]">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
                <button
                    type="button"
                    onClick={() => router.push('/admin/chats')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
                    aria-label="Назад"
                >
                    <ArrowLeft className="h-5 w-5 text-gray-700" />
                </button>
                <h1 className="text-sm font-semibold text-gray-900">Просмотр чата</h1>
                <span className="ml-auto text-xs text-gray-400">Только чтение</span>
            </div>

            {/* Messages */}
            <ReadOnlyMessageList conversationId={conversationId} />
        </div>
    )
}
