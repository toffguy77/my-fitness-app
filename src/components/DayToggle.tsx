'use client'

type DayType = 'training' | 'rest'

interface DayToggleProps {
  value: DayType
  onChange: (value: DayType) => void
}

export default function DayToggle({ value, onChange }: DayToggleProps) {
  return (
    <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
      <button
        type="button"
        onClick={() => onChange('training')}
        className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all ${
          value === 'training'
            ? 'bg-white text-black shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        Тренировка
      </button>
      <button
        type="button"
        onClick={() => onChange('rest')}
        className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all ${
          value === 'rest'
            ? 'bg-white text-black shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        Отдых
      </button>
    </div>
  )
}

