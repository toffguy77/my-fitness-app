'use client'

import { useMemo, useState } from 'react'
import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { Payload } from 'recharts/types/component/DefaultTooltipContent'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import type { WeeklySnapshot, PlatformBenchmark } from '../types'

import { t } from '@/shared/i18n'
import { AXIS_STYLE, GRID_STROKE, TOOLTIP_CLASS, chartColor } from '@/shared/charts/chartTheme'
const CHART_HEIGHT = 200

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
        <div className={TOOLTIP_CLASS}>
            <p className="text-xs font-medium text-fg mb-1">{String(label)}</p>
            {payload.map((entry: Payload<number, string>) => (
                <p key={entry.name} className="text-xs text-fg-muted">
                    <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5"
                        style={{ backgroundColor: entry.color }}
                    />
                    {entry.name === 'own' ? t('curator.analytics.own') : t('curator.analytics.platform')}: <span className="font-medium tabular-nums">{Number(entry.value)}%</span>
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

    // A curator whose snapshots have not been collected yet used to see no
    // section at all, and could not tell an empty week from a broken screen.
    // The figures arrive from a nightly job, so "not yet" is a normal state and
    // has to look like one.
    if (ownSnapshots.length === 0) {
        return (
            <div className="rounded-card border border-line bg-surface p-5">
                <h2 className="type-title-3 text-fg">{t('curator.analytics.dynamics')}</h2>
                <p className="mt-2 text-sm text-fg-muted">
                    {t('curator.analytics.emptyHint')}
                </p>
            </div>
        )
    }

    return (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
            <button
                type="button"
                onClick={() => setExpanded(prev => !prev)}
                aria-expanded={expanded}
                className="flex min-h-14 w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-subtle/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
            >
                <span className="type-title-3 text-fg">{t('curator.analytics.dynamics')}</span>
                {expanded ? (
                    <ChevronUp className="h-5 w-5 text-fg-subtle" aria-hidden="true" />
                ) : (
                    <ChevronDown className="h-5 w-5 text-fg-subtle" aria-hidden="true" />
                )}
            </button>

            {expanded && (
                <div className="px-5 pb-5">
                    {/* Период из трёх вариантов — сегменты; выбранный — чернилами. */}
                    <div className="mb-3 inline-flex rounded-full border border-line p-1" role="group">
                        {([4, 8, 12] as const).map(w => (
                            <button
                                key={w}
                                type="button"
                                onClick={() => setWeeks(w)}
                                aria-pressed={weeks === w}
                                className={cn(
                                    'h-9 rounded-full px-4 text-sm font-medium transition-colors',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                                    weeks === w
                                        ? 'bg-fg text-fg-inverse'
                                        : 'text-fg-muted hover:text-fg'
                                )}
                            >
                                {t('curator.analytics.weeks', { count: w })}
                            </button>
                        ))}
                    </div>

                    {benchmarks.length === 0 && (
                        <p className="mb-3 rounded-tile bg-info-soft px-3 py-2 text-sm text-info-fg">
                            {t('curator.analytics.noBenchmarks')}
                        </p>
                    )}

                    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                            <XAxis
                                dataKey="week"
                                tick={AXIS_STYLE}
                                stroke={chartColor.line}
                                tickLine={false}
                            />
                            <YAxis
                                tick={AXIS_STYLE}
                                stroke={chartColor.line}
                                tickLine={false}
                                width={40}
                                tickFormatter={(v: number) => `${v}%`}
                            />
                            <Tooltip content={<DynamicsTooltip />} />
                            <Line
                                type="monotone"
                                dataKey="own"
                                stroke={chartColor.fg}
                                strokeWidth={2}
                                dot={{ r: 3, fill: chartColor.fg, strokeWidth: 0 }}
                                activeDot={{ r: 5 }}
                                name="own"
                            />
                            <Line
                                type="monotone"
                                dataKey="benchmark"
                                stroke={chartColor['fg-subtle']}
                                strokeWidth={2}
                                strokeDasharray="6 3"
                                dot={{ r: 3 }}
                                name="benchmark"
                                connectNulls
                            />
                        </LineChart>
                    </ResponsiveContainer>

                    <div className="mt-2 flex items-center gap-4 text-[13px] text-fg-muted">
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block w-4 border-t-2 border-fg" aria-hidden="true" />
                            {t('curator.analytics.ownMetric')}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block w-4 border-t-2 border-dashed border-fg-subtle" aria-hidden="true" />
                            {t('curator.analytics.platform')}
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}
