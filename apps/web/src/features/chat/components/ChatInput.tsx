/**
 * ChatInput Component
 *
 * Text input with file attachment and send capabilities.
 * Includes debounced typing indicator and Enter-to-send.
 */

'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Paperclip, ArrowUp, X } from 'lucide-react'

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
        <div className="border-t border-gray-200 bg-white px-4 py-3">
            {/* Selected file preview */}
            {selectedFile && (
                <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-gray-50 rounded-lg">
                    <Paperclip className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-700 truncate flex-1">
                        {selectedFile.name}
                    </span>
                    <button
                        type="button"
                        onClick={handleCancelFile}
                        className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label="Отменить выбор файла"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Input row */}
            <div className="flex items-center gap-2">
                {/* Attach button */}
                <button
                    type="button"
                    onClick={handleAttachClick}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100"
                    aria-label="Прикрепить файл"
                >
                    <Paperclip className="w-5 h-5" />
                </button>

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileChange}
                    className="hidden"
                    aria-hidden="true"
                />

                {/* Text input */}
                <input
                    type="text"
                    value={text}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Сообщение..."
                    disabled={isSending}
                    className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
                />

                {/* Send button */}
                <button
                    type="button"
                    onClick={handleSend}
                    disabled={!canSend || isSending}
                    className="p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    aria-label="Отправить"
                >
                    <ArrowUp className="w-5 h-5" />
                </button>
            </div>
        </div>
    )
}
