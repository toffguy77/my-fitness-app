/**
 * Integration Tests: Chat Realtime Subscriptions
 * Tests full flow of sending and receiving messages through realtime subscriptions
 * **Requirements: 1.2, 1.3**
 */

import { createClient } from '@/utils/supabase/client'
import { subscribeToMessages, sendTypingEvent, unsubscribeFromChannel, type Message } from '../chat/realtime'
import { validateMessage } from '../chat/validation'

// Mock Supabase client for integration testing
const mockChannel = {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(), // Return this to chain properly
    send: jest.fn().mockResolvedValue(undefined),
    topic: 'test-channel',
}

const mockSupabase = {
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn(),
    from: jest.fn(() => ({
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
}

jest.mock('../supabase/client', () => ({
    createClient: jest.fn(() => mockSupabase),
}))

jest.mock('../logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}))

describe('Chat Realtime Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    describe('Full Message Flow', () => {
        it('should handle complete message sending and receiving flow', async () => {
            const userId = 'user-1'
            const otherUserId = 'user-2'
            const messageContent = 'Test integration message'

            // Track received messages
            const receivedMessages: Message[] = []
            const onNewMessage = jest.fn((message: Message) => {
                receivedMessages.push(message)
            })

            // Subscribe to messages
            const channel = subscribeToMessages(userId, otherUserId, onNewMessage)
            expect(channel).toBeDefined()

            // Verify subscription setup
            expect(mockSupabase.channel).toHaveBeenCalledWith(`chat:${userId}:${otherUserId}`)
            expect(mockChannel.on).toHaveBeenCalledWith(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `sender_id=eq.${otherUserId}.and.receiver_id=eq.${userId}`,
                },
                expect.any(Function)
            )

            // Simulate successful subscription
            const statusCallback = mockChannel.subscribe.mock.calls[0][0]
            statusCallback('SUBSCRIBED')

            // Simulate receiving a message
            const messageCallback = mockChannel.on.mock.calls[0][2]
            const testMessage: Message = {
                id: 'msg-1',
                sender_id: otherUserId,
                receiver_id: userId,
                content: messageContent,
                created_at: new Date().toISOString(),
                read_at: null,
                is_deleted: false,
            }

            messageCallback({ new: testMessage })

            // Verify message was received
            expect(onNewMessage).toHaveBeenCalledWith(testMessage)
            expect(receivedMessages).toHaveLength(1)
            expect(receivedMessages[0]).toEqual(testMessage)

            // Clean up
            unsubscribeFromChannel(channel)
            expect(mockSupabase.removeChannel).toHaveBeenCalledWith(channel)
        })

        it('should handle bidirectional communication', async () => {
            const user1 = 'user-1'
            const user2 = 'user-2'

            // Set up subscriptions for both users
            const user1Messages: Message[] = []
            const user2Messages: Message[] = []

            const user1Channel = subscribeToMessages(user1, user2, (msg) => user1Messages.push(msg))
            const user2Channel = subscribeToMessages(user2, user1, (msg) => user2Messages.push(msg))

            // Simulate both subscriptions being successful
            const user1StatusCallback = mockChannel.subscribe.mock.calls[0][0]
            const user2StatusCallback = mockChannel.subscribe.mock.calls[1][0]

            user1StatusCallback('SUBSCRIBED')
            user2StatusCallback('SUBSCRIBED')

            // Get message callbacks for both users
            const user1MessageCallback = mockChannel.on.mock.calls[0][2]
            const user2MessageCallback = mockChannel.on.mock.calls[1][2] // Second subscription's callback

            // Simulate user2 sending message to user1
            const messageFromUser2: Message = {
                id: 'msg-1',
                sender_id: user2,
                receiver_id: user1,
                content: 'Hello from user2',
                created_at: new Date().toISOString(),
                read_at: null,
                is_deleted: false,
            }

            user1MessageCallback({ new: messageFromUser2 })

            // Simulate user1 sending message to user2
            const messageFromUser1: Message = {
                id: 'msg-2',
                sender_id: user1,
                receiver_id: user2,
                content: 'Hello from user1',
                created_at: new Date().toISOString(),
                read_at: null,
                is_deleted: false,
            }

            user2MessageCallback({ new: messageFromUser1 })

            // Verify bidirectional communication
            expect(user1Messages).toHaveLength(1)
            expect(user1Messages[0]).toEqual(messageFromUser2)

            expect(user2Messages).toHaveLength(1)
            expect(user2Messages[0]).toEqual(messageFromUser1)

            // Clean up
            unsubscribeFromChannel(user1Channel)
            unsubscribeFromChannel(user2Channel)
        })

        it('should handle message validation before sending', async () => {
            const userId = 'user-1'
            const otherUserId = 'user-2'

            // Test valid message
            const validMessage = 'This is a valid message'
            const validationResult = validateMessage(validMessage)
            expect(validationResult.isValid).toBe(true)

            // Test invalid message (empty)
            const invalidMessage = '   '
            const invalidValidationResult = validateMessage(invalidMessage)
            expect(invalidValidationResult.isValid).toBe(false)
            expect(invalidValidationResult.errorType).toBe('empty')

            // Test message too long
            const longMessage = 'a'.repeat(1001)
            const longValidationResult = validateMessage(longMessage)
            expect(longValidationResult.isValid).toBe(false)
            expect(longValidationResult.errorType).toBe('too_long')

            // Only valid messages should proceed to subscription
            const onNewMessage = jest.fn()
            const channel = subscribeToMessages(userId, otherUserId, onNewMessage)

            // Simulate receiving only valid message
            const messageCallback = mockChannel.on.mock.calls[0][2]
            const testMessage: Message = {
                id: 'msg-1',
                sender_id: otherUserId,
                receiver_id: userId,
                content: validMessage,
                created_at: new Date().toISOString(),
                read_at: null,
                is_deleted: false,
            }

            messageCallback({ new: testMessage })
            expect(onNewMessage).toHaveBeenCalledWith(testMessage)

            unsubscribeFromChannel(channel)
        })

        it('should handle connection errors and recovery', async () => {
            const userId = 'user-1'
            const otherUserId = 'user-2'
            const statusChanges: any[] = []

            const onStatusChange = jest.fn((status) => {
                statusChanges.push(status)
            })

            const channel = subscribeToMessages(userId, otherUserId, jest.fn(), onStatusChange)
            const statusCallback = mockChannel.subscribe.mock.calls[0][0]

            // Simulate connection error
            statusCallback('CHANNEL_ERROR')

            // Should have two status changes: initial error + reconnection attempt
            expect(statusChanges).toHaveLength(2)
            expect(statusChanges[0]).toMatchObject({
                connected: false,
                reconnecting: false,
                error: expect.stringContaining('Переподключение'),
                errorType: 'server',
            })
            expect(statusChanges[1]).toMatchObject({
                connected: false,
                reconnecting: true,
                error: expect.stringContaining('попытка 1/5'),
                errorType: 'server',
            })

            // Simulate successful reconnection after delay
            jest.advanceTimersByTime(2000)
            statusCallback('SUBSCRIBED')

            // Should have three status changes: initial error + reconnection attempt + successful connection
            expect(statusChanges).toHaveLength(3)
            expect(statusChanges[2]).toMatchObject({
                connected: true,
                reconnecting: false,
                error: null,
                lastConnected: expect.any(Date),
            })

            unsubscribeFromChannel(channel)
        })

        it('should handle typing events integration', async () => {
            const userId = 'user-1'
            const otherUserId = 'user-2'

            // Test sending typing event
            await sendTypingEvent(userId, otherUserId, true)

            expect(mockSupabase.channel).toHaveBeenCalledWith(`typing:${otherUserId}:${userId}`)
            expect(mockChannel.subscribe).toHaveBeenCalled()
            expect(mockChannel.send).toHaveBeenCalledWith({
                type: 'broadcast',
                event: 'typing',
                payload: { userId, isTyping: true },
            })

            // Test stopping typing
            await sendTypingEvent(userId, otherUserId, false)

            expect(mockChannel.send).toHaveBeenCalledWith({
                type: 'broadcast',
                event: 'typing',
                payload: { userId, isTyping: false },
            })
        })

        it('should handle multiple concurrent subscriptions', async () => {
            const user1 = 'user-1'
            const user2 = 'user-2'
            const user3 = 'user-3'

            // Create multiple subscriptions
            const channels = [
                subscribeToMessages(user1, user2, jest.fn()),
                subscribeToMessages(user1, user3, jest.fn()),
                subscribeToMessages(user2, user3, jest.fn()),
            ]

            // Verify all channels were created with correct names
            expect(mockSupabase.channel).toHaveBeenCalledWith(`chat:${user1}:${user2}`)
            expect(mockSupabase.channel).toHaveBeenCalledWith(`chat:${user1}:${user3}`)
            expect(mockSupabase.channel).toHaveBeenCalledWith(`chat:${user2}:${user3}`)

            // Verify all subscriptions were set up
            expect(mockChannel.on).toHaveBeenCalledTimes(3)
            expect(mockChannel.subscribe).toHaveBeenCalledTimes(3)

            // Verify all channels are defined
            channels.forEach(channel => {
                expect(channel).toBeDefined()
            })

            // Clean up all channels
            channels.forEach(channel => {
                if (channel) {
                    unsubscribeFromChannel(channel)
                }
            })
            expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(3)
        })

        it('should handle message ordering and chronological display', async () => {
            const userId = 'user-1'
            const otherUserId = 'user-2'
            const receivedMessages: Message[] = []

            const onNewMessage = jest.fn((message: Message) => {
                receivedMessages.push(message)
            })

            const channel = subscribeToMessages(userId, otherUserId, onNewMessage)
            const messageCallback = mockChannel.on.mock.calls[0][2]

            // Simulate receiving messages in different order
            const now = new Date()
            const messages: Message[] = [
                {
                    id: 'msg-3',
                    sender_id: otherUserId,
                    receiver_id: userId,
                    content: 'Third message',
                    created_at: new Date(now.getTime() + 2000).toISOString(),
                    read_at: null,
                    is_deleted: false,
                },
                {
                    id: 'msg-1',
                    sender_id: otherUserId,
                    receiver_id: userId,
                    content: 'First message',
                    created_at: now.toISOString(),
                    read_at: null,
                    is_deleted: false,
                },
                {
                    id: 'msg-2',
                    sender_id: otherUserId,
                    receiver_id: userId,
                    content: 'Second message',
                    created_at: new Date(now.getTime() + 1000).toISOString(),
                    read_at: null,
                    is_deleted: false,
                },
            ]

            // Send messages in non-chronological order
            messages.forEach(message => {
                messageCallback({ new: message })
            })

            // Verify all messages were received
            expect(receivedMessages).toHaveLength(3)

            // Messages should be received in the order they arrive (realtime order)
            expect(receivedMessages[0].content).toBe('Third message')
            expect(receivedMessages[1].content).toBe('First message')
            expect(receivedMessages[2].content).toBe('Second message')

            // But they should have correct timestamps for proper sorting in UI
            expect(new Date(receivedMessages[0].created_at).getTime()).toBeGreaterThan(
                new Date(receivedMessages[1].created_at).getTime()
            )

            unsubscribeFromChannel(channel)
        })

        it('should handle subscription cleanup properly', async () => {
            const userId = 'user-1'
            const otherUserId = 'user-2'

            const channel = subscribeToMessages(userId, otherUserId, jest.fn())

            // Verify subscription was created
            expect(mockSupabase.channel).toHaveBeenCalledWith(`chat:${userId}:${otherUserId}`)
            expect(channel).toBeDefined()

            // Clean up subscription
            if (channel) {
                unsubscribeFromChannel(channel)

                // Verify cleanup was called
                expect(mockSupabase.removeChannel).toHaveBeenCalledWith(channel)
            }

            // Verify no errors during cleanup
            expect(() => {
                if (channel) {
                    unsubscribeFromChannel(channel)
                }
            }).not.toThrow()
        })
    })

    describe('Error Handling Integration', () => {
        it('should handle network errors gracefully', async () => {
            const userId = 'user-1'
            const otherUserId = 'user-2'
            const statusChanges: any[] = []

            const onStatusChange = jest.fn((status) => {
                statusChanges.push(status)
            })

            const channel = subscribeToMessages(userId, otherUserId, jest.fn(), onStatusChange)
            const statusCallback = mockChannel.subscribe.mock.calls[0][0]

            // Simulate various error conditions
            const errorConditions = ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']

            errorConditions.forEach((errorStatus, index) => {
                statusCallback(errorStatus)

                expect(statusChanges[index]).toMatchObject({
                    connected: false,
                    error: expect.any(String),
                    errorType: expect.any(String),
                })
            })

            unsubscribeFromChannel(channel)
        })

        it('should handle typing event errors without affecting message flow', async () => {
            const userId = 'user-1'
            const otherUserId = 'user-2'

            // Mock typing event failure
            mockChannel.send.mockRejectedValueOnce(new Error('Network error'))

            // Typing event should fail gracefully
            await expect(sendTypingEvent(userId, otherUserId, true)).resolves.toBeUndefined()

            // Message subscription should still work
            const onNewMessage = jest.fn()
            const channel = subscribeToMessages(userId, otherUserId, onNewMessage)

            // Verify channel was created
            expect(channel).toBeDefined()

            // Get the status callback from the subscribe call
            const subscribeCall = mockChannel.subscribe.mock.calls.find(call => typeof call[0] === 'function')
            if (subscribeCall) {
                const statusCallback = subscribeCall[0]
                statusCallback('SUBSCRIBED')
            }

            const messageCallback = mockChannel.on.mock.calls[0][2]
            const testMessage: Message = {
                id: 'msg-1',
                sender_id: otherUserId,
                receiver_id: userId,
                content: 'Message after typing error',
                created_at: new Date().toISOString(),
                read_at: null,
                is_deleted: false,
            }

            messageCallback({ new: testMessage })
            expect(onNewMessage).toHaveBeenCalledWith(testMessage)

            unsubscribeFromChannel(channel)
        })
    })
})
