'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi, type Lead } from '../api/adminApi'

/**
 * People who worked out their numbers and stopped short of registering.
 *
 * Before the wizard saved anything, these were invisible: the funnel simply
 * lost them. What makes the screen worth opening is the step they stopped at —
 * it says what to talk to them about.
 */

const stepLabels: Record<string, string> = {
    goal: 'выбор цели',
    body: 'параметры',
    activity: 'активность',
    result: 'увидел расчёт',
    contact: 'оставил контакт',
    registration: 'форма регистрации',
}

const goalLabels: Record<string, string> = {
    loss: 'снизить вес',
    maintain: 'удержать вес',
    gain: 'набрать массу',
}

export function LeadList() {
    const [leads, setLeads] = useState<Lead[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState<string | null>(null)

    const load = useCallback(async () => {
        const page = await adminApi.getLeads({ limit: 50 })
        setLeads(page.items)
        setTotal(page.total)
    }, [])

    useEffect(() => {
        load()
            .catch(() => toast.error('Не удалось загрузить заявки'))
            .finally(() => setLoading(false))
    }, [load])

    const handleMarkHandled = async (lead: Lead) => {
        setBusy(lead.id)
        try {
            await adminApi.markLeadHandled(lead.id)
            setLeads((current) =>
                current.map((item) =>
                    item.id === lead.id ? { ...item, handled_at: new Date().toISOString() } : item
                )
            )
        } catch {
            toast.error('Не удалось отметить заявку')
        } finally {
            setBusy(null)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        )
    }

    if (leads.length === 0) {
        return <p className="py-8 text-center text-sm text-gray-500">Заявок пока нет</p>
    }

    return (
        <div>
            <p className="mb-3 text-sm text-gray-600">Всего заявок: {total}</p>

            <ul className="space-y-3">
                {leads.map((lead) => (
                    <li
                        key={lead.id}
                        className="rounded-xl border border-gray-200 bg-white p-4"
                        data-testid="lead-card"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-gray-900">
                                    {lead.name || 'Без имени'}
                                </p>
                                <a
                                    href={`mailto:${lead.email}`}
                                    className="text-sm text-blue-600 hover:underline"
                                >
                                    {lead.email}
                                </a>
                            </div>
                            {lead.handled_at ? (
                                <span className="text-xs text-gray-500">Обработана</span>
                            ) : (
                                <button
                                    onClick={() => handleMarkHandled(lead)}
                                    disabled={busy === lead.id}
                                    className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-300"
                                >
                                    Отметить обработанной
                                </button>
                            )}
                        </div>

                        <p className="mt-2 text-xs text-gray-600">
                            Остановился: {stepLabels[lead.last_step] ?? lead.last_step}
                        </p>

                        <p className="mt-1 text-xs text-gray-600">
                            {[
                                lead.parameters.goal && goalLabels[lead.parameters.goal],
                                lead.parameters.height_cm && `${lead.parameters.height_cm} см`,
                                lead.parameters.weight_kg && `${lead.parameters.weight_kg} кг`,
                                lead.result && `${Math.round(lead.result.calories)} ккал`,
                            ]
                                .filter(Boolean)
                                .join(' · ') || 'Параметры не заполнены'}
                        </p>

                        {/* Whether we may write to them at all is not a detail:
                            it decides what anyone looking at this list can do. */}
                        {!lead.consents.contact && (
                            <p className="mt-2 text-xs text-amber-600">
                                Согласия на связь нет — писать нельзя
                            </p>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    )
}
