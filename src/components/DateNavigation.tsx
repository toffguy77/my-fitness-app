'use client'

import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import DateInput from './DateInput'

interface DateNavigationProps {
  selectedDate: string
  onDateChange: (date: string) => void
  maxDate?: string
  minDate?: string
  showTodayButton?: boolean
}

export default function DateNavigation({
  selectedDate,
  onDateChange,
  maxDate,
  minDate,
  showTodayButton = true,
}: DateNavigationProps) {
  const today = new Date().toISOString().split('T')[0]
  const isToday = selectedDate === today

  const handlePrevious = () => {
    const date = new Date(selectedDate)
    date.setDate(date.getDate() - 1)
    const prevDate = date.toISOString().split('T')[0]
    if (!minDate || prevDate >= minDate) {
      onDateChange(prevDate)
    }
  }

  const handleNext = () => {
    const date = new Date(selectedDate)
    date.setDate(date.getDate() + 1)
    const nextDate = date.toISOString().split('T')[0]
    if ((!maxDate || nextDate <= maxDate) && nextDate <= today) {
      onDateChange(nextDate)
    }
  }

  const handleToday = () => {
    onDateChange(today)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    if (dateStr === today) {
      return `Сегодня, ${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`
    }
    return date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
  }

  const canGoPrevious = !minDate || new Date(selectedDate) > new Date(minDate)
  const canGoNext = selectedDate < today && (!maxDate || new Date(selectedDate) < new Date(maxDate))

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handlePrevious}
        disabled={!canGoPrevious}
        className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Предыдущий день"
        aria-label="Предыдущий день"
      >
        <ChevronLeft size={18} className="text-zinc-400" />
      </button>

      <div className="flex-1">
        <DateInput
          value={selectedDate}
          onChange={onDateChange}
          maxDate={maxDate || today}
          minDate={minDate}
          className="w-full"
        />
      </div>

      {showTodayButton && !isToday && (
        <button
          onClick={handleToday}
          className="px-3 py-2 text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors whitespace-nowrap"
          title="Перейти к сегодня"
        >
          Сегодня
        </button>
      )}

      <button
        onClick={handleNext}
        disabled={!canGoNext}
        className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Следующий день"
        aria-label="Следующий день"
      >
        <ChevronRight size={18} className="text-zinc-400" />
      </button>
    </div>
  )
}
