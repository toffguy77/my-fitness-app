'use client'

import { useRouter } from 'next/navigation'
import { ConversationList } from '@/features/chat/components/ConversationList'

import { t } from '@/shared/i18n'
export default function CuratorChatListPage() {
    const router = useRouter()

    return (
        <div className="px-4 py-6">
            <h1 className="text-xl font-semibold text-gray-900 mb-4">{t('curator.navigation.chatsHeading')}</h1>
            <ConversationList
                onSelectConversation={(conv) =>
                    router.push(`/curator/chat/${conv.participant.id}`)
                }
            />
        </div>
    )
}
