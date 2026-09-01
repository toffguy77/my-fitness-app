import {
    guestApi,
    rememberLeadToken,
    leadToken,
    forgetLeadToken,
    LEAD_TOKEN_KEY,
} from '../api/guest'
import { apiClient } from '@/shared/utils/api-client'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn(), post: jest.fn() },
}))

const client = apiClient as jest.Mocked<typeof apiClient>

const parameters = {
    sex: 'female' as const,
    birth_date: '1990-05-01',
    height_cm: 170,
    weight_kg: 65,
    activity_level: 'moderate' as const,
    goal: 'loss' as const,
}

describe('The guest onboarding API', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        localStorage.clear()
        forgetLeadToken()
    })

    it('asks the server for the calculation', async () => {
        ;(client.post as jest.Mock).mockResolvedValue({ calories: 1800 })

        await guestApi.calculate(parameters)

        expect(client.post).toHaveBeenCalledWith('/api/v1/public/nutrition/calculate', parameters)
    })

    it('saves an attempt with its consents', async () => {
        ;(client.post as jest.Mock).mockResolvedValue({ token: 't', lead: { id: 'l' } })

        await guestApi.createLead({
            email: 'guest@example.com',
            parameters,
            result: null,
            last_step: 'contact',
            consents: { data_processing: true, contact: false },
        })

        expect(client.post).toHaveBeenCalledWith(
            '/api/v1/public/leads',
            expect.objectContaining({ email: 'guest@example.com' })
        )
    })

    it('records the step somebody reached', async () => {
        ;(client.post as jest.Mock).mockResolvedValue({ recorded: true })

        await guestApi.updateStep('token', 'registration')

        expect(client.post).toHaveBeenCalledWith('/api/v1/public/leads/step', {
            token: 'token',
            step: 'registration',
        })
    })

    // The token travels in a query string, so anything in it must be escaped.
    it('escapes the token when reopening a saved attempt', async () => {
        ;(client.get as jest.Mock).mockResolvedValue({ lead: { id: 'lead-1' } })

        await guestApi.resume('a.b/c+d')

        expect(client.get).toHaveBeenCalledWith('/api/v1/public/leads/resume?token=a.b%2Fc%2Bd')
    })
})

describe('The browser’s claim on a saved attempt', () => {
    beforeEach(() => {
        localStorage.clear()
        forgetLeadToken()
    })

    // Two places on purpose: the app reads localStorage, and the provider
    // callback comes back through the server, which can only see a cookie.
    it('is kept where both the app and the callback can find it', () => {
        rememberLeadToken('signed.token')

        expect(leadToken()).toBe('signed.token')
        expect(localStorage.getItem(LEAD_TOKEN_KEY)).toBe('signed.token')
        expect(document.cookie).toContain('lead_token=signed.token')
    })

    it('is dropped from both once it has been used', () => {
        rememberLeadToken('signed.token')

        forgetLeadToken()

        expect(leadToken()).toBeNull()
        expect(document.cookie).not.toContain('signed.token')
    })

    it('reports no claim when nothing was saved', () => {
        expect(leadToken()).toBeNull()
    })

    // Private browsing can refuse storage entirely; that must not throw in the
    // middle of somebody's registration.
    it('survives a browser that refuses storage', () => {
        const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('refused')
        })
        const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('refused')
        })

        expect(() => rememberLeadToken('signed.token')).not.toThrow()
        expect(leadToken()).toBeNull()

        getItem.mockRestore()
        setItem.mockRestore()
    })
})
