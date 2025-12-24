'use client'

import { useMemo } from 'react'

type ProgressBarProps = {
  label: string
  current: number
  target: number
  unit?: string
  showPercentage?: boolean
  className?: string
  comparison?: {
    yesterday?: number
    weekAverage?: number
  }
  motivationalMessage?: string
}

export default function ProgressBar({
  label,
  current,
  target,
  unit = '',
  showPercentage = true,
  className = '',
  comparison,
  motivationalMessage,
}: ProgressBarProps) {
  const percentage = useMemo(() => {
    if (target === 0) return 0
    return Math.min(Math.max((current / target) * 100, 0), 100)
  }, [current, target])

  const color = useMemo(() => {
    if (percentage >= 80) return 'bg-green-500'
    if (percentage >= 50) return 'bg-yellow-500'
    return 'bg-red-500'
  }, [percentage])

  const textColor = useMemo(() => {
    if (percentage >= 80) return 'text-green-600'
    if (percentage >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }, [percentage])

  const comparisonText = useMemo(() => {
    if (!comparison) return null
    if (comparison.yesterday !== undefined) {
      const diff = current - comparison.yesterday
      if (diff > 0) {
        return `+${diff.toFixed(0)} ${unit} vs вчера`
      } else if (diff < 0) {
        return `${diff.toFixed(0)} ${unit} vs вчера`
      } else {
        return `= vs вчера`
      }
    }
    if (comparison.weekAverage !== undefined) {
      const diff = current - comparison.weekAverage
      if (diff > 0) {
        return `+${diff.toFixed(0)} ${unit} vs среднее`
      } else if (diff < 0) {
        return `${diff.toFixed(0)} ${unit} vs среднее`
      } else {
        return `= vs среднее`
      }
    }
    return null
  }, [comparison, current, unit])

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex justify-between items-center text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <div className="flex items-center gap-2">
          {comparisonText && (
            <span className="text-xs text-gray-500">{comparisonText}</span>
          )}
          <span className={`font-semibold ${textColor}`}>
            {(current ?? 0).toFixed(0)} / {(target ?? 0).toFixed(0)} {unit}
            {showPercentage && ` (${percentage.toFixed(0)}%)`}
          </span>
        </div>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500 ease-out rounded-full`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label}: ${percentage.toFixed(0)}%`}
        />
      </div>
      {motivationalMessage && percentage >= 80 && (
        <p className="text-xs text-green-600 font-medium">{motivationalMessage}</p>
      )}
    </div>
  )
}

