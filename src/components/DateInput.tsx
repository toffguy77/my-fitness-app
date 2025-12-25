'use client'
 

import { useState, useEffect, useRef } from 'react'
import { Calendar } from 'lucide-react'

interface DateInputProps {
  value: string // Формат: YYYY-MM-DD
  onChange: (value: string) => void
  maxDate?: string // Формат: YYYY-MM-DD
  minDate?: string // Формат: YYYY-MM-DD
  className?: string
  id?: string
  label?: string
}

/**
 * Компонент для удобного ввода даты
 * Поддерживает:
 * - Ввод через три поля (день, месяц, год)
 * - Ввод через маску ДД.ММ.ГГГГ
 * - Нативный date picker (опционально)
 */
export default function DateInput({
  value,
  onChange,
  maxDate,
  minDate,
  className = '',
  id,
  label,
}: DateInputProps) {
  const [day, setDay] = useState<string>('')
  const [month, setMonth] = useState<string>('')
  const [year, setYear] = useState<string>('')
  const [showNativePicker, setShowNativePicker] = useState(false)
  const nativeInputRef = useRef<HTMLInputElement>(null)

  // Парсим значение из формата YYYY-MM-DD
  useEffect(() => {
    if (value) {
      const date = new Date(value)
      if (!isNaN(date.getTime())) {
        setDay(String(date.getDate()).padStart(2, '0'))
        setMonth(String(date.getMonth() + 1).padStart(2, '0'))
        setYear(String(date.getFullYear()))
      }
    } else {
      setDay('')
      setMonth('')
      setYear('')
    }
  }, [value])

  // Обновляем значение при изменении дня, месяца или года
  const updateDate = (newDay: string, newMonth: string, newYear: string) => {
    if (newDay && newMonth && newYear) {
      const dayNum = parseInt(newDay, 10)
      const monthNum = parseInt(newMonth, 10)
      const yearNum = parseInt(newYear, 10)

      // Валидация
      if (dayNum < 1 || dayNum > 31) return
      if (monthNum < 1 || monthNum > 12) return
      if (yearNum < 1900 || yearNum > new Date().getFullYear()) return

      // Проверяем, что дата валидна (например, 31 февраля не существует)
      const date = new Date(yearNum, monthNum - 1, dayNum)
      if (
        date.getDate() !== dayNum ||
        date.getMonth() !== monthNum - 1 ||
        date.getFullYear() !== yearNum
      ) {
        return
      }

      // Проверяем ограничения
      const dateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
      if (maxDate && dateStr > maxDate) return
      if (minDate && dateStr < minDate) return

      onChange(dateStr)
    }
  }

  const dayRef = useRef<HTMLInputElement>(null)
  const monthRef = useRef<HTMLInputElement>(null)
  const yearRef = useRef<HTMLInputElement>(null)

  const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '') // Только цифры
    if (val.length > 2) val = val.slice(0, 2)
    if (val && parseInt(val, 10) > 31) val = '31'
    setDay(val)
    
    // Автопереход на следующее поле при заполнении
    if (val.length === 2) {
      monthRef.current?.focus()
      updateDate(val, month, year)
    }
  }

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '') // Только цифры
    if (val.length > 2) val = val.slice(0, 2)
    if (val && parseInt(val, 10) > 12) val = '12'
    setMonth(val)
    
    // Автопереход на следующее поле при заполнении
    if (val.length === 2) {
      yearRef.current?.focus()
      updateDate(day, val, year)
    }
  }

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '') // Только цифры
    if (val.length > 4) val = val.slice(0, 4)
    const currentYear = new Date().getFullYear()
    if (val && parseInt(val, 10) > currentYear) val = String(currentYear)
    setYear(val)
    
    if (val.length === 4) {
      updateDate(day, month, val)
    }
  }

  // Обработка клавиш для навигации
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'day' | 'month' | 'year') => {
    if (e.key === 'Backspace' && e.currentTarget.value === '') {
      // При удалении пустого поля переходим на предыдущее
      if (field === 'month') dayRef.current?.focus()
      if (field === 'year') monthRef.current?.focus()
    }
    if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
      // При стрелке влево в начале поля переходим на предыдущее
      if (field === 'month') dayRef.current?.focus()
      if (field === 'year') monthRef.current?.focus()
    }
    if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) {
      // При стрелке вправо в конце поля переходим на следующее
      if (field === 'day') monthRef.current?.focus()
      if (field === 'month') yearRef.current?.focus()
    }
  }

  const handleNativeDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      onChange(e.target.value)
      setShowNativePicker(false)
    }
  }

  const handleBlur = () => {
    // При потере фокуса пытаемся обновить дату, если все поля заполнены
    if (day && month && year) {
      updateDate(day, month, year)
    }
  }

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-zinc-100 mb-2">
          {label}
        </label>
      )}
      
      <div className="flex items-center gap-2">
        {/* Три поля для ввода */}
        <div className="flex items-center gap-2 flex-1">
          <div className="flex-1">
            <input
              ref={dayRef}
              type="text"
              inputMode="numeric"
              placeholder="ДД"
              value={day}
              onChange={handleDayChange}
              onKeyDown={(e) => handleKeyDown(e, 'day')}
              onBlur={handleBlur}
              maxLength={2}
              className="w-full p-3 bg-zinc-900 rounded-xl border border-zinc-800 text-zinc-100 text-center focus:ring-2 focus:ring-zinc-700 outline-none placeholder:text-zinc-600 tabular-nums"
            />
          </div>
          <span className="text-zinc-500 font-medium">.</span>
          <div className="flex-1">
            <input
              ref={monthRef}
              type="text"
              inputMode="numeric"
              placeholder="ММ"
              value={month}
              onChange={handleMonthChange}
              onKeyDown={(e) => handleKeyDown(e, 'month')}
              onBlur={handleBlur}
              maxLength={2}
              className="w-full p-3 bg-zinc-900 rounded-xl border border-zinc-800 text-zinc-100 text-center focus:ring-2 focus:ring-zinc-700 outline-none placeholder:text-zinc-600 tabular-nums"
            />
          </div>
          <span className="text-zinc-500 font-medium">.</span>
          <div className="flex-1">
            <input
              ref={yearRef}
              type="text"
              inputMode="numeric"
              placeholder="ГГГГ"
              value={year}
              onChange={handleYearChange}
              onKeyDown={(e) => handleKeyDown(e, 'year')}
              onBlur={handleBlur}
              maxLength={4}
              className="w-full p-3 bg-zinc-900 rounded-xl border border-zinc-800 text-zinc-100 text-center focus:ring-2 focus:ring-zinc-700 outline-none placeholder:text-zinc-600 tabular-nums"
            />
          </div>
        </div>

        {/* Кнопка для нативного date picker */}
        <button
          type="button"
          onClick={() => {
            setShowNativePicker(true)
            setTimeout(() => {
              nativeInputRef.current?.showPicker?.()
            }, 100)
          }}
          className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl border border-zinc-700 transition-colors flex-shrink-0"
          title="Выбрать дату из календаря"
        >
          <Calendar size={20} className="text-zinc-400" />
        </button>

        {/* Скрытый нативный date picker */}
        <input
          ref={nativeInputRef}
          type="date"
          value={value || ''}
          onChange={handleNativeDateChange}
          max={maxDate}
          min={minDate}
          className="absolute opacity-0 pointer-events-none w-0 h-0"
          id={id ? `${id}-native` : undefined}
        />
      </div>

      {/* Подсказка - показываем только если есть label */}
      {label && (
        <p className="text-xs text-zinc-500 mt-2">
          Введите дату в формате ДД.ММ.ГГГГ или используйте календарь
        </p>
      )}
    </div>
  )
}

