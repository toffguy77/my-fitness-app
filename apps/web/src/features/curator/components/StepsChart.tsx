'use client'

import { useMemo } from 'react'
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    ReferenceLine, Cell, CartesianGrid,
} from 'recharts'
import type { Payload } from 'recharts/types/component/DefaultTooltipContent'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import type { DayDetail } from '../types'

import { t } from '@/shared/i18n'
import { AXIS_STYLE, GRID_STROKE, chartColor } from '@/shared/charts/chartTheme'
const CHART_HEIGHT = 160

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
        <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-sm">
            <p className="text-xs font-medium text-fg mb-1">{String(label)}</p>
            {payload.map((entry: Payload<number, string>) => (
                <p key={entry.name} className="text-xs text-fg-muted">
                    <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5"
                        style={{ backgroundColor: entry.color }}
                    />
                    {t('curator.charts.steps', { value: (Number(entry.value) ?? 0).toLocaleString('ru-RU') })}
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
                    <CardTitle className="text-lg font-semibold text-fg">{t('curator.charts.stepsHeading')}</CardTitle>
                    <span className="text-sm font-semibold text-fg">
                        {latestSteps.toLocaleString('ru-RU')}
                    </span>
                </div>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                    <BarChart data={stepsData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
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
                            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                        />
                        <Tooltip content={<StepsTooltip />} />
                        {stepsGoal != null && stepsGoal > 0 && (
                            <ReferenceLine
                                y={stepsGoal}
                                stroke={chartColor.success}
                                strokeDasharray="6 3"
                                strokeWidth={1}
                                label={{
                                    value: t('curator.charts.stepsGoal', { value: (stepsGoal / 1000).toFixed(0) }),
                                    position: 'right',
                                    fill: chartColor.success,
                                    fontSize: 11,
                                }}
                            />
                        )}
                        <Bar dataKey="steps" radius={[2, 2, 0, 0]}>
                            {stepsData.map((d) => (
                                <Cell
                                    key={d.date}
                                    fill={stepsGoal != null && d.steps >= stepsGoal ? chartColor.success : chartColor['success-soft']}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}
