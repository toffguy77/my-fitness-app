'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { LogOut } from 'lucide-react'
import { logger } from '@/utils/logger'

type DailyLog = {
  id: string
  user_id: string
  date: string
  actual_calories: number
  actual_protein: number
  actual_fats: number
  actual_carbs: number
  notes?: string
}

export default function ReportsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          router.push('/login')
          return
        }
        setUser(user)

        logger.debug('Reports: загрузка отчетов', { userId: user.id })
        const { data, error } = await supabase
          .from('daily_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false })

        if (error) {
          logger.error('Reports: ошибка загрузки отчетов', error, { userId: user.id })
        } else if (data) {
          setLogs(data as DailyLog[])
          logger.info('Reports: отчеты успешно загружены', { userId: user.id, count: data.length })
        }
      } catch (error) {
        logger.error('Reports: ошибка загрузки данных', error)
      } finally {
        setLoading(false)
        logger.debug('Reports: загрузка данных завершена')
      }
    }

    fetchData()
  }, [router, supabase])

  const today = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    return logs.find((l) => l.date === todayStr)
  }, [logs])

  const grouped = useMemo(() => {
    const byWeek: Record<string, DailyLog[]> = {}
    logs.forEach((log) => {
      const weekKey = getWeekKey(log.date)
      if (!byWeek[weekKey]) byWeek[weekKey] = []
      byWeek[weekKey].push(log)
    })
    return byWeek
  }, [logs])

  if (loading) return <div className="p-6 text-center text-sm text-zinc-400">Загружаем отчеты...</div>
  if (!user) return null

  return (
    <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 md:max-w-md md:mx-auto font-sans space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Сводка</h1>
          <p className="text-sm text-zinc-400">Отчеты по дням и неделям</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="text-sm text-zinc-300 underline decoration-dotted"
          >
            ← Назад
          </button>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              router.push('/login')
              router.refresh()
            }}
            className="h-8 w-8 flex items-center justify-center bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors"
            title="Выйти"
          >
            <LogOut size={16} className="text-zinc-400" />
          </button>
        </div>
      </header>

      {today ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100">Сегодня</h2>
            <span className="text-xs text-zinc-400">{formatDate(today.date)}</span>
          </div>
          <DayStats log={today} />
          {today.notes && (
            <p className="text-xs text-zinc-300 whitespace-pre-line">Комментарий: {today.notes}</p>
          )}
        </section>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">
          За сегодня отчета нет.
        </div>
      )}

      <section className="space-y-4">
        {Object.entries(grouped).map(([weekKey, weekLogs]) => (
          <div key={weekKey} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">Неделя {weekKey}</h3>
              <span className="text-xs text-zinc-400">{weekRangeLabel(weekLogs)}</span>
            </div>
            <div className="space-y-2">
              {weekLogs.map((log) => (
                <div key={log.id} className="rounded-xl bg-zinc-800 p-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{formatDate(log.date)}</p>
                    <p className="text-xs text-zinc-400 tabular-nums">
                      {log.actual_calories} ккал • Б {log.actual_protein} / Ж {log.actual_fats} / У {log.actual_carbs}
                    </p>
                  </div>
                  <span className="text-[11px] text-zinc-500 uppercase">{weekdayShort(log.date)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  )
}

function DayStats({ log }: { log: DailyLog }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <StatCard label="Калории" value={`${log.actual_calories} ккал`} />
      <StatCard label="Белки" value={`${log.actual_protein} г`} />
      <StatCard label="Жиры" value={`${log.actual_fats} г`} />
      <StatCard label="Углеводы" value={`${log.actual_carbs} г`} />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-800 p-3">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="text-sm font-semibold text-zinc-100 tabular-nums">{value}</p>
    </div>
  )
}

function getWeekKey(dateStr: string) {
  const date = new Date(dateStr)
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
  const pastDaysOfYear = (date.valueOf() - firstDayOfYear.valueOf()) / 86400000
  const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
  return `${weekNumber}`
}

function weekRangeLabel(logs: DailyLog[]) {
  if (!logs.length) return ''
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date))
  return `${formatDate(sorted[0].date)} — ${formatDate(sorted[sorted.length - 1].date)}`
}

function weekdayShort(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ru-RU', { weekday: 'short' })
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

