import { render, screen, waitFor } from '@testing-library/react'
import { ClientList } from '../ClientList'
import { curatorApi } from '../../api/curatorApi'
import type { ClientCard as ClientCardType } from '../../types'

jest.mock('../../api/curatorApi', () => ({
    curatorApi: {
        getClients: jest.fn(),
    },
}))

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}))

jest.mock('next/image', () => ({
    __esModule: true,
    default: (props: Record<string, unknown>) => (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img {...props} />
    ),
}))

const mockCuratorApi = curatorApi as jest.Mocked<typeof curatorApi>

function makeClient(overrides: Partial<ClientCardType> = {}): ClientCardType {
    return {
        id: 1,
        name: 'Тест Клиент',
        today_kbzhu: null,
        plan: null,
        alerts: [],
        unread_count: 0,
        last_weight: null,
        weight_trend: '',
        target_weight: null,
        today_water: null,
        active_tasks_count: 0,
        overdue_tasks_count: 0,
        streak_days: 0,
        ...overrides,
    }
}

describe('ClientList', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('shows loading spinner while fetching', () => {
        mockCuratorApi.getClients.mockReturnValue(new Promise(() => {}))
        render(<ClientList />)

        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    })

    it('shows error message on failure', async () => {
        mockCuratorApi.getClients.mockRejectedValue(new Error('fail'))
        render(<ClientList />)

        await waitFor(() => {
            expect(screen.getByText('Не удалось загрузить клиентов')).toBeInTheDocument()
        })
    })

    it('shows empty state when no clients', async () => {
        mockCuratorApi.getClients.mockResolvedValue([])
        render(<ClientList />)

        await waitFor(() => {
            expect(screen.getByText('Нет закреплённых клиентов')).toBeInTheDocument()
        })
    })

    it('renders client cards after loading', async () => {
        mockCuratorApi.getClients.mockResolvedValue([
            makeClient({ id: 1, name: 'Анна' }),
            makeClient({ id: 2, name: 'Борис' }),
        ])

        render(<ClientList />)

        await waitFor(() => {
            expect(screen.getByText('Анна')).toBeInTheDocument()
            expect(screen.getByText('Борис')).toBeInTheDocument()
        })
    })

    it('separates clients needing attention from the rest', async () => {
        mockCuratorApi.getClients.mockResolvedValue([
            makeClient({ id: 1, name: 'Анна', alerts: [{ level: 'red', message: 'alert' }] }),
            makeClient({ id: 2, name: 'Борис', alerts: [] }),
        ])

        render(<ClientList />)

        await waitFor(() => {
            expect(screen.getByText('Требуют внимания')).toBeInTheDocument()
            expect(screen.getByText('Остальные')).toBeInTheDocument()
        })
    })

    it('includes clients with unread messages in attention section', async () => {
        mockCuratorApi.getClients.mockResolvedValue([
            makeClient({ id: 1, name: 'Анна', unread_count: 3 }),
            makeClient({ id: 2, name: 'Борис', unread_count: 0 }),
        ])

        render(<ClientList />)

        await waitFor(() => {
            expect(screen.getByText('Требуют внимания')).toBeInTheDocument()
            expect(screen.getByText('Остальные')).toBeInTheDocument()
        })
    })

    it('does not show attention section when all clients are normal', async () => {
        mockCuratorApi.getClients.mockResolvedValue([
            makeClient({ id: 1, name: 'Анна' }),
        ])

        render(<ClientList />)

        await waitFor(() => {
            expect(screen.getByText('Анна')).toBeInTheDocument()
        })

        // With nothing to separate, a heading would only add furniture.
        expect(screen.queryByText('Требуют внимания')).not.toBeInTheDocument()
        expect(screen.queryByText('Остальные')).not.toBeInTheDocument()
    })

    // The page above this list already shows its own attention block. Leaving
    // those clients out of both groups here emptied the roster completely for a
    // curator whose only client needed attention.
    it('keeps a client the page already flagged in the roster', async () => {
        mockCuratorApi.getClients.mockResolvedValue([])

        render(
            <ClientList
                clients={[makeClient({ id: 7, name: 'Анна', alerts: [{ level: 'red', message: 'alert' }] })]}
                attentionClientIds={new Set([7])}
            />
        )

        expect(await screen.findByText('Анна')).toBeInTheDocument()
        // ...but not under a second copy of the heading it already appears under.
        expect(screen.queryByText('Требуют внимания')).not.toBeInTheDocument()
    })
})
