import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WeeklyReportView } from '../../types'

jest.mock('../FeedbackForm', () => ({
    FeedbackForm: ({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) => (
        <div data-testid="feedback-form">
            <button onClick={onClose}>close-form</button>
            <button onClick={onSaved}>save-form</button>
        </div>
    ),
}))

import { ReportCard } from '../ReportCard'

const baseReport: WeeklyReportView = {
    id: 'r1',
    week_start: '2026-03-02',
    week_end: '2026-03-08',
    week_number: 10,
    summary: { avg_calories: 1950 },
    submitted_at: '2026-03-09T00:00:00Z',
    has_feedback: false,
}

const reportWithFeedback: WeeklyReportView = {
    ...baseReport,
    has_feedback: true,
    curator_feedback: {
        nutrition: { rating: 'excellent', comment: 'Отличное питание' },
        activity: { rating: 'good', comment: 'Хорошая активность' },
        water: { rating: 'needs_improvement', comment: 'Пейте больше воды' },
        summary: 'Хорошая неделя в целом',
        recommendations: 'Увеличить потребление воды',
    },
}

const defaultProps = {
    clientId: 1,
    onFeedbackSaved: jest.fn(),
}

describe('ReportCard', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders week dates and week number', () => {
        render(<ReportCard report={baseReport} {...defaultProps} />)

        expect(screen.getByText(/2 мар./)).toBeInTheDocument()
        expect(screen.getByText(/8 мар./)).toBeInTheDocument()
        expect(screen.getByText('Неделя 10')).toBeInTheDocument()
    })

    it('shows "Обратная связь дана" when has_feedback', () => {
        render(<ReportCard report={reportWithFeedback} {...defaultProps} />)

        expect(screen.getByText('Обратная связь дана')).toBeInTheDocument()
    })

    it('shows "Ожидает обратной связи" when no feedback', () => {
        render(<ReportCard report={baseReport} {...defaultProps} />)

        expect(screen.getByText('Ожидает обратной связи')).toBeInTheDocument()
    })

    it('expands on click to show content', async () => {
        const user = userEvent.setup()
        render(<ReportCard report={baseReport} {...defaultProps} />)

        expect(screen.queryByText('Дать обратную связь')).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /2 мар./ }))

        expect(screen.getByText('Дать обратную связь')).toBeInTheDocument()
    })

    it('shows feedback details when expanded and has feedback', async () => {
        const user = userEvent.setup()
        render(<ReportCard report={reportWithFeedback} {...defaultProps} />)

        await user.click(screen.getByRole('button', { name: /2 мар./ }))

        expect(screen.getByText('Обратная связь')).toBeInTheDocument()
        expect(screen.getByText('Отлично')).toBeInTheDocument()
        expect(screen.getByText('Хорошо')).toBeInTheDocument()
        expect(screen.getByText('Нужно улучшить')).toBeInTheDocument()
    })

    it('shows "Дать обратную связь" button when expanded and no feedback', async () => {
        const user = userEvent.setup()
        render(<ReportCard report={baseReport} {...defaultProps} />)

        await user.click(screen.getByRole('button', { name: /2 мар./ }))

        expect(screen.getByText('Дать обратную связь')).toBeInTheDocument()
    })

    it('opens FeedbackForm when "Дать обратную связь" clicked', async () => {
        const user = userEvent.setup()
        render(<ReportCard report={baseReport} {...defaultProps} />)

        await user.click(screen.getByRole('button', { name: /2 мар./ }))
        await user.click(screen.getByText('Дать обратную связь'))

        expect(screen.getByTestId('feedback-form')).toBeInTheDocument()
    })

    it('shows rating labels and comments correctly', async () => {
        const user = userEvent.setup()
        render(<ReportCard report={reportWithFeedback} {...defaultProps} />)

        await user.click(screen.getByRole('button', { name: /2 мар./ }))

        expect(screen.getByText('Питание:')).toBeInTheDocument()
        expect(screen.getByText(/Отличное питание/)).toBeInTheDocument()
        expect(screen.getByText('Активность:')).toBeInTheDocument()
        expect(screen.getByText(/Хорошая активность/)).toBeInTheDocument()
        expect(screen.getByText('Вода:')).toBeInTheDocument()
        expect(screen.getByText(/Пейте больше воды/)).toBeInTheDocument()
    })

    it('shows summary and recommendations from feedback', async () => {
        const user = userEvent.setup()
        render(<ReportCard report={reportWithFeedback} {...defaultProps} />)

        await user.click(screen.getByRole('button', { name: /2 мар./ }))

        expect(screen.getByText('Хорошая неделя в целом')).toBeInTheDocument()
        expect(screen.getByText('Увеличить потребление воды')).toBeInTheDocument()
    })
})
