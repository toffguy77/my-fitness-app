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
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-xl border border-gray-200">
        <p className="text-gray-500 text-sm">Нет данных за выбранный период</p>
      </div>
    )
  }

  const renderChart = () => {
    if (chartType === 'bar') {
      return (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={filteredData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '8px 12px',
              }}
              labelFormatter={(value: string | number) => `Дата: ${formatDate(String(value))}`}
            />
            <Legend />
            <Bar dataKey="protein" fill="#3b82f6" name="Белки (г)" />
            <Bar dataKey="fats" fill="#f59e0b" name="Жиры (г)" />
            <Bar dataKey="carbs" fill="#10b981" name="Углеводы (г)" />
          </BarChart>
        </ResponsiveContainer>
      )
    }

    return (
      <div className="space-y-6">
        {/* График калорий */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Калории</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '8px 12px',
                }}
                labelFormatter={(value: string | number) => `Дата: ${formatDate(String(value))}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="calories"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ fill: '#ef4444', r: 3 }}
                name="Факт (ккал)"
              />
              {showTargets && filteredData.some(d => d.targetCalories) && (
                <Line
                  type="monotone"
                  dataKey="targetCalories"
                  stroke="#10b981"
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
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Макронутриенты</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '8px 12px',
                }}
                labelFormatter={(value: string | number) => `Дата: ${formatDate(String(value))}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="protein"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 3 }}
                name="Белки (г)"
              />
              <Line
                type="monotone"
                dataKey="fats"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ fill: '#f59e0b', r: 3 }}
                name="Жиры (г)"
              />
              <Line
                type="monotone"
                dataKey="carbs"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981', r: 3 }}
                name="Углеводы (г)"
              />
              {showTargets && (
                <>
                  {filteredData.some(d => d.targetProtein) && (
                    <Line
                      type="monotone"
                      dataKey="targetProtein"
                      stroke="#3b82f6"
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Цель белков"
                    />
                  )}
                  {filteredData.some(d => d.targetFats) && (
                    <Line
                      type="monotone"
                      dataKey="targetFats"
                      stroke="#f59e0b"
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Цель жиров"
                    />
                  )}
                  {filteredData.some(d => d.targetCarbs) && (
                    <Line
                      type="monotone"
                      dataKey="targetCarbs"
                      stroke="#10b981"
                      strokeWidth={1}
                      strokeDasharray="5 5"
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

