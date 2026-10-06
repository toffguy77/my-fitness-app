'use client'

/**
 * The page the link at the bottom of a digest opens.
 *
 * It works without a session on purpose. Asking somebody to sign in before
 * they can stop receiving email is how a product ends up reported as spam.
 */

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { unsubscribeFromEmail } from '@/features/notifications/api/deliveryApi'

type State = 'working' | 'done' | 'failed'

function Unsubscribe() {
    const token = useSearchParams().get('token')
    // A link with no token has already failed; that is known at the first
    // render, not after one.
    const [state, setState] = useState<State>(token ? 'working' : 'failed')

    useEffect(() => {
        if (!token) return
        unsubscribeFromEmail(token)
            .then(() => setState('done'))
            .catch(() => setState('failed'))
    }, [token])

    return (
        <main className="flex min-h-screen flex-col justify-center bg-canvas px-6">
            <div className="mx-auto w-full max-w-md rounded-lg border border-line bg-surface p-6 text-center shadow-sm">
                {state === 'working' && (
                    <p className="text-sm text-fg-muted">Отписываем...</p>
                )}

                {state === 'done' && (
                    <>
                        <h1 className="text-lg font-semibold text-fg">Писем больше не будет</h1>
                        <p className="mt-2 text-sm text-fg-muted">
                            Уведомления остаются в приложении — там ничего не пропадёт. Письма о
                            входе и восстановлении пароля продолжат приходить: без них нельзя
                            вернуть доступ.
                        </p>
                        <Link
                            href="/settings/notifications"
                            className="mt-6 inline-block rounded-lg bg-primary px-6 py-3 text-sm font-medium text-on-primary hover:bg-primary-hover"
                        >
                            Настроить уведомления
                        </Link>
                    </>
                )}

                {state === 'failed' && (
                    <>
                        <h1 className="text-lg font-semibold text-fg">Ссылка не сработала</h1>
                        <p className="mt-2 text-sm text-fg-muted">
                            Возможно, срок её действия истёк. Отписаться можно в настройках
                            уведомлений.
                        </p>
                        <Link
                            href="/settings/notifications"
                            className="mt-6 inline-block rounded-lg bg-primary px-6 py-3 text-sm font-medium text-on-primary hover:bg-primary-hover"
                        >
                            Открыть настройки
                        </Link>
                    </>
                )}
            </div>
        </main>
    )
}

export default function UnsubscribePage() {
    return (
        <Suspense fallback={null}>
            <Unsubscribe />
        </Suspense>
    )
}
