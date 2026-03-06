/**
 * Unit tests for app page components
 * Tests that Next.js pages render their feature components
 */

import React from 'react'
import { render, screen } from '@testing-library/react'

// Mock the feature components
jest.mock('@/features/onboarding', () => ({
    OnboardingWizard: () => <div data-testid="onboarding-wizard">OnboardingWizard</div>,
}))

import OnboardingPage from '../onboarding/page'

describe('OnboardingPage', () => {
    it('renders OnboardingWizard component', () => {
        render(<OnboardingPage />)
        expect(screen.getByTestId('onboarding-wizard')).toBeInTheDocument()
    })
})
