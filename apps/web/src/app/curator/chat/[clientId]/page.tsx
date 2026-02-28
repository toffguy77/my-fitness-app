/**
 * Curator Chat Page
 *
 * Chat view for a curator communicating with a specific client.
 * Includes message list, input, typing indicator, and food entry form.
 */

'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { chatApi } from '@/features/chat/api/chatApi'
import { useChat } from '@/features/chat/hooks/useChat'
import { MessageList } from '@/features/chat/components/MessageList'
import { ChatInput } from '@/features/chat/components/ChatInput'
import { TypingIndicator } from '@/features/chat/components/TypingIndicator'
import { FoodEntryForm } from '@/features/chat/components/FoodEntryForm'
import type { Conversation, Message } from '@/features/chat/types'

export default function CuratorChatPage() {
    const router = useRouter()
    const params = useParams()
    const clientId = Number(params.clientId)
    const [conversation, setConversation] = useState<Conversation | null>(null)
    const [foodEntryMsg, setFoodEntryMsg] = useState<Message | null>(null)

    // Find the conversation for this client
    useEffect(() => {
        chatApi.getConversations().then((convs) => {
            const conv = convs.find((c) => c.participant.id === clientId)
            if (conv) {
                setConversation(conv)
                chatApi.markAsRead(conv.id)
            }
        })
    }, [clientId])

    const {
        messages,
        isLoading,
        hasMore,
        loadMore,
        sendMessage,
        sendFile,
        sendTyping,
        lastEvent,
    } = useChat(conversation?.id ?? null)

    // Detect typing from client
    const [isTyping, setIsTyping] = useState(false)
    useEffect(() => {
        if (
            lastEvent?.type === 'typing' &&
            lastEvent.data?.conversation_id === conversation?.id
        ) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- WebSocket subscription update
            setIsTyping(true)
            const timer = setTimeout(() => setIsTyping(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [lastEvent, conversation?.id])

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)]">
            {/* Header with back button and client name */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
                <button
                    type="button"
                    onClick={() => router.push('/curator/chat')}
                    className="p-1 text-gray-600 hover:text-gray-900 transition-colors"
                    aria-label="Назад к списку чатов"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-lg font-medium text-gray-900">
                    {conversation?.participant.name ?? 'Загрузка...'}
                </h2>
            </div>

            {/* Message list with image action support */}
            <MessageList
                messages={messages}
                isLoading={isLoading}
                hasMore={hasMore}
                onLoadMore={loadMore}
                onImageAction={(msg) => setFoodEntryMsg(msg)}
            />

            <TypingIndicator isTyping={isTyping} />

            <ChatInput
                onSendMessage={sendMessage}
                onSendFile={sendFile}
                onTyping={sendTyping}
            />

            {/* Food entry modal */}
            {foodEntryMsg && conversation && (
                <FoodEntryForm
                    conversationId={conversation.id}
                    messageId={foodEntryMsg.id}
                    onClose={() => setFoodEntryMsg(null)}
                    onSubmit={() => setFoodEntryMsg(null)}
                />
            )}
        </div>
    )
}
