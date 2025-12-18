'use client'

import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

type WeightDataPoint = {
  date: string
  weight: number
}

type WeightChartProps = {
  data: WeightDataPoint[]
  period: '7days' | '30days' | '3months' | 'all'
  onPeriodChange?: (period: '7days' | '30days' | '3months' | 'all') => void
}

export default function WeightChart({ data, period, onPeriodChange }: WeightChartProps) {
  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return []
    
    const now = new Date()
    let cutoffDate = new Date()
    
    switch (period) {
      case '7days':
        cutoffDate.setDate(now.getDate() - 7)
        break
      case '30days':
        cutoffDate.setDate(now.getDate() - 30)
        break
      case '3months':
        cutoffDate.setMonth(now.getMonth() - 3)
        break
      case 'all':
        return data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    }
    
    return data
      .filter(point => new Date(point.date) >= cutoffDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [data, period])

  // Вычисляем трендовую линию (линейная регрессия)
  const trendData = useMemo(() => {
    if (filteredData.length < 2) return []
    
    const n = filteredData.length
    const dates = filteredData.map((_, i) => i)
    const weights = filteredData.map(d => d.weight)
    
    const sumX = dates.reduce((a, b) => a + b, 0)
    const sumY = weights.reduce((a, b) => a + b, 0)
    const sumXY = dates.reduce((sum, x, i) => sum + x * weights[i], 0)
    const sumXX = dates.reduce((sum, x) => sum + x * x, 0)
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    
    return filteredData.map((point, i) => ({
      date: point.date,
      weight: point.weight,
      trend: intercept + slope * i,
    }))
  }, [filteredData])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  }

  if (filteredData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-xl border border-gray-200">
        <p className="text-gray-500 text-sm">Нет данных за выбранный период</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {onPeriodChange && (
        <div className="flex gap-2 flex-wrap">
          {(['7days', '30days', '3months', 'all'] as const).map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {p === '7days' ? '7 дней' : p === '30days' ? '30 дней' : p === '3months' ? '3 месяца' : 'Все время'}
            </button>
          ))}
        </div>
      )}
      
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={trendData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            label={{ value: 'Вес (кг)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '8px 12px',
            }}
            labelFormatter={(value) => `Дата: ${formatDate(value)}`}
            formatter={(value: number) => [`${value.toFixed(1)} кг`, '']}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="weight"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: '#3b82f6', r: 4 }}
            name="Вес"
          />
          <Line
            type="monotone"
            dataKey="trend"
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name="Тренд"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

