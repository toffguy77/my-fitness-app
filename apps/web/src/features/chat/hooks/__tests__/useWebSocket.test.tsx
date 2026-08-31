import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useWebSocket } from '../useWebSocket'

const mockContext = {
    sendEvent: jest.fn(),
    lastEvent: null,
    isConnected: true,
}

let contextValue: typeof mockContext | null = mockContext

jest.mock('../../components/WebSocketProvider', () => ({
    useWebSocketContext: () => contextValue,
}))

// The hook is now purely an accessor: connection handling lives in
// WebSocketProvider, which its own tests cover. What matters here is that the
// hook never opens a socket of its own — a second socket per user was the
// defect that the duplicated implementation caused.
describe('useWebSocket', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>

    afterEach(() => {
        contextValue = mockContext
        jest.clearAllMocks()
    })

    it('exposes the shared connection from the provider', () => {
        const { result } = renderHook(() => useWebSocket(), { wrapper })

        expect(result.current.isConnected).toBe(true)
        result.current.sendEvent({ type: 'typing', data: {} } as never)
        expect(mockContext.sendEvent).toHaveBeenCalled()
    })

    it('never constructs a WebSocket itself', () => {
        const spy = jest.spyOn(global, 'WebSocket' as never)

        renderHook(() => useWebSocket(), { wrapper })

        expect(spy).not.toHaveBeenCalled()
        spy.mockRestore()
    })

    it('degrades to a no-op outside a provider instead of opening a connection', () => {
        contextValue = null
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

        const { result } = renderHook(() => useWebSocket(), { wrapper })

        expect(result.current.isConnected).toBe(false)
        expect(result.current.lastEvent).toBeNull()
        expect(() => result.current.sendEvent({ type: 'typing', data: {} } as never)).not.toThrow()
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })
})
