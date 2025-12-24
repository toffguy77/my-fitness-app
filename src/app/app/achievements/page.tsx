'use client'

import { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import AchievementsPage from '@/components/achievements/AchievementsPage'
import SkeletonLoader from '@/components/SkeletonLoader'

function AchievementsPageContent() {
  const router = useRouter()

  return (
    <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 lg:max-w-4xl lg:mx-auto font-sans">
      {/* Header */}
      <header className="mb-6">
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
        <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 lg:max-w-4xl lg:mx-auto font-sans">
          <div className="space-y-6">
            <SkeletonLoader variant="card" count={3} />
          </div>
        </main>
      }
    >
      <AchievementsPageContent />
    </Suspense>
  )
}

