/**
 * Открытие колокольчика ничего не помечает прочитанным.
 *
 * Выпадающий список при открытии звал `markAllAsRead('content')`: счётчик
 * «Контент» обнулялся раньше, чем человек видел хоть один заголовок.
 * Спека notification-dropdown, «Открыть и закрыть».
 *
 * Здесь настоящий стор и подменённый транспорт — проверяется то, что уходит
 * на сервер, и счётчик, который видит человек.
 */

import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { NotificationDropdown } from '../NotificationDropdown'
import { useNotificationsStore } from '../../store/notificationsStore'
import { apiClient } from '@/shared/utils/api-client'
import type { Notification } from '../../types'

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: { success: jest.fn(), error: jest.fn() },
}))

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}))

const mockGet = apiClient.get as jest.Mock
const mockPost = apiClient.post as jest.Mock
const mockPut = apiClient.put as jest.Mock

function unreadContent(id: string): Notification {
    return {
        id,
        userId: 'u1',
        category: 'content',
        type: 'new_content',
        title: `Статья ${id}`,
        content: 'Текст',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    }
}

describe('NotificationDropdown: открыть и закрыть', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        localStorage.clear()
        // Список уже в сторе — так бывает при втором открытии, после
        // страницы уведомлений или из кэша. На пустом списке старая отметка
        // «прочитать все» срабатывала вхолостую, и дефект был не виден.
        useNotificationsStore.setState({
            notifications: { main: [], content: ['1', '2', '3'].map(unreadContent) },
            unreadCounts: { main: 0, content: 3 },
            hasMore: { main: true, content: true },
            listsLoaded: { main: false, content: false },
            isOffline: false,
            isLoading: false,
            error: null,
        })
        mockGet.mockImplementation((url: string) => {
            if (url.includes('/notifications/unread-counts')) return Promise.resolve({ main: 0, content: 3 })
            if (url.includes('category=content')) {
                return Promise.resolve({
                    notifications: ['1', '2', '3'].map(unreadContent),
                    total: 3,
                    hasMore: false,
                })
            }
            return Promise.resolve({ notifications: [], total: 0, hasMore: false })
        })
    })

    it('с тремя непрочитанными «Контент» счётчик после закрытия по-прежнему 3', async () => {
        const { unmount, findByText } = render(<NotificationDropdown onClose={jest.fn()} />)

        // Обе категории загружены.
        await findByText('Статья 1')
        const listUrls = mockGet.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/notifications?'))
        expect(listUrls.some((url) => url.includes('category=main'))).toBe(true)
        expect(listUrls.some((url) => url.includes('category=content'))).toBe(true)

        unmount()

        await waitFor(() => expect(useNotificationsStore.getState().unreadCounts.content).toBe(3))
        expect(useNotificationsStore.getState().notifications.content.every((n) => !n.readAt)).toBe(true)

        // Ни «прочитать все», ни отметки по одному.
        const writes = [...mockPost.mock.calls, ...mockPut.mock.calls].map(([url]) => String(url))
        expect(writes.filter((url) => url.includes('mark-all-read') || url.includes('/read'))).toEqual([])
    })
})
