import { render, screen } from '@testing-library/react'
import { AnalyticsSummaryCards } from '../AnalyticsSummaryCards'
import type { AnalyticsSummary } from '../../types'

const baseAnalytics: AnalyticsSummary = {
    total_clients: 12,
    attention_clients: 3,
    avg_kbzhu_percent: 95,
    total_unread: 7,
    clients_waiting: 4,
    active_tasks: 15,
    overdue_tasks: 2,
    completed_today: 5,
}

describe('AnalyticsSummaryCards', () => {
    it('renders all 4 metric cards with correct values', () => {
        render(<AnalyticsSummaryCards analytics={baseAnalytics} />)

        // Active clients
        expect(screen.getByText('Активные клиенты')).toBeInTheDocument()
        expect(screen.getByText('12')).toBeInTheDocument()
        expect(screen.getByText('требуют внимания: 3')).toBeInTheDocument()

        // KBZHU
        expect(screen.getByText('КБЖУ выполнение')).toBeInTheDocument()
        expect(screen.getByText('95%')).toBeInTheDocument()

        // Messages
        expect(screen.getByText('Сообщения')).toBeInTheDocument()
        expect(screen.getByText('7')).toBeInTheDocument()
        expect(screen.getByText('от 4 клиентов')).toBeInTheDocument()

        // Tasks
        expect(screen.getByText('Задачи')).toBeInTheDocument()
        expect(screen.getByText('15')).toBeInTheDocument()
        expect(screen.getByText('просрочено: 2')).toBeInTheDocument()
        expect(screen.getByText('сегодня: 5')).toBeInTheDocument()
    })

    it('shows "все в норме" when attention_clients is 0', () => {
        render(
            <AnalyticsSummaryCards
                analytics={{ ...baseAnalytics, attention_clients: 0 }}
            />
        )
        expect(screen.getByText('все в норме')).toBeInTheDocument()
        expect(screen.queryByText(/требуют внимания/)).not.toBeInTheDocument()
    })

    it('does not show overdue text when overdue_tasks is 0', () => {
        render(
            <AnalyticsSummaryCards
                analytics={{ ...baseAnalytics, overdue_tasks: 0 }}
            />
        )
        expect(screen.queryByText(/просрочено/)).not.toBeInTheDocument()
    })

    it('applies green color for kbzhu between 90-110', () => {
        const { container } = render(
            <AnalyticsSummaryCards analytics={{ ...baseAnalytics, avg_kbzhu_percent: 100 }} />
        )
        const kbzhuValue = screen.getByText('100%')
        expect(kbzhuValue.className).toContain('text-green-600')
    })

    it('applies yellow color for kbzhu between 70-89', () => {
        render(
            <AnalyticsSummaryCards analytics={{ ...baseAnalytics, avg_kbzhu_percent: 80 }} />
        )
        const kbzhuValue = screen.getByText('80%')
        expect(kbzhuValue.className).toContain('text-yellow-600')
    })

    it('applies red color for kbzhu below 70', () => {
        render(
            <AnalyticsSummaryCards analytics={{ ...baseAnalytics, avg_kbzhu_percent: 60 }} />
        )
        const kbzhuValue = screen.getByText('60%')
        expect(kbzhuValue.className).toContain('text-red-600')
    })
})
