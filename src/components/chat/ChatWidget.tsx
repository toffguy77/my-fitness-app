'use client'

import { useState, useEffect, useRef } from 'react'
import { MessageSquare, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import ChatWindow from './ChatWindow'
import { subscribeToMessages, unsubscribeFromChannel, type Message } from '@/utils/chat/realtime'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'
import type { UserProfile } from '@/utils/supabase/profile'

interface ChatWidgetProps {
  userId: string
  coachId: string | null
  className?: string
}

export default function ChatWidget({ userId, coachId, className = '' }: ChatWidgetProps) {
  const supabase = createClient()
  const [isOpen, setIsOpen] = useState(false)
  const [coachProfile, setCoachProfile] = useState<UserProfile | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const messageChannelRef = useRef<any>(null)
  const notificationSoundRef = useRef<{ play: () => void } | null>(null)
  const lastNotificationRef = useRef<string>('')

  // Вычисляем имя тренера из профиля
  const coachName = coachProfile?.full_name || coachProfile?.email || 'Тренер'

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

  // Загрузка профиля тренера
  useEffect(() => {
    if (!coachId) {
      setLoading(false)
      return
    }

    const loadCoachProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('id', coachId)
          .single()

        if (error) {
          throw error
        }

        setCoachProfile(data as UserProfile)
      } catch (error) {
        logger.error('ChatWidget: ошибка загрузки профиля тренера', error, { coachId })
      } finally {
        setLoading(false)
      }
    }

    loadCoachProfile()
  }, [supabase, coachId])

  // Загрузка количества непрочитанных сообщений
  useEffect(() => {
    if (!coachId || loading) return

    const loadUnreadCount = async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('id', { count: 'exact' })
          .eq('receiver_id', userId)
          .eq('sender_id', coachId)
          .is('read_at', null)
          .eq('is_deleted', false)

        if (error) {
          throw error
        }

        setUnreadCount(data?.length || 0)
      } catch (error) {
        logger.error('ChatWidget: ошибка загрузки непрочитанных сообщений', error, { userId, coachId })
      }
    }

    loadUnreadCount()

    // Подписка на новые сообщения для уведомлений
    if (!isOpen) {
      const messageChannel = subscribeToMessages(
        userId,
        coachId,
        (message: Message) => {
          // Проверяем, не показывали ли мы уже уведомление для этого сообщения
          if (message.id !== lastNotificationRef.current) {
            lastNotificationRef.current = message.id

            // Показываем toast уведомление
            toast.success(
              <div>
                <div className="font-medium">Новое сообщение от {coachName}</div>
                <div className="text-sm text-gray-600 truncate max-w-xs">{message.content}</div>
              </div>,
              {
                duration: 5000,
                icon: '💬',
              }
            )
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
      .channel(`unread:${userId}:${coachId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId},sender_id=eq.${coachId}`,
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
  }, [supabase, userId, coachId, loading, isOpen, coachName])

  if (!coachId || loading || !coachProfile) {
    return null
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
      {isOpen ? (
        <div className="w-96">
          <ChatWindow
            userId={userId}
            otherUserId={coachId}
            otherUserName={coachName}
            onClose={() => setIsOpen(false)}
          />
        </div>
      ) : (
        <button
          onClick={() => {
            setIsOpen(true)
            // Сбрасываем счетчик при открытии чата
            setUnreadCount(0)
          }}
          className="relative p-4 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-all hover:scale-110 active:scale-95"
          title={`Чат с ${coachName}${unreadCount > 0 ? ` (${unreadCount} непрочитанных)` : ''}`}
        >
          <MessageSquare size={24} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[24px] h-6 flex items-center justify-center px-1.5 animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}
    </div>
  )
}

