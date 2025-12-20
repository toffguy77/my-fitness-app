'use client'

import AchievementNotification from './AchievementNotification'
import type { AchievementWithProgress } from '@/types/achievements'

interface AchievementsNotificationsProps {
  achievements: AchievementWithProgress[]
  onClose: (id: string) => void
}

/**
 * Компонент для отображения уведомлений о достижениях
 */
export default function AchievementsNotifications({ achievements, onClose }: AchievementsNotificationsProps) {
  if (achievements.length === 0) return null

  return (
    <>
      {achievements.map((achievement) => (
        <AchievementNotification
          key={achievement.id}
          achievement={achievement}
          onClose={() => onClose(achievement.id)}
          onShare={(achievement) => {
            // Поделиться достижением в социальных сетях
            const text = `Я получил достижение "${achievement.name}" в My Fitness App! 🏆`
            const url = window.location.origin
            
            if (navigator.share) {
              navigator.share({
                title: `Достижение: ${achievement.name}`,
                text,
                url,
              }).catch(() => {
                // Игнорируем ошибки
              })
            } else {
              // Fallback: копируем в буфер обмена
              navigator.clipboard.writeText(`${text} ${url}`).then(() => {
                // Можно показать toast
              })
            }
          }}
        />
      ))}
    </>
  )
}

