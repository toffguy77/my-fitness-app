import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/shared/components/ui'
import { JsonLd } from '@/shared/components/JsonLd'
import { AuthRedirect } from './_components/AuthRedirect'

export const metadata: Metadata = {
    title: 'BURCEV — Трекер питания и фитнеса',
    description:
        'Бесплатный трекер калорий, КБЖУ и водного баланса. Сканируйте штрих-коды, отслеживайте питание и получайте персональные рекомендации.',
    openGraph: {
        title: 'BURCEV — Трекер питания и фитнеса',
        description:
            'Бесплатный трекер калорий, КБЖУ и водного баланса.',
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
    description: 'Персональный трекер питания и фитнеса',
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
    description:
        'Трекер питания, калорий, КБЖУ и водного баланса с персональными рекомендациями',
}

export default function Home() {
    return (
        <>
            <JsonLd data={organizationJsonLd} />
            <JsonLd data={webAppJsonLd} />
            <AuthRedirect />
            <main className="min-h-screen bg-white">
                {/* Hero */}
                <section className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-emerald-50" />
                    <nav className="relative mx-auto max-w-5xl px-6 pt-8 flex items-center justify-between">
                        <Logo width={140} height={42} className="text-gray-900" />
                        <Link
                            href="/auth"
                            className="text-sm font-medium text-gray-700 hover:text-gray-900"
                        >
                            Войти
                        </Link>
                    </nav>
                    <div className="relative mx-auto max-w-5xl px-6 pt-16 pb-24 text-center">
                        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
                            Трекер питания и фитнеса
                        </h1>
                        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 sm:text-xl">
                            Отслеживайте калории, БЖУ и водный баланс.
                            Сканируйте штрих-коды, ищите продукты и получайте персональные рекомендации по питанию.
                        </p>
                        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                            <Link
                                href="/auth"
                                className="inline-flex h-12 items-center justify-center rounded-lg bg-blue-600 px-8 text-lg font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                            >
                                Начать бесплатно
                            </Link>
                        </div>
                    </div>
                </section>

                {/* Features */}
                <section className="mx-auto max-w-5xl px-6 py-20">
                    <h2 className="text-center text-3xl font-bold text-gray-900">
                        Всё для контроля питания
                    </h2>
                    <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                        <FeatureCard
                            icon="🔍"
                            title="Поиск продуктов"
                            description="База из тысяч продуктов с КБЖУ. Находите нужный продукт за секунды."
                        />
                        <FeatureCard
                            icon="📷"
                            title="Сканер штрих-кодов"
                            description="Наведите камеру на упаковку — данные о продукте загрузятся автоматически."
                        />
                        <FeatureCard
                            icon="📊"
                            title="Дневник питания"
                            description="Записывайте завтрак, обед, ужин и перекусы. Следите за дневной нормой КБЖУ."
                        />
                        <FeatureCard
                            icon="💧"
                            title="Водный баланс"
                            description="Отслеживайте количество выпитой воды и достигайте дневной цели."
                        />
                        <FeatureCard
                            icon="🎯"
                            title="Цели и рекомендации"
                            description="Получайте персональные рекомендации по нутриентам на основе ваших целей."
                        />
                        <FeatureCard
                            icon="⭐"
                            title="Избранное"
                            description="Сохраняйте часто используемые продукты для быстрого добавления в дневник."
                        />
                    </div>
                </section>

                {/* How it works */}
                <section className="bg-gray-50 px-6 py-20">
                    <div className="mx-auto max-w-5xl">
                        <h2 className="text-center text-3xl font-bold text-gray-900">
                            Как это работает
                        </h2>
                        <div className="mt-12 grid gap-8 sm:grid-cols-3">
                            <StepCard step={1} title="Зарегистрируйтесь" description="Создайте бесплатный аккаунт за 30 секунд" />
                            <StepCard step={2} title="Добавляйте приёмы пищи" description="Ищите продукты или сканируйте штрих-коды" />
                            <StepCard step={3} title="Следите за прогрессом" description="Контролируйте калории, КБЖУ и водный баланс" />
                        </div>
                    </div>
                </section>

                {/* CTA */}
                <section className="px-6 py-20">
                    <div className="mx-auto max-w-2xl text-center">
                        <h2 className="text-3xl font-bold text-gray-900">
                            Готовы начать?
                        </h2>
                        <p className="mt-4 text-lg text-gray-600">
                            Бесплатно. Без подписок.
                        </p>
                        <div className="mt-8">
                            <Link
                                href="/auth"
                                className="inline-flex h-12 items-center justify-center rounded-lg bg-blue-600 px-8 text-lg font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                            >
                                Зарегистрироваться
                            </Link>
                        </div>
                    </div>
                </section>

                {/* Footer */}
                <footer className="border-t border-gray-200 px-6 py-8">
                    <div className="mx-auto max-w-5xl flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
                        <Logo width={120} height={36} className="text-gray-400" />
                        <nav className="flex gap-6 text-sm text-gray-500">
                            <Link href="/content" className="hover:text-gray-700">Статьи</Link>
                            <Link href="/legal/terms" className="hover:text-gray-700">Оферта</Link>
                            <Link href="/legal/privacy" className="hover:text-gray-700">Конфиденциальность</Link>
                        </nav>
                        <p className="text-sm text-gray-400">
                            {new Date().getFullYear()} BURCEV
                        </p>
                    </div>
                </footer>
            </main>
        </>
    )
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
    return (
        <div className="rounded-xl border border-gray-200 p-6 transition-shadow hover:shadow-md">
            <div className="text-3xl">{icon}</div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
            <p className="mt-2 text-gray-600">{description}</p>
        </div>
    )
}

function StepCard({ step, title, description }: { step: number; title: string; description: string }) {
    return (
        <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-600">
                {step}
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
            <p className="mt-2 text-gray-600">{description}</p>
        </div>
    )
}
