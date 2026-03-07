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
