/**
 * useOnlineStatus Hook Tests
 *
 * Tests for online/offline status detection and sync functionality.
 *
 * @module food-tracker/hooks/__tests__/useOnlineStatus
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useOnlineStatus } from '../useOnlineStatus';
import { useFoodTrackerStore } from '../../store/foodTrackerStore';

// ============================================================================
// Mocks
// ============================================================================

// Mock the store
jest.mock('../../store/foodTrackerStore', () => ({
    useFoodTrackerStore: jest.fn(),
}));

const mockUseFoodTrackerStore = useFoodTrackerStore as jest.MockedFunction<typeof useFoodTrackerStore>;

// ============================================================================
// Test Setup
// ============================================================================

describe('useOnlineStatus', () => {
    const mockSetOfflineStatus = jest.fn();
    const mockSyncWhenOnline = jest.fn().mockResolvedValue(undefined);

    beforeEach(() => {
        jest.clearAllMocks();

        // Default mock implementation
        mockUseFoodTrackerStore.mockImplementation((selector: any) => {
            const state = {
                isOffline: false,
                pendingOperations: [],
                setOfflineStatus: mockSetOfflineStatus,
                syncWhenOnline: mockSyncWhenOnline,
            };
            return selector(state);
        });

        // Mock navigator.onLine
        Object.defineProperty(navigator, 'onLine', {
            value: true,
            writable: true,
            configurable: true,
        });
    });

    afterEach(() => {
        // Reset navigator.onLine
        Object.defineProperty(navigator, 'onLine', {
            value: true,
            writable: true,
            configurable: true,
        });
    });

    // ============================================================================
    // Basic Functionality Tests
    // ============================================================================

    describe('Basic Functionality', () => {
        it('returns online status when browser is online', () => {
            const { result } = renderHook(() => useOnlineStatus());

            expect(result.current.isOnline).toBe(true);
            expect(result.current.isOffline).toBe(false);
        });

        it('returns offline status when store is offline', () => {
            mockUseFoodTrackerStore.mockImplementation((selector: any) => {
                const state = {
                    isOffline: true,
                    pendingOperations: [],
                    setOfflineStatus: mockSetOfflineStatus,
                    syncWhenOnline: mockSyncWhenOnline,
                };
                return selector(state);
            });

            const { result } = renderHook(() => useOnlineStatus());

            expect(result.current.isOffline).toBe(true);
        });

        it('returns pending operations count', () => {
            mockUseFoodTrackerStore.mockImplementation((selector: any) => {
                const state = {
                    isOffline: false,
                    pendingOperations: [
                        { type: 'add', data: {} },
                        { type: 'update', data: {} },
                    ],
                    setOfflineStatus: mockSetOfflineStatus,
                    syncWhenOnline: mockSyncWhenOnline,
                };
                return selector(state);
            });

            const { result } = renderHook(() => useOnlineStatus());

            expect(result.current.pendingOperationsCount).toBe(2);
        });
    });

    // ============================================================================
    // Event Listener Tests
    // ============================================================================

    describe('Event Listeners', () => {
        it('sets up online/offline event listeners on mount', () => {
            const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

            renderHook(() => useOnlineStatus());

            expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
            expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

            addEventListenerSpy.mockRestore();
        });

        it('removes event listeners on unmount', () => {
            const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

            const { unmount } = renderHook(() => useOnlineStatus());
            unmount();

            expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
            expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

            removeEventListenerSpy.mockRestore();
        });

        it('calls setOfflineStatus(false) when online event fires', () => {
            renderHook(() => useOnlineStatus());

            // Simulate online event
            act(() => {
                window.dispatchEvent(new Event('online'));
            });

            expect(mockSetOfflineStatus).toHaveBeenCalledWith(false);
        });

        it('calls setOfflineStatus(true) when offline event fires', () => {
            renderHook(() => useOnlineStatus());

            // Simulate offline event
            act(() => {
                window.dispatchEvent(new Event('offline'));
            });

            expect(mockSetOfflineStatus).toHaveBeenCalledWith(true);
        });
    });

    // ============================================================================
    // Sync Functionality Tests
    // ============================================================================

    describe('Sync Functionality', () => {
        it('syncNow calls syncWhenOnline when browser is online', async () => {
            const { result } = renderHook(() => useOnlineStatus());

            await act(async () => {
                await result.current.syncNow();
            });

            expect(mockSyncWhenOnline).toHaveBeenCalled();
        });

        it('syncNow does not call syncWhenOnline when browser is offline', async () => {
            Object.defineProperty(navigator, 'onLine', {
                value: false,
                writable: true,
                configurable: true,
            });

            const { result } = renderHook(() => useOnlineStatus());

            await act(async () => {
                await result.current.syncNow();
            });

            expect(mockSyncWhenOnline).not.toHaveBeenCalled();
        });
    });

    // ============================================================================
    // Initial Status Tests
    // ============================================================================

    describe('Initial Status', () => {
        it('checks initial online status on mount', () => {
            renderHook(() => useOnlineStatus());

            // Should set offline status based on navigator.onLine
            expect(mockSetOfflineStatus).toHaveBeenCalledWith(false);
        });

        it('sets offline status when browser starts offline', () => {
            Object.defineProperty(navigator, 'onLine', {
                value: false,
                writable: true,
                configurable: true,
            });

            renderHook(() => useOnlineStatus());

            expect(mockSetOfflineStatus).toHaveBeenCalledWith(true);
        });
    });
});
