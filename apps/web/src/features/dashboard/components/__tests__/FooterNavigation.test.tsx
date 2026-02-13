import { render, fireEvent } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { FooterNavigation } from '../FooterNavigation'
import { NAVIGATION_ITEMS } from '../../utils/navigationConfig'

// Mock Next.js router
jest.mock('next/navigation', () => ({
    useRouter: jest.fn(),
}))

describe('FooterNavigation', () => {
    let mockPush: jest.Mock

    beforeEach(() => {
        mockPush = jest.fn()
            ; (useRouter as unknown as jest.Mock).mockReturnValue({
                push: mockPush,
            })
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('Unit Tests - Specific Examples', () => {
        it('should render all five navigation items', () => {
            const { container } = render(<FooterNavigation />)

            const navItems = container.querySelectorAll('[data-testid^="nav-item-"]')
            expect(navItems).toHaveLength(5)
        })

        it('should render with correct Russian labels', () => {
            const { getByText } = render(<FooterNavigation />)

            expect(getByText('Дашборд')).toBeInTheDocument()
            expect(getByText('Фудтрекер')).toBeInTheDocument()
            expect(getByText('Тренировка')).toBeInTheDocument()
            expect(getByText('Чат')).toBeInTheDocument()
            expect(getByText('Контент')).toBeInTheDocument()
        })

        it('should mark Dashboard as active by default', () => {
            const { container } = render(<FooterNavigation />)

            const dashboardItem = container.querySelector('[data-testid="nav-item-dashboard"]')
            expect(dashboardItem).toHaveAttribute('aria-current', 'page')
            expect(dashboardItem).toHaveClass('text-blue-600')
        })

        it('should mark Workout item as disabled', () => {
            const { container } = render(<FooterNavigation />)

            const workoutItem = container.querySelector('[data-testid="nav-item-workout"]')
            expect(workoutItem).toHaveAttribute('disabled')
            expect(workoutItem).toHaveAttribute('aria-disabled', 'true')
            expect(workoutItem).toHaveClass('opacity-40')
        })

        it('should navigate when enabled item is clicked', () => {
            const { container } = render(<FooterNavigation />)

            const foodTrackerItem = container.querySelector('[data-testid="nav-item-food-tracker"]')
            fireEvent.click(foodTrackerItem!)

            expect(mockPush).toHaveBeenCalledTimes(1)
            expect(mockPush).toHaveBeenCalledWith('/food-tracker')
        })

        it('should not navigate when disabled item is clicked', () => {
            const { container } = render(<FooterNavigation />)

            const workoutItem = container.querySelector('[data-testid="nav-item-workout"]')
            fireEvent.click(workoutItem!)

            expect(mockPush).not.toHaveBeenCalled()
        })

        it('should update active state when navigation item is clicked', () => {
            const { container } = render(<FooterNavigation />)

            // Initially Dashboard is active
            const dashboardItem = container.querySelector('[data-testid="nav-item-dashboard"]')
            expect(dashboardItem).toHaveAttribute('aria-current', 'page')

            // Click on Chat
            const chatItem = container.querySelector('[data-testid="nav-item-chat"]')
            fireEvent.click(chatItem!)

            // Chat should now be active
            const updatedChatItem = container.querySelector('[data-testid="nav-item-chat"]')
            expect(updatedChatItem).toHaveAttribute('aria-current', 'page')
            expect(updatedChatItem).toHaveClass('text-blue-600')
        })

        it('should call onNavigate callback when provided', () => {
            const mockOnNavigate = jest.fn()
            const { container } = render(<FooterNavigation onNavigate={mockOnNavigate} />)

            const chatItem = container.querySelector('[data-testid="nav-item-chat"]')
            fireEvent.click(chatItem!)

            expect(mockOnNavigate).toHaveBeenCalledTimes(1)
            expect(mockOnNavigate).toHaveBeenCalledWith('chat')
        })

        it('should not call onNavigate for disabled items', () => {
            const mockOnNavigate = jest.fn()
            const { container } = render(<FooterNavigation onNavigate={mockOnNavigate} />)

            const workoutItem = container.querySelector('[data-testid="nav-item-workout"]')
            fireEvent.click(workoutItem!)

            expect(mockOnNavigate).not.toHaveBeenCalled()
        })

        it('should accept custom activeItem prop', () => {
            const { container } = render(<FooterNavigation activeItem="chat" />)

            const chatItem = container.querySelector('[data-testid="nav-item-chat"]')
            expect(chatItem).toHaveAttribute('aria-current', 'page')
            expect(chatItem).toHaveClass('text-blue-600')
        })

        it('should have fixed positioning at bottom', () => {
            const { container } = render(<FooterNavigation />)

            const nav = container.querySelector('[data-testid="footer-navigation"]')
            expect(nav).toHaveClass('fixed')
            expect(nav).toHaveClass('bottom-0')
            expect(nav).toHaveClass('left-0')
            expect(nav).toHaveClass('right-0')
        })

        it('should have proper z-index for layering', () => {
            const { container } = render(<FooterNavigation />)

            const nav = container.querySelector('[data-testid="footer-navigation"]')
            expect(nav).toHaveClass('z-50')
        })

        it('should have border-top for visual separation', () => {
            const { container } = render(<FooterNavigation />)

            const nav = container.querySelector('[data-testid="footer-navigation"]')
            expect(nav).toHaveClass('border-t')
            expect(nav).toHaveClass('border-gray-200')
        })

        it('should have white background', () => {
            const { container } = render(<FooterNavigation />)

            const nav = container.querySelector('[data-testid="footer-navigation"]')
            expect(nav).toHaveClass('bg-white')
        })

        it('should have proper ARIA label', () => {
            const { container } = render(<FooterNavigation />)

            const nav = container.querySelector('[data-testid="footer-navigation"]')
            expect(nav).toHaveAttribute('aria-label', 'Основная навигация')
        })

        it('should have safe area inset for mobile devices', () => {
            const { container } = render(<FooterNavigation />)

            const nav = container.querySelector('[data-testid="footer-navigation"]') as HTMLElement
            expect(nav.style.paddingBottom).toBe('max(0.5rem, env(safe-area-inset-bottom))')
        })

        it('should render all items from NAVIGATION_ITEMS config', () => {
            const { container } = render(<FooterNavigation />)

            NAVIGATION_ITEMS.forEach((item) => {
                const navItem = container.querySelector(`[data-testid="nav-item-${item.id}"]`)
                expect(navItem).toBeInTheDocument()
                expect(navItem).toHaveAttribute('data-href', item.href)
            })
        })

        it('should navigate to correct routes for each item', () => {
            const { container } = render(<FooterNavigation />)

            const testCases = [
                { id: 'dashboard', href: '/dashboard' },
                { id: 'food-tracker', href: '/food-tracker' },
                { id: 'chat', href: '/chat' },
                { id: 'content', href: '/content' },
            ]

            testCases.forEach(({ id, href }) => {
                mockPush.mockClear()
                const navItem = container.querySelector(`[data-testid="nav-item-${id}"]`)
                fireEvent.click(navItem!)
                expect(mockPush).toHaveBeenCalledWith(href)
            })
        })
    })
})
