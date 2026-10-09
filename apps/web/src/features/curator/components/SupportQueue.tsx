'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import {
    curatorApi,
    type SupportConversation,
    type SupportThread,
} from '../api/curatorApi'

import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'
import { cn } from '@/shared/utils/cn'
import { Button } from '@/shared/components/ui/Button'
import { LABEL_CLASS, SectionSpinner, TEXTAREA_CLASS } from './formSheet'
/**
 * Questions the bot could not answer.
 *
 * The bot refuses rather than inventing an answer about money or health data,
 * which is only a good trade if somebody is actually reading what it refused.
 */

/** Query param name the lead queue's "Открыть переписку" link sets. */
const CONVERSATION_PARAM = 'conversation'

const statusLabels: Record<SupportConversation['status'], string> = {
    escalated: t('curator.support.escalated'),
    open: t('curator.support.open'),
    closed: t('curator.support.closed'),
}

/** Ждёт человека — предупреждение; отвечает бот — сведение; закрыто — нейтрально. */
const statusStyles: Record<SupportConversation['status'], string> = {
    escalated: 'bg-warning-soft text-warning-fg',
    open: 'bg-info-soft text-info-fg',
    closed: 'bg-subtle text-fg-muted',
}

/**
 * Ответ оператора — голос человека, поэтому на поверхности `coach`; вопрос
 * пользователя — вторичная заливка; бот — бумага с линией.
 */
const messageStyles = {
    user: { bubble: 'bg-subtle text-fg', author: 'text-fg-muted' },
    operator: { bubble: 'bg-coach text-on-coach', author: 'text-on-coach-muted' },
    bot: { bubble: 'border border-line bg-surface text-fg-muted', author: 'text-fg-subtle' },
} as const

const stepLabels: Record<string, string> = {
    goal: t('curator.leadSteps.goal'),
    body: t('curator.leadSteps.body'),
    activity: t('curator.leadSteps.activity'),
    result: t('curator.leadSteps.result'),
    contact: t('curator.leadSteps.contact'),
    registration: t('curator.leadSteps.registration'),
}

export function SupportQueue() {
    const [conversations, setConversations] = useState<SupportConversation[]>([])
    const [selected, setSelected] = useState<SupportThread | null>(null)
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState(false)
    const [reply, setReply] = useState('')

    // Set by the lead queue's "Открыть переписку" link
    // (/curator/support?conversation=<id>): there is no /curator/support/[id]
    // route — a specific thread is opened by state, not by path — so the id
    // has to arrive as a query param and be turned into the same setSelected
    // call a click on the list would make.
    const conversationId = useSearchParams().get(CONVERSATION_PARAM)

    const load = useCallback(async () => {
        const page = await curatorApi.getSupportConversations()
        setConversations(page.items)
    }, [])

    // A person opening a thread by id that a click never happened for must
    // still land somewhere legible if it is wrong: a stale link, a typo, a
    // conversation somebody already closed and that has since aged out. The
    // same catch as a normal click uses — a toast, list stays visible — beats
    // a blank screen, which is what a route that does not exist would give
    // instead.
    const openThreadById = useCallback(async (id: string) => {
        try {
            setSelected(await curatorApi.getSupportThread(id))
        } catch (err) {
            toast.error(messageForOr(err, t('curator.support.openFailed')))
        }
    }, [])

    useEffect(() => {
        async function loadInitial() {
            try {
                await load()
                if (conversationId) {
                    await openThreadById(conversationId)
                }
            } catch (err) {
                toast.error(messageForOr(err, t('curator.support.loadFailed')))
            } finally {
                setLoading(false)
            }
        }
        loadInitial()
        // Runs once for the id the URL carried at mount, exactly like the
        // onboarding resume link this mirrors.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])

    const openThread = (conversation: SupportConversation) => openThreadById(conversation.id)

    const handleReply = async () => {
        if (!selected || !reply.trim()) return

        setSending(true)
        try {
            await curatorApi.replyToSupport(selected.conversation.id, reply.trim())
            setReply('')
            setSelected(await curatorApi.getSupportThread(selected.conversation.id))
        } catch (err) {
            // «Бот не настроен» и «сессия ушла» — разные поводы. Первый значит
            // «не пиши, отвечать нечем», второй — «войди и повтори».
            toast.error(messageForOr(err, t('curator.support.sendFailed')))
        } finally {
            setSending(false)
        }
    }

    const handleClose = async () => {
        if (!selected) return
        try {
            await curatorApi.closeSupport(selected.conversation.id)
            setSelected(null)
            await load()
        } catch (err) {
            toast.error(messageForOr(err, t('curator.support.closeFailed')))
        }
    }

    if (loading) {
        return <SectionSpinner />
    }

    if (selected) {
        return (
            <div className="max-w-3xl">
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="-ml-3 text-fg-muted">
                    {t('curator.support.backToList')}
                </Button>

                {/* What they were doing when they got stuck, so nobody has to
                    ask them to repeat it. */}
                {selected.lead && (
                    <div className="mt-4 rounded-tile bg-info-soft p-4">
                        <p className="text-sm font-semibold text-info-fg">{selected.lead.email}</p>
                        <p className="text-sm text-info-fg">
                            {t('curator.leads.stoppedAt', { step: stepLabels[selected.lead.last_step] ?? selected.lead.last_step })}
                            {selected.lead.summary && ` · ${selected.lead.summary}`}
                        </p>
                    </div>
                )}

                <ul className="mt-4 space-y-3">
                    {selected.messages.map((message) => {
                        const style =
                            message.author === 'user'
                                ? messageStyles.user
                                : message.author === 'operator'
                                  ? messageStyles.operator
                                  : messageStyles.bot
                        return (
                            <li key={message.id} className={cn('rounded-tile p-4 text-[15px] leading-[22px]', style.bubble)}>
                                <p className={cn('mb-1 text-[13px] font-medium', style.author)}>
                                    {message.author === 'user'
                                        ? t('curator.support.authorUser')
                                        : message.author === 'operator'
                                          ? t('curator.support.authorOperator')
                                          : t('curator.support.authorBot')}
                                </p>
                                {message.text}
                            </li>
                        )
                    })}
                </ul>

                <div className="mt-6">
                    <label htmlFor="support-reply" className={LABEL_CLASS}>
                        {t('curator.support.reply')}
                    </label>
                    <textarea
                        id="support-reply"
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        rows={3}
                        className={TEXTAREA_CLASS}
                    />
                    <div className="mt-3 flex flex-wrap gap-3">
                        <Button
                            onClick={handleReply}
                            disabled={!reply.trim() || sending}
                        >
                            {sending ? t('curator.support.sending') : t('curator.support.sendToTelegram')}
                        </Button>
                        <Button variant="secondary" onClick={handleClose}>
                            {t('curator.support.close')}
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    if (conversations.length === 0) {
        return <p className="py-8 text-center text-sm text-fg-muted">{t('curator.support.empty')}</p>
    }

    return (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {conversations.map((conversation) => (
                <li key={conversation.id}>
                    <button
                        onClick={() => openThread(conversation)}
                        data-testid="support-conversation"
                        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                    >
                        <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-3">
                                <span className="type-headline truncate text-fg">
                                    {conversation.telegram_name || conversation.telegram_username || t('curator.support.noName')}
                                </span>
                                <span
                                    className={cn(
                                        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                                        statusStyles[conversation.status],
                                    )}
                                >
                                    {statusLabels[conversation.status]}
                                </span>
                            </span>
                            {conversation.escalation_reason && (
                                <span className="mt-0.5 block text-sm text-fg-muted">
                                    {t('curator.support.reason', { reason: conversation.escalation_reason })}
                                </span>
                            )}
                        </span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                    </button>
                </li>
            ))}
        </ul>
    )
}
