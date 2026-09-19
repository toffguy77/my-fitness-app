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
import { magicLinkApi } from '@/features/auth/api/magicLink'
import { leadToken, forgetLeadToken } from '@/features/onboarding/api/guest'
import { destinationFor } from '@/features/auth/utils/session'
import { setUser } from '@/shared/utils/token-storage'
import { messageFor } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'
import { MagicLinkFailure } from './MagicLinkFailure'

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

        // Токен из адреса не должен задержаться там дольше первого рендера:
        // Яндекс.Метрика (веб-визор в layout.tsx) фиксирует текущий URL, и
        // при сетевом отказе обмена — не при отказе сервера, тогда ссылка
        // уже погашена — токен остаётся действительным ещё пятнадцать минут.
        // Строка ниже убирает его из адресной строки, не трогая историю:
        // назад со страницы уводит туда же, откуда пришли.
        if (typeof window !== 'undefined') {
            window.history.replaceState({}, '', window.location.pathname)
        }

        magicLinkApi
            .consume(token, leadToken())
            .then(({ user, created }) => {
                // Тем же ключом, что и `storeSession` при обычном входе —
                // часть экранов приложения читает localStorage напрямую, не
                // дожидаясь собственного запроса за профилем. В отличие от
                // storeSession это не полный след обычного входа: токена в
                // ответе нет по контракту этой ручки (сессия — HttpOnly
                // cookie), поэтому apiClient.setToken здесь не зовётся и
                // подписчики on-session-change не оповещаются — следующий
                // защищённый запрос сам обменяет cookie на токен через
                // обычный 401→refresh.
                setUser(user)
                // Заявку гостя сервер переносит на аккаунт только когда
                // переход его создал (см. `if created` в handler.go) — если
                // аккаунт уже существовал, заявка ещё не занята сервером, и
                // забывать её раньше времени значило бы потерять расчёт
                // безвозвратно.
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
        return <MagicLinkFailure message={errorMessage} />
    }

    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-2" aria-busy="true">
            <h1 className="text-lg font-semibold text-gray-900">{t('auth.magicLink.consume.title')}</h1>
            <p role="status" className="text-sm text-gray-600">
                {t('auth.magicLink.consume.loading')}
            </p>
        </main>
    )
}
