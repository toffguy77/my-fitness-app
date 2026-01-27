import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
    title: 'BURCEV - Fitness & Nutrition Tracker',
    description: 'Track your nutrition, fitness, and progress with BURCEV',
    icons: {
        icon: '/logo.svg',
    },
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="ru">
            <body>{children}</body>
        </html>
    )
}
