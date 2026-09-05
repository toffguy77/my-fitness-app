import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthScreen } from '../components/AuthScreen'
import { AccountRecoveryScreen } from '../components/AccountRecoveryScreen'
import { apiClient } from '@/shared/utils/api-client'
import { accountApi } from '@/features/settings/api/account'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { post: jest.fn(), setToken: jest.fn() },
}))

jest.mock('@/features/settings/api/account', () => ({
    accountApi: { cancelDeletion: jest.fn() },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

const push = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace: jest.fn() }),
}))

const session = {
    user: {
        id: '1',
        email: 'leaving@example.com',
        role: 'client' as const,
        created_at: '',
        email_verified: true,
        onboarding_completed: true,
    },
    token: 'access',
    refresh_token: 'refresh',
    pending_deletion: {
        requested_at: '2026-03-01T00:00:00Z',
        scheduled_for: '2026-03-31T00:00:00Z',
    },
}

beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
})

describe('Signing in with a deletion pending', () => {
    // Signing in is the clearest evidence there is that somebody changed their
    // mind. Greeting them as normal and then deleting a year of their data on
    // schedule would be the worst of both readings.
    it('offers the way back instead of the dashboard', async () => {
        ;(apiClient.post as jest.Mock).mockResolvedValue(session)

        render(<AuthScreen />)
        await userEvent.type(screen.getByLabelText('Email address'), 'leaving@example.com')
        await userEvent.type(screen.getByLabelText('Password'), 'Password123!')
        await userEvent.click(screen.getByLabelText('Log in to your account'))

        expect(await screen.findByTestId('account-recovery')).toBeInTheDocument()
        // The date they have until, in words.
        expect(screen.getByText(/31 марта/)).toBeInTheDocument()
        expect(push).not.toHaveBeenCalled()
    })

    it('goes straight to the dashboard when nothing is pending', async () => {
        ;(apiClient.post as jest.Mock).mockResolvedValue({
            ...session,
            pending_deletion: undefined,
        })

        render(<AuthScreen />)
        await userEvent.type(screen.getByLabelText('Email address'), 'user@example.com')
        await userEvent.type(screen.getByLabelText('Password'), 'Password123!')
        await userEvent.click(screen.getByLabelText('Log in to your account'))

        await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
        expect(screen.queryByTestId('account-recovery')).not.toBeInTheDocument()
    })
})

describe('The recovery screen', () => {
    it('cancels the deletion and lets them in', async () => {
        ;(accountApi.cancelDeletion as jest.Mock).mockResolvedValue({ cancelled: true })
        const onDismiss = jest.fn()

        render(<AccountRecoveryScreen scheduledFor="2026-03-31T00:00:00Z" onDismiss={onDismiss} />)
        await userEvent.click(screen.getByRole('button', { name: 'Отменить удаление' }))

        await waitFor(() => expect(accountApi.cancelDeletion).toHaveBeenCalled())
        expect(onDismiss).toHaveBeenCalled()
        expect(push).toHaveBeenCalledWith('/dashboard')
    })

    // Not a trap: somebody who meant it can carry on.
    it('lets somebody continue without cancelling', async () => {
        const onDismiss = jest.fn()

        render(<AccountRecoveryScreen scheduledFor="2026-03-31T00:00:00Z" onDismiss={onDismiss} />)
        await userEvent.click(screen.getByRole('button', { name: 'Продолжить без отмены' }))

        expect(accountApi.cancelDeletion).not.toHaveBeenCalled()
        expect(onDismiss).toHaveBeenCalled()
        expect(push).toHaveBeenCalledWith('/dashboard')
    })

    it('says so when cancelling fails', async () => {
        ;(accountApi.cancelDeletion as jest.Mock).mockRejectedValue(new Error('down'))
        const toast = (await import('react-hot-toast')).default

        render(<AccountRecoveryScreen scheduledFor="2026-03-31T00:00:00Z" onDismiss={jest.fn()} />)
        await userEvent.click(screen.getByRole('button', { name: 'Отменить удаление' }))

        await waitFor(() => expect(toast.error).toHaveBeenCalled())
        expect(push).not.toHaveBeenCalled()
    })
})
