import type { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
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
            <body>
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
