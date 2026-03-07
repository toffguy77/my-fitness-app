import { render, screen, act } from '@testing-library/react'
import { WebSocketProvider, useWebSocketContext } from '../WebSocketProvider'

// Mock WebSocket
class MockWebSocket {
    static OPEN = 1
    static instances: MockWebSocket[] = []
    readyState = MockWebSocket.OPEN
    onopen: ((event: Event) => void) | null = null
    onclose: ((event: CloseEvent) => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null
    url: string
    send = jest.fn()
    close = jest.fn()

    constructor(url: string) {
        this.url = url
        MockWebSocket.instances.push(this)
    }
}

function TestConsumer() {
    const ctx = useWebSocketContext()
    return (
        <div>
            <span data-testid="connected">{ctx?.isConnected ? 'yes' : 'no'}</span>
            <span data-testid="last-event">{ctx?.lastEvent ? JSON.stringify(ctx.lastEvent) : 'none'}</span>
            <button onClick={() => ctx?.sendEvent({ type: 'ping', data: {} })}>Send</button>
        </div>
    )
}

describe('WebSocketProvider', () => {
    const originalWebSocket = global.WebSocket

    beforeEach(() => {
        MockWebSocket.instances = []
        ;(global as Record<string, unknown>).WebSocket = MockWebSocket
        localStorage.setItem('auth_token', 'test-token')
    })

    afterEach(() => {
        ;(global as Record<string, unknown>).WebSocket = originalWebSocket
        localStorage.clear()
        jest.restoreAllMocks()
    })

    it('renders children', () => {
        render(
            <WebSocketProvider>
                <div data-testid="child">Hello</div>
            </WebSocketProvider>
        )
        expect(screen.getByTestId('child')).toBeInTheDocument()
    })

    it('connects to WebSocket when auth token exists', () => {
        render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        )
        expect(MockWebSocket.instances).toHaveLength(1)
        expect(MockWebSocket.instances[0].url).toContain('token=test-token')
    })

    it('does not connect when no auth token', () => {
        localStorage.removeItem('auth_token')
        render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        )
        expect(MockWebSocket.instances).toHaveLength(0)
    })

    it('sets isConnected to true on open', () => {
        render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        )

        act(() => {
            MockWebSocket.instances[0].onopen?.(new Event('open'))
        })

        expect(screen.getByTestId('connected')).toHaveTextContent('yes')
    })

    it('sets isConnected to false on close', () => {
        render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        )

        act(() => {
            MockWebSocket.instances[0].onopen?.(new Event('open'))
        })
        expect(screen.getByTestId('connected')).toHaveTextContent('yes')

        act(() => {
            MockWebSocket.instances[0].onclose?.(new CloseEvent('close'))
        })
        expect(screen.getByTestId('connected')).toHaveTextContent('no')
    })

    it('processes incoming messages and sets lastEvent', () => {
        render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        )

        const event = { type: 'new_message', data: { text: 'hello' } }
        act(() => {
            MockWebSocket.instances[0].onmessage?.(
                new MessageEvent('message', { data: JSON.stringify(event) })
            )
        })

        expect(screen.getByTestId('last-event')).toHaveTextContent(JSON.stringify(event))
    })

    it('ignores malformed messages', () => {
        render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        )

        act(() => {
            MockWebSocket.instances[0].onmessage?.(
                new MessageEvent('message', { data: 'not json' })
            )
        })

        expect(screen.getByTestId('last-event')).toHaveTextContent('none')
    })

    it('sends events through WebSocket', () => {
        render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        )

        act(() => {
            MockWebSocket.instances[0].onopen?.(new Event('open'))
        })

        act(() => {
            screen.getByText('Send').click()
        })

        expect(MockWebSocket.instances[0].send).toHaveBeenCalledWith(
            JSON.stringify({ type: 'ping', data: {} })
        )
    })

    it('closes WebSocket on unmount', () => {
        const { unmount } = render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        )

        const ws = MockWebSocket.instances[0]
        unmount()
        expect(ws.close).toHaveBeenCalled()
    })
})

describe('WebSocketProvider reconnect guards', () => {
    const originalWebSocket = global.WebSocket

    beforeEach(() => {
        MockWebSocket.instances = []
        ;(global as Record<string, unknown>).WebSocket = MockWebSocket
        localStorage.setItem('auth_token', 'test-token')
        jest.useFakeTimers()
        Object.defineProperty(document, 'visibilityState', {
            writable: true,
            value: 'visible',
        })
    })

    afterEach(() => {
        ;(global as Record<string, unknown>).WebSocket = originalWebSocket
        localStorage.clear()
        jest.useRealTimers()
        jest.restoreAllMocks()
    })

    it.each([1008, 4401, 4403])('does not reconnect on auth failure close code %i', (code) => {
        render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        )
        expect(MockWebSocket.instances).toHaveLength(1)

        act(() => {
            MockWebSocket.instances[0].onclose?.(new CloseEvent('close', { code }))
        })

        act(() => {
            jest.advanceTimersByTime(5000)
        })

        expect(MockWebSocket.instances).toHaveLength(1)
    })

    it('does not reconnect when tab is hidden', () => {
        render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        )
        expect(MockWebSocket.instances).toHaveLength(1)

        Object.defineProperty(document, 'visibilityState', { value: 'hidden' })

        act(() => {
            MockWebSocket.instances[0].onclose?.(new CloseEvent('close', { code: 1000 }))
        })

        act(() => {
            jest.advanceTimersByTime(5000)
        })

        expect(MockWebSocket.instances).toHaveLength(1)
    })

    it('reconnects when hidden tab becomes visible', () => {
        render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        )
        expect(MockWebSocket.instances).toHaveLength(1)

        // Simulate tab hidden, then connection closes
        Object.defineProperty(document, 'visibilityState', { value: 'hidden' })
        act(() => {
            MockWebSocket.instances[0].onclose?.(new CloseEvent('close', { code: 1000 }))
        })

        // Tab becomes visible again
        Object.defineProperty(document, 'visibilityState', { value: 'visible' })
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'))
        })

        expect(MockWebSocket.instances).toHaveLength(2)
    })

    it('closes old WebSocket before creating a new one on visibility reconnect', () => {
        render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        )
        const firstWs = MockWebSocket.instances[0]

        // Simulate tab hidden → visible without close event
        Object.defineProperty(document, 'visibilityState', { value: 'visible' })
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'))
        })

        // Old WS should have been closed (onclose nulled, then close() called)
        expect(firstWs.close).toHaveBeenCalled()
    })

    it('clears pending reconnect timer on unmount', () => {
        const { unmount } = render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        )

        // Trigger a close so a reconnect timer is scheduled
        act(() => {
            MockWebSocket.instances[0].onclose?.(new CloseEvent('close', { code: 1000 }))
        })

        unmount()

        // Advance past the reconnect delay — no new WS should be created
        act(() => {
            jest.advanceTimersByTime(5000)
        })

        expect(MockWebSocket.instances).toHaveLength(1)
    })

    it('removes visibilitychange listener on unmount', () => {
        const removeSpy = jest.spyOn(document, 'removeEventListener')
        const { unmount } = render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        )

        unmount()

        expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    })

    it('stops reconnecting after repeated 1006 failures', () => {
        render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        )

        // Simulate multiple 1006 failures with exponential backoff
        // 1s → 2s → 4s → 8s (delay > 8000 on next close = stop)
        for (let i = 0; i < 4; i++) {
            const wsIndex = MockWebSocket.instances.length - 1
            act(() => {
                MockWebSocket.instances[wsIndex].onclose?.(
                    new CloseEvent('close', { code: 1006 })
                )
            })
            act(() => {
                jest.advanceTimersByTime(30000)
            })
        }

        const countAfterStorm = MockWebSocket.instances.length

        // Next 1006 close should NOT trigger reconnect (delay > 8000)
        act(() => {
            MockWebSocket.instances[countAfterStorm - 1].onclose?.(
                new CloseEvent('close', { code: 1006 })
            )
        })
        act(() => {
            jest.advanceTimersByTime(60000)
        })

        expect(MockWebSocket.instances).toHaveLength(countAfterStorm)
    })
})

describe('useWebSocketContext', () => {
    it('returns null when used outside provider', () => {
        function Standalone() {
            const ctx = useWebSocketContext()
            return <span data-testid="ctx">{ctx === null ? 'null' : 'present'}</span>
        }

        render(<Standalone />)
        expect(screen.getByTestId('ctx')).toHaveTextContent('null')
    })
})
