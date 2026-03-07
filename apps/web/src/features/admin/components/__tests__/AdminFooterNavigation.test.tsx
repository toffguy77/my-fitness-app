import { render, screen, fireEvent } from '@testing-library/react'
import { AdminFooterNavigation } from '../AdminFooterNavigation'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}))

describe('AdminFooterNavigation', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders 4 navigation items', () => {
        render(<AdminFooterNavigation />)

        expect(screen.getByText('Обзор')).toBeInTheDocument()
        expect(screen.getByText('Пользователи')).toBeInTheDocument()
        expect(screen.getByText('Контент')).toBeInTheDocument()
        expect(screen.getByText('Чаты')).toBeInTheDocument()
    })

    it('has aria-label on nav element', () => {
        render(<AdminFooterNavigation />)

        expect(screen.getByLabelText('Навигация администратора')).toBeInTheDocument()
    })

    it('marks active item with aria-current="page"', () => {
        render(<AdminFooterNavigation activeItem="users" />)

        const usersBtn = screen.getByTestId('nav-item-users')
        expect(usersBtn).toHaveAttribute('aria-current', 'page')

        const dashboardBtn = screen.getByTestId('nav-item-dashboard')
        expect(dashboardBtn).not.toHaveAttribute('aria-current')
    })

    it('defaults to dashboard as active item', () => {
        render(<AdminFooterNavigation />)

        const dashboardBtn = screen.getByTestId('nav-item-dashboard')
        expect(dashboardBtn).toHaveAttribute('aria-current', 'page')
    })

    it('active item has blue text styling', () => {
        render(<AdminFooterNavigation activeItem="chats" />)

        const chatsBtn = screen.getByTestId('nav-item-chats')
        expect(chatsBtn.className).toContain('text-blue-600')

        const dashboardBtn = screen.getByTestId('nav-item-dashboard')
        expect(dashboardBtn.className).toContain('text-gray-600')
    })

    it('calls onNavigate and router.push on click', () => {
        const onNavigate = jest.fn()
        render(<AdminFooterNavigation onNavigate={onNavigate} />)

        fireEvent.click(screen.getByTestId('nav-item-users'))

        expect(onNavigate).toHaveBeenCalledWith('users')
        expect(mockPush).toHaveBeenCalledWith('/admin/users')
    })

    it('updates active state on click', () => {
        render(<AdminFooterNavigation />)

        const contentBtn = screen.getByTestId('nav-item-content')
        fireEvent.click(contentBtn)

        expect(contentBtn).toHaveAttribute('aria-current', 'page')

        const dashboardBtn = screen.getByTestId('nav-item-dashboard')
        expect(dashboardBtn).not.toHaveAttribute('aria-current')
    })

    it('each button has aria-label matching its label', () => {
        render(<AdminFooterNavigation />)

        expect(screen.getByLabelText('Обзор')).toBeInTheDocument()
        expect(screen.getByLabelText('Пользователи')).toBeInTheDocument()
        expect(screen.getByLabelText('Контент')).toBeInTheDocument()
        expect(screen.getByLabelText('Чаты')).toBeInTheDocument()
    })

    it('renders with data-testid on the nav container', () => {
        render(<AdminFooterNavigation />)

        expect(screen.getByTestId('admin-footer-navigation')).toBeInTheDocument()
    })
})
