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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 rounded-2xl shadow-xl max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
            <span className="text-3xl">🔒</span>
          </div>
          <h2 className="text-xl font-bold text-zinc-100 mb-2">
            Функция доступна в PRO
          </h2>
          <p className="text-sm text-zinc-400">
            {featureName} доступна только с активной Premium подпиской.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleGoToSettings}
            className="w-full py-3 bg-white text-zinc-950 rounded-xl font-medium hover:bg-zinc-200 transition-colors"
          >
            Вернуться к тарифу
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 bg-zinc-800 text-zinc-300 rounded-xl font-medium hover:bg-zinc-700 transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

