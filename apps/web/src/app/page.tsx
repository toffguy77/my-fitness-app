import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/shared/components/ui'
import { JsonLd } from '@/shared/components/JsonLd'
import { AuthRedirect } from './_components/AuthRedirect'
import { SupportLink } from '@/shared/components/SupportLink'
import { SupportWidget } from '@/features/support/components/SupportWidget'
import { TrackView, TrackScrollDepth, EVENTS } from '@/shared/analytics'
import { t } from '@/shared/i18n'

const API_URL = process.env.INTERNAL_API_URL || 'http://api:4000'

// Сколько ждать /ready, прежде чем рендерить лендинг без утверждений о
// способностях. Тот же приём, что у ARTICLE_FETCH_TIMEOUT_MS в
// apps/web/src/app/sitemap.ts:7 — граница на ожидание, а не зависание.
// Этот лендинг динамический (корневой layout зовёт headers() ради nonce),
// значит рендерится заново на каждый заход: не ограничь мы /ready сроком,
// зависший ответ (сеть есть, ответа нет — ровно как в инциденте с DNS)
// задержал бы каждого посетителя, а не только сборку.
//
// Экспортирована ради теста ниже (page.test.tsx) — тест сверяется с
// реальным значением, а не дублирует магическое число рядом.
export const READY_TIMEOUT_MS = 2000

/**
 * Способности этого развёртывания, по мнению самого API.
 *
 * Строятся не из переменной сборки, а из живого `/ready`: способность
 * выводится на бэкенде из наличия учётных данных (`config.Features`), и
 * второй источник правды здесь молча разошёлся бы с первым. Пустой объект
 * при любом отказе — не перестраховка, а единственный честный вариант:
 * обещание, которое некому подтвердить, не даётся. Лендинг при этом всё
 * равно открывается — он и без тезисов о способностях работает.
 */
async function enabledFeatures(): Promise<Record<string, boolean>> {
    try {
        const res = await fetch(`${API_URL}/ready`, {
            next: { revalidate: 60 },
            signal: AbortSignal.timeout(READY_TIMEOUT_MS),
        })
        if (!res.ok) return {}
        const data = await res.json()
        return data?.features || {}
    } catch {
        return {}
    }
}

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

const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'BURCEV',
    url: 'https://burcev.team',
    logo: 'https://burcev.team/logo.svg',
    description: t('landing.meta.organizationDescription'),
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
            <JsonLd data={organizationJsonLd} />
            <JsonLd data={webAppJsonLd} />
            <AuthRedirect />
            <TrackView event={EVENTS.landingViewed} />
            <TrackScrollDepth />
            <div className="min-h-screen bg-white">
                {/* Шапка: только логотип и два действия — вход и регистрация,
                    оба без прокрутки. Герой (h1, основное действие) — уже
                    внутри <main>, не здесь: иначе обход по ориентирам минует
                    и главный заголовок, и главную кнопку. */}
                <header className="relative bg-gradient-to-b from-blue-50 to-white">
                    <nav
                        aria-label={t('landing.nav.ariaLabel')}
                        className="relative mx-auto flex max-w-5xl items-center justify-between px-6 py-8"
                    >
                        <Logo width={140} height={42} className="text-gray-900" />
                        <div className="flex items-center gap-6">
                            <Link
                                href="/auth"
                                className="text-sm font-medium text-gray-700 hover:text-gray-900"
                            >
                                {t('landing.nav.signIn')}
                            </Link>
                            <Link
                                href="/auth?mode=register"
                                className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                            >
                                {t('landing.nav.register')}
                            </Link>
                        </div>
                    </nav>
                </header>

                <main>
                    {/* Герой: расчёт остаётся основным действием — он не требует аккаунта. */}
                    <div className="relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-emerald-50" />
                        <div className="relative mx-auto max-w-5xl px-6 pt-8 pb-24 text-center">
                            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
                                {t('landing.hero.title')}
                            </h1>
                            <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 sm:text-xl">
                                {t('landing.hero.subtitle')}
                            </p>
                            <div className="mt-10 flex flex-col items-center gap-4">
                                <Link
                                    href="/onboarding"
                                    className="inline-flex h-12 items-center justify-center rounded-lg bg-blue-600 px-8 text-lg font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                                >
                                    {t('landing.hero.cta')}
                                </Link>
                                <Link
                                    href="/auth"
                                    className="text-sm font-medium text-gray-500 hover:text-gray-700"
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
                    <section className="mx-auto max-w-5xl px-6 py-20">
                        <h2 className="text-center text-3xl font-bold text-gray-900">
                            {t('landing.claims.heading')}
                        </h2>
                        <div className="mt-12 grid gap-8 sm:grid-cols-2">
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

                    {/* Куратор — апселл вторым экраном, без цены и без обещания сроков. */}
                    <section className="bg-gray-50 px-6 py-20">
                        <div className="mx-auto max-w-3xl text-center">
                            <h2 className="text-3xl font-bold text-gray-900">
                                {t('landing.curator.heading')}
                            </h2>
                            <p className="mt-4 text-lg text-gray-600">
                                {t('landing.curator.description')}
                            </p>
                        </div>
                    </section>

                    {/* Социальное доказательство: размечено, но пусто, пока данных нет. */}
                    {socialProof.length > 0 && (
                        <section
                            data-testid="landing-social-proof"
                            className="mx-auto max-w-5xl px-6 py-20"
                        >
                            <div className="grid gap-8 sm:grid-cols-3">
                                {socialProof.map((item) => (
                                    <blockquote
                                        key={item.id}
                                        className="rounded-xl border border-gray-200 p-6"
                                    >
                                        <p className="text-gray-700">{item.quote}</p>
                                        <footer className="mt-4 text-sm text-gray-500">
                                            {item.name}
                                        </footer>
                                    </blockquote>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Призыв перед подвалом: вход и регистрация рядом, без действия расчёта. */}
                    <section className="px-6 py-20">
                        <div
                            data-testid="landing-cta"
                            className="mx-auto max-w-2xl text-center"
                        >
                            <h2 className="text-3xl font-bold text-gray-900">
                                {t('landing.cta.heading')}
                            </h2>
                            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                                <Link
                                    href="/auth"
                                    className="inline-flex h-12 items-center justify-center rounded-lg border border-gray-300 px-8 text-lg font-medium text-gray-900 transition-colors hover:bg-gray-50"
                                >
                                    {t('landing.cta.signIn')}
                                </Link>
                                <Link
                                    href="/auth?mode=register"
                                    className="inline-flex h-12 items-center justify-center rounded-lg bg-blue-600 px-8 text-lg font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                                >
                                    {t('landing.cta.register')}
                                </Link>
                            </div>
                        </div>
                    </section>
                </main>

                <footer className="border-t border-gray-200 px-6 py-8">
                    <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
                        <Logo width={120} height={36} className="text-gray-400" />
                        <nav
                            aria-label={t('landing.footer.ariaLabel')}
                            className="flex gap-6 text-sm text-gray-500"
                        >
                            <SupportLink className="hover:text-gray-700" />
                            <Link href="/content" className="hover:text-gray-700">
                                {t('landing.footer.articles')}
                            </Link>
                            <Link href="/legal/terms" className="hover:text-gray-700">
                                {t('landing.footer.terms')}
                            </Link>
                            <Link href="/legal/privacy" className="hover:text-gray-700">
                                {t('landing.footer.privacy')}
                            </Link>
                        </nav>
                        <p className="text-sm text-gray-400">
                            {new Date().getFullYear()} BURCEV
                        </p>
                    </div>
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
        <div className="rounded-xl border border-gray-200 p-6 transition-shadow hover:shadow-md">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="mt-2 text-gray-600">{description}</p>
        </div>
    )
}
