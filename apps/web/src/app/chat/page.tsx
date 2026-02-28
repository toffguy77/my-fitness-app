'use client'

import { useEffect, useState, useRef } from 'react'
import { chatApi } from '@/features/chat/api/chatApi'
import { useChat } from '@/features/chat/hooks/useChat'
import { MessageList } from '@/features/chat/components/MessageList'
import { ChatInput } from '@/features/chat/components/ChatInput'
import { TypingIndicator } from '@/features/chat/components/TypingIndicator'
import type { Conversation } from '@/features/chat/types'

export default function ChatPage() {
    const [conversation, setConversation] = useState<Conversation | null>(null)
    const [noConversation, setNoConversation] = useState(false)
    const [isTyping, setIsTyping] = useState(false)
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        chatApi
            .getConversations()
            .then((convs) => {
                if (convs.length > 0) {
                    setConversation(convs[0])
                    chatApi.markAsRead(convs[0].id)
                } else {
                    setNoConversation(true)
                }
            })
            .catch(() => {
                setNoConversation(true)
            })
    }, [])

    const { messages, isLoading, hasMore, loadMore, sendMessage, sendFile, sendTyping, lastEvent } =
        useChat(conversation?.id ?? null)

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

    if (noConversation) {
        return (
            <div className="flex flex-col items-center justify-center h-full px-4 py-20">
                <p className="text-gray-500">Куратор пока не назначен</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)]">
            {conversation && (
                <div className="px-4 py-3 border-b border-gray-200 bg-white">
                    <h2 className="text-lg font-medium">{conversation.participant.name}</h2>
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
}
