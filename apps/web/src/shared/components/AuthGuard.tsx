'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated } from '@/shared/utils/token-storage'

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const [checked, setChecked] = useState(false)

    useEffect(() => {
        const authed = isAuthenticated()
        if (!authed) {
            router.replace('/auth')
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setChecked(authed)
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
