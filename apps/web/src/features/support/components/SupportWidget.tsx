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

import { useSyncExternalStore, useEffect, useRef, useState, type FormEvent } from 'react'
import { useWidgetStore } from '../store/widgetStore'
import type { WidgetMessage } from '../api/widget'
import { SupportLink } from '@/shared/components/SupportLink'
import { t } from '@/shared/i18n'
import { X } from 'lucide-react'
import { Button, IconButton } from '@/shared/components/ui/Button'
import { analyticsChoice, subscribeToAnalyticsChoice } from '@/shared/components/CookieConsent'

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
    // Пока человек не ответил про cookie, кнопки помощи нет.
    //
    // Оба элемента — первого захода, и на узком экране (375 пикселей) им
    // вдвоём тесно: полоса сдвигает содержимое вниз, и кнопка «Далее» в
    // гостевом мастере уезжает под кнопку виджета. Поймала проверка, которая
    // ровно за этим и поставлена.
    //
    // Порядок такой и по смыслу: сперва вопрос про данные, потом предложение
    // помощи. Ответ хранится, так что кнопка появляется сразу после него и
    // больше не пропадает.
    const consentPending =
        useSyncExternalStore(subscribeToAnalyticsChoice, analyticsChoice, () => null) === null

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

    if (consentPending) return null

    if (!open) {
        return (
            <button
                type="button"
                onClick={handleOpen}
                aria-expanded={false}
                // Голос продукта, а не главное действие страницы: тёмная поверхность
                // `coach`, терракота остаётся главной кнопке лендинга.
                className="fixed bottom-6 right-6 z-40 inline-flex h-12 items-center justify-center rounded-full bg-coach px-5 text-[15px] font-semibold text-on-coach shadow-float transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
            >
                {t('supportWidget.openButton')}
            </button>
        )
    }

    return (
        <div
            role="dialog"
            aria-label={t('supportWidget.title')}
            className="fixed bottom-6 right-6 z-40 flex w-[calc(100vw-3rem)] max-w-sm flex-col overflow-hidden rounded-card border border-line bg-surface shadow-overlay"
        >
            <header className="flex items-center justify-between gap-2 border-b border-line py-1 pl-4 pr-1">
                <h2 className="type-title-3 text-fg">{t('supportWidget.title')}</h2>
                <IconButton
                    variant="ghost"
                    onClick={handleClose}
                    aria-label={t('supportWidget.closeButton')}
                >
                    <X className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                </IconButton>
            </header>

            <p className="type-caption px-4 pt-3 text-fg-muted">{t('supportWidget.hint')}</p>

            <div
                role="log"
                aria-live="polite"
                aria-label={t('supportWidget.title')}
                className="max-h-64 flex-1 space-y-2 overflow-y-auto px-4 py-3"
            >
                {messages.length === 0 ? (
                    <p className="text-sm text-fg-muted">{t('supportWidget.emptyTranscript')}</p>
                ) : (
                    messages.map((message: WidgetMessage) => (
                        <p key={message.id} className="text-sm text-fg">
                            <span className="font-medium text-fg-muted">{authorLabel(message.author)}: </span>
                            {message.text}
                        </p>
                    ))
                )}
            </div>

            {error && (
                <p role="alert" className="mx-4 mb-2 rounded-tile bg-danger-soft px-3 py-2 text-sm text-danger-fg">
                    {error}
                    <button type="button" onClick={clearError} className="ml-2 font-semibold underline">
                        {t('common.close')}
                    </button>
                </p>
            )}

            <form onSubmit={handleSend} className="border-t border-line px-4 py-3">
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
                    className="w-full resize-none rounded-field border border-line bg-surface px-4 py-3 text-base text-fg placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30 disabled:opacity-50"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3">
                        <button
                            type="button"
                            onClick={() => void callHuman()}
                            disabled={!token}
                            className="inline-flex min-h-11 items-center text-sm font-medium text-fg-muted hover:text-fg disabled:opacity-50"
                        >
                            {t('supportWidget.callHuman')}
                        </button>
                        <SupportLink className="text-sm font-semibold text-primary hover:underline" />
                    </div>
                    <Button
                        type="submit"
                        disabled={!question.trim() || sending || !token}
                    >
                        {sending ? t('supportWidget.sending') : t('supportWidget.send')}
                    </Button>
                </div>
            </form>

            {askedOnce && !showContactForm && !contactSaved && (
                <div className="border-t border-line px-4">
                    <button
                        type="button"
                        onClick={() => setContactRequested(true)}
                        className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
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
                <p className="border-t border-line px-4 py-3 text-sm text-success-fg">
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
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-line px-4 py-3">
            <div>
                <h3 className="type-headline text-fg">{t('supportWidget.contactTitle')}</h3>
                <p className="type-caption mt-1 text-fg-muted">{t('supportWidget.contactHint')}</p>
            </div>

            <div>
                <label htmlFor="support-widget-email" className="mb-1.5 block text-sm font-medium text-fg-muted">
                    {t('supportWidget.emailLabel')}
                </label>
                <input
                    id="support-widget-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('supportWidget.emailPlaceholder')}
                    className="h-12 w-full rounded-field border border-line bg-surface px-4 text-base text-fg placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
                />
            </div>

            <div className="space-y-2">
                <label className="flex cursor-pointer items-start gap-3">
                    <input
                        type="checkbox"
                        checked={dataConsent}
                        onChange={(e) => setDataConsent(e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 rounded-xs border-line accent-primary focus:ring-2 focus:ring-focus focus:ring-offset-2"
                    />
                    <span className="text-sm text-fg-muted">{t('supportWidget.consentData')}</span>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                    <input
                        type="checkbox"
                        checked={contactConsent}
                        onChange={(e) => setContactConsent(e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 rounded-xs border-line accent-primary focus:ring-2 focus:ring-focus focus:ring-offset-2"
                    />
                    <span className="text-sm text-fg-muted">{t('supportWidget.consentContact')}</span>
                </label>
            </div>

            <Button
                type="submit"
                variant="secondary"
                block
                disabled={!email || !dataConsent || saving}
            >
                {saving ? t('supportWidget.contactSaving') : t('supportWidget.contactSubmit')}
            </Button>
        </form>
    )
}
