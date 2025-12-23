'use client'

import { Lock, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface PaywallProps {
  title?: string
  message?: string
}

export default function Paywall({ 
  title = 'Доступно с Premium подпиской',
  message = 'Подключите работу с тренером, чтобы получить доступ к расширенной аналитике, отчетам и персональным рекомендациям.'
}: PaywallProps) {
  const router = useRouter()

  const handleBack = () => {
    try {
      router.push('/app/dashboard')
    } catch {
      // Fallback на прямой переход, если router.push не работает
      if (typeof window !== 'undefined') {
        window.location.href = '/app/dashboard'
      }
    }
  }

  return (
    <div className="relative">
      {/* Размытый контент */}
      <div className="blur-sm pointer-events-none select-none">
        <div className="h-64 bg-gray-100 rounded-xl"></div>
      </div>
      
      {/* Paywall overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-95 rounded-xl">
        <div className="text-center p-4 sm:p-8 w-full sm:max-w-md sm:mx-auto">
          <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock size={24} className="text-white" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
          <p className="text-sm text-gray-600 mb-6">{message}</p>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
            <p className="text-xs text-yellow-800">
              Для активации Premium подписки обратитесь к администратору или вашему тренеру.
            </p>
          </div>
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
          >
            Вернуться на дашборд
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

