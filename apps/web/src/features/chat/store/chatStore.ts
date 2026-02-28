/**
 * Zustand store for chat state management
 * Handles conversation list and unread counts
 */

import { create } from 'zustand'
import type { Conversation } from '../types'

interface ChatState {
    conversations: Conversation[]
    unreadTotal: number
    setConversations: (convs: Conversation[]) => void
    incrementUnread: (convId: string) => void
    resetUnread: (convId: string) => void
    setUnreadTotal: (count: number) => void
}

export const useChatStore = create<ChatState>((set) => ({
    conversations: [],
    unreadTotal: 0,

    setConversations: (convs) => set({ conversations: convs }),

    incrementUnread: (convId) =>
        set((state) => ({
            conversations: state.conversations.map((c) =>
                c.id === convId ? { ...c, unread_count: c.unread_count + 1 } : c
            ),
            unreadTotal: state.unreadTotal + 1,
        })),

    resetUnread: (convId) =>
        set((state) => {
            const conv = state.conversations.find((c) => c.id === convId)
            const diff = conv?.unread_count ?? 0
            return {
                conversations: state.conversations.map((c) =>
                    c.id === convId ? { ...c, unread_count: 0 } : c
                ),
                unreadTotal: Math.max(0, state.unreadTotal - diff),
            }
        }),

    setUnreadTotal: (count) => set({ unreadTotal: count }),
}))
