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

function Item({ children, onCoach = false }: { children: React.ReactNode; onCoach?: boolean }) {
    return (
        <li className={`flex items-start gap-2.5 type-body ${onCoach ? 'text-on-coach' : 'text-fg'}`}>
            <Check
                className={`mt-1 h-4 w-4 flex-shrink-0 ${onCoach ? 'text-on-coach-muted' : 'text-success-fg'}`}
                strokeWidth={2}
                aria-hidden="true"
            />
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
        <main className="min-h-screen bg-canvas">
            <div className="mx-auto max-w-4xl space-y-6 px-screen-x py-12 sm:py-16">
                <header className="space-y-3">
                    <h1 className="type-display text-fg">{t('pricing.title')}</h1>
                    <p className="type-body text-fg-muted">{t('pricing.lead')}</p>
                </header>

                <div className="grid gap-4 md:grid-cols-2">
                    <section className="rounded-card border border-line bg-surface p-6">
                        <h2 className="type-title-2 text-fg">
                            {t('pricing.freeTitle')}
                        </h2>
                        <ul className="mt-5 space-y-2.5">
                            <Item>{t('pricing.freeCalc')}</Item>
                            <Item>{t('pricing.freeDiary')}</Item>
                            {foodRecognitionEnabled && <Item>{t('pricing.freePhoto')}</Item>}
                            <Item>{t('pricing.freeWeight')}</Item>
                            <Item>{t('pricing.freeHistory')}</Item>
                            <Item>{t('pricing.freeContent')}</Item>
                        </ul>
                    </section>

                    {/* Куратор — голос продукта: тёмная поверхность `coach`, как
                        его карточка на дашборде. */}
                    <section className="rounded-card bg-coach p-6 text-on-coach">
                        <h2 className="type-title-2">
                            {t('pricing.paidTitle')}
                        </h2>
                        <p className="mt-3">
                            <span className="type-num-xl">
                                {t('pricing.paidPrice')}
                            </span>{' '}
                            <span className="text-sm text-on-coach-muted">{t('pricing.paidPeriod')}</span>
                        </p>
                        <ul className="mt-5 space-y-2.5">
                            <Item onCoach>{t('pricing.paidChat')}</Item>
                            <Item onCoach>{t('pricing.paidPlan')}</Item>
                            <Item onCoach>{t('pricing.paidReview')}</Item>
                            {weeklyPhotosEnabled && <Item onCoach>{t('pricing.paidPhotos')}</Item>}
                        </ul>
                        <p className="mt-5 type-caption text-on-coach-muted">{t('pricing.refund')}</p>
                        <Link
                            href="/legal/terms"
                            className="mt-1 inline-flex min-h-11 items-center type-caption font-semibold text-on-coach underline underline-offset-2"
                        >
                            {t('pricing.termsLink')}
                        </Link>
                    </section>
                </div>

                <section className="rounded-card border border-line bg-surface p-6">
                    <PricingRequestForm />
                </section>

                <footer className="border-t border-line pt-6">
                    <SellerLine className="text-xs text-fg-subtle" />
                </footer>
            </div>
        </main>
    )
}
