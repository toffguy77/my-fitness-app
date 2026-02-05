/**
 * Unit tests for useNotificationPolling hook
 * Tests polling lifecycle management
 */

import { renderHook } from '@testing-library/react';
import { useNotificationPolling } from '../useNotificationPolling';
import { useNotificationsStore } from '../../store/notificationsStore';

// Mock the store
jest.mock('../../store/notificationsStore');

describe('useNotificationPolling', () => {
    let mockStartPolling: jest.Mock;
    let mockStopPolling: jest.Mock;

    beforeEach(() => {
        // Reset mocks
        mockStartPolling = jest.fn();
        mockStopPolling = jest.fn();

        // Mock the store
        (useNotificationsStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = {
                startPolling: mockStartPolling,
                stopPolling: mockStopPolling,
            };
            return selector(state);
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should start polling on mount when enabled', () => {
        renderHook(() => useNotificationPolling({ enabled: true }));

        expect(mockStartPolling).toHaveBeenCalledTimes(1);
    });

    it('should start polling by default (enabled is true by default)', () => {
        renderHook(() => useNotificationPolling());

        expect(mockStartPolling).toHaveBeenCalledTimes(1);
    });

    it('should not start polling when enabled is false', () => {
        renderHook(() => useNotificationPolling({ enabled: false }));

        expect(mockStartPolling).not.toHaveBeenCalled();
    });

    it('should stop polling on unmount', () => {
        const { unmount } = renderHook(() => useNotificationPolling({ enabled: true }));

        expect(mockStopPolling).not.toHaveBeenCalled();

        unmount();

        expect(mockStopPolling).toHaveBeenCalledTimes(1);
    });

    it('should stop polling when enabled changes to false', () => {
        const { rerender } = renderHook(
            ({ enabled }) => useNotificationPolling({ enabled }),
            { initialProps: { enabled: true } }
        );

        expect(mockStartPolling).toHaveBeenCalledTimes(1);
        expect(mockStopPolling).not.toHaveBeenCalled();

        // Change enabled to false
        rerender({ enabled: false });

        expect(mockStopPolling).toHaveBeenCalledTimes(1);
    });

    it('should start polling when enabled changes to true', () => {
        const { rerender } = renderHook(
            ({ enabled }) => useNotificationPolling({ enabled }),
            { initialProps: { enabled: false } }
        );

        expect(mockStartPolling).not.toHaveBeenCalled();

        // Change enabled to true
        rerender({ enabled: true });

        expect(mockStartPolling).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple enable/disable cycles', () => {
        const { rerender } = renderHook(
            ({ enabled }) => useNotificationPolling({ enabled }),
            { initialProps: { enabled: true } }
        );

        expect(mockStartPolling).toHaveBeenCalledTimes(1);

        // Disable - cleanup is called when effect re-runs
        rerender({ enabled: false });
        expect(mockStopPolling).toHaveBeenCalledTimes(1);

        // Enable again - cleanup is called again before new effect
        rerender({ enabled: true });
        expect(mockStartPolling).toHaveBeenCalledTimes(2);
        expect(mockStopPolling).toHaveBeenCalledTimes(2); // Called during cleanup before re-running effect

        // Disable again - cleanup is called again
        rerender({ enabled: false });
        expect(mockStopPolling).toHaveBeenCalledTimes(3); // Called during cleanup
    });

    it('should stop polling on unmount even when disabled', () => {
        const { unmount } = renderHook(() => useNotificationPolling({ enabled: false }));

        unmount();

        // Should still call stopPolling on cleanup
        expect(mockStopPolling).toHaveBeenCalledTimes(1);
    });
});
