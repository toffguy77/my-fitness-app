'use client'

import { useEffect, useReducer, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, MessageCircle, Loader2 } from 'lucide-react'
import { curatorApi } from '@/features/curator/api/curatorApi'
import { KBZHUProgress } from '@/features/curator/components/KBZHUProgress'
import { AlertBadge } from '@/features/curator/components/AlertBadge'
import type { ClientDetail, FoodEntryView } from '@/features/curator/types'

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

                    {/* Last weight */}
                    {detail.last_weight != null && (
                        <section className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                            <h2 className="text-sm font-semibold text-gray-900 mb-1">Последний вес</h2>
                            <p className="text-lg font-semibold text-gray-900">{detail.last_weight} кг</p>
                        </section>
                    )}

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
