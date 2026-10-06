'use client'

import { useState, useEffect, useCallback, memo, useMemo } from 'react'
import { Plus, Check } from 'lucide-react'
import { color } from '@burcev/design-tokens'
import { Card, CardTitle } from '@/shared/components/ui/Card'
import { Button, IconButton } from '@/shared/components/ui/Button'
import { ProgressBar } from '@/shared/components/ui/ProgressBar'
import { cn } from '@/shared/utils/cn'
import { formatLocalDate } from '@/shared/utils/format'
import { apiClient } from '@/shared/utils/api-client'
import { AttentionBadge } from './AttentionBadge'
import toast from 'react-hot-toast'
import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'

export interface WaterBlockProps {
    date: Date
    className?: string
}

export const WaterBlock = memo(function WaterBlock({ date, className }: WaterBlockProps) {
    const [glasses, setGlasses] = useState(0)
    const [goal, setGoal] = useState(8)
    const [glassSize, setGlassSize] = useState(250)
    const [isAdding, setIsAdding] = useState(false)
    const [enabled, setEnabled] = useState<boolean | null>(null)

    const dateStr = formatLocalDate(date)

    const percentage = useMemo(() => goal > 0 ? Math.round((glasses / goal) * 100) : 0, [glasses, goal])
    const isGoalReached = glasses >= goal

    const handleAddGlass = useCallback(async () => {
        setIsAdding(true)
        const prevGlasses = glasses
        setGlasses(g => g + 1)

        try {
            const result = await apiClient.post<{ glasses: number; goal: number; glass_size: number }>(
                '/api/v1/food-tracker/water',
                { date: dateStr, glasses: 1 }
            )
            setGlasses(result.glasses)
            toast.success(t('dashboard.water.added'))
        } catch (err) {
            setGlasses(prevGlasses)
            // Счётчик уже откатился назад: без причины это выглядит как
            // «кнопка не сработала», хотя сервер сказал, почему не принял.
            toast.error(messageForOr(err, t('dashboard.water.addFailed')))
        } finally {
            setIsAdding(false)
        }
    }, [dateStr, glasses])

    useEffect(() => {
        apiClient.get<{ glasses: number; goal: number; glass_size: number; enabled: boolean }>(
            `/api/v1/food-tracker/water?date=${dateStr}`
        )
            .then(data => {
                setGlasses(data.glasses)
                setGoal(data.goal)
                setGlassSize(data.glass_size)
                setEnabled(data.enabled)
            })
            .catch(() => {
                // Молчим намеренно: это фоновая подгрузка необязательного
                // блока, а не действие человека. Не прочиталось — блок не
                // появляется; тост про воду поверх дневника в момент открытия
                // сообщал бы о том, чего никто не делал.
            })
    }, [dateStr])

    if (enabled === false) return null
    if (enabled === null) return null

    const isToday = dateStr === formatLocalDate(new Date())
    const showAttention = isToday && glasses === 0

    // Вода — в языке карточки питания: стаканы главным числом, полоса цветом
    // воды (цвет опознаёт показатель и не меняется при достижении цели).
    return (
        <Card className={cn('flex h-full flex-col gap-4', className)}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <CardTitle>{t('dashboard.water.title')}</CardTitle>
                    {showAttention && (
                        <AttentionBadge urgency="normal" ariaLabel={t('dashboard.water.noneToday')} />
                    )}
                </div>
                <IconButton
                    variant="ghost"
                    onClick={handleAddGlass}
                    disabled={isAdding}
                    aria-busy={isAdding}
                    aria-label={t('dashboard.water.addGlassAria')}
                >
                    <Plus className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                </IconButton>
            </div>

            {glasses > 0 ? (
                <div className="space-y-2" role="region" aria-label={t('dashboard.water.progressRegion')}>
                    <div className="flex items-baseline gap-2">
                        <span className="type-num-l text-fg">
                            {glasses}/{goal}
                        </span>
                        <span className="text-sm text-fg-muted tabular-nums">
                            {t('dashboard.water.glassesOf', { size: glassSize })}
                        </span>
                    </div>
                    <ProgressBar
                        value={Math.min(glasses, goal)}
                        max={goal}
                        color={color.water}
                        label={t('dashboard.water.progressAria', { percentage })}
                    />
                    {isGoalReached ? (
                        <div className="flex items-center gap-1.5 text-success-fg" role="status">
                            <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                            <span className="text-sm font-medium">{t('dashboard.water.goalReached')}</span>
                        </div>
                    ) : (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleAddGlass}
                            isLoading={isAdding}
                            aria-label={t('dashboard.water.addGlassAria')}
                        >
                            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                            {t('common.add')}
                        </Button>
                    )}
                </div>
            ) : (
                <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-fg-muted">{t('dashboard.water.empty')}</p>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleAddGlass}
                        isLoading={isAdding}
                        aria-label={t('dashboard.water.addGlassAria')}
                    >
                        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        {t('common.add')}
                    </Button>
                </div>
            )}

            <p className="mt-auto type-caption text-fg-subtle">
                {t('dashboard.water.goal', { goal })}
            </p>
        </Card>
    )
})
