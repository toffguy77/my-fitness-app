'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout'
import { chatApi } from '@/features/chat/api/chatApi'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useChat } from '@/features/chat/hooks/useChat'
import { MessageList } from '@/features/chat/components/MessageList'
import { ChatInput } from '@/features/chat/components/ChatInput'
import { TypingIndicator } from '@/features/chat/components/TypingIndicator'
import type { Conversation } from '@/features/chat/types'

export default function ChatPage() {
    const router = useRouter()
    const [conversation, setConversation] = useState<Conversation | null>(null)
    const [noConversation, setNoConversation] = useState(false)
    const [isTyping, setIsTyping] = useState(false)
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const userName = useMemo(() => {
        if (typeof window === 'undefined') return ''
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}')
            return user.name || user.email || ''
        } catch { return '' }
    }, [])

    useEffect(() => {
        if (typeof window !== 'undefined' && !localStorage.getItem('auth_token')) {
            router.push('/auth')
            return
        }

        chatApi
            .getConversations()
            .then((convs) => {
                if (convs.length > 0) {
                    setConversation(convs[0])
                    chatApi.markAsRead(convs[0].id)
                    useChatStore.getState().resetUnread(convs[0].id)
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

    const content = noConversation ? (
        <div className="flex flex-col items-center justify-center px-4 py-20">
            <p className="text-gray-500">Куратор пока не назначен</p>
        </div>
    ) : (
        <div className="flex flex-col" style={{ height: 'calc(100dvh - 8rem - env(safe-area-inset-bottom, 0px))' }}>
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

    return (
        <DashboardLayout userName={userName} activeNavItem="chat">
            {content}
        </DashboardLayout>
    )
}
