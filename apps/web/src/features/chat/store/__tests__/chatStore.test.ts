import { renderHook, act } from '@testing-library/react'
import { useChatStore } from '../chatStore'
import type { Conversation } from '../../types'

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
    return {
        id: 'conv-1',
        client_id: 1,
        curator_id: 2,
        unread_count: 0,
        participant: { id: 1, name: 'Test User' },
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        ...overrides,
    }
}

describe('chatStore', () => {
    beforeEach(() => {
        useChatStore.setState({
            conversations: [],
            unreadTotal: 0,
        })
    })

    it('setConversations replaces all conversations', () => {
        const { result } = renderHook(() => useChatStore())
        const convs = [makeConversation({ id: 'a' }), makeConversation({ id: 'b' })]

        act(() => {
            result.current.setConversations(convs)
        })

        expect(result.current.conversations).toHaveLength(2)
        expect(result.current.conversations[0].id).toBe('a')
        expect(result.current.conversations[1].id).toBe('b')

        // Replace with different set
        act(() => {
            result.current.setConversations([makeConversation({ id: 'c' })])
        })
        expect(result.current.conversations).toHaveLength(1)
        expect(result.current.conversations[0].id).toBe('c')
    })

    it('incrementUnread adds 1 to specific conversation and total', () => {
        const { result } = renderHook(() => useChatStore())

        act(() => {
            result.current.setConversations([
                makeConversation({ id: 'conv-1', unread_count: 0 }),
                makeConversation({ id: 'conv-2', unread_count: 3 }),
            ])
        })

        act(() => {
            result.current.incrementUnread('conv-1')
        })

        expect(result.current.conversations[0].unread_count).toBe(1)
        expect(result.current.conversations[1].unread_count).toBe(3)
        expect(result.current.unreadTotal).toBe(1)
    })

    it('resetUnread sets conversation unread to 0 and decrements total', () => {
        const { result } = renderHook(() => useChatStore())

        act(() => {
            result.current.setConversations([
                makeConversation({ id: 'conv-1', unread_count: 5 }),
            ])
            result.current.setUnreadTotal(10)
        })

        act(() => {
            result.current.resetUnread('conv-1')
        })

        expect(result.current.conversations[0].unread_count).toBe(0)
        expect(result.current.unreadTotal).toBe(5) // 10 - 5
    })

    it('resetUnread does not go below 0', () => {
        const { result } = renderHook(() => useChatStore())

        act(() => {
            result.current.setConversations([
                makeConversation({ id: 'conv-1', unread_count: 5 }),
            ])
            result.current.setUnreadTotal(2)
        })

        act(() => {
            result.current.resetUnread('conv-1')
        })

        expect(result.current.unreadTotal).toBe(0)
    })

    it('setUnreadTotal sets exact value', () => {
        const { result } = renderHook(() => useChatStore())

        act(() => {
            result.current.setUnreadTotal(42)
        })

        expect(result.current.unreadTotal).toBe(42)
    })
})
