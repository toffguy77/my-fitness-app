'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, RotateCcw, AlertCircle } from 'lucide-react'
import { sendTypingEvent } from '@/utils/chat/realtime'
import { validateMessage, sanitizeMessage } from '@/utils/chat/validation'
import toast from 'react-hot-toast'

interface MessageInputProps {
    onSend: (content: string) => Promise<void>
    onTyping?: () => void
    disabled?: boolean
    placeholder?: string
    currentUserId: string
    otherUserId: string
}

interface FailedMessage {
    content: string
    timestamp: number
    retryCount: number
    error: string
}

const RATE_LIMIT_MESSAGES = 10 // Максимум сообщений
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 минута в миллисекундах
const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAY_BASE = 1000 // 1 секунда базовая задержка

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
    const [failedMessage, setFailedMessage] = useState<FailedMessage | null>(null)
    const [validationError, setValidationError] = useState<string | null>(null)
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const lastTypingTimeRef = useRef<number>(0)
    const messageTimestampsRef = useRef<number[]>([]) // История времени отправки сообщений
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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

    // Валидация сообщения
    const validateMessageContent = (messageContent: string): boolean => {
        const validation = validateMessage(messageContent)
        if (!validation.isValid) {
            setValidationError(validation.error || 'Неверное сообщение')
            return false
        }
        setValidationError(null)
        return true
    }

    // Отправка сообщения с retry логикой
    const sendMessageWithRetry = async (messageContent: string, isRetry: boolean = false): Promise<void> => {
        try {
            await onSend(messageContent)

            // Успешная отправка - очищаем failed message
            if (failedMessage) {
                setFailedMessage(null)
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка'

            if (isRetry && failedMessage) {
                // Это повторная попытка
                const newRetryCount = failedMessage.retryCount + 1

                if (newRetryCount >= MAX_RETRY_ATTEMPTS) {
                    // Превышено максимальное количество попыток
                    toast.error(`Не удалось отправить сообщение после ${MAX_RETRY_ATTEMPTS} попыток`)
                    setFailedMessage({
                        ...failedMessage,
                        retryCount: newRetryCount,
                        error: `Превышено максимальное количество попыток: ${errorMessage}`
                    })
                } else {
                    // Обновляем информацию о неудачной попытке
                    setFailedMessage({
                        ...failedMessage,
                        retryCount: newRetryCount,
                        error: errorMessage
                    })

                    // Планируем следующую попытку с экспоненциальной задержкой
                    const delay = RETRY_DELAY_BASE * Math.pow(2, newRetryCount - 1)
                    toast.error(`Ошибка отправки. Повтор через ${Math.ceil(delay / 1000)} сек...`)

                    retryTimeoutRef.current = setTimeout(() => {
                        sendMessageWithRetry(messageContent, true)
                    }, delay)
                }
            } else {
                // Первая неудачная попытка
                setFailedMessage({
                    content: messageContent,
                    timestamp: Date.now(),
                    retryCount: 1,
                    error: errorMessage
                })

                toast.error('Ошибка отправки сообщения. Попробуем еще раз...')

                // Планируем первую повторную попытку
                retryTimeoutRef.current = setTimeout(() => {
                    sendMessageWithRetry(messageContent, true)
                }, RETRY_DELAY_BASE)
            }

            throw error
        }
    }

    const handleSend = async () => {
        if (isSending || disabled) return

        const messageContent = sanitizeMessage(content)

        // Валидация сообщения перед отправкой
        if (!validateMessageContent(messageContent)) {
            // Не очищаем content при ошибке валидации, чтобы пользователь мог исправить
            return
        }

        // Проверка rate limiting
        if (!checkRateLimit()) {
            return
        }

        setContent('')
        setIsSending(true)

        // Записываем время отправки
        messageTimestampsRef.current.push(Date.now())

        // Отправляем событие "перестал печатать"
        await sendTypingEvent(currentUserId, otherUserId, false)

        try {
            await sendMessageWithRetry(messageContent)
        } catch (error) {
            // Восстанавливаем текст при ошибке
            setContent(messageContent)
            // Удаляем последнюю запись из истории при ошибке
            messageTimestampsRef.current.pop()
        } finally {
            setIsSending(false)
        }
    }

    // Ручная повторная отправка неудачного сообщения
    const handleManualRetry = async () => {
        if (!failedMessage || isSending) return

        setIsSending(true)

        try {
            await sendMessageWithRetry(failedMessage.content, true)
        } catch (error) {
            // Ошибка уже обработана в sendMessageWithRetry
        } finally {
            setIsSending(false)
        }
    }

    // Отмена неудачного сообщения
    const handleCancelFailedMessage = () => {
        if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current)
            retryTimeoutRef.current = null
        }
        setFailedMessage(null)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newContent = e.target.value
        setContent(newContent)

        // Очищаем ошибку валидации при изменении текста
        if (validationError) {
            setValidationError(null)
        }

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
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current)
            }
        }
    }, [])

    return (
        <div className="border-t border-zinc-800 bg-zinc-900">
            {/* Validation Error */}
            {validationError && (
                <div className="px-3 py-2 bg-red-900/20 border-b border-red-800/30">
                    <div className="flex items-center gap-2 text-red-400 text-sm">
                        <AlertCircle size={16} />
                        <span>{validationError}</span>
                    </div>
                </div>
            )}

            {/* Failed Message Retry */}
            {failedMessage && (
                <div className="px-3 py-2 bg-amber-900/20 border-b border-amber-800/30">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-amber-400 text-sm">
                            <AlertCircle size={16} />
                            <span>
                                Не удалось отправить: "{failedMessage.content.length > 30
                                    ? failedMessage.content.substring(0, 30) + '...'
                                    : failedMessage.content}"
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {failedMessage.retryCount < MAX_RETRY_ATTEMPTS && (
                                <button
                                    onClick={handleManualRetry}
                                    disabled={isSending}
                                    className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                                    title="Повторить отправку"
                                >
                                    <RotateCcw size={12} />
                                    Повторить
                                </button>
                            )}
                            <button
                                onClick={handleCancelFailedMessage}
                                className="px-2 py-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                                title="Отменить"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                    {failedMessage.retryCount >= MAX_RETRY_ATTEMPTS && (
                        <div className="mt-1 text-xs text-amber-500">
                            Превышено максимальное количество попыток отправки
                        </div>
                    )}
                </div>
            )}

            {/* Input Area */}
            <div className="flex items-end gap-2 p-3">
                <textarea
                    value={content}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled || isSending}
                    rows={1}
                    maxLength={1000}
                    className={`flex-1 p-2 border rounded-lg resize-none focus:ring-2 focus:ring-white outline-none text-sm text-zinc-100 bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-zinc-600 transition-colors ${validationError
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-zinc-800'
                        }`}
                    style={{ minHeight: '40px', maxHeight: '120px' }}
                />
                <button
                    onClick={handleSend}
                    disabled={!content || isSending || disabled}
                    className="p-2 bg-white text-zinc-950 rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                    title="Отправить (Enter)"
                >
                    <Send size={18} />
                </button>
            </div>
        </div>
    )
}

