'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { curatorApi, type Lead } from '../api/curatorApi'
import { isApiError, messageFor } from '@/shared/errors/apiErrors'

import { t } from '@/shared/i18n'
/**
 * People who worked out their numbers and stopped short of registering.
 *
 * Before the wizard saved anything, these were invisible: the funnel simply
 * lost them. What makes the screen worth opening is the step they stopped at —
 * it says what to talk to them about.
 */

const stepLabels: Record<string, string> = {
    goal: t('curator.leadSteps.goal'),
    body: t('curator.leadSteps.body'),
    activity: t('curator.leadSteps.activity'),
    result: t('curator.leadSteps.result'),
    contact: t('curator.leadSteps.contact'),
    registration: t('curator.leadSteps.registration'),
}

const goalLabels: Record<string, string> = {
    loss: t('curator.leadGoals.loss'),
    maintain: t('curator.leadGoals.maintain'),
    gain: t('curator.leadGoals.gain'),
}

export function LeadList() {
    const [leads, setLeads] = useState<Lead[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState<string | null>(null)

    const load = useCallback(async () => {
        const page = await curatorApi.getLeads({ limit: 50 })
        setLeads(page.items)
        setTotal(page.total)
    }, [])

    useEffect(() => {
        async function loadInitial() {
            try {
                await load()
            } catch (err) {
                toast.error(isApiError(err) ? messageFor(err) : t('curator.leads.loadFailed'))
            } finally {
                setLoading(false)
            }
        }
        loadInitial()
    }, [load])

    const handleMarkHandled = async (lead: Lead) => {
        setBusy(lead.id)
        try {
            await curatorApi.markLeadHandled(lead.id)
            setLeads((current) =>
                current.map((item) =>
                    item.id === lead.id ? { ...item, handled_at: new Date().toISOString() } : item
                )
            )
        } catch (err) {
            // A lead somebody else already claimed answers 409
            // lead_already_claimed — the one piece of information that tells
            // the curator not to write to this person again. A blind catch
            // threw that code away and left "Не удалось отметить заявку" in
            // its place, which reads exactly like a dropped network request.
            toast.error(isApiError(err) ? messageFor(err) : t('curator.leads.markFailed'))
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
        return <p className="py-8 text-center text-sm text-gray-500">{t('curator.leads.empty')}</p>
    }

    return (
        <div>
            <p className="mb-3 text-sm text-gray-600">{t('curator.leads.total', { count: total })}</p>

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
                                    {lead.name || t('curator.leads.noName')}
                                </p>
                                <a
                                    href={`mailto:${lead.email}`}
                                    className="text-sm text-blue-600 hover:underline"
                                >
                                    {lead.email}
                                </a>
                            </div>
                            {lead.handled_at ? (
                                <span className="text-xs text-gray-500">{t('curator.leads.handled')}</span>
                            ) : (
                                <button
                                    onClick={() => handleMarkHandled(lead)}
                                    disabled={busy === lead.id}
                                    className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-300"
                                >
                                    {t('curator.leads.markHandled')}
                                </button>
                            )}
                        </div>

                        <p className="mt-2 text-xs text-gray-600">
                            {t('curator.leads.stoppedAt', { step: stepLabels[lead.last_step] ?? lead.last_step })}
                        </p>

                        <p className="mt-1 text-xs text-gray-600">
                            {[
                                lead.parameters.goal && goalLabels[lead.parameters.goal],
                                lead.parameters.height_cm && t('curator.leads.heightCm', { value: lead.parameters.height_cm }),
                                lead.parameters.weight_kg && t('curator.leads.weightKg', { value: lead.parameters.weight_kg }),
                                lead.result && t('curator.leads.calories', { value: Math.round(lead.result.calories) }),
                            ]
                                .filter(Boolean)
                                .join(' · ') || t('curator.leads.noParameters')}
                        </p>

                        {/* Whether we may write to them at all is not a detail:
                            it decides what anyone looking at this list can do. */}
                        {!lead.consents.contact && (
                            <p className="mt-2 text-xs text-amber-600">
                                {t('curator.leads.noConsent')}
                            </p>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    )
}
