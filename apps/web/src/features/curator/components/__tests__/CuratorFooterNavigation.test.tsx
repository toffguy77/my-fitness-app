import { render, screen, fireEvent } from '@testing-library/react'
import { CuratorFooterNavigation } from '../CuratorFooterNavigation'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/features/chat/hooks/useUnreadCount', () => ({
    useUnreadCount: () => 0,
}))

describe('CuratorFooterNavigation', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders 3 navigation items', () => {
        render(<CuratorFooterNavigation />)

        expect(screen.getByText('Клиенты')).toBeInTheDocument()
        expect(screen.getByText('Чаты')).toBeInTheDocument()
        expect(screen.getByText('Контент')).toBeInTheDocument()
    })

    it('has aria-label on nav element', () => {
        render(<CuratorFooterNavigation />)

        expect(screen.getByLabelText('Навигация куратора')).toBeInTheDocument()
    })

    it('defaults to hub as active item', () => {
        render(<CuratorFooterNavigation />)

        const clientsBtn = screen.getByTestId('nav-item-hub')
        expect(clientsBtn).toHaveAttribute('aria-current', 'page')
    })

    it('marks specified active item with aria-current="page"', () => {
        render(<CuratorFooterNavigation activeItem="chats" />)

        const chatsBtn = screen.getByTestId('nav-item-chats')
        expect(chatsBtn).toHaveAttribute('aria-current', 'page')

        const clientsBtn = screen.getByTestId('nav-item-hub')
        expect(clientsBtn).not.toHaveAttribute('aria-current')
    })

    it('active item has blue text styling', () => {
        render(<CuratorFooterNavigation activeItem="chats" />)

        const chatsBtn = screen.getByTestId('nav-item-chats')
        expect(chatsBtn.className).toContain('text-blue-600')

        const clientsBtn = screen.getByTestId('nav-item-hub')
        expect(clientsBtn.className).toContain('text-gray-600')
    })

    it('calls onNavigate and router.push on click', () => {
        const onNavigate = jest.fn()
        render(<CuratorFooterNavigation onNavigate={onNavigate} />)

        fireEvent.click(screen.getByTestId('nav-item-chats'))

        expect(onNavigate).toHaveBeenCalledWith('chats')
        expect(mockPush).toHaveBeenCalledWith('/curator/chat')
    })

    it('updates active state on click', () => {
        render(<CuratorFooterNavigation />)

        const contentBtn = screen.getByTestId('nav-item-content')
        fireEvent.click(contentBtn)

        expect(contentBtn).toHaveAttribute('aria-current', 'page')

        const clientsBtn = screen.getByTestId('nav-item-hub')
        expect(clientsBtn).not.toHaveAttribute('aria-current')
    })

    it('each button has aria-label matching its label', () => {
        render(<CuratorFooterNavigation />)

        expect(screen.getByLabelText('Клиенты')).toBeInTheDocument()
        expect(screen.getByLabelText('Чаты')).toBeInTheDocument()
        expect(screen.getByLabelText('Контент')).toBeInTheDocument()
    })

    it('renders with data-testid on the nav container', () => {
        render(<CuratorFooterNavigation />)

        expect(screen.getByTestId('curator-footer-navigation')).toBeInTheDocument()
    })
})
