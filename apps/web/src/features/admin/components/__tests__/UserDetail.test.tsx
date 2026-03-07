import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { UserDetail } from '../UserDetail'
import { adminApi } from '../../api/adminApi'
import toast from 'react-hot-toast'
import type { AdminUser, CuratorLoad } from '../../types'

jest.mock('../../api/adminApi', () => ({
    adminApi: {
        getUsers: jest.fn(),
        getCurators: jest.fn(),
        changeRole: jest.fn(),
        assignCurator: jest.fn(),
    },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        success: jest.fn(),
        error: jest.fn(),
    },
}))

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}))

const mockAdminApi = adminApi as jest.Mocked<typeof adminApi>
const mockToast = toast as jest.Mocked<typeof toast>

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
    return {
        id: 1,
        email: 'user@example.com',
        name: 'Тест Пользователь',
        role: 'client',
        client_count: 0,
        created_at: '2025-01-15T00:00:00Z',
        ...overrides,
    }
}

function makeCurator(overrides: Partial<CuratorLoad> = {}): CuratorLoad {
    return {
        id: 10,
        name: 'Куратор Один',
        email: 'curator1@example.com',
        client_count: 3,
        ...overrides,
    }
}

describe('UserDetail', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        window.confirm = jest.fn().mockReturnValue(true)
    })

    it('shows loading state', () => {
        mockAdminApi.getUsers.mockReturnValue(new Promise(() => {}))
        mockAdminApi.getCurators.mockReturnValue(new Promise(() => {}))

        render(<UserDetail userId={1} />)

        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    })

    it('shows error when user not found', async () => {
        mockAdminApi.getUsers.mockResolvedValue([])
        mockAdminApi.getCurators.mockResolvedValue([])

        render(<UserDetail userId={999} />)

        await waitFor(() => {
            expect(screen.getByText('Пользователь не найден')).toBeInTheDocument()
        })
    })

    it('shows error on API failure', async () => {
        mockAdminApi.getUsers.mockRejectedValue(new Error('fail'))
        mockAdminApi.getCurators.mockRejectedValue(new Error('fail'))

        render(<UserDetail userId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Не удалось загрузить данные')).toBeInTheDocument()
        })
    })

    it('renders user info (name, email, role, dates)', async () => {
        const user = makeUser({
            id: 1,
            name: 'Анна Петрова',
            email: 'anna@example.com',
            role: 'client',
            created_at: '2025-01-15T00:00:00Z',
            last_login_at: '2025-06-01T00:00:00Z',
        })
        mockAdminApi.getUsers.mockResolvedValue([user])
        mockAdminApi.getCurators.mockResolvedValue([])

        render(<UserDetail userId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Анна Петрова')).toBeInTheDocument()
        })

        expect(screen.getByText('anna@example.com')).toBeInTheDocument()
        // "Клиент" appears both as role label and as role change button, check role label exists
        expect(screen.getByText('Роль')).toBeInTheDocument()
        expect(screen.getByText('Регистрация')).toBeInTheDocument()
        expect(screen.getByText('Последний вход')).toBeInTheDocument()
    })

    it('role change buttons: current role is disabled', async () => {
        mockAdminApi.getUsers.mockResolvedValue([makeUser({ id: 1, role: 'client' })])
        mockAdminApi.getCurators.mockResolvedValue([])

        render(<UserDetail userId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Управление ролью')).toBeInTheDocument()
        })

        // The "Клиент" button should be disabled since user is already client
        const clientBtn = screen.getByRole('button', { name: 'Клиент' })
        expect(clientBtn).toBeDisabled()

        const curatorBtn = screen.getByRole('button', { name: 'Куратор' })
        expect(curatorBtn).not.toBeDisabled()
    })

    it('does not show role management for super_admin', async () => {
        mockAdminApi.getUsers.mockResolvedValue([makeUser({ id: 1, role: 'super_admin' })])
        mockAdminApi.getCurators.mockResolvedValue([])

        render(<UserDetail userId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Админ')).toBeInTheDocument()
        })

        expect(screen.queryByText('Управление ролью')).not.toBeInTheDocument()
    })

    it('shows toast on successful role change', async () => {
        mockAdminApi.getUsers.mockResolvedValue([makeUser({ id: 1, role: 'client' })])
        mockAdminApi.getCurators.mockResolvedValue([])
        mockAdminApi.changeRole.mockResolvedValue(undefined)
        // After role change, refresh returns updated user
        mockAdminApi.getUsers.mockResolvedValueOnce([makeUser({ id: 1, role: 'client' })])
            .mockResolvedValueOnce([makeUser({ id: 1, role: 'coordinator' })])

        render(<UserDetail userId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Управление ролью')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByRole('button', { name: 'Куратор' }))

        await waitFor(() => {
            expect(mockAdminApi.changeRole).toHaveBeenCalledWith(1, 'coordinator')
            expect(mockToast.success).toHaveBeenCalledWith('Роль изменена')
        })
    })

    it('shows toast on role change failure', async () => {
        mockAdminApi.getUsers.mockResolvedValue([makeUser({ id: 1, role: 'client' })])
        mockAdminApi.getCurators.mockResolvedValue([])
        mockAdminApi.changeRole.mockRejectedValue(new Error('fail'))

        render(<UserDetail userId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Управление ролью')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByRole('button', { name: 'Куратор' }))

        await waitFor(() => {
            expect(mockToast.error).toHaveBeenCalledWith('Не удалось изменить роль')
        })
    })

    it('shows curator assignment section for client role users', async () => {
        const curator = makeCurator({ id: 10, name: 'Куратор Один' })
        mockAdminApi.getUsers.mockResolvedValue([makeUser({ id: 1, role: 'client' })])
        mockAdminApi.getCurators.mockResolvedValue([curator])

        render(<UserDetail userId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Назначить куратора')).toBeInTheDocument()
            expect(screen.getByText('Куратор Один')).toBeInTheDocument()
        })
    })

    it('does not show curator assignment for coordinator role', async () => {
        mockAdminApi.getUsers.mockResolvedValue([makeUser({ id: 1, role: 'coordinator' })])
        mockAdminApi.getCurators.mockResolvedValue([makeCurator()])

        render(<UserDetail userId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Управление ролью')).toBeInTheDocument()
        })

        expect(screen.queryByText('Назначить куратора')).not.toBeInTheDocument()
    })

    it('assigns curator and shows success toast', async () => {
        const curator = makeCurator({ id: 10 })
        mockAdminApi.getUsers.mockResolvedValue([makeUser({ id: 1, role: 'client' })])
        mockAdminApi.getCurators.mockResolvedValue([curator])
        mockAdminApi.assignCurator.mockResolvedValue(undefined)
        // After assign, refresh returns updated user
        mockAdminApi.getUsers.mockResolvedValueOnce([makeUser({ id: 1, role: 'client' })])
            .mockResolvedValueOnce([makeUser({ id: 1, role: 'client', curator_id: 10 })])

        render(<UserDetail userId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Куратор Один')).toBeInTheDocument()
        })

        // Click the curator button
        const curatorButtons = screen.getAllByRole('button').filter(
            btn => btn.textContent?.includes('Куратор Один')
        )
        fireEvent.click(curatorButtons[0])

        await waitFor(() => {
            expect(mockAdminApi.assignCurator).toHaveBeenCalledWith(1, 10)
            expect(mockToast.success).toHaveBeenCalledWith('Куратор назначен')
        })
    })

    it('shows "Текущий" label for assigned curator', async () => {
        const curator = makeCurator({ id: 10 })
        mockAdminApi.getUsers.mockResolvedValue([
            makeUser({ id: 1, role: 'client', curator_id: 10 }),
        ])
        mockAdminApi.getCurators.mockResolvedValue([curator])

        render(<UserDetail userId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Текущий')).toBeInTheDocument()
        })
    })

    it('shows back button that navigates to /admin/users', async () => {
        mockAdminApi.getUsers.mockResolvedValue([makeUser({ id: 1 })])
        mockAdminApi.getCurators.mockResolvedValue([])

        render(<UserDetail userId={1} />)

        await waitFor(() => {
            expect(screen.getByLabelText('Назад')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByLabelText('Назад'))
        expect(mockPush).toHaveBeenCalledWith('/admin/users')
    })
})
