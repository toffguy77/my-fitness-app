import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { Toaster } from 'react-hot-toast'
import { YandexMetrika } from '@/shared/components/YandexMetrika'
import { MetrikaRouteHits } from '@/shared/components/MetrikaRouteHits'
import { AttributionCapture, AnalyticsIdentity, AnalyticsLifecycle } from '@/shared/analytics'
import { CookieConsent } from '@/shared/components/CookieConsent'
import { ServiceWorkerCleanup } from '@/shared/components/ServiceWorkerCleanup'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { GlobalErrorHandlers } from '@/shared/components/GlobalErrorHandlers'
// Шрифты дизайн-системы — свои копии, без запроса к Google Fonts: кириллица,
// курсив Literata для голоса куратора, и ни одного стороннего хоста в CSP.
import '@fontsource-variable/golos-text'
import '@fontsource-variable/literata/wght.css'
import '@fontsource-variable/literata/wght-italic.css'
import './globals.css'
import { color, values } from '@burcev/design-tokens'

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    // Совпадает с фоном экрана темы (color.bg.canvas), чтобы полоса браузера
    // и системная строка не отличались от страницы.
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: values.light['color.bg.canvas'] },
        { media: '(prefers-color-scheme: dark)', color: values.dark['color.bg.canvas'] },
    ],
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
    openGraph: {
        type: 'website',
        locale: 'ru_RU',
        siteName: 'BURCEV',
        title: 'BURCEV — Фитнес и питание',
        description:
            'Персональный трекер питания, тренировок и прогресса',
        url: 'https://burcev.team',
        images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'BURCEV' }],
    },
    alternates: {
        canonical: 'https://burcev.team',
    },
    robots: {
        index: true,
        follow: true,
    },
}

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Set by middleware.ts for this response. The content policy names this
    // one nonce instead of allowing every inline script on the page.
    const nonce = (await headers()).get('x-nonce') ?? undefined

    return (
        <html lang="ru">
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
