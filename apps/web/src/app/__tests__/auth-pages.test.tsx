/**
 * Unit tests for auth-related page components
 * Tests that Next.js auth pages render their feature components
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
    useSearchParams: () => new URLSearchParams(),
}))

// Mock feature components
jest.mock('@/features/auth/components', () => ({
    AuthScreen: () => <div data-testid="auth-screen">AuthScreen</div>,
}))

jest.mock('@/features/auth/components/VerifyEmailScreen', () => ({
    VerifyEmailScreen: () => <div data-testid="verify-email-screen">VerifyEmailScreen</div>,
}))

// Mock shared UI components used by reset/forgot pages
jest.mock('@/shared/components/ui', () => ({
    Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <div data-testid="card" className={className}>{children}</div>
    ),
    Logo: () => <div data-testid="logo">Logo</div>,
}))

jest.mock('@/shared/components/ui/Button', () => ({
    Button: ({ children, isLoading, ...props }: { children: React.ReactNode; isLoading?: boolean; [key: string]: unknown }) => (
        <button data-testid="button" {...props}>{children}</button>
    ),
}))

jest.mock('@/shared/components/ui/Input', () => ({
    Input: (props: Record<string, unknown>) => <input data-testid="input" {...props} />,
}))

jest.mock('@/shared/components/forms/PasswordInput', () => ({
    PasswordInput: (props: Record<string, unknown>) => (
        <input data-testid="password-input" />
    ),
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: { success: jest.fn(), error: jest.fn() },
}))

import AuthPage from '../auth/page'
import VerifyEmailPage from '../auth/verify-email/page'
import ResetPasswordPage from '../reset-password/page'
import ForgotPasswordPage from '../forgot-password/page'

describe('Auth Pages', () => {
    describe('AuthPage', () => {
        it('renders AuthScreen component', () => {
            render(<AuthPage />)
            expect(screen.getByTestId('auth-screen')).toBeInTheDocument()
        })
    })

    describe('VerifyEmailPage', () => {
        it('renders VerifyEmailScreen component', () => {
            render(<VerifyEmailPage />)
            expect(screen.getByTestId('verify-email-screen')).toBeInTheDocument()
        })
    })

    describe('ResetPasswordPage', () => {
        it('renders without crashing', () => {
            render(<ResetPasswordPage />)
            // The page wraps content in Suspense, so it should render the fallback or content
            expect(document.body).toBeTruthy()
        })
    })

    describe('ForgotPasswordPage', () => {
        it('renders the forgot password form', () => {
            render(<ForgotPasswordPage />)
            expect(screen.getByTestId('logo')).toBeInTheDocument()
        })

        it('renders the email input', () => {
            render(<ForgotPasswordPage />)
            expect(screen.getByTestId('input')).toBeInTheDocument()
        })
    })
})
