'use client'

import { Trophy, Flame, Utensils, Calendar, Scan, Scale, CheckCircle } from 'lucide-react'
import type { AchievementWithProgress } from '@/types/achievements'

interface AchievementBadgeProps {
  achievement: AchievementWithProgress
  size?: 'sm' | 'md' | 'lg'
  showProgress?: boolean
}

const iconMap: Record<string, typeof Trophy> = {
  flame: Flame,
  utensils: Utensils,
  calendar: Calendar,
  scan: Scan,
  scale: Scale,
  trophy: Trophy,
}

export default function AchievementBadge({
  achievement,
  size = 'md',
  showProgress = true,
}: AchievementBadgeProps) {
  const Icon = iconMap[achievement.icon_name || 'trophy'] || Trophy
  
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
  }
  
  const iconSizes = {
    sm: 20,
    md: 28,
    lg: 40,
  }

  const isUnlocked = achievement.isUnlocked
  const progress = achievement.progress

  return (
    <div className="relative">
      <div
        className={`
          ${sizeClasses[size]}
          rounded-full flex items-center justify-center
          border-2 transition-all
          ${isUnlocked 
            ? 'bg-zinc-800 border-amber-400/30 text-amber-400' 
            : 'bg-zinc-900 border-zinc-700 text-zinc-500'
          }
        `}
        title={achievement.name}
      >
        <Icon size={iconSizes[size]} />
        {isUnlocked && (
          <div className="absolute -top-1 -right-1 bg-emerald-400 rounded-full p-1">
            <CheckCircle size={12} className="text-zinc-950" />
          </div>
        )}
      </div>
      
      {showProgress && !isUnlocked && progress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 bg-zinc-800 rounded-full h-1 overflow-hidden">
          <div
            className="bg-amber-400 h-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      
      {size !== 'sm' && (
        <div className="mt-2 text-center">
          <p className={`text-xs font-medium ${isUnlocked ? 'text-zinc-100' : 'text-zinc-500'}`}>
            {achievement.name}
          </p>
          {showProgress && !isUnlocked && progress > 0 && (
            <p className="text-xs text-zinc-500 tabular-nums">{progress}%</p>
          )}
        </div>
      )}
    </div>
  )
}

