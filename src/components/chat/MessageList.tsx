'use client'

import { useEffect, useRef } from 'react'
// Форматирование дат без внешних библиотек
const formatDate = (date: Date): string => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const messageDate = new Date(date)
    messageDate.setHours(0, 0, 0, 0)

    if (messageDate.getTime() === today.getTime()) {
        return 'Сегодня'
    }
    if (messageDate.getTime() === yesterday.getTime()) {
        return 'Вчера'
    }

    const months = [
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ]

    return `${messageDate.getDate()} ${months[messageDate.getMonth()]} ${messageDate.getFullYear()}`
}

const formatTime = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
}
import type { Message } from '@/types/chat'

interface MessageListProps {
    messages: Message[]
    currentUserId: string
    onLoadMore?: () => void
    hasMore?: boolean
    loading?: boolean
}

export default function MessageList({
    messages,
    currentUserId,
    onLoadMore,
    hasMore = false,
    loading = false,
}: MessageListProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const listRef = useRef<HTMLDivElement>(null)

    // Автоскролл к последнему сообщению
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages])

    // Группировка сообщений по датам
    const groupedMessages = messages.reduce((groups, message) => {
        const date = new Date(message.created_at)
        const dateKey = date.toISOString().split('T')[0] // yyyy-MM-dd

        if (!groups[dateKey]) {
            groups[dateKey] = []
        }
        groups[dateKey].push(message)

        return groups
    }, {} as Record<string, Message[]>)

    // Если нет сообщений, показываем сообщение
    if (messages.length === 0) {
        return (
            <div ref={listRef} className="flex-1 overflow-y-auto p-4 flex items-center justify-center">
                <div className="text-center text-gray-500 text-sm">
                    <p>Нет сообщений</p>
                    <p className="text-xs mt-2">Начните общение с клиентом</p>
                </div>
            </div>
        )
    }

    return (
        <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {hasMore && (
                <div className="flex justify-center">
                    <button
                        onClick={onLoadMore}
                        disabled={loading}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
                    >
                        {loading ? 'Загрузка...' : 'Загрузить предыдущие сообщения'}
                    </button>
                </div>
            )}

            {Object.entries(groupedMessages).map(([dateKey, dateMessages]) => (
                <div key={dateKey} className="space-y-2">
                    <div className="flex justify-center">
                        <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                            {formatDate(new Date(dateKey))}
                        </span>
                    </div>

                    {dateMessages.map((message) => {
                        const isOwn = message.sender_id === currentUserId
                        const date = new Date(message.created_at)

                        return (
                            <div
                                key={message.id}
                                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[70%] rounded-lg px-3 py-2 ${isOwn
                                            ? 'bg-black text-white'
                                            : 'bg-gray-100 text-gray-900'
                                        }`}
                                >
                                    <p className="text-sm whitespace-pre-wrap break-words">
                                        {message.content}
                                    </p>
                                    <p
                                        className={`text-xs mt-1 ${isOwn ? 'text-gray-300' : 'text-gray-500'
                                            }`}
                                    >
                                        {formatTime(date)}
                                        {message.read_at && isOwn && (
                                            <span className="ml-1">✓</span>
                                        )}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ))}

            <div ref={messagesEndRef} />
        </div>
    )
}

