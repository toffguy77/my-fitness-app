'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { ArrowLeft, MessageSquare, Send } from 'lucide-react'
import ClientDashboardView from '@/components/ClientDashboardView'
import ChatWindow from '@/components/chat/ChatWindow'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'
import { playNotificationSound } from '@/utils/chat/sound'
import { showNotification, isNotificationSupported } from '@/utils/chat/notifications'

export default function ClientViewPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const clientId = params.clientId as string
  const [, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [clientName, setClientName] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [curatorNote, setCuratorNote] = useState<string>('')
  const [existingNote, setExistingNote] = useState<{ content: string; date: string } | null>(null)
  const [savingNote, setSavingNote] = useState(false)
  const [curatorUserId, setCuratorUserId] = useState<string | null>(null)
  const [showChatTab, setShowChatTab] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          router.push('/login')
          return
        }
        setUser(user)

        // Проверяем, что текущий пользователь - куратор этого клиента
        const { data: clientProfile } = await supabase
          .from('profiles')
          .select('curator_id, full_name, email')
          .eq('id', clientId)
          .single()

        if (!clientProfile || clientProfile.curator_id !== user.id) {
          router.push('/app/curator')
          return
        }

        setClientName(clientProfile.full_name || clientProfile.email || 'Клиент')
        setCuratorUserId(user.id)
        logger.debug('Curator: данные клиента загружены', { curatorId: user.id, clientId })

        // Загружаем количество непрочитанных сообщений от клиента
        const { count: unreadMessagesCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('sender_id', clientId)
          .eq('receiver_id', user.id)
          .is('read_at', null)
          .eq('is_deleted', false)

        setUnreadCount(unreadMessagesCount || 0)

        // Если есть непрочитанные сообщения, открываем чат по умолчанию
        // Но куратор всегда может открыть чат вручную, даже если нет сообщений
        if ((unreadMessagesCount || 0) > 0) {
          logger.debug('Curator: открываем чат автоматически из-за непрочитанных сообщений', {
            unreadCount: unreadMessagesCount,
            clientId
          })
          setShowChatTab(true)
        }

        // Загружаем существующую заметку за выбранную дату
        const { data: noteData } = await supabase
          .from('curator_notes')
          .select('content, date')
          .eq('client_id', clientId)
          .eq('curator_id', user.id)
          .eq('date', selectedDate)
          .single()

        if (noteData) {
          setExistingNote({ content: noteData.content, date: noteData.date })
          setCuratorNote(noteData.content)
        }

        setLoading(false)
      } catch (error) {
        logger.error('Curator: ошибка загрузки данных клиента', error, { clientId })
        router.push('/app/curator')
      }
    }

    fetchData()
  }, [router, supabase, clientId, selectedDate])

  // Подписка на новые сообщения для обновления счетчика
  useEffect(() => {
    if (!curatorUserId || !clientId) return

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) return

    const channel = supabase
      .channel(`unread-messages-${curatorUserId}-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${clientId} AND receiver_id=eq.${curatorUserId}`,
        },
        async () => {
          // Воспроизводим звук уведомления, если чат закрыт
          if (!showChatTab) {
            playNotificationSound()
          }

          // Обновляем счетчик при новом сообщении и получаем последнее сообщение
          const { data: messageData, count } = await supabase
            .from('messages')
            .select('content', { count: 'exact', head: true })
            .eq('sender_id', clientId)
            .eq('receiver_id', curatorUserId)
            .is('read_at', null)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          setUnreadCount(count || 0)

          // Показываем браузерное уведомление, если чат закрыт и страница не в фокусе
          if (!showChatTab && isNotificationSupported() && document.hidden && messageData) {
            showNotification(`Новое сообщение от ${clientName}`, {
              body: messageData.content.length > 100
                ? messageData.content.substring(0, 100) + '...'
                : messageData.content,
              tag: `curator-message-${clientId}`,
              requireInteraction: false,
            }).catch((error) => {
              logger.warn('Curator: ошибка показа браузерного уведомления', { error })
            })
          }

          // Если есть новые непрочитанные сообщения, открываем чат
          if ((count || 0) > 0 && !showChatTab) {
            setShowChatTab(true)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [curatorUserId, clientId, supabase, showChatTab, clientName])

  const handleSaveNote = async () => {
    if (!curatorNote || !curatorNote.trim()) {
      toast.error('Введите текст заметки')
      return
    }

    // Сохраняем текущее состояние для отката при ошибке (оптимистичное обновление)
    const previousNote = existingNote ? { ...existingNote } : null
    const noteContent = (curatorNote || '').trim()

    // Оптимистичное обновление: сразу показываем сохраненную заметку
    setExistingNote({ content: noteContent, date: selectedDate })
    setSavingNote(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // Откатываем изменения если нет пользователя
        setExistingNote(previousNote)
        setSavingNote(false)
        return
      }

      const { error } = await supabase
        .from('curator_notes')
        .upsert({
          client_id: clientId,
          curator_id: user.id,
          date: selectedDate,
          content: noteContent,
          updated_at: new Date().toISOString()
        }, { onConflict: 'client_id,curator_id,date' })

      if (error) {
        // Откатываем изменения при ошибке
        setExistingNote(previousNote)
        throw error
      }

      logger.info('Curator: заметка сохранена', { curatorId: user.id, clientId, date: selectedDate })
      toast.success('Заметка сохранена')

      // Проверяем настройки уведомлений клиента перед отправкой
      const { data: notificationSettings } = await supabase
        .from('notification_settings')
        .select('email_realtime_alerts, email_daily_digest')
        .eq('user_id', clientId)
        .single()

      const shouldSendRealtime = notificationSettings?.email_realtime_alerts === true
      const shouldAddToDigest = notificationSettings?.email_daily_digest === true && !shouldSendRealtime

      if (shouldSendRealtime) {
        // Отправляем мгновенное уведомление через Edge Function
        try {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
          if (supabaseUrl) {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
              // Получаем имя куратора из профиля
              const { data: curatorProfile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', user.id)
                .single()

              await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  userId: clientId,
                  template: 'curator_note_notification',
                  data: {
                    date: selectedDate,
                    noteContent: (curatorNote || '').trim(),
                    curatorName: curatorProfile?.full_name || undefined,
                  },
                }),
              }).catch((err) => {
                logger.warn('Curator: ошибка отправки email уведомления', { error: err, clientId })
              })
            }
          }
        } catch (emailError) {
          logger.warn('Curator: ошибка отправки email уведомления', { error: emailError, clientId })
        }
      } else if (shouldAddToDigest) {
        // Добавляем в очередь для дайджеста
        try {
          const { error: queueError } = await supabase
            .from('pending_notifications')
            .insert({
              user_id: clientId,
              notification_type: 'curator_note',
              content: {
                date: selectedDate,
                noteContent: (curatorNote || '').trim(),
                curatorId: user.id
              }
            })

          if (queueError) {
            logger.warn('Curator: ошибка добавления в очередь уведомлений', { error: queueError, clientId })
          } else {
            logger.info('Curator: уведомление добавлено в очередь дайджеста', { clientId, date: selectedDate })
          }
        } catch (queueError) {
          logger.warn('Curator: ошибка добавления в очередь', { error: queueError, clientId })
        }
      }

    } catch (error) {
      // Откатываем изменения при ошибке
      setExistingNote(previousNote)
      const errorMessage = error instanceof Error ? error.message : 'Ошибка сохранения заметки'
      logger.error('Curator: ошибка сохранения заметки', error, { clientId, date: selectedDate })
      toast.error(errorMessage)
    } finally {
      setSavingNote(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-zinc-400">Загрузка...</div>

  return (
    <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 md:max-w-md md:mx-auto font-sans">
      <header className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.push('/app/curator')}
          className="h-8 w-8 flex items-center justify-center bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors text-zinc-300"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-zinc-100">{clientName}</h1>
          <p className="text-sm text-zinc-400">Режим просмотра</p>
        </div>
      </header>

      {/* Date Picker для куратора */}
      <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 mb-4">
        <label className="block text-sm font-medium text-zinc-300 mb-2">Дата для заметки</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value)
            setCuratorNote('')
            setExistingNote(null)
          }}
          max={new Date().toISOString().split('T')[0]}
          className="w-full p-2 border border-zinc-800 rounded-lg text-sm text-zinc-100 bg-zinc-900"
        />
      </div>

      {/* Tabs: Заметки и Чат */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 mb-6 overflow-hidden">
        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => setShowChatTab(false)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${!showChatTab
              ? 'bg-white text-zinc-950'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
              }`}
          >
            Заметка
          </button>
          <button
            onClick={() => setShowChatTab(true)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${showChatTab
              ? 'bg-white text-zinc-950'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
              }`}
            title={unreadCount > 0 ? `${unreadCount} непрочитанных сообщений` : 'Открыть чат с клиентом'}
          >
            <span className="flex items-center justify-center gap-2">
              <MessageSquare size={16} />
              Чат
            </span>
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 bg-rose-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center tabular-nums">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>

        {!showChatTab ? (
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={20} className="text-zinc-400" />
              <h2 className="text-lg font-bold text-zinc-100">Заметка для клиента</h2>
            </div>
            {existingNote && (
              <div className="mb-3 p-3 bg-blue-950/20 border border-blue-800/50 rounded-lg text-sm text-blue-300">
                Существующая заметка за {new Date(existingNote.date).toLocaleDateString('ru-RU')}
              </div>
            )}
            <textarea
              value={curatorNote || ''}
              onChange={(e) => setCuratorNote(e.target.value)}
              placeholder="Напишите заметку для клиента на эту дату..."
              rows={4}
              className="w-full p-3 bg-zinc-800 rounded-xl border border-zinc-700 text-sm text-zinc-100 focus:ring-2 focus:ring-white outline-none resize-none placeholder:text-zinc-500"
            />
            <button
              onClick={handleSaveNote}
              disabled={savingNote || !curatorNote || !curatorNote.trim()}
              className="mt-3 w-full py-2 bg-white text-zinc-950 rounded-xl font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Send size={16} />
              {savingNote ? 'Сохранение...' : 'Сохранить заметку'}
            </button>
          </div>
        ) : (
          <div className="p-6">
            {curatorUserId ? (
              <ChatWindow
                userId={curatorUserId}
                otherUserId={clientId}
                otherUserName={clientName}
                onMessageRead={() => {
                  // Обновляем счетчик непрочитанных при прочтении сообщений
                  supabase
                    .from('messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('sender_id', clientId)
                    .eq('receiver_id', curatorUserId)
                    .is('read_at', null)
                    .eq('is_deleted', false)
                    .then(({ count }) => {
                      setUnreadCount(count || 0)
                    })
                }}
              />
            ) : (
              <div className="text-center py-8 text-zinc-500 text-sm">
                Загрузка чата...
              </div>
            )}
          </div>
        )}
      </div>

      <ClientDashboardView
        clientId={clientId}
        readOnly={true}
        onTargetsUpdate={() => {
          // Обновляем данные после изменения целей
          router.refresh()
        }}
      />
    </main>
  )
}
