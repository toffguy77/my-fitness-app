'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageSquare, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import ChatWindow from './ChatWindow'
import { subscribeToMessages, unsubscribeFromChannel, type Message } from '@/utils/chat/realtime'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'
import type { UserProfile } from '@/utils/supabase/profile'
import { showNotification, isNotificationSupported } from '@/utils/chat/notifications'

interface ChatWidgetProps {
  userId: string
  coordinatorId: string | null
  className?: string
}

export default function ChatWidget({ userId, coordinatorId, className = '' }: ChatWidgetProps) {
  const supabase = createClient()
  const [isOpen, setIsOpen] = useState(false)
  const [coordinatorProfile, setCoordinatorProfile] = useState<UserProfile | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const messageChannelRef = useRef<any>(null)
  const notificationSoundRef = useRef<{ play: () => void } | null>(null)
  const lastNotificationRef = useRef<string>('')

  // Вычисляем имя координатора из профиля
  const coordinatorName = coordinatorProfile?.full_name || coordinatorProfile?.email || 'Координатор'

  // Инициализация звука уведомления
  useEffect(() => {
    // Создаем простой звук уведомления (beep)
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    const audioContext = new AudioContextClass()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = 800
    oscillator.type = 'sine'
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.1)

    // Сохраняем функцию для воспроизведения
    notificationSoundRef.current = {
      play: () => {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()

          osc.connect(gain)
          gain.connect(ctx.destination)

          osc.frequency.value = 800
          osc.type = 'sine'
          gain.gain.setValueAtTime(0.3, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1)

          osc.start(ctx.currentTime)
          osc.stop(ctx.currentTime + 0.1)
        } catch (error) {
          // Игнорируем ошибки воспроизведения звука
        }
      }
    } as { play: () => void }
  }, [])

  // Загрузка профиля координатора
  useEffect(() => {
    if (!coordinatorId) {
      setLoading(false)
      return
    }

    const loadCoordinatorProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('id', coordinatorId)
          .single()

        if (error) {
          throw error
        }

        setCoordinatorProfile(data as UserProfile)
      } catch (error) {
        logger.error('ChatWidget: ошибка загрузки профиля координатора', error, { coordinatorId })
      } finally {
        setLoading(false)
      }
    }

    loadCoordinatorProfile()
  }, [supabase, coordinatorId])

  // Загрузка количества непрочитанных сообщений
  const loadUnreadCount = useCallback(async () => {
    if (!coordinatorId || loading) return

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id', { count: 'exact' })
        .eq('receiver_id', userId)
        .eq('sender_id', coordinatorId)
        .is('read_at', null)
        .eq('is_deleted', false)

      if (error) {
        throw error
      }

      setUnreadCount(data?.length || 0)
    } catch (error) {
      logger.error('ChatWidget: ошибка загрузки непрочитанных сообщений', error, { userId, coordinatorId })
    }
  }, [coordinatorId, loading, supabase, userId])

  useEffect(() => {
    if (!coordinatorId || loading) return

    loadUnreadCount()

    // Подписка на новые сообщения для уведомлений
    if (!isOpen) {
      const messageChannel = subscribeToMessages(
        userId,
        coordinatorId,
        (message: Message) => {
          // Проверяем, не показывали ли мы уже уведомление для этого сообщения
          if (message.id !== lastNotificationRef.current) {
            lastNotificationRef.current = message.id

            // Показываем toast уведомление
            toast.success(
              <div>
                <div className="font-medium">Новое сообщение от {coordinatorName}</div>
                <div className="text-sm text-gray-600 truncate max-w-xs">{message.content}</div>
              </div>,
              {
                duration: 5000,
                icon: '💬',
              }
            )

            // Показываем браузерное уведомление, если поддерживается и разрешено
            if (isNotificationSupported() && document.hidden) {
              showNotification(`Новое сообщение от ${coordinatorName}`, {
                body: message.content.length > 100 
                  ? message.content.substring(0, 100) + '...' 
                  : message.content,
                tag: `message-${message.id}`,
                requireInteraction: false,
              }).catch((error) => {
                logger.warn('ChatWidget: ошибка показа браузерного уведомления', { error })
              })
            }
            // Открываем чат при клике на toast
            setTimeout(() => {
              const toastElement = document.querySelector('[data-hot-toast]')
              if (toastElement) {
                toastElement.addEventListener('click', () => setIsOpen(true), { once: true })
              }
            }, 100)

            // Воспроизводим звук уведомления
            if (notificationSoundRef.current) {
              notificationSoundRef.current.play()
            }

            // Обновляем счетчик непрочитанных
            loadUnreadCount()
          }
        }
      )
      messageChannelRef.current = messageChannel
    }

    // Подписка на изменения непрочитанных сообщений
    const channel = supabase
      .channel(`unread:${userId}:${coordinatorId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId},sender_id=eq.${coordinatorId}`,
        },
        () => {
          loadUnreadCount()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (messageChannelRef.current) {
        unsubscribeFromChannel(messageChannelRef.current)
        messageChannelRef.current = null
      }
    }
  }, [supabase, userId, coordinatorId, loading, isOpen, coordinatorName, loadUnreadCount])

  if (!coordinatorId || loading || !coordinatorProfile) {
    return null
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${className} sm:bottom-6 sm:right-6`}>
      {isOpen ? (
        <div className="w-full sm:w-96 max-w-[calc(100vw-2rem)] sm:max-w-none h-[calc(100vh-8rem)] sm:h-[600px]">
          <ChatWindow
            userId={userId}
            otherUserId={coordinatorId}
            otherUserName={coordinatorName}
            onClose={() => {
              setIsOpen(false)
              // Обновляем счетчик при закрытии
              loadUnreadCount()
            }}
            onMessageRead={() => {
              // Обновляем счетчик при прочтении сообщений
              loadUnreadCount()
            }}
            className="h-full"
          />
        </div>
      ) : (
        <button
          onClick={() => {
            setIsOpen(true)
            // Сбрасываем счетчик при открытии чата
            setUnreadCount(0)
          }}
          className="relative p-3 sm:p-4 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-all hover:scale-110 active:scale-95 touch-manipulation"
          title={`Чат с ${coordinatorName}${unreadCount > 0 ? ` (${unreadCount} непрочитанных)` : ''}`}
          aria-label={`Открыть чат с ${coordinatorName}${unreadCount > 0 ? `, ${unreadCount} непрочитанных сообщений` : ''}`}
        >
          <MessageSquare size={20} className="sm:w-6 sm:h-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] sm:min-w-[24px] h-5 sm:h-6 flex items-center justify-center px-1 sm:px-1.5 ring-2 ring-white text-[10px] sm:text-xs">
              {unreadCount > 99 ? '99+' : unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}
    </div>
  )
}

