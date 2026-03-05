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

interface StepsChartProps {
    days: DayDetail[]
    stepsGoal?: number | null
}

function StepsTooltip({ active, payload, label }: {
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
                    Шаги: <span className="font-medium">{(Number(entry.value) ?? 0).toLocaleString('ru-RU')}</span>
                </p>
            ))}
        </div>
    )
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

    return (
        <Card variant="bordered">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-gray-900">Динамика шагов</CardTitle>
                    <span className="text-sm font-semibold text-gray-900">
                        {latestSteps.toLocaleString('ru-RU')}
                    </span>
                </div>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                    <BarChart data={stepsData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
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
                            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                        />
                        <Tooltip content={<StepsTooltip />} />
                        {stepsGoal != null && stepsGoal > 0 && (
                            <ReferenceLine
                                y={stepsGoal}
                                stroke="#22c55e"
                                strokeDasharray="6 3"
                                strokeWidth={1}
                                label={{
                                    value: `Цель ${(stepsGoal / 1000).toFixed(0)}k`,
                                    position: 'right',
                                    fill: '#22c55e',
                                    fontSize: 11,
                                }}
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
            </CardContent>
        </Card>
    )
}
