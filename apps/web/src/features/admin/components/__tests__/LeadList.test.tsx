import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LeadList } from '../LeadList'
import { adminApi, type Lead } from '../../api/adminApi'

jest.mock('../../api/adminApi', () => ({
    adminApi: { getLeads: jest.fn(), markLeadHandled: jest.fn() },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

const api = adminApi as jest.Mocked<typeof adminApi>

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
})
