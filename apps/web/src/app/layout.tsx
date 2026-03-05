import type { Metadata, Viewport } from 'next'
import { Toaster } from 'react-hot-toast'
import { YandexMetrika } from '@/shared/components/YandexMetrika'
import './globals.css'

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    themeColor: '#000000',
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
    icons: { icon: '/logo.svg' },
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

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="ru">
            <body>
                <YandexMetrika />
                {children}
                <Toaster
                    position="top-center"
                    toastOptions={{
                        duration: 3000,
                        style: {
                            background: '#363636',
                            color: '#fff',
                        },
                        success: {
                            duration: 3000,
                            iconTheme: {
                                primary: '#10b981',
                                secondary: '#fff',
                            },
                        },
                        error: {
                            duration: 4000,
                            iconTheme: {
                                primary: '#ef4444',
                                secondary: '#fff',
                            },
                        },
                    }}
                />
            </body>
        </html>
    )
}
