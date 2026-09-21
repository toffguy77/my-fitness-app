/**
 * Админка: причина отказа доезжает до администратора.
 *
 * Здесь читает не клиент, а тот, кто разбирается, почему что-то не работает.
 * Заготовка «не удалось загрузить» отнимает у него ровно ту строчку, ради
 * которой он открыл экран: ушла ли сессия, нет ли прав, отказал ли сервер.
 *
 * «Очередь поддержки» и «Заявки» отсюда уехали в
 * features/curator/components/__tests__/errorCauses.test.tsx вместе с
 * SupportQueue и LeadList — заявки и поддержка теперь кураторские экраны.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/shared/errors/apiErrors'
import { UserDetail } from '../UserDetail'
import { UserList } from '../UserList'
import { AdminConversationList } from '../AdminConversationList'
import { adminApi } from '../../api/adminApi'

jest.mock('../../api/adminApi', () => ({
    adminApi: {
        getUser: jest.fn(),
        getUsers: jest.fn(),
        getCurators: jest.fn(),
        changeRole: jest.fn(),
        assignCurator: jest.fn(),
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

describe('Переписки', () => {
    it('показывает причину, по которой список переписок не загрузился', async () => {
        ;(api.getConversations as jest.Mock).mockRejectedValue(refusal(403, 'forbidden'))

        render(<AdminConversationList />)

        expect(await screen.findByText('Нет доступа')).toBeInTheDocument()
    })
})
