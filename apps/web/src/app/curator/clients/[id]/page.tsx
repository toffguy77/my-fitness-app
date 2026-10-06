'use client'

import { useEffect, useReducer, useState, useRef, useMemo } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, MessageCircle, Loader2, Check, X, ChevronDown, Droplets } from 'lucide-react'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { Payload } from 'recharts/types/component/DefaultTooltipContent'
import { curatorApi } from '@/features/curator/api/curatorApi'
import { getClientHistory } from '@/features/nutrition-calc/api/nutritionCalc'
import { KBJUWeeklyChart } from '@/features/nutrition-calc/components/KBJUWeeklyChart'
import type { TargetVsActual } from '@/features/nutrition-calc/types'
import { AlertBadge } from '@/features/curator/components/AlertBadge'
import { DaySection } from '@/features/curator/components/DaySection'
import { StepsChart } from '@/features/curator/components/StepsChart'
import { WaterChart } from '@/features/curator/components/WaterChart'
import { WorkoutsSection } from '@/features/curator/components/WorkoutsSection'
import { PhotosSection } from '@/features/curator/components/PhotosSection'
import { ClientInfoPanel } from '@/features/curator/components/ClientInfoPanel'
import { ClientDetailTabs } from '@/features/curator/components/ClientDetailTabs'
import { ClientNoticesSection } from '@/features/curator/components/ClientNoticesSection'
import { PlanTab } from '@/features/curator/components/PlanTab'
import { TasksTab } from '@/features/curator/components/TasksTab'
import { ReportsTab } from '@/features/curator/components/ReportsTab'
import type { ClientDetail, WeightHistoryPoint } from '@/features/curator/types'
import type { TabId } from '@/features/curator/components/ClientDetailTabs'

import { t } from '@/shared/i18n'
import toast from 'react-hot-toast'
import { messageForOr } from '@/shared/errors/apiErrors'
import { AXIS_STYLE, GRID_STROKE, TOOLTIP_CLASS, chartColor } from '@/shared/charts/chartTheme'
import { Button, IconButton } from '@/shared/components/ui/Button'
import { Card, CardTitle } from '@/shared/components/ui/Card'
import { MACRO_TEXT_COLORS } from '@/shared/constants/macros'
import { cn } from '@/shared/utils/cn'

/** Поле правки числа прямо в карточке: 44 px, текст 16 px. */
const INLINE_FIELD =
    'h-11 rounded-field border border-line bg-surface px-3 text-base tabular-nums text-fg ' +
    'focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30'

/** Ссылка-действие внутри карточки. */
const ACTION_LINK = 'inline-flex min-h-11 items-center font-semibold text-primary hover:underline disabled:opacity-50'
const RECENT_DAYS_COUNT = 3

function calcAge(birthDate: string): number | null {
    const birth = new Date(birthDate)
    if (isNaN(birth.getTime())) return null
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--
    }
    return age
}

function formatAge(age: number): string {
    const lastTwo = age % 100
    const lastOne = age % 10
    // The rule is the i18n module's; this function only picks the noun.
    if (lastTwo >= 11 && lastTwo <= 19) return t('curator.ageYearsMany', { age })
    if (lastOne === 1) return t('curator.ageYearsOne', { age })
    if (lastOne >= 2 && lastOne <= 4) return t('curator.ageYearsFew', { age })
    return t('curator.ageYearsMany', { age })
}

const SEX_LABELS: Record<string, string> = { male: t('curator.sexMale'), female: t('curator.sexFemale') }

const ACTIVITY_LABELS: Record<string, string> = {
    sedentary: t('curator.activity.sedentary'),
    lightly_active: t('curator.activity.lightly_active'),
    moderately_active: t('curator.activity.moderately_active'),
    very_active: t('curator.activity.very_active'),
    extra_active: t('curator.activity.extra_active'),
}

const GOAL_LABELS: Record<string, string> = {
    lose: t('curator.goal.lose'),
    maintain: t('curator.goal.maintain'),
    gain: t('curator.goal.gain'),
}

function ProfileInfoRow({ detail }: { detail: ClientDetail }) {
    const parts: string[] = []

    if (detail.birth_date) {
        const age = calcAge(detail.birth_date)
        if (age != null && age > 0) parts.push(formatAge(age))
    }
    if (detail.biological_sex) {
        parts.push(SEX_LABELS[detail.biological_sex] ?? detail.biological_sex)
    }
    if (detail.activity_level) {
        parts.push(ACTIVITY_LABELS[detail.activity_level] ?? detail.activity_level)
    }
    if (detail.fitness_goal) {
        parts.push(GOAL_LABELS[detail.fitness_goal] ?? detail.fitness_goal)
    }

    if (parts.length === 0) return null

    return (
        <p className="mb-4 text-sm text-fg-muted sm:ml-14">
            {parts.join(' · ')}
        </p>
    )
}

type FetchState = {
    detail: ClientDetail | null
    loading: boolean
    error: string | null
}

type FetchAction =
    | { type: 'FETCH_START' }
    | { type: 'FETCH_SUCCESS'; data: ClientDetail }
    | { type: 'FETCH_ERROR'; error: string }

function fetchReducer(state: FetchState, action: FetchAction): FetchState {
    switch (action.type) {
        case 'FETCH_START':
            return { ...state, loading: true, error: null }
        case 'FETCH_SUCCESS':
            return { detail: action.data, loading: false, error: null }
        case 'FETCH_ERROR':
            return { ...state, loading: false, error: action.error }
    }
}

const CHART_HEIGHT = 160

function CuratorWeightTooltip({ active, payload, label }: {
    active?: boolean
    payload?: Payload<number, string>[]
    label?: string
}) {
    if (!active || !payload?.length) return null
    return (
        <div className={TOOLTIP_CLASS}>
            <p className="text-xs font-medium text-fg mb-1">{String(label)}</p>
            {payload.map((entry: Payload<number, string>) => (
                <p key={entry.name} className="text-xs tabular-nums text-fg-muted">
                    <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5"
                        style={{ backgroundColor: entry.color }}
                    />
                    {t('curator.client.weightWithValue', { weight: Number(entry.value).toFixed(1) })}
                </p>
            ))}
        </div>
    )
}

function WeightChart({ data, targetWeight }: { data: WeightHistoryPoint[]; targetWeight?: number | null }) {
    const chartData = useMemo(() => {
        const formatDate = (d: string) => {
            const dateObj = new Date(d + 'T00:00:00')
            return isNaN(dateObj.getTime())
                ? d
                : dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
        }

        const points = data.map(p => ({ label: formatDate(p.date), weight: p.weight }))

        // Extend X axis to today if last data point is before today
        if (data.length > 0) {
            const today = new Date().toISOString().slice(0, 10)
            const lastDate = data[data.length - 1].date
            if (lastDate < today) {
                points.push({ label: formatDate(today), weight: data[data.length - 1].weight })
            }
        }

        return points
    }, [data])

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
                        domain={['dataMin - 0.5', 'dataMax + 0.5']}
                    />
                    <Tooltip content={<CuratorWeightTooltip />} />
                    {targetWeight != null && (
                        <ReferenceLine
                            y={targetWeight}
                            stroke={chartColor.success}
                            strokeDasharray="6 3"
                            strokeWidth={1}
                            label={{
                                value: t('curator.client.targetWithValue', { weight: targetWeight }),
                                position: 'right',
                                fill: chartColor['success-fg'],
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
            <div className="mt-2 flex items-center gap-4 text-[13px] text-fg-muted">
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-4 border-t-2 border-fg" aria-hidden="true" />
                    {t('curator.client.weight')}
                </span>
                {targetWeight != null && (
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 border-t-2 border-dashed border-success" aria-hidden="true" />
                        {t('curator.client.target')}
                    </span>
                )}
            </div>
        </div>
    )
}

function WeightSection({ detail, clientId }: { detail: ClientDetail; clientId: number }) {
    const [editing, setEditing] = useState(false)
    const [targetInput, setTargetInput] = useState('')
    const [saving, setSaving] = useState(false)
    const [currentTarget, setCurrentTarget] = useState(detail.target_weight)

    const hasWeightData = detail.weight_history && detail.weight_history.length > 0

    if (!hasWeightData && detail.last_weight == null) return null

    const handleSaveTarget = async () => {
        const val = parseFloat(targetInput)
        if (isNaN(val) || val < 20 || val > 500) return
        setSaving(true)
        try {
            await curatorApi.setTargetWeight(clientId, val)
            setCurrentTarget(val)
            setEditing(false)
        } catch (err) {
            // Раньше здесь молчали, и комментарий это признавал прямым
            // текстом: поле оставалось открытым с введённым числом, и куратор
            // не знал, сохранилось оно или нет. Поле остаётся открытым и
            // теперь — но с причиной, по которой стоит повторить или не стоит.
            toast.error(messageForOr(err, t('curator.client.targetSaveFailed')))
        } finally {
            setSaving(false)
        }
    }

    return (
        <section className="rounded-card border border-line bg-surface p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="type-title-3 text-fg">{t('curator.client.weightDynamics')}</h2>
                {detail.last_weight != null && (
                    <span className="type-num-l tabular-nums text-fg">{t('curator.client.kilograms', { value: detail.last_weight })}</span>
                )}
            </div>

            {hasWeightData && (
                <WeightChart data={detail.weight_history} targetWeight={currentTarget} />
            )}

            <div className="mt-3 flex min-h-11 flex-wrap items-center gap-2 text-sm">
                <span className="text-fg-muted">{t('curator.client.targetLabel')}</span>
                {editing ? (
                    <div className="flex items-center gap-1">
                        <input
                            type="number"
                            step="0.1"
                            min="20"
                            max="500"
                            value={targetInput}
                            onChange={(e) => setTargetInput(e.target.value)}
                            className={cn(INLINE_FIELD, 'w-24')}
                            inputMode="decimal"
                            autoFocus
                        />
                        <IconButton variant="ghost" onClick={handleSaveTarget} disabled={saving} aria-label={t('common.save')} className="text-success-fg hover:bg-success-soft">
                            <Check className="h-5 w-5" aria-hidden="true" />
                        </IconButton>
                        <IconButton variant="ghost" onClick={() => setEditing(false)} aria-label={t('common.cancel')} className="text-fg-muted">
                            <X className="h-5 w-5" aria-hidden="true" />
                        </IconButton>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => { setTargetInput(String(currentTarget ?? '')); setEditing(true) }}
                        className={cn(ACTION_LINK, 'tabular-nums')}
                    >
                        {currentTarget != null ? t('curator.client.kilograms', { value: currentTarget }) : t('curator.client.setValue')}
                    </button>
                )}
            </div>
        </section>
    )
}

function WaterGoalSection({ detail, clientId }: { detail: ClientDetail; clientId: number }) {
    const [editing, setEditing] = useState(false)
    const [goalInput, setGoalInput] = useState('')
    const [saving, setSaving] = useState(false)
    const [currentGoal, setCurrentGoal] = useState(detail.water_goal)

    const handleSaveGoal = async () => {
        const val = parseInt(goalInput, 10)
        if (isNaN(val) || val < 1 || val > 30) return
        setSaving(true)
        try {
            await curatorApi.setWaterGoal(clientId, val)
            setCurrentGoal(val)
            setEditing(false)
        } catch (err) {
            toast.error(messageForOr(err, t('curator.client.waterGoalSaveFailed')))
        } finally {
            setSaving(false)
        }
    }

    const handleRemoveGoal = async () => {
        setSaving(true)
        try {
            await curatorApi.setWaterGoal(clientId, null)
            setCurrentGoal(null)
            setEditing(false)
        } catch (err) {
            toast.error(messageForOr(err, t('curator.client.waterGoalSaveFailed')))
        } finally {
            setSaving(false)
        }
    }

    return (
        <section className="rounded-card border border-line bg-surface p-5">
            <div className="mb-2 flex items-center gap-2">
                <Droplets className="h-5 w-5 text-water" strokeWidth={1.8} aria-hidden="true" />
                <h2 className="type-title-3 text-fg">{t('curator.client.waterGoal')}</h2>
            </div>
            <div className="flex min-h-11 flex-wrap items-center gap-2 text-sm">
                <span className="text-fg-muted">{t('curator.client.glassesPerDay')}</span>
                {editing ? (
                    <div className="flex items-center gap-1">
                        <input
                            type="number"
                            step="1"
                            min="1"
                            max="30"
                            value={goalInput}
                            onChange={(e) => setGoalInput(e.target.value)}
                            className={cn(INLINE_FIELD, 'w-20')}
                            inputMode="numeric"
                            autoFocus
                        />
                        <IconButton variant="ghost" onClick={handleSaveGoal} disabled={saving} aria-label={t('common.save')} className="text-success-fg hover:bg-success-soft">
                            <Check className="h-5 w-5" aria-hidden="true" />
                        </IconButton>
                        <IconButton variant="ghost" onClick={() => setEditing(false)} aria-label={t('common.cancel')} className="text-fg-muted">
                            <X className="h-5 w-5" aria-hidden="true" />
                        </IconButton>
                    </div>
                ) : (
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => { setGoalInput(String(currentGoal ?? '')); setEditing(true) }}
                            className={cn(ACTION_LINK, 'tabular-nums')}
                        >
                            {currentGoal != null ? t('curator.client.glassesValue', { count: currentGoal }) : t('curator.client.setValue')}
                        </button>
                        {currentGoal != null && (
                            <button
                                type="button"
                                onClick={handleRemoveGoal}
                                disabled={saving}
                                className="inline-flex min-h-11 items-center font-medium text-danger-fg hover:underline disabled:opacity-50"
                            >
                                {t('curator.client.remove')}
                            </button>
                        )}
                    </div>
                )}
            </div>
            {currentGoal == null && (
                <p className="mt-1 text-[13px] text-fg-subtle">{t('curator.client.waterHidden')}</p>
            )}
        </section>
    )
}

export default function ClientDetailPage() {
    const router = useRouter()
    const params = useParams()
    const searchParams = useSearchParams()
    const clientId = Number(params.id)
    const activeTab = (searchParams.get('tab') as TabId) || 'overview'
    const [state, dispatch] = useReducer(fetchReducer, { detail: null, loading: true, error: null })
    const [showOlderDays, setShowOlderDays] = useState(false)
    const [kbjuHistory, setKbjuHistory] = useState<TargetVsActual[]>([])
    const fetchIdRef = useRef(0)

    useEffect(() => {
        const fetchId = ++fetchIdRef.current
        dispatch({ type: 'FETCH_START' })
        curatorApi.getClientDetail(clientId)
            .then((data) => {
                if (fetchIdRef.current === fetchId) {
                    dispatch({ type: 'FETCH_SUCCESS', data })
                }
            })
            .catch(() => {
                if (fetchIdRef.current === fetchId) {
                    dispatch({ type: 'FETCH_ERROR', error: t('curator.client.loadFailed') })
                }
            })
        getClientHistory(clientId)
            .then((res) => {
                if (fetchIdRef.current === fetchId) {
                    setKbjuHistory(res.days)
                }
            })
            .catch(() => {
                // non-critical, ignore
            })
    }, [clientId])

    const { detail, loading, error } = state

    const initials = detail
        ? detail.name
            .split(' ')
            .map((part) => part[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()
        : ''

    const recentDays = detail?.days.slice(0, RECENT_DAYS_COUNT) ?? []
    const olderDays = detail?.days.slice(RECENT_DAYS_COUNT) ?? []

    return (
        <div className="mx-auto w-full max-w-5xl px-screen-x py-5">
            {/* Header */}
            <div className="mb-2 flex items-center gap-3">
                <IconButton
                    variant="ghost"
                    onClick={() => router.push('/curator')}
                    aria-label={t('common.back')}
                    className="-ml-2"
                >
                    <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                </IconButton>

                {detail && (
                    <>
                        {detail.avatar_url ? (
                            <Image
                                src={detail.avatar_url}
                                alt={detail.name}
                                width={40}
                                height={40}
                                className="h-10 w-10 rounded-full object-cover"
                                unoptimized
                            />
                        ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-subtle text-sm font-semibold text-fg-muted" aria-hidden="true">
                                {initials}
                            </div>
                        )}
                        <h1 className="type-title-2 min-w-0 flex-1 truncate text-fg sm:type-title-1">
                            {detail.name}
                        </h1>
                    </>
                )}

                {/* Переход в переписку — контуром: главное действие на
                    вкладках плана и задач — плавающая кнопка создания. */}
                <Button
                    type="button"
                    variant="secondary"
                    onClick={() => router.push(`/curator/chat/${clientId}`)}
                    className="ml-auto shrink-0"
                >
                    <MessageCircle className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                    {t('curator.client.write')}
                </Button>
            </div>

            {detail && (
                <div className="mb-2 sm:ml-14">
                    <ClientInfoPanel detail={detail} />
                </div>
            )}

            {detail && <ProfileInfoRow detail={detail} />}

            {/* Tab navigation */}
            <ClientDetailTabs activeTab={activeTab} />

            {loading && (
                <div className="flex items-center justify-center py-12" role="status">
                    <Loader2 className="h-6 w-6 animate-spin text-fg-subtle" aria-hidden="true" />
                    <span className="sr-only">{t('common.loading')}</span>
                </div>
            )}

            {error && (
                <p className="py-8 text-center text-sm text-danger-fg" role="alert">{error}</p>
            )}

            {!loading && !error && detail && (
                <>
                    {activeTab === 'overview' && (
                        <div className="mt-5 space-y-4">
                            {/* Mini summary */}
                            <div className="flex flex-wrap items-center gap-2 text-[13px]">
                                {detail.streak_days != null && detail.streak_days > 0 && (
                                    <span className="rounded-full bg-success-soft px-2.5 py-1 font-medium tabular-nums text-success-fg">
                                        {t('curator.client.streak', { days: detail.streak_days })}
                                    </span>
                                )}
                                {detail.weight_trend && detail.weight_trend.length > 0 && (
                                    <span className="rounded-full bg-subtle px-2.5 py-1 font-medium text-fg">
                                        {t('curator.client.weightTrend', { trend: detail.weight_trend === 'down' ? t('curator.client.trendDown') : detail.weight_trend === 'up' ? t('curator.client.trendUp') : t('curator.client.trendStable') })}
                                    </span>
                                )}
                            </div>

                            {/* Today's alerts summary */}
                            {detail.alerts.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {detail.alerts.map((alert, idx) => (
                                        <AlertBadge key={idx} level={alert.level} message={alert.message} />
                                    ))}
                                </div>
                            )}

                            {/* Weekly plan summary */}
                            {detail.weekly_plan && (
                                <Card>
                                    <CardTitle className="mb-3 text-fg">{t('curator.client.weeklyPlan')}</CardTitle>
                                    <dl className="grid grid-cols-4 gap-2 text-center">
                                        <div>
                                            <dt className="text-xs text-fg-muted">{t('macros.calories')}</dt>
                                            <dd className="type-num-l tabular-nums text-fg">{Math.round(detail.weekly_plan.calories)}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs text-fg-muted">{t('macros.protein')}</dt>
                                            <dd className="type-num-l tabular-nums" style={{ color: MACRO_TEXT_COLORS.protein }}>{Math.round(detail.weekly_plan.protein)}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs text-fg-muted">{t('macros.fat')}</dt>
                                            <dd className="type-num-l tabular-nums" style={{ color: MACRO_TEXT_COLORS.fat }}>{Math.round(detail.weekly_plan.fat)}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs text-fg-muted">{t('macros.carbs')}</dt>
                                            <dd className="type-num-l tabular-nums" style={{ color: MACRO_TEXT_COLORS.carbs }}>{Math.round(detail.weekly_plan.carbs)}</dd>
                                        </div>
                                    </dl>
                                </Card>
                            )}

                            {/* KBJU weekly chart */}
                            {kbjuHistory.length > 0 && (
                                <KBJUWeeklyChart data={kbjuHistory} />
                            )}

                            {/* Питание: last 3 days + "Ранее" */}
                            <div className="space-y-3">
                                <h2 className="type-title-2 pt-2 text-fg">{t('curator.client.nutrition')}</h2>
                                {recentDays.map((day) => (
                                    <DaySection key={day.date} day={day} />
                                ))}

                                {olderDays.length > 0 && (
                                    <>
                                        {!showOlderDays ? (
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                block
                                                onClick={() => setShowOlderDays(true)}
                                            >
                                                <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                                {t('curator.client.earlier', { count: olderDays.length })}
                                            </Button>
                                        ) : (
                                            olderDays.map((day) => (
                                                <DaySection key={day.date} day={day} />
                                            ))
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Dynamics sections: weight, steps, workouts */}
                            <WeightSection detail={detail} clientId={clientId} />
                            <StepsChart days={detail.days} />
                            <WaterChart days={detail.days} />
                            <WaterGoalSection detail={detail} clientId={clientId} />
                            <WorkoutsSection days={detail.days} />

                            {/* Photos section */}
                            <PhotosSection photos={detail.photos} />

                            {/* What the client was told, and how it reached them */}
                            <ClientNoticesSection clientId={clientId} />
                        </div>
                    )}

                    {activeTab === 'plan' && (
                        <div className="mt-5">
                            <PlanTab clientId={clientId} />
                        </div>
                    )}

                    {activeTab === 'tasks' && (
                        <div className="mt-5">
                            <TasksTab clientId={clientId} />
                        </div>
                    )}

                    {activeTab === 'reports' && (
                        <div className="mt-5">
                            <ReportsTab clientId={clientId} />
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
