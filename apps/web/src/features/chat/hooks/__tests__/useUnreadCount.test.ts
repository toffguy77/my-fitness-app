import { renderHook, waitFor } from '@testing-library/react'
import { useUnreadCount } from '../useUnreadCount'
import { chatApi } from '../../api/chatApi'
import { useChatStore } from '../../store/chatStore'

jest.mock('../../api/chatApi', () => ({
    chatApi: {
        getUnreadCount: jest.fn(),
    },
}))

jest.mock('../../components/WebSocketProvider', () => ({
    useWebSocketContext: jest.fn().mockReturnValue(null),
}))

const mockChatApi = chatApi as jest.Mocked<typeof chatApi>

describe('useUnreadCount', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        useChatStore.setState({ conversations: [], unreadTotal: 0 })
    })

    it('fetches initial count on mount and updates store', async () => {
        mockChatApi.getUnreadCount.mockResolvedValue({ count: 7 })

        const { result } = renderHook(() => useUnreadCount())

        await waitFor(() => {
            expect(result.current).toBe(7)
        })

        expect(mockChatApi.getUnreadCount).toHaveBeenCalledTimes(1)
        expect(useChatStore.getState().unreadTotal).toBe(7)
    })

    it('handles fetch errors gracefully', async () => {
        mockChatApi.getUnreadCount.mockRejectedValue(new Error('Network error'))

        const { result } = renderHook(() => useUnreadCount())

        // Should not throw, unreadTotal stays at 0
        await waitFor(() => {
            expect(mockChatApi.getUnreadCount).toHaveBeenCalled()
        })
        expect(result.current).toBe(0)
    })
})
