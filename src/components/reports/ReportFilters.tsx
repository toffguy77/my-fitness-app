'use client'

import { useState } from 'react'
import { Filter, X } from 'lucide-react'

type ReportFiltersProps = {
  onDateRangeChange?: (start: string | null, end: string | null) => void
  onDayTypeChange?: (dayType: 'training' | 'rest' | 'all') => void
  onSortChange?: (sortBy: 'date' | 'calories' | 'weight', order: 'asc' | 'desc') => void
}

export default function ReportFilters({
  onDateRangeChange,
  onDayTypeChange,
  onSortChange,
}: ReportFiltersProps) {
  const [showFilters, setShowFilters] = useState(false)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [dayType, setDayType] = useState<'training' | 'rest' | 'all'>('all')
  const [sortBy, setSortBy] = useState<'date' | 'calories' | 'weight'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const handleReset = () => {
    setStartDate('')
    setEndDate('')
    setDayType('all')
    setSortBy('date')
    setSortOrder('desc')
    onDateRangeChange?.(null, null)
    onDayTypeChange?.('all')
    onSortChange?.('date', 'desc')
  }

  const handleDateRangeChange = () => {
    onDateRangeChange?.(startDate || null, endDate || null)
  }

  const handleDayTypeChange = (type: 'training' | 'rest' | 'all') => {
    setDayType(type)
    onDayTypeChange?.(type)
  }

  const handleSortChange = (by: 'date' | 'calories' | 'weight', order: 'asc' | 'desc') => {
    setSortBy(by)
    setSortOrder(order)
    onSortChange?.(by, order)
  }

  const hasActiveFilters = startDate || endDate || dayType !== 'all' || sortBy !== 'date' || sortOrder !== 'desc'

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowFilters(!showFilters)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          hasActiveFilters
            ? 'bg-white text-zinc-950'
            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
        }`}
      >
        <Filter size={16} />
        Фильтры
        {hasActiveFilters && (
          <span className="ml-1 px-1.5 py-0.5 bg-zinc-950 text-white rounded text-xs tabular-nums">
            {[startDate && 'дата', endDate && 'дата', dayType !== 'all' && 'тип', sortBy !== 'date' && 'сорт'].filter(Boolean).length}
          </span>
        )}
      </button>

      {showFilters && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-4">
          {/* Диапазон дат */}
          <div>
            <label className="block text-sm font-medium text-zinc-100 mb-2">Диапазон дат</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">От</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value)
                    if (e.target.value && endDate) {
                      onDateRangeChange?.(e.target.value, endDate)
                    }
                  }}
                  className="w-full p-2 border border-zinc-800 rounded-lg text-sm text-zinc-100 bg-zinc-900"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">До</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value)
                    if (startDate && e.target.value) {
                      onDateRangeChange?.(startDate, e.target.value)
                    }
                  }}
                  className="w-full p-2 border border-zinc-800 rounded-lg text-sm text-zinc-100 bg-zinc-900"
                />
              </div>
            </div>
          </div>

          {/* Тип дня */}
          <div>
            <label className="block text-sm font-medium text-zinc-100 mb-2">Тип дня</label>
            <div className="flex gap-2">
              {(['all', 'training', 'rest'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => handleDayTypeChange(type)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    dayType === type
                      ? 'bg-white text-zinc-950'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {type === 'all' ? 'Все' : type === 'training' ? 'Тренировка' : 'Отдых'}
                </button>
              ))}
            </div>
          </div>

          {/* Сортировка */}
          <div>
            <label className="block text-sm font-medium text-zinc-100 mb-2">Сортировка</label>
            <div className="flex gap-2 flex-wrap">
              {(['date', 'calories', 'weight'] as const).map((by) => (
                <button
                  key={by}
                  onClick={() => handleSortChange(by, sortBy === by && sortOrder === 'desc' ? 'asc' : 'desc')}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    sortBy === by
                      ? 'bg-white text-zinc-950'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {by === 'date' ? 'Дата' : by === 'calories' ? 'Калории' : 'Вес'}
                  {sortBy === by && (
                    <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Сброс фильтров */}
          {hasActiveFilters && (
            <button
              onClick={handleReset}
              className="w-full px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
            >
              <X size={16} />
              Сбросить фильтры
            </button>
          )}
        </div>
      )}
    </div>
  )
}

