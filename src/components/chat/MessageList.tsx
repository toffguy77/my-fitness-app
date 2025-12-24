'use client'

import { useEffect, useRef, useState } from 'react'
import type { Message } from '@/types/chat'
import MessageStatus, { getMessageStatus } from './MessageStatus'
import { Edit2, Trash2, X, Check } from 'lucide-react'
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

interface MessageListProps {
    messages: Message[]
    currentUserId: string
    onLoadMore?: () => void
    hasMore?: boolean
    loading?: boolean
    onEditMessage?: (messageId: string, newContent: string) => Promise<void>
    onDeleteMessage?: (messageId: string) => Promise<void>
}

export default function MessageList({
    messages,
    currentUserId,
    onLoadMore,
    hasMore = false,
    loading = false,
    onEditMessage,
    onDeleteMessage,
}: MessageListProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
    const [editingContent, setEditingContent] = useState<string>('')
    const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)

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
                        const isEditing = editingMessageId === message.id
                        const isDeleting = deletingMessageId === message.id
                        const messageStatus = getMessageStatus(message, isOwn, message.id.startsWith('temp-'))

                        const handleEditStart = () => {
                            setEditingMessageId(message.id)
                            setEditingContent(message.content)
                        }

                        const handleEditCancel = () => {
                            setEditingMessageId(null)
                            setEditingContent('')
                        }

                        const handleEditSave = async () => {
                            if (!onEditMessage || !editingContent.trim()) return
                            try {
                                await onEditMessage(message.id, editingContent.trim())
                                setEditingMessageId(null)
                                setEditingContent('')
                            } catch (error) {
                                console.error('Error editing message:', error)
                            }
                        }

                        const handleDelete = async () => {
                            if (!onDeleteMessage) return
                            try {
                                await onDeleteMessage(message.id)
                                setDeletingMessageId(null)
                            } catch (error) {
                                console.error('Error deleting message:', error)
                            }
                        }

                        return (
                            <div
                                key={message.id}
                                className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}
                            >
                                <div className={`relative max-w-[70%] ${isOwn ? 'flex flex-col items-end' : 'flex flex-col items-start'}`}>
                                    {isEditing ? (
                                        <div className="w-full bg-white border-2 border-black rounded-lg p-3">
                                            <textarea
                                                value={editingContent}
                                                onChange={(e) => setEditingContent(e.target.value)}
                                                className="w-full p-2 border border-gray-300 rounded text-sm text-black focus:ring-2 focus:ring-black outline-none resize-none"
                                                rows={3}
                                                autoFocus
                                            />
                                            <div className="flex items-center justify-end gap-2 mt-2">
                                                <button
                                                    onClick={handleEditCancel}
                                                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                                                >
                                                    <X size={16} />
                                                </button>
                                                <button
                                                    onClick={handleEditSave}
                                                    disabled={!editingContent.trim()}
                                                    className="px-3 py-1 text-sm bg-black text-white rounded hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <Check size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            className={`rounded-lg px-3 py-2 ${isOwn
                                                    ? 'bg-black text-white'
                                                    : 'bg-gray-100 text-gray-900'
                                                }`}
                                        >
                                            {isDeleting ? (
                                                <p className="text-sm italic text-gray-400">Сообщение удалено</p>
                                            ) : (
                                                <>
                                                    <p className="text-sm whitespace-pre-wrap break-words">
                                                        {message.content}
                                                    </p>
                                                    <div className={`flex items-center justify-between gap-2 mt-1 ${isOwn ? 'text-gray-300' : 'text-gray-500'}`}>
                                                        <p className="text-xs">
                                                            {formatTime(date)}
                                                        </p>
                                                        {isOwn && (
                                                            <MessageStatus
                                                                status={messageStatus}
                                                                readAt={message.read_at}
                                                            />
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                    
                                    {/* Кнопки редактирования/удаления (только для своих сообщений) */}
                                    {isOwn && !isEditing && !isDeleting && onEditMessage && onDeleteMessage && (
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mt-1">
                                            <button
                                                onClick={handleEditStart}
                                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                                title="Редактировать"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (confirm('Удалить это сообщение?')) {
                                                        handleDelete()
                                                    }
                                                }}
                                                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                                title="Удалить"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    )}
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

