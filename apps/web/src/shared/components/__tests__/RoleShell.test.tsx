/**
 * Оболочка по роли: что показано и когда.
 *
 * Сценарии способности `role-aware-shell`. Проверяется не то, что компонент
 * рисует, а то, чего он не рисует: клиентская оболочка не должна достаться
 * куратору ни в один кадр.
 */

import { render, screen, waitFor } from '@testing-library/react'

import { RoleShell } from '../RoleShell'
import { useCurrentUser } from '@/shared/hooks/useCurrentUser'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush, replace: jest.fn(), prefetch: jest.fn() }),
}))

jest.mock('@/shared/hooks/useCurrentUser', () => ({
    useCurrentUser: jest.fn(),
}))

jest.mock('@/features/admin', () => ({
    AdminLayout: ({ children, userName }: { children: React.ReactNode; userName: string }) => (
        <div data-testid="admin-layout" data-user={userName}>{children}</div>
    ),
}))

jest.mock('@/features/curator', () => ({
    CuratorLayout: ({ children, userName }: { children: React.ReactNode; userName: string }) => (
        <div data-testid="curator-layout" data-user={userName}>{children}</div>
    ),
}))

jest.mock('@/features/dashboard/components/DashboardLayout', () => ({
    DashboardLayout: ({ children, userName }: { children: React.ReactNode; userName: string }) => (
        <div data-testid="dashboard-layout" data-user={userName}>{children}</div>
    ),
}))

const currentUser = useCurrentUser as jest.Mock

beforeEach(() => {
    jest.clearAllMocks()
})

describe('оболочку выбирает роль из сессии', () => {
    it('куратор получает кураторскую оболочку', () => {
        currentUser.mockReturnValue({
            user: { id: '1', email: 'c@b.c', full_name: 'Куратор', role: 'coordinator' },
            state: 'ready',
        })

        render(<RoleShell><div>внутри</div></RoleShell>)

        expect(screen.getByTestId('curator-layout')).toBeInTheDocument()
        expect(screen.queryByTestId('dashboard-layout')).not.toBeInTheDocument()
        expect(screen.getByText('внутри')).toBeInTheDocument()
    })

    it('администратор получает административную оболочку', () => {
        currentUser.mockReturnValue({
            user: { id: '1', email: 'a@b.c', full_name: 'Админ', role: 'super_admin' },
            state: 'ready',
        })

        render(<RoleShell><div>внутри</div></RoleShell>)

        expect(screen.getByTestId('admin-layout')).toBeInTheDocument()
        expect(screen.queryByTestId('dashboard-layout')).not.toBeInTheDocument()
    })

    it('клиент получает клиентскую оболочку', () => {
        currentUser.mockReturnValue({
            user: { id: '1', email: 'u@b.c', role: 'client' },
            state: 'ready',
        })

        render(<RoleShell><div>внутри</div></RoleShell>)

        expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument()
    })

    it('локальный слепок с ролью клиента не перебивает сессию куратора', () => {
        localStorage.setItem('user', JSON.stringify({ role: 'client', name: 'Он же' }))
        currentUser.mockReturnValue({
            user: { id: '1', email: 'c@b.c', full_name: 'Куратор', role: 'coordinator' },
            state: 'ready',
        })

        render(<RoleShell><div>внутри</div></RoleShell>)

        expect(screen.getByTestId('curator-layout')).toBeInTheDocument()
        localStorage.clear()
    })
})

describe('неизвестная роль не подменяется клиентской', () => {
    it('пока роль неизвестна, оболочка не показана', () => {
        currentUser.mockReturnValue({ user: null, state: 'loading' })

        render(<RoleShell><div>внутри</div></RoleShell>)

        expect(screen.queryByTestId('dashboard-layout')).not.toBeInTheDocument()
        expect(screen.queryByTestId('curator-layout')).not.toBeInTheDocument()
        expect(screen.queryByText('внутри')).not.toBeInTheDocument()
        expect(mockPush).not.toHaveBeenCalled()
    })

    it('клиентская оболочка не мелькает перед кураторской', () => {
        // Сессия поднята из cookie: слепка нет, ответ приходит позже.
        currentUser.mockReturnValue({ user: null, state: 'loading' })
        const { rerender } = render(<RoleShell><div>внутри</div></RoleShell>)

        expect(screen.queryByTestId('dashboard-layout')).not.toBeInTheDocument()

        currentUser.mockReturnValue({
            user: { id: '1', email: 'c@b.c', full_name: 'Куратор', role: 'coordinator' },
            state: 'ready',
        })
        rerender(<RoleShell><div>внутри</div></RoleShell>)

        expect(screen.getByTestId('curator-layout')).toBeInTheDocument()
        expect(screen.queryByTestId('dashboard-layout')).not.toBeInTheDocument()
    })

    it('сессии нет — уводит на вход и оболочку не показывает', async () => {
        currentUser.mockReturnValue({ user: null, state: 'anonymous' })

        render(<RoleShell><div>внутри</div></RoleShell>)

        await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth'))
        expect(screen.queryByText('внутри')).not.toBeInTheDocument()
    })

    it('сервер не ответил, а слепок есть — оболочка по слепку, не пустой экран', () => {
        // Так ведёт себя useCurrentUser: при отказе запроса он оставляет
        // состояние `ready` с профилем из слепка.
        currentUser.mockReturnValue({
            user: { id: '1', email: 'c@b.c', full_name: 'Куратор', role: 'coordinator' },
            state: 'ready',
        })

        render(<RoleShell><div>внутри</div></RoleShell>)

        expect(screen.getByTestId('curator-layout')).toBeInTheDocument()
        expect(mockPush).not.toHaveBeenCalled()
    })
})

describe('имя в заголовке', () => {
    it('берётся из сессии, когда экран его не знает', () => {
        currentUser.mockReturnValue({
            user: { id: '1', email: 'u@b.c', full_name: 'Из сессии', role: 'client' },
            state: 'ready',
        })

        render(<RoleShell><div>внутри</div></RoleShell>)

        expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-user', 'Из сессии')
    })

    it('уступает имени, которое экран знает точнее', () => {
        currentUser.mockReturnValue({
            user: { id: '1', email: 'u@b.c', full_name: 'Из сессии', role: 'client' },
            state: 'ready',
        })

        render(<RoleShell userName="Из профиля"><div>внутри</div></RoleShell>)

        expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-user', 'Из профиля')
    })

    it('падает на почту, когда имени нет нигде', () => {
        currentUser.mockReturnValue({
            user: { id: '1', email: 'u@b.c', role: 'client' },
            state: 'ready',
        })

        render(<RoleShell><div>внутри</div></RoleShell>)

        expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-user', 'u@b.c')
    })
})
