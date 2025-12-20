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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка достижений...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Статистика */}
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-6 border border-yellow-200">
        <div className="flex items-center gap-3 mb-4">
          <Trophy className="text-yellow-600" size={32} />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Достижения</h2>
            <p className="text-sm text-gray-600">Отслеживайте свой прогресс</p>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">{unlockedCount}</p>
            <p className="text-xs text-gray-600">Получено</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">{totalCount - unlockedCount}</p>
            <p className="text-xs text-gray-600">Осталось</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">{totalCount}</p>
            <p className="text-xs text-gray-600">Всего</p>
          </div>
        </div>
        
        {totalCount > 0 && (
          <div className="mt-4">
            <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-yellow-400 h-full transition-all duration-300"
                style={{ width: `${(unlockedCount / totalCount) * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 mt-1 text-center">
              {Math.round((unlockedCount / totalCount) * 100)}% выполнено
            </p>
          </div>
        )}

        {/* Ссылки на лидерборд и публичный профиль */}
        <div className="mt-4 flex gap-2">
          <Link
            href="/leaderboard"
            className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
          >
            <TrendingUp size={16} />
            Лидерборд
          </Link>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <Filter size={18} className="text-gray-500 flex-shrink-0" />
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setSelectedCategory(category)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
              ${selectedCategory === category
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
          <Trophy className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-600">Достижения не найдены</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filteredAchievements.map((achievement) => (
            <div
              key={achievement.id}
              className={`
                p-4 rounded-lg border-2 transition-all
                ${achievement.isUnlocked
                  ? 'bg-yellow-50 border-yellow-300'
                  : 'bg-white border-gray-200'
                }
              `}
            >
              <AchievementBadge achievement={achievement} size="md" showProgress={true} />
              {achievement.description && (
                <p className="text-xs text-gray-600 mt-2 text-center line-clamp-2">
                  {achievement.description}
                </p>
              )}
              {achievement.isUnlocked && achievement.unlockedAt && (
                <p className="text-xs text-gray-500 mt-2 text-center">
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

