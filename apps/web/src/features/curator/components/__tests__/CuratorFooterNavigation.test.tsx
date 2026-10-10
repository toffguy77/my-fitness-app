import { render, screen, fireEvent } from '@testing-library/react'
import { CuratorFooterNavigation } from '../CuratorFooterNavigation'

const mockPush = jest.fn()
let mockPathname: string | null = null
jest.mock('next/navigation', () => ({
    usePathname: () => mockPathname,
    useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/features/chat/hooks/useUnreadCount', () => ({
    useUnreadCount: () => 0,
}))

describe('CuratorFooterNavigation', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders 6 navigation items', () => {
        render(<CuratorFooterNavigation />)

        expect(screen.getByText('Клиенты')).toBeInTheDocument()
        expect(screen.getByText('Чаты')).toBeInTheDocument()
        expect(screen.getByText('Контент')).toBeInTheDocument()
        expect(screen.getByText('Рецепты')).toBeInTheDocument()
        expect(screen.getByTestId('nav-item-recipes')).toHaveAttribute('data-href', '/curator/recipes')
        expect(screen.getByText('Заявки')).toBeInTheDocument()
        expect(screen.getByText('Обращения')).toBeInTheDocument()
    })

    // Leads and support used to be administrator-only screens reachable at
    // /admin/leads and /admin/support. The curator workspace is the only
    // place they exist now, so their nav entries have to point there.
    it('sends the curator to /curator/leads and /curator/support', () => {
        const onNavigate = jest.fn()
        render(<CuratorFooterNavigation onNavigate={onNavigate} />)

        fireEvent.click(screen.getByTestId('nav-item-leads'))
        expect(onNavigate).toHaveBeenCalledWith('leads')
        expect(mockPush).toHaveBeenCalledWith('/curator/leads')

        fireEvent.click(screen.getByTestId('nav-item-support'))
        expect(onNavigate).toHaveBeenCalledWith('support')
        expect(mockPush).toHaveBeenCalledWith('/curator/support')
    })

    it('has aria-label on nav element', () => {
        render(<CuratorFooterNavigation />)

        expect(screen.getByLabelText('Навигация куратора')).toBeInTheDocument()
    })

    it.each([
        ['/curator', 'hub'],
        ['/curator/clients/17', 'hub'],
        ['/curator/chat/17', 'chats'],
        ['/curator/content/new', 'content'],
        ['/curator/leads', 'leads'],
        ['/curator/support', 'support'],
    ])('the address decides the tab: %s → %s', (path, id) => {
        mockPathname = path
        render(<CuratorFooterNavigation activeItem="hub" />)
        expect(screen.getByTestId(`nav-item-${id}`)).toHaveAttribute('aria-current', 'page')
        mockPathname = null
    })

    it('lights the clients hub on /curator', () => {
        mockPathname = '/curator'
        render(<CuratorFooterNavigation />)
        mockPathname = null

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

    it('active item is inked, the rest are subdued', () => {
        render(<CuratorFooterNavigation activeItem="chats" />)

        const chatsBtn = screen.getByTestId('nav-item-chats')
        expect(chatsBtn).toHaveClass('text-fg')

        const clientsBtn = screen.getByTestId('nav-item-hub')
        expect(clientsBtn).toHaveClass('text-fg-subtle')
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
        expect(screen.getByLabelText('Заявки')).toBeInTheDocument()
        expect(screen.getByLabelText('Обращения')).toBeInTheDocument()
    })

    it('renders with data-testid on the nav container', () => {
        render(<CuratorFooterNavigation />)

        expect(screen.getByTestId('curator-footer-navigation')).toBeInTheDocument()
    })
})
