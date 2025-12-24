'use client'

import { Check, CheckCheck } from 'lucide-react'

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read'

interface MessageStatusProps {
  status: MessageStatus
  readAt: string | null
  className?: string
}

export default function MessageStatus({ status, readAt, className = '' }: MessageStatusProps) {
  if (status === 'sending') {
    return (
      <span className={`inline-flex items-center text-xs text-gray-400 ${className}`} title="Отправляется...">
        <span className="animate-pulse">•</span>
      </span>
    )
  }

  if (status === 'sent') {
    return (
      <span className={`inline-flex items-center text-xs text-gray-400 ${className}`} title="Отправлено">
        <Check size={12} />
      </span>
    )
  }

  if (status === 'delivered' || (status === 'read' && !readAt)) {
    return (
      <span className={`inline-flex items-center text-xs text-gray-400 ${className}`} title="Доставлено">
        <CheckCheck size={12} />
      </span>
    )
  }

  if (status === 'read' && readAt) {
    return (
      <span className={`inline-flex items-center text-xs text-blue-400 ${className}`} title="Прочитано">
        <CheckCheck size={12} className="fill-current" />
      </span>
    )
  }

  return null
}

/**
 * Определяет статус сообщения на основе данных
 */
export function getMessageStatus(
  message: { created_at: string; read_at: string | null },
  isOwn: boolean,
  isSending: boolean = false
): MessageStatus {
  if (isSending) return 'sending'
  if (!isOwn) return 'sent' // Для чужих сообщений не показываем статус
  
  // Для своих сообщений определяем статус
  if (message.read_at) {
    return 'read'
  }
  
  // Проверяем, было ли сообщение "доставлено" (прошло некоторое время с момента отправки)
  const sentTime = new Date(message.created_at).getTime()
  const now = Date.now()
  const timeSinceSent = now - sentTime
  
  // Если прошло больше 1 секунды, считаем доставленным
  if (timeSinceSent > 1000) {
    return 'delivered'
  }
  
  return 'sent'
}

