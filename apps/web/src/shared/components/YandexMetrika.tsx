'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'
import { analyticsChoice, COOKIE_CHOICE_KEY } from './CookieConsent'

const METRIKA_ID = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID

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
    const [allowed, setAllowed] = useState(false)

    useEffect(() => {
        const read = () => setAllowed(analyticsChoice() === 'granted')
        read()
        const onStorage = (event: StorageEvent) => {
            if (event.key === COOKIE_CHOICE_KEY) read()
        }
        // Собственное событие: в своей вкладке storage не срабатывает.
        window.addEventListener('analytics-consent-changed', read)
        window.addEventListener('storage', onStorage)
        return () => {
            window.removeEventListener('analytics-consent-changed', read)
            window.removeEventListener('storage', onStorage)
        }
    }, [])

    if (!METRIKA_ID || !allowed) return null

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

                    ym(${METRIKA_ID}, "init", {
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
                        src={`https://mc.yandex.ru/watch/${METRIKA_ID}`}
                        style={{ position: 'absolute', left: '-9999px' }}
                        alt=""
                    />
                </div>
            </noscript>
        </>
    )
}
