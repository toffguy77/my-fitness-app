'use client'

/**
 * Sends somebody who is already signed in away from the entrance.
 *
 * It waits for the session to be established rather than asking once: on a
 * fresh page load nothing is known yet, and answering "not signed in" would
 * leave a signed-in person looking at the sign-in form.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { useSession } from '@/shared/hooks/useSession'

export function AuthRedirect() {
    const router = useRouter()
    const session = useSession()

    useEffect(() => {
        if (session === 'authenticated') {
            router.replace('/dashboard')
        }
    }, [session, router])

    return null
}
