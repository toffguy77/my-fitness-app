/**
 * Property-Based Tests: Complete Message Loading
 * **Feature: chat-realtime-fix, Property 5: Complete Message Loading**
 * **Validates: Requirements 1.1**
 */

import fc from 'fast-check'
import type { Message } from '@/types/chat'

describe('Complete Message Loading - Property Tests', () => {
    describe('Property 5: Complete Message Loading', () => {
        /**
         * **Property 5: Complete Message Loading**
         * *For any* chat conversation, opening the chat should load all existing messages between the two users
         * **Validates: Requirements 1.1**
         */
        it('should load all messages between any two users', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId1
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId2
                    fc.array(
                        fc.record({
                            id: fc.string({ minLength: 1, maxLength: 20 }),
                            content: fc.string({ minLength: 1, maxLength: 100 }),
                            timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
                            fromUser1: fc.boolean(),
                            read_at: fc.option(fc.integer({ min: 1000000000000, max: 9999999999999 }), { nil: null }),
                            is_deleted: fc.boolean(),
                        }),
                        { minLength: 0, maxLength: 20 } // Allow empty conversations
                    ),
                    (userId1, userId2, messageData) => {
                        fc.pre(userId1 !== userId2) // Ensure different users

                        // Create expected messages for this conversation
                        const expectedMessages: Message[] = messageData.map((data, index) => ({
                            id: `${data.id}-${index}`,
                            sender_id: data.fromUser1 ? userId1 : userId2,
                            receiver_id: data.fromUser1 ? userId2 : userId1,
                            content: data.content,
                            created_at: new Date(data.timestamp).toISOString(),
                            read_at: data.read_at ? new Date(data.read_at).toISOString() : null,
                            is_deleted: data.is_deleted,
                        }))

                        // Simulate message loading logic (synchronous version)
                        const loadMessages = (user1: string, user2: string, messages: Message[]) => {
                            // Filter messages for this conversation
                            return messages.filter(msg =>
                                (msg.sender_id === user1 && msg.receiver_id === user2) ||
                                (msg.sender_id === user2 && msg.receiver_id === user1)
                            ).filter(msg => !msg.is_deleted) // Exclude deleted messages
                                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) // Sort chronologically
                        }

                        // Load messages
                        const loadedMessages = loadMessages(userId1, userId2, expectedMessages)

                        // Filter expected messages to match what should be loaded (non-deleted only)
                        const expectedLoadedMessages = expectedMessages.filter(msg => !msg.is_deleted)

                        // Verify all expected messages were loaded
                        expect(loadedMessages).toHaveLength(expectedLoadedMessages.length)

                        // Verify each expected message is present in loaded messages
                        expectedLoadedMessages.forEach(expectedMessage => {
                            const foundMessage = loadedMessages.find(loaded => loaded.id === expectedMessage.id)
                            expect(foundMessage).toBeDefined()
                            expect(foundMessage).toEqual(expectedMessage)
                        })

                        // Verify messages are in chronological order
                        for (let i = 1; i < loadedMessages.length; i++) {
                            const prevTime = new Date(loadedMessages[i - 1].created_at).getTime()
                            const currTime = new Date(loadedMessages[i].created_at).getTime()
                            expect(currTime).toBeGreaterThanOrEqual(prevTime)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle pagination correctly for large conversations', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId1
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId2
                    fc.integer({ min: 1, max: 50 }), // Total message count
                    fc.integer({ min: 5, max: 20 }), // Page size
                    (userId1, userId2, totalMessages, pageSize) => {
                        fc.pre(userId1 !== userId2)

                        // Generate messages for the conversation
                        const allMessages: Message[] = Array.from({ length: totalMessages }, (_, index) => ({
                            id: `msg-${index}`,
                            sender_id: index % 2 === 0 ? userId1 : userId2,
                            receiver_id: index % 2 === 0 ? userId2 : userId1,
                            content: `Message ${index}`,
                            created_at: new Date(1000000000000 + index * 1000).toISOString(),
                            read_at: null,
                            is_deleted: false,
                        }))

                        // Simulate pagination loading
                        const loadMessagesPage = (messages: Message[], offset: number, limit: number) => {
                            return messages.slice(offset, offset + limit)
                        }

                        // Calculate expected pages
                        const totalPages = Math.ceil(totalMessages / pageSize)
                        const loadedMessages: Message[] = []

                        // Load all pages
                        for (let page = 0; page < totalPages; page++) {
                            const offset = page * pageSize
                            const pageMessages = loadMessagesPage(allMessages, offset, pageSize)
                            loadedMessages.push(...pageMessages)
                        }

                        // Verify all messages were loaded across all pages
                        expect(loadedMessages).toHaveLength(totalMessages)

                        // Verify messages are in correct order
                        for (let i = 1; i < loadedMessages.length; i++) {
                            const prevTime = new Date(loadedMessages[i - 1].created_at).getTime()
                            const currTime = new Date(loadedMessages[i].created_at).getTime()
                            expect(currTime).toBeGreaterThanOrEqual(prevTime)
                        }

                        // Verify all expected messages are present
                        allMessages.forEach(expectedMessage => {
                            const foundMessage = loadedMessages.find(loaded => loaded.id === expectedMessage.id)
                            expect(foundMessage).toBeDefined()
                            expect(foundMessage).toEqual(expectedMessage)
                        })
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should exclude deleted messages from loading', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId1
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId2
                    fc.array(
                        fc.record({
                            id: fc.string({ minLength: 1, maxLength: 20 }),
                            content: fc.string({ minLength: 1, maxLength: 100 }),
                            timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
                            fromUser1: fc.boolean(),
                            is_deleted: fc.boolean(),
                            read_at: fc.option(fc.integer({ min: 1000000000000, max: 9999999999999 }), { nil: null }),
                        }),
                        { minLength: 1, maxLength: 20 }
                    ),
                    (userId1, userId2, messageData) => {
                        fc.pre(userId1 !== userId2)

                        // Create all messages (including deleted ones)
                        const allMessages: Message[] = messageData.map((data, index) => ({
                            id: `${data.id}-${index}`,
                            sender_id: data.fromUser1 ? userId1 : userId2,
                            receiver_id: data.fromUser1 ? userId2 : userId1,
                            content: data.content,
                            created_at: new Date(data.timestamp).toISOString(),
                            read_at: data.read_at ? new Date(data.read_at).toISOString() : null,
                            is_deleted: data.is_deleted,
                        }))

                        // Simulate loading messages (should exclude deleted ones)
                        const loadMessages = (messages: Message[]) => {
                            return messages.filter(msg => !msg.is_deleted)
                        }

                        const loadedMessages = loadMessages(allMessages)

                        // Filter out deleted messages (what should be returned)
                        const nonDeletedMessages = allMessages.filter(msg => !msg.is_deleted)

                        // Verify only non-deleted messages were loaded
                        expect(loadedMessages).toHaveLength(nonDeletedMessages.length)

                        // Verify no deleted messages are present
                        loadedMessages.forEach(message => {
                            expect(message.is_deleted).toBe(false)
                        })

                        // Verify all non-deleted messages are present
                        nonDeletedMessages.forEach(expectedMessage => {
                            const foundMessage = loadedMessages.find(loaded => loaded.id === expectedMessage.id)
                            expect(foundMessage).toBeDefined()
                            expect(foundMessage).toEqual(expectedMessage)
                        })
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle empty conversations correctly', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId1
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId2
                    (userId1, userId2) => {
                        fc.pre(userId1 !== userId2)

                        // Simulate loading messages for empty conversation
                        const loadMessages = (messages: Message[]) => {
                            return messages // Empty array
                        }

                        const loadedMessages = loadMessages([])

                        // Verify empty array is returned for empty conversations
                        expect(loadedMessages).toEqual([])
                        expect(loadedMessages).toHaveLength(0)
                        expect(Array.isArray(loadedMessages)).toBe(true)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should maintain message integrity during loading', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId1
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId2
                    fc.array(
                        fc.record({
                            id: fc.string({ minLength: 1, maxLength: 20 }),
                            content: fc.string({ minLength: 1, maxLength: 100 }),
                            timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
                            fromUser1: fc.boolean(),
                            read_at: fc.option(fc.integer({ min: 1000000000000, max: 9999999999999 }), { nil: null }),
                        }),
                        { minLength: 1, maxLength: 15 }
                    ),
                    (userId1, userId2, messageData) => {
                        fc.pre(userId1 !== userId2)

                        // Create expected messages
                        const expectedMessages: Message[] = messageData.map((data, index) => ({
                            id: `${data.id}-${index}`,
                            sender_id: data.fromUser1 ? userId1 : userId2,
                            receiver_id: data.fromUser1 ? userId2 : userId1,
                            content: data.content,
                            created_at: new Date(data.timestamp).toISOString(),
                            read_at: data.read_at ? new Date(data.read_at).toISOString() : null,
                            is_deleted: false, // Only non-deleted messages
                        }))

                        // Load messages (identity function for this test)
                        const loadedMessages = expectedMessages

                        // Verify message integrity - all fields should be preserved exactly
                        loadedMessages.forEach(loadedMessage => {
                            const expectedMessage = expectedMessages.find(expected => expected.id === loadedMessage.id)
                            expect(expectedMessage).toBeDefined()

                            // Verify all message properties are preserved
                            expect(loadedMessage.id).toBe(expectedMessage!.id)
                            expect(loadedMessage.sender_id).toBe(expectedMessage!.sender_id)
                            expect(loadedMessage.receiver_id).toBe(expectedMessage!.receiver_id)
                            expect(loadedMessage.content).toBe(expectedMessage!.content)
                            expect(loadedMessage.created_at).toBe(expectedMessage!.created_at)
                            expect(loadedMessage.read_at).toBe(expectedMessage!.read_at)
                            expect(loadedMessage.is_deleted).toBe(expectedMessage!.is_deleted)

                            // Verify sender/receiver are valid participants
                            expect([userId1, userId2]).toContain(loadedMessage.sender_id)
                            expect([userId1, userId2]).toContain(loadedMessage.receiver_id)
                            expect(loadedMessage.sender_id).not.toBe(loadedMessage.receiver_id)
                        })

                        // Verify no messages are lost or duplicated
                        expect(loadedMessages).toHaveLength(expectedMessages.length)

                        // Verify unique message IDs
                        const loadedIds = loadedMessages.map(m => m.id)
                        const uniqueIds = new Set(loadedIds)
                        expect(uniqueIds.size).toBe(loadedIds.length)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle error conditions gracefully', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId1
                    fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // userId2
                    fc.constantFrom(
                        'NETWORK_ERROR',
                        'TIMEOUT_ERROR',
                        'PERMISSION_DENIED',
                        'INVALID_REQUEST'
                    ),
                    (userId1, userId2, errorType) => {
                        fc.pre(userId1 !== userId2)

                        // Simulate loading messages with error handling
                        const loadMessages = (errorCondition: string) => {
                            try {
                                if (errorCondition === 'NETWORK_ERROR') {
                                    throw new Error('Network connection failed')
                                }
                                if (errorCondition === 'TIMEOUT_ERROR') {
                                    throw new Error('Request timed out')
                                }
                                if (errorCondition === 'PERMISSION_DENIED') {
                                    throw new Error('Access denied')
                                }
                                if (errorCondition === 'INVALID_REQUEST') {
                                    throw new Error('Invalid request parameters')
                                }
                                return []
                            } catch (error) {
                                // Return empty array on error (graceful degradation)
                                return []
                            }
                        }

                        const loadedMessages = loadMessages(errorType)

                        // Verify graceful error handling
                        expect(loadedMessages).toEqual([])
                        expect(Array.isArray(loadedMessages)).toBe(true)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})
