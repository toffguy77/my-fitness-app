'use client'

import { useMemo } from 'react'
import { Droplets } from 'lucide-react'
import type { DayDetail } from '../types'

const CHART_PADDING = { top: 10, right: 10, bottom: 24, left: 30 }

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

    const width = 300
    const height = 120
    const padding = CHART_PADDING
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    const waterGoal = waterData[0]?.goal ?? 8
    const maxGlasses = Math.max(...waterData.map(d => d.glasses), waterGoal)
    const barWidth = Math.min(chartWidth / waterData.length * 0.7, 30)
    const gap = (chartWidth - barWidth * waterData.length) / Math.max(waterData.length - 1, 1)

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

            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
                {waterGoal > 0 && (
                    <>
                        <line
                            x1={padding.left}
                            y1={padding.top + chartHeight - (waterGoal / maxGlasses) * chartHeight}
                            x2={width - padding.right}
                            y2={padding.top + chartHeight - (waterGoal / maxGlasses) * chartHeight}
                            stroke="currentColor" strokeWidth="1" strokeDasharray="6 3" className="text-blue-400"
                        />
                        <text
                            x={width - padding.right}
                            y={padding.top + chartHeight - (waterGoal / maxGlasses) * chartHeight - 3}
                            textAnchor="end" className="text-[8px] fill-blue-400"
                        >
                            Цель {waterGoal}
                        </text>
                    </>
                )}

                {waterData.map((d, i) => {
                    const barHeight = (d.glasses / maxGlasses) * chartHeight
                    const x = padding.left + i * (barWidth + gap)
                    const y = padding.top + chartHeight - barHeight
                    const isGoalMet = d.glasses >= d.goal
                    return (
                        <g key={d.date}>
                            <rect
                                x={x} y={y} width={barWidth} height={Math.max(barHeight, 1)}
                                rx={2} fill="currentColor"
                                className={isGoalMet ? 'text-blue-500' : 'text-blue-300'}
                            >
                                <title>{`${d.label}: ${d.glasses}/${d.goal} стаканов`}</title>
                            </rect>
                            <text x={x + barWidth / 2} y={height - 2} textAnchor="middle" className="text-[8px] fill-gray-400">
                                {d.label}
                            </text>
                        </g>
                    )
                })}

                <text x={padding.left - 5} y={padding.top + 4} textAnchor="end" className="text-[9px] fill-gray-400">{maxGlasses}</text>
                <text x={padding.left - 5} y={padding.top + chartHeight} textAnchor="end" className="text-[9px] fill-gray-400">0</text>
            </svg>
        </section>
    )
}
