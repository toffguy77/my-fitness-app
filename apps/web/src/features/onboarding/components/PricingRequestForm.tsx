'use client'

/**
 * Заявка со страницы тарифов.
 *
 * Страница публичная, поэтому адрес приходится спрашивать: посетитель может
 * оказаться и без учётной записи. Вошедшему адрес спрашивать не надо — ему
 * показывается CuratorOffer, который берёт адрес из учётной записи.
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
import { guestApi } from '../api/guest'
import { track, EVENTS, storedAttribution } from '@/shared/analytics'
import { t } from '@/shared/i18n'

export function PricingRequestForm() {
    const [email, setEmail] = useState('')
    const [consent, setConsent] = useState(false)
    const [sending, setSending] = useState(false)
    const [sent, setSent] = useState(false)
    const [error, setError] = useState<string | null>(null)

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
            <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800" role="status">
                {t('pricing.sent')}
            </p>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <h3 className="text-base font-semibold text-gray-900">{t('pricing.formTitle')}</h3>
            <p className="text-sm text-gray-600">{t('pricing.formLead')}</p>

            <label className="block space-y-1">
                <span className="text-xs font-medium text-gray-500">{t('pricing.emailLabel')}</span>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('pricing.emailPlaceholder')}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    autoComplete="email"
                />
            </label>

            <label className="flex items-start gap-2 text-sm text-gray-600">
                <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1"
                />
                <span>
                    {t('pricing.consent')}{' '}
                    <Link href="/legal/privacy" className="text-blue-600 underline">
                        {t('pricing.privacyLink')}
                    </Link>
                </span>
            </label>

            {error && (
                <p className="text-sm text-red-600" role="alert">
                    {error}
                </p>
            )}

            <button
                type="submit"
                disabled={sending}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
                {sending ? t('pricing.submitting') : t('pricing.submit')}
            </button>
        </form>
    )
}
