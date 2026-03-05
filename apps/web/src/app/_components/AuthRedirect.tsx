'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated } from '@/shared/utils/token-storage'

export function AuthRedirect() {
    const router = useRouter()
    useEffect(() => {
        if (isAuthenticated()) {
            router.replace('/dashboard')
        }
    }, [router])
    return null
}
