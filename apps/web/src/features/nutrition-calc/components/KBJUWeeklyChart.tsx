'use client'

import { useMemo } from 'react'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Dot,
} from 'recharts'
import type { Payload } from 'recharts/types/component/DefaultTooltipContent'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { cn } from '@/shared/utils/cn'
import type { TargetVsActual } from '../types'

interface KBJUWeeklyChartProps {
    data: TargetVsActual[]
    className?: string
}

const CHART_HEIGHT = 160
const AXIS_STYLE = { fontSize: 11, fill: '#9ca3af' }
const GRID_STROKE = '#f0f0f0'

function ChartTooltip({ active, payload, label }: {
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
                    {entry.name === 'target' ? 'Цель' : 'Факт'}:{' '}
                    <span className="font-medium">{Math.round(entry.value ?? 0)} ккал</span>
                </p>
            ))}
        </div>
    )
}

export function KBJUWeeklyChart({ data, className }: KBJUWeeklyChartProps) {
    const chartData = useMemo(() =>
        data.map(d => {
            const targetCal = d.target?.calories ?? null
            const actualCal = d.actual?.calories ?? null
            const dateStr = String(d.date).split(/[T ]/)[0]
            const [year, month, day] = dateStr.split('-').map(Number)
            const dateObj = new Date(year, month - 1, day)
            const label = isNaN(dateObj.getTime())
                ? dateStr
                : dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

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
                status,
            }
        }),
        [data]
    )

    if (chartData.length === 0) return null

    return (
        <Card className={cn('', className)} variant="bordered">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-gray-900">
                    Калории за неделю
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
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
                            width={50}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Line
                            type="monotone"
                            dataKey="target"
                            stroke="#6366f1"
                            strokeDasharray="6 3"
                            strokeWidth={2}
                            dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
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
                                return <Dot cx={cx} cy={cy} r={3} fill={color} stroke="white" strokeWidth={1.5} />
                            }}
                            connectNulls
                            name="actual"
                        />
                    </LineChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 border-t-2 border-dashed border-indigo-500" />
                        Цель
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 border-t-2 border-emerald-500" />
                        Факт
                    </span>
                </div>
            </CardContent>
        </Card>
    )
}
