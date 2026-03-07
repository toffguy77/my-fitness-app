/**
 * Unit tests for the profile page component
 * Tests that the profile page renders correctly
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

// Mock next/link
jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}))

// Mock layouts
jest.mock('@/features/dashboard/components/DashboardLayout', () => ({
    DashboardLayout: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="dashboard-layout">{children}</div>
    ),
}))

jest.mock('@/features/curator', () => ({
    CuratorLayout: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="curator-layout">{children}</div>
    ),
}))

jest.mock('@/features/admin', () => ({
    AdminLayout: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="admin-layout">{children}</div>
    ),
}))

// Mock API
jest.mock('@/features/settings/api/settings', () => ({
    getProfile: jest.fn().mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        avatar_url: null,
    }),
}))

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        clearToken: jest.fn(),
    },
}))

import ProfilePage from '../profile/page'

describe('ProfilePage', () => {
    beforeEach(() => {
        Storage.prototype.getItem = jest.fn((key: string) => {
            if (key === 'auth_token') return 'mock-token'
            if (key === 'user') return JSON.stringify({ role: 'client' })
            return null
        })
        Storage.prototype.removeItem = jest.fn()
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('renders loading state initially', () => {
        render(<ProfilePage />)
        // Initially shows loading spinner
        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    })
})
