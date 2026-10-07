'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout'
import { chatApi } from '@/features/chat/api/chatApi'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useChat } from '@/features/chat/hooks/useChat'
import { MessageList } from '@/features/chat/components/MessageList'
import { ChatInput } from '@/features/chat/components/ChatInput'
import { TypingIndicator } from '@/features/chat/components/TypingIndicator'
import { useCurrentUser } from '@/shared/hooks/useCurrentUser'
import { CuratorOffer } from '@/shared/components/CuratorOffer'
import { curatorAccessApi, type CuratorAccess } from '@/shared/api/curatorAccess'
import type { Conversation } from '@/features/chat/types'

import { t } from '@/shared/i18n'
export default function ChatPage() {
    const router = useRouter()
    const [conversation, setConversation] = useState<Conversation | null>(null)
    const [noConversation, setNoConversation] = useState(false)
    // Право читается отдельно от списка переписок: переписка остаётся и после
    // окончания оплаты — читать её можно всегда, писать нельзя.
    const [access, setAccess] = useState<CuratorAccess | null>(null)
    const [isTyping, setIsTyping] = useState(false)
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Имя из сессии, а не из локального слепка: в браузере с очищенным
    // хранилищем слепка нет, и заголовок оставался пустым.
    const { user } = useCurrentUser()
    const userName = user ? user.full_name || user.name || user.email : ''

    useEffect(() => {
        curatorAccessApi
            .getAccess()
            .then(setAccess)
            // Неизвестное состояние права — не то же самое, что его отсутствие:
            // на упавшем запросе предложение купить было бы ложью. Тогда экран
            // ведёт себя как прежде, а запись отобьёт сервер.
            .catch(() => setAccess({ allowed: true, expired: false }))
    }, [])

    useEffect(() => {
        chatApi
            .getConversations()
            .then((convs) => {
                if (convs.length > 0) {
                    setConversation(convs[0])
                } else {
                    setNoConversation(true)
                }
            })
            .catch(() => {
                setNoConversation(true)
            })
    }, [router])

    const { messages, isLoading, hasMore, loadMore, sendMessage, sendFile, sendTyping, lastEvent } =
        useChat(conversation?.id ?? null)

    // Прочитанным разговор становится после показа сообщений, а не после того,
    // как он нашёлся в списке. См. тот же комментарий на экране куратора.
    const markedRef = useRef<string | null>(null)
    useEffect(() => {
        const id = conversation?.id
        if (!id || isLoading || messages.length === 0) return
        if (markedRef.current === id) return
        markedRef.current = id
        chatApi.markAsRead(id)
        useChatStore.getState().resetUnread(id)
    }, [conversation?.id, isLoading, messages.length])

    // Handle typing indicator from WebSocket events
    useEffect(() => {
        if (!lastEvent || lastEvent.type !== 'typing') return

        const typingData = lastEvent.data as { conversation_id?: string; user_id?: number }
        if (typingData.conversation_id !== conversation?.id) return

        // Show typing indicator for 3 seconds (WebSocket subscription callback pattern)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsTyping(true)
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
        typingTimerRef.current = setTimeout(() => setIsTyping(false), 3000)
    }, [lastEvent, conversation?.id])

    // Clean up typing timer on unmount
    useEffect(() => {
        return () => {
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
        }
    }, [])

    // Вход в переписку остаётся живым, а на её месте стоит предложение купить:
    // отключённая кнопка читалась бы как поломка и ничего не продавала бы.
    //
    // У того, чьё право кончилось, под предложением остаётся прежняя переписка
    // для чтения — написанное человеком не становится недоступным ему из-за
    // окончания оплаты.
    const content = access && !access.allowed ? (
        <div className="mx-auto flex w-full max-w-content flex-col gap-4 px-screen-x py-6">
            <CuratorOffer
                place="chat"
                expired={access.expired}
                expiresAt={access.expires_at}
            />
            {access.expired && conversation && (
                <div className="flex flex-col" style={{ height: 'calc(100dvh - 24rem)' }}>
                    <MessageList
                        messages={messages}
                        isLoading={isLoading}
                        hasMore={hasMore}
                        onLoadMore={loadMore}
                    />
                </div>
            )}
        </div>
    ) : noConversation ? (
        <div className="mx-auto flex w-full max-w-content flex-col items-center justify-center gap-4 px-screen-x py-20 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-subtle" aria-hidden="true">
                <MessageCircle className="h-6 w-6 text-fg-subtle" strokeWidth={1.8} />
            </span>
            <p className="type-title-3 text-fg">{t('chat.noCurator')}</p>
        </div>
    ) : (
        <div className="flex flex-col" style={{ height: 'calc(100dvh - 8rem - env(safe-area-inset-bottom, 0px))' }}>
            {conversation && (
                <div className="flex min-h-14 items-center border-b border-line bg-surface px-4 py-3">
                    <h2 className="truncate type-title-3 text-fg">{conversation.participant.name}</h2>
                </div>
            )}
            <MessageList
                messages={messages}
                isLoading={isLoading}
                hasMore={hasMore}
                onLoadMore={loadMore}
            />
            <TypingIndicator isTyping={isTyping} />
            <ChatInput
                onSendMessage={sendMessage}
                onSendFile={sendFile}
                onTyping={sendTyping}
            />
        </div>
    )

    return (
        <DashboardLayout userName={userName} activeNavItem="chat">
            {content}
        </DashboardLayout>
    )
}
