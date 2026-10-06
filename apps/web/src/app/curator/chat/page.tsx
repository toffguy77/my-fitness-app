'use client'

import { useRouter } from 'next/navigation'
import { ConversationList } from '@/features/chat/components/ConversationList'

import { t } from '@/shared/i18n'
export default function CuratorChatListPage() {
    const router = useRouter()

    return (
        <div className="mx-auto w-full max-w-5xl px-screen-x py-5">
            <h1 className="type-title-1 mb-5 text-fg">{t('curator.navigation.chatsHeading')}</h1>
            <ConversationList
                onSelectConversation={(conv) =>
                    router.push(`/curator/chat/${conv.participant.id}`)
                }
            />
        </div>
    )
}
