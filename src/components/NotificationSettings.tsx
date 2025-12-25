'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { Bell, Mail } from 'lucide-react'
import { logger } from '@/utils/logger'

interface NotificationSettings {
  email_daily_digest: boolean
  email_realtime_alerts: boolean
}

export default function NotificationSettings() {
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [settings, setSettings] = useState<NotificationSettings>({
    email_daily_digest: true,
    email_realtime_alerts: false
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          setLoading(false)
          return
        }

        setUser(user)

        // Загружаем настройки уведомлений
        const { data, error } = await supabase
          .from('notification_settings')
          .select('email_daily_digest, email_realtime_alerts')
          .eq('user_id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') {
          logger.error('NotificationSettings: ошибка загрузки', error, { userId: user.id })
        }

        if (data) {
          setSettings({
            email_daily_digest: data.email_daily_digest ?? true,
            email_realtime_alerts: data.email_realtime_alerts ?? false
          })
        } else {
          // Создаем дефолтные настройки
          const { error: insertError } = await supabase
            .from('notification_settings')
            .insert({
              user_id: user.id,
              email_daily_digest: true,
              email_realtime_alerts: false
            })

          if (insertError) {
            logger.error('NotificationSettings: ошибка создания настроек', insertError, { userId: user.id })
          }
        }
      } catch (error) {
        logger.error('NotificationSettings: исключение при загрузке', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [supabase])

  const handleSave = async () => {
    if (!user) return

    setSaving(true)
    setMessage(null)

    try {
      const { error } = await supabase
        .from('notification_settings')
        .upsert({
          user_id: user.id,
          email_daily_digest: settings.email_daily_digest,
          email_realtime_alerts: settings.email_realtime_alerts,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })

      if (error) {
        throw error
      }

      setMessage('Настройки сохранены!')
      setTimeout(() => setMessage(null), 3000)
      logger.info('NotificationSettings: настройки сохранены', { userId: user.id, settings })
    } catch (error) {
      logger.error('NotificationSettings: ошибка сохранения', error, { userId: user.id })
      setMessage('Ошибка сохранения настроек')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-4 text-center text-gray-500">Загрузка...</div>
  }

  return (
    <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <Bell size={20} className="text-gray-600" />
        <h2 className="text-lg font-bold text-gray-900">Уведомления</h2>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${message.includes('Ошибка')
            ? 'bg-red-50 border border-red-200 text-red-800'
            : 'bg-green-50 border border-green-200 text-green-800'
          }`}>
          {message}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <Mail size={20} className="text-gray-600 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="daily_digest" className="text-sm font-medium text-gray-900 cursor-pointer">
                Ежедневная сводка
              </label>
              <input
                type="checkbox"
                id="daily_digest"
                checked={settings.email_daily_digest}
                onChange={(e) => setSettings(prev => ({ ...prev, email_daily_digest: e.target.checked }))}
                className="w-5 h-5 text-black border-gray-300 rounded focus:ring-2 focus:ring-black"
              />
            </div>
            <p className="text-xs text-gray-600">
              Получать один раз в день сводку по вашему прогрессу и заметкам от координатора
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <Bell size={20} className="text-gray-600 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="realtime_alerts" className="text-sm font-medium text-gray-900 cursor-pointer">
                Мгновенные уведомления
              </label>
              <input
                type="checkbox"
                id="realtime_alerts"
                checked={settings.email_realtime_alerts}
                onChange={(e) => setSettings(prev => ({ ...prev, email_realtime_alerts: e.target.checked }))}
                className="w-5 h-5 text-black border-gray-300 rounded focus:ring-2 focus:ring-black"
              />
            </div>
            <p className="text-xs text-gray-600">
              Получать email сразу при получении заметки от координатора или напоминании о чекине
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Сохранение...' : 'Сохранить настройки'}
        </button>
      </div>
    </section>
  )
}

