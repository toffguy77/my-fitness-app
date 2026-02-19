import Link from 'next/link'
import { Logo } from '@/shared/components/ui'

export default function Home() {
    return (
        <main className="min-h-screen bg-white">
            {/* Hero */}
            <section className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-emerald-50" />
                <div className="relative mx-auto max-w-5xl px-6 pt-20 pb-24 text-center">
                    <div className="flex justify-center mb-8">
                        <Logo width={200} height={60} className="text-gray-900" />
                    </div>
                    <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
                        Питание под контролем
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
                        <Link
                            href="/auth"
                            className="inline-flex h-12 items-center justify-center rounded-lg border border-gray-300 bg-white px-8 text-lg font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                        >
                            Войти
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

            {/* CTA */}
            <section className="bg-gray-50 px-6 py-20">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-3xl font-bold text-gray-900">
                        Начните следить за питанием сегодня
                    </h2>
                    <p className="mt-4 text-lg text-gray-600">
                        Бесплатно. Без подписок.
                    </p>
                    <Link
                        href="/auth"
                        className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-blue-600 px-8 text-lg font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                    >
                        Войти в приложение
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-gray-200 px-6 py-8">
                <div className="mx-auto max-w-5xl flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
                    <Logo width={120} height={36} className="text-gray-400" />
                    <p className="text-sm text-gray-400">
                        {new Date().getFullYear()} BURCEV. Все права защищены.
                    </p>
                </div>
            </footer>
        </main>
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
