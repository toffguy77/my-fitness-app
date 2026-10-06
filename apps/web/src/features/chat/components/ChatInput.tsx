/**
 * ChatInput Component
 *
 * Text input with file attachment and send capabilities.
 * Includes debounced typing indicator and Enter-to-send.
 */

'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Paperclip, ArrowUp, X } from 'lucide-react'
import { t } from '@/shared/i18n'
import { IconButton } from '@/shared/components/ui/Button'

// ============================================================================
// Types
// ============================================================================

interface ChatInputProps {
    onSendMessage: (content: string) => Promise<void>
    onSendFile: (file: File) => Promise<void>
    onTyping: () => void
}

// ============================================================================
// Component
// ============================================================================

export function ChatInput({ onSendMessage, onSendFile, onTyping }: ChatInputProps) {
    const [text, setText] = useState('')
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [isSending, setIsSending] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Clean up typing timeout on unmount
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current)
            }
        }
    }, [])

    // Handle typing indicator with debounce (2s)
    const handleTyping = useCallback(() => {
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current)
        } else {
            // Only send on first keystroke in debounce window
            onTyping()
        }
        typingTimeoutRef.current = setTimeout(() => {
            typingTimeoutRef.current = null
        }, 2000)
    }, [onTyping])

    // Handle text change
    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            setText(e.target.value)
            handleTyping()
        },
        [handleTyping]
    )

    // Handle send
    const handleSend = useCallback(async () => {
        if (isSending) return

        if (selectedFile) {
            setIsSending(true)
            try {
                await onSendFile(selectedFile)
                setSelectedFile(null)
            } finally {
                setIsSending(false)
            }
            return
        }

        const trimmed = text.trim()
        if (!trimmed) return

        setIsSending(true)
        try {
            await onSendMessage(trimmed)
            setText('')
        } finally {
            setIsSending(false)
        }
    }, [text, selectedFile, isSending, onSendMessage, onSendFile])

    // Handle Enter key
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
            }
        },
        [handleSend]
    )

    // Handle file selection
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            setSelectedFile(file)
        }
        // Reset input so the same file can be selected again
        e.target.value = ''
    }, [])

    // Trigger file input click
    const handleAttachClick = useCallback(() => {
        fileInputRef.current?.click()
    }, [])

    // Cancel selected file
    const handleCancelFile = useCallback(() => {
        setSelectedFile(null)
    }, [])

    const canSend = selectedFile !== null || text.trim().length > 0

    return (
        <div className="border-t border-line bg-surface px-4 py-3">
            {/* Selected file preview */}
            {selectedFile && (
                <div className="mb-2 flex items-center gap-2 rounded-tile border border-line bg-canvas py-1 pl-3 pr-1">
                    <Paperclip className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                    <span className="flex-1 truncate text-sm text-fg">
                        {selectedFile.name}
                    </span>
                    <IconButton
                        variant="ghost"
                        onClick={handleCancelFile}
                        aria-label={t('chat.cancelFile')}
                    >
                        <X className="h-4 w-4" strokeWidth={1.8} />
                    </IconButton>
                </div>
            )}

            {/* Input row */}
            <div className="flex items-center gap-2">
                {/* Attach button */}
                <IconButton
                    variant="ghost"
                    size="lg"
                    onClick={handleAttachClick}
                    className="text-fg-muted"
                    aria-label={t('chat.attachFile')}
                >
                    <Paperclip className="h-5 w-5" strokeWidth={1.8} />
                </IconButton>

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileChange}
                    className="hidden"
                    aria-hidden="true"
                />

                {/* Text input — 48 px и 16 px текста: iOS не увеличивает страницу при фокусе */}
                <input
                    type="text"
                    value={text}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={t('chat.messagePlaceholder')}
                    disabled={isSending}
                    className="h-12 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-base text-fg placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30 disabled:opacity-50"
                />

                {/* Send button — единственное главное действие экрана */}
                <IconButton
                    variant="primary"
                    size="lg"
                    onClick={handleSend}
                    disabled={!canSend || isSending}
                    aria-label={t('chat.send')}
                >
                    <ArrowUp className="h-5 w-5" strokeWidth={2} />
                </IconButton>
            </div>
        </div>
    )
}
