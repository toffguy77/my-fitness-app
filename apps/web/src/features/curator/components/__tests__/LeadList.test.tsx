import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LeadList } from '../LeadList'
import { curatorApi, type Lead } from '../../api/curatorApi'
import { ApiError } from '@/shared/errors/apiErrors'

jest.mock('../../api/curatorApi', () => ({
    curatorApi: { getLeads: jest.fn(), markLeadHandled: jest.fn() },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

const api = curatorApi as jest.Mocked<typeof curatorApi>

function makeLead(overrides: Partial<Lead> = {}): Lead {
    return {
        id: 'lead-1',
        email: 'guest@example.com',
        name: 'Гость',
        parameters: { goal: 'loss', height_cm: 170, weight_kg: 65 },
        result: { calories: 1800, protein: 120, fat: 50, carbs: 200, water_glasses: 8 },
        last_step: 'contact',
        consents: { data_processing: true, contact: true },
        created_at: '2026-03-01T10:00:00Z',
        ...overrides,
    }
}

function respondWith(leads: Lead[]) {
    ;(api.getLeads as jest.Mock).mockResolvedValue({
        items: leads,
        total: leads.length,
        limit: 50,
        offset: 0,
    })
}

describe('LeadList', () => {
    beforeEach(() => jest.clearAllMocks())

    // What makes the screen worth opening: where they stopped says what to
    // talk to them about.
    it('shows the contact, the parameters and the step they stopped at', async () => {
        respondWith([makeLead()])

        render(<LeadList />)

        expect(await screen.findByText('guest@example.com')).toBeInTheDocument()
        expect(screen.getByText(/оставил контакт/)).toBeInTheDocument()
        expect(screen.getByText(/снизить вес/)).toBeInTheDocument()
        expect(screen.getByText(/1800 ккал/)).toBeInTheDocument()
    })

    // Whether we may write to them decides what anyone looking at this list
    // can do, so it cannot be a detail hidden in the data.
    it('says plainly when there is no consent to make contact', async () => {
        respondWith([makeLead({ consents: { data_processing: true, contact: false } })])

        render(<LeadList />)

        expect(await screen.findByText(/писать нельзя/)).toBeInTheDocument()
    })

    it('does not warn when contact was agreed to', async () => {
        respondWith([makeLead()])

        render(<LeadList />)

        await screen.findByText('guest@example.com')
        expect(screen.queryByText(/писать нельзя/)).not.toBeInTheDocument()
    })

    it('marks a lead handled', async () => {
        respondWith([makeLead()])
        ;(api.markLeadHandled as jest.Mock).mockResolvedValue({ handled: true })

        render(<LeadList />)
        await userEvent.click(await screen.findByRole('button', { name: 'Отметить обработанной' }))

        await waitFor(() => expect(api.markLeadHandled).toHaveBeenCalledWith('lead-1'))
        expect(await screen.findByText('Обработана')).toBeInTheDocument()
    })

    it('offers nothing to do for a lead already handled', async () => {
        respondWith([makeLead({ handled_at: '2026-03-02T10:00:00Z' })])

        render(<LeadList />)

        expect(await screen.findByText('Обработана')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Отметить обработанной' })).not.toBeInTheDocument()
    })

    it('says so when there is nothing to show', async () => {
        respondWith([])

        render(<LeadList />)

        expect(await screen.findByText('Заявок пока нет')).toBeInTheDocument()
    })

    // A lead somebody else already claimed answers 409 lead_already_claimed —
    // the one fact that tells the curator not to write to this person again.
    // A bare `catch` throws the server's code away and shows the generic
    // "не удалось отметить" instead, which reads exactly like a dropped
    // request and hides that someone is already talking to them.
    it('says a lead was already claimed, not just that marking it failed', async () => {
        respondWith([makeLead()])
        ;(api.markLeadHandled as jest.Mock).mockRejectedValue(
            new ApiError(409, { code: 'lead_already_claimed', message: 'Заявка уже отмечена обработанной' })
        )
        const toast = (await import('react-hot-toast')).default

        render(<LeadList />)
        await userEvent.click(await screen.findByRole('button', { name: 'Отметить обработанной' }))

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('Заявка уже отмечена обработанной')
        )
        // Not the generic fallback: that would mean the code never reached
        // the screen, the exact regression this test exists to catch.
        expect(toast.error).not.toHaveBeenCalledWith('Не удалось отметить заявку')
    })
})
