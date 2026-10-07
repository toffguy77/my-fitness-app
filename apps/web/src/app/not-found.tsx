import Link from 'next/link'
import { Compass } from 'lucide-react'
import { buttonBase, buttonSizes, buttonVariants } from '@/shared/components/ui/Button'
import { cn } from '@/shared/utils/cn'

export default function NotFound() {
    return (
        <div className="flex min-h-[60vh] items-center justify-center bg-canvas px-screen-x py-16">
            <div className="flex w-full max-w-md flex-col items-center text-center">
                {/* Спокойное пустое состояние: значок в нейтральном круге, код —
                    меткой, а не крупным числом — это не показатель. */}
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-subtle text-fg-muted" aria-hidden="true">
                    <Compass className="h-7 w-7" strokeWidth={1.8} />
                </span>
                <p className="mt-5 type-overline tabular-nums text-fg-subtle">404</p>
                <h1 className="mt-1 type-title-2 text-fg">Страница не найдена</h1>
                <p className="mt-3 type-body text-fg-muted">
                    Возможно, адрес введён с ошибкой или страница была удалена.
                </p>
                <div className="mt-8 flex w-full flex-col items-center gap-2">
                    <Link href="/" className={cn(buttonBase, buttonVariants.primary, buttonSizes.lg, 'w-full sm:w-auto sm:px-8')}>
                        На главную
                    </Link>
                    <div className="flex flex-wrap items-center justify-center gap-x-6 text-sm">
                        <Link href="/dashboard" className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline">
                            В личный кабинет
                        </Link>
                        <Link href="/food-tracker" className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline">
                            Дневник питания
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
