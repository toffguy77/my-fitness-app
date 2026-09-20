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

/**
 * A curator opening this screen needs to know who to pick up next, not read
 * a timeline of everyone who ever left a contact. `age_days`, `reminder_sent`
 * and `contact_allowed` all come from the backend queue (task 3) — this
 * component's job is to show them plainly, not to recompute or re-sort them.
 */
function makeLead(overrides: Partial<Lead> = {}): Lead {
    return {
        id: 'lead-1',
        email: 'guest@example.com',
        name: 'Гость',
        parameters: { goal: 'loss', height_cm: 170, weight_kg: 65 },
        result: { calories: 1800, protein: 120, fat: 50, carbs: 200, water_glasses: 8 },
        last_step: 'result',
        consents: { data_processing: true, contact: true },
        age_days: 3,
        reminder_sent: true,
        contact_allowed: true,
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

describe('LeadList (очередь заявок)', () => {
    beforeEach(() => jest.clearAllMocks())

    // What makes the screen worth opening: the reason to talk to this person,
    // how long they have waited, and whether a reminder already went out —
    // not just a mailing address.
    it('показывает основание для разговора, а не только контакт', async () => {
        respondWith([makeLead({ id: '1', email: 'a@example.com', last_step: 'result', age_days: 3, reminder_sent: true, contact_allowed: true })])

        render(<LeadList />)

        expect(await screen.findByText(/увидел расчёт/i)).toBeInTheDocument()
        expect(screen.getByText(/3 дня/i)).toBeInTheDocument()
        expect(screen.getByText(/напоминание отправлено/i)).toBeInTheDocument()
    })

    // A missing reminder note is not silence about a fact the curator has to
    // infer — the mutation-tested behaviour is that the note appears only
    // when the flag is true.
    it('не показывает отметку о напоминании, если оно не отправлено', async () => {
        respondWith([makeLead({ id: '1', reminder_sent: false })])

        render(<LeadList />)

        await screen.findByText('guest@example.com')
        expect(screen.queryByText(/напоминание отправлено/i)).not.toBeInTheDocument()
    })

    // Consent to contact is not decoration: a lead without it must not look
    // like one a curator may write to. The email stays visible — it explains
    // who the entry is about — but nothing offers to write to them.
    it('помечает запретом заявку без согласия на связь и не предлагает написать', async () => {
        respondWith([makeLead({ id: '2', email: 'b@example.com', last_step: 'contact', age_days: 1, reminder_sent: false, contact_allowed: false })])

        render(<LeadList />)

        expect(await screen.findByText(/писать нельзя/i)).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /написать/i })).not.toBeInTheDocument()
        // Контакт при этом не скрыт: он объясняет, о ком речь.
        expect(screen.getByText('b@example.com')).toBeInTheDocument()
    })

    it('предлагает написать заявке с согласием на связь', async () => {
        respondWith([makeLead({ id: '2b', email: 'allowed@example.com', contact_allowed: true })])

        render(<LeadList />)

        const link = await screen.findByRole('link', { name: /написать/i })
        expect(link).toHaveAttribute('href', 'mailto:allowed@example.com')
    })

    it('даёт перейти к разговору, если он был', async () => {
        respondWith([makeLead({ id: '3', email: 'c@example.com', last_step: 'bot', age_days: 0, reminder_sent: false, contact_allowed: true, conversation_id: 'conv-1' })])

        render(<LeadList />)

        expect(await screen.findByRole('link', { name: /переписк/i })).toHaveAttribute(
            'href',
            '/curator/support?conversation=conv-1'
        )
    })

    it('не предлагает переход к разговору, когда его нет', async () => {
        respondWith([makeLead({ id: '4', email: 'd@example.com', last_step: 'contact', age_days: 2, reminder_sent: false, contact_allowed: true })])

        render(<LeadList />)

        await screen.findByText('d@example.com')
        expect(screen.queryByRole('link', { name: /переписк/i })).not.toBeInTheDocument()
    })

    // The queue's whole point is telling the curator who to pick up next: the
    // order the backend returns (longest-waiting first) must reach the
    // screen unchanged. Re-sorting locally — even "helpfully" — would hide
    // that ordering behind whatever the component decided instead.
    it('сохраняет порядок очереди, присланный сервером', async () => {
        respondWith([
            makeLead({ id: 'oldest', email: 'oldest@example.com', age_days: 9 }),
            makeLead({ id: 'newest', email: 'newest@example.com', age_days: 0 }),
        ])

        render(<LeadList />)

        const cards = await screen.findAllByTestId('lead-card')
        expect(cards).toHaveLength(2)
        expect(cards[0]).toHaveTextContent('oldest@example.com')
        expect(cards[1]).toHaveTextContent('newest@example.com')
    })

    it('сообщает, что заявку уже взяли', async () => {
        respondWith([makeLead({ id: '5', email: 'e@example.com' })])
        ;(api.markLeadHandled as jest.Mock).mockRejectedValue(
            new ApiError(409, { code: 'lead_already_claimed', message: 'Заявка уже отмечена обработанной' })
        )

        render(<LeadList />)
        await userEvent.click(await screen.findByRole('button', { name: /обработан/i }))

        const toast = (await import('react-hot-toast')).default
        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('Заявка уже отмечена обработанной')
        )
        // Not the generic fallback: that would mean the code never reached
        // the screen, the exact regression this test exists to catch.
        expect(toast.error).not.toHaveBeenCalledWith('Не удалось отметить заявку')
    })

    it('marks a lead handled', async () => {
        respondWith([makeLead()])
        ;(api.markLeadHandled as jest.Mock).mockResolvedValue({ handled: true })

        render(<LeadList />)
        await userEvent.click(await screen.findByRole('button', { name: /обработан/i }))

        await waitFor(() => expect(api.markLeadHandled).toHaveBeenCalledWith('lead-1'))
        expect(await screen.findByText('Обработана')).toBeInTheDocument()
    })

    it('offers nothing to do for a lead already handled', async () => {
        respondWith([makeLead({ handled_at: '2026-03-02T10:00:00Z' })])

        render(<LeadList />)

        expect(await screen.findByText('Обработана')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /обработан/i })).not.toBeInTheDocument()
    })

    it('says so when there is nothing to show', async () => {
        respondWith([])

        render(<LeadList />)

        expect(await screen.findByText('Заявок пока нет')).toBeInTheDocument()
    })

    it('says so when the queue cannot be loaded', async () => {
        ;(api.getLeads as jest.Mock).mockRejectedValue(new Error('down'))

        render(<LeadList />)

        const toast = (await import('react-hot-toast')).default
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Не удалось загрузить заявки'))
    })

    // По умолчанию — только необработанные; переключатель открывает остальные.
    it('по умолчанию показывает только необработанные', async () => {
        respondWith([makeLead()])

        render(<LeadList />)
        await screen.findByText('guest@example.com')

        expect(api.getLeads).toHaveBeenCalledWith(expect.not.objectContaining({ includeHandled: true }))
    })

    it('says so when the toggle fails to load', async () => {
        respondWith([makeLead()])

        render(<LeadList />)
        await screen.findByText('guest@example.com')
        ;(api.getLeads as jest.Mock).mockRejectedValueOnce(new Error('down'))

        await userEvent.click(await screen.findByRole('checkbox', { name: /обработанные/i }))

        const toast = (await import('react-hot-toast')).default
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Не удалось загрузить заявки'))
    })

    it('переключатель запрашивает обработанные заявки тоже', async () => {
        respondWith([makeLead()])

        render(<LeadList />)
        await screen.findByText('guest@example.com')
        ;(api.getLeads as jest.Mock).mockClear()
        respondWith([makeLead({ handled_at: '2026-03-02T10:00:00Z' })])

        await userEvent.click(await screen.findByRole('checkbox', { name: /обработанные/i }))

        await waitFor(() =>
            expect(api.getLeads).toHaveBeenCalledWith(expect.objectContaining({ includeHandled: true }))
        )
    })
})
