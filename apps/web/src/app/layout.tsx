import type { Metadata, Viewport } from 'next'
import { cookies, headers } from 'next/headers'
import { Toaster } from 'react-hot-toast'
import { YandexMetrika } from '@/shared/components/YandexMetrika'
import { MetrikaRouteHits } from '@/shared/components/MetrikaRouteHits'
import { AttributionCapture, AnalyticsIdentity, AnalyticsLifecycle } from '@/shared/analytics'
import { CookieConsent } from '@/shared/components/CookieConsent'
import { ServiceWorkerCleanup } from '@/shared/components/ServiceWorkerCleanup'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { GlobalErrorHandlers } from '@/shared/components/GlobalErrorHandlers'
import { openGraph } from '@/shared/constants/seo'
// Шрифты дизайн-системы — свои копии, без запроса к Google Fonts: кириллица,
// курсив Literata для голоса куратора, и ни одного стороннего хоста в CSP.
import '@fontsource-variable/golos-text'
import '@fontsource-variable/literata/wght.css'
import '@fontsource-variable/literata/wght-italic.css'
import './globals.css'
import { color, values } from '@burcev/design-tokens'
import { THEME_COOKIE, parseThemePreference } from '@/shared/theme/theme'

/**
 * Цвет системной строки совпадает с фоном экрана темы (color.bg.canvas).
 * При явно выбранной теме — её фон, иначе — по системной настройке.
 */
export async function generateViewport(): Promise<Viewport> {
    const theme = parseThemePreference((await cookies()).get(THEME_COOKIE)?.value)
    return {
        width: 'device-width',
        initialScale: 1,
        themeColor: theme === 'system'
            ? [
                { media: '(prefers-color-scheme: light)', color: values.light['color.bg.canvas'] },
                { media: '(prefers-color-scheme: dark)', color: values.dark['color.bg.canvas'] },
            ]
            : values[theme]['color.bg.canvas'],
    }
}

export const metadata: Metadata = {
    metadataBase: new URL('https://burcev.team'),
    title: {
        default: 'BURCEV — Фитнес и питание',
        template: '%s | BURCEV',
    },
    description:
        'Персональный трекер питания, тренировок и прогресса. Контролируй калории, КБЖУ и водный баланс.',
    keywords: [
        'фитнес трекер',
        'дневник питания',
        'калории',
        'КБЖУ',
        'тренировки',
        'нутриенты',
        'водный баланс',
    ],
    authors: [{ name: 'BURCEV' }],
    creator: 'BURCEV',
    // No `url` here and no `alternates.canonical`: whatever the layout names is
    // inherited by every page that does not name its own, and both used to say
    // https://burcev.team — so /legal/terms, /legal/privacy and the 404 page
    // told Yandex they were copies of the home page. Each public page declares
    // its own address.
    //
    // No `robots` either: index, follow is what a crawler assumes anyway, and
    // inherited it sat beside the noindex Next puts on the 404 page — two
    // contradicting tags on one page.
    openGraph: openGraph({
        title: 'BURCEV — Фитнес и питание',
        description:
            'Персональный трекер питания, тренировок и прогресса',
    }),
}

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Set by proxy.ts for this response. The content policy names this
    // one nonce instead of allowing every inline script on the page.
    const nonce = (await headers()).get('x-nonce') ?? undefined
    // Выбранная на этом устройстве тема приходит в разметке сразу: страница
    // не мигает системной темой до загрузки скриптов.
    const theme = parseThemePreference((await cookies()).get(THEME_COOKIE)?.value)

    return (
        <html lang="ru" data-theme={theme === 'system' ? undefined : theme}>
            <head>
                {/* Registers controllerchange before React hydration so skipWaiting SW
                    activations that race ahead of useEffect still trigger a reload. */}
                <script nonce={nonce} dangerouslySetInnerHTML={{ __html: `(function(){if(!('serviceWorker'in navigator))return;var c=navigator.serviceWorker.controller;navigator.serviceWorker.addEventListener('controllerchange',function(){if(c)window.location.reload();});})();` }} />
            </head>
            <body>
                <YandexMetrika nonce={nonce} />
                <MetrikaRouteHits />
                <AttributionCapture />
                <AnalyticsIdentity />
                <AnalyticsLifecycle />
                <CookieConsent />
                <ServiceWorkerCleanup />
                <GlobalErrorHandlers />
                <ErrorBoundary>{children}</ErrorBoundary>
                <Toaster
                    position="top-center"
                    toastOptions={{
                        duration: 3000,
                        // Уведомления говорят голосом системы — той же
                        // тёмной плашкой, что и подсказки куратора.
                        style: {
                            background: color.coach,
                            color: color['on-coach'],
                            borderRadius: 'var(--ds-radius-m)',
                        },
                        success: {
                            duration: 3000,
                            iconTheme: {
                                primary: color.success,
                                secondary: color['on-coach'],
                            },
                        },
                        error: {
                            duration: 4000,
                            iconTheme: {
                                primary: color.danger,
                                secondary: color['on-coach'],
                            },
                        },
                    }}
                />
            </body>
        </html>
    )
}
