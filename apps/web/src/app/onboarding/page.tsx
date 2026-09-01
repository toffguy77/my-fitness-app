'use client'

import { Suspense, useEffect, useState } from 'react'
import { OnboardingWizard } from '@/features/onboarding'
import { GuestOnboarding } from '@/features/onboarding/components/GuestOnboarding'

/**
 * One path, two audiences.
 *
 * A visitor gets the wizard that ends in a result they can keep; somebody who
 * already registered gets the short one that finishes setting up their account.
 */
export default function OnboardingPage() {
    const [signedIn, setSignedIn] = useState<boolean | null>(null)

    useEffect(() => {
        try {
            setSignedIn(Boolean(localStorage.getItem('auth_token')))
        } catch {
            setSignedIn(false)
        }
    }, [])

    // Nothing is rendered until it is known which of the two this is: showing
    // the guest wizard to a signed-in user, even for a frame, invites them to
    // redo work they have done.
    if (signedIn === null) return null

    return signedIn ? (
        <OnboardingWizard />
    ) : (
        <Suspense fallback={null}>
            <GuestOnboarding />
        </Suspense>
    )
}
