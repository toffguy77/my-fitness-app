/**
 * The onboarding route serves two audiences from one path.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'

jest.mock('@/features/onboarding', () => ({
    OnboardingWizard: () => <div data-testid="onboarding-wizard">OnboardingWizard</div>,
}))

jest.mock('@/features/onboarding/components/GuestOnboarding', () => ({
    GuestOnboarding: () => <div data-testid="guest-onboarding">GuestOnboarding</div>,
}))

jest.mock('@/shared/hooks/useSession', () => ({
    useSession: jest.fn(),
}))

import OnboardingPage from '../onboarding/page'
import { useSession } from '@/shared/hooks/useSession'

const session = useSession as jest.Mock

describe('OnboardingPage', () => {
    beforeEach(() => jest.clearAllMocks())

    // The whole point of the rework: the wizard runs before there is an
    // account, so a visitor must reach it without one.
    it('gives a visitor the guest wizard', async () => {
        session.mockReturnValue('anonymous')

        render(<OnboardingPage />)

        expect(await screen.findByTestId('guest-onboarding')).toBeInTheDocument()
        expect(screen.queryByTestId('onboarding-wizard')).not.toBeInTheDocument()
    })

    // Showing the guest wizard to somebody who already registered would invite
    // them to redo work they have done.
    it('gives a signed-in user the short post-registration wizard', async () => {
        session.mockReturnValue('authenticated')

        render(<OnboardingPage />)

        expect(await screen.findByTestId('onboarding-wizard')).toBeInTheDocument()
        expect(screen.queryByTestId('guest-onboarding')).not.toBeInTheDocument()
    })

    // The access token does not survive a reload; it is minted from the cookie
    // a moment later. Rendering either wizard during that moment shows the
    // wrong one to somebody half the time.
    it('shows neither while the session is still being restored', () => {
        session.mockReturnValue('restoring')

        render(<OnboardingPage />)

        expect(screen.queryByTestId('guest-onboarding')).not.toBeInTheDocument()
        expect(screen.queryByTestId('onboarding-wizard')).not.toBeInTheDocument()
    })
})
