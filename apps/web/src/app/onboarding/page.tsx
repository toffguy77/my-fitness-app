'use client'

import { Suspense } from 'react'
import { OnboardingWizard } from '@/features/onboarding'
import { GuestOnboarding } from '@/features/onboarding/components/GuestOnboarding'
import { useSignedIn } from '@/shared/hooks/useSignedIn'

/**
 * One path, two audiences.
 *
 * A visitor gets the wizard that ends in a result they can keep; somebody who
 * already registered gets the short one that finishes setting up their account.
 */
export default function OnboardingPage() {
    const signedIn = useSignedIn()

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
