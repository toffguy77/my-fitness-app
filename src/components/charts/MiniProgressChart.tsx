'use client'

import { useMemo } from 'react'

interface MiniProgressChartProps {
  data: number[] // Значения за неделю (7 дней)
  target: number
  label: string
  unit?: string
  className?: string
}

export default function MiniProgressChart({
  data,
  target,
  label,
  unit = '',
  className = '',
}: MiniProgressChartProps) {
  const maxValue = useMemo(() => {
    const maxData = Math.max(...data, 0)
    return Math.max(maxData, target) * 1.1 // Добавляем 10% отступа сверху
  }, [data, target])

  const percentages = useMemo(() => {
    return data.map(value => maxValue > 0 ? (value / maxValue) * 100 : 0)
  }, [data, maxValue])

  const average = useMemo(() => {
    const sum = data.reduce((acc, val) => acc + val, 0)
    return data.length > 0 ? sum / data.length : 0
  }, [data])

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="text-gray-500">
          Среднее: {average.toFixed(0)} {unit}
        </span>
      </div>
      
      {/* График */}
      <div className="relative h-16 bg-gray-50 rounded-lg p-2 flex items-end gap-1">
        {/* Линия цели */}
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-gray-300"
          style={{
            bottom: `${(target / maxValue) * 100}%`,
          }}
        />
        
        {/* Столбцы */}
        {percentages.map((percentage, index) => {
          const value = data[index] || 0
          const isToday = index === data.length - 1
          const color = value >= target * 0.8
            ? 'bg-green-500'
            : value >= target * 0.5
            ? 'bg-yellow-500'
            : 'bg-red-500'
          
          return (
            <div
              key={index}
              className="flex-1 flex flex-col items-center justify-end"
            >
              <div
                className={`w-full rounded-t transition-all ${color} ${
                  isToday ? 'ring-2 ring-black ring-offset-1' : ''
                }`}
                style={{ height: `${percentage}%` }}
                title={`${value.toFixed(0)} ${unit}`}
              />
              <span className="text-[10px] text-gray-500 mt-1">
                {index + 1}
              </span>
            </div>
          )
        })}
      </div>
      
      {/* Легенда */}
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span>Цель: {target.toFixed(0)} {unit}</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded" />
            <span>≥80%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-yellow-500 rounded" />
            <span>50-80%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-red-500 rounded" />
            <span>&lt;50%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

