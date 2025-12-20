'use client'
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WifiOff, RefreshCw } from 'lucide-react'

export default function OfflinePage() {
    const router = useRouter()
    const [isOnline, setIsOnline] = useState(false)

    useEffect(() => {
        const checkOnline = () => {
            setIsOnline(navigator.onLine)
            if (navigator.onLine) {
                router.push('/app/dashboard')
            }
        }

        setIsOnline(navigator.onLine)

        window.addEventListener('online', checkOnline)
        window.addEventListener('offline', checkOnline)

        return () => {
            window.removeEventListener('online', checkOnline)
            window.removeEventListener('offline', checkOnline)
        }
    }, [router])

    const handleRetry = () => {
        if (navigator.onLine) {
            router.push('/app/dashboard')
            router.refresh()
        } else {
            // Показываем сообщение, что все еще офлайн
            alert('Нет подключения к интернету. Проверьте соединение и попробуйте снова.')
        }
    }

    return (
        <main className="w-full min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
                <div className="mb-6">
                    <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <WifiOff size={40} className="text-yellow-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">
                        Вы в офлайн режиме
                    </h1>
                    <p className="text-gray-600">
                        Нет подключения к интернету
                    </p>
                </div>

                <div className="mb-6 text-left bg-gray-50 rounded-lg p-4">
                    <h2 className="text-sm font-semibold text-gray-900 mb-2">
                        Доступные функции:
                    </h2>
                    <ul className="text-sm text-gray-600 space-y-1">
                        <li>• Просмотр истории питания (последние 30 дней)</li>
                        <li>• Просмотр истории веса</li>
                        <li>• Просмотр отчетов (кэшированные данные)</li>
                        <li>• Просмотр заметок от тренера</li>
                    </ul>
                </div>

                <button
                    onClick={handleRetry}
                    className="w-full py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                >
                    <RefreshCw size={20} />
                    Попробовать снова
                </button>
            </div>
        </main>
    )
}

