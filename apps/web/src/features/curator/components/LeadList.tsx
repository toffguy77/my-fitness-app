'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { curatorApi, type Lead } from '../api/curatorApi'
import { isApiError, messageFor } from '@/shared/errors/apiErrors'

import { t, plural } from '@/shared/i18n'
import { Button } from '@/shared/components/ui/Button'
import { Checkbox } from '@/shared/components/ui/Checkbox'
import { SectionSpinner } from './formSheet'

/** Ссылка-действие в карточке заявки. */
const ACTION_LINK = 'inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline'
/**
 * The work queue for people who worked out their numbers and stopped short
 * of registering.
 *
 * Before this existed, they left no trace at all. Before this screen became
 * a queue, it was a timeline: every lead ever saved, oldest first, with no
 * hint which one to act on next. This shows only what is unhandled — the
 * longest-waiting lead first, exactly as the backend orders it (task 3) — and
 * for each one, the reason to talk to them, not just an address to write to.
 */

const stepLabels: Record<string, string> = {
    goal: t('curator.leadSteps.goal'),
    body: t('curator.leadSteps.body'),
    activity: t('curator.leadSteps.activity'),
    result: t('curator.leadSteps.result'),
    contact: t('curator.leadSteps.contact'),
    registration: t('curator.leadSteps.registration'),
    bot: t('curator.leadSteps.bot'),
}

const goalLabels: Record<string, string> = {
    loss: t('curator.leadGoals.loss'),
    maintain: t('curator.leadGoals.maintain'),
    gain: t('curator.leadGoals.gain'),
}

function ageLabel(ageDays: number): string {
    return t('curator.leads.waiting', {
        count: ageDays,
        noun: plural(ageDays, {
            one: t('curator.leads.dayOne'),
            few: t('curator.leads.dayFew'),
            many: t('curator.leads.dayMany'),
        }),
    })
}

/**
 * How the campaign reads in one line.
 *
 * Source and campaign are what anybody grouping this list cares about; the
 * medium says paid or not. The click identifier is deliberately absent — it is
 * for the conversion upload, not for a person to read.
 */
function campaignOf(lead: Lead): string | null {
    const { utm_source, utm_medium, utm_campaign, referrer } = lead.attribution ?? {}
    const parts = [utm_source, utm_medium, utm_campaign].filter(Boolean)
    if (parts.length > 0) return parts.join(' · ')
    // Search and Dzen put no tags on their links; the site they came from is
    // the answer then.
    return hostOf(referrer)
}

function hostOf(referrer?: string): string | null {
    if (!referrer) return null
    try {
        return new URL(referrer).hostname
    } catch {
        return null
    }
}

export function LeadList() {
    const [leads, setLeads] = useState<Lead[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState<string | null>(null)
    const [includeHandled, setIncludeHandled] = useState(false)

    const load = useCallback(async (withHandled: boolean) => {
        const page = await curatorApi.getLeads({ limit: 50, includeHandled: withHandled })
        setLeads(page.items)
        setTotal(page.total)
    }, [])

    useEffect(() => {
        async function loadInitial() {
            try {
                await load(includeHandled)
            } catch (err) {
                toast.error(isApiError(err) ? messageFor(err) : t('curator.leads.loadFailed'))
            } finally {
                setLoading(false)
            }
        }
        loadInitial()
        // Re-runs whenever the toggle changes; `load` itself never changes
        // identity, only `includeHandled` does.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [includeHandled])

    const handleToggleIncludeHandled = async () => {
        const next = !includeHandled
        setIncludeHandled(next)
        setLoading(true)
        try {
            await load(next)
        } catch (err) {
            toast.error(isApiError(err) ? messageFor(err) : t('curator.leads.loadFailed'))
        } finally {
            setLoading(false)
        }
    }

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
        return <SectionSpinner />
    }

    return (
        <div>
            <div className="mb-4 flex min-h-11 flex-wrap items-center justify-between gap-3">
                <p className="text-sm tabular-nums text-fg-muted">{t('curator.leads.total', { count: total })}</p>
                <Checkbox
                    checked={includeHandled}
                    onChange={handleToggleIncludeHandled}
                    label={t('curator.leads.showHandled')}
                />
            </div>

            {leads.length === 0 ? (
                <p className="py-8 text-center text-sm text-fg-muted">{t('curator.leads.empty')}</p>
            ) : (
                <ul className="grid gap-3 lg:grid-cols-2">
                    {/* Server order, not re-sorted: this is what makes it a queue
                        rather than a list the curator has to scan for who has
                        waited longest. */}
                    {leads.map((lead) => (
                        <li
                            key={lead.id}
                            className="rounded-card border border-line bg-surface p-4"
                            data-testid="lead-card"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="type-headline text-fg">
                                        {lead.name || t('curator.leads.noName')}
                                    </p>
                                    {/* Identifies who this is about, regardless of
                                        consent — withheld consent hides the ability
                                        to write to them, not who they are. */}
                                    <p className="truncate text-sm text-fg-muted" data-testid="lead-email">{lead.email}</p>
                                </div>
                                {lead.handled_at ? (
                                    <span className="inline-flex shrink-0 items-center rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success-fg">
                                        {t('curator.leads.handled')}
                                    </span>
                                ) : (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleMarkHandled(lead)}
                                        disabled={busy === lead.id}
                                        className="shrink-0"
                                    >
                                        {t('curator.leads.markHandled')}
                                    </Button>
                                )}
                            </div>

                            <p className="mt-3 text-sm text-fg">
                                {t('curator.leads.stoppedAt', { step: stepLabels[lead.last_step] ?? lead.last_step })}
                            </p>

                            <p className="mt-1 text-sm tabular-nums text-fg-muted">
                                {[
                                    lead.parameters.goal && goalLabels[lead.parameters.goal],
                                    lead.parameters.height_cm && t('curator.leads.heightCm', { value: lead.parameters.height_cm }),
                                    lead.parameters.weight_kg && t('curator.leads.weightKg', { value: lead.parameters.weight_kg }),
                                    lead.result && t('curator.leads.calories', { value: Math.round(lead.result.calories) }),
                                ]
                                    .filter(Boolean)
                                    .join(' · ') || t('curator.leads.noParameters')}
                            </p>

                            <p className="mt-1 text-sm tabular-nums text-fg-muted">
                                {ageLabel(lead.age_days)}
                                {lead.reminder_sent && ` · ${t('curator.leads.reminderSent')}`}
                            </p>

                            {/* Из какой кампании пришёл человек. Вопрос, ради
                                которого этот список и заводился — «какие
                                каналы приводят тех, кто доходит», — раньше
                                ответа не имел: браузер писал сюда
                                document.referrer, пустой при прямом заходе. */}
                            <p className="mt-1 text-[13px] text-fg-subtle">
                                {campaignOf(lead) ?? t('curator.leads.noCampaign')}
                            </p>

                            {/* Whether we may write to them at all is not a detail:
                                it decides what anyone looking at this card can do.
                                No consent means no "Написать" action at all — not a
                                disabled one, which would read as a temporary
                                obstacle rather than a rule. */}
                            {!lead.contact_allowed && (
                                <p className="mt-3 rounded-tile bg-warning-soft px-3 py-2 text-sm font-medium text-warning-fg">
                                    {t('curator.leads.noConsent')}
                                </p>
                            )}

                            <div className="mt-2 flex gap-5">
                                {lead.contact_allowed && (
                                    <a
                                        href={`mailto:${lead.email}`}
                                        className={ACTION_LINK}
                                    >
                                        {t('curator.leads.write')}
                                    </a>
                                )}
                                {/* Stays nil until the public-support-widget plan
                                    starts linking conversations widely — absent
                                    rather than a disabled link to nowhere.

                                    Points at the query string, not a path segment:
                                    there is no /curator/support/[id] route — the
                                    queue opens a thread by component state, not by
                                    URL — so this used to 404. SupportQueue reads
                                    ?conversation= on mount and opens that thread
                                    the same way a click on it would. */}
                                {lead.conversation_id && (
                                    <Link
                                        href={`/curator/support?conversation=${lead.conversation_id}`}
                                        className={ACTION_LINK}
                                    >
                                        {t('curator.leads.openConversation')}
                                    </Link>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
