'use client'

/**
 * Заявка со страницы тарифов.
 *
 * Страница публичная, поэтому адрес приходится спрашивать — но только у гостя.
 * У вошедшего адрес уже есть, и спрашивать его заново значит предлагать опечатку:
 * его заявку сервер собирает из учётной записи.
 *
 * Заявка идёт в тот же механизм, что и заявки из мастера: у оператора должно
 * быть одно место, куда он смотрит. Точка захвата — `pricing`, иначе спрос со
 * страницы тарифов неотличим от спроса с посадочной.
 *
 * Согласие на обработку данных обязательно и не проставлено заранее: сервер без
 * него откажет, а галочка, поставленная за человека, согласием не является.
 */

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/shared/components/ui/Button'
import { guestApi } from '../api/guest'
import { curatorAccessApi } from '@/shared/api/curatorAccess'
import { useCurrentUser } from '@/shared/hooks/useCurrentUser'
import { track, EVENTS, storedAttribution } from '@/shared/analytics'
import { t } from '@/shared/i18n'

export function PricingRequestForm() {
    const { user } = useCurrentUser()
    const [email, setEmail] = useState('')
    const [consent, setConsent] = useState(false)
    const [sending, setSending] = useState(false)
    const [sent, setSent] = useState(false)
    const [error, setError] = useState<string | null>(null)

    /**
     * Заявка вошедшего: ни адреса, ни согласий спрашивать не надо — учётная
     * запись уже и то, и другое. Точка захвата та же, `pricing`: оператору
     * важно, что человек пришёл со страницы тарифов, а не вошёл ли он.
     */
    const handleSignedInRequest = async () => {
        setError(null)
        setSending(true)
        try {
            await curatorAccessApi.requestCurator('pricing')
            setSent(true)
        } catch {
            setError(t('pricing.failed'))
        } finally {
            setSending(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (!email.trim()) {
            setError(t('pricing.emailRequired'))
            return
        }
        if (!consent) {
            setError(t('pricing.consentRequired'))
            return
        }

        setSending(true)
        try {
            await guestApi.createLead({
                email: email.trim(),
                // Параметров тела здесь нет вовсе: заявка на услугу не требует
                // ни роста, ни веса, и спрашивать их ради заявки значило бы
                // собирать данные о здоровье без нужды.
                parameters: {
                    sex: '',
                    birth_date: '',
                    height_cm: null,
                    weight_kg: null,
                    activity_level: 'moderate',
                    goal: 'maintain',
                },
                result: null,
                last_step: 'pricing',
                source: 'pricing',
                capture_source: 'pricing',
                attribution: storedAttribution(),
                consents: { data_processing: true, contact: true },
            })
            track(EVENTS.leadSaved, { contact_consent: true, capture_source: 'pricing' })
            setSent(true)
        } catch {
            setError(t('pricing.failed'))
        } finally {
            setSending(false)
        }
    }

    if (sent) {
        return (
            <p className="rounded-tile bg-success-soft px-4 py-3 text-sm text-success-fg" role="status">
                {t('pricing.sent')}
            </p>
        )
    }

    if (user) {
        return (
            <div className="space-y-3">
                <h3 className="type-title-3 text-fg">{t('pricing.formTitle')}</h3>
                <p className="text-sm text-fg-muted">{t('pricing.formLead')}</p>
                {error && (
                    <p className="text-sm text-danger-fg" role="alert">
                        {error}
                    </p>
                )}
                <Button type="button" onClick={handleSignedInRequest} disabled={sending} size="lg" block>
                    {sending ? t('pricing.submitting') : t('pricing.submit')}
                </Button>
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <h3 className="type-title-3 text-fg">{t('pricing.formTitle')}</h3>
            <p className="text-sm text-fg-muted">{t('pricing.formLead')}</p>

            <label className="block space-y-1.5">
                <span className="block text-sm font-medium text-fg-muted">{t('pricing.emailLabel')}</span>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('pricing.emailPlaceholder')}
                    className="h-12 w-full rounded-field border border-line bg-surface px-4 text-base text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
                    autoComplete="email"
                />
            </label>

            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm text-fg-muted">
                <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded-xs border-line accent-primary"
                />
                <span>
                    {t('pricing.consent')}{' '}
                    <Link href="/legal/privacy" className="font-semibold text-primary underline underline-offset-2">
                        {t('pricing.privacyLink')}
                    </Link>
                </span>
            </label>

            {error && (
                <p className="text-sm text-danger-fg" role="alert">
                    {error}
                </p>
            )}

            <Button type="submit" disabled={sending} size="lg" block>
                {sending ? t('pricing.submitting') : t('pricing.submit')}
            </Button>
        </form>
    )
}
