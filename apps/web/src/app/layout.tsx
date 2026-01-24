import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
    title: 'BURCEV - Development',
    description: 'Development environment',
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
