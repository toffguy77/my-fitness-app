'use client'

import { useEffect, useReducer, useState, useRef, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
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
import type { ClientDetail, WeightHistoryPoint } from '@/features/curator/types'

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
    if (lastTwo >= 11 && lastTwo <= 19) return `${age} лет`
    if (lastOne === 1) return `${age} год`
    if (lastOne >= 2 && lastOne <= 4) return `${age} года`
    return `${age} лет`
}

const SEX_LABELS: Record<string, string> = { male: 'М', female: 'Ж' }

const ACTIVITY_LABELS: Record<string, string> = {
    sedentary: 'Сидячий',
    lightly_active: 'Лёгкая активность',
    moderately_active: 'Умеренная активность',
    very_active: 'Высокая активность',
    extra_active: 'Экстра активность',
}

const GOAL_LABELS: Record<string, string> = {
    lose: 'Снижение веса',
    maintain: 'Поддержание',
    gain: 'Набор массы',
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
        <p className="text-xs text-gray-500 mb-4 ml-12">
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
const AXIS_STYLE = { fontSize: 11, fill: '#9ca3af' }
const GRID_STROKE = '#f0f0f0'

function CuratorWeightTooltip({ active, payload, label }: {
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
                    Вес: <span className="font-medium">{Number(entry.value).toFixed(1)} кг</span>
                </p>
            ))}
        </div>
    )
}

function WeightChart({ data, targetWeight }: { data: WeightHistoryPoint[]; targetWeight?: number | null }) {
    const chartData = useMemo(() =>
        data.map(p => {
            const dateObj = new Date(p.date + 'T00:00:00')
            const label = isNaN(dateObj.getTime())
                ? p.date
                : dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
            return { label, weight: p.weight }
        }),
        [data],
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
                        stroke="#e5e7eb"
                        tickLine={false}
                    />
                    <YAxis
                        tick={AXIS_STYLE}
                        stroke="#e5e7eb"
                        tickLine={false}
                        width={50}
                        domain={['dataMin - 0.5', 'dataMax + 0.5']}
                    />
                    <Tooltip content={<CuratorWeightTooltip />} />
                    {targetWeight != null && (
                        <ReferenceLine
                            y={targetWeight}
                            stroke="#22c55e"
                            strokeDasharray="6 3"
                            strokeWidth={1}
                            label={{
                                value: `Цель ${targetWeight}`,
                                position: 'right',
                                fill: '#22c55e',
                                fontSize: 11,
                            }}
                        />
                    )}
                    <Line
                        type="monotone"
                        dataKey="weight"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
                        connectNulls
                        name="weight"
                    />
                </LineChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-4 border-t-2 border-blue-500" />
                    Вес
                </span>
                {targetWeight != null && (
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 border-t-2 border-dashed border-green-500" />
                        Цель
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
        } catch {
            // silently fail for now
        } finally {
            setSaving(false)
        }
    }

    return (
        <section className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">Динамика веса</h2>
                {detail.last_weight != null && (
                    <span className="text-sm font-semibold text-gray-900">{detail.last_weight} кг</span>
                )}
            </div>

            {hasWeightData && (
                <WeightChart data={detail.weight_history} targetWeight={currentTarget} />
            )}

            <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="text-gray-500">Цель:</span>
                {editing ? (
                    <div className="flex items-center gap-1">
                        <input
                            type="number"
                            step="0.1"
                            min="20"
                            max="500"
                            value={targetInput}
                            onChange={(e) => setTargetInput(e.target.value)}
                            className="w-20 rounded border border-gray-300 px-2 py-1 text-xs"
                            autoFocus
                        />
                        <button type="button" onClick={handleSaveTarget} disabled={saving} className="p-1 text-green-600 hover:bg-green-50 rounded">
                            <Check className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => setEditing(false)} className="p-1 text-gray-400 hover:bg-gray-50 rounded">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => { setTargetInput(String(currentTarget ?? '')); setEditing(true) }}
                        className="text-blue-600 hover:underline"
                    >
                        {currentTarget != null ? `${currentTarget} кг` : 'Установить'}
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
        } catch {
            // silently fail for now
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
        } catch {
            // silently fail for now
        } finally {
            setSaving(false)
        }
    }

    return (
        <section className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-3">
                <Droplets className="h-4 w-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-gray-900">Цель по воде</h2>
            </div>
            <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">Стаканов в день:</span>
                {editing ? (
                    <div className="flex items-center gap-1">
                        <input
                            type="number"
                            step="1"
                            min="1"
                            max="30"
                            value={goalInput}
                            onChange={(e) => setGoalInput(e.target.value)}
                            className="w-16 rounded border border-gray-300 px-2 py-1 text-xs"
                            autoFocus
                        />
                        <button type="button" onClick={handleSaveGoal} disabled={saving} className="p-1 text-green-600 hover:bg-green-50 rounded">
                            <Check className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => setEditing(false)} className="p-1 text-gray-400 hover:bg-gray-50 rounded">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => { setGoalInput(String(currentGoal ?? '')); setEditing(true) }}
                            className="text-blue-600 hover:underline"
                        >
                            {currentGoal != null ? `${currentGoal} стаканов` : 'Установить'}
                        </button>
                        {currentGoal != null && (
                            <button
                                type="button"
                                onClick={handleRemoveGoal}
                                disabled={saving}
                                className="text-red-400 hover:text-red-600 hover:underline"
                            >
                                Убрать
                            </button>
                        )}
                    </div>
                )}
            </div>
            {currentGoal == null && (
                <p className="mt-2 text-[11px] text-gray-400">Блок воды скрыт у клиента. Задайте цель, чтобы включить.</p>
            )}
        </section>
    )
}

export default function ClientDetailPage() {
    const router = useRouter()
    const params = useParams()
    const clientId = Number(params.id)
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
                    dispatch({ type: 'FETCH_ERROR', error: 'Не удалось загрузить данные клиента' })
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
        <div className="px-4 py-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-2">
                <button
                    type="button"
                    onClick={() => router.push('/curator')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
                    aria-label="Назад"
                >
                    <ArrowLeft className="h-5 w-5 text-gray-700" />
                </button>

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
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
                                {initials}
                            </div>
                        )}
                        <span className="flex-1 text-lg font-semibold text-gray-900 truncate">
                            {detail.name}
                        </span>
                    </>
                )}

                <button
                    type="button"
                    onClick={() => router.push(`/curator/chat/${clientId}`)}
                    className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                    <MessageCircle className="h-4 w-4" />
                    Написать
                </button>
            </div>

            {detail && (
                <div className="mb-4 ml-12">
                    <ClientInfoPanel detail={detail} />
                </div>
            )}

            {detail && <ProfileInfoRow detail={detail} />}

            {loading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
            )}

            {error && (
                <p className="py-8 text-center text-sm text-red-500">{error}</p>
            )}

            {!loading && !error && detail && (
                <div className="space-y-4">
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
                        <section className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                            <h2 className="text-sm font-semibold text-gray-900 mb-2">Недельный план</h2>
                            <div className="grid grid-cols-4 gap-2 text-center text-xs">
                                <div>
                                    <p className="text-gray-500">Ккал</p>
                                    <p className="font-semibold text-gray-900">{Math.round(detail.weekly_plan.calories)}</p>
                                </div>
                                <div>
                                    <p className="text-gray-500">Белки</p>
                                    <p className="font-semibold text-gray-900">{Math.round(detail.weekly_plan.protein)}</p>
                                </div>
                                <div>
                                    <p className="text-gray-500">Жиры</p>
                                    <p className="font-semibold text-gray-900">{Math.round(detail.weekly_plan.fat)}</p>
                                </div>
                                <div>
                                    <p className="text-gray-500">Углеводы</p>
                                    <p className="font-semibold text-gray-900">{Math.round(detail.weekly_plan.carbs)}</p>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* KBJU weekly chart */}
                    {kbjuHistory.length > 0 && (
                        <KBJUWeeklyChart data={kbjuHistory} />
                    )}

                    {/* Питание: last 3 days + "Ранее" */}
                    <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-gray-900">Питание</h2>
                        {recentDays.map((day) => (
                            <DaySection key={day.date} day={day} />
                        ))}

                        {olderDays.length > 0 && (
                            <>
                                {!showOlderDays ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowOlderDays(true)}
                                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                                    >
                                        <ChevronDown className="h-3.5 w-3.5" />
                                        Ранее ({olderDays.length} дн.)
                                    </button>
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
                </div>
            )}
        </div>
    )
}
