import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { UserList } from '../UserList'
import { adminApi } from '../../api/adminApi'
import type { AdminUser } from '../../types'

jest.mock('../../api/adminApi', () => ({
    adminApi: {
        getUsers: jest.fn(),
    },
}))

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}))

const mockAdminApi = adminApi as jest.Mocked<typeof adminApi>

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
    return {
        id: 1,
        email: 'user@example.com',
        name: 'Тест Пользователь',
        role: 'client',
        client_count: 0,
        created_at: '2025-01-01T00:00:00Z',
        ...overrides,
    }
}

describe('UserList', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('shows loading spinner while fetching', () => {
        mockAdminApi.getUsers.mockReturnValue(new Promise(() => {}))
        render(<UserList />)

        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    })

    it('shows error message on failure', async () => {
        mockAdminApi.getUsers.mockRejectedValue(new Error('fail'))
        render(<UserList />)

        await waitFor(() => {
            expect(screen.getByText('Не удалось загрузить пользователей')).toBeInTheDocument()
        })
    })

    it('renders user list after loading', async () => {
        mockAdminApi.getUsers.mockResolvedValue([
            makeUser({ id: 1, name: 'Анна', email: 'anna@test.com' }),
            makeUser({ id: 2, name: 'Борис', email: 'boris@test.com' }),
        ])

        render(<UserList />)

        await waitFor(() => {
            expect(screen.getByText('Анна')).toBeInTheDocument()
            expect(screen.getByText('Борис')).toBeInTheDocument()
        })
    })

    it('shows user count text', async () => {
        mockAdminApi.getUsers.mockResolvedValue([
            makeUser({ id: 1 }),
            makeUser({ id: 2 }),
        ])

        render(<UserList />)

        await waitFor(() => {
            expect(screen.getByText('2 из 2 пользователей')).toBeInTheDocument()
        })
    })

    it('filters by search (name)', async () => {
        mockAdminApi.getUsers.mockResolvedValue([
            makeUser({ id: 1, name: 'Анна', email: 'anna@test.com' }),
            makeUser({ id: 2, name: 'Борис', email: 'boris@test.com' }),
        ])

        render(<UserList />)

        await waitFor(() => {
            expect(screen.getByText('Анна')).toBeInTheDocument()
        })

        const searchInput = screen.getByPlaceholderText('Поиск по имени или email...')
        fireEvent.change(searchInput, { target: { value: 'Анна' } })

        expect(screen.getByText('Анна')).toBeInTheDocument()
        expect(screen.queryByText('Борис')).not.toBeInTheDocument()
        expect(screen.getByText('1 из 2 пользователей')).toBeInTheDocument()
    })

    it('filters by search (email)', async () => {
        mockAdminApi.getUsers.mockResolvedValue([
            makeUser({ id: 1, name: 'Анна', email: 'anna@test.com' }),
            makeUser({ id: 2, name: 'Борис', email: 'boris@test.com' }),
        ])

        render(<UserList />)

        await waitFor(() => {
            expect(screen.getByText('Анна')).toBeInTheDocument()
        })

        const searchInput = screen.getByPlaceholderText('Поиск по имени или email...')
        fireEvent.change(searchInput, { target: { value: 'boris@' } })

        expect(screen.queryByText('Анна')).not.toBeInTheDocument()
        expect(screen.getByText('Борис')).toBeInTheDocument()
    })

    it('filters by role', async () => {
        mockAdminApi.getUsers.mockResolvedValue([
            makeUser({ id: 1, name: 'Алексей Клиентов', role: 'client' }),
            makeUser({ id: 2, name: 'Мария Кураторова', role: 'coordinator' }),
        ])

        render(<UserList />)

        await waitFor(() => {
            expect(screen.getByText('Алексей Клиентов')).toBeInTheDocument()
        })

        const select = screen.getByDisplayValue('Все роли')
        fireEvent.change(select, { target: { value: 'coordinator' } })

        expect(screen.queryByText('Алексей Клиентов')).not.toBeInTheDocument()
        expect(screen.getByText('Мария Кураторова')).toBeInTheDocument()
    })

    it('shows empty filtered results message', async () => {
        mockAdminApi.getUsers.mockResolvedValue([
            makeUser({ id: 1, name: 'Анна', email: 'anna@test.com' }),
        ])

        render(<UserList />)

        await waitFor(() => {
            expect(screen.getByText('Анна')).toBeInTheDocument()
        })

        const searchInput = screen.getByPlaceholderText('Поиск по имени или email...')
        fireEvent.change(searchInput, { target: { value: 'nonexistent' } })

        expect(screen.getByText('Пользователи не найдены')).toBeInTheDocument()
    })

    it('navigates to user detail on click', async () => {
        mockAdminApi.getUsers.mockResolvedValue([
            makeUser({ id: 42, name: 'Анна' }),
        ])

        render(<UserList />)

        await waitFor(() => {
            expect(screen.getByText('Анна')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByRole('button'))
        expect(mockPush).toHaveBeenCalledWith('/admin/users/42')
    })

    it('shows curator name for client users', async () => {
        mockAdminApi.getUsers.mockResolvedValue([
            makeUser({ id: 1, name: 'Анна', role: 'client', curator_name: 'Мария' }),
        ])

        render(<UserList />)

        await waitFor(() => {
            expect(screen.getByText('Куратор: Мария')).toBeInTheDocument()
        })
    })

    it('shows client count for coordinators', async () => {
        mockAdminApi.getUsers.mockResolvedValue([
            makeUser({ id: 1, name: 'Мария', role: 'coordinator', client_count: 3 }),
        ])

        render(<UserList />)

        await waitFor(() => {
            expect(screen.getByText('Клиентов: 3')).toBeInTheDocument()
        })
    })
})
