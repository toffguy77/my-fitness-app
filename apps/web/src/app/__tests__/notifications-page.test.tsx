/**
 * Unit tests for the notifications page component
 * Tests that the notifications page handles auth and renders
 */

import React from 'react'
import { render, screen } from '@testing-library/react'

// Mock next/navigation
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        back: jest.fn(),
    }),
}))

// Mock next/dynamic to return a simple component
jest.mock('next/dynamic', () => {
    return function dynamic() {
        return function NotificationsPageComponent() {
            return <div data-testid="notifications-page-component">NotificationsPage</div>
        }
    }
})

import NotificationsPage from '../notifications/page'

describe('NotificationsPage', () => {
    beforeEach(() => {
        Storage.prototype.getItem = jest.fn((key: string) => {
            if (key === 'auth_token') return 'mock-token'
            return null
        })
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('renders the notifications component when authenticated', () => {
        render(<NotificationsPage />)
        expect(screen.getByTestId('notifications-page-component')).toBeInTheDocument()
    })
})
