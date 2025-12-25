/**
 * Unit Tests: Chat Notifications
 * Tests browser notification utilities
 */

import {
    requestNotificationPermission,
    showNotification,
    isNotificationSupported,
    hasNotificationPermission,
} from '../chat/notifications'

describe('Chat Notifications', () => {
    const originalNotification = global.Notification

    beforeEach(() => {
        jest.clearAllMocks()
        // Reset Notification mock
        delete (global as any).Notification
    })

    afterEach(() => {
        global.Notification = originalNotification
    })

    describe('isNotificationSupported', () => {
        it('should return false when window is undefined', () => {
            const originalWindow = global.window
            delete (global as any).window

            const result = isNotificationSupported()

            expect(result).toBe(false)
            global.window = originalWindow
        })

        it('should return false when Notification is not available', () => {
            const originalWindow = global.window
            global.window = {} as any

            const result = isNotificationSupported()

            expect(result).toBe(false)
            global.window = originalWindow
        })

        it('should return true when Notification is available', () => {
            global.Notification = jest.fn() as any

            const result = isNotificationSupported()

            expect(result).toBe(true)
        })
    })

    describe('hasNotificationPermission', () => {
        it('should return false when window is undefined', () => {
            const originalWindow = global.window
            delete (global as any).window

            const result = hasNotificationPermission()

            expect(result).toBe(false)
            global.window = originalWindow
        })

        it('should return false when Notification is not available', () => {
            const originalWindow = global.window
            global.window = {} as any

            const result = hasNotificationPermission()

            expect(result).toBe(false)
            global.window = originalWindow
        })

        it('should return true when permission is granted', () => {
            global.Notification = {
                permission: 'granted',
            } as any

            const result = hasNotificationPermission()

            expect(result).toBe(true)
        })

        it('should return false when permission is denied', () => {
            global.Notification = {
                permission: 'denied',
            } as any

            const result = hasNotificationPermission()

            expect(result).toBe(false)
        })

        it('should return false when permission is default', () => {
            global.Notification = {
                permission: 'default',
            } as any

            const result = hasNotificationPermission()

            expect(result).toBe(false)
        })
    })

    describe('requestNotificationPermission', () => {
        it('should return false when window is undefined', async () => {
            const originalWindow = global.window
            delete (global as any).window

            const result = await requestNotificationPermission()

            expect(result).toBe(false)
            global.window = originalWindow
        })

        it('should return false when Notification is not available', async () => {
            const originalWindow = global.window
            global.window = {} as any

            const result = await requestNotificationPermission()

            expect(result).toBe(false)
            global.window = originalWindow
        })

        it('should return true when permission is already granted', async () => {
            global.Notification = {
                permission: 'granted',
            } as any

            const result = await requestNotificationPermission()

            expect(result).toBe(true)
        })

        it('should return false when permission is denied', async () => {
            global.Notification = {
                permission: 'denied',
            } as any

            const result = await requestNotificationPermission()

            expect(result).toBe(false)
        })

        it('should request permission when default', async () => {
            const mockRequestPermission = jest.fn().mockResolvedValue('granted')

            global.Notification = {
                permission: 'default',
                requestPermission: mockRequestPermission,
            } as any

            const result = await requestNotificationPermission()

            expect(mockRequestPermission).toHaveBeenCalled()
            expect(result).toBe(true)
        })

        it('should return false when permission request is denied', async () => {
            const mockRequestPermission = jest.fn().mockResolvedValue('denied')

            global.Notification = {
                permission: 'default',
                requestPermission: mockRequestPermission,
            } as any

            const result = await requestNotificationPermission()

            expect(mockRequestPermission).toHaveBeenCalled()
            expect(result).toBe(false)
        })
    })

    describe('showNotification', () => {
        it('should return null when window is undefined', async () => {
            const originalWindow = global.window
            delete (global as any).window

            const result = await showNotification('Test')

            expect(result).toBeNull()
            global.window = originalWindow
        })

        it('should return null when Notification is not available', async () => {
            const originalWindow = global.window
            global.window = {} as any

            const result = await showNotification('Test')

            expect(result).toBeNull()
            global.window = originalWindow
        })

        it('should return null when permission is denied', async () => {
            const mockRequestPermission = jest.fn().mockResolvedValue('denied')

            global.Notification = jest.fn().mockImplementation((title, options) => ({
                title,
                ...options,
            })) as any

            Object.defineProperty(global.Notification, 'permission', {
                value: 'denied',
                writable: true,
                configurable: true,
            })
            global.Notification.requestPermission = mockRequestPermission

            const result = await showNotification('Test')

            expect(result).toBeNull()
        })

        it('should show notification when permission is granted', async () => {
            const mockNotification = { title: 'Test' }
            const mockRequestPermission = jest.fn().mockResolvedValue('granted')
            const mockNotificationConstructor = jest.fn().mockReturnValue(mockNotification)

            global.Notification = mockNotificationConstructor as any
            Object.defineProperty(global.Notification, 'permission', {
                value: 'granted',
                writable: true,
                configurable: true,
            })
            global.Notification.requestPermission = mockRequestPermission

            const result = await showNotification('Test', { body: 'Test body' })

            expect(mockNotificationConstructor).toHaveBeenCalledWith('Test', {
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                body: 'Test body',
            })
            expect(result).toBe(mockNotification)
        })

        it('should handle errors gracefully', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
            const mockRequestPermission = jest.fn().mockResolvedValue('granted')
            const mockNotificationConstructor = jest.fn().mockImplementation(() => {
                throw new Error('Notification error')
            })

            global.Notification = mockNotificationConstructor as any
            Object.defineProperty(global.Notification, 'permission', {
                value: 'granted',
                writable: true,
                configurable: true,
            })
            global.Notification.requestPermission = mockRequestPermission

            const result = await showNotification('Test')

            expect(result).toBeNull()
            expect(consoleErrorSpy).toHaveBeenCalled()

            consoleErrorSpy.mockRestore()
        })
    })
})

