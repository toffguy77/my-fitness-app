'use client'

import { Lock, ArrowRight, Star, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import PremiumBenefits from './premium/PremiumBenefits'
import PremiumPreview from './premium/PremiumPreview'

interface PaywallProps {
  title?: string
  message?: string
  showBenefits?: boolean
  showPreview?: boolean
  premiumUsersCount?: number
}

export default function Paywall({ 
  title = 'Доступно с Premium подпиской',
  message = 'Подключите работу с координатором, чтобы получить доступ к расширенной аналитике, отчетам и персональным рекомендациям.',
  showBenefits = true,
  showPreview = true,
  premiumUsersCount,
}: PaywallProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'benefits' | 'preview'>('benefits')

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
        <div className="h-64 bg-zinc-800 rounded-xl"></div>
      </div>
      
      {/* Paywall overlay - Black Card aesthetics */}
      <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 bg-opacity-95 rounded-xl overflow-y-auto border border-zinc-800">
        <div className="w-full max-w-4xl p-4 sm:p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-zinc-900 border border-zinc-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Star size={24} className="text-zinc-100 fill-zinc-100" />
            </div>
            <h3 className="text-2xl font-bold text-zinc-100 mb-2">{title}</h3>
            <p className="text-sm text-zinc-400 mb-4">{message}</p>
            
            {/* Социальное доказательство */}
            {premiumUsersCount !== undefined && premiumUsersCount > 0 && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-full text-sm text-zinc-300">
                <Users size={16} />
                <span className="tabular-nums">Более {premiumUsersCount} пользователей уже используют Premium</span>
              </div>
            )}
          </div>

          {/* Вкладки */}
          {showBenefits && showPreview && (
            <div className="flex gap-2 mb-6 border-b border-zinc-800">
              <button
                onClick={() => setActiveTab('benefits')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'benefits'
                    ? 'text-zinc-100 border-b-2 border-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Преимущества
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'preview'
                    ? 'text-zinc-100 border-b-2 border-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Примеры функций
              </button>
            </div>
          )}

          {/* Контент вкладок */}
          <div className="mb-6">
            {activeTab === 'benefits' && showBenefits && (
              <div>
                <h4 className="text-lg font-semibold text-zinc-100 mb-4">Что включено в Premium:</h4>
                <PremiumBenefits />
              </div>
            )}
            {activeTab === 'preview' && showPreview && (
              <div>
                <h4 className="text-lg font-semibold text-zinc-100 mb-4">Примеры функций Premium:</h4>
                <PremiumPreview />
              </div>
            )}
          </div>

          <div className="bg-zinc-800 border border-amber-400/20 rounded-xl p-4 mb-6">
            <p className="text-sm text-amber-400 text-center">
              Для активации Premium подписки обратитесь к администратору или вашему координатору.
            </p>
          </div>
          
          <div className="text-center">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-zinc-950 rounded-xl font-medium hover:bg-zinc-200 transition-colors"
            >
              Вернуться на дашборд
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

