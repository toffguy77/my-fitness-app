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
      <div className="bg-zinc-900 rounded-lg shadow-lg border-2 border-amber-400/30 p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <AchievementBadge achievement={achievement} size="md" showProgress={false} />
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="text-amber-400" size={16} />
              <h3 className="font-semibold text-zinc-100">Достижение получено!</h3>
            </div>
            <p className="text-sm font-medium text-zinc-100 mb-1">{achievement.name}</p>
            {achievement.description && (
              <p className="text-xs text-zinc-400 mb-3">{achievement.description}</p>
            )}

            <div className="flex gap-2">
              {onShare && (
                <button
                  type="button"
                  onClick={() => onShare(achievement)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 text-amber-400 rounded text-xs font-medium hover:bg-zinc-700 transition-colors"
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
                className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded text-xs font-medium hover:bg-zinc-700 transition-colors"
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
            className="flex-shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
