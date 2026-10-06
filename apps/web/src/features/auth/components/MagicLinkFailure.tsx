/**
 * Отказ на странице перехода по ссылке — по любой причине: сервер не принял
 * токен, токена вовсе не оказалось в адресе, или обмен не доехал до сети.
 *
 * Общая разметка для `page.tsx` (нет токена — отказ ещё до обращения к
 * серверу) и `MagicLinkConsume.tsx` (сервер отказал или сеть подвела) —
 * раньше это были две копии одних и тех же классов, которые легко было
 * поправить в одном месте и забыть про другое.
 *
 * Без хуков и браузерных API — годится и в серверном, и в клиентском дереве,
 * своей директивы не требует.
 *
 * `onRetry` — только для сетевого отказа обмена (см. MagicLinkConsume):
 * ссылка тогда могла остаться непогашенной, и повтор — не пустой жест. Отказ
 * сервера («Ссылка недействительна») этой кнопки не получает — ссылка уже
 * погашена или никогда не существовала, повторять нечего, а путь ко входу
 * уже есть ниже.
 */

import Link from 'next/link'
import { t } from '@/shared/i18n'
import { buttonBase, buttonSizes, buttonVariants } from '@/shared/components/ui/Button'
import { cn } from '@/shared/utils/cn'
import { AuthShell } from './AuthShell'

export function MagicLinkFailure({
    message,
    onRetry,
}: {
    message: string
    onRetry?: () => void
}) {
    return (
        <AuthShell centered className="text-center">
            <h1 className="type-title-1 text-fg">{t('auth.magicLink.consume.title')}</h1>
            <p role="alert" className="mt-4 rounded-tile bg-danger-soft p-4 type-callout text-danger-fg">
                {message}
            </p>
            <div className="mt-8 flex flex-col items-center gap-2">
                {onRetry && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className={cn(buttonBase, buttonVariants.primary, buttonSizes.lg, 'w-full')}
                    >
                        {t('auth.magicLink.consume.retry')}
                    </button>
                )}
                <Link
                    href="/auth"
                    // Вторая кнопка того же вида рядом с «Повторить» выглядела бы
                    // как два равнозначных первичных действия; без повтора это
                    // единственное действие на экране, и вид у него главный.
                    className={cn(
                        buttonBase,
                        onRetry ? buttonVariants.ghost : buttonVariants.primary,
                        buttonSizes.lg,
                        'w-full',
                    )}
                >
                    {t('auth.oauth.backToSignIn')}
                </Link>
            </div>
        </AuthShell>
    )
}
