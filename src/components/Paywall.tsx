'use client'

import { Lock, ArrowRight } from 'lucide-react'

interface PaywallProps {
  title?: string
  message?: string
}

export default function Paywall({ 
  title = 'Доступно с Premium подпиской',
  message = 'Подключите работу с тренером, чтобы получить доступ к расширенной аналитике, отчетам и персональным рекомендациям.'
}: PaywallProps) {
  return (
    <div className="relative">
      {/* Размытый контент */}
      <div className="blur-sm pointer-events-none select-none">
        <div className="h-64 bg-gray-100 rounded-xl"></div>
      </div>
      
      {/* Paywall overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-95 rounded-xl">
        <div className="text-center p-8 max-w-md">
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
            onClick={() => window.location.href = '/app/dashboard'}
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

