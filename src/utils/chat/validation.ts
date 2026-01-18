/**
 * Message validation utilities for chat system
 */

export interface MessageValidationResult {
    isValid: boolean
    error?: string
    errorType?: 'empty' | 'too_long' | 'forbidden_content' | 'invalid_characters'
}

export interface MessageValidationOptions {
    maxLength?: number
    allowEmptyMessages?: boolean
    forbiddenWords?: string[]
    allowedCharacters?: RegExp
}

const DEFAULT_OPTIONS: Required<MessageValidationOptions> = {
    maxLength: 5000, // Requirements 2.5: максимальная длина сообщения
    allowEmptyMessages: false,
    forbiddenWords: ['spam', 'scam', 'phishing'],
    allowedCharacters: /^[\s\S]*$/, // Allow all characters by default
}

/**
 * Validates a message before sending
 */
export function validateMessage(
    content: string,
    options: MessageValidationOptions = {}
): MessageValidationResult {
    const opts = { ...DEFAULT_OPTIONS, ...options }

    // Check message length FIRST (before trimming)
    // This ensures that 5001 spaces is "too_long", not "empty"
    if (content.length > opts.maxLength) {
        return {
            isValid: false,
            error: `Сообщение слишком длинное (максимум ${opts.maxLength} символов)`,
            errorType: 'too_long'
        }
    }

    // Check if message is empty or only whitespace
    const trimmedContent = content.trim()
    if (!opts.allowEmptyMessages && trimmedContent.length === 0) {
        return {
            isValid: false,
            error: 'Сообщение не может быть пустым',
            errorType: 'empty'
        }
    }

    // Check for forbidden content
    const lowerContent = content.toLowerCase()
    for (const forbiddenWord of opts.forbiddenWords) {
        if (lowerContent.includes(forbiddenWord.toLowerCase())) {
            return {
                isValid: false,
                error: 'Сообщение содержит запрещенный контент',
                errorType: 'forbidden_content'
            }
        }
    }

    // Check allowed characters
    if (!opts.allowedCharacters.test(content)) {
        return {
            isValid: false,
            error: 'Сообщение содержит недопустимые символы',
            errorType: 'invalid_characters'
        }
    }

    return {
        isValid: true
    }
}

/**
 * Sanitizes message content by removing or replacing problematic characters
 */
export function sanitizeMessage(content: string): string {
    return content
        .trim()
        .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
}

/**
 * Checks if a message is considered spam based on various heuristics
 */
export function isSpamMessage(content: string): boolean {
    const trimmedContent = content.trim().toLowerCase()

    // Check for excessive repetition
    const words = trimmedContent.split(/\s+/)
    const uniqueWords = new Set(words)
    if (words.length > 5 && uniqueWords.size / words.length < 0.3) {
        return true // More than 70% repeated words
    }

    // Check for excessive capitalization
    const uppercaseCount = (content.match(/[A-Z]/g) || []).length
    if (uppercaseCount > content.length * 0.7 && content.length > 10) {
        return true // More than 70% uppercase
    }

    // Check for excessive punctuation
    // Only flag as spam if message is long enough (>20 chars) to avoid false positives
    const punctuationCount = (content.match(/[!?.,;:]/g) || []).length
    if (punctuationCount > content.length * 0.3 && content.length > 20) {
        return true // More than 30% punctuation in messages longer than 20 chars
    }

    return false
}
