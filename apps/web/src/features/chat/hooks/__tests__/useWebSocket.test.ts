import { renderHook, act } from '@testing-library/react'
import { useWebSocket } from '../useWebSocket'

// Mock the context to return null so standalone mode is used
jest.mock('../../components/WebSocketProvider', () => ({
    useWebSocketContext: jest.fn().mockReturnValue(null),
}))

// Mock WebSocket class
class MockWebSocket {
    static OPEN = 1
    static CLOSED = 3
    static instances: MockWebSocket[] = []

    url: string
    readyState: number = 0
    onopen: ((ev: Event) => void) | null = null
    onclose: ((ev: CloseEvent) => void) | null = null
    onmessage: ((ev: MessageEvent) => void) | null = null
    send = jest.fn()
    close = jest.fn()

    constructor(url: string) {
        this.url = url
        MockWebSocket.instances.push(this)
    }

    simulateOpen() {
        this.readyState = MockWebSocket.OPEN
        this.onopen?.(new Event('open'))
    }

    simulateMessage(data: unknown) {
        this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }))
    }

    simulateClose() {
        this.readyState = MockWebSocket.CLOSED
        this.onclose?.({} as CloseEvent)
    }
}

describe('useWebSocket (standalone mode)', () => {
    const originalWebSocket = global.WebSocket

    beforeEach(() => {
        MockWebSocket.instances = []
        global.WebSocket = MockWebSocket as unknown as typeof WebSocket
        localStorage.setItem('auth_token', 'test-token')
        jest.useFakeTimers()
    })

    afterEach(() => {
        global.WebSocket = originalWebSocket
        localStorage.clear()
        jest.useRealTimers()
    })

    it('creates a WebSocket connection when auth token is present', () => {
        renderHook(() => useWebSocket())

        expect(MockWebSocket.instances).toHaveLength(1)
        expect(MockWebSocket.instances[0].url).toContain('/ws?token=test-token')
    })

    it('reports isConnected after open', () => {
        const { result } = renderHook(() => useWebSocket())

        act(() => {
            MockWebSocket.instances[0].simulateOpen()
        })

        expect(result.current.isConnected).toBe(true)
    })

    it('updates lastEvent on message', () => {
        const { result } = renderHook(() => useWebSocket())

        act(() => {
            MockWebSocket.instances[0].simulateOpen()
        })

        act(() => {
            MockWebSocket.instances[0].simulateMessage({ type: 'new_message', data: { id: '1' } })
        })

        expect(result.current.lastEvent).toEqual({ type: 'new_message', data: { id: '1' } })
    })

    it('sendEvent sends JSON through WebSocket when open', () => {
        const { result } = renderHook(() => useWebSocket())

        act(() => {
            MockWebSocket.instances[0].simulateOpen()
        })

        act(() => {
            result.current.sendEvent({ type: 'typing', data: { conversation_id: 'conv-1' } })
        })

        expect(MockWebSocket.instances[0].send).toHaveBeenCalledWith(
            JSON.stringify({ type: 'typing', data: { conversation_id: 'conv-1' } })
        )
    })

    it('does not create WebSocket without auth token', () => {
        localStorage.removeItem('auth_token')

        renderHook(() => useWebSocket())

        expect(MockWebSocket.instances).toHaveLength(0)
    })
})
