'use client'

import { Suspense } from 'react'
import RegisterPageContent from './page-content'

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 md:max-w-md md:mx-auto font-sans flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </main>
    }>
      <RegisterPageContent />
    </Suspense>
  )
}

