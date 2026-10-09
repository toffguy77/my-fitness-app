'use client'

import { useState, useCallback, memo, useMemo, useEffect } from 'react'
import { Plus, Pencil, Check, TrendingUp, TrendingDown, Minus, Target } from 'lucide-react'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { Payload } from 'recharts/types/component/DefaultTooltipContent'
import { Card, CardTitle } from '@/shared/components/ui/Card'
import { Button, IconButton } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { cn } from '@/shared/utils/cn'
import { useDashboardStore } from '../store/dashboardStore'
import { formatLocalDate, formatDecimal } from '@/shared/utils/format'
import { validateWeight } from '../utils/validation'
import { useDebouncedCallback } from '@/shared/hooks/useDebounce'
import { AttentionBadge } from './AttentionBadge'
import { getProfile } from '@/features/settings/api/settings'
import { apiClient } from '@/shared/utils/api-client'
import { DASHBOARD_PROGRESS_URL, PROGRESS_REUSE_MS } from '../api/dashboardApi'
import toast from 'react-hot-toast'
import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'
import { AXIS_STYLE, GRID_STROKE, TARGET_STROKE, TOOLTIP_CLASS, chartColor } from '@/shared/charts/chartTheme'

interface WeightTrendPoint {
    date: Date
    weight: number
}

export interface WeightSectionProps {
    date: Date
    className?: string
}

const CHART_HEIGHT = 160

function WeightTooltip({ active, payload, label }: {
    active?: boolean
    payload?: Payload<number, string>[]
    label?: string
}) {
    if (!active || !payload?.length) return null
    return (
        <div className={TOOLTIP_CLASS}>
            <p className="mb-1 text-xs font-medium text-fg">{String(label)}</p>
            {payload.map((entry: Payload<number, string>) => (
                <p key={entry.name} className="text-xs text-fg-muted tabular-nums">
                    <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5"
                        style={{ backgroundColor: entry.color }}
                    />
                    {entry.name === 'target' ? t('dashboard.weightSection.targetLabel') : t('dashboard.weightSection.weightLabel')}:{' '}
                    <span className="font-medium">{t('dashboard.weightSection.valueKg', { value: formatDecimal(Number(entry.value)) })}</span>
                </p>
            ))}
        </div>
    )
}

const WeightTrendChart = memo(function WeightTrendChart({
    data,
    targetWeight,
}: {
    data: WeightTrendPoint[]
    targetWeight?: number | null
}) {
    const chartData = useMemo(() =>
        data.map(p => {
            const dateObj = p.date
            const label = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
            return {
                label,
                weight: p.weight,
                target: targetWeight ?? undefined,
            }
        }),
        [data, targetWeight],
    )

    if (data.length < 2) return null

    return (
        <div>
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
                        domain={[
                            (dataMin: number) => {
                                const min = targetWeight != null ? Math.min(dataMin, targetWeight) : dataMin
                                return Math.floor((min - 0.5) * 10) / 10
                            },
                            (dataMax: number) => {
                                const max = targetWeight != null ? Math.max(dataMax, targetWeight) : dataMax
                                return Math.ceil((max + 0.5) * 10) / 10
                            },
                        ]}
                    />
                    <Tooltip content={<WeightTooltip />} />
                    {targetWeight != null && (
                        <ReferenceLine
                            y={targetWeight}
                            stroke={TARGET_STROKE}
                            strokeDasharray="6 3"
                            strokeWidth={1}
                            label={{
                                value: t('dashboard.weightSection.targetWithValue', { weight: formatDecimal(targetWeight) }),
                                position: 'right',
                                fill: chartColor['fg-muted'],
                                fontSize: 11,
                            }}
                        />
                    )}
                    <Line
                        type="monotone"
                        dataKey="weight"
                        stroke={chartColor.fg}
                        strokeWidth={2}
                        dot={{ r: 3, fill: chartColor.fg, strokeWidth: 0 }}
                        connectNulls
                        name="weight"
                    />
                </LineChart>
            </ResponsiveContainer>
            <div className="mt-2 flex items-center gap-4 text-xs text-fg-muted">
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-4 border-t-2 border-fg" aria-hidden="true" />
                    {t('dashboard.weightSection.weightLabel')}
                </span>
                {targetWeight != null && (
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 border-t-2 border-dashed border-fg-subtle" aria-hidden="true" />
                        {t('dashboard.weightSection.targetLabel')}
                    </span>
                )}
            </div>
        </div>
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
            .catch(() => {
                // Молчим намеренно: целевой вес — подпись на графике, а не
                // то, за чем сюда пришли. Без него раздел работает целиком.
            })

        apiClient
            .getRecent<{ weight_trend: Array<{ date: string; weight: number }>; target_weight: number | null }>(
                DASHBOARD_PROGRESS_URL,
                PROGRESS_REUSE_MS,
            )
            .then((raw) => {
                setWeightTrend(
                    (raw.weight_trend || []).map((p) => ({ date: new Date(p.date), weight: p.weight })),
                )
                // Не перебивать то, что уже пришло из профиля. Условие было
                // написано через прочитанное состояние, а эффект выполняется
                // один раз на монтировании: в замыкании там всегда null, и
                // прогресс затирал цель из профиля, если отвечал позже.
                if (raw.target_weight != null) {
                    setTargetWeight((current) => current ?? raw.target_weight)
                }
            })
            .catch(() => {
                // То же самое: тренд — фоновая подгрузка к уже показанному
                // сегодняшнему весу, и её отказ не мешает записать вес.
            })
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

    // Показ — по-русски («67,4»), поле ввода — числом с точкой, как его разбирают.
    const formatWeight = (w: number) => formatDecimal(w)
    const formatWeightInput = (w: number) => (w % 1 === 0 ? w.toString() : w.toFixed(1))

    const debouncedValidate = useDebouncedCallback((value: string) => {
        if (value.trim() === '') { setValidationError(null); return }
        const v = validateWeight(parseFloat(value))
        setValidationError(v.isValid ? null : v.error || t('common.invalidValue'))
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
        if (!inputValue.trim()) { setValidationError(t('dashboard.weight.required')); return }
        const num = parseFloat(inputValue)
        const v = validateWeight(num)
        if (!v.isValid) { setValidationError(v.error || t('common.invalidValue')); return }
        setIsSaving(true)
        setValidationError(null)
        try {
            await updateMetric(dateStr, { type: 'weight', data: { weight: num } })
            // Новый вес меняет тренд — следующий показ прогресса спросит заново
            apiClient.forgetRecent(DASHBOARD_PROGRESS_URL)
            setInputValue('')
            setIsEditing(false)
            toast.success(t('dashboard.weight.saved'))
        } catch (err) {
            setValidationError(messageForOr(err, t('dashboard.weight.saveFailed')))
        } finally {
            setIsSaving(false)
        }
    }, [inputValue, dateStr, updateMetric])

    const handleQuickAdd = useCallback(() => {
        if (isWeightLogged) setInputValue(formatWeightInput(currentWeight))
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
        <Card className={cn('flex flex-col gap-4', className)}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <CardTitle>{t('dashboard.weight.title')}</CardTitle>
                    {showAttention && (
                        <AttentionBadge urgency="normal" ariaLabel={t('dashboard.weight.noneToday')} />
                    )}
                </div>
                <IconButton
                    variant="ghost"
                    onClick={handleQuickAdd}
                    aria-label={isWeightLogged ? t('dashboard.weight.change') : t('dashboard.weight.add')}
                >
                    {isWeightLogged
                        ? <Pencil className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
                        : <Plus className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />}
                </IconButton>
            </div>

            {isEditing ? (
                <div className="space-y-3">
                    <div>
                        <label htmlFor="weight-input" className="sr-only">{t('dashboard.weight.kilograms')}</label>
                        <Input
                            id="weight-input" type="number" inputMode="decimal" step="0.1" min="0.1" max="500"
                            placeholder={t('dashboard.weight.placeholder')} value={inputValue}
                            onChange={(e) => handleInputChange(e.target.value)}
                            onKeyDown={handleKeyPress}
                            error={validationError || undefined}
                            autoFocus aria-label={t('dashboard.weight.kilograms')}
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={handleCancel} disabled={isSaving}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="primary" onClick={handleSave}
                            isLoading={isSaving} disabled={!!validationError || !inputValue.trim()}
                            className="flex-1"
                        >
                            {t('common.save')}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {isWeightLogged ? (
                        <div className="space-y-1.5">
                            <div className="flex items-baseline gap-1">
                                <span className="type-num-xl text-fg">{formatWeight(currentWeight)}</span>
                                <span className="text-base text-fg-muted">{t('dashboard.weight.kg')}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-success-fg">
                                <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                                <span className="text-sm font-medium">{t('dashboard.weightSection.recorded')}</span>
                            </div>
                            {/* Изменение с вчера — нейтрально: хорошо это или нет, зависит от цели */}
                            {weightChange !== null && (
                                <div className="flex items-center gap-1 text-sm text-fg tabular-nums">
                                    {weightChange > 0
                                        ? <TrendingUp className="h-4 w-4 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />
                                        : weightChange < 0
                                            ? <TrendingDown className="h-4 w-4 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />
                                            : <Minus className="h-4 w-4 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />}
                                    <span>{t('dashboard.weightSection.changeSinceYesterday', { sign: weightChange > 0 ? '+' : '', amount: formatWeight(Math.abs(weightChange)) })}</span>
                                </div>
                            )}
                            {targetWeight != null && distanceToTarget != null && (
                                <div className="flex items-center gap-1.5 text-sm text-fg-muted tabular-nums">
                                    <Target className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                                    <span>{t('dashboard.weight.target', { weight: formatWeight(targetWeight) })}</span>
                                    {Math.abs(distanceToTarget) >= 0.1 ? (
                                        <span className="text-fg">
                                            ({distanceToTarget > 0 ? '-' : '+'}{formatWeight(Math.abs(distanceToTarget))} {t('dashboard.weight.kg')})
                                        </span>
                                    ) : (
                                        <span className="font-medium text-success-fg">{t('dashboard.weight.targetReached')}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-sm text-fg-muted">{t('dashboard.workout.empty')}</p>
                            {previousWeight && (
                                <p className="text-sm text-fg-muted tabular-nums">{t('dashboard.weight.yesterday', { weight: formatWeight(previousWeight) })}</p>
                            )}
                            {targetWeight != null && (
                                <div className="flex items-center gap-1.5 text-sm text-fg-muted tabular-nums">
                                    <Target className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                                    <span>{t('dashboard.weight.target', { weight: formatWeight(targetWeight) })}</span>
                                </div>
                            )}
                            <Button variant="secondary" size="sm" onClick={handleQuickAdd}>
                                <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                                {t('common.add')}
                            </Button>
                        </div>
                    )}

                    {/* Тренд за 4 недели — график и изменение числом, без оценки цветом */}
                    {weightTrend.length >= 2 && (
                        <div className="border-t border-line pt-4">
                            <WeightTrendChart data={weightTrend} targetWeight={targetWeight} />
                            {trendChange !== null && (
                                <p className="mt-1 text-sm text-fg-muted tabular-nums">
                                    {t('dashboard.weightSection.trend', { sign: trendChange < 0 ? '' : '+', amount: formatDecimal(trendChange) })}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </Card>
    )
})
