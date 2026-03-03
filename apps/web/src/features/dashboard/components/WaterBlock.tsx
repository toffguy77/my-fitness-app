'use client'

import { useState, useEffect, useCallback, memo, useMemo } from 'react'
import { Plus, Check, Droplets } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { cn } from '@/shared/utils/cn'
import { formatLocalDate } from '@/shared/utils/format'
import { apiClient } from '@/shared/utils/api-client'
import { AttentionBadge } from './AttentionBadge'
import toast from 'react-hot-toast'

export interface WaterBlockProps {
    date: Date
    className?: string
}

interface WaterRingProps {
    percentage: number
    size?: number
    strokeWidth?: number
    className?: string
    children?: React.ReactNode
}

const WaterRing = memo(function WaterRing({
    percentage,
    size = 72,
    strokeWidth = 6,
    className,
    children,
}: WaterRingProps) {
    const radius = (size - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const cappedPercentage = Math.min(percentage, 100)
    const strokeDashoffset = circumference - (cappedPercentage / 100) * circumference
    const isComplete = percentage >= 100

    return (
        <div
            className={cn('relative inline-flex items-center justify-center', className)}
            role="progressbar"
            aria-valuenow={cappedPercentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Прогресс воды: ${percentage}%`}
        >
            <svg width={size} height={size} className="transform -rotate-90" aria-hidden="true">
                <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="none" className="text-gray-100" />
                <circle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke="currentColor" strokeWidth={strokeWidth} fill="none"
                    strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className={cn('transition-all duration-500', isComplete ? 'text-green-500' : 'text-blue-500')}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {children}
            </div>
        </div>
    )
})

export const WaterBlock = memo(function WaterBlock({ date, className }: WaterBlockProps) {
    const [glasses, setGlasses] = useState(0)
    const [goal, setGoal] = useState(8)
    const [glassSize, setGlassSize] = useState(250)
    const [isAdding, setIsAdding] = useState(false)
    const [enabled, setEnabled] = useState<boolean | null>(null)

    const dateStr = formatLocalDate(date)

    useEffect(() => {
        apiClient.get<{ glasses: number; goal: number; glass_size: number; enabled: boolean }>(
            `/backend-api/v1/food-tracker/water?date=${dateStr}`
        )
            .then(data => {
                setGlasses(data.glasses)
                setGoal(data.goal)
                setGlassSize(data.glass_size)
                setEnabled(data.enabled)
            })
            .catch(() => {})
    }, [dateStr])

    if (enabled === false) return null
    if (enabled === null) return null

    const percentage = useMemo(() => goal > 0 ? Math.round((glasses / goal) * 100) : 0, [glasses, goal])
    const isGoalReached = glasses >= goal

    const handleAddGlass = useCallback(async () => {
        setIsAdding(true)
        const prevGlasses = glasses
        setGlasses(g => g + 1)

        try {
            const result = await apiClient.post<{ glasses: number; goal: number; glass_size: number }>(
                '/backend-api/v1/food-tracker/water',
                { date: dateStr, glasses: 1 }
            )
            setGlasses(result.glasses)
            toast.success('Стакан воды добавлен')
        } catch {
            setGlasses(prevGlasses)
            toast.error('Не удалось сохранить')
        } finally {
            setIsAdding(false)
        }
    }, [dateStr, glasses])

    const isToday = dateStr === formatLocalDate(new Date())
    const showAttention = isToday && glasses === 0

    return (
        <Card className={cn('h-full', className)} variant="bordered">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-semibold text-gray-900">Вода</CardTitle>
                        {showAttention && (
                            <AttentionBadge urgency="normal" ariaLabel="Вода не записана сегодня" />
                        )}
                    </div>
                    <Button
                        variant="ghost" size="sm"
                        onClick={handleAddGlass} isLoading={isAdding}
                        className="h-8 w-8 p-0"
                        aria-label="Добавить стакан воды"
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-3">
                {glasses > 0 ? (
                    <div className="text-center space-y-2" role="region" aria-label="Прогресс воды">
                        <div className="flex justify-center">
                            <WaterRing percentage={percentage} size={72} strokeWidth={6}>
                                <span className={cn(
                                    'text-base font-bold leading-tight',
                                    isGoalReached ? 'text-green-600' : 'text-gray-900'
                                )}>
                                    {glasses}/{goal}
                                </span>
                            </WaterRing>
                        </div>
                        <div className="space-y-0.5">
                            <div className="text-xs text-gray-500">стаканов ({glassSize} мл)</div>
                            <div className={cn(
                                'text-xs font-medium',
                                isGoalReached ? 'text-green-600' : 'text-gray-600'
                            )}>
                                {percentage}%
                            </div>
                        </div>
                        {isGoalReached ? (
                            <div className="flex items-center justify-center gap-1.5 text-green-600" role="status">
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="text-xs font-medium">Цель достигнута!</span>
                            </div>
                        ) : (
                            <Button
                                variant="outline" size="sm"
                                onClick={handleAddGlass} isLoading={isAdding}
                                className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                aria-label="Добавить стакан воды"
                            >
                                <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                                Добавить
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-2 space-y-2">
                        <Droplets className="h-8 w-8 mx-auto text-gray-300" aria-hidden="true" />
                        <p className="text-sm text-gray-500">Не записано</p>
                        <Button
                            variant="outline" size="sm"
                            onClick={handleAddGlass} isLoading={isAdding}
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                            aria-label="Добавить стакан воды"
                        >
                            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                            Добавить
                        </Button>
                    </div>
                )}

                <div className="text-xs text-gray-400 text-center">
                    Цель: {goal} стаканов в день
                </div>
            </CardContent>
        </Card>
    )
})
