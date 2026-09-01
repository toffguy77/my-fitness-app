import { storeSession, destinationFor } from '../utils/session'
import { apiClient } from '@/shared/utils/api-client'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { setToken: jest.fn() },
}))

const session = {
    user: {
        id: '1',
        email: 'user@example.com',
        role: 'client' as const,
        created_at: '',
        email_verified: true,
        onboarding_completed: true,
    },
    token: 'access',
    refresh_token: 'refresh',
}

describe('Establishing a session', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        localStorage.clear()
    })

    // A password login and a sign-in through a provider must end in the same
    // state, or only one of the two paths gets fixed when something breaks.
    it('stores the same things whatever the session came from', () => {
        storeSession(session)

        expect(apiClient.setToken).toHaveBeenCalledWith('access')
        expect(localStorage.getItem('refresh_token')).toBe('refresh')
        expect(JSON.parse(localStorage.getItem('user') ?? '{}')).toMatchObject({
            email: 'user@example.com',
        })
    })
})

describe('Where a signed-in user belongs', () => {
    const user = session.user

    it('sends an administrator to the administrative section', () => {
        expect(destinationFor({ ...user, role: 'super_admin' })).toBe('/admin')
    })

    it('sends a curator to their clients', () => {
        expect(destinationFor({ ...user, role: 'coordinator' })).toBe('/curator')
    })

    // Verification comes before onboarding: an unverified address cannot
    // recover an account, so it is the more urgent of the two.
    it('sends an unverified account to verification first', () => {
        expect(
            destinationFor({ ...user, email_verified: false, onboarding_completed: false })
        ).toBe('/auth/verify-email')
    })

    it('sends a verified but unconfigured account to the onboarding', () => {
        expect(destinationFor({ ...user, onboarding_completed: false })).toBe('/onboarding')
    })

    it('sends everybody else to the dashboard', () => {
        expect(destinationFor(user)).toBe('/dashboard')
    })
})
