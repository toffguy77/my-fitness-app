'use client'

import { useMemo, useState } from 'react'
import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { Payload } from 'recharts/types/component/DefaultTooltipContent'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import type { WeeklySnapshot, PlatformBenchmark } from '../types'

const CHART_HEIGHT = 200
const AXIS_STYLE = { fontSize: 11, fill: '#9ca3af' }
const GRID_STROKE = '#f0f0f0'

interface AnalyticsDynamicsChartProps {
    ownSnapshots: WeeklySnapshot[]
    benchmarks: PlatformBenchmark[]
}

type PeriodWeeks = 4 | 8 | 12

function DynamicsTooltip({ active, payload, label }: {
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
                    {entry.name === 'own' ? 'Ваш' : 'Платформа'}: <span className="font-medium">{Number(entry.value)}%</span>
                </p>
            ))}
        </div>
    )
}

export function AnalyticsDynamicsChart({ ownSnapshots, benchmarks }: AnalyticsDynamicsChartProps) {
    const [expanded, setExpanded] = useState(false)
    const [weeks, setWeeks] = useState<PeriodWeeks>(4)

    const chartData = useMemo(() => {
        const slicedOwn = ownSnapshots.slice(-weeks)
        const benchMap = new Map(benchmarks.map(b => [b.week_start, b]))

        return slicedOwn.map(s => {
            const b = benchMap.get(s.week_start)
            return {
                week: new Date(s.week_start + 'T00:00:00').toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                }),
                own: s.avg_kbzhu_percent,
                benchmark: b?.avg_kbzhu_percent ?? null,
            }
        })
    }, [ownSnapshots, benchmarks, weeks])

    if (ownSnapshots.length === 0) return null

    return (
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded(prev => !prev)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
                <span className="text-sm font-semibold text-gray-900">Динамика</span>
                {expanded ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
            </button>

            {expanded && (
                <div className="px-4 pb-4">
                    <div className="flex gap-1 mb-3">
                        {([4, 8, 12] as const).map(w => (
                            <button
                                key={w}
                                type="button"
                                onClick={() => setWeeks(w)}
                                className={cn(
                                    'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                                    weeks === w
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                )}
                            >
                                {w} нед
                            </button>
                        ))}
                    </div>

                    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                            <XAxis
                                dataKey="week"
                                tick={AXIS_STYLE}
                                stroke="#e5e7eb"
                                tickLine={false}
                            />
                            <YAxis
                                tick={AXIS_STYLE}
                                stroke="#e5e7eb"
                                tickLine={false}
                                width={40}
                                tickFormatter={(v: number) => `${v}%`}
                            />
                            <Tooltip content={<DynamicsTooltip />} />
                            <Line
                                type="monotone"
                                dataKey="own"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                activeDot={{ r: 5 }}
                                name="own"
                            />
                            <Line
                                type="monotone"
                                dataKey="benchmark"
                                stroke="#9ca3af"
                                strokeWidth={2}
                                strokeDasharray="6 3"
                                dot={{ r: 3 }}
                                name="benchmark"
                                connectNulls
                            />
                        </LineChart>
                    </ResponsiveContainer>

                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-0.5 bg-blue-500 rounded" />
                            Ваш показатель
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-0.5 bg-gray-400 rounded border-dashed" />
                            Платформа
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}
