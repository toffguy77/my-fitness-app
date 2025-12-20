'use client'

import { useEffect, useState } from 'react'
import { X, Trophy, Share2 } from 'lucide-react'
import AchievementBadge from './AchievementBadge'
import type { AchievementWithProgress } from '@/types/achievements'
import toast from 'react-hot-toast'

interface AchievementNotificationProps {
  achievement: AchievementWithProgress
  onClose?: () => void
  onShare?: (achievement: AchievementWithProgress) => void
}

export default function AchievementNotification({
  achievement,
  onClose,
  onShare,
}: AchievementNotificationProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    // Автоматически скрываем через 5 секунд
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(() => {
        onClose?.()
      }, 300) // Ждем завершения анимации
    }, 5000)

    return () => clearTimeout(timer)
  }, [onClose])

  if (!isVisible) return null

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in-right">
      <div className="bg-white rounded-lg shadow-lg border-2 border-yellow-400 p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <AchievementBadge achievement={achievement} size="md" showProgress={false} />
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="text-yellow-500" size={16} />
              <h3 className="font-semibold text-gray-900">Достижение получено!</h3>
            </div>
            <p className="text-sm font-medium text-gray-800 mb-1">{achievement.name}</p>
            {achievement.description && (
              <p className="text-xs text-gray-600 mb-3">{achievement.description}</p>
            )}
            
            <div className="flex gap-2">
              {onShare && (
                <button
                  type="button"
                  onClick={() => onShare(achievement)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium hover:bg-yellow-200 transition-colors"
                >
                  <Share2 size={14} />
                  Поделиться
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsVisible(false)
                  setTimeout(() => onClose?.(), 300)
                }}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200 transition-colors"
              >
                Закрыть
              </button>
            </div>
          </div>
          
          <button
            type="button"
            onClick={() => {
              setIsVisible(false)
              setTimeout(() => onClose?.(), 300)
            }}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

