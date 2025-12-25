'use client'
 

import { useState, useEffect } from 'react'
import { X, Download } from 'lucide-react'
import toast from 'react-hot-toast'

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
    const [showPrompt, setShowPrompt] = useState(false)
    const [isInstalled, setIsInstalled] = useState(false)

    useEffect(() => {
        // Проверяем, установлено ли приложение (используем setTimeout для избежания синхронного setState)
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setTimeout(() => {
                setIsInstalled(true)
            }, 0)
            return
        }

        // Проверяем localStorage для сохранения состояния отклонения
        const dismissed = localStorage.getItem('pwa-install-dismissed')
        if (dismissed) {
            return
        }

        // Слушаем событие beforeinstallprompt
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault()
            setDeferredPrompt(e as BeforeInstallPromptEvent)
            setShowPrompt(true)
        }

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

        // Проверяем, установлено ли приложение после загрузки
        const checkInstalled = () => {
            if (window.matchMedia('(display-mode: standalone)').matches) {
                setIsInstalled(true)
                setShowPrompt(false)
            }
        }

        checkInstalled()

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
        }
    }, [])

    const handleInstall = async () => {
        if (!deferredPrompt) return

        deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice

        if (outcome === 'accepted') {
            toast.success('Приложение устанавливается...')
            setShowPrompt(false)
            setIsInstalled(true)
        } else {
            toast('Установка отменена')
        }

        setDeferredPrompt(null)
    }

    const handleDismiss = () => {
        setShowPrompt(false)
        localStorage.setItem('pwa-install-dismissed', 'true')
    }

    // Не показываем, если установлено или нет промпта
    if (isInstalled || !showPrompt || !deferredPrompt) {
        return null
    }

    // Показываем только на мобильных устройствах
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    )

    if (!isMobile) {
        return null
    }

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-4">
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-black rounded-lg flex items-center justify-center">
                        <span className="text-white text-xl font-bold">F</span>
                    </div>
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">
                        Установить приложение
                    </h3>
                    <p className="text-xs text-gray-600 mb-3">
                        Добавьте приложение на домашний экран для быстрого доступа
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={handleInstall}
                            className="flex-1 px-3 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                        >
                            <Download size={16} />
                            Установить
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="px-3 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

