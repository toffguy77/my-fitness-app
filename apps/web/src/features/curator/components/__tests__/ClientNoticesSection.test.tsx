import { render, screen } from '@testing-library/react'

import { ClientNoticesSection } from '../ClientNoticesSection'
import { curatorApi } from '../../api/curatorApi'

jest.mock('../../api/curatorApi', () => ({
    curatorApi: { getClientNotices: jest.fn() },
}))

const getNotices = curatorApi.getClientNotices as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('ClientNoticesSection', () => {
    it('separates "saw it and did not reply" from "was never told"', async () => {
        getNotices.mockResolvedValue([
            {
                id: '1',
                type: 'trainer_feedback',
                title: 'Ответ на отчёт',
                createdAt: '2026-09-01T10:00:00Z',
                readAt: '2026-09-01T11:00:00Z',
                deliveries: [{ channel: 'app', status: 'sent' }],
            },
            {
                id: '2',
                type: 'task_assigned',
                title: 'Новая задача',
                createdAt: '2026-09-02T10:00:00Z',
                deliveries: [
                    { channel: 'app', status: 'sent' },
                    { channel: 'email', status: 'sent' },
                ],
            },
        ])

        render(<ClientNoticesSection clientId={7} />)

        expect(await screen.findByText('Ответ на отчёт')).toBeInTheDocument()
        expect(screen.getByText('Ответ куратора · прочитано')).toBeInTheDocument()
        expect(
            screen.getByText('Новая задача · не прочитано · письмо отправлено')
        ).toBeInTheDocument()
    })

    it('says a failed email failed, rather than showing nothing', async () => {
        getNotices.mockResolvedValue([
            {
                id: '1',
                type: 'task_overdue',
                title: 'Задача просрочена',
                createdAt: '2026-09-01T10:00:00Z',
                deliveries: [
                    { channel: 'app', status: 'sent' },
                    { channel: 'email', status: 'failed' },
                ],
            },
        ])

        render(<ClientNoticesSection clientId={7} />)

        expect(await screen.findByText(/письмо не дошло/)).toBeInTheDocument()
    })

    it('says plainly when a client has never been notified', async () => {
        getNotices.mockResolvedValue([])

        render(<ClientNoticesSection clientId={7} />)

        expect(await screen.findByText('Клиента пока ни о чём не оповещали.')).toBeInTheDocument()
    })

    it('reports a failed load instead of rendering an empty panel', async () => {
        getNotices.mockRejectedValue(new Error('nope'))

        render(<ClientNoticesSection clientId={7} />)

        expect(await screen.findByText('Не удалось загрузить историю оповещений.')).toBeInTheDocument()
    })
})
