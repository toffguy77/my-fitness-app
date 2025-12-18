'use client'

import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'

type PremiumFeatureModalProps = {
  isOpen: boolean
  onClose: () => void
  featureName?: string
}

export default function PremiumFeatureModal({
  isOpen,
  onClose,
  featureName = 'Эта функция',
}: PremiumFeatureModalProps) {
  const router = useRouter()

  if (!isOpen) return null

  const handleGoToSettings = () => {
    router.push('/app/settings?tab=subscription')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
            <span className="text-3xl">🔒</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Функция доступна в PRO
          </h2>
          <p className="text-sm text-gray-600">
            {featureName} доступна только с активной Premium подпиской.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleGoToSettings}
            className="w-full py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
          >
            Вернуться к тарифу
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

