/**
 * TypingIndicator Component
 *
 * Shows "typing..." animation when the other party is typing.
 */

'use client'

// ============================================================================
// Types
// ============================================================================

interface TypingIndicatorProps {
    isTyping: boolean
}

// ============================================================================
// Component
// ============================================================================

export function TypingIndicator({ isTyping }: TypingIndicatorProps) {
    if (!isTyping) return null

    return (
        <div className="flex items-center gap-1 px-4 py-1 text-sm text-gray-400">
            <span>печатает</span>
            <span className="inline-flex gap-0.5">
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>
                    .
                </span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>
                    .
                </span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>
                    .
                </span>
            </span>
        </div>
    )
}
