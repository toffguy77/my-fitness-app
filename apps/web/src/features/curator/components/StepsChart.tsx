'use client'

import { useMemo } from 'react'
import { Footprints } from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    ReferenceLine, Cell
} from 'recharts'
import type { DayDetail } from '../types'

interface StepsChartProps {
    days: DayDetail[]
    stepsGoal?: number | null
}

export function StepsChart({ days, stepsGoal }: StepsChartProps) {
    const stepsData = useMemo(() =>
        [...days].reverse().map(d => ({
            date: d.date,
            steps: d.steps,
            label: new Date(d.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
        })),
        [days]
    )

    const hasAnySteps = stepsData.some(d => d.steps > 0)
    if (!hasAnySteps) return null

    const latestSteps = stepsData[stepsData.length - 1]?.steps ?? 0
    const goalLabel = stepsGoal != null && stepsGoal > 0
        ? `Цель ${(stepsGoal / 1000).toFixed(0)}k`
        : undefined

    return (
        <section className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Footprints className="h-4 w-4 text-green-500" />
                    <h2 className="text-sm font-semibold text-gray-900">Динамика шагов</h2>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                    {latestSteps.toLocaleString('ru-RU')}
                </span>
            </div>

            <ResponsiveContainer width="100%" height={120}>
                <BarChart data={stepsData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                    <YAxis
                        tick={{ fontSize: 10 }}
                        stroke="#9ca3af"
                        tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                    />
                    <Tooltip
                        formatter={(value?: number) => [`${(value ?? 0).toLocaleString('ru-RU')} шагов`, 'Шаги']}
                        labelFormatter={(label: unknown) => String(label)}
                    />
                    {stepsGoal != null && stepsGoal > 0 && (
                        <ReferenceLine
                            y={stepsGoal}
                            stroke="#22c55e"
                            strokeDasharray="6 3"
                            label={{ value: goalLabel, position: 'right', fontSize: 10, fill: '#22c55e' }}
                        />
                    )}
                    <Bar dataKey="steps" radius={[2, 2, 0, 0]}>
                        {stepsData.map((d) => (
                            <Cell
                                key={d.date}
                                fill={stepsGoal != null && d.steps >= stepsGoal ? '#22c55e' : '#86efac'}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </section>
    )
}
