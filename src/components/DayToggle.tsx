'use client'

type DayType = 'training' | 'rest'

interface DayToggleProps {
  value: DayType
  onChange: (value: DayType) => void
  disabled?: boolean
}

export default function DayToggle({ value, onChange, disabled = false }: DayToggleProps) {
  return (
    <div className="flex gap-2 bg-zinc-900 rounded-xl p-1">
      <button
        type="button"
        onClick={() => !disabled && onChange('training')}
        disabled={disabled}
        className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all ${
          value === 'training'
            ? 'bg-white text-zinc-950'
            : 'text-zinc-400 hover:text-zinc-100'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={disabled ? 'Тип дня уже сохранен и не может быть изменен' : ''}
      >
        Тренировка
      </button>
      <button
        type="button"
        onClick={() => !disabled && onChange('rest')}
        disabled={disabled}
        className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all ${
          value === 'rest'
            ? 'bg-white text-zinc-950'
            : 'text-zinc-400 hover:text-zinc-100'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={disabled ? 'Тип дня уже сохранен и не может быть изменен' : ''}
      >
        Отдых
      </button>
    </div>
  )
}

