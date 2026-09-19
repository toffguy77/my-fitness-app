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

export function MagicLinkFailure({
    message,
    onRetry,
}: {
    message: string
    onRetry?: () => void
}) {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
            <h1 className="text-lg font-semibold text-gray-900">{t('auth.magicLink.consume.title')}</h1>
            <p role="alert" className="text-sm text-gray-900">
                {message}
            </p>
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                    {t('auth.magicLink.consume.retry')}
                </button>
            )}
            <Link
                href="/auth"
                // Вторая кнопка того же вида рядом с «Повторить» выглядела бы
                // как два равнозначных первичных действия; без повтора это
                // единственное действие на экране, и вид у него прежний.
                className={
                    onRetry
                        ? 'text-sm font-medium text-blue-600 hover:text-blue-700'
                        : 'rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700'
                }
            >
                {t('auth.oauth.backToSignIn')}
            </Link>
        </main>
    )
}
