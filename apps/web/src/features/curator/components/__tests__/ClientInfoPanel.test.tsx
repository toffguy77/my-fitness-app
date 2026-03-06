import { render, screen, fireEvent } from '@testing-library/react'
import { ClientInfoPanel } from '../ClientInfoPanel'
import type { ClientDetail } from '../../types'

function makeDetail(overrides: Partial<ClientDetail> = {}): ClientDetail {
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
        days: [],
        weekly_plan: null,
        weight_history: [],
        photos: [],
        water_goal: null,
        ...overrides,
    }
}

describe('ClientInfoPanel', () => {
    it('renders toggle button', () => {
        render(<ClientInfoPanel detail={makeDetail()} />)

        expect(screen.getByText('Подробнее')).toBeInTheDocument()
    })

    it('does not show details initially', () => {
        render(<ClientInfoPanel detail={makeDetail({ email: 'anna@test.com' })} />)

        expect(screen.queryByText('anna@test.com')).not.toBeInTheDocument()
    })

    it('shows details after clicking toggle', () => {
        render(<ClientInfoPanel detail={makeDetail({ email: 'anna@test.com' })} />)

        fireEvent.click(screen.getByText('Подробнее'))

        expect(screen.getByText('anna@test.com')).toBeInTheDocument()
    })

    it('shows ID', () => {
        render(<ClientInfoPanel detail={makeDetail({ id: 42 })} />)

        fireEvent.click(screen.getByText('Подробнее'))

        expect(screen.getByText('42')).toBeInTheDocument()
    })

    it('shows height and weight', () => {
        render(<ClientInfoPanel detail={makeDetail({ height: 170, last_weight: 65 })} />)

        fireEvent.click(screen.getByText('Подробнее'))

        expect(screen.getByText(/170 см/)).toBeInTheDocument()
        expect(screen.getByText(/65 кг/)).toBeInTheDocument()
    })

    it('shows timezone', () => {
        render(<ClientInfoPanel detail={makeDetail({ timezone: 'Europe/Moscow' })} />)

        fireEvent.click(screen.getByText('Подробнее'))

        expect(screen.getByText('Europe/Moscow')).toBeInTheDocument()
    })

    it('shows telegram link', () => {
        render(<ClientInfoPanel detail={makeDetail({ telegram_username: 'anna_test' })} />)

        fireEvent.click(screen.getByText('Подробнее'))

        const link = screen.getByText('@anna_test')
        expect(link.closest('a')).toHaveAttribute('href', 'https://t.me/anna_test')
    })

    it('shows instagram link', () => {
        render(<ClientInfoPanel detail={makeDetail({ instagram_username: 'anna_ig' })} />)

        fireEvent.click(screen.getByText('Подробнее'))

        const link = screen.getByText('@anna_ig')
        expect(link.closest('a')).toHaveAttribute('href', 'https://instagram.com/anna_ig')
    })

    it('hides details on second click', () => {
        render(<ClientInfoPanel detail={makeDetail({ email: 'anna@test.com' })} />)

        fireEvent.click(screen.getByText('Подробнее'))
        expect(screen.getByText('anna@test.com')).toBeInTheDocument()

        fireEvent.click(screen.getByText('Подробнее'))
        expect(screen.queryByText('anna@test.com')).not.toBeInTheDocument()
    })
})
