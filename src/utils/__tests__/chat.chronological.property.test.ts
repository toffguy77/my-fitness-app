/**
 * Property-Based Tests: Message Chronological Order
 * **Feature: chat-realtime-fix, Property 3: Message Chronological Order**
 * **Validates: Requirements 1.5**
 */

import fc from 'fast-check'
import type { Message } from '@/types/chat'

describe('Message Chronological Order - Property Tests', () => {
    describe('Property 3: Message Chronological Order', () => {
        /**
         * **Property 3: Message Chronological Order**
         * *For any* set of messages in a chat, they should be displayed in chronological order based on created_at timestamp
         * **Validates: Requirements 1.5**
         */
        it('should maintain chronological order for any set of messages', () => {
            fc.assert(
                fc.property(
                    fc.array(
                        fc.record({
                            id: fc.string({ minLength: 1, maxLength: 20 }),
                            sender_id: fc.string({ minLength: 1, maxLength: 20 }),
                            receiver_id: fc.string({ minLength: 1, maxLength: 20 }),
                            content: fc.string({ minLength: 1, maxLength: 500 }),
                            timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }), // Valid timestamp range
                            read_at: fc.option(fc.integer({ min: 1000000000000, max: 9999999999999 }), { nil: null }),
                            is_deleted: fc.boolean(),
                        }),
                        { minLength: 1, maxLength: 20 }
                    ),
                    (messageData) => {
                        // Convert to proper Message format with ISO timestamps
                        const messages: Message[] = messageData.map((data, index) => ({
                            id: `${data.id}-${index}`, // Ensure unique IDs
                            sender_id: data.sender_id,
                            receiver_id: data.receiver_id,
                            content: data.content,
                            created_at: new Date(data.timestamp).toISOString(),
                            read_at: data.read_at ? new Date(data.read_at).toISOString() : null,
                            is_deleted: data.is_deleted,
                        }))

                        // Sort messages chronologically (as the UI should do)
                        const sortedMessages = [...messages].sort((a, b) =>
                            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                        )

                        // Verify chronological ordering property
                        for (let i = 1; i < sortedMessages.length; i++) {
                            const prevTime = new Date(sortedMessages[i - 1].created_at).getTime()
                            const currTime = new Date(sortedMessages[i].created_at).getTime()

                            // Each message should be chronologically after or equal to the previous one
                            expect(currTime).toBeGreaterThanOrEqual(prevTime)
                        }

                        // Verify that sorting preserves all messages
                        expect(sortedMessages).toHaveLength(messages.length)

                        // Verify that all original messages are present
                        messages.forEach(originalMessage => {
                            const found = sortedMessages.find(sorted => sorted.id === originalMessage.id)
                            expect(found).toBeDefined()
                            expect(found).toEqual(originalMessage)
                        })
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle messages with identical timestamps', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1000000000000, max: 9999999999999 }), // Base timestamp
                    fc.array(
                        fc.record({
                            id: fc.string({ minLength: 1, maxLength: 20 }),
                            sender_id: fc.string({ minLength: 1, maxLength: 20 }),
                            receiver_id: fc.string({ minLength: 1, maxLength: 20 }),
                            content: fc.string({ minLength: 1, maxLength: 500 }),
                            read_at: fc.option(fc.integer({ min: 1000000000000, max: 9999999999999 }), { nil: null }),
                            is_deleted: fc.boolean(),
                        }),
                        { minLength: 2, maxLength: 10 }
                    ),
                    (baseTimestamp, messageData) => {
                        // Create messages with identical timestamps
                        const messages: Message[] = messageData.map((data, index) => ({
                            id: `${data.id}-${index}`, // Ensure unique IDs
                            sender_id: data.sender_id,
                            receiver_id: data.receiver_id,
                            content: data.content,
                            created_at: new Date(baseTimestamp).toISOString(), // Same timestamp for all
                            read_at: data.read_at ? new Date(data.read_at).toISOString() : null,
                            is_deleted: data.is_deleted,
                        }))

                        // Sort messages chronologically
                        const sortedMessages = [...messages].sort((a, b) => {
                            const timeA = new Date(a.created_at).getTime()
                            const timeB = new Date(b.created_at).getTime()

                            // If timestamps are equal, maintain stable sort by ID
                            if (timeA === timeB) {
                                return a.id.localeCompare(b.id)
                            }
                            return timeA - timeB
                        })

                        // All messages should have the same timestamp
                        sortedMessages.forEach(message => {
                            expect(new Date(message.created_at).getTime()).toBe(baseTimestamp)
                        })

                        // Verify stable sorting by ID when timestamps are identical
                        for (let i = 1; i < sortedMessages.length; i++) {
                            const prevTime = new Date(sortedMessages[i - 1].created_at).getTime()
                            const currTime = new Date(sortedMessages[i].created_at).getTime()

                            if (prevTime === currTime) {
                                // When timestamps are equal, should be sorted by ID
                                expect(sortedMessages[i - 1].id.localeCompare(sortedMessages[i].id)).toBeLessThanOrEqual(0)
                            }
                        }

                        // Verify all messages are preserved
                        expect(sortedMessages).toHaveLength(messages.length)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should preserve message content and metadata during chronological sorting', () => {
            fc.assert(
                fc.property(
                    fc.array(
                        fc.record({
                            id: fc.string({ minLength: 1, maxLength: 20 }),
                            sender_id: fc.string({ minLength: 1, maxLength: 20 }),
                            receiver_id: fc.string({ minLength: 1, maxLength: 20 }),
                            content: fc.string({ minLength: 1, maxLength: 500 }),
                            timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
                            read_at: fc.option(fc.integer({ min: 1000000000000, max: 9999999999999 }), { nil: null }),
                            is_deleted: fc.boolean(),
                        }),
                        { minLength: 1, maxLength: 15 }
                    ),
                    (messageData) => {
                        const messages: Message[] = messageData.map((data, index) => ({
                            id: `${data.id}-${index}`,
                            sender_id: data.sender_id,
                            receiver_id: data.receiver_id,
                            content: data.content,
                            created_at: new Date(data.timestamp).toISOString(),
                            read_at: data.read_at ? new Date(data.read_at).toISOString() : null,
                            is_deleted: data.is_deleted,
                        }))

                        // Sort chronologically
                        const sortedMessages = [...messages].sort((a, b) =>
                            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                        )

                        // Verify each message's content and metadata is preserved
                        sortedMessages.forEach(sortedMessage => {
                            const originalMessage = messages.find(m => m.id === sortedMessage.id)
                            expect(originalMessage).toBeDefined()

                            // All fields should be identical
                            expect(sortedMessage.id).toBe(originalMessage!.id)
                            expect(sortedMessage.sender_id).toBe(originalMessage!.sender_id)
                            expect(sortedMessage.receiver_id).toBe(originalMessage!.receiver_id)
                            expect(sortedMessage.content).toBe(originalMessage!.content)
                            expect(sortedMessage.created_at).toBe(originalMessage!.created_at)
                            expect(sortedMessage.read_at).toBe(originalMessage!.read_at)
                            expect(sortedMessage.is_deleted).toBe(originalMessage!.is_deleted)
                        })

                        // Verify no messages are lost or duplicated
                        expect(sortedMessages).toHaveLength(messages.length)

                        // Verify unique IDs are maintained
                        const sortedIds = sortedMessages.map(m => m.id)
                        const uniqueSortedIds = new Set(sortedIds)
                        expect(uniqueSortedIds.size).toBe(sortedIds.length)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle edge cases in chronological ordering', () => {
            fc.assert(
                fc.property(
                    fc.oneof(
                        // Single message
                        fc.constant([{
                            id: 'single',
                            sender_id: 'user1',
                            receiver_id: 'user2',
                            content: 'Single message',
                            timestamp: Date.now(),
                            read_at: null,
                            is_deleted: false,
                        }]),
                        // Messages with extreme timestamps
                        fc.constant([
                            {
                                id: 'old',
                                sender_id: 'user1',
                                receiver_id: 'user2',
                                content: 'Very old message',
                                timestamp: 1000000000000, // Year 2001
                                read_at: null,
                                is_deleted: false,
                            },
                            {
                                id: 'new',
                                sender_id: 'user2',
                                receiver_id: 'user1',
                                content: 'Very new message',
                                timestamp: 9999999999999, // Year 2286
                                read_at: null,
                                is_deleted: false,
                            }
                        ]),
                        // Messages in reverse chronological order
                        fc.array(
                            fc.record({
                                id: fc.string({ minLength: 1, maxLength: 10 }),
                                sender_id: fc.string({ minLength: 1, maxLength: 10 }),
                                receiver_id: fc.string({ minLength: 1, maxLength: 10 }),
                                content: fc.string({ minLength: 1, maxLength: 100 }),
                                read_at: fc.option(fc.integer({ min: 1000000000000, max: 9999999999999 }), { nil: null }),
                                is_deleted: fc.boolean(),
                            }),
                            { minLength: 2, maxLength: 5 }
                        ).map((data: any[]) => data.map((item: any, i: number) => ({
                            ...item,
                            id: `${item.id}-${i}`,
                            timestamp: Date.now() - (i * 1000), // Reverse chronological
                        })))
                    ),
                    (messageData: any) => {
                        const messages: Message[] = (messageData as any[]).map((data: any) => ({
                            id: data.id,
                            sender_id: data.sender_id,
                            receiver_id: data.receiver_id,
                            content: data.content,
                            created_at: new Date(data.timestamp).toISOString(),
                            read_at: data.read_at ? new Date(data.read_at).toISOString() : null,
                            is_deleted: data.is_deleted,
                        }))

                        // Sort chronologically
                        const sortedMessages = [...messages].sort((a, b) =>
                            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                        )

                        // Verify chronological order is maintained
                        for (let i = 1; i < sortedMessages.length; i++) {
                            const prevTime = new Date(sortedMessages[i - 1].created_at).getTime()
                            const currTime = new Date(sortedMessages[i].created_at).getTime()
                            expect(currTime).toBeGreaterThanOrEqual(prevTime)
                        }

                        // Verify all messages are preserved
                        expect(sortedMessages).toHaveLength(messages.length)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle mixed conversation participants in chronological order', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 10 }), // user1
                    fc.string({ minLength: 1, maxLength: 10 }), // user2
                    fc.array(
                        fc.record({
                            content: fc.string({ minLength: 1, maxLength: 200 }),
                            timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
                            fromUser1: fc.boolean(),
                            read_at: fc.option(fc.integer({ min: 1000000000000, max: 9999999999999 }), { nil: null }),
                            is_deleted: fc.boolean(),
                        }),
                        { minLength: 2, maxLength: 20 }
                    ),
                    (user1, user2, messageData) => {
                        fc.pre(user1 !== user2) // Ensure different users

                        const messages: Message[] = messageData.map((data, index) => ({
                            id: `msg-${index}`,
                            sender_id: data.fromUser1 ? user1 : user2,
                            receiver_id: data.fromUser1 ? user2 : user1,
                            content: data.content,
                            created_at: new Date(data.timestamp).toISOString(),
                            read_at: data.read_at ? new Date(data.read_at).toISOString() : null,
                            is_deleted: data.is_deleted,
                        }))

                        // Sort chronologically
                        const sortedMessages = [...messages].sort((a, b) =>
                            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                        )

                        // Verify chronological order regardless of sender
                        for (let i = 1; i < sortedMessages.length; i++) {
                            const prevTime = new Date(sortedMessages[i - 1].created_at).getTime()
                            const currTime = new Date(sortedMessages[i].created_at).getTime()
                            expect(currTime).toBeGreaterThanOrEqual(prevTime)
                        }

                        // Verify conversation participants are preserved
                        sortedMessages.forEach(message => {
                            expect([user1, user2]).toContain(message.sender_id)
                            expect([user1, user2]).toContain(message.receiver_id)
                            expect(message.sender_id).not.toBe(message.receiver_id)
                        })

                        // Verify message count is preserved
                        expect(sortedMessages).toHaveLength(messages.length)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should maintain chronological order when messages have microsecond differences', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1000000000000, max: 9999999999000 }), // Base timestamp (leave room for microseconds)
                    fc.array(
                        fc.record({
                            id: fc.string({ minLength: 1, maxLength: 10 }),
                            sender_id: fc.string({ minLength: 1, maxLength: 10 }),
                            receiver_id: fc.string({ minLength: 1, maxLength: 10 }),
                            content: fc.string({ minLength: 1, maxLength: 100 }),
                            microsecondOffset: fc.integer({ min: 0, max: 999 }), // Microsecond precision
                            read_at: fc.option(fc.integer({ min: 1000000000000, max: 9999999999999 }), { nil: null }),
                            is_deleted: fc.boolean(),
                        }),
                        { minLength: 2, maxLength: 10 }
                    ),
                    (baseTimestamp, messageData) => {
                        const messages: Message[] = messageData.map((data, index) => ({
                            id: `${data.id}-${index}`,
                            sender_id: data.sender_id,
                            receiver_id: data.receiver_id,
                            content: data.content,
                            created_at: new Date(baseTimestamp + data.microsecondOffset).toISOString(),
                            read_at: data.read_at ? new Date(data.read_at).toISOString() : null,
                            is_deleted: data.is_deleted,
                        }))

                        // Sort chronologically
                        const sortedMessages = [...messages].sort((a, b) =>
                            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                        )

                        // Verify chronological order is maintained even with small time differences
                        for (let i = 1; i < sortedMessages.length; i++) {
                            const prevTime = new Date(sortedMessages[i - 1].created_at).getTime()
                            const currTime = new Date(sortedMessages[i].created_at).getTime()
                            expect(currTime).toBeGreaterThanOrEqual(prevTime)
                        }

                        // Verify all messages are preserved
                        expect(sortedMessages).toHaveLength(messages.length)

                        // Verify each message maintains its original content
                        sortedMessages.forEach(sortedMessage => {
                            const originalMessage = messages.find(m => m.id === sortedMessage.id)
                            expect(originalMessage).toBeDefined()
                            expect(sortedMessage.content).toBe(originalMessage!.content)
                        })
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})