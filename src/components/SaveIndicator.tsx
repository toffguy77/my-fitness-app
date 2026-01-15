'use client'

import { CheckCircle, Save } from 'lucide-react'
import { useState, useEffect } from 'react'

interface SaveIndicatorProps {
  status: 'idle' | 'saving' | 'saved'
  lastSaved?: Date | null
  className?: string
}

export default function SaveIndicator({
  status,
  lastSaved,
  className = '',
}: SaveIndicatorProps) {
  const [showTimestamp, setShowTimestamp] = useState(false)

  const formatTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)

    if (seconds < 10) return 'только что'
    if (seconds < 60) return `${seconds} сек назад`
    if (minutes < 60) return `${minutes} мин назад`
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div
      className={`flex items-center gap-2 text-sm ${className}`}
      onMouseEnter={() => setShowTimestamp(true)}
      onMouseLeave={() => setShowTimestamp(false)}
    >
      {status === 'saving' && (
        <>
          <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-400">Сохранение...</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <CheckCircle size={16} className="text-emerald-400 animate-pulse-once" />
          <span className="text-emerald-400">Сохранено</span>
          {lastSaved && showTimestamp && (
            <span className="text-zinc-500 text-xs ml-1">
              {formatTime(lastSaved)}
            </span>
          )}
        </>
      )}
      {status === 'idle' && lastSaved && (
        <>
          <Save size={16} className="text-zinc-500" />
          <span className="text-zinc-500">Сохранено {formatTime(lastSaved)}</span>
        </>
      )}
    </div>
  )
}
