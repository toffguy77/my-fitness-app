/**
 * Property-Based Tests: Chat Message Length Validation
 * **Feature: chat-realtime-fix, Property 5: Message Length Validation**
 * **Validates: Requirements 2.5**
 */

import fc from 'fast-check'
import { validateMessage, type MessageValidationOptions } from '../chat/validation'

describe('Chat Message Length Validation - Property Tests', () => {
    describe('Property 5: Message Length Validation', () => {
        /**
         * **Property 5: Message Length Validation**
         * *For any* message input longer than 5000 characters, the system should reject it before sending
         * **Validates: Requirements 2.5**
         */
        it('should reject messages longer than 5000 characters (default)', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 5001, maxLength: 6000 }),
                    (longMessage) => {
                        const result = validateMessage(longMessage)

                        expect(result.isValid).toBe(false)
                        expect(result.errorType).toBe('too_long')
                        expect(result.error).toContain('слишком длинное')
                        expect(result.error).toContain('5000')
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should accept messages with exactly 5000 characters', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 100 }),
                    (baseString) => {
                        // Create a message with exactly 5000 characters
                        const exactMessage = baseString.repeat(Math.ceil(5000 / baseString.length)).substring(0, 5000)
                        const result = validateMessage(exactMessage)

                        // Should be valid if not empty after trimming
                        if (exactMessage.trim().length > 0) {
                            expect(result.isValid).toBe(true)
                            expect(result.errorType).toBeUndefined()
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should accept messages shorter than 5000 characters', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 4999 }).filter(s => s.trim().length > 0),
                    (shortMessage) => {
                        const result = validateMessage(shortMessage)

                        // Should be valid (assuming no forbidden words)
                        if (!shortMessage.toLowerCase().includes('spam') &&
                            !shortMessage.toLowerCase().includes('scam') &&
                            !shortMessage.toLowerCase().includes('phishing')) {
                            expect(result.isValid).toBe(true)
                            expect(result.errorType).toBeUndefined()
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should reject messages that exceed custom maximum length', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 100, max: 1000 }), // Custom max length
                    fc.string({ minLength: 1 }),
                    (customMaxLength, baseString) => {
                        // Create a string that exceeds customMaxLength
                        const longMessage = baseString.repeat(Math.ceil((customMaxLength + 100) / baseString.length))
                        const options: MessageValidationOptions = { maxLength: customMaxLength }

                        const result = validateMessage(longMessage, options)

                        if (longMessage.length > customMaxLength) {
                            expect(result.isValid).toBe(false)
                            expect(result.errorType).toBe('too_long')
                            expect(result.error).toContain('слишком длинное')
                            expect(result.error).toContain(customMaxLength.toString())
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle edge case at boundary (5000 vs 5001 characters)', () => {
            fc.assert(
                fc.property(
                    fc.char(),
                    (char) => {
                        // Create messages at the boundary
                        const at5000 = char.repeat(5000)
                        const at5001 = char.repeat(5001)

                        const result5000 = validateMessage(at5000)
                        const result5001 = validateMessage(at5001)

                        // 5000 should be valid (if not whitespace only)
                        if (at5000.trim().length > 0) {
                            expect(result5000.isValid).toBe(true)
                        }

                        // 5001 should be invalid
                        expect(result5001.isValid).toBe(false)
                        expect(result5001.errorType).toBe('too_long')
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should correctly count Unicode characters', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('😀', '🎉', '❤️', '中', '日', 'א', 'ب'),
                    fc.integer({ min: 4990, max: 5010 }),
                    (unicodeChar, repeatCount) => {
                        const message = unicodeChar.repeat(repeatCount)
                        const result = validateMessage(message)

                        if (message.length > 5000) {
                            expect(result.isValid).toBe(false)
                            expect(result.errorType).toBe('too_long')
                        } else if (message.length <= 5000 && message.trim().length > 0) {
                            expect(result.isValid).toBe(true)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle messages with mixed content at length boundary', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 100 }),
                    fc.string({ minLength: 1, maxLength: 100 }),
                    fc.string({ minLength: 1, maxLength: 100 }),
                    (part1, part2, part3) => {
                        // Create a message close to 5000 characters
                        const baseMessage = `${part1} ${part2} ${part3}`
                        const repeats = Math.floor(5000 / baseMessage.length)
                        const message = baseMessage.repeat(repeats)

                        const result = validateMessage(message)

                        if (message.length > 5000) {
                            expect(result.isValid).toBe(false)
                            expect(result.errorType).toBe('too_long')
                        } else if (message.trim().length > 0 &&
                            !message.toLowerCase().includes('spam') &&
                            !message.toLowerCase().includes('scam') &&
                            !message.toLowerCase().includes('phishing')) {
                            expect(result.isValid).toBe(true)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})
