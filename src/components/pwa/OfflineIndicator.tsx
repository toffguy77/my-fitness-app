'use client'
 

import { useState, useEffect } from 'react'
import { WifiOff, Wifi } from 'lucide-react'

interface OfflineIndicatorProps {
    className?: string
}

export default function OfflineIndicator({ className = '' }: OfflineIndicatorProps) {
    const [isOnline, setIsOnline] = useState(true)

    useEffect(() => {
        // Проверяем начальное состояние
        setIsOnline(navigator.onLine)

        const handleOnline = () => {
            setIsOnline(true)
        }

        const handleOffline = () => {
            setIsOnline(false)
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

    if (isOnline) {
        return null
    }

    return (
        <div
            className={`bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex items-center gap-2 text-sm text-yellow-800 ${className}`}
        >
            <WifiOff size={16} className="flex-shrink-0" />
            <span>Офлайн режим. Некоторые функции могут быть недоступны.</span>
        </div>
    )
}

