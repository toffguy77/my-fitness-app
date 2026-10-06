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
import { AuthShell } from '@/features/auth/components/AuthShell'
import { buttonBase, buttonSizes, buttonVariants } from '@/shared/components/ui/Button'
import { cn } from '@/shared/utils/cn'

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

    const action = cn(buttonBase, buttonVariants.primary, buttonSizes.lg, 'mt-8 w-full')

    return (
        <AuthShell centered className="text-center">
            {state === 'working' && (
                <p role="status" className="type-body text-fg-muted">Отписываем...</p>
            )}

            {state === 'done' && (
                <>
                    <h1 className="type-title-1 text-fg">Писем больше не будет</h1>
                    <p className="mt-3 type-body text-fg-muted">
                        Уведомления остаются в приложении — там ничего не пропадёт. Письма о
                        входе и восстановлении пароля продолжат приходить: без них нельзя
                        вернуть доступ.
                    </p>
                    <Link href="/settings/notifications" className={action}>
                        Настроить уведомления
                    </Link>
                </>
            )}

            {state === 'failed' && (
                <>
                    <h1 className="type-title-1 text-fg">Ссылка не сработала</h1>
                    <p className="mt-3 type-body text-fg-muted">
                        Возможно, срок её действия истёк. Отписаться можно в настройках
                        уведомлений.
                    </p>
                    <Link href="/settings/notifications" className={action}>
                        Открыть настройки
                    </Link>
                </>
            )}
        </AuthShell>
    )
}

export default function UnsubscribePage() {
    return (
        <Suspense fallback={null}>
            <Unsubscribe />
        </Suspense>
    )
}
