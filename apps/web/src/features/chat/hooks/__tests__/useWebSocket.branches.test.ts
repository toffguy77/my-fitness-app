/**
 * useWebSocket Branch Coverage Tests
 *
 * Targets uncovered branches: reconnect logic on close, malformed message
 * handling, context mode delegation, sendEvent when not open,
 * and cleanup on unmount.
 *
 * @module chat/hooks/__tests__/useWebSocket.branches.test
 */

import { renderHook, act } from '@testing-library/react';

// ============================================================================
// Tests: Standalone (fallback) mode — context returns null
// ============================================================================

describe('useWebSocket branches (standalone mode)', () => {
    // Mock WebSocket class
    class MockWebSocket {
        static OPEN = 1;
        static CLOSED = 3;
        static instances: MockWebSocket[] = [];

        url: string;
        readyState: number = 0;
        onopen: ((ev: Event) => void) | null = null;
        onclose: ((ev: CloseEvent) => void) | null = null;
        onmessage: ((ev: MessageEvent) => void) | null = null;
        send = jest.fn();
        close = jest.fn();

        constructor(url: string) {
            this.url = url;
            MockWebSocket.instances.push(this);
        }

        simulateOpen() {
            this.readyState = MockWebSocket.OPEN;
            this.onopen?.(new Event('open'));
        }

        simulateMessage(data: unknown) {
            this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
        }

        simulateMessageRaw(data: string) {
            this.onmessage?.(new MessageEvent('message', { data }));
        }

        simulateClose() {
            this.readyState = MockWebSocket.CLOSED;
            this.onclose?.({} as CloseEvent);
        }
    }

    const originalWebSocket = global.WebSocket;

    // Mock context to return null so standalone mode is used
    jest.mock('../../components/WebSocketProvider', () => ({
        useWebSocketContext: jest.fn().mockReturnValue(null),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useWebSocket } = require('../useWebSocket');

    beforeEach(() => {
        MockWebSocket.instances = [];
        global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
        localStorage.setItem('auth_token', 'test-token');
        jest.useFakeTimers();
    });

    afterEach(() => {
        global.WebSocket = originalWebSocket;
        localStorage.clear();
        jest.useRealTimers();
    });

    // -------------------------------------------------------------------------
    // Reconnect logic on close (lines 44-49)
    // -------------------------------------------------------------------------
    describe('Reconnect on close', () => {
        it('reconnects after close when auth token is present', () => {
            renderHook(() => useWebSocket());

            expect(MockWebSocket.instances).toHaveLength(1);

            act(() => {
                MockWebSocket.instances[0].simulateClose();
            });

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            expect(MockWebSocket.instances).toHaveLength(2);
        });

        it('does not reconnect when auth token is removed', () => {
            renderHook(() => useWebSocket());

            expect(MockWebSocket.instances).toHaveLength(1);

            localStorage.removeItem('auth_token');

            act(() => {
                MockWebSocket.instances[0].simulateClose();
            });

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            expect(MockWebSocket.instances).toHaveLength(1);
        });

        it('uses exponential backoff for reconnect delay', () => {
            renderHook(() => useWebSocket());

            // First close
            act(() => {
                MockWebSocket.instances[0].simulateClose();
            });

            act(() => {
                jest.advanceTimersByTime(1000);
            });
            expect(MockWebSocket.instances).toHaveLength(2);

            // Second close — delay should be 2000ms
            act(() => {
                MockWebSocket.instances[1].simulateClose();
            });

            act(() => {
                jest.advanceTimersByTime(1000);
            });
            // Not yet — only 1000ms passed, need 2000ms
            expect(MockWebSocket.instances).toHaveLength(2);

            act(() => {
                jest.advanceTimersByTime(1000);
            });
            expect(MockWebSocket.instances).toHaveLength(3);
        });

        it('resets reconnect delay on successful connection', () => {
            renderHook(() => useWebSocket());

            // Close and reconnect
            act(() => {
                MockWebSocket.instances[0].simulateClose();
            });
            act(() => {
                jest.advanceTimersByTime(1000);
            });
            expect(MockWebSocket.instances).toHaveLength(2);

            // Successful open resets delay
            act(() => {
                MockWebSocket.instances[1].simulateOpen();
            });

            // Close again
            act(() => {
                MockWebSocket.instances[1].simulateClose();
            });

            // Should reconnect after 1000ms (reset delay)
            act(() => {
                jest.advanceTimersByTime(1000);
            });
            expect(MockWebSocket.instances).toHaveLength(3);
        });
    });

    // -------------------------------------------------------------------------
    // Malformed message handling (lines 58-60)
    // -------------------------------------------------------------------------
    describe('Malformed message handling', () => {
        it('ignores malformed JSON messages without throwing', () => {
            const { result } = renderHook(() => useWebSocket());

            act(() => {
                MockWebSocket.instances[0].simulateOpen();
            });

            act(() => {
                MockWebSocket.instances[0].simulateMessageRaw('not json {{{');
            });

            expect(result.current.lastEvent).toBeNull();
        });
    });

    // -------------------------------------------------------------------------
    // sendEvent when WebSocket is not open (line 75)
    // -------------------------------------------------------------------------
    describe('sendEvent when not connected', () => {
        it('does not send when WebSocket readyState is not OPEN', () => {
            const { result } = renderHook(() => useWebSocket());

            // WebSocket not yet open (readyState = 0)
            act(() => {
                result.current.sendEvent({ type: 'test', data: {} });
            });

            expect(MockWebSocket.instances[0].send).not.toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------------
    // Cleanup on unmount (lines 68-71)
    // -------------------------------------------------------------------------
    describe('Cleanup on unmount', () => {
        it('closes WebSocket on unmount', () => {
            const { unmount } = renderHook(() => useWebSocket());

            const ws = MockWebSocket.instances[0];
            unmount();

            expect(ws.close).toHaveBeenCalled();
        });

        it('does not reconnect after unmount', () => {
            const { unmount } = renderHook(() => useWebSocket());

            unmount();

            const ws = MockWebSocket.instances[0];
            ws.onclose?.({} as CloseEvent);

            act(() => {
                jest.advanceTimersByTime(5000);
            });

            expect(MockWebSocket.instances).toHaveLength(1);
        });

        it('does not update state after unmount when open fires', () => {
            const { unmount } = renderHook(() => useWebSocket());

            const ws = MockWebSocket.instances[0];
            unmount();

            expect(() => {
                ws.onopen?.(new Event('open'));
            }).not.toThrow();
        });

        it('does not update state after unmount when message fires', () => {
            const { unmount } = renderHook(() => useWebSocket());

            const ws = MockWebSocket.instances[0];
            unmount();

            expect(() => {
                ws.onmessage?.(new MessageEvent('message', { data: '{"type":"test"}' }));
            }).not.toThrow();
        });
    });
});

// ============================================================================
// Tests: Context mode — context returns a value
// ============================================================================

describe('useWebSocket branches (context mode)', () => {
    const mockCtxSendEvent = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('delegates to context when available', () => {
        // We test context mode by mocking useWebSocketContext differently
        // Since the module is already loaded, we use the mock directly
        const { useWebSocketContext } = require('../../components/WebSocketProvider');
        const ctxValue = {
            sendEvent: mockCtxSendEvent,
            lastEvent: { type: 'new_message', data: { id: '1' } },
            isConnected: true,
        };
        (useWebSocketContext as jest.Mock).mockReturnValueOnce(ctxValue);

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useWebSocket } = require('../useWebSocket');
        const { result } = renderHook(() => useWebSocket());

        expect(result.current.isConnected).toBe(true);
        expect(result.current.lastEvent).toEqual(ctxValue.lastEvent);

        act(() => {
            result.current.sendEvent({ type: 'test', data: {} });
        });

        expect(mockCtxSendEvent).toHaveBeenCalled();
    });
});
