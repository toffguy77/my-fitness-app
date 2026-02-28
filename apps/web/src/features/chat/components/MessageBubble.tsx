/**
 * MessageBubble Component
 *
 * Renders a single chat message with appropriate styling based on sender and type.
 * Own messages are right-aligned with blue background; others are left-aligned with gray.
 */

'use client'

import { useMemo } from 'react'
import type { Message } from '../types'
import { FoodEntryCard } from './FoodEntryCard'
import { FileAttachment } from './FileAttachment'

// ============================================================================
// Types
// ============================================================================

interface MessageBubbleProps {
    message: Message
    isOwn: boolean
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format a timestamp to HH:MM
 */
function formatTime(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

// ============================================================================
// Component
// ============================================================================

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
    const alignment = isOwn ? 'justify-end' : 'justify-start'
    const bubbleBg = isOwn ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-900'
    const timeColor = isOwn ? 'text-blue-200' : 'text-gray-400'

    const content = useMemo(() => {
        switch (message.type) {
            case 'text':
                return (
                    <div className={`rounded-2xl px-4 py-2 max-w-[300px] ${bubbleBg}`}>
                        <p className="text-sm whitespace-pre-wrap break-words">
                            {message.content}
                        </p>
                    </div>
                )

            case 'image': {
                const imageUrl =
                    message.attachments?.[0]?.file_url ?? message.content
                return (
                    <div className="max-w-[300px]">
                        {imageUrl && (
                            <a
                                href={imageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={imageUrl}
                                    alt="Изображение"
                                    className="rounded-2xl max-w-full max-h-[300px] object-cover"
                                    loading="lazy"
                                />
                            </a>
                        )}
                    </div>
                )
            }

            case 'file':
                return (
                    <div className="max-w-[300px]">
                        {message.attachments?.map((att) => (
                            <FileAttachment key={att.id} attachment={att} />
                        ))}
                        {!message.attachments?.length && message.content && (
                            <a
                                href={message.content}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm underline text-blue-600"
                            >
                                Скачать файл
                            </a>
                        )}
                    </div>
                )

            case 'food_entry':
                return <FoodEntryCard metadata={message.metadata} />

            default:
                return (
                    <div className={`rounded-2xl px-4 py-2 max-w-[300px] ${bubbleBg}`}>
                        <p className="text-sm">{message.content}</p>
                    </div>
                )
        }
    }, [message, bubbleBg])

    return (
        <div className={`flex ${alignment} mb-2 px-4`}>
            <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                {content}
                <span className={`text-xs mt-0.5 ${timeColor}`}>
                    {formatTime(message.created_at)}
                </span>
            </div>
        </div>
    )
}
