'use client'

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface MetricsChartProps {
  data: Array<{ date: string; value: number; label?: string }>
  type?: 'line' | 'bar'
  title?: string
  color?: string
}

export default function MetricsChart({
  data,
  type = 'line',
  title,
  color = '#2563eb',
}: MetricsChartProps) {
  const ChartComponent = type === 'line' ? LineChart : BarChart
  const DataComponent = type === 'line' ? Line : Bar

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {title && (
        <h3 className="text-sm font-semibold text-gray-800 mb-4">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <ChartComponent data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            fontSize={12}
            tickFormatter={(value) => {
              const date = new Date(value)
              return `${date.getDate()}.${date.getMonth() + 1}`
            }}
          />
          <YAxis stroke="#6b7280" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
            labelFormatter={(value) => {
              const date = new Date(value)
              return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
            }}
          />
          <Legend />
          <DataComponent
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={color}
            strokeWidth={2}
            dot={type === 'line' ? { r: 4 } : false}
          />
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  )
}

