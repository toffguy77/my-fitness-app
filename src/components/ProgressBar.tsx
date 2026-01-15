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

  // Determine color based on label for macros, or percentage for general progress
  const color = useMemo(() => {
    const labelLower = label.toLowerCase()
    // Pastel colors for macros
    if (labelLower.includes('белк') || labelLower.includes('белок') || labelLower.includes('protein')) {
      return 'bg-blue-300' // Pastel blue for protein
    }
    if (labelLower.includes('жир') || labelLower.includes('fats') || labelLower.includes('fat')) {
      return 'bg-amber-300' // Pastel amber for fats
    }
    if (labelLower.includes('углев') || labelLower.includes('carbs') || labelLower.includes('carb')) {
      return 'bg-rose-300' // Pastel rose for carbs
    }
    // Pastel status colors for general progress
    if (percentage >= 80) return 'bg-emerald-400'
    if (percentage >= 50) return 'bg-amber-400'
    return 'bg-red-400'
  }, [percentage, label])

  const textColor = useMemo(() => {
    const labelLower = label.toLowerCase()
    // Pastel text colors for macros
    if (labelLower.includes('белк') || labelLower.includes('белок') || labelLower.includes('protein')) {
      return 'text-blue-300'
    }
    if (labelLower.includes('жир') || labelLower.includes('fats') || labelLower.includes('fat')) {
      return 'text-amber-300'
    }
    if (labelLower.includes('углев') || labelLower.includes('carbs') || labelLower.includes('carb')) {
      return 'text-rose-300'
    }
    // Pastel status colors
    if (percentage >= 80) return 'text-emerald-400'
    if (percentage >= 50) return 'text-amber-400'
    return 'text-red-400'
  }, [percentage, label])

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
        <span className="font-medium text-zinc-100">{label}</span>
        <div className="flex items-center gap-2">
          {comparisonText && (
            <span className="text-xs text-zinc-400">{comparisonText}</span>
          )}
          <span className={`font-semibold tabular-nums ${textColor}`}>
            {(current ?? 0).toFixed(0)} / {(target ?? 0).toFixed(0)} {unit}
            {showPercentage && ` (${percentage.toFixed(0)}%)`}
          </span>
        </div>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
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
        <p className="text-xs text-emerald-400 font-medium">{motivationalMessage}</p>
      )}
    </div>
  )
}
