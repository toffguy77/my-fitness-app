'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Trophy, Calendar, Target, TrendingUp } from 'lucide-react'
import { logger } from '@/utils/logger'
import LoadingSpinner from '@/components/LoadingSpinner'
import AchievementBadge from '@/components/achievements/AchievementBadge'
import type { AchievementWithProgress } from '@/types/achievements'

interface PublicProfile {
  id: string
  full_name?: string | null
  avatar_url?: string | null
  profile_visibility?: string | null
  created_at?: string
}

export default function PublicProfilePage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const userId = params.userId as string

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [achievements, setAchievements] = useState<AchievementWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // Загружаем профиль
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, profile_visibility, created_at')
          .eq('id', userId)
          .single()

        if (profileError) {
          throw profileError
        }

        if (!profileData) {
          setError('Профиль не найден')
          setLoading(false)
          return
        }

        // Проверяем, что профиль публичный
        if (profileData.profile_visibility !== 'public') {
          setError('Этот профиль приватный')
          setLoading(false)
          return
        }

        setProfile(profileData)

        // Загружаем достижения пользователя
        const { data: achievementsData, error: achievementsError } = await supabase
          .from('user_achievements')
          .select(`
            achievement_id,
            progress,
            unlocked_at,
            achievements (
              id,
              code,
              name,
              description,
              category,
              icon_name,
              condition_type,
              condition_value,
              is_active,
              created_at
            )
          `)
          .eq('user_id', userId)
          .eq('progress', 100)
          .order('unlocked_at', { ascending: false })

        if (achievementsError) {
          logger.warn('PublicProfile: ошибка загрузки достижений', { error: achievementsError })
        } else if (achievementsData) {
          const formattedAchievements: AchievementWithProgress[] = achievementsData.map((item: any) => ({
            id: item.achievements.id,
            code: item.achievements.code,
            name: item.achievements.name,
            description: item.achievements.description,
            category: item.achievements.category || 'nutrition',
            icon_name: item.achievements.icon_name || 'trophy',
            condition_type: item.achievements.condition_type || '',
            condition_value: item.achievements.condition_value || 0,
            is_active: item.achievements.is_active !== undefined ? item.achievements.is_active : true,
            created_at: item.achievements.created_at || new Date().toISOString(),
            isUnlocked: item.progress === 100,
            unlockedAt: item.unlocked_at || undefined,
            progress: item.progress || 0,
          }))
          setAchievements(formattedAchievements)
        }
      } catch (error) {
        logger.error('PublicProfile: ошибка загрузки профиля', error, { userId })
        setError('Ошибка загрузки профиля')
      } finally {
        setLoading(false)
      }
    }

    if (userId) {
      fetchProfile()
    }
  }, [userId, supabase])

  if (loading) {
    return (
      <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 md:max-w-2xl md:mx-auto font-sans">
        <LoadingSpinner />
      </main>
    )
  }

  if (error || !profile) {
    return (
      <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 md:max-w-2xl md:mx-auto font-sans">
        <div className="bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-800">
          <h1 className="text-xl font-bold text-zinc-100 mb-4">Профиль недоступен</h1>
          <p className="text-zinc-400 mb-4">{error || 'Профиль не найден'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-white text-zinc-950 rounded-lg hover:bg-zinc-200 transition-colors"
          >
            На главную
          </button>
        </div>
      </main>
    )
  }

  const joinDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' })
    : null

  return (
    <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 md:max-w-2xl md:mx-auto font-sans space-y-6">
      {/* Заголовок */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-300"
        >
          ←
        </button>
        <h1 className="text-2xl font-bold text-zinc-100">Публичный профиль</h1>
      </div>

      {/* Профиль */}
      <section className="bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-800">
        <div className="flex items-center gap-4 mb-6">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.full_name || 'Пользователь'}
              className="w-20 h-20 rounded-full object-cover"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center text-2xl font-bold text-zinc-400">
              {(profile.full_name || 'U')[0].toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold text-zinc-100">
              {profile.full_name || 'Пользователь'}
            </h2>
            {joinDate && (
              <p className="text-sm text-zinc-400 flex items-center gap-1 mt-1">
                <Calendar size={14} />
                Участник с {joinDate}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Достижения */}
      <section className="bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-800">
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={20} className="text-amber-400" />
          <h2 className="text-lg font-bold text-zinc-100">Достижения</h2>
          <span className="text-sm text-zinc-400 tabular-nums">({achievements.length})</span>
        </div>

        {achievements.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">
            <Trophy size={48} className="mx-auto mb-2 text-zinc-600" />
            <p className="text-sm">Пока нет достижений</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {achievements.map((achievement) => (
              <div
                key={achievement.id}
                className="p-4 bg-zinc-800 rounded-xl border border-zinc-700 text-center"
              >
                <AchievementBadge achievement={achievement} size="lg" />
                <h3 className="text-sm font-semibold text-zinc-100 mt-2">{achievement.name}</h3>
                {achievement.description && (
                  <p className="text-xs text-zinc-400 mt-1">{achievement.description}</p>
                )}
                {achievement.unlockedAt && (
                  <p className="text-xs text-zinc-500 mt-2">
                    {new Date(achievement.unlockedAt).toLocaleDateString('ru-RU')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
