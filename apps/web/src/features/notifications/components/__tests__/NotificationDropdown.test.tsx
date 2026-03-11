import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { NotificationDropdown } from '../NotificationDropdown'
import type { Notification } from '../../types'

// --- Mocks ---

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}))

const mockFetchNotifications = jest.fn()
const mockMarkAllAsRead = jest.fn()
const mockMarkAsRead = jest.fn()
let mockNotifications: { main: Notification[]; content: Notification[] } = {
    main: [],
    content: [],
}

jest.mock('../../store/notificationsStore', () => ({
    useNotificationsStore: () => ({
        notifications: mockNotifications,
        fetchNotifications: mockFetchNotifications,
        markAllAsRead: mockMarkAllAsRead,
        markAsRead: mockMarkAsRead,
    }),
}))

jest.mock('@/features/content/types', () => ({
    CATEGORY_LABELS: {
        nutrition: 'Питание',
        training: 'Тренировки',
        recipes: 'Рецепты',
        health: 'Здоровье',
        motivation: 'Мотивация',
        general: 'Общее',
    },
}))

function makeNotification(overrides: Partial<Notification> = {}): Notification {
    return {
        id: '1',
        userId: 'u1',
        category: 'content',
        type: 'new_content',
        title: 'Test Title',
        content: 'Test Content',
        createdAt: new Date().toISOString(),
        ...overrides,
    }
}

describe('NotificationDropdown', () => {
    const onClose = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
        mockNotifications = { main: [], content: [] }
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    // Branch: recentNotifications.length === 0
    it('shows empty state when no notifications exist', () => {
        render(<NotificationDropdown onClose={onClose} />)
        expect(screen.getByText('Нет уведомлений')).toBeInTheDocument()
    })

    // Branch: recentNotifications.length > 0 (ungrouped notifications)
    it('renders ungrouped notifications when they exist', () => {
        mockNotifications = {
            main: [],
            content: [
                makeNotification({ id: '1', title: 'Notification A', readAt: 'read' }),
                makeNotification({ id: '2', title: 'Notification B', readAt: 'read' }),
            ],
        }
        render(<NotificationDropdown onClose={onClose} />)
        expect(screen.getByText('Notification A')).toBeInTheDocument()
        expect(screen.getByText('Notification B')).toBeInTheDocument()
    })

    // Branch: notification.actionUrl exists -> router.push
    it('navigates to actionUrl when notification with actionUrl is clicked', () => {
        mockNotifications = {
            main: [],
            content: [
                makeNotification({ id: '1', title: 'Click Me', actionUrl: '/content/123', readAt: 'read' }),
            ],
        }
        render(<NotificationDropdown onClose={onClose} />)
        fireEvent.click(screen.getByText('Click Me'))
        expect(mockPush).toHaveBeenCalledWith('/content/123')
        expect(onClose).toHaveBeenCalled()
    })

    // Branch: notification.actionUrl is undefined -> no router.push, just onClose
    it('calls onClose without navigation when notification has no actionUrl', () => {
        mockNotifications = {
            main: [],
            content: [
                makeNotification({ id: '1', title: 'No Link', readAt: 'read' }),
            ],
        }
        render(<NotificationDropdown onClose={onClose} />)
        fireEvent.click(screen.getByText('No Link'))
        expect(mockPush).not.toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
    })

    // Branch: "View all" button -> router.push('/notifications') + onClose
    it('navigates to /notifications and closes on "View all" click', () => {
        render(<NotificationDropdown onClose={onClose} />)
        fireEvent.click(screen.getByText('Все уведомления'))
        expect(mockPush).toHaveBeenCalledWith('/notifications')
        expect(onClose).toHaveBeenCalled()
    })

    // Branch: grouping logic - 3+ unread recent notifications with same contentCategory
    it('groups 3+ unread recent notifications by contentCategory', () => {
        const now = Date.now()
        const recentTime = new Date(now - 10 * 60 * 1000).toISOString() // 10 min ago
        mockNotifications = {
            main: [],
            content: [
                makeNotification({ id: '1', title: 'N1', contentCategory: 'nutrition', createdAt: recentTime }),
                makeNotification({ id: '2', title: 'N2', contentCategory: 'nutrition', createdAt: recentTime }),
                makeNotification({ id: '3', title: 'N3', contentCategory: 'nutrition', createdAt: recentTime }),
            ],
        }
        render(<NotificationDropdown onClose={onClose} />)
        // Should show grouped header with count and label
        expect(screen.getByText(/3 новых: Питание/)).toBeInTheDocument()
        // Individual notifications should NOT be visible until expanded
        expect(screen.queryByText('N1')).not.toBeInTheDocument()
    })

    // Branch: toggleGroup - expand a group to show individual notifications
    it('expands and collapses a notification group on click', () => {
        const now = Date.now()
        const recentTime = new Date(now - 10 * 60 * 1000).toISOString()
        mockNotifications = {
            main: [],
            content: [
                makeNotification({ id: '1', title: 'N1', contentCategory: 'nutrition', createdAt: recentTime }),
                makeNotification({ id: '2', title: 'N2', contentCategory: 'nutrition', createdAt: recentTime }),
                makeNotification({ id: '3', title: 'N3', contentCategory: 'nutrition', createdAt: recentTime }),
            ],
        }
        render(<NotificationDropdown onClose={onClose} />)

        // Expand the group
        fireEvent.click(screen.getByText(/3 новых: Питание/))
        expect(screen.getByText('N1')).toBeInTheDocument()
        expect(screen.getByText('N2')).toBeInTheDocument()

        // Collapse the group
        fireEvent.click(screen.getByText(/3 новых: Питание/))
        expect(screen.queryByText('N1')).not.toBeInTheDocument()
    })

    // Branch: items.length < 3 -> ungrouped (less than 3 in category)
    it('does not group when fewer than 3 unread recent notifications in same category', () => {
        const now = Date.now()
        const recentTime = new Date(now - 10 * 60 * 1000).toISOString()
        mockNotifications = {
            main: [],
            content: [
                makeNotification({ id: '1', title: 'N1', contentCategory: 'nutrition', createdAt: recentTime }),
                makeNotification({ id: '2', title: 'N2', contentCategory: 'nutrition', createdAt: recentTime }),
            ],
        }
        render(<NotificationDropdown onClose={onClose} />)
        // Should show individual notifications, not grouped
        expect(screen.getByText('N1')).toBeInTheDocument()
        expect(screen.getByText('N2')).toBeInTheDocument()
        expect(screen.queryByText(/новых:/)).not.toBeInTheDocument()
    })

    // Branch: notification is read (readAt set) -> goes to rest, not unreadRecent
    it('puts read notifications in ungrouped list', () => {
        const now = Date.now()
        const recentTime = new Date(now - 10 * 60 * 1000).toISOString()
        mockNotifications = {
            main: [],
            content: [
                makeNotification({ id: '1', title: 'Read One', contentCategory: 'nutrition', createdAt: recentTime, readAt: recentTime }),
            ],
        }
        render(<NotificationDropdown onClose={onClose} />)
        expect(screen.getByText('Read One')).toBeInTheDocument()
        expect(screen.queryByText(/новых:/)).not.toBeInTheDocument()
    })

    // Branch: notification is older than 1 hour -> goes to rest
    it('puts old unread notifications in ungrouped list', () => {
        const now = Date.now()
        const oldTime = new Date(now - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
        mockNotifications = {
            main: [],
            content: [
                makeNotification({ id: '1', title: 'Old One', contentCategory: 'nutrition', createdAt: oldTime }),
            ],
        }
        render(<NotificationDropdown onClose={onClose} />)
        expect(screen.getByText('Old One')).toBeInTheDocument()
    })

    // Branch: notification has no contentCategory -> goes to rest
    it('puts notifications without contentCategory in ungrouped list', () => {
        const now = Date.now()
        const recentTime = new Date(now - 10 * 60 * 1000).toISOString()
        mockNotifications = {
            main: [],
            content: [
                makeNotification({ id: '1', title: 'No Cat', createdAt: recentTime, contentCategory: undefined }),
            ],
        }
        render(<NotificationDropdown onClose={onClose} />)
        expect(screen.getByText('No Cat')).toBeInTheDocument()
    })

    // Branch: CATEGORY_LABELS fallback - unknown category uses raw category string
    it('uses raw category string when CATEGORY_LABELS has no match', () => {
        const now = Date.now()
        const recentTime = new Date(now - 10 * 60 * 1000).toISOString()
        mockNotifications = {
            main: [],
            content: [
                makeNotification({ id: '1', title: 'N1', contentCategory: 'unknown_cat', createdAt: recentTime }),
                makeNotification({ id: '2', title: 'N2', contentCategory: 'unknown_cat', createdAt: recentTime }),
                makeNotification({ id: '3', title: 'N3', contentCategory: 'unknown_cat', createdAt: recentTime }),
            ],
        }
        render(<NotificationDropdown onClose={onClose} />)
        expect(screen.getByText(/3 новых: unknown_cat/)).toBeInTheDocument()
    })

    // Branch: click outside dropdown -> onClose called
    it('calls onClose when clicking outside the dropdown', () => {
        render(<NotificationDropdown onClose={onClose} />)

        // Advance past the setTimeout(0)
        act(() => {
            jest.runAllTimers()
        })

        // Simulate clicking outside
        fireEvent.mouseDown(document)
        expect(onClose).toHaveBeenCalled()
    })

    // Branch: click inside dropdown -> onClose NOT called
    it('does not call onClose when clicking inside the dropdown', () => {
        render(<NotificationDropdown onClose={onClose} />)

        act(() => {
            jest.runAllTimers()
        })

        // Click the "View all" button which is inside the dropdown
        fireEvent.mouseDown(screen.getByText('Все уведомления'))
        expect(onClose).not.toHaveBeenCalled()
    })

    // Branch: fetchNotifications and markAllAsRead called on mount
    it('calls fetchNotifications and markAllAsRead on mount', () => {
        render(<NotificationDropdown onClose={onClose} />)
        expect(mockFetchNotifications).toHaveBeenCalledWith('content')
        expect(mockMarkAllAsRead).toHaveBeenCalledWith('content')
    })

    // Branch: clicking notification inside expanded group
    it('handles click on notification inside expanded group', () => {
        const now = Date.now()
        const recentTime = new Date(now - 10 * 60 * 1000).toISOString()
        mockNotifications = {
            main: [],
            content: [
                makeNotification({ id: '1', title: 'G1', contentCategory: 'nutrition', createdAt: recentTime, actionUrl: '/go' }),
                makeNotification({ id: '2', title: 'G2', contentCategory: 'nutrition', createdAt: recentTime }),
                makeNotification({ id: '3', title: 'G3', contentCategory: 'nutrition', createdAt: recentTime }),
            ],
        }
        render(<NotificationDropdown onClose={onClose} />)

        // Expand group
        fireEvent.click(screen.getByText(/3 новых: Питание/))

        // Click notification with actionUrl
        fireEvent.click(screen.getByText('G1'))
        expect(mockPush).toHaveBeenCalledWith('/go')
        expect(onClose).toHaveBeenCalled()
    })

    // Branch: slicing to max 10 notifications
    it('only shows up to 10 recent notifications', () => {
        mockNotifications = {
            main: [],
            content: Array.from({ length: 15 }, (_, i) =>
                makeNotification({ id: String(i), title: `N${i}`, readAt: 'read' })
            ),
        }
        render(<NotificationDropdown onClose={onClose} />)
        // Should show at most 10
        const buttons = screen.getAllByRole('button')
        // Subtract the "View all" button
        const notificationButtons = buttons.filter(b => b.textContent !== 'Все уведомления')
        expect(notificationButtons.length).toBeLessThanOrEqual(10)
    })
})
