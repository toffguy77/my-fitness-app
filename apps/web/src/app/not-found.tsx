import Link from 'next/link'
import { buttonBase, buttonSizes, buttonVariants } from '@/shared/components/ui/Button'
import { cn } from '@/shared/utils/cn'

export default function NotFound() {
    return (
        <div className="flex min-h-[60vh] items-center justify-center bg-canvas px-screen-x py-16">
            <div className="w-full max-w-md text-center">
                <p className="type-num-xl text-fg-subtle">404</p>
                <h1 className="mt-4 type-title-1 text-fg">Страница не найдена</h1>
                <p className="mt-3 type-body text-fg-muted">
                    Возможно, адрес введён с ошибкой или страница была удалена.
                </p>
                <div className="mt-8 flex flex-col items-center gap-2">
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
