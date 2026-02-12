/**
 * Unit tests for useOnlineStatus hook
 */

import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from '../useOnlineStatus';
import { useDashboardStore } from '../../store/dashboardStore';

// Mock the dashboard store
jest.mock('../../store/dashboardStore');

const mockUseDashboardStore = useDashboardStore as jest.MockedFunction<typeof useDashboardStore>;

describe('useOnlineStatus', () => {
    const mockSetOfflineStatus = jest.fn();
    let mockIsOffline = false;

    beforeEach(() => {
        jest.clearAllMocks();
        mockIsOffline = false;

        mockUseDashboardStore.mockImplementation(() => ({
            setOfflineStatus: mockSetOfflineStatus,
            isOffline: mockIsOffline,
        } as any));

        // Mock navigator.onLine
        Object.defineProperty(navigator, 'onLine', {
            writable: true,
            value: true,
        });
    });

    describe('Initial status', () => {
        it('should set initial status based on navigator.onLine', () => {
            renderHook(() => useOnlineStatus());

            expect(mockSetOfflineStatus).toHaveBeenCalledWith(false);
        });

        it('should set offline status when navigator.onLine is false', () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: false,
            });

            renderHook(() => useOnlineStatus());

            expect(mockSetOfflineStatus).toHaveBeenCalledWith(true);
        });
    });

    describe('Online event', () => {
        it('should update status when online event fires', () => {
            renderHook(() => useOnlineStatus());

            act(() => {
                window.dispatchEvent(new Event('online'));
            });

            expect(mockSetOfflineStatus).toHaveBeenCalledWith(false);
        });

        it('should handle multiple online events', () => {
            renderHook(() => useOnlineStatus());

            act(() => {
                window.dispatchEvent(new Event('online'));
                window.dispatchEvent(new Event('online'));
            });

            expect(mockSetOfflineStatus).toHaveBeenCalledTimes(3); // Initial + 2 events
        });
    });

    describe('Offline event', () => {
        it('should update status when offline event fires', () => {
            renderHook(() => useOnlineStatus());

            act(() => {
                window.dispatchEvent(new Event('offline'));
            });

            expect(mockSetOfflineStatus).toHaveBeenCalledWith(true);
        });

        it('should handle multiple offline events', () => {
            renderHook(() => useOnlineStatus());

            act(() => {
                window.dispatchEvent(new Event('offline'));
                window.dispatchEvent(new Event('offline'));
            });

            expect(mockSetOfflineStatus).toHaveBeenCalledTimes(3); // Initial + 2 events
        });
    });

    describe('Event transitions', () => {
        it('should handle online -> offline -> online transitions', () => {
            renderHook(() => useOnlineStatus());

            act(() => {
                window.dispatchEvent(new Event('offline'));
            });

            expect(mockSetOfflineStatus).toHaveBeenCalledWith(true);

            act(() => {
                window.dispatchEvent(new Event('online'));
            });

            expect(mockSetOfflineStatus).toHaveBeenCalledWith(false);
        });
    });

    describe('Return value', () => {
        it('should return isOffline from store', () => {
            mockIsOffline = false;
            mockUseDashboardStore.mockImplementation(() => ({
                setOfflineStatus: mockSetOfflineStatus,
                isOffline: mockIsOffline,
            } as any));

            const { result } = renderHook(() => useOnlineStatus());

            expect(result.current.isOffline).toBe(false);
        });

        it('should return updated isOffline value', () => {
            mockIsOffline = true;
            mockUseDashboardStore.mockImplementation(() => ({
                setOfflineStatus: mockSetOfflineStatus,
                isOffline: mockIsOffline,
            } as any));

            const { result } = renderHook(() => useOnlineStatus());

            expect(result.current.isOffline).toBe(true);
        });
    });

    describe('Cleanup', () => {
        it('should remove event listeners on unmount', () => {
            const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
            const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

            const { unmount } = renderHook(() => useOnlineStatus());

            expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
            expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

            unmount();

            expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
            expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

            addEventListenerSpy.mockRestore();
            removeEventListenerSpy.mockRestore();
        });

        it('should not trigger events after unmount', () => {
            const { unmount } = renderHook(() => useOnlineStatus());

            unmount();

            const callCountBeforeEvent = mockSetOfflineStatus.mock.calls.length;

            act(() => {
                window.dispatchEvent(new Event('offline'));
            });

            expect(mockSetOfflineStatus).toHaveBeenCalledTimes(callCountBeforeEvent);
        });
    });
});
