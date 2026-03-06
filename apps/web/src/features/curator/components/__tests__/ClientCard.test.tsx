import { render, screen, fireEvent } from '@testing-library/react'
import { ClientCard } from '../ClientCard'
import type { ClientCard as ClientCardType } from '../../types'

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

function makeClient(overrides: Partial<ClientCardType> = {}): ClientCardType {
    return {
        id: 1,
        name: 'Анна Иванова',
        today_kbzhu: null,
        plan: null,
        alerts: [],
        unread_count: 0,
        last_weight: null,
        weight_trend: '',
        target_weight: null,
        today_water: null,
        ...overrides,
    }
}

describe('ClientCard', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('displays client name', () => {
        render(<ClientCard client={makeClient()} />)

        expect(screen.getByText('Анна Иванова')).toBeInTheDocument()
    })

    it('shows initials when no avatar_url', () => {
        render(<ClientCard client={makeClient({ name: 'Анна Иванова' })} />)

        expect(screen.getByText('АИ')).toBeInTheDocument()
    })

    it('shows avatar image when avatar_url is provided', () => {
        render(<ClientCard client={makeClient({ avatar_url: 'https://example.com/avatar.jpg' })} />)

        const img = screen.getByAltText('Анна Иванова')
        expect(img).toBeInTheDocument()
        expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg')
    })

    it('navigates to client detail on click', () => {
        render(<ClientCard client={makeClient({ id: 42 })} />)

        fireEvent.click(screen.getByRole('button'))
        expect(mockPush).toHaveBeenCalledWith('/curator/clients/42')
    })

    it('shows unread count badge when unread_count > 0', () => {
        render(<ClientCard client={makeClient({ unread_count: 5 })} />)

        expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('does not show unread badge when count is 0', () => {
        const { container } = render(<ClientCard client={makeClient({ unread_count: 0 })} />)

        expect(container.querySelector('.bg-red-500')).not.toBeInTheDocument()
    })

    it('shows KBZHU progress bars when plan and kbzhu exist', () => {
        render(
            <ClientCard
                client={makeClient({
                    today_kbzhu: { calories: 1500, protein: 80, fat: 60, carbs: 200 },
                    plan: { calories: 2000, protein: 100, fat: 70, carbs: 250 },
                })}
            />
        )

        expect(screen.getByText('Ккал')).toBeInTheDocument()
        expect(screen.getByText('Белки')).toBeInTheDocument()
        expect(screen.getByText('Жиры')).toBeInTheDocument()
        expect(screen.getByText('Углеводы')).toBeInTheDocument()
    })

    it('shows raw kbzhu text when no plan', () => {
        render(
            <ClientCard
                client={makeClient({
                    today_kbzhu: { calories: 1500, protein: 80, fat: 60, carbs: 200 },
                    plan: null,
                })}
            />
        )

        expect(screen.getByText('План не задан')).toBeInTheDocument()
    })

    it('shows "no data" message when kbzhu is null', () => {
        render(<ClientCard client={makeClient({ today_kbzhu: null })} />)

        expect(screen.getByText('Нет данных за сегодня')).toBeInTheDocument()
    })

    it('shows weight and trend indicator (down)', () => {
        render(
            <ClientCard
                client={makeClient({
                    last_weight: 70,
                    weight_trend: 'down',
                })}
            />
        )

        expect(screen.getByText('70 кг')).toBeInTheDocument()
    })

    it('shows target weight when set', () => {
        render(
            <ClientCard
                client={makeClient({
                    last_weight: 70,
                    weight_trend: 'stable',
                    target_weight: 65,
                })}
            />
        )

        expect(screen.getByText('Цель: 65 кг')).toBeInTheDocument()
    })

    it('shows water info when today_water has glasses > 0', () => {
        render(
            <ClientCard
                client={makeClient({
                    today_water: { glasses: 5, goal: 8, glass_size: 250 },
                })}
            />
        )

        expect(screen.getByText('5/8 стаканов')).toBeInTheDocument()
    })

    it('renders alert badges', () => {
        render(
            <ClientCard
                client={makeClient({
                    alerts: [
                        { level: 'red', message: 'Пропуск' },
                        { level: 'yellow', message: 'Мало воды' },
                    ],
                })}
            />
        )

        expect(screen.getByText('Пропуск')).toBeInTheDocument()
        expect(screen.getByText('Мало воды')).toBeInTheDocument()
    })
})
