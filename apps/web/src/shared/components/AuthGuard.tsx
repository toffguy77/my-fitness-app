'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated } from '@/shared/utils/token-storage'

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const [checked, setChecked] = useState(false)

    useEffect(() => {
        if (!isAuthenticated()) {
            router.replace('/auth')
        } else {
            setChecked(true)
        }
    }, [router])

    if (!checked) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4" />
                    <p className="text-gray-600">Загрузка...</p>
                </div>
            </div>
        )
    }

    return <>{children}</>
}
