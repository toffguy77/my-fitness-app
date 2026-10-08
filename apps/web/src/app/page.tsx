import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Logo } from '@/shared/components/ui'
import { buttonBase, buttonSizes, buttonVariants } from '@/shared/components/ui/Button'
import { cn } from '@/shared/utils/cn'
import { JsonLd } from '@/shared/components/JsonLd'
import { SellerLine } from '@/shared/components/SellerLine'
import { AuthRedirect } from './_components/AuthRedirect'
import { SupportLink } from '@/shared/components/SupportLink'
import { SupportWidget } from '@/features/support/components/SupportWidget'
import { enabledFeatures } from '@/shared/api/features'
import { TrackView, TrackScrollDepth, EVENTS } from '@/shared/analytics'
import { t } from '@/shared/i18n'
import { organizationJsonLd } from './organizationJsonLd'

export const metadata: Metadata = {
    title: t('landing.meta.title'),
    description: t('landing.meta.description'),
    openGraph: {
        title: t('landing.meta.title'),
        description: t('landing.meta.ogDescription'),
        url: 'https://burcev.team',
    },
    alternates: {
        canonical: 'https://burcev.team',
    },
}

const webAppJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'BURCEV',
    url: 'https://burcev.team',
    applicationCategory: 'HealthApplication',
    operatingSystem: 'Web',
    offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'RUB',
    },
    description: t('landing.meta.description'),
}

// Пока подтверждённых отзывов и результатов в системе нет — слот социального
// доказательства размечается, но остаётся пустым, а не выдуманным.
const socialProof: Array<{ id: string; quote: string; name: string }> = []

export default async function Home({
    features,
}: {
    features?: Record<string, boolean>
} = {}) {
    // `features` передаётся явно только из тестов — обходит сеть и делает
    // условный рендер детерминированным. В остальных случаях страница
    // спрашивает API сама.
    const resolvedFeatures = features ?? (await enabledFeatures())
    const foodRecognitionEnabled = resolvedFeatures.food_recognition === true

    return (
        <>
            <JsonLd data={organizationJsonLd()} />
            <JsonLd data={webAppJsonLd} />
            <AuthRedirect />
            <TrackView event={EVENTS.landingViewed} />
            <TrackScrollDepth />
            <div className="min-h-screen bg-canvas">
                {/* Шапка: только логотип и два действия — вход и регистрация,
                    оба без прокрутки. Герой (h1, основное действие) — уже
                    внутри <main>, не здесь: иначе обход по ориентирам минует
                    и главный заголовок, и главную кнопку. */}
                <header className="relative">
                    <nav
                        aria-label={t('landing.nav.ariaLabel')}
                        className="relative mx-auto flex max-w-5xl items-center justify-between gap-4 px-screen-x py-6 sm:py-8"
                    >
                        <Logo width={132} height={40} className="text-fg" />
                        <div className="flex items-center gap-2 sm:gap-4">
                            <Link
                                href="/auth"
                                className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-fg hover:text-fg-muted"
                            >
                                {t('landing.nav.signIn')}
                            </Link>
                            {/* Контуром: терракота на этом экране одна — у расчёта в герое. */}
                            <Link
                                href="/auth?mode=register"
                                className={cn(buttonBase, buttonVariants.secondary, buttonSizes.md)}
                            >
                                {t('landing.nav.register')}
                            </Link>
                        </div>
                    </nav>
                </header>

                <main>
                    {/* Герой: расчёт остаётся основным действием — он не требует аккаунта. */}
                    <div className="relative">
                        <div className="relative mx-auto max-w-4xl px-screen-x pt-10 pb-20 text-center sm:pt-16 sm:pb-28">
                            <h1 className="font-serif text-4xl font-medium leading-[1.12] tracking-tight text-fg sm:text-5xl md:text-6xl">
                                {t('landing.hero.title')}
                            </h1>
                            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-fg-muted sm:text-xl">
                                {t('landing.hero.subtitle')}
                            </p>
                            <div className="mt-10 flex flex-col items-center gap-3">
                                <Link
                                    href="/onboarding"
                                    className={cn(buttonBase, buttonVariants.primary, buttonSizes.lg, 'px-8 text-lg')}
                                >
                                    {t('landing.hero.cta')}
                                </Link>
                                <Link
                                    href="/auth"
                                    className="inline-flex min-h-11 items-center text-sm font-medium text-fg-muted hover:text-fg"
                                >
                                    {t('landing.hero.haveAccount')}
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* До четырёх тезисов вместо шести карточек возможностей
                        (три, когда food_recognition выключена — см. ниже).
                        photoFood рендерится только когда API подтвердил
                        способность. */}
                    <section className="mx-auto max-w-5xl px-screen-x py-16 sm:py-20">
                        <h2 className="text-center font-serif text-3xl font-medium tracking-tight text-fg sm:text-4xl">
                            {t('landing.claims.heading')}
                        </h2>
                        <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2">
                            <ClaimCard
                                title={t('landing.claims.instantNorm.title')}
                                description={t('landing.claims.instantNorm.description')}
                            />
                            {foodRecognitionEnabled && (
                                <ClaimCard
                                    title={t('landing.claims.photoFood.title')}
                                    description={t('landing.claims.photoFood.description')}
                                />
                            )}
                            <ClaimCard
                                title={t('landing.claims.curatorSeesDiary.title')}
                                description={t('landing.claims.curatorSeesDiary.description')}
                            />
                            <ClaimCard
                                title={t('landing.claims.startToday.title')}
                                description={t('landing.claims.startToday.description')}
                            />
                        </div>
                    </section>

                    {/* Куратор — апселл вторым экраном, без цены и без обещания сроков.
                        Голос продукта — тёмная поверхность `coach` и засечки: так
                        куратор выглядит и в приложении. */}
                    <section className="px-screen-x py-4 sm:py-8">
                        <div className="mx-auto max-w-5xl rounded-sheet bg-coach px-6 py-14 text-center text-on-coach sm:px-12 sm:py-20">
                            <div className="mx-auto max-w-3xl">
                                <h2 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">
                                    {t('landing.curator.heading')}
                                </h2>
                                <p className="mt-5 text-lg leading-relaxed text-on-coach">
                                    {t('landing.curator.description')}
                                </p>
                                {/* Граница названа прямо, цена — нет: она живёт на
                                    одной странице, и повторённое число расходится с
                                    ней, после чего непонятно, какое обязательство. */}
                                <p className="mt-5 text-base text-on-coach-muted">
                                    {t('landing.curator.boundary')}
                                </p>
                                <Link
                                    href="/pricing"
                                    className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-base font-semibold text-on-coach underline underline-offset-4"
                                >
                                    {t('landing.curator.pricingLink')}
                                    <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                                </Link>
                            </div>
                        </div>
                    </section>

                    {/* Социальное доказательство: размечено, но пусто, пока данных нет. */}
                    {socialProof.length > 0 && (
                        <section
                            data-testid="landing-social-proof"
                            className="mx-auto max-w-5xl px-screen-x py-20"
                        >
                            <div className="grid gap-4 sm:grid-cols-3">
                                {socialProof.map((item) => (
                                    <blockquote
                                        key={item.id}
                                        className="rounded-card border border-line bg-surface p-6"
                                    >
                                        <p className="type-quote text-fg">{item.quote}</p>
                                        <footer className="mt-4 text-sm text-fg-muted">
                                            {item.name}
                                        </footer>
                                    </blockquote>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Призыв перед подвалом: вход и регистрация рядом, без действия расчёта. */}
                    <section className="px-screen-x py-16 sm:py-24">
                        <div
                            data-testid="landing-cta"
                            className="mx-auto max-w-2xl text-center"
                        >
                            <h2 className="font-serif text-3xl font-medium tracking-tight text-fg sm:text-4xl">
                                {t('landing.cta.heading')}
                            </h2>
                            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                                <Link
                                    href="/auth"
                                    className={cn(buttonBase, buttonVariants.secondary, buttonSizes.lg, 'px-8')}
                                >
                                    {t('landing.cta.signIn')}
                                </Link>
                                <Link
                                    href="/auth?mode=register"
                                    className={cn(buttonBase, buttonVariants.primary, buttonSizes.lg, 'px-8')}
                                >
                                    {t('landing.cta.register')}
                                </Link>
                            </div>
                        </div>
                    </section>
                </main>

                <footer className="border-t border-line px-screen-x py-8">
                    <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
                        <Logo width={120} height={36} className="text-fg-subtle" />
                        <nav
                            aria-label={t('landing.footer.ariaLabel')}
                            className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-fg-muted"
                        >
                            <SupportLink className="inline-flex min-h-11 items-center hover:text-fg" />
                            <Link href="/kalkulyator-kbzhu" className="inline-flex min-h-11 items-center hover:text-fg">
                                {t('landing.footer.calculator')}
                            </Link>
                            <Link href="/content" className="inline-flex min-h-11 items-center hover:text-fg">
                                {t('landing.footer.articles')}
                            </Link>
                            <Link href="/legal/terms" className="inline-flex min-h-11 items-center hover:text-fg">
                                {t('landing.footer.terms')}
                            </Link>
                            <Link href="/legal/privacy" className="inline-flex min-h-11 items-center hover:text-fg">
                                {t('landing.footer.privacy')}
                            </Link>
                        </nav>
                        <p className="text-sm text-fg-subtle tabular-nums">
                            {new Date().getFullYear()} BURCEV
                        </p>
                    </div>
                    <SellerLine className="mx-auto mt-4 max-w-5xl text-center text-xs text-fg-subtle sm:text-left" />
                </footer>
            </div>

            {/* Клиентский остров: своя ошибка не должна перерисовывать
                серверный лендинг, а её отсутствие в разметке не должно
                мешать роботам читать саму страницу. */}
            <SupportWidget />
        </>
    )
}

function ClaimCard({ title, description }: { title: string; description: string }) {
    return (
        <div className="rounded-card border border-line bg-surface p-6">
            <h3 className="type-title-3 text-fg">{title}</h3>
            <p className="mt-2 type-body text-fg-muted">{description}</p>
        </div>
    )
}
