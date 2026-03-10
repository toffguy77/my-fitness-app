import { render, screen, waitFor } from '@testing-library/react'
import CuratorHubPage from '@/app/curator/page'
import { curatorApi } from '../../api/curatorApi'
import type { AnalyticsSummary, AttentionItem, ClientCard as ClientCardType } from '../../types'

jest.mock('../../api/curatorApi', () => ({
    curatorApi: {
        getAnalytics: jest.fn(),
        getAttentionList: jest.fn(),
        getClients: jest.fn(),
        getBenchmark: jest.fn(),
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

// Mock recharts to avoid rendering issues in test
jest.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    CartesianGrid: () => null,
}))

const mockCuratorApi = curatorApi as jest.Mocked<typeof curatorApi>

const mockAnalytics: AnalyticsSummary = {
    total_clients: 10,
    attention_clients: 2,
    avg_kbzhu_percent: 92,
    total_unread: 5,
    clients_waiting: 3,
    active_tasks: 8,
    overdue_tasks: 1,
    completed_today: 4,
}

const mockAttention: AttentionItem[] = [
    {
        client_id: 1,
        client_name: 'Анна',
        reason: 'red_alert',
        detail: 'КБЖУ ниже нормы',
        priority: 1,
        action_url: '/curator/clients/1',
    },
]

const mockClients: ClientCardType[] = [
    {
        id: 1,
        name: 'Анна',
        today_kbzhu: null,
        plan: null,
        alerts: [],
        unread_count: 0,
        last_weight: null,
        weight_trend: '',
        target_weight: null,
        today_water: null,
    },
]

describe('CuratorHubPage', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('shows loading spinner initially', () => {
        mockCuratorApi.getAnalytics.mockReturnValue(new Promise(() => {}))
        mockCuratorApi.getAttentionList.mockReturnValue(new Promise(() => {}))
        mockCuratorApi.getClients.mockReturnValue(new Promise(() => {}))
        mockCuratorApi.getBenchmark.mockReturnValue(new Promise(() => {}))

        render(<CuratorHubPage />)
        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    })

    it('shows error when data fetch fails', async () => {
        mockCuratorApi.getAnalytics.mockRejectedValue(new Error('fail'))
        mockCuratorApi.getAttentionList.mockRejectedValue(new Error('fail'))
        mockCuratorApi.getClients.mockRejectedValue(new Error('fail'))
        mockCuratorApi.getBenchmark.mockRejectedValue(new Error('fail'))

        render(<CuratorHubPage />)

        await waitFor(() => {
            expect(screen.getByText('Не удалось загрузить данные')).toBeInTheDocument()
        })
    })

    it('renders analytics cards, attention list, and clients after loading', async () => {
        mockCuratorApi.getAnalytics.mockResolvedValue(mockAnalytics)
        mockCuratorApi.getAttentionList.mockResolvedValue(mockAttention)
        mockCuratorApi.getClients.mockResolvedValue(mockClients)
        mockCuratorApi.getBenchmark.mockResolvedValue({ own_snapshots: [], platform_benchmarks: [] })

        render(<CuratorHubPage />)

        await waitFor(() => {
            // Analytics cards
            expect(screen.getByText('Активные клиенты')).toBeInTheDocument()
            expect(screen.getByText('10')).toBeInTheDocument()
            expect(screen.getByText('92%')).toBeInTheDocument()

            // Attention section
            expect(screen.getByText('Требуют внимания')).toBeInTheDocument()
            expect(screen.getByText('Алерт КБЖУ')).toBeInTheDocument()

            // All clients section
            expect(screen.getByText('Все клиенты')).toBeInTheDocument()
        })
    })

    it('does not show attention section when no attention items', async () => {
        mockCuratorApi.getAnalytics.mockResolvedValue(mockAnalytics)
        mockCuratorApi.getAttentionList.mockResolvedValue([])
        mockCuratorApi.getClients.mockResolvedValue(mockClients)
        mockCuratorApi.getBenchmark.mockResolvedValue({ own_snapshots: [], platform_benchmarks: [] })

        render(<CuratorHubPage />)

        await waitFor(() => {
            expect(screen.getByText('Все клиенты')).toBeInTheDocument()
        })

        expect(screen.queryByText('Требуют внимания')).not.toBeInTheDocument()
    })
})
