'use client'

/**
 * The bot conversation a landing-page (or guest-wizard) visitor can have
 * before they have an account.
 *
 * A single floating island: collapsed, it is one button; open, it is a small
 * panel with the transcript, a question box, "call a human", the existing
 * `SupportLink` (hidden when no Telegram bot is configured — its own logic,
 * untouched here), and — once the visitor has asked something and either the
 * bot escalated or they asked to keep the transcript — a contact form.
 *
 * Polling is by request and by a timer that only runs while the panel is
 * open: the conversation is short and rare, so a socket is not worth the
 * connection it would hold open for a page nobody has registered on yet.
 *
 * Every failure the store can report — opening, sending, calling a human,
 * saving a contact — is shown as text rather than thrown. A visitor with the
 * API down still gets a working button that explains itself instead of a
 * broken landing page.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useWidgetStore } from '../store/widgetStore'
import type { WidgetMessage } from '../api/widget'
import { SupportLink } from '@/shared/components/SupportLink'
import { t } from '@/shared/i18n'

const POLL_INTERVAL_MS = 10_000

function authorLabel(author: string): string {
    switch (author) {
        case 'user':
            return t('supportWidget.authorUser')
        case 'operator':
            return t('supportWidget.authorOperator')
        default:
            return t('supportWidget.authorBot')
    }
}

export function SupportWidget() {
    const open = useWidgetStore((s) => s.open)
    const token = useWidgetStore((s) => s.token)
    const messages = useWidgetStore((s) => s.messages)
    const status = useWidgetStore((s) => s.status)
    const sending = useWidgetStore((s) => s.sending)
    const error = useWidgetStore((s) => s.error)
    const openWidget = useWidgetStore((s) => s.openWidget)
    const closeWidget = useWidgetStore((s) => s.closeWidget)
    const refreshMessages = useWidgetStore((s) => s.refreshMessages)
    const sendMessage = useWidgetStore((s) => s.sendMessage)
    const callHuman = useWidgetStore((s) => s.callHuman)
    const submitContact = useWidgetStore((s) => s.submitContact)
    const clearError = useWidgetStore((s) => s.clearError)

    const [question, setQuestion] = useState('')
    const [askedOnce, setAskedOnce] = useState(false)
    const [contactRequested, setContactRequested] = useState(false)
    const [contactSaved, setContactSaved] = useState(false)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // Polling by timer, only while the panel is open. A closed panel polls
    // nothing — there is nobody reading the answer.
    useEffect(() => {
        if (!open || !token) return undefined
        const id = setInterval(() => {
            refreshMessages()
        }, POLL_INTERVAL_MS)
        return () => clearInterval(id)
    }, [open, token, refreshMessages])

    useEffect(() => {
        if (open) inputRef.current?.focus()
    }, [open])

    // Reopening a conversation the visitor left mid-question should not put
    // them back at a blank contact form: the flags below are this component's
    // own render state (not the store's), so they reset with every mount.
    // Fresh state is fine here since a fresh mount only ever happens on a
    // genuinely new page/component instance, not on open/close of the panel.

    const showContactForm = askedOnce && (status === 'escalated' || contactRequested) && !contactSaved

    const handleOpen = () => {
        void openWidget()
    }

    const handleClose = () => {
        closeWidget()
    }

    const handleSend = async (event: FormEvent) => {
        event.preventDefault()
        const text = question.trim()
        if (!text || sending) return
        await sendMessage(text)
        setQuestion('')
        setAskedOnce(true)
    }

    if (!open) {
        return (
            <button
                type="button"
                onClick={handleOpen}
                aria-expanded={false}
                className="fixed bottom-6 right-6 z-40 inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-5 text-sm font-medium text-white shadow-lg transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
                {t('supportWidget.openButton')}
            </button>
        )
    }

    return (
        <div
            role="dialog"
            aria-label={t('supportWidget.title')}
            className="fixed bottom-6 right-6 z-40 flex w-[calc(100vw-3rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
        >
            <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">{t('supportWidget.title')}</h2>
                <button
                    type="button"
                    onClick={handleClose}
                    aria-label={t('supportWidget.closeButton')}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                    ×
                </button>
            </header>

            <p className="px-4 pt-3 text-xs text-gray-500">{t('supportWidget.hint')}</p>

            <div
                aria-live="polite"
                aria-label={t('supportWidget.title')}
                className="max-h-64 flex-1 space-y-2 overflow-y-auto px-4 py-3"
            >
                {messages.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('supportWidget.emptyTranscript')}</p>
                ) : (
                    messages.map((message: WidgetMessage) => (
                        <p key={message.id} className="text-sm text-gray-800">
                            <span className="font-medium text-gray-500">{authorLabel(message.author)}: </span>
                            {message.text}
                        </p>
                    ))
                )}
            </div>

            {error && (
                <p role="alert" className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                    <button type="button" onClick={clearError} className="ml-2 underline">
                        {t('common.close')}
                    </button>
                </p>
            )}

            <form onSubmit={handleSend} className="border-t border-gray-200 px-4 py-3">
                <label htmlFor="support-widget-question" className="sr-only">
                    {t('supportWidget.questionLabel')}
                </label>
                <textarea
                    id="support-widget-question"
                    ref={inputRef}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder={t('supportWidget.questionPlaceholder')}
                    rows={2}
                    disabled={!token}
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => void callHuman()}
                            disabled={!token}
                            className="text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
                        >
                            {t('supportWidget.callHuman')}
                        </button>
                        <SupportLink className="text-xs text-blue-600 hover:underline" />
                    </div>
                    <button
                        type="submit"
                        disabled={!question.trim() || sending || !token}
                        className="inline-flex h-8 items-center justify-center rounded-lg bg-blue-600 px-4 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                        {sending ? t('supportWidget.sending') : t('supportWidget.send')}
                    </button>
                </div>
            </form>

            {askedOnce && !showContactForm && !contactSaved && (
                <div className="border-t border-gray-200 px-4 py-2">
                    <button
                        type="button"
                        onClick={() => setContactRequested(true)}
                        className="text-xs font-medium text-blue-600 hover:underline"
                    >
                        {t('supportWidget.saveConversation')}
                    </button>
                </div>
            )}

            {showContactForm && (
                <ContactForm
                    onSubmit={async (email, consents) => {
                        const ok = await submitContact(email, consents)
                        if (ok) setContactSaved(true)
                    }}
                />
            )}

            {contactSaved && (
                <p className="border-t border-gray-200 px-4 py-3 text-sm text-green-700">
                    {t('supportWidget.contactSaved')}
                </p>
            )}
        </div>
    )
}

function ContactForm({
    onSubmit,
}: {
    onSubmit: (email: string, consents: { data_processing: boolean; contact: boolean }) => Promise<void>
}) {
    const [email, setEmail] = useState('')
    const [dataConsent, setDataConsent] = useState(false)
    const [contactConsent, setContactConsent] = useState(false)
    const [saving, setSaving] = useState(false)

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault()
        if (!email || !dataConsent || saving) return
        setSaving(true)
        try {
            await onSubmit(email, { data_processing: dataConsent, contact: contactConsent })
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-gray-200 px-4 py-3">
            <div>
                <h3 className="text-sm font-semibold text-gray-900">{t('supportWidget.contactTitle')}</h3>
                <p className="mt-1 text-xs text-gray-600">{t('supportWidget.contactHint')}</p>
            </div>

            <div>
                <label htmlFor="support-widget-email" className="block text-xs font-medium text-gray-900">
                    {t('supportWidget.emailLabel')}
                </label>
                <input
                    id="support-widget-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('supportWidget.emailPlaceholder')}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
            </div>

            <div className="space-y-2">
                <label className="flex cursor-pointer items-start gap-2">
                    <input
                        type="checkbox"
                        checked={dataConsent}
                        onChange={(e) => setDataConsent(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-xs text-gray-600">{t('supportWidget.consentData')}</span>
                </label>
                <label className="flex cursor-pointer items-start gap-2">
                    <input
                        type="checkbox"
                        checked={contactConsent}
                        onChange={(e) => setContactConsent(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-xs text-gray-600">{t('supportWidget.consentContact')}</span>
                </label>
            </div>

            <button
                type="submit"
                disabled={!email || !dataConsent || saving}
                className="w-full rounded-lg border border-blue-600 py-2 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 disabled:opacity-50"
            >
                {saving ? t('supportWidget.contactSaving') : t('supportWidget.contactSubmit')}
            </button>
        </form>
    )
}
