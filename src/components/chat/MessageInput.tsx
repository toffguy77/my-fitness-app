'use client'

import { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import { sendTypingEvent } from '@/utils/chat/realtime'
import toast from 'react-hot-toast'

interface MessageInputProps {
    onSend: (content: string) => Promise<void>
    onTyping?: () => void
    disabled?: boolean
    placeholder?: string
    currentUserId: string
    otherUserId: string
}

const RATE_LIMIT_MESSAGES = 10 // Максимум сообщений
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 минута в миллисекундах

export default function MessageInput({
    onSend,
    onTyping,
    disabled = false,
    placeholder = 'Введите сообщение...',
    currentUserId,
    otherUserId,
}: MessageInputProps) {
    const [content, setContent] = useState('')
    const [isSending, setIsSending] = useState(false)
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const lastTypingTimeRef = useRef<number>(0)
    const messageTimestampsRef = useRef<number[]>([]) // История времени отправки сообщений

    // Проверка rate limiting
    const checkRateLimit = (): boolean => {
        const now = Date.now()
        
        // Удаляем старые записи (старше 1 минуты)
        messageTimestampsRef.current = messageTimestampsRef.current.filter(
            timestamp => now - timestamp < RATE_LIMIT_WINDOW
        )

        // Проверяем лимит
        if (messageTimestampsRef.current.length >= RATE_LIMIT_MESSAGES) {
            const oldestMessage = messageTimestampsRef.current[0]
            const waitTime = Math.ceil((RATE_LIMIT_WINDOW - (now - oldestMessage)) / 1000)
            toast.error(`Слишком много сообщений. Подождите ${waitTime} секунд.`)
            return false
        }

        return true
    }

    const handleSend = async () => {
        if (!content.trim() || isSending || disabled) return

        // Проверка rate limiting
        if (!checkRateLimit()) {
            return
        }

        const messageContent = content.trim()
        setContent('')
        setIsSending(true)

        // Записываем время отправки
        messageTimestampsRef.current.push(Date.now())

        // Отправляем событие "перестал печатать"
        await sendTypingEvent(currentUserId, otherUserId, false)

        try {
            await onSend(messageContent)
        } catch (error) {
            // Восстанавливаем текст при ошибке
            setContent(messageContent)
            // Удаляем последнюю запись из истории при ошибке
            messageTimestampsRef.current.pop()
        } finally {
            setIsSending(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setContent(e.target.value)

        // Debounce для события "печатает..."
        const now = Date.now()
        if (now - lastTypingTimeRef.current > 1000) {
            // Отправляем событие "печатает..."
            sendTypingEvent(currentUserId, otherUserId, true).catch(() => {
                // Игнорируем ошибки отправки события печатания
            })
            lastTypingTimeRef.current = now
        }

        // Очищаем предыдущий таймаут
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current)
        }

        // Отправляем событие "перестал печатать" через 2 секунды бездействия
        typingTimeoutRef.current = setTimeout(() => {
            sendTypingEvent(currentUserId, otherUserId, false).catch(() => {
                // Игнорируем ошибки
            })
        }, 2000)

        onTyping?.()
    }

    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current)
            }
        }
    }, [])

    return (
        <div className="flex items-end gap-2 p-3 border-t border-gray-200 bg-white">
            <textarea
                value={content}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled || isSending}
                rows={1}
                maxLength={1000}
                className="flex-1 p-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-black outline-none text-sm text-black disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ minHeight: '40px', maxHeight: '120px' }}
            />
            <button
                onClick={handleSend}
                disabled={!content.trim() || isSending || disabled}
                className="p-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                title="Отправить (Enter)"
            >
                <Send size={18} />
            </button>
        </div>
    )
}

