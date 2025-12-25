'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trophy, Filter, TrendingUp, Share2 } from 'lucide-react'
import AchievementBadge from './AchievementBadge'
import type { AchievementWithProgress, AchievementCategory } from '@/types/achievements'
import { logger } from '@/utils/logger'
import Link from 'next/link'

const categoryLabels: Record<AchievementCategory, string> = {
  nutrition: 'Питание',
  weight: 'Вес',
  activity: 'Активность',
  accuracy: 'Точность',
}

export default function AchievementsPage() {
  const router = useRouter()
  const [achievements, setAchievements] = useState<AchievementWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<AchievementCategory | 'all'>('all')

  useEffect(() => {
    loadAchievements()
  }, [])

  const loadAchievements = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/achievements')
      
      if (!response.ok) {
        throw new Error('Ошибка загрузки достижений')
      }

      const data = await response.json()
      setAchievements(data.achievements || [])
    } catch (error) {
      logger.error('AchievementsPage: ошибка загрузки', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredAchievements = selectedCategory === 'all'
    ? achievements
    : achievements.filter((a) => a.category === selectedCategory)

  const unlockedCount = achievements.filter((a) => a.isUnlocked).length
  const totalCount = achievements.length

  const categories: Array<AchievementCategory | 'all'> = ['all', 'nutrition', 'weight', 'activity', 'accuracy']

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-zinc-400">Загрузка достижений...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Статистика */}
      <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
        <div className="flex items-center gap-3 mb-4">
          <Trophy className="text-amber-400" size={32} />
          <div>
            <h2 className="text-2xl font-bold text-zinc-100">Достижения</h2>
            <p className="text-sm text-zinc-400">Отслеживайте свой прогресс</p>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-zinc-100 tabular-nums">{unlockedCount}</p>
            <p className="text-xs text-zinc-400">Получено</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-zinc-100 tabular-nums">{totalCount - unlockedCount}</p>
            <p className="text-xs text-zinc-400">Осталось</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-zinc-100 tabular-nums">{totalCount}</p>
            <p className="text-xs text-zinc-400">Всего</p>
          </div>
        </div>
        
        {totalCount > 0 && (
          <div className="mt-4">
            <div className="bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-amber-400 h-full transition-all duration-300"
                style={{ width: `${(unlockedCount / totalCount) * 100}%` }}
              />
            </div>
            <p className="text-xs text-zinc-400 mt-1 text-center tabular-nums">
              {Math.round((unlockedCount / totalCount) * 100)}% выполнено
            </p>
          </div>
        )}

        {/* Ссылки на лидерборд и публичный профиль */}
        <div className="mt-4 flex gap-2">
          <Link
            href="/leaderboard"
            className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
          >
            <TrendingUp size={16} />
            Лидерборд
          </Link>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <Filter size={18} className="text-zinc-500 flex-shrink-0" />
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setSelectedCategory(category)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
              ${selectedCategory === category
                ? 'bg-white text-zinc-950'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }
            `}
          >
            {category === 'all' ? 'Все' : categoryLabels[category]}
          </button>
        ))}
      </div>

      {/* Сетка достижений */}
      {filteredAchievements.length === 0 ? (
        <div className="text-center py-12">
          <Trophy className="mx-auto text-zinc-600 mb-4" size={48} />
          <p className="text-zinc-400">Достижения не найдены</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filteredAchievements.map((achievement) => (
            <div
              key={achievement.id}
              className={`
                p-4 rounded-lg border-2 transition-all
                ${achievement.isUnlocked
                  ? 'bg-zinc-800 border-amber-400/20'
                  : 'bg-zinc-900 border-zinc-800'
                }
              `}
            >
              <AchievementBadge achievement={achievement} size="md" showProgress={true} />
              {achievement.description && (
                <p className="text-xs text-zinc-400 mt-2 text-center line-clamp-2">
                  {achievement.description}
                </p>
              )}
              {achievement.isUnlocked && achievement.unlockedAt && (
                <p className="text-xs text-zinc-500 mt-2 text-center">
                  Получено {new Date(achievement.unlockedAt).toLocaleDateString('ru-RU')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

