'use client'

import { useMemo } from 'react'
import { Droplets } from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    ReferenceLine, Cell
} from 'recharts'
import type { DayDetail } from '../types'

interface WaterChartProps {
    days: DayDetail[]
}

export function WaterChart({ days }: WaterChartProps) {
    const waterData = useMemo(() =>
        [...days].reverse().map(d => ({
            date: d.date,
            glasses: d.water?.glasses ?? 0,
            goal: d.water?.goal ?? 8,
            label: new Date(d.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
        })),
        [days]
    )

    const hasAnyWater = waterData.some(d => d.glasses > 0)
    if (!hasAnyWater) return null

    const waterGoal = waterData[0]?.goal ?? 8
    const latestGlasses = waterData[waterData.length - 1]?.glasses ?? 0

    return (
        <section className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-blue-500" />
                    <h2 className="text-sm font-semibold text-gray-900">Вода</h2>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                    {latestGlasses}/{waterGoal}
                </span>
            </div>

            <ResponsiveContainer width="100%" height={120}>
                <BarChart data={waterData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" allowDecimals={false} />
                    <Tooltip
                        formatter={(value?: number) => [
                            `${value ?? 0} стаканов`, 'Вода'
                        ]}
                        labelFormatter={(label: unknown) => String(label)}
                    />
                    {waterGoal > 0 && (
                        <ReferenceLine
                            y={waterGoal}
                            stroke="#60a5fa"
                            strokeDasharray="6 3"
                            label={{ value: `Цель ${waterGoal}`, position: 'right', fontSize: 10, fill: '#60a5fa' }}
                        />
                    )}
                    <Bar dataKey="glasses" radius={[2, 2, 0, 0]}>
                        {waterData.map((d) => (
                            <Cell
                                key={d.date}
                                fill={d.glasses >= d.goal ? '#3b82f6' : '#93c5fd'}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </section>
    )
}
