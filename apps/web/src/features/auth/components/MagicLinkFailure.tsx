/**
 * Отказ на странице перехода по ссылке — по любой причине: сервер не принял
 * токен, или токена вовсе не оказалось в адресе.
 *
 * Общая разметка для `page.tsx` (нет токена — отказ ещё до обращения к
 * серверу) и `MagicLinkConsume.tsx` (сервер отказал) — раньше это были две
 * копии одних и тех же классов, которые легко было поправить в одном месте и
 * забыть про другое.
 *
 * Без хуков и браузерных API — годится и в серверном, и в клиентском дереве,
 * своей директивы не требует.
 */

import Link from 'next/link'
import { t } from '@/shared/i18n'

export function MagicLinkFailure({ message }: { message: string }) {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
            <h1 className="text-lg font-semibold text-gray-900">{t('auth.magicLink.consume.title')}</h1>
            <p role="alert" className="text-sm text-gray-900">
                {message}
            </p>
            <Link
                href="/auth"
                className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
                {t('auth.oauth.backToSignIn')}
            </Link>
        </main>
    )
}
