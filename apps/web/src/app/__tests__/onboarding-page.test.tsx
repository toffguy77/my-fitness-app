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

import OnboardingPage from '../onboarding/page'

describe('OnboardingPage', () => {
    afterEach(() => localStorage.clear())

    // The whole point of the rework: the wizard runs before there is an
    // account, so a visitor must reach it without one.
    it('gives a visitor the guest wizard', async () => {
        render(<OnboardingPage />)

        expect(await screen.findByTestId('guest-onboarding')).toBeInTheDocument()
        expect(screen.queryByTestId('onboarding-wizard')).not.toBeInTheDocument()
    })

    // Showing the guest wizard to somebody who already registered would invite
    // them to redo work they have done.
    it('gives a signed-in user the short post-registration wizard', async () => {
        localStorage.setItem('auth_token', 'token')

        render(<OnboardingPage />)

        expect(await screen.findByTestId('onboarding-wizard')).toBeInTheDocument()
        expect(screen.queryByTestId('guest-onboarding')).not.toBeInTheDocument()
    })
})
