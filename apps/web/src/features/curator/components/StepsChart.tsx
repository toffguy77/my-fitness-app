'use client'

import { useMemo } from 'react'
import { Footprints } from 'lucide-react'
import type { DayDetail } from '../types'

const CHART_PADDING = { top: 10, right: 10, bottom: 24, left: 40 }

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

    const width = 300
    const height = 120
    const padding = CHART_PADDING
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    const maxSteps = Math.max(...stepsData.map(d => d.steps), stepsGoal ?? 0, 1000)
    const barWidth = Math.min(chartWidth / stepsData.length * 0.7, 30)
    const gap = (chartWidth - barWidth * stepsData.length) / Math.max(stepsData.length - 1, 1)

    const latestSteps = stepsData[stepsData.length - 1]?.steps ?? 0

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

            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
                {/* Goal line */}
                {stepsGoal != null && stepsGoal > 0 && (
                    <>
                        <line
                            x1={padding.left}
                            y1={padding.top + chartHeight - (stepsGoal / maxSteps) * chartHeight}
                            x2={width - padding.right}
                            y2={padding.top + chartHeight - (stepsGoal / maxSteps) * chartHeight}
                            stroke="currentColor" strokeWidth="1" strokeDasharray="6 3" className="text-green-500"
                        />
                        <text
                            x={width - padding.right}
                            y={padding.top + chartHeight - (stepsGoal / maxSteps) * chartHeight - 3}
                            textAnchor="end" className="text-[8px] fill-green-500"
                        >
                            Цель {(stepsGoal / 1000).toFixed(0)}k
                        </text>
                    </>
                )}

                {/* Bars */}
                {stepsData.map((d, i) => {
                    const barHeight = (d.steps / maxSteps) * chartHeight
                    const x = padding.left + i * (barWidth + gap)
                    const y = padding.top + chartHeight - barHeight
                    const isGoalMet = stepsGoal != null && d.steps >= stepsGoal
                    return (
                        <g key={d.date}>
                            <rect
                                x={x}
                                y={y}
                                width={barWidth}
                                height={Math.max(barHeight, 1)}
                                rx={2}
                                fill="currentColor"
                                className={isGoalMet ? 'text-green-500' : 'text-green-300'}
                            >
                                <title>{`${d.label}: ${d.steps.toLocaleString('ru-RU')} шагов`}</title>
                            </rect>
                            <text
                                x={x + barWidth / 2}
                                y={height - 2}
                                textAnchor="middle"
                                className="text-[8px] fill-gray-400"
                            >
                                {d.label}
                            </text>
                        </g>
                    )
                })}

                {/* Y-axis labels */}
                <text x={padding.left - 5} y={padding.top + 4} textAnchor="end" className="text-[9px] fill-gray-400">
                    {(maxSteps / 1000).toFixed(0)}k
                </text>
                <text x={padding.left - 5} y={padding.top + chartHeight} textAnchor="end" className="text-[9px] fill-gray-400">
                    0
                </text>
            </svg>
        </section>
    )
}
