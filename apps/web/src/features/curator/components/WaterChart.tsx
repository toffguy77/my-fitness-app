'use client'

import { useMemo } from 'react'
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    ReferenceLine, Cell, CartesianGrid,
} from 'recharts'
import type { Payload } from 'recharts/types/component/DefaultTooltipContent'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import type { DayDetail } from '../types'

const CHART_HEIGHT = 160
const AXIS_STYLE = { fontSize: 11, fill: '#9ca3af' }
const GRID_STROKE = '#f0f0f0'

interface WaterChartProps {
    days: DayDetail[]
}

function WaterTooltip({ active, payload, label }: {
    active?: boolean
    payload?: Payload<number, string>[]
    label?: string
}) {
    if (!active || !payload?.length) return null
    return (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <p className="text-xs font-medium text-gray-900 mb-1">{String(label)}</p>
            {payload.map((entry: Payload<number, string>) => (
                <p key={entry.name} className="text-xs text-gray-600">
                    <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5"
                        style={{ backgroundColor: entry.color }}
                    />
                    Вода: <span className="font-medium">{entry.value ?? 0} стаканов</span>
                </p>
            ))}
        </div>
    )
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
        <Card variant="bordered">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-gray-900">Вода</CardTitle>
                    <span className="text-sm font-semibold text-gray-900">
                        {latestGlasses}/{waterGoal}
                    </span>
                </div>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                    <BarChart data={waterData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                        <XAxis
                            dataKey="label"
                            tick={AXIS_STYLE}
                            stroke="#e5e7eb"
                            tickLine={false}
                        />
                        <YAxis
                            tick={AXIS_STYLE}
                            stroke="#e5e7eb"
                            tickLine={false}
                            width={40}
                            allowDecimals={false}
                        />
                        <Tooltip content={<WaterTooltip />} />
                        {waterGoal > 0 && (
                            <ReferenceLine
                                y={waterGoal}
                                stroke="#60a5fa"
                                strokeDasharray="6 3"
                                strokeWidth={1}
                                label={{
                                    value: `Цель ${waterGoal}`,
                                    position: 'right',
                                    fill: '#60a5fa',
                                    fontSize: 11,
                                }}
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
            </CardContent>
        </Card>
    )
}
