'use client'

import { useEffect } from 'react'
import { useSession } from '@/shared/hooks/useSession'
import { linkVisitor } from './identity'

/**
 * Сшивает браузер с пользователем, как только появляется сессия.
 *
 * Смонтирован в корневом макете, а не на странице входа: сессия появляется не
 * только там. Вход по ссылке из письма, возврат от внешнего провайдера и
 * восстановление сессии после перезагрузки — три разных пути, и на каждом
 * сшивка нужна одинаково. Привязать её к одному экрану значило бы потерять два
 * остальных, причём молча.
 *
 * `restoring` — настоящее состояние, а не «пока не вошёл»: на свежезагруженной
 * странице сессия ещё выясняется. Поэтому ждём именно `authenticated`.
 */
export function AnalyticsIdentity() {
    const session = useSession()

    useEffect(() => {
        if (session !== 'authenticated') return
        void linkVisitor()
    }, [session])

    return null
}
