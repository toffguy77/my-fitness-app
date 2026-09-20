/**
 * Админка: причина отказа доезжает до администратора.
 *
 * Здесь читает не клиент, а тот, кто разбирается, почему что-то не работает.
 * Заготовка «не удалось загрузить» отнимает у него ровно ту строчку, ради
 * которой он открыл экран: ушла ли сессия, нет ли прав, отказал ли сервер.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/shared/errors/apiErrors'
import { SupportQueue } from '../SupportQueue'
import { UserDetail } from '../UserDetail'
import { UserList } from '../UserList'
import { LeadList } from '../LeadList'
import { AdminConversationList } from '../AdminConversationList'
import { adminApi } from '../../api/adminApi'

jest.mock('../../api/adminApi', () => ({
    adminApi: {
        getSupportConversations: jest.fn(),
        getSupportThread: jest.fn(),
        replyToSupport: jest.fn(),
        closeSupport: jest.fn(),
        getUser: jest.fn(),
        getUsers: jest.fn(),
        getCurators: jest.fn(),
        changeRole: jest.fn(),
        assignCurator: jest.fn(),
        getLeads: jest.fn(),
        markLeadHandled: jest.fn(),
        getConversations: jest.fn(),
    },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
}))

import toast from 'react-hot-toast'

const api = adminApi as jest.Mocked<typeof adminApi>

/** Отказ, который сервер объяснил кодом. */
function refusal(status: number, code: string) {
    return new ApiError(status, { code, message: 'серверная проза' })
}

const WAIT = { timeout: 1500 }

beforeEach(() => {
    jest.clearAllMocks()
    window.confirm = jest.fn().mockReturnValue(true)
})

describe('Очередь поддержки', () => {
    function queueWith(items: unknown[]) {
        ;(api.getSupportConversations as jest.Mock).mockResolvedValue({
            items, total: items.length, limit: 20, offset: 0,
        })
    }

    const conversation = {
        id: 'conv-1',
        chat_id: 555,
        status: 'escalated',
        telegram_name: 'Гость',
        escalation_reason: 'ответа нет в документации',
        last_message_at: '2026-03-01T10:00:00Z',
        created_at: '2026-03-01T09:00:00Z',
    }

    it('показывает причину, по которой очередь не загрузилась', async () => {
        ;(api.getSupportConversations as jest.Mock).mockRejectedValue(refusal(403, 'forbidden'))

        render(<SupportQueue />)

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Нет доступа'), WAIT)
    })

    it('показывает причину, по которой переписка не открылась', async () => {
        queueWith([conversation])
        ;(api.getSupportThread as jest.Mock).mockRejectedValue(refusal(404, 'not_found'))

        render(<SupportQueue />)
        await userEvent.click(await screen.findByTestId('support-conversation'))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Не найдено'), WAIT)
    })

    it('показывает причину, по которой ответ не ушёл', async () => {
        queueWith([conversation])
        ;(api.getSupportThread as jest.Mock).mockResolvedValue({ conversation, messages: [] })
        ;(api.replyToSupport as jest.Mock).mockRejectedValue(refusal(503, 'feature_unavailable'))

        render(<SupportQueue />)
        await userEvent.click(await screen.findByTestId('support-conversation'))
        await userEvent.type(await screen.findByLabelText('Ответ'), 'Куратор входит в подписку')
        await userEvent.click(screen.getByRole('button', { name: 'Отправить в Telegram' }))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Возможность отключена в этой среде'), WAIT)
    })

    it('показывает причину, по которой переписку не закрыли', async () => {
        queueWith([conversation])
        ;(api.getSupportThread as jest.Mock).mockResolvedValue({ conversation, messages: [] })
        ;(api.closeSupport as jest.Mock).mockRejectedValue(refusal(409, 'conflict'))

        render(<SupportQueue />)
        await userEvent.click(await screen.findByTestId('support-conversation'))
        await userEvent.click(screen.getByRole('button', { name: 'Закрыть обращение' }))

        await waitFor(
            () => expect(toast.error).toHaveBeenCalledWith('Действие невозможно в текущем состоянии'),
            WAIT
        )
    })
})

describe('Карточка пользователя', () => {
    const user = {
        id: 1,
        email: 'user@example.com',
        name: 'Тест Пользователь',
        role: 'client' as const,
        client_count: 0,
        created_at: '2025-01-15T00:00:00Z',
    }

    beforeEach(() => {
        ;(api.getUser as jest.Mock).mockResolvedValue(user)
        ;(api.getCurators as jest.Mock).mockResolvedValue([
            { id: 10, name: 'Куратор Один', email: 'c1@example.com', client_count: 3 },
        ])
    })

    it('показывает причину, по которой роль не сменилась', async () => {
        ;(api.changeRole as jest.Mock).mockRejectedValue(refusal(409, 'conflict'))

        render(<UserDetail userId={1} />)
        await userEvent.click(await screen.findByRole('button', { name: 'Куратор' }))

        await waitFor(
            () => expect(toast.error).toHaveBeenCalledWith('Действие невозможно в текущем состоянии'),
            WAIT
        )
    })

    it('показывает причину, по которой куратор не назначился', async () => {
        ;(api.assignCurator as jest.Mock).mockRejectedValue(refusal(403, 'forbidden'))

        render(<UserDetail userId={1} />)
        await userEvent.click(await screen.findByText('Куратор Один'))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Нет доступа'), WAIT)
    })
})

describe('Список пользователей', () => {
    it('показывает причину, по которой список не загрузился', async () => {
        ;(api.getUsers as jest.Mock).mockRejectedValue(refusal(401, 'session_ended'))

        render(<UserList />)

        expect(await screen.findByText('Сессия завершена, войдите заново')).toBeInTheDocument()
    })
})

describe('Заявки', () => {
    const lead = {
        id: 'lead-1',
        email: 'guest@example.com',
        name: 'Гость',
        parameters: { goal: 'loss', height_cm: 170, weight_kg: 65 },
        result: { calories: 1800, protein: 120, fat: 50, carbs: 200, water_glasses: 8 },
        last_step: 'contact',
        consents: { data_processing: true, contact: true },
        created_at: '2026-03-01T10:00:00Z',
    }

    it('показывает причину, по которой заявки не загрузились', async () => {
        ;(api.getLeads as jest.Mock).mockRejectedValue(refusal(403, 'forbidden'))

        render(<LeadList />)

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Нет доступа'), WAIT)
    })

    it('показывает причину, по которой заявку не отметили', async () => {
        ;(api.getLeads as jest.Mock).mockResolvedValue({ items: [lead], total: 1, limit: 50, offset: 0 })
        ;(api.markLeadHandled as jest.Mock).mockRejectedValue(refusal(409, 'conflict'))

        render(<LeadList />)
        await userEvent.click(await screen.findByRole('button', { name: 'Отметить обработанной' }))

        await waitFor(
            () => expect(toast.error).toHaveBeenCalledWith('Действие невозможно в текущем состоянии'),
            WAIT
        )
    })
})

describe('Переписки', () => {
    it('показывает причину, по которой список переписок не загрузился', async () => {
        ;(api.getConversations as jest.Mock).mockRejectedValue(refusal(403, 'forbidden'))

        render(<AdminConversationList />)

        expect(await screen.findByText('Нет доступа')).toBeInTheDocument()
    })
})
