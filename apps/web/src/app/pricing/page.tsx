import type { Metadata } from 'next'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { enabledFeatures } from '@/shared/api/features'
import { PricingRequestForm } from '@/features/onboarding/components/PricingRequestForm'
import { t } from '@/shared/i18n'
import { SellerLine } from '@/shared/components/SellerLine'

/**
 * Страница тарифов — та, на которую ссылается публичная оферта.
 *
 * Открыта без учётной записи и открыта поиску: обязательство, доступное только
 * своим, необязательством не становится, но проверить его снаружи невозможно.
 * Заодно это единственная страница, где сказано, что продаётся, — то есть
 * SEO-актив, а не служебный экран.
 *
 * Цена приводится здесь и только здесь. Оферта ссылается сюда, посадочная —
 * тоже: повторённое число расходится, и какое из двух обязательство,
 * становится неизвестно. Изменение цены не требует правки оферты.
 *
 * Утверждения о бесплатной части сверяются с живыми способностями
 * развёртывания: обещание распознавания еды там, где для него нет учётных
 * данных, — обещание отказа 503.
 */

export const metadata: Metadata = {
    title: t('pricing.meta.title'),
    description: t('pricing.meta.description'),
    openGraph: {
        title: t('pricing.meta.title'),
        description: t('pricing.meta.description'),
        url: 'https://burcev.team/pricing',
    },
    alternates: {
        canonical: 'https://burcev.team/pricing',
    },
}

function Item({ children }: { children: React.ReactNode }) {
    return (
        <li className="flex items-start gap-2 text-sm text-gray-700">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" aria-hidden="true" />
            <span>{children}</span>
        </li>
    )
}

export default async function PricingPage({
    features,
}: {
    features?: Record<string, boolean>
} = {}) {
    // `features` передаётся явно только из тестов — обходит сеть и делает
    // условный рендер детерминированным. Тот же приём, что на посадочной.
    const resolvedFeatures = features ?? (await enabledFeatures())
    const foodRecognitionEnabled = resolvedFeatures.food_recognition === true
    const weeklyPhotosEnabled = resolvedFeatures.weekly_photos === true

    return (
        <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl space-y-6">
                <header className="space-y-2">
                    <h1 className="text-3xl font-bold text-gray-900">{t('pricing.title')}</h1>
                    <p className="text-gray-600">{t('pricing.lead')}</p>
                </header>

                <div className="grid gap-6 md:grid-cols-2">
                    <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                        <h2 className="text-lg font-semibold text-gray-900">
                            {t('pricing.freeTitle')}
                        </h2>
                        <ul className="mt-4 space-y-2">
                            <Item>{t('pricing.freeCalc')}</Item>
                            <Item>{t('pricing.freeDiary')}</Item>
                            {foodRecognitionEnabled && <Item>{t('pricing.freePhoto')}</Item>}
                            <Item>{t('pricing.freeWeight')}</Item>
                            <Item>{t('pricing.freeHistory')}</Item>
                            <Item>{t('pricing.freeContent')}</Item>
                        </ul>
                    </section>

                    <section className="rounded-xl border-2 border-blue-100 bg-white p-6 shadow-sm">
                        <h2 className="text-lg font-semibold text-gray-900">
                            {t('pricing.paidTitle')}
                        </h2>
                        <p className="mt-2">
                            <span className="text-3xl font-bold text-gray-900">
                                {t('pricing.paidPrice')}
                            </span>{' '}
                            <span className="text-sm text-gray-500">{t('pricing.paidPeriod')}</span>
                        </p>
                        <ul className="mt-4 space-y-2">
                            <Item>{t('pricing.paidChat')}</Item>
                            <Item>{t('pricing.paidPlan')}</Item>
                            <Item>{t('pricing.paidReview')}</Item>
                            {weeklyPhotosEnabled && <Item>{t('pricing.paidPhotos')}</Item>}
                        </ul>
                        <p className="mt-4 text-xs text-gray-500">{t('pricing.refund')}</p>
                        <Link
                            href="/legal/terms"
                            className="mt-2 inline-block text-xs text-blue-600 underline"
                        >
                            {t('pricing.termsLink')}
                        </Link>
                    </section>
                </div>

                <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                    <PricingRequestForm />
                </section>

                <footer className="border-t border-gray-200 pt-6">
                    <SellerLine className="text-xs text-gray-400" />
                </footer>
            </div>
        </div>
    )
}
