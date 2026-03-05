'use client'

import { useMemo } from 'react'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Dot
} from 'recharts'
import type { TargetVsActual } from '../types'

interface KBJUWeeklyChartProps {
    data: TargetVsActual[]
    className?: string
}

export function KBJUWeeklyChart({ data, className }: KBJUWeeklyChartProps) {
    const chartData = useMemo(() =>
        data.map(d => {
            const targetCal = d.target?.calories ?? null
            const actualCal = d.actual?.calories ?? null
            const dateStr = String(d.date).split('T')[0]
            const [year, month, day] = dateStr.split('-').map(Number)
            const dateObj = new Date(year, month - 1, day)
            const label = isNaN(dateObj.getTime())
                ? dateStr
                : dateObj.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })
            const hasWorkout = (d.workout_bonus ?? 0) > 0

            let status: 'green' | 'yellow' | 'red' = 'green'
            if (targetCal && actualCal) {
                const deviation = Math.abs(actualCal - targetCal) / targetCal
                if (deviation > 0.2) status = 'red'
                else if (deviation > 0.1) status = 'yellow'
            }

            return {
                date: d.date,
                label,
                target: targetCal,
                actual: actualCal,
                workoutBonus: d.workout_bonus,
                hasWorkout,
                status,
                source: d.source,
            }
        }),
        [data]
    )

    if (chartData.length === 0) return null

    return (
        <section className={`rounded-xl bg-white p-4 shadow-sm border border-gray-100 ${className ?? ''}`}>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">КБЖУ за неделю</h2>
            </div>
            <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <Tooltip
                        formatter={(value?: number, name?: string) => [
                            `${Math.round(value ?? 0)} ккал`,
                            name === 'target' ? 'Цель' : 'Факт'
                        ]}
                        labelFormatter={(label: unknown) => String(label)}
                    />
                    <Line
                        type="monotone"
                        dataKey="target"
                        stroke="#6366f1"
                        strokeDasharray="6 3"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#6366f1' }}
                        connectNulls
                        name="target"
                    />
                    <Line
                        type="monotone"
                        dataKey="actual"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={(props: Record<string, unknown>) => {
                            const { cx, cy, payload } = props as { cx: number; cy: number; payload: { status: string } }
                            const colors: Record<string, string> = { green: '#10b981', yellow: '#f59e0b', red: '#ef4444' }
                            const color = colors[payload.status] ?? colors.green
                            return <Dot cx={cx} cy={cy} r={4} fill={color} stroke="white" strokeWidth={1} />
                        }}
                        connectNulls
                        name="actual"
                    />
                </LineChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                    <span className="inline-block w-4 border-t-2 border-dashed border-indigo-500" />
                    Цель
                </span>
                <span className="flex items-center gap-1">
                    <span className="inline-block w-4 border-t-2 border-emerald-500" />
                    Факт
                </span>
            </div>
        </section>
    )
}
