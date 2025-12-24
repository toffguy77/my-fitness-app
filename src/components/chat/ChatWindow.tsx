'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, MessageSquare, Wifi, WifiOff, Loader2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { subscribeToMessages, subscribeToTyping, unsubscribeFromChannel, type Message, type ConnectionStatus } from '@/utils/chat/realtime'
import { RealtimeChannel } from '@supabase/supabase-js'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'

interface ChatWindowProps {
    userId: string
    otherUserId: string
    otherUserName: string
    onClose?: () => void
    className?: string
    onMessageRead?: () => void
}

const MESSAGES_PER_PAGE = 50

export default function ChatWindow({
    userId,
    otherUserId,
    otherUserName,
    onClose,
    className = '',
    onMessageRead,
}: ChatWindowProps) {
    const supabase = createClient()
    const [messages, setMessages] = useState<Message[]>([])
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState(false)
    const [isTyping, setIsTyping] = useState(false)
    const [hasMore, setHasMore] = useState(false)
    const [page, setPage] = useState(0)
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
        connected: false,
        reconnecting: false,
        error: null,
    })

    const messagesChannelRef = useRef<RealtimeChannel | null>(null)
    const typingChannelRef = useRef<RealtimeChannel | null>(null)

    // Загрузка сообщений
    const loadMessages = useCallback(async (pageNum: number = 0, append: boolean = false) => {
        try {
            const offset = pageNum * MESSAGES_PER_PAGE

            // Загружаем сообщения между двумя пользователями
            // Используем два запроса и объединяем результаты
            const [messages1, messages2] = await Promise.all([
                supabase
                    .from('messages')
                    .select('*')
                    .eq('sender_id', userId)
                    .eq('receiver_id', otherUserId)
                    .eq('is_deleted', false),
                supabase
                    .from('messages')
                    .select('*')
                    .eq('sender_id', otherUserId)
                    .eq('receiver_id', userId)
                    .eq('is_deleted', false),
            ])

            if (messages1.error) throw messages1.error
            if (messages2.error) throw messages2.error

            const allMessages = [...(messages1.data || []), ...(messages2.data || [])]
            const sortedMessages = allMessages.sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )
            const paginatedMessages = sortedMessages.slice(offset, offset + MESSAGES_PER_PAGE)

            const filteredData = paginatedMessages
            const loadedMessages = (filteredData || []) as Message[]
            const reversedMessages = loadedMessages.reverse() // Переворачиваем для отображения

            if (append) {
                setMessages((prev) => [...reversedMessages, ...prev])
            } else {
                setMessages(reversedMessages)
            }

            setHasMore(loadedMessages.length === MESSAGES_PER_PAGE)
            setPage(pageNum)
            
            logger.debug('ChatWindow: сообщения загружены', { 
                userId, 
                otherUserId, 
                totalMessages: allMessages.length,
                loadedMessages: loadedMessages.length,
                displayedMessages: reversedMessages.length
            })
        } catch (error) {
            logger.error('ChatWindow: ошибка загрузки сообщений', error, { userId, otherUserId })
            toast.error('Ошибка загрузки сообщений')
        } finally {
            setLoading(false)
        }
    }, [supabase, userId, otherUserId])

    // Отправка сообщения
    const handleSend = useCallback(async (content: string) => {
        if (!content.trim() || sending) return

        const trimmedContent = content.trim()
        
        // Создаем временное сообщение для оптимистичного обновления
        const tempMessage: Message = {
            id: `temp-${Date.now()}-${Math.random()}`,
            sender_id: userId,
            receiver_id: otherUserId,
            content: trimmedContent,
            created_at: new Date().toISOString(),
            read_at: null,
            is_deleted: false,
        }

        // Оптимистично добавляем сообщение в UI
        setMessages((prev) => [...prev, tempMessage])
        setSending(true)

        try {
            const { data, error } = await supabase
                .from('messages')
                .insert({
                    sender_id: userId,
                    receiver_id: otherUserId,
                    content: trimmedContent,
                })
                .select()
                .single()

            if (error) {
                // Удаляем временное сообщение при ошибке
                setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id))
                
                // Проверяем, не является ли это ошибкой rate limit
                if (error.message && error.message.includes('Rate limit exceeded')) {
                    toast.error('Слишком много сообщений. Подождите минуту.')
                } else {
                    toast.error('Ошибка отправки сообщения')
                }
                throw error
            }

            // Заменяем временное сообщение на реальное
            if (data) {
                setMessages((prev) => {
                    const filtered = prev.filter((m) => m.id !== tempMessage.id)
                    // Проверяем, нет ли уже этого сообщения (на случай, если оно пришло через Realtime)
                    if (!filtered.some((m) => m.id === data.id)) {
                        return [...filtered, data as Message]
                    }
                    return filtered
                })
            }
        } catch (error) {
            logger.error('ChatWindow: ошибка отправки сообщения', error, { userId, otherUserId })
            throw error
        } finally {
            setSending(false)
        }
    }, [supabase, userId, otherUserId])

    // Отметка сообщений как прочитанных
    const markAsRead = useCallback(async () => {
        try {
            const unreadMessages = messages.filter(
                (m) => m.receiver_id === userId && !m.read_at
            )

            if (unreadMessages.length === 0) return

            const { error } = await supabase
                .from('messages')
                .update({ read_at: new Date().toISOString() })
                .in('id', unreadMessages.map((m) => m.id))

            if (error) {
                logger.warn('ChatWindow: ошибка отметки сообщений как прочитанных', { error })
            } else if (unreadMessages.length > 0 && onMessageRead) {
                // Вызываем callback при успешной отметке сообщений как прочитанных
                onMessageRead()
            }
        } catch (error) {
            logger.warn('ChatWindow: ошибка отметки сообщений как прочитанных', { error })
        }
    }, [supabase, messages, userId, onMessageRead])

    // Подписка на новые сообщения
    useEffect(() => {
        if (!userId || !otherUserId) return

        const messagesChannel = subscribeToMessages(
            userId,
            otherUserId,
            (newMessage) => {
                setMessages((prev) => {
                    // Проверяем, нет ли уже этого сообщения (включая временные)
                    if (prev.some((m) => m.id === newMessage.id)) {
                        return prev
                    }
                    // Если это сообщение от текущего пользователя, заменяем временное сообщение
                    if (newMessage.sender_id === userId) {
                        // Удаляем временное сообщение и добавляем реальное
                        const filtered = prev.filter((m) => !m.id.startsWith('temp-') || m.content !== newMessage.content)
                        return [...filtered, newMessage]
                    }
                    return [...prev, newMessage]
                })

                // Автоматически отмечаем как прочитанное, если окно открыто
                markAsRead()
            },
            (status) => {
                setConnectionStatus(status)
                if (status.error && !status.reconnecting) {
                    toast.error(status.error, { duration: 5000 })
                }
            }
        )

        const typingChannel = subscribeToTyping(userId, otherUserId, (typing) => {
            setIsTyping(typing)
        })

        // Сохраняем ссылки на каналы
        messagesChannelRef.current = messagesChannel
        typingChannelRef.current = typingChannel

        return () => {
            if (messagesChannelRef.current) {
                unsubscribeFromChannel(messagesChannelRef.current)
            }
            if (typingChannelRef.current) {
                unsubscribeFromChannel(typingChannelRef.current)
            }
        }
    }, [userId, otherUserId, markAsRead])

    // Загрузка сообщений при монтировании
    useEffect(() => {
        loadMessages(0, false)
    }, [loadMessages])

    // Отметка как прочитанных при открытии окна
    useEffect(() => {
        markAsRead()
    }, [markAsRead])

    const handleLoadMore = () => {
        if (!loading && hasMore) {
            loadMessages(page + 1, true)
        }
    }

    const heightStyle = className.includes('h-full') 
        ? { height: '100%' } 
        : { height: '600px', maxHeight: 'calc(100vh - 2rem)' }
    
    return (
        <div className={`flex flex-col bg-white rounded-lg shadow-lg border border-gray-200 ${className}`} style={heightStyle}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <div className="flex items-center gap-2 flex-1">
                    <MessageSquare size={20} className="text-gray-600" />
                    <h3 className="font-semibold text-gray-900">{otherUserName}</h3>
                    {isTyping && (
                        <span className="text-xs text-gray-500 italic">печатает...</span>
                    )}
                </div>
                {/* Индикатор состояния подключения */}
                <div className="flex items-center gap-2">
                    {connectionStatus.reconnecting ? (
                        <div className="flex items-center gap-1 text-yellow-600 text-xs">
                            <Loader2 size={14} className="animate-spin" />
                            <span>{connectionStatus.error || 'Переподключение...'}</span>
                        </div>
                    ) : connectionStatus.connected ? (
                        <div className="flex items-center gap-1 text-green-600" title="Подключено">
                            <Wifi size={16} />
                        </div>
                    ) : connectionStatus.error ? (
                        <div className="flex items-center gap-1 text-red-600" title={connectionStatus.error}>
                            <WifiOff size={16} />
                        </div>
                    ) : null}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Закрыть"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>
            </div>

            {/* Messages List */}
            {loading && messages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-4">
                    <div className="text-center">
                        <Loader2 className="animate-spin mx-auto mb-2 text-gray-400" size={24} />
                        <p className="text-sm text-gray-500">Загрузка сообщений...</p>
                    </div>
                </div>
            ) : messages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-4">
                    <div className="text-center text-gray-500 text-sm">
                        <p>Нет сообщений</p>
                        <p className="text-xs mt-2">Начните общение с {otherUserName}</p>
                    </div>
                </div>
            ) : (
                <MessageList
                    messages={messages}
                    currentUserId={userId}
                    onLoadMore={handleLoadMore}
                    hasMore={hasMore}
                    loading={loading}
                    onEditMessage={async (messageId, newContent) => {
                        try {
                            const { error } = await supabase
                                .from('messages')
                                .update({ content: newContent })
                                .eq('id', messageId)
                                .eq('sender_id', userId) // Только свои сообщения можно редактировать

                            if (error) throw error

                            // Обновляем локальное состояние
                            setMessages((prev) =>
                                prev.map((m) =>
                                    m.id === messageId ? { ...m, content: newContent } : m
                                )
                            )

                            toast.success('Сообщение отредактировано')
                        } catch (error) {
                            logger.error('ChatWindow: ошибка редактирования сообщения', error)
                            toast.error('Ошибка редактирования сообщения')
                            throw error
                        }
                    }}
                    onDeleteMessage={async (messageId) => {
                        try {
                            const { error } = await supabase
                                .from('messages')
                                .update({ is_deleted: true })
                                .eq('id', messageId)
                                .eq('sender_id', userId) // Только свои сообщения можно удалять

                            if (error) throw error

                            // Обновляем локальное состояние
                            setMessages((prev) =>
                                prev.map((m) =>
                                    m.id === messageId ? { ...m, is_deleted: true } : m
                                )
                            )

                            toast.success('Сообщение удалено')
                        } catch (error) {
                            logger.error('ChatWindow: ошибка удаления сообщения', error)
                            toast.error('Ошибка удаления сообщения')
                            throw error
                        }
                    }}
                />
            )}

            {/* Message Input */}
            <MessageInput
                onSend={handleSend}
                disabled={sending}
                currentUserId={userId}
                otherUserId={otherUserId}
                placeholder={`Написать ${otherUserName}...`}
            />
        </div>
    )
}

