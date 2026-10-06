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
import { t } from '@/shared/i18n'
import { AXIS_STYLE, GRID_STROKE, chartColor } from '@/shared/charts/chartTheme'

interface KBJUWeeklyChartProps {
    data: TargetVsActual[]
    className?: string
}

const CHART_HEIGHT = 160

function ChartTooltip({ active, payload, label }: {
    active?: boolean
    payload?: Payload<number, string>[]
    label?: string
}) {
    if (!active || !payload?.length) return null
    return (
        <div className="rounded-tile border border-line bg-surface px-3 py-2 shadow-overlay">
            <p className="mb-1 text-xs font-medium text-fg tabular-nums">{String(label)}</p>
            {payload.map((entry: Payload<number, string>) => (
                <p key={entry.name} className="text-xs text-fg-muted tabular-nums">
                    <span
                        className="mr-1.5 inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: entry.color }}
                        aria-hidden="true"
                    />
                    {entry.name === 'target' ? t('ui.weekChart.target') : t('ui.weekChart.actual')}:{' '}
                    <span className="font-medium">{Math.round(entry.value ?? 0)} {t('units.kcal')}</span>
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
                <CardTitle className="type-title-2 text-fg">
                    {t('ui.weekChart.title')}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                        <XAxis
                            dataKey="label"
                            tick={AXIS_STYLE}
                            stroke={chartColor.line}
                            tickLine={false}
                        />
                        <YAxis
                            tick={AXIS_STYLE}
                            stroke={chartColor.line}
                            tickLine={false}
                            width={50}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Line
                            type="monotone"
                            dataKey="target"
                            stroke={chartColor['fg-subtle']}
                            strokeDasharray="6 3"
                            strokeWidth={2}
                            dot={{ r: 3, fill: chartColor['fg-subtle'], strokeWidth: 0 }}
                            connectNulls
                            name="target"
                        />
                        <Line
                            type="monotone"
                            dataKey="actual"
                            stroke={chartColor.primary}
                            strokeWidth={2}
                            dot={(props: Record<string, unknown>) => {
                                const { cx, cy, payload } = props as { cx: number; cy: number; payload: { status: string } }
                                // «Мимо нормы» — единственная оценочная роль: и 10–20 %, и больше
                                // отмечаются `warning`, без тревожного красного.
                                const colors: Record<string, string> = { green: chartColor.primary, yellow: chartColor.warning, red: chartColor.warning }
                                const color = colors[payload.status] ?? colors.green
                                return <Dot cx={cx} cy={cy} r={3} fill={color} stroke={chartColor.surface} strokeWidth={1.5} />
                            }}
                            connectNulls
                            name="actual"
                        />
                    </LineChart>
                </ResponsiveContainer>
                {/* Легенда повторяет линии графика: цель — пунктиром третичным,
                    факт — сплошной терракотой. */}
                <div className="mt-2 flex items-center gap-4 text-xs text-fg-muted">
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 border-t-2 border-dashed border-fg-subtle" aria-hidden="true" />
                        {t('ui.weekChart.target')}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 border-t-2 border-primary" aria-hidden="true" />
                        {t('ui.weekChart.actual')}
                    </span>
                </div>
            </CardContent>
        </Card>
    )
}
