'use client'

import Script from 'next/script'
import { useSyncExternalStore } from 'react'
import { analyticsChoice, subscribeToAnalyticsChoice } from './CookieConsent'


/**
 * Счётчик подключается только после согласия.
 *
 * Раньше скрипт вставлялся при открытии страницы, до всякого вопроса: cookie
 * ставились, поведение записывалось, а согласия не спрашивали ни у кого.
 * Полоса согласия без этой проверки была бы украшением — «отказался» и
 * «согласился» вели бы себя одинаково.
 *
 * Слушаем и событие storage: человек мог ответить в другой вкладке.
 */
export function YandexMetrika({ nonce }: { nonce?: string }) {
    // Читается при отрисовке, а не при загрузке модуля: Next всё равно
    // подставляет значение литералом на сборке, зато проверка может задать
    // его сама. Пока читалось при загрузке, в тестах идентификатора не было
    // вовсе — и проверки «счётчик не подключается» проходили бы даже со
    // снятой защитой.
    const metrikaId = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID
    const allowed =
        useSyncExternalStore(
            subscribeToAnalyticsChoice,
            analyticsChoice,
            () => null,
        ) === 'granted'

    if (!metrikaId || !allowed) return null

    return (
        <>
            <Script
                id="yandex-metrika"
                strategy="afterInteractive"
                nonce={nonce}
            >
                {`
                    (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                    m[i].l=1*new Date();
                    for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r)return;}
                    k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
                    (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

                    ym(${metrikaId}, "init", {
                        clickmap: true,
                        trackLinks: true,
                        accurateTrackBounce: true,
                        webvisor: true
                    });
                `}
            </Script>
            <noscript>
                <div>
                    <img
                        src={`https://mc.yandex.ru/watch/${metrikaId}`}
                        style={{ position: 'absolute', left: '-9999px' }}
                        alt=""
                    />
                </div>
            </noscript>
        </>
    )
}
