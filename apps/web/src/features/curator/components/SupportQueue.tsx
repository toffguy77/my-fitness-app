'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import {
    curatorApi,
    type SupportConversation,
    type SupportThread,
} from '../api/curatorApi'

import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'
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
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-fg-subtle" />
            </div>
        )
    }

    if (selected) {
        return (
            <div>
                <button
                    onClick={() => setSelected(null)}
                    className="text-sm text-fg-muted hover:text-fg"
                >
                    {t('curator.support.backToList')}
                </button>

                {/* What they were doing when they got stuck, so nobody has to
                    ask them to repeat it. */}
                {selected.lead && (
                    <div className="mt-4 rounded-lg border border-line bg-canvas p-3">
                        <p className="text-sm font-medium text-fg">{selected.lead.email}</p>
                        <p className="text-xs text-fg-muted">
                            {t('curator.leads.stoppedAt', { step: stepLabels[selected.lead.last_step] ?? selected.lead.last_step })}
                            {selected.lead.summary && ` · ${selected.lead.summary}`}
                        </p>
                    </div>
                )}

                <ul className="mt-4 space-y-3">
                    {selected.messages.map((message) => (
                        <li
                            key={message.id}
                            className={`rounded-lg p-3 text-sm ${
                                message.author === 'user'
                                    ? 'bg-subtle text-fg'
                                    : message.author === 'operator'
                                      ? 'bg-primary-soft text-fg'
                                      : 'bg-surface text-fg-muted border border-line'
                            }`}
                        >
                            <p className="mb-1 text-xs text-fg-muted">
                                {message.author === 'user'
                                    ? t('curator.support.authorUser')
                                    : message.author === 'operator'
                                      ? t('curator.support.authorOperator')
                                      : t('curator.support.authorBot')}
                            </p>
                            {message.text}
                        </li>
                    ))}
                </ul>

                <div className="mt-4">
                    <label htmlFor="support-reply" className="block text-sm font-medium text-fg">
                        {t('curator.support.reply')}
                    </label>
                    <textarea
                        id="support-reply"
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-fg"
                    />
                    <div className="mt-3 flex gap-3">
                        <button
                            onClick={handleReply}
                            disabled={!reply.trim() || sending}
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                        >
                            {sending ? t('curator.support.sending') : t('curator.support.sendToTelegram')}
                        </button>
                        <button
                            onClick={handleClose}
                            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-fg hover:bg-canvas"
                        >
                            {t('curator.support.close')}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (conversations.length === 0) {
        return <p className="py-8 text-center text-sm text-fg-muted">{t('curator.support.empty')}</p>
    }

    return (
        <ul className="space-y-3">
            {conversations.map((conversation) => (
                <li key={conversation.id}>
                    <button
                        onClick={() => openThread(conversation)}
                        data-testid="support-conversation"
                        className="w-full rounded-xl border border-line bg-surface p-4 text-left hover:shadow-md"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-fg">
                                {conversation.telegram_name || conversation.telegram_username || t('curator.support.noName')}
                            </span>
                            <span
                                className={`text-xs ${
                                    conversation.status === 'escalated'
                                        ? 'font-semibold text-danger-fg'
                                        : 'text-fg-muted'
                                }`}
                            >
                                {statusLabels[conversation.status]}
                            </span>
                        </div>
                        {conversation.escalation_reason && (
                            <p className="mt-1 text-xs text-fg-muted">
                                {t('curator.support.reason', { reason: conversation.escalation_reason })}
                            </p>
                        )}
                    </button>
                </li>
            ))}
        </ul>
    )
}
