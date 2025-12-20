'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Trophy, Medal, Award, TrendingUp } from 'lucide-react'
import { logger } from '@/utils/logger'
import LoadingSpinner from '@/components/LoadingSpinner'
import Link from 'next/link'

interface LeaderboardEntry {
  user_id: string
  full_name?: string | null
  avatar_url?: string | null
  total_achievements: number
  total_streak_days: number
  total_meals: number
  total_ocr_scans: number
  rank: number
}

export default function LeaderboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [activeTab, setActiveTab] = useState<'achievements' | 'streak' | 'meals' | 'ocr'>('achievements')

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true)

        const query = supabase
          .from('profiles')
          .select(`
            id,
            full_name,
            avatar_url,
            profile_visibility
          `)
          .eq('profile_visibility', 'public')

        const { data: publicProfiles, error: profilesError } = await query

        if (profilesError) {
          throw profilesError
        }

        if (!publicProfiles || publicProfiles.length === 0) {
          setLeaderboard([])
          setLoading(false)
          return
        }

        const userIds = publicProfiles.map(p => p.id)

        // Загружаем данные для лидерборда
        const entries: LeaderboardEntry[] = []

        for (const profile of publicProfiles) {
          // Подсчитываем достижения
          const { count: achievementsCount } = await supabase
            .from('user_achievements')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', profile.id)
            .eq('progress', 100)

          // Подсчитываем streak дней
          const { data: streakData } = await supabase
            .from('daily_logs')
            .select('date')
            .eq('user_id', profile.id)
            .gt('actual_calories', 0)
            .order('date', { ascending: false })
            .limit(365)

          let streakDays = 0
          if (streakData && streakData.length > 0) {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const currentDate = new Date(today)
            let currentStreak = 0

            for (const log of streakData) {
              const logDate = new Date(log.date)
              logDate.setHours(0, 0, 0, 0)
              
              if (logDate.getTime() === currentDate.getTime()) {
                currentStreak++
                currentDate.setDate(currentDate.getDate() - 1)
              } else if (logDate.getTime() < currentDate.getTime()) {
                break
              }
            }
            streakDays = currentStreak
          }

          // Подсчитываем общее количество приемов пищи
          const { data: logsData } = await supabase
            .from('daily_logs')
            .select('meals')
            .eq('user_id', profile.id)
            .not('meals', 'is', null)

          let totalMeals = 0
          if (logsData) {
            for (const log of logsData) {
              if (log.meals && Array.isArray(log.meals)) {
                totalMeals += log.meals.length
              }
            }
          }

          // Подсчитываем OCR сканирования
          const { count: ocrCount } = await supabase
            .from('ocr_scans')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', profile.id)
            .eq('success', true)

          entries.push({
            user_id: profile.id,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url,
            total_achievements: achievementsCount || 0,
            total_streak_days: streakDays,
            total_meals: totalMeals,
            total_ocr_scans: ocrCount || 0,
            rank: 0, // Будет установлено после сортировки
          })
        }

        // Сортируем по выбранной категории
        entries.sort((a, b) => {
          switch (activeTab) {
            case 'achievements':
              return b.total_achievements - a.total_achievements
            case 'streak':
              return b.total_streak_days - a.total_streak_days
            case 'meals':
              return b.total_meals - a.total_meals
            case 'ocr':
              return b.total_ocr_scans - a.total_ocr_scans
            default:
              return 0
          }
        })

        // Устанавливаем ранги
        entries.forEach((entry, index) => {
          entry.rank = index + 1
        })

        setLeaderboard(entries)
      } catch (error) {
        logger.error('Leaderboard: ошибка загрузки лидерборда', error, {})
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboard()
  }, [supabase, activeTab])

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="text-yellow-500" size={20} />
    if (rank === 2) return <Medal className="text-gray-400" size={20} />
    if (rank === 3) return <Award className="text-orange-600" size={20} />
    return <span className="text-sm font-bold text-gray-600 w-5 text-center">#{rank}</span>
  }

  const getRankColor = (rank: number) => {
    if (rank === 1) return 'bg-yellow-50 border-yellow-200'
    if (rank === 2) return 'bg-gray-50 border-gray-200'
    if (rank === 3) return 'bg-orange-50 border-orange-200'
    return 'bg-white border-gray-200'
  }

  const getTabValue = (tab: typeof activeTab) => {
    switch (tab) {
      case 'achievements':
        return 'total_achievements'
      case 'streak':
        return 'total_streak_days'
      case 'meals':
        return 'total_meals'
      case 'ocr':
        return 'total_ocr_scans'
    }
  }

  return (
    <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 md:max-w-2xl md:mx-auto font-sans space-y-6">
      {/* Заголовок */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
        >
          ←
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Лидерборд</h1>
          <p className="text-sm text-gray-500">Рейтинг пользователей</p>
        </div>
      </div>

      {/* Вкладки */}
      <div className="bg-white p-2 rounded-xl border border-gray-100">
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => setActiveTab('achievements')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'achievements'
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Trophy size={16} className="inline mr-1" />
            Достижения
          </button>
          <button
            onClick={() => setActiveTab('streak')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'streak'
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <TrendingUp size={16} className="inline mr-1" />
            Серия
          </button>
          <button
            onClick={() => setActiveTab('meals')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'meals'
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Приемы пищи
          </button>
          <button
            onClick={() => setActiveTab('ocr')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'ocr'
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            OCR
          </button>
        </div>
      </div>

      {/* Лидерборд */}
      {loading ? (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <LoadingSpinner />
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
          <Trophy size={48} className="mx-auto mb-2 text-gray-300" />
          <p className="text-gray-500">Пока нет участников в лидерборде</p>
          <p className="text-sm text-gray-400 mt-2">
            Сделайте свой профиль публичным, чтобы участвовать
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaderboard.map((entry) => (
            <Link
              key={entry.user_id}
              href={`/profile/${entry.user_id}`}
              className="block"
            >
              <div
                className={`p-4 rounded-xl border-2 transition-all hover:shadow-md ${getRankColor(entry.rank)}`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    {getRankIcon(entry.rank)}
                  </div>
                  
                  {entry.avatar_url ? (
                    <img
                      src={entry.avatar_url}
                      alt={entry.full_name || 'Пользователь'}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-lg font-bold text-gray-600">
                      {(entry.full_name || 'U')[0].toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {entry.full_name || 'Пользователь'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {entry[getTabValue(activeTab) as keyof LeaderboardEntry]} {
                        activeTab === 'achievements' ? 'достижений' :
                        activeTab === 'streak' ? 'дней подряд' :
                        activeTab === 'meals' ? 'приемов пищи' :
                        'OCR сканирований'
                      }
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}

