/**
 * useChat Branch Coverage Tests
 *
 * Targets uncovered branches: error states in initial load, WebSocket
 * message handling (duplicate avoidance, different conversation),
 * sendMessage/sendFile/sendTyping with null conversationId, file type
 * detection, and loadMore guard conditions.
 *
 * @module chat/hooks/__tests__/useChat.branches.test
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '../useChat';
import { chatApi } from '../../api/chatApi';
import type { Message, WebSocketEvent } from '../../types';

// ============================================================================
// Mocks
// ============================================================================

const mockSendEvent = jest.fn();
let mockLastEvent: WebSocketEvent | null = null;

jest.mock('../../api/chatApi', () => ({
    chatApi: {
        getMessages: jest.fn(),
        sendMessage: jest.fn(),
        uploadFile: jest.fn(),
    },
}));

jest.mock('../useWebSocket', () => ({
    useWebSocket: () => ({
        lastEvent: mockLastEvent,
        sendEvent: mockSendEvent,
        isConnected: true,
    }),
}));

const mockChatApi = chatApi as jest.Mocked<typeof chatApi>;

function makeMessage(id: string, convId = 'conv-1', content = 'test'): Message {
    return {
        id,
        conversation_id: convId,
        sender_id: 1,
        type: 'text',
        content,
        created_at: '2025-01-01T12:00:00Z',
    };
}

// ============================================================================
// Tests
// ============================================================================

describe('useChat Branch Coverage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLastEvent = null;
    });

    // -------------------------------------------------------------------------
    // Error state in initial load (lines 46-47)
    // -------------------------------------------------------------------------
    describe('Initial load error', () => {
        it('sets isLoading to false when getMessages rejects', async () => {
            mockChatApi.getMessages.mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() => useChat('conv-1'));

            expect(result.current.isLoading).toBe(true);

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(result.current.messages).toEqual([]);
        });
    });

    // -------------------------------------------------------------------------
    // WebSocket new_message handling (lines 60-66)
    // -------------------------------------------------------------------------
    describe('WebSocket message handling', () => {
        it('ignores events that are not new_message', async () => {
            mockChatApi.getMessages.mockResolvedValue([]);
            mockLastEvent = { type: 'typing', data: {} };

            const { result } = renderHook(() => useChat('conv-1'));

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(result.current.messages).toEqual([]);
        });

        it('ignores messages for a different conversation', async () => {
            mockChatApi.getMessages.mockResolvedValue([]);

            const { result, rerender } = renderHook(() => useChat('conv-1'));

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // Simulate new message for a different conversation
            mockLastEvent = {
                type: 'new_message',
                data: makeMessage('msg-other', 'conv-other'),
            };
            rerender();

            expect(result.current.messages).toEqual([]);
        });

        it('avoids duplicate messages from WebSocket', async () => {
            const msg = makeMessage('msg-1');
            mockChatApi.getMessages.mockResolvedValue([msg]);

            const { result, rerender } = renderHook(() => useChat('conv-1'));

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // Simulate the same message arriving via WebSocket
            mockLastEvent = { type: 'new_message', data: msg };
            rerender();

            // Should still only have 1 message, not 2
            expect(result.current.messages).toHaveLength(1);
        });

        it('adds new message from WebSocket for current conversation', async () => {
            mockChatApi.getMessages.mockResolvedValue([]);

            const { result, rerender } = renderHook(() => useChat('conv-1'));

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            const newMsg = makeMessage('ws-msg-1', 'conv-1', 'hello from ws');
            mockLastEvent = { type: 'new_message', data: newMsg };
            rerender();

            expect(result.current.messages).toHaveLength(1);
            expect(result.current.messages[0].id).toBe('ws-msg-1');
        });
    });

    // -------------------------------------------------------------------------
    // sendMessage with null conversationId (line 85)
    // -------------------------------------------------------------------------
    describe('sendMessage with null conversationId', () => {
        it('does nothing when conversationId is null', async () => {
            const { result } = renderHook(() => useChat(null));

            await act(async () => {
                await result.current.sendMessage('hello');
            });

            expect(mockChatApi.sendMessage).not.toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------------
    // sendFile branches (lines 98-105)
    // -------------------------------------------------------------------------
    describe('sendFile', () => {
        it('does nothing when conversationId is null', async () => {
            const { result } = renderHook(() => useChat(null));

            const file = new File(['test'], 'test.txt', { type: 'text/plain' });
            await act(async () => {
                await result.current.sendFile(file);
            });

            expect(mockChatApi.uploadFile).not.toHaveBeenCalled();
        });

        it('sends image type for image files', async () => {
            mockChatApi.getMessages.mockResolvedValue([]);
            mockChatApi.uploadFile.mockResolvedValue({
                id: 'att-1',
                file_url: 'https://example.com/photo.jpg',
                file_name: 'photo.jpg',
                file_size: 1024,
                mime_type: 'image/jpeg',
            });
            const sentMsg = makeMessage('file-msg-1');
            mockChatApi.sendMessage.mockResolvedValue(sentMsg);

            const { result } = renderHook(() => useChat('conv-1'));

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
            await act(async () => {
                await result.current.sendFile(file);
            });

            expect(mockChatApi.sendMessage).toHaveBeenCalledWith('conv-1', {
                type: 'image',
                content: 'https://example.com/photo.jpg',
            });
        });

        it('sends file type for non-image files', async () => {
            mockChatApi.getMessages.mockResolvedValue([]);
            mockChatApi.uploadFile.mockResolvedValue({
                id: 'att-2',
                file_url: 'https://example.com/doc.pdf',
                file_name: 'doc.pdf',
                file_size: 2048,
                mime_type: 'application/pdf',
            });
            const sentMsg = makeMessage('file-msg-2');
            mockChatApi.sendMessage.mockResolvedValue(sentMsg);

            const { result } = renderHook(() => useChat('conv-1'));

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            const file = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' });
            await act(async () => {
                await result.current.sendFile(file);
            });

            expect(mockChatApi.sendMessage).toHaveBeenCalledWith('conv-1', {
                type: 'file',
                content: 'https://example.com/doc.pdf',
            });
        });
    });

    // -------------------------------------------------------------------------
    // sendTyping branches (lines 112-113)
    // -------------------------------------------------------------------------
    describe('sendTyping', () => {
        it('does nothing when conversationId is null', () => {
            const { result } = renderHook(() => useChat(null));

            act(() => {
                result.current.sendTyping();
            });

            expect(mockSendEvent).not.toHaveBeenCalled();
        });

        it('sends typing event when conversationId is provided', async () => {
            mockChatApi.getMessages.mockResolvedValue([]);

            const { result } = renderHook(() => useChat('conv-1'));

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            act(() => {
                result.current.sendTyping();
            });

            expect(mockSendEvent).toHaveBeenCalledWith({
                type: 'typing',
                data: { conversation_id: 'conv-1' },
            });
        });
    });

    // -------------------------------------------------------------------------
    // loadMore guard conditions (line 73)
    // -------------------------------------------------------------------------
    describe('loadMore guards', () => {
        it('does nothing when hasMore is false', async () => {
            // Return fewer than 50 messages so hasMore=false
            mockChatApi.getMessages.mockResolvedValue([makeMessage('1')]);

            const { result } = renderHook(() => useChat('conv-1'));

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(result.current.hasMore).toBe(false);

            await act(async () => {
                await result.current.loadMore();
            });

            // Should not have made a second API call
            expect(mockChatApi.getMessages).toHaveBeenCalledTimes(1);
        });

        it('does nothing when conversationId is null', async () => {
            const { result } = renderHook(() => useChat(null));

            await act(async () => {
                await result.current.loadMore();
            });

            expect(mockChatApi.getMessages).not.toHaveBeenCalled();
        });
    });
});
