'use client'

import { useEffect, useReducer, useState, useRef, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, MessageCircle, Loader2, Check, X } from 'lucide-react'
import { curatorApi } from '@/features/curator/api/curatorApi'
import { KBZHUProgress } from '@/features/curator/components/KBZHUProgress'
import { AlertBadge } from '@/features/curator/components/AlertBadge'
import type { ClientDetail, FoodEntryView, WeightHistoryPoint } from '@/features/curator/types'

const MEAL_LABELS: Record<string, string> = {
    breakfast: 'Завтрак',
    lunch: 'Обед',
    dinner: 'Ужин',
    snack: 'Перекус',
}

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack']

function groupByMeal(entries: FoodEntryView[]): Record<string, FoodEntryView[]> {
    const grouped: Record<string, FoodEntryView[]> = {}
    for (const entry of entries) {
        const key = entry.meal_type
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(entry)
    }
    return grouped
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

const CHART_PADDING = { top: 10, right: 10, bottom: 20, left: 40 }

function WeightChart({ data, targetWeight }: { data: WeightHistoryPoint[]; targetWeight?: number | null }) {
    const width = 300
    const height = 120
    const padding = CHART_PADDING
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    const { minW, maxW, range } = useMemo(() => {
        const weights = data.map(d => d.weight)
        if (targetWeight != null) weights.push(targetWeight)
        const min = Math.min(...weights)
        const max = Math.max(...weights)
        return { minW: min, maxW: max, range: max - min || 1 }
    }, [data, targetWeight])

    const points = useMemo(() =>
        data.map((p, i) => ({
            x: padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth,
            y: padding.top + chartHeight - ((p.weight - minW) / range) * chartHeight,
            weight: p.weight,
            date: p.date,
        })),
        [data, minW, range, chartWidth, chartHeight, padding.left, padding.top]
    )

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
            <line x1={padding.left} y1={padding.top + chartHeight / 2} x2={width - padding.right} y2={padding.top + chartHeight / 2} stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-gray-200" />
            {targetWeight != null && (
                <>
                    <line x1={padding.left} y1={padding.top + chartHeight - ((targetWeight - minW) / range) * chartHeight} x2={width - padding.right} y2={padding.top + chartHeight - ((targetWeight - minW) / range) * chartHeight} stroke="currentColor" strokeWidth="1" strokeDasharray="6 3" className="text-green-500" />
                    <text x={width - padding.right} y={padding.top + chartHeight - ((targetWeight - minW) / range) * chartHeight - 4} textAnchor="end" className="text-[9px] fill-green-500">Цель {targetWeight}</text>
                </>
            )}
            {points.length > 1 && <path d={pathD} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500" />}
            {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="3" fill="currentColor" className="text-blue-500">
                    <title>{`${p.date}: ${p.weight} кг`}</title>
                </circle>
            ))}
            <text x={padding.left - 5} y={padding.top + 4} textAnchor="end" className="text-[10px] fill-gray-400">{maxW.toFixed(1)}</text>
            <text x={padding.left - 5} y={padding.top + chartHeight} textAnchor="end" className="text-[10px] fill-gray-400">{minW.toFixed(1)}</text>
        </svg>
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

export default function ClientDetailPage() {
    const router = useRouter()
    const params = useParams()
    const clientId = Number(params.id)
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [state, dispatch] = useReducer(fetchReducer, { detail: null, loading: true, error: null })
    const fetchIdRef = useRef(0)

    useEffect(() => {
        const fetchId = ++fetchIdRef.current
        dispatch({ type: 'FETCH_START' })
        curatorApi.getClientDetail(clientId, date)
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
    }, [clientId, date])

    const { detail, loading, error } = state

    const initials = detail
        ? detail.name
            .split(' ')
            .map((part) => part[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()
        : ''

    const hasPlan = detail?.plan !== null && detail?.plan !== undefined
    const kbzhu = detail?.today_kbzhu
    const mealGroups = detail ? groupByMeal(detail.food_entries) : {}

    return (
        <div className="px-4 py-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
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

            {loading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
            )}

            {error && (
                <p className="py-8 text-center text-sm text-red-500">{error}</p>
            )}

            {!loading && !error && detail && (
                <div className="space-y-6">
                    {/* Date picker */}
                    <div>
                        <label htmlFor="date-picker" className="block text-sm font-medium text-gray-700 mb-1">
                            Дата
                        </label>
                        <input
                            id="date-picker"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                    </div>

                    {/* Alerts */}
                    {detail.alerts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {detail.alerts.map((alert, idx) => (
                                <AlertBadge key={idx} level={alert.level} message={alert.message} />
                            ))}
                        </div>
                    )}

                    {/* KBZHU Progress */}
                    {hasPlan && kbzhu ? (
                        <section className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                            <h2 className="text-sm font-semibold text-gray-900 mb-3">КБЖУ за день</h2>
                            <div className="space-y-2">
                                <KBZHUProgress label="Калории" value={kbzhu.calories} target={detail.plan!.calories} />
                                <KBZHUProgress label="Белки" value={kbzhu.protein} target={detail.plan!.protein} />
                                <KBZHUProgress label="Жиры" value={kbzhu.fat} target={detail.plan!.fat} />
                                <KBZHUProgress label="Углеводы" value={kbzhu.carbs} target={detail.plan!.carbs} />
                            </div>
                        </section>
                    ) : kbzhu ? (
                        <section className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                            <h2 className="text-sm font-semibold text-gray-900 mb-2">КБЖУ за день</h2>
                            <p className="text-sm text-gray-600">
                                Ккал: {Math.round(kbzhu.calories)} | Б: {Math.round(kbzhu.protein)} | Ж: {Math.round(kbzhu.fat)} | У: {Math.round(kbzhu.carbs)}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">План не задан</p>
                        </section>
                    ) : null}

                    {/* Weekly plan */}
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

                    {/* Weight section */}
                    <WeightSection detail={detail} clientId={clientId} />

                    {/* Food entries by meal */}
                    <section>
                        <h2 className="text-sm font-semibold text-gray-900 mb-3">Приёмы пищи</h2>
                        {detail.food_entries.length === 0 ? (
                            <p className="text-sm text-gray-400">Нет записей за этот день</p>
                        ) : (
                            <div className="space-y-4">
                                {MEAL_ORDER.map((mealType) => {
                                    const entries = mealGroups[mealType]
                                    if (!entries || entries.length === 0) return null
                                    return (
                                        <div key={mealType} className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                                            <h3 className="text-sm font-semibold text-gray-800 mb-2">
                                                {MEAL_LABELS[mealType] || mealType}
                                            </h3>
                                            <div className="space-y-2">
                                                {entries.map((entry) => (
                                                    <div key={entry.id} className="border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm text-gray-900">{entry.food_name}</span>
                                                            <span className="text-xs text-gray-500">{entry.weight} г</span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 mt-0.5">
                                                            {Math.round(entry.calories)} ккал | Б {Math.round(entry.protein)} | Ж {Math.round(entry.fat)} | У {Math.round(entry.carbs)}
                                                        </p>
                                                        {entry.created_by != null && (
                                                            <span className="inline-block mt-0.5 text-xs text-blue-600 font-medium">
                                                                Добавлено куратором
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    )
}
