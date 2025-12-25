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
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
      {title && (
        <h3 className="text-sm font-semibold text-zinc-100 mb-4">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <ChartComponent data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
          <XAxis
            dataKey="date"
            stroke="#71717a"
            fontSize={12}
            tick={{ fill: '#a1a1aa' }}
            tickFormatter={(value) => {
              const date = new Date(value)
              return `${date.getDate()}.${date.getMonth() + 1}`
            }}
          />
          <YAxis stroke="#71717a" fontSize={12} tick={{ fill: '#a1a1aa' }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#18181b',
              border: '1px solid #3f3f46',
              borderRadius: '8px',
              color: '#f4f4f5',
            }}
            labelStyle={{ color: '#f4f4f5' }}
            labelFormatter={(value) => {
              const date = new Date(value)
              return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
            }}
          />
          <Legend wrapperStyle={{ color: '#a1a1aa' }} />
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

