'use client'

import { useMemo } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

type MacrosDataPoint = {
  date: string
  calories: number
  protein: number
  fats: number
  carbs: number
  targetCalories?: number
  targetProtein?: number
  targetFats?: number
  targetCarbs?: number
}

type MacrosChartProps = {
  data: MacrosDataPoint[]
  period: '7days' | '30days' | '3months' | 'all'
  showTargets?: boolean
  chartType?: 'line' | 'bar'
}

export default function MacrosChart({ data, period, showTargets = true, chartType = 'line' }: MacrosChartProps) {
  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return []

    const now = new Date()
    const cutoffDate = new Date()

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  }

  if (filteredData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-zinc-900 rounded-xl">
        <p className="text-zinc-500 text-sm">Нет данных за выбранный период</p>
      </div>
    )
  }

  const renderChart = () => {
    if (chartType === 'bar') {
      return (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={filteredData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="#a1a1aa"
              style={{ fontSize: '12px' }}
            />
            <YAxis stroke="#a1a1aa" style={{ fontSize: '12px' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '8px',
                padding: '8px 12px',
                color: '#f4f4f5',
              }}
              labelFormatter={(value: string | number) => `Дата: ${formatDate(String(value))}`}
            />
            <Legend wrapperStyle={{ color: '#a1a1aa' }} />
            <Bar dataKey="protein" fill="#93c5fd" name="Белки (г)" />
            <Bar dataKey="fats" fill="#fcd34d" name="Жиры (г)" />
            <Bar dataKey="carbs" fill="#fda4af" name="Углеводы (г)" />
          </BarChart>
        </ResponsiveContainer>
      )
    }

    return (
      <div className="space-y-6">
        {/* График калорий */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-100 mb-2">Калории</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke="#a1a1aa"
                style={{ fontSize: '12px' }}
              />
              <YAxis stroke="#a1a1aa" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: '#f4f4f5',
                }}
                labelFormatter={(value: string | number) => `Дата: ${formatDate(String(value))}`}
              />
              <Legend wrapperStyle={{ color: '#a1a1aa' }} />
              <Line
                type="monotone"
                dataKey="calories"
                stroke="#f87171"
                strokeWidth={2}
                dot={{ fill: '#f87171', r: 3 }}
                name="Факт (ккал)"
              />
              {showTargets && filteredData.some(d => d.targetCalories) && (
                <Line
                  type="monotone"
                  dataKey="targetCalories"
                  stroke="#34d399"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="Цель (ккал)"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* График макронутриентов */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-100 mb-2">Макронутриенты</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke="#a1a1aa"
                style={{ fontSize: '12px' }}
              />
              <YAxis stroke="#a1a1aa" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: '#f4f4f5',
                }}
                labelFormatter={(value: string | number) => `Дата: ${formatDate(String(value))}`}
              />
              <Legend wrapperStyle={{ color: '#a1a1aa' }} />
              <Line
                type="monotone"
                dataKey="protein"
                stroke="#93c5fd"
                strokeWidth={2}
                dot={{ fill: '#93c5fd', r: 3 }}
                name="Белки (г)"
              />
              <Line
                type="monotone"
                dataKey="fats"
                stroke="#fcd34d"
                strokeWidth={2}
                dot={{ fill: '#fcd34d', r: 3 }}
                name="Жиры (г)"
              />
              <Line
                type="monotone"
                dataKey="carbs"
                stroke="#fda4af"
                strokeWidth={2}
                dot={{ fill: '#fda4af', r: 3 }}
                name="Углеводы (г)"
              />
              {showTargets && (
                <>
                  {filteredData.some(d => d.targetProtein) && (
                    <Line
                      type="monotone"
                      dataKey="targetProtein"
                      stroke="#93c5fd"
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      strokeOpacity={0.5}
                      dot={false}
                      name="Цель белков"
                    />
                  )}
                  {filteredData.some(d => d.targetFats) && (
                    <Line
                      type="monotone"
                      dataKey="targetFats"
                      stroke="#fcd34d"
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      strokeOpacity={0.5}
                      dot={false}
                      name="Цель жиров"
                    />
                  )}
                  {filteredData.some(d => d.targetCarbs) && (
                    <Line
                      type="monotone"
                      dataKey="targetCarbs"
                      stroke="#fda4af"
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      strokeOpacity={0.5}
                      dot={false}
                      name="Цель углеводов"
                    />
                  )}
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {renderChart()}
    </div>
  )
}
