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
        } catch {
            toast.error(t('curator.support.openFailed'))
        }
    }, [])

    useEffect(() => {
        async function loadInitial() {
            try {
                await load()
                if (conversationId) {
                    await openThreadById(conversationId)
                }
            } catch {
                toast.error(t('curator.support.loadFailed'))
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
        } catch {
            toast.error(t('curator.support.sendFailed'))
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
        } catch {
            toast.error(t('curator.support.closeFailed'))
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        )
    }

    if (selected) {
        return (
            <div>
                <button
                    onClick={() => setSelected(null)}
                    className="text-sm text-gray-600 hover:text-gray-900"
                >
                    {t('curator.support.backToList')}
                </button>

                {/* What they were doing when they got stuck, so nobody has to
                    ask them to repeat it. */}
                {selected.lead && (
                    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <p className="text-sm font-medium text-gray-900">{selected.lead.email}</p>
                        <p className="text-xs text-gray-600">
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
                                    ? 'bg-gray-100 text-gray-900'
                                    : message.author === 'operator'
                                      ? 'bg-blue-50 text-gray-900'
                                      : 'bg-white text-gray-600 border border-gray-200'
                            }`}
                        >
                            <p className="mb-1 text-xs text-gray-500">
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
                    <label htmlFor="support-reply" className="block text-sm font-medium text-gray-900">
                        {t('curator.support.reply')}
                    </label>
                    <textarea
                        id="support-reply"
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    />
                    <div className="mt-3 flex gap-3">
                        <button
                            onClick={handleReply}
                            disabled={!reply.trim() || sending}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            {sending ? t('curator.support.sending') : t('curator.support.sendToTelegram')}
                        </button>
                        <button
                            onClick={handleClose}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                        >
                            {t('curator.support.close')}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (conversations.length === 0) {
        return <p className="py-8 text-center text-sm text-gray-500">{t('curator.support.empty')}</p>
    }

    return (
        <ul className="space-y-3">
            {conversations.map((conversation) => (
                <li key={conversation.id}>
                    <button
                        onClick={() => openThread(conversation)}
                        data-testid="support-conversation"
                        className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left hover:shadow-md"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-900">
                                {conversation.telegram_name || conversation.telegram_username || t('curator.support.noName')}
                            </span>
                            <span
                                className={`text-xs ${
                                    conversation.status === 'escalated'
                                        ? 'font-semibold text-red-600'
                                        : 'text-gray-500'
                                }`}
                            >
                                {statusLabels[conversation.status]}
                            </span>
                        </div>
                        {conversation.escalation_reason && (
                            <p className="mt-1 text-xs text-gray-600">
                                {t('curator.support.reason', { reason: conversation.escalation_reason })}
                            </p>
                        )}
                    </button>
                </li>
            ))}
        </ul>
    )
}
