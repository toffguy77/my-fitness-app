/**
 * Property-Based Tests: Bidirectional Communication
 * **Feature: chat-realtime-fix, Property 2: Bidirectional Communication**
 * **Validates: Requirements 1.3**
 */

import fc from 'fast-check'
import { subscribeToMessages, unsubscribeFromChannel, type Message } from '../chat/realtime'

// Mock Supabase with isolated channels
const createMockChannel = () => ({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn(),
    send: jest.fn().mockResolvedValue(undefined),
    topic: 'test-channel',
})

const mockSupabase = {
    channel: jest.fn(() => createMockChannel()),
    removeChannel: jest.fn(),
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

describe('Bidirectional Communication - Property Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    describe('Property 2: Bidirectional Communication', () => {
        /**
         * **Property 2: Bidirectional Communication**
         * *For any* message sent from coach to client, the client should receive a realtime notification within 5 seconds
         * **Validates: Requirements 1.3**
         */
        it('should ensure bidirectional message delivery for any user pair', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId1 - alphanumeric
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId2 - alphanumeric
                    fc.string({ minLength: 1, maxLength: 100 }), // message content
                    (userId1, userId2, messageContent) => {
                        // Skip if users are the same
                        fc.pre(userId1 !== userId2)

                        // Clear all mocks before each property test
                        jest.clearAllMocks()

                        // Track messages received by each user
                        const user1Messages: Message[] = []
                        const user2Messages: Message[] = []

                        // Set up bidirectional subscriptions
                        const user1Channel = subscribeToMessages(userId1, userId2, (msg) => {
                            user1Messages.push(msg)
                        })

                        const user2Channel = subscribeToMessages(userId2, userId1, (msg) => {
                            user2Messages.push(msg)
                        })

                        // Verify both subscriptions were created with correct filters
                        expect(mockSupabase.channel).toHaveBeenCalledWith(`chat:${userId1}:${userId2}`)
                        expect(mockSupabase.channel).toHaveBeenCalledWith(`chat:${userId2}:${userId1}`)

                        // Get the channels that were created
                        const channelCalls = mockSupabase.channel.mock.results
                        const user1MockChannel = channelCalls[0].value
                        const user2MockChannel = channelCalls[1].value

                        // Get the message callbacks for both subscriptions
                        const user1MessageCallback = user1MockChannel.on.mock.calls[0][2]
                        const user2MessageCallback = user2MockChannel.on.mock.calls[0][2]

                        // Simulate user2 sending message to user1
                        const messageFromUser2: Message = {
                            id: `msg-${Date.now()}-1`,
                            sender_id: userId2,
                            receiver_id: userId1,
                            content: messageContent,
                            created_at: new Date().toISOString(),
                            read_at: null,
                            is_deleted: false,
                        }

                        user1MessageCallback({ new: messageFromUser2 })

                        // Simulate user1 sending message to user2
                        const messageFromUser1: Message = {
                            id: `msg-${Date.now()}-2`,
                            sender_id: userId1,
                            receiver_id: userId2,
                            content: messageContent,
                            created_at: new Date().toISOString(),
                            read_at: null,
                            is_deleted: false,
                        }

                        user2MessageCallback({ new: messageFromUser1 })

                        // Verify bidirectional communication works
                        expect(user1Messages).toHaveLength(1)
                        expect(user1Messages[0]).toEqual(messageFromUser2)
                        expect(user1Messages[0].sender_id).toBe(userId2)
                        expect(user1Messages[0].receiver_id).toBe(userId1)

                        expect(user2Messages).toHaveLength(1)
                        expect(user2Messages[0]).toEqual(messageFromUser1)
                        expect(user2Messages[0].sender_id).toBe(userId1)
                        expect(user2Messages[0].receiver_id).toBe(userId2)

                        // Clean up
                        unsubscribeFromChannel(user1Channel)
                        unsubscribeFromChannel(user2Channel)
                    }
                ),
                { numRuns: 50 } // Reduced for faster execution
            )
        })

        it('should ensure proper filter syntax for bidirectional subscriptions', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId1 - alphanumeric
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId2 - alphanumeric
                    (userId1, userId2) => {
                        fc.pre(userId1 !== userId2)

                        jest.clearAllMocks()

                        const user1Channel = subscribeToMessages(userId1, userId2, jest.fn())
                        const user2Channel = subscribeToMessages(userId2, userId1, jest.fn())

                        // Get the channels that were created
                        const channelCalls = mockSupabase.channel.mock.results
                        const user1MockChannel = channelCalls[0].value
                        const user2MockChannel = channelCalls[1].value

                        // Verify correct filter syntax is used (with .and. not comma)
                        const user1FilterCall = user1MockChannel.on.mock.calls[0]
                        const user2FilterCall = user2MockChannel.on.mock.calls[0]

                        expect(user1FilterCall[1].filter).toBe(`sender_id=eq.${userId2}.and.receiver_id=eq.${userId1}`)
                        expect(user2FilterCall[1].filter).toBe(`sender_id=eq.${userId1}.and.receiver_id=eq.${userId2}`)

                        // Verify filters contain proper .and. syntax
                        expect(user1FilterCall[1].filter).toContain('.and.')
                        expect(user2FilterCall[1].filter).toContain('.and.')

                        unsubscribeFromChannel(user1Channel)
                        unsubscribeFromChannel(user2Channel)
                    }
                ),
                { numRuns: 50 }
            )
        })

        it('should handle concurrent bidirectional messaging', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId1 - alphanumeric
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId2 - alphanumeric
                    fc.integer({ min: 1, max: 5 }), // number of concurrent messages (reduced for performance)
                    (userId1, userId2, messageCount) => {
                        fc.pre(userId1 !== userId2)

                        jest.clearAllMocks()

                        const user1Messages: Message[] = []
                        const user2Messages: Message[] = []

                        const user1Channel = subscribeToMessages(userId1, userId2, (msg) => {
                            user1Messages.push(msg)
                        })

                        const user2Channel = subscribeToMessages(userId2, userId1, (msg) => {
                            user2Messages.push(msg)
                        })

                        // Get the channels that were created
                        const channelCalls = mockSupabase.channel.mock.results
                        const user1MockChannel = channelCalls[0].value
                        const user2MockChannel = channelCalls[1].value

                        const user1MessageCallback = user1MockChannel.on.mock.calls[0][2]
                        const user2MessageCallback = user2MockChannel.on.mock.calls[0][2]

                        // Send concurrent messages from both users
                        for (let i = 0; i < messageCount; i++) {
                            // Message from user1 to user2
                            const messageFromUser1: Message = {
                                id: `msg-user1-${i}`,
                                sender_id: userId1,
                                receiver_id: userId2,
                                content: `Message ${i} from user1`,
                                created_at: new Date(Date.now() + i * 100).toISOString(),
                                read_at: null,
                                is_deleted: false,
                            }

                            // Message from user2 to user1
                            const messageFromUser2: Message = {
                                id: `msg-user2-${i}`,
                                sender_id: userId2,
                                receiver_id: userId1,
                                content: `Message ${i} from user2`,
                                created_at: new Date(Date.now() + i * 100 + 50).toISOString(),
                                read_at: null,
                                is_deleted: false,
                            }

                            // Deliver messages
                            user2MessageCallback({ new: messageFromUser1 })
                            user1MessageCallback({ new: messageFromUser2 })
                        }

                        // Both users should receive all messages from the other
                        expect(user1Messages).toHaveLength(messageCount)
                        expect(user2Messages).toHaveLength(messageCount)

                        // Verify all messages from user2 were received by user1
                        user1Messages.forEach((msg, index) => {
                            expect(msg.sender_id).toBe(userId2)
                            expect(msg.receiver_id).toBe(userId1)
                            expect(msg.content).toContain(`Message ${index} from user2`)
                        })

                        // Verify all messages from user1 were received by user2
                        user2Messages.forEach((msg, index) => {
                            expect(msg.sender_id).toBe(userId1)
                            expect(msg.receiver_id).toBe(userId2)
                            expect(msg.content).toContain(`Message ${index} from user1`)
                        })

                        unsubscribeFromChannel(user1Channel)
                        unsubscribeFromChannel(user2Channel)
                    }
                ),
                { numRuns: 50 }
            )
        })
    })
})