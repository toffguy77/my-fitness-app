import Link from 'next/link'

export default function NotFound() {
    return (
        <div className="flex min-h-[60vh] items-center justify-center px-4">
            <div className="w-full max-w-md text-center">
                <p className="text-5xl font-semibold text-fg-subtle">404</p>
                <h1 className="mt-4 text-xl font-semibold text-fg">Страница не найдена</h1>
                <p className="mt-2 text-sm text-fg-muted">
                    Возможно, адрес введён с ошибкой или страница была удалена.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm">
                    <Link href="/" className="rounded-md bg-primary px-4 py-2 text-on-primary hover:bg-primary-hover">
                        На главную
                    </Link>
                    <Link href="/dashboard" className="text-primary hover:underline">
                        В личный кабинет
                    </Link>
                    <Link href="/food-tracker" className="text-primary hover:underline">
                        Дневник питания
                    </Link>
                </div>
            </div>
        </div>
    )
}
