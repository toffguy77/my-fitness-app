'use client'

import { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import AchievementsPage from '@/components/achievements/AchievementsPage'

function AchievementsPageContent() {
  const router = useRouter()

  return (
    <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 md:max-w-md md:mx-auto font-sans">
      {/* Header */}
      <header className="mb-6 flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Назад"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Достижения</h1>
      </header>

      {/* Achievements Content */}
      <AchievementsPage />
    </main>
  )
}

export default function AchievementsPageWrapper() {
  return (
    <Suspense
      fallback={
        <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 md:max-w-md md:mx-auto font-sans flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
            <p className="text-gray-600">Загрузка...</p>
          </div>
        </main>
      }
    >
      <AchievementsPageContent />
    </Suspense>
  )
}

