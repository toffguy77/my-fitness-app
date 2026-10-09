/**
 * MessageBubble Component
 *
 * Renders a single chat message with appropriate styling based on sender and type.
 *
 * Свои сообщения — справа, инверсией чернилами (`bg-fg text-fg-inverse`);
 * сообщения собеседника — слева, бумагой с линией (`bg-surface border-line`).
 * Терракота в переписке не тратится на пузыри: она остаётся у одного главного
 * действия экрана — кнопки «Отправить».
 */

'use client'

import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import type { Message } from '../types'
import { FoodEntryCard } from './FoodEntryCard'
import { FileAttachment } from './FileAttachment'
import { t } from '@/shared/i18n'

// ============================================================================
// Types
// ============================================================================

interface MessageBubbleProps {
    message: Message
    isOwn: boolean
    /** Optional callback for image messages from others (e.g. curator adding KBZHU) */
    onImageAction?: (message: Message) => void
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

export function MessageBubble({ message, isOwn, onImageAction }: MessageBubbleProps) {
    const alignment = isOwn ? 'justify-end' : 'justify-start'
    const bubbleBg = isOwn
        ? 'bg-fg text-fg-inverse rounded-br-md'
        : 'bg-surface text-fg border border-line rounded-bl-md'

    const content = useMemo(() => {
        switch (message.type) {
            case 'text':
                return (
                    <div className={`rounded-tile px-4 py-2.5 max-w-[300px] ${bubbleBg}`}>
                        <p className="text-[15px] leading-[22px] whitespace-pre-wrap break-words">
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
                                    alt={t('chat.image')}
                                    className="rounded-tile border border-line max-w-full max-h-[300px] object-cover"
                                    loading="lazy"
                                />
                            </a>
                        )}
                        {onImageAction && !isOwn && (
                            <button
                                type="button"
                                onClick={() => onImageAction(message)}
                                className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary transition-opacity hover:opacity-80"
                            >
                                <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                                {t('chat.enterMacros')}
                            </button>
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
                                className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline"
                            >
                                {t('chat.downloadFile')}
                            </a>
                        )}
                    </div>
                )

            case 'food_entry':
                return <FoodEntryCard metadata={message.metadata} />

            default:
                return (
                    <div className={`rounded-tile px-4 py-2.5 max-w-[300px] ${bubbleBg}`}>
                        <p className="text-[15px] leading-[22px]">{message.content}</p>
                    </div>
                )
        }
    }, [message, bubbleBg, isOwn, onImageAction])

    return (
        <div className={`flex ${alignment} mb-2 px-4`}>
            <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                {content}
                <span className="mt-1 text-xs text-fg-subtle tabular-nums">
                    {formatTime(message.created_at)}
                </span>
            </div>
        </div>
    )
}
