/**
 * Property-Based Tests: Chat Message Empty Validation
 * **Feature: chat-realtime-fix, Property 4: Empty Message Rejection**
 * **Validates: Requirements 2.4**
 */

import fc from 'fast-check'
import { validateMessage, sanitizeMessage, isSpamMessage, type MessageValidationOptions } from '../chat/validation'

describe('Chat Message Empty Validation - Property Tests', () => {
    describe('Property 4: Empty Message Rejection', () => {
        /**
         * **Property 4: Empty Message Rejection**
         * *For any* message input that is empty or contains only whitespace, the system should reject it before sending
         * **Validates: Requirements 2.4**
         */
        it('should reject empty or whitespace-only messages', () => {
            fc.assert(
                fc.property(
                    fc.string().filter(s => s.trim().length === 0), // Generate only whitespace strings
                    (emptyMessage) => {
                        const result = validateMessage(emptyMessage)
                        expect(result.isValid).toBe(false)
                        expect(result.errorType).toBe('empty')
                        expect(result.error).toContain('пустым')
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should reject messages containing forbidden words', () => {
            const forbiddenWords = ['spam', 'scam', 'phishing', 'virus', 'hack']

            fc.assert(
                fc.property(
                    fc.constantFrom(...forbiddenWords), // Pick a forbidden word
                    fc.string({ minLength: 0, maxLength: 50 }), // Prefix
                    fc.string({ minLength: 0, maxLength: 50 }), // Suffix
                    (forbiddenWord, prefix, suffix) => {
                        const messageWithForbiddenWord = `${prefix}${forbiddenWord}${suffix}`
                        const options: MessageValidationOptions = { forbiddenWords }

                        const result = validateMessage(messageWithForbiddenWord, options)

                        expect(result.isValid).toBe(false)
                        expect(result.errorType).toBe('forbidden_content')
                        expect(result.error).toContain('запрещенный контент')
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should accept valid messages', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 500 }).filter(s => {
                        const trimmed = s.trim()
                        return trimmed.length > 0 &&
                            !trimmed.toLowerCase().includes('spam') &&
                            !trimmed.toLowerCase().includes('scam') &&
                            !trimmed.toLowerCase().includes('phishing')
                    }),
                    (validMessage) => {
                        const result = validateMessage(validMessage)

                        expect(result.isValid).toBe(true)
                        expect(result.error).toBeUndefined()
                        expect(result.errorType).toBeUndefined()
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle case-insensitive forbidden word detection', () => {
            const forbiddenWords = ['SPAM', 'Scam', 'PhIsHiNg']

            fc.assert(
                fc.property(
                    fc.constantFrom(...forbiddenWords),
                    fc.string({ minLength: 0, maxLength: 20 }),
                    fc.string({ minLength: 0, maxLength: 20 }),
                    (forbiddenWord, prefix, suffix) => {
                        // Test with different cases
                        const variations = [
                            forbiddenWord.toLowerCase(),
                            forbiddenWord.toUpperCase(),
                            forbiddenWord
                        ]

                        variations.forEach(variation => {
                            const message = `${prefix}${variation}${suffix}`
                            const options: MessageValidationOptions = { forbiddenWords }

                            const result = validateMessage(message, options)

                            expect(result.isValid).toBe(false)
                            expect(result.errorType).toBe('forbidden_content')
                        })
                    }
                ),
                { numRuns: 50 }
            )
        })
    })

    describe('Message Sanitization Properties', () => {
        it('should always return a string with no leading/trailing whitespace', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    (message) => {
                        const sanitized = sanitizeMessage(message)

                        expect(typeof sanitized).toBe('string')
                        expect(sanitized).toBe(sanitized.trim())
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should replace multiple consecutive whitespace with single space', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 1 }),
                    fc.integer({ min: 2, max: 10 }), // Number of spaces
                    fc.string({ minLength: 1 }),
                    (prefix, spaceCount, suffix) => {
                        const messageWithSpaces = `${prefix}${' '.repeat(spaceCount)}${suffix}`
                        const sanitized = sanitizeMessage(messageWithSpaces)

                        // Should not contain multiple consecutive spaces
                        expect(sanitized).not.toMatch(/\s{2,}/)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should remove control characters', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    fc.integer({ min: 0, max: 31 }), // Control character codes
                    (baseMessage, controlCharCode) => {
                        const controlChar = String.fromCharCode(controlCharCode)
                        const messageWithControl = `${baseMessage}${controlChar}`
                        const sanitized = sanitizeMessage(messageWithControl)

                        // Should not contain control characters
                        expect(sanitized).not.toMatch(/[\u0000-\u001F\u007F-\u009F]/)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Spam Detection Properties', () => {
        it('should detect messages with excessive word repetition', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0),
                    fc.integer({ min: 6, max: 20 }), // Repeat count to ensure spam detection
                    (word, repeatCount) => {
                        const spamMessage = Array(repeatCount).fill(word.trim()).join(' ')
                        const isSpam = isSpamMessage(spamMessage)

                        expect(isSpam).toBe(true)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should detect messages with excessive capitalization', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 15, maxLength: 50 }).filter(s => s.length > 10),
                    (message) => {
                        const uppercaseMessage = message.toUpperCase()
                        const isSpam = isSpamMessage(uppercaseMessage)

                        // Messages that are mostly uppercase should be detected as spam
                        const uppercaseRatio = (uppercaseMessage.match(/[A-Z]/g) || []).length / uppercaseMessage.length
                        if (uppercaseRatio > 0.7) {
                            expect(isSpam).toBe(true)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should not flag normal messages as spam', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 3, maxLength: 10 })
                        .filter(words => {
                            const uniqueWords = new Set(words.map(w => w.toLowerCase()))
                            return uniqueWords.size / words.length >= 0.5 // At least 50% unique words
                        }),
                    (words) => {
                        const normalMessage = words.join(' ')
                        const isSpam = isSpamMessage(normalMessage)

                        expect(isSpam).toBe(false)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Validation Options Properties', () => {
        it('should respect custom maximum length settings', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 10, max: 200 }), // Custom max length
                    fc.string({ minLength: 1 }),
                    (customMaxLength, baseString) => {
                        const options: MessageValidationOptions = { maxLength: customMaxLength }

                        // Test with string exactly at limit
                        const exactLengthMessage = baseString.substring(0, customMaxLength)
                        const exactResult = validateMessage(exactLengthMessage, options)
                        expect(exactResult.isValid).toBe(exactLengthMessage.trim().length > 0)

                        // Test with string over limit
                        if (baseString.length > customMaxLength) {
                            const overLimitMessage = baseString
                            const overResult = validateMessage(overLimitMessage, options)
                            expect(overResult.isValid).toBe(false)
                            expect(overResult.errorType).toBe('too_long')
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should respect allowEmptyMessages option', () => {
            fc.assert(
                fc.property(
                    fc.string().filter(s => s.trim().length === 0),
                    fc.boolean(),
                    (emptyMessage, allowEmpty) => {
                        const options: MessageValidationOptions = { allowEmptyMessages: allowEmpty }
                        const result = validateMessage(emptyMessage, options)

                        expect(result.isValid).toBe(allowEmpty)
                        if (!allowEmpty) {
                            expect(result.errorType).toBe('empty')
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should respect custom forbidden words list', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string({ minLength: 3, maxLength: 10 }), { minLength: 1, maxLength: 5 }),
                    fc.string({ minLength: 1, maxLength: 20 }),
                    (customForbiddenWords, messageContent) => {
                        const options: MessageValidationOptions = { forbiddenWords: customForbiddenWords }

                        // Test message containing one of the custom forbidden words
                        const forbiddenWord = customForbiddenWords[0]
                        const messageWithForbidden = `${messageContent} ${forbiddenWord}`
                        const result = validateMessage(messageWithForbidden, options)

                        expect(result.isValid).toBe(false)
                        expect(result.errorType).toBe('forbidden_content')
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})
