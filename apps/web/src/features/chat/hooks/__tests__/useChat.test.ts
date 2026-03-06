import { renderHook, act, waitFor } from '@testing-library/react'
import { useChat } from '../useChat'
import { chatApi } from '../../api/chatApi'
import type { Message } from '../../types'

jest.mock('../../api/chatApi', () => ({
    chatApi: {
        getMessages: jest.fn(),
        sendMessage: jest.fn(),
        uploadFile: jest.fn(),
    },
}))

jest.mock('../useWebSocket', () => ({
    useWebSocket: () => ({
        lastEvent: null,
        sendEvent: jest.fn(),
        isConnected: false,
    }),
}))

const mockChatApi = chatApi as jest.Mocked<typeof chatApi>

function makeMessage(id: string, content = 'test'): Message {
    return {
        id,
        conversation_id: 'conv-1',
        sender_id: 1,
        type: 'text',
        content,
        created_at: '2025-01-01T12:00:00Z',
    }
}

describe('useChat', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('loads messages on mount when conversationId is provided', async () => {
        const msgs = [makeMessage('3'), makeMessage('2'), makeMessage('1')]
        mockChatApi.getMessages.mockResolvedValue(msgs)

        const { result } = renderHook(() => useChat('conv-1'))

        expect(result.current.isLoading).toBe(true)

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        // Messages are reversed for chronological display
        expect(result.current.messages).toHaveLength(3)
        expect(result.current.messages[0].id).toBe('1')
        expect(result.current.messages[2].id).toBe('3')
        expect(mockChatApi.getMessages).toHaveBeenCalledWith('conv-1')
    })

    it('does not load messages when conversationId is null', () => {
        renderHook(() => useChat(null))

        expect(mockChatApi.getMessages).not.toHaveBeenCalled()
    })

    it('sendMessage calls chatApi.sendMessage and appends result', async () => {
        mockChatApi.getMessages.mockResolvedValue([])
        const newMsg = makeMessage('msg-new', 'hello')
        mockChatApi.sendMessage.mockResolvedValue(newMsg)

        const { result } = renderHook(() => useChat('conv-1'))

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        await act(async () => {
            await result.current.sendMessage('hello')
        })

        expect(mockChatApi.sendMessage).toHaveBeenCalledWith('conv-1', {
            type: 'text',
            content: 'hello',
        })
        expect(result.current.messages).toContainEqual(newMsg)
    })

    it('loadMore fetches older messages with cursor', async () => {
        // Initial load returns exactly 50 messages to set hasMore=true
        const initialMsgs = Array.from({ length: 50 }, (_, i) =>
            makeMessage(`msg-${i}`)
        )
        mockChatApi.getMessages.mockResolvedValueOnce(initialMsgs)

        const { result } = renderHook(() => useChat('conv-1'))

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(result.current.hasMore).toBe(true)

        // Load more returns older messages
        const olderMsgs = [makeMessage('older-2'), makeMessage('older-1')]
        mockChatApi.getMessages.mockResolvedValueOnce(olderMsgs)

        await act(async () => {
            await result.current.loadMore()
        })

        // Initial messages reversed: [msg-49, msg-48, ..., msg-0]
        // Cursor is messages[0].id = 'msg-49'
        expect(mockChatApi.getMessages).toHaveBeenLastCalledWith(
            'conv-1',
            'msg-49'
        )
    })

    it('sets hasMore to false when fewer than 50 messages returned', async () => {
        mockChatApi.getMessages.mockResolvedValue([makeMessage('1')])

        const { result } = renderHook(() => useChat('conv-1'))

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(result.current.hasMore).toBe(false)
    })
})
