'use client'

import { useState, useCallback, memo, useMemo, useEffect } from 'react'
import { Plus, Check, TrendingUp, TrendingDown, Minus, Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { cn } from '@/shared/utils/cn'
import { useDashboardStore } from '../store/dashboardStore'
import { formatLocalDate } from '@/shared/utils/format'
import { validateWeight } from '../utils/validation'
import { useDebouncedCallback } from '@/shared/hooks/useDebounce'
import { AttentionBadge } from './AttentionBadge'
import { getProfile } from '@/features/settings/api/settings'
import { apiClient } from '@/shared/utils/api-client'
import toast from 'react-hot-toast'

interface WeightTrendPoint {
    date: Date
    weight: number
}

export interface WeightSectionProps {
    date: Date
    className?: string
}

const CHART_PADDING = { top: 18, right: 10, bottom: 20, left: 40 }

const WeightTrendChart = memo(function WeightTrendChart({
    data,
    targetWeight,
}: {
    data: WeightTrendPoint[]
    targetWeight?: number | null
}) {
    const width = 300
    const height = 120
    const padding = CHART_PADDING
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    const { minWeight, maxWeight, weightRange } = useMemo(() => {
        if (data.length === 0) return { minWeight: 0, maxWeight: 0, weightRange: 1 }
        const weights = data.map(d => d.weight)
        if (targetWeight != null) weights.push(targetWeight)
        const min = Math.min(...weights)
        const max = Math.max(...weights)
        return { minWeight: min, maxWeight: max, weightRange: max - min || 1 }
    }, [data, targetWeight])

    const points = useMemo(() => {
        if (data.length === 0) return []
        return data.map((point, index) => ({
            x: padding.left + (index / Math.max(data.length - 1, 1)) * chartWidth,
            y: padding.top + chartHeight - ((point.weight - minWeight) / weightRange) * chartHeight,
            weight: point.weight,
            date: point.date,
        }))
    }, [data, minWeight, weightRange, chartWidth, chartHeight, padding.left, padding.top])

    const pathData = useMemo(
        () => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '),
        [points],
    )

    if (data.length < 2) return null

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto"
            preserveAspectRatio="xMidYMid meet"
            aria-label="График изменения веса"
        >
            <line
                x1={padding.left} y1={padding.top + chartHeight / 2}
                x2={width - padding.right} y2={padding.top + chartHeight / 2}
                stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-gray-200"
            />
            {targetWeight != null && (
                <>
                    <line
                        x1={padding.left}
                        y1={padding.top + chartHeight - ((targetWeight - minWeight) / weightRange) * chartHeight}
                        x2={width - padding.right}
                        y2={padding.top + chartHeight - ((targetWeight - minWeight) / weightRange) * chartHeight}
                        stroke="currentColor" strokeWidth="1" strokeDasharray="6 3" className="text-green-500"
                    />
                    <text
                        x={width - padding.right}
                        y={padding.top + chartHeight - ((targetWeight - minWeight) / weightRange) * chartHeight - 4}
                        textAnchor="end" className="text-[10px] fill-green-500"
                    >
                        Цель {targetWeight}
                    </text>
                </>
            )}
            <path
                d={pathData} fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"
            />
            {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="3" fill="currentColor" className="text-blue-500">
                    <title>{`${p.weight.toFixed(1)} кг`}</title>
                </circle>
            ))}
            <text x={padding.left - 5} y={padding.top + 4} textAnchor="end" className="text-[10px] fill-gray-400">
                {maxWeight.toFixed(1)}
            </text>
            <text x={padding.left - 5} y={padding.top + chartHeight} textAnchor="end" className="text-[10px] fill-gray-400">
                {minWeight.toFixed(1)}
            </text>
        </svg>
    )
})

export const WeightSection = memo(function WeightSection({ date, className }: WeightSectionProps) {
    const [inputValue, setInputValue] = useState('')
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [validationError, setValidationError] = useState<string | null>(null)
    const [targetWeight, setTargetWeight] = useState<number | null>(null)
    const [weightTrend, setWeightTrend] = useState<WeightTrendPoint[]>([])

    const { dailyData, updateMetric } = useDashboardStore()
    const dateStr = formatLocalDate(date)
    const dayData = dailyData[dateStr]

    // Fetch target weight + weight trend
    useEffect(() => {
        getProfile()
            .then((profile) => {
                if (profile.settings?.target_weight != null) {
                    setTargetWeight(profile.settings.target_weight)
                }
            })
            .catch(() => {})

        apiClient
            .get<{ weight_trend: Array<{ date: string; weight: number }>; target_weight: number | null }>(
                '/backend-api/v1/dashboard/progress?weeks=4',
            )
            .then((raw) => {
                setWeightTrend(
                    (raw.weight_trend || []).map((p) => ({ date: new Date(p.date), weight: p.weight })),
                )
                if (raw.target_weight != null && targetWeight == null) {
                    setTargetWeight(raw.target_weight)
                }
            })
            .catch(() => {})
    }, [])

    const currentWeight = dayData?.weight
    const isWeightLogged = currentWeight !== null && currentWeight !== undefined

    const previousWeight = useMemo(() => {
        const prev = new Date(date)
        prev.setDate(date.getDate() - 1)
        return dailyData[formatLocalDate(prev)]?.weight
    }, [date, dailyData])

    const weightChange =
        currentWeight && previousWeight ? currentWeight - previousWeight : null

    const distanceToTarget =
        currentWeight != null && targetWeight != null ? currentWeight - targetWeight : null

    const formatWeight = (w: number) => (w % 1 === 0 ? w.toString() : w.toFixed(1))

    const debouncedValidate = useDebouncedCallback((value: string) => {
        if (value.trim() === '') { setValidationError(null); return }
        const v = validateWeight(parseFloat(value))
        setValidationError(v.isValid ? null : v.error || 'Неверное значение')
    }, 300)

    const handleInputChange = useCallback(
        (value: string) => {
            setInputValue(value)
            if (validationError) setValidationError(null)
            debouncedValidate(value)
        },
        [debouncedValidate, validationError],
    )

    const handleSave = useCallback(async () => {
        if (!inputValue.trim()) { setValidationError('Введите вес'); return }
        const num = parseFloat(inputValue)
        const v = validateWeight(num)
        if (!v.isValid) { setValidationError(v.error || 'Неверное значение'); return }
        setIsSaving(true)
        setValidationError(null)
        try {
            await updateMetric(dateStr, { type: 'weight', data: { weight: num } })
            setInputValue('')
            setIsEditing(false)
            toast.success('Вес сохранен')
        } catch {
            setValidationError('Не удалось сохранить вес')
        } finally {
            setIsSaving(false)
        }
    }, [inputValue, dateStr, updateMetric])

    const handleQuickAdd = useCallback(() => {
        if (isWeightLogged) setInputValue(formatWeight(currentWeight))
        setIsEditing(true)
    }, [isWeightLogged, currentWeight])

    const handleCancel = useCallback(() => {
        setInputValue('')
        setIsEditing(false)
        setValidationError(null)
    }, [])

    const handleKeyPress = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') handleSave()
            else if (e.key === 'Escape') handleCancel()
        },
        [handleSave, handleCancel],
    )

    const isToday = dateStr === formatLocalDate(new Date())
    const showAttention = isToday && !isWeightLogged

    // 4-week change
    const trendChange = useMemo(() => {
        if (weightTrend.length < 2) return null
        return weightTrend[weightTrend.length - 1].weight - weightTrend[0].weight
    }, [weightTrend])

    return (
        <Card className={cn('', className)} variant="bordered">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-lg font-semibold text-gray-900">Вес</CardTitle>
                        {showAttention && (
                            <AttentionBadge urgency="normal" ariaLabel="Вес не записан сегодня" />
                        )}
                    </div>
                    <Button
                        variant="ghost" size="sm" onClick={handleQuickAdd}
                        className="h-8 w-8 p-0"
                        aria-label={isWeightLogged ? 'Изменить вес' : 'Добавить вес'}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {isEditing ? (
                    <div className="space-y-3">
                        <div>
                            <label htmlFor="weight-input" className="sr-only">Вес в килограммах</label>
                            <Input
                                id="weight-input" type="number" step="0.1" min="0.1" max="500"
                                placeholder="Введите вес в кг" value={inputValue}
                                onChange={(e) => handleInputChange(e.target.value)}
                                onKeyDown={handleKeyPress}
                                error={validationError || undefined}
                                autoFocus aria-label="Вес в килограммах"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="primary" size="sm" onClick={handleSave}
                                isLoading={isSaving} disabled={!!validationError || !inputValue.trim()}
                                className="flex-1"
                            >
                                <Check className="h-4 w-4 mr-2" aria-hidden="true" />
                                Сохранить
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleCancel} disabled={isSaving}>
                                Отмена
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center">
                        {/* Left: current weight + indicators */}
                        <div className="text-center sm:text-left shrink-0">
                            {isWeightLogged ? (
                                <div className="space-y-1.5">
                                    <div className="text-4xl font-bold text-gray-900">
                                        {formatWeight(currentWeight)}
                                        <span className="text-lg text-gray-500 ml-1">кг</span>
                                    </div>
                                    <div className="flex items-center justify-center sm:justify-start gap-2 text-green-600">
                                        <Check className="h-4 w-4" aria-hidden="true" />
                                        <span className="text-sm font-medium">Записан</span>
                                    </div>
                                    {weightChange !== null && (
                                        <div className={cn(
                                            'flex items-center justify-center sm:justify-start gap-1 text-sm',
                                            weightChange > 0 ? 'text-red-600' : weightChange < 0 ? 'text-green-600' : 'text-gray-600',
                                        )}>
                                            {weightChange > 0 ? <TrendingUp className="h-4 w-4" /> : weightChange < 0 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                                            <span>{weightChange > 0 ? '+' : ''}{formatWeight(Math.abs(weightChange))} кг с вчера</span>
                                        </div>
                                    )}
                                    {targetWeight != null && distanceToTarget != null && (
                                        <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-gray-500">
                                            <Target className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
                                            <span>Цель: {formatWeight(targetWeight)} кг</span>
                                            {Math.abs(distanceToTarget) >= 0.1 ? (
                                                <span className={distanceToTarget > 0 ? 'text-amber-600' : 'text-green-600'}>
                                                    ({distanceToTarget > 0 ? '-' : '+'}{formatWeight(Math.abs(distanceToTarget))} кг)
                                                </span>
                                            ) : (
                                                <span className="text-green-600 font-medium">Достигнута!</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2 py-2">
                                    <p className="text-sm text-gray-500">Не записано</p>
                                    {previousWeight && (
                                        <p className="text-xs text-gray-400">Вчера: {formatWeight(previousWeight)} кг</p>
                                    )}
                                    {targetWeight != null && (
                                        <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-gray-500">
                                            <Target className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
                                            <span>Цель: {formatWeight(targetWeight)} кг</span>
                                        </div>
                                    )}
                                    <Button
                                        variant="outline" size="sm" onClick={handleQuickAdd}
                                        className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                    >
                                        <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                                        Добавить
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Right: trend chart */}
                        {weightTrend.length >= 2 && (
                            <div className="flex-1 min-w-0 w-full">
                                <WeightTrendChart data={weightTrend} targetWeight={targetWeight} />
                                {trendChange !== null && (
                                    <div className="text-center mt-1">
                                        <span className={cn(
                                            'text-xs font-medium',
                                            trendChange < 0 ? 'text-green-600' : trendChange > 0 ? 'text-orange-600' : 'text-gray-500',
                                        )}>
                                            {trendChange < 0 ? '' : '+'}{trendChange.toFixed(1)} кг за 4 недели
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
})
