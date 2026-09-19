'use client'

/**
 * Переход по ссылке из письма: обменивает токен на сессию и ведёт дальше.
 *
 * Истёкшая, уже погашенная и поддельная ссылка приходят сюда одним и тем же
 * отказом — так задумано на сервере (см. ConsumeMagicLink в handler.go), и
 * здесь их тоже не различить и незачем: три исхода, о которых знает эта
 * страница — вход в уже существующий аккаунт, вход в аккаунт, который создал
 * именно этот переход, и отказ, — а не тип отказа.
 *
 * Куда вести после входа решает `destinationFor` — то же самое, чем
 * заканчивается вход по паролю и через внешний провайдера: аккаунт, который
 * создал сам этот переход, ещё не проходил онбординг и уйдёт туда, а не в
 * дашборд; существующий аккаунт, уже прошедший его, уйдёт в дашборд. Это
 * точнее, чем судить по одному только `created` — например, аккаунт, у
 * которого онбординг не завершён по другой причине, тоже обязан снова
 * попасть на него, а не в дашборд как обычный клиент.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { magicLinkApi } from '@/features/auth/api/magicLink'
import { leadToken, forgetLeadToken } from '@/features/onboarding/api/guest'
import { destinationFor } from '@/features/auth/utils/session'
import { messageFor } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'

export function MagicLinkConsume({ token }: { token: string }) {
    const router = useRouter()
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    // React вызывает эффекты дважды в разработке; второй обмен потратил бы
    // одноразовый токен впустую, и человек, который на самом деле вошёл,
    // увидел бы отказ вместо своего дашборда.
    const started = useRef(false)

    useEffect(() => {
        if (started.current) return
        started.current = true

        magicLinkApi
            .consume(token, leadToken())
            .then(({ user, created }) => {
                // Тот же след, что оставляет обычный вход (см. storeSession):
                // часть экранов приложения читает localStorage напрямую, не
                // дожидаясь собственного запроса за профилем.
                if (typeof window !== 'undefined') {
                    localStorage.setItem('user', JSON.stringify(user))
                }
                // Заявку гостя сервер переносит на аккаунт только когда
                // переход его создал (см. `if created` в handler.go) — если
                // аккаунт уже существовал, заявка ещё не занята и забывать её
                // рано.
                if (created) {
                    forgetLeadToken()
                }
                router.replace(destinationFor(user))
            })
            .catch((err: unknown) => {
                setErrorMessage(messageFor(err))
            })
    }, [token, router])

    if (errorMessage) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
                <p role="alert" className="text-sm text-gray-900">
                    {errorMessage}
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

    return (
        <main className="flex min-h-screen items-center justify-center" aria-busy="true">
            <p role="status" className="text-sm text-gray-600">
                {t('auth.magicLink.consume.loading')}
            </p>
        </main>
    )
}
